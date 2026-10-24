'use strict';
/* =========================================================
 * 時序之戰 — 音效與音樂
 * 全部以 Web Audio 即時合成，不需要任何音檔。
 *   Sound.play(name, opts)   播放音效
 *   Sound.ult(key, k)        終結技配樂（k = 動畫時間倍率）
 *   Sound.gacha(T, results)  抽卡演出配樂，回傳 { stop() }
 *   Sound.music(name)        切換背景音樂（menu / battle / gacha / null），自動交叉淡入淡出
 *   Sound.pref / Sound.set(k, v)  音量設定（存在這個瀏覽器）
 * 瀏覽器規定要等玩家第一次點擊或按鍵後才能發出聲音，在那之前的呼叫會被略過（音樂會記住，解鎖後開始）。
 * ========================================================= */

const Sound = (() => {
  const PREF_KEY = 'shixu_audio';
  const pref = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* 無法讀取就用預設值 */ }

  let ctx = null, master, musicBus, duckNode, sfxBus, musicVerb, sfxVerb, noiseBuf;
  let wantTrack = null;
  const last = {};   // 同名音效的節流

  /* ================= 基礎建設 ================= */
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }
  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); duckNode = ctx.createGain(); musicBus.connect(duckNode); duckNode.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicVerb = ctx.createConvolver(); musicVerb.buffer = impulse(3.2, 2.6); musicVerb.connect(musicBus);
    sfxVerb = ctx.createConvolver(); sfxVerb.buffer = impulse(1.8, 2.4); sfxVerb.connect(sfxBus);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyVol(true);
    setInterval(tick, 50);
    return ctx;
  }
  function applyVol(now) {
    if (!ctx) return;
    const t = ctx.currentTime, r = now ? 0.001 : 0.08;
    master.gain.setTargetAtTime(pref.muted ? 0 : pref.master, t, r);
    musicBus.gain.setTargetAtTime(pref.music * 0.55, t, r);
    sfxBus.gain.setTargetAtTime(pref.sfx, t, r);
  }
  function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch (e) { /* 忽略 */ } }
  const ready = () => ctx && ctx.state === 'running' && !pref.muted;

  function unlock() {
    if (!init()) return;
    if (ctx.state !== 'running') ctx.resume().then(() => { if (wantTrack && !players.length) startTrack(wantTrack); });
    else if (wantTrack && !players.length) startTrack(wantTrack);
  }
  ['pointerdown', 'keydown'].forEach(e => document.addEventListener(e, unlock, true));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (!pref.muted) ctx.resume();
  });

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);

  /**
   * 通用聲部：src 為振盪器或噪音來源，套上濾波器與音量包絡後送往 dest。
   * o: a 起音、hold 維持、filter/f/f2/q 濾波、pan 聲像、verb 殘響送出量、dest 輸出
   */
  function voice(src, t, dur, vol, o) {
    let node = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.Q.value = o.q || 0.8;
      f.frequency.setValueAtTime(o.f || 1000, t);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.fdur || dur));
      node.connect(f); node = f;
    }
    const g = ctx.createGain(), a = o.a != null ? o.a : 0.004, v = Math.max(1e-4, vol);
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    if (o.hold) g.gain.setValueAtTime(v, t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    node.connect(g);
    let out = g;
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
    const dest = o.dest || sfxBus;
    out.connect(dest);
    if (o.verb) {
      const s = ctx.createGain(); s.gain.value = o.verb;
      out.connect(s); s.connect(dest === sfxBus || dest._sfx ? sfxVerb : musicVerb);
    }
    src.start(t); src.stop(t + dur + 0.05);
    return g;
  }
  function tone(f, t, dur, vol, o) {
    o = o || {};
    const s = ctx.createOscillator();
    s.type = o.type || 'sine';
    s.frequency.setValueAtTime(f, t);
    if (o.f2t) s.frequency.exponentialRampToValueAtTime(o.f2t, t + (o.gdur || dur));
    if (o.detune) s.detune.value = o.detune;
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(s.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    return voice(s, t, dur, vol, o);
  }
  function noise(t, dur, vol, o) {
    o = o || {};
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    s.playbackRate.value = o.rate || 1;
    const src = { connect: n => s.connect(n), start: tt => s.start(tt, Math.random() * 1.5), stop: tt => s.stop(tt) };
    return voice(src, t, dur, vol, Object.assign({ filter: 'bandpass', f: 1200 }, o));
  }
  /** FM 鐘聲（冰晶、提示音、閃光） */
  function bell(f, t, dur, vol, o) {
    o = o || {};
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain();
    c.frequency.value = f; m.frequency.value = f * (o.ratio || 3.5);
    mg.gain.setValueAtTime(f * (o.index || 2.2), t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.6);
    m.connect(mg); mg.connect(c.frequency);
    m.start(t); m.stop(t + dur + 0.05);
    return voice(c, t, dur, vol, o);
  }
  function kick(t, vol, dest, o) {
    o = o || {};
    tone(o.f || 150, t, o.dur || 0.34, vol, { f2t: o.f2 || 42, gdur: 0.11, dest, a: 0.002 });
    noise(t, 0.02, vol * 0.25, { filter: 'highpass', f: 3000, dest });
  }
  function snare(t, vol, dest, o) {
    o = o || {};
    noise(t, o.dur || 0.17, vol, { filter: 'bandpass', f: o.f || 1900, q: 0.6, dest, verb: o.verb || 0.08 });
    tone(190, t, 0.09, vol * 0.5, { type: 'triangle', f2t: 140, dest });
  }
  function hat(t, vol, dest, open) {
    noise(t, open ? 0.22 : 0.045, vol, { filter: 'highpass', f: 7500, dest });
  }
  /** 揮擊的破風聲（帶通噪音掃頻） */
  function swish(t, vol, f1, f2, dur, pan) {
    noise(t, dur, vol, { filter: 'bandpass', f: f1, f2, q: 1.6, a: dur * 0.3, pan });
  }
  /** 爆炸：低頻衝擊 + 低通噪音 + 劈啪 */
  function boom(t, vol, o) {
    o = o || {};
    tone(o.f || 95, t, o.dur || 0.6, vol, { f2t: 32, gdur: 0.4, a: 0.003 });
    noise(t, (o.dur || 0.6) * 1.3, vol * 0.9, { filter: 'lowpass', f: o.nf || 1400, f2: 180, a: 0.004, verb: 0.35 });
    for (let i = 0; i < (o.crackle || 8); i++) noise(t + 0.05 + Math.random() * 0.5, 0.02, vol * 0.25 * Math.random(), { filter: 'highpass', f: 2500, pan: rnd(-0.6, 0.6) });
  }
  /** 玻璃碎裂 */
  function shatter(t, vol, o) {
    o = o || {};
    noise(t, 0.5, vol * 0.7, { filter: 'highpass', f: 2600, a: 0.002, verb: 0.3 });
    for (let i = 0; i < (o.n || 16); i++) {
      bell(rnd(o.lo || 2200, o.hi || 6500), t + Math.random() * 0.28, rnd(0.08, 0.3), vol * rnd(0.08, 0.2), { ratio: rnd(1.4, 4.2), index: 1.2, pan: rnd(-0.8, 0.8), verb: 0.25 });
    }
  }
  function chord(ms, t, dur, vol, o) { ms.forEach((m, i) => tone(mtof(m), t, dur, vol, Object.assign({ detune: (i % 2 ? 6 : -6) }, o))); }

  /* ================= 音效庫 ================= */
  const SFX = {
    click: t => { tone(1650, t, 0.05, 0.06, { type: 'triangle' }); tone(2400, t + 0.012, 0.04, 0.03); },
    tab: t => { tone(880, t, 0.08, 0.05, { type: 'triangle' }); tone(1320, t + 0.04, 0.1, 0.04, { verb: 0.2 }); },
    open: t => { noise(t, 0.2, 0.08, { f: 600, f2: 2600, q: 1.2, a: 0.1 }); tone(660, t + 0.06, 0.18, 0.04, { verb: 0.3 }); },
    close: t => { noise(t, 0.16, 0.06, { f: 2400, f2: 600, q: 1.2, a: 0.05 }); },
    confirm: t => { bell(1047, t, 0.35, 0.08, { verb: 0.3 }); bell(1568, t + 0.07, 0.45, 0.07, { verb: 0.3 }); },
    error: t => { tone(180, t, 0.18, 0.1, { type: 'square', filter: 'lowpass', f: 900 }); tone(150, t + 0.1, 0.2, 0.1, { type: 'square', filter: 'lowpass', f: 900 }); },
    turn: t => { tone(988, t, 0.14, 0.04, { verb: 0.25 }); tone(1480, t + 0.05, 0.16, 0.025, { verb: 0.25 }); },
    turnEnemy: t => { tone(220, t, 0.25, 0.07, { type: 'triangle', f2t: 196 }); noise(t, 0.15, 0.03, { f: 500 }); },

    // 各角色出手
    atk_kane: t => { swish(t, 0.3, 4200, 900, 0.16, -0.2); swish(t + 0.07, 0.26, 3600, 700, 0.16, 0.2); tone(3200, t + 0.08, 0.3, 0.03, { type: 'triangle', verb: 0.2 }); },
    atk_longzhao: t => {
      [0, 0.045, 0.09].forEach((d, i) => swish(t + d, 0.26, 5000, 1100, 0.14, (i - 1) * 0.3));
      tone(1250, t + 0.02, 0.22, 0.05, { type: 'square', filter: 'bandpass', f: 2400, q: 6 });
      noise(t, 0.12, 0.08, { filter: 'lowpass', f: 500 });
    },
    atk_mocha: t => { [0, 0.055, 0.11].forEach(d => { bell(rnd(2400, 3400), t + d, 0.25, 0.07, { ratio: 2.76, verb: 0.35 }); swish(t + d, 0.08, 6000, 2500, 0.1); }); },
    atk_alan: t => {
      noise(t, 0.07, 0.7, { filter: 'highpass', f: 900, a: 0.001 });
      tone(120, t, 0.3, 0.55, { f2t: 38, gdur: 0.2, a: 0.001 });
      noise(t + 0.01, 0.7, 0.22, { filter: 'lowpass', f: 1600, f2: 200, verb: 0.5 });
      tone(3000, t + 0.03, 0.12, 0.03, { f2t: 900, type: 'sawtooth', filter: 'lowpass', f: 4000 });
    },
    // 亞歷山卓：兩聲警笛短鳴 + 風切
    atk_alexandra: t => {
      tone(900, t, 0.12, 0.05, { type: 'square', f2t: 1500, filter: 'lowpass', f: 2600 });
      tone(1500, t + 0.11, 0.12, 0.05, { type: 'square', f2t: 900, filter: 'lowpass', f: 2600 });
      swish(t + 0.04, 0.32, 1800, 6500, 0.28, -0.3); swish(t + 0.1, 0.24, 6500, 900, 0.22, 0.3);
    },
    // 寒夜：清脆的玻璃音 + 一道筆直的切割
    atk_hanye: t => {
      bell(2093, t, 0.4, 0.06, { ratio: 1.0, index: 0.6, verb: 0.45 });
      bell(3136, t + 0.03, 0.3, 0.04, { ratio: 1.5, index: 0.5, verb: 0.45 });
      noise(t + 0.02, 0.14, 0.22, { filter: 'highpass', f: 5500, f2: 2500, a: 0.002 });
      tone(5200, t + 0.02, 0.08, 0.02, { f2t: 1800 });
    },
    // 戈登：收銀機與硬幣
    atk_gordon: t => {
      noise(t, 0.04, 0.2, { filter: 'highpass', f: 3000 });
      tone(1100, t + 0.01, 0.05, 0.08, { type: 'square', filter: 'bandpass', f: 1800, q: 3 });
      bell(2637, t + 0.06, 0.5, 0.07, { ratio: 2.01, index: 1.4, verb: 0.3 });
      bell(3951, t + 0.1, 0.45, 0.05, { ratio: 2.01, index: 1.2, verb: 0.3 });
      for (let i = 0; i < 4; i++) bell(rnd(4200, 5600), t + 0.14 + i * 0.035, 0.12, 0.025, { ratio: 1.7, pan: rnd(-0.5, 0.5) });
    },
    // 馬克：水花 + 翻開筆記本
    atk_mark: t => {
      noise(t, 0.25, 0.22, { filter: 'lowpass', f: 1600, f2: 400, a: 0.01 });
      for (let i = 0; i < 4; i++) bell(rnd(1400, 2200), t + 0.04 + i * 0.03, 0.18, 0.03, { ratio: 1.0, index: 0.6, pan: rnd(-0.5, 0.5) });
      noise(t + 0.02, 0.12, 0.08, { f: 2600, f2: 1200, q: 0.8, a: 0.02 });
    },
    // 亞歷山卓秘技：引擎轟鳴 → 甩尾的輪胎尖嘯 → 警笛一聲
    drift: t => {
      tone(70, t, 1.0, 0.16, { type: 'sawtooth', f2t: 160, gdur: 0.7, filter: 'lowpass', f: 700, a: 0.05 });
      noise(t, 0.9, 0.08, { f: 400, f2: 2200, q: 0.8, a: 0.2 });
      tone(2300, t + 0.25, 0.6, 0.045, { f2t: 1500, type: 'triangle' });
      noise(t + 0.25, 0.65, 0.14, { f: 3200, f2: 2400, q: 5, a: 0.05 });
      tone(800, t + 0.15, 0.32, 0.04, { type: 'square', f2t: 1450, gdur: 0.3, filter: 'lowpass', f: 2600 });
      swish(t + 0.45, 0.4, 900, 6500, 0.4, 0);
    },
    // 首領轉階段：警報 → 雷擊 → 低頻衝擊
    phase: t => {
      [0, 0.18].forEach(d => tone(880, t + d, 0.16, 0.06, { type: 'square', f2t: 440, gdur: 0.15, filter: 'lowpass', f: 2600 }));
      noise(t + 0.12, 0.3, 0.4, { filter: 'highpass', f: 2500, f2: 800, a: 0.002 });
      boom(t + 0.15, 0.8, { f: 55, nf: 2400, dur: 1.0, crackle: 20 });
      tone(41, t + 0.15, 1.0, 0.3, { a: 0.01 });
    },
    // O.T.G.：鎖鏈甩動的嘩啦聲 → 沉重的肉擊 → 撕裂
    atk_otg: t => {
      for (let i = 0; i < 6; i++) bell(rnd(2400, 3600), t + i * 0.025, 0.08, 0.025, { ratio: 1.41, index: 2, pan: rnd(-0.4, 0.4) });   // 鏈環
      swish(t, 0.3, 700, 3200, 0.16, -0.2);
      kick(t + 0.11, 0.7, sfxBus, { f: 85, f2: 32, dur: 0.3 });
      noise(t + 0.12, 0.22, 0.3, { filter: 'lowpass', f: 1400, f2: 300, a: 0.003 });
      noise(t + 0.16, 0.16, 0.12, { f: 2600, f2: 900, q: 1.5, a: 0.005 });   // 撕裂
    },
    // 生死角力：鎖鏈收緊 + 低沉的心跳
    duel: t => {
      for (let i = 0; i < 10; i++) bell(rnd(2200, 3400), t + i * 0.03, 0.1, 0.03, { ratio: 1.41, index: 2, pan: rnd(-0.5, 0.5) });
      tone(55, t + 0.3, 0.5, 0.25, { f2t: 35, a: 0.01 });
      kick(t + 0.3, 0.5, sfxBus, { f: 60, f2: 30, dur: 0.3 }); kick(t + 0.55, 0.35, sfxBus, { f: 55, f2: 28, dur: 0.25 });
    },
    // 米勒：黑傘甩開的風聲 + 低沉的喪鐘餘韻
    atk_miller: t => {
      swish(t, 0.26, 600, 2600, 0.3, -0.2);
      bell(mtof(57), t + 0.12, 1.1, 0.05, { ratio: 1.41, index: 1.1, verb: 0.7 });
      bell(mtof(69), t + 0.13, 0.8, 0.025, { ratio: 2.76, index: 0.6, verb: 0.7 });
      noise(t + 0.1, 0.4, 0.05, { filter: 'highpass', f: 5000, a: 0.05, verb: 0.5 });   // 雨絲
    },
    // 榜樣：翻頁 + 清亮的提示音
    model: t => { noise(t, 0.18, 0.1, { f: 2600, f2: 1200, q: 0.8, a: 0.03 }); bell(mtof(84), t + 0.1, 0.6, 0.06, { ratio: 2, verb: 0.5 }); bell(mtof(91), t + 0.18, 0.7, 0.05, { ratio: 2, verb: 0.5 }); },
    // 護航專車：警笛鳴響
    escort: t => {
      [0, 0.32].forEach(d => { tone(700, t + d, 0.3, 0.06, { type: 'square', f2t: 1400, gdur: 0.28, filter: 'lowpass', f: 2400 }); });
      noise(t, 0.6, 0.08, { f: 300, f2: 2400, q: 1, a: 0.3 });
    },
    // 股市跳動：上漲（上行的報價聲）／下跌（下行）
    // 寒夜戰技：黎曼和（段數越多，音階越密、越往上）
    riemann: (t, o) => {
      const n = Math.min(24, o.n || 6), high = (o.n || 0) >= 12;
      for (let i = 0; i < n; i++) tone(mtof(64 + Math.round(i * (high ? 24 : 12) / n)), t + i * (high ? 0.025 : 0.05), 0.08, 0.035, { type: 'triangle' });
      if (high) { bell(mtof(88), t + 0.65, 1.2, 0.07, { ratio: 1, index: 0.5, verb: 0.7 }); chord([64, 71, 76, 83], t + 0.65, 1.0, 0.03, { type: 'triangle', verb: 0.6 }); }
    },
    // 兌現匣兌現：硬幣落入 → 爆開
    cashout: t => {
      for (let i = 0; i < 8; i++) bell(rnd(3000, 4800), t + i * 0.03, 0.15, 0.04, { ratio: 1.7, pan: rnd(-0.6, 0.6) });
      boom(t + 0.25, 0.45, { f: 80, nf: 1600, dur: 0.6, crackle: 6 });
      chord([60, 67, 72], t + 0.28, 0.7, 0.05, { type: 'sawtooth', filter: 'lowpass', f: 2600, f2: 700, verb: 0.4 });
    },
    // 兌現匣上膛：金屬「喀－嚓」兩段，尾音依屬性略有不同
    chamber: (t, o) => {
      const e = o.e || 'phys';
      noise(t, 0.022, 0.32, { filter: 'highpass', f: 3200, a: 0.0005 });
      tone(e === 'phys' ? 210 : 260, t, 0.05, 0.16, { type: 'square', f2t: 90, filter: 'lowpass', f: 1800, a: 0.001 });
      noise(t + 0.055, 0.03, 0.26, { f: 2400, q: 2, a: 0.0005 });
      tone(170, t + 0.055, 0.06, 0.12, { type: 'triangle', f2t: 70, a: 0.001 });
      const u = t + 0.07;
      if (e === 'fire') noise(u, 0.18, 0.08, { filter: 'highpass', f: 2500, rate: 0.7 });
      else if (e === 'water') tone(700, u, 0.12, 0.05, { f2t: 1500, gdur: 0.08 });
      else if (e === 'wind') noise(u, 0.2, 0.07, { f: 900, f2: 3200, q: 1 });
      else if (e === 'thunder') tone(1400, u, 0.07, 0.035, { type: 'sawtooth', f2t: 300, filter: 'lowpass', f: 4000 });
      else if (e === 'ice') bell(rnd(3200, 3800), u, 0.22, 0.04, { ratio: 2.4, verb: 0.3 });
      else if (e === 'grass') tone(420, u, 0.09, 0.06, { type: 'triangle', f2t: 520 });
      else bell(1250, u, 0.14, 0.03, { ratio: 1.4 });
    },
    // 莫卡兄弟遞出契約：紙張滑過 → 蓋章
    contract: t => { noise(t, 0.22, 0.08, { f: 2600, f2: 1200, q: 0.8, a: 0.03 }); tone(150, t + 0.62, 0.12, 0.2, { f2t: 70, a: 0.002 }); noise(t + 0.62, 0.06, 0.12, { filter: 'lowpass', f: 900 }); bell(mtof(86), t + 0.7, 0.4, 0.03, { ratio: 2.4, verb: 0.4 }); },
    // 代理執行-弟：一疊單據撒出 → 清脆的入帳聲
    budget: t => { for (let i = 0; i < 5; i++) noise(t + i * 0.05, 0.1, 0.05, { f: 3000, f2: 1500, q: 1, a: 0.01 }); [79, 83, 86].forEach((m, i) => bell(mtof(m), t + 0.6 + i * 0.06, 0.5, 0.035, { ratio: 2, verb: 0.4 })); },
    // 阿蘭展開護盾：信號彈點火 → 護盾嗡鳴
    barrier: t => { noise(t, 0.3, 0.1, { f: 900, f2: 3200, q: 1, a: 0.01 }); tone(220, t + 0.12, 0.7, 0.06, { type: 'triangle', f2t: 440, a: 0.08 }); tone(330, t + 0.18, 0.6, 0.04, { type: 'sine', vib: [7, 6] }); },
    mkUp: t => { [0, 0.05, 0.1].forEach((d, i) => tone(mtof(76 + i * 4), t + d, 0.1, 0.05, { type: 'square', filter: 'lowpass', f: 3000 })); bell(mtof(88), t + 0.16, 0.4, 0.05, { ratio: 2, verb: 0.3 }); },
    mkDown: t => { [0, 0.05, 0.1].forEach((d, i) => tone(mtof(72 - i * 4), t + d, 0.12, 0.05, { type: 'square', filter: 'lowpass', f: 2200 })); tone(140, t + 0.14, 0.3, 0.15, { f2t: 60 }); },
    atk_enemy: t => { swish(t, 0.22, 1800, 500, 0.2); noise(t, 0.08, 0.05, { filter: 'lowpass', f: 400 }); },

    // 收網：證物定位、繃緊的弦、低頻與斷弦同時落下。
    netPin: t => { [0,.045,.09].forEach(d => { noise(t+d,.022,.1,{filter:'highpass',f:4200}); tone(1800,t+d,.035,.035,{type:'square',filter:'bandpass',f:2300}); }); },
    netPull: t => { tone(260,t,.27,.08,{type:'triangle',f2t:1450,a:.02}); noise(t,.25,.1,{f:650,f2:4200,q:4,a:.2}); },
    netSnap: t => { kick(t,.72,sfxBus,{f:135,f2:32,dur:.22}); noise(t,.045,.32,{filter:'highpass',f:3000,a:.001}); tone(1500,t,.09,.06,{type:'triangle',f2t:220}); },
    // 命中
    hit: (t, o) => {
      const e = o.elem || 'phys';
      if (e === 'ice') {
        [0, 0.03, 0.07].forEach(d => bell(rnd(2600, 4200), t + d, 0.35, 0.07, { ratio: 2.4, pan: rnd(-0.4, 0.4), verb: 0.3 }));
        noise(t, 0.2, 0.18, { filter: 'highpass', f: 3500 });
        tone(160, t, 0.15, 0.25, { f2t: 70 });
      } else if (e === 'fire') {
        boom(t, 0.4, { dur: 0.45, crackle: 6 });
      } else if (e === 'wind') {
        noise(t, 0.25, 0.3, { f: 600, f2: 3800, q: 1.2, a: 0.01 });
        tone(140, t, 0.16, 0.35, { f2t: 60, gdur: 0.1, a: 0.002 });
      } else if (e === 'space') {
        bell(rnd(1700, 2300), t, 0.3, 0.06, { ratio: 1.0, index: 0.8, verb: 0.35, pan: rnd(-0.4, 0.4) });
        noise(t, 0.08, 0.2, { filter: 'highpass', f: 4500, a: 0.001 });
        tone(110, t, 0.14, 0.3, { f2t: 50, a: 0.002 });
      } else if (e === 'luck') {   // 運：金幣
        tone(180, t, 0.16, 0.3, { f2t: 70, a: 0.002 });
        bell(rnd(2400, 3000), t + 0.01, 0.35, 0.06, { ratio: 2.01, index: 1.4, verb: 0.3 });
        bell(rnd(3600, 4400), t + 0.05, 0.25, 0.04, { ratio: 2.01, verb: 0.3 });
      } else if (e === 'water') {
        noise(t, 0.3, 0.3, { filter: 'lowpass', f: 1400, f2: 300, a: 0.01 }); tone(220, t, 0.2, 0.25, { f2t: 90, a: 0.003 });
      } else if (e === 'thunder') {
        noise(t, 0.12, 0.45, { filter: 'highpass', f: 2000, a: 0.001 }); tone(90, t, 0.3, 0.35, { type: 'sawtooth', f2t: 40, filter: 'lowpass', f: 800 });
      } else if (e === 'grass') {
        noise(t, 0.2, 0.2, { f: 2500, q: 2, a: 0.01 }); tone(160, t, 0.16, 0.3, { f2t: 70, a: 0.002 });
      } else if (e === 'imag') {
        tone(220, t, 0.25, 0.3, { type: 'triangle', f2t: 70, a: 0.002 });
        bell(rnd(1300, 1700), t + 0.01, 0.3, 0.05, { ratio: 1.41, index: 2.5, verb: 0.35 });
      } else {
        tone(130, t, 0.18, 0.5, { f2t: 50, gdur: 0.12, a: 0.002 });
        noise(t, 0.09, 0.32, { f: 2400, q: 0.7, a: 0.001 });
        noise(t, 0.2, 0.12, { filter: 'lowpass', f: 700 });
      }
      if (o.crit) {
        tone(2350, t + 0.02, 0.45, 0.06, { type: 'triangle', verb: 0.4 });
        tone(3520, t + 0.03, 0.35, 0.04, { verb: 0.4 });
        noise(t, 0.05, 0.25, { filter: 'highpass', f: 5000 });
      }
    },
    hurt: t => { tone(100, t, 0.25, 0.4, { f2t: 55, a: 0.002 }); noise(t, 0.14, 0.18, { filter: 'lowpass', f: 1100 }); },
    absorb: t => { bell(740, t, 0.3, 0.07, { ratio: 1.5, verb: 0.3 }); noise(t, 0.12, 0.06, { filter: 'highpass', f: 3000 }); },
    // 持續傷害：依種類各有音色（裂傷鋒利、血破濕潤噴濺、原罪沉重、悲悼是遠處的鐘）
    dot: (t, o) => {
      const k = o.type;
      if (k === 'lacer') { noise(t, 0.09, 0.14, { filter: 'highpass', f: 5200, a: 0.001 }); tone(2600, t, 0.12, 0.025, { type: 'triangle', f2t: 3400 }); tone(150, t + 0.02, 0.12, 0.08, { f2t: 70 }); }
      else if (k === 'bloodBreak') { noise(t, 0.28, 0.24, { f: 900, f2: 300, q: 2, a: 0.002 }); for (let i = 0; i < 5; i++) noise(t + 0.06 + i * 0.03, 0.05, 0.07, { filter: 'lowpass', f: 700, rate: 0.6 }); tone(110, t, 0.25, 0.16, { f2t: 50 }); }
      else if (k === 'original') { noise(t, 0.12, 0.12, { filter: 'highpass', f: 3000, a: 0.001 }); tone(98, t, 0.5, 0.16, { type: 'sawtooth', f2t: 46, filter: 'lowpass', f: 600 }); bell(mtof(50), t + 0.04, 0.8, 0.03, { ratio: 1.41, verb: 0.5 }); }
      else if (k === 'mourn') { bell(mtof(62), t, 1.0, 0.03, { ratio: 2.76, index: 0.6, verb: 0.7 }); noise(t, 0.3, 0.04, { filter: 'highpass', f: 4000 }); }
      else if (k === 'fire') { noise(t, 0.3, 0.12, { filter: 'highpass', f: 2200, rate: 0.7 }); tone(160, t, 0.2, 0.08, { f2t: 90 }); }
      else if (k === 'thunder') { tone(1300, t, 0.1, 0.04, { type: 'sawtooth', f2t: 260, filter: 'lowpass', f: 3800 }); noise(t, 0.12, 0.1, { f: 3000, q: 1.5 }); }
      else { noise(t, 0.26, 0.2, { f: 800, f2: 260, q: 4 }); tone(170, t, 0.22, 0.15, { f2t: 80, type: 'triangle' }); }
    },
    break: t => { tone(80, t, 0.5, 0.5, { f2t: 35, a: 0.002 }); shatter(t + 0.02, 0.5, { n: 20 }); },
    kill: t => { tone(220, t, 0.7, 0.2, { type: 'sawtooth', f2t: 40, filter: 'lowpass', f: 900 }); noise(t, 0.6, 0.16, { filter: 'lowpass', f: 900, f2: 120, verb: 0.3 }); },
    heal: t => { [72, 76, 79, 84].forEach((m, i) => bell(mtof(m), t + i * 0.06, 0.6, 0.06, { ratio: 2, index: 0.8, verb: 0.55 })); },
    healSoft: t => { bell(mtof(79), t, 0.35, 0.018, { ratio: 2, index: 0.6, verb: 0.4 }); },
    shield: t => { tone(420, t, 0.4, 0.07, { type: 'triangle', f2t: 950, a: 0.08 }); bell(1400, t + 0.2, 0.5, 0.05, { ratio: 1.5, verb: 0.5 }); noise(t, 0.35, 0.05, { f: 1500, f2: 5000, q: 2, a: 0.2 }); },
    buff: t => { bell(1320, t, 0.3, 0.035, { ratio: 2, index: 0.8, verb: 0.35 }); },
    stun: t => { [0, 0.06, 0.13].forEach(d => tone(rnd(900, 1400), t + d, 0.12, 0.06, { type: 'square', filter: 'bandpass', f: 2600, q: 5 })); noise(t, 0.2, 0.08, { f: 3000, q: 3 }); },
    resist: t => { bell(988, t, 0.5, 0.08, { ratio: 1.41, verb: 0.4 }); },
    ultReady: t => { bell(1568, t, 0.6, 0.07, { ratio: 2, verb: 0.5 }); bell(2093, t + 0.08, 0.7, 0.06, { ratio: 2, verb: 0.5 }); },
    ultArm: t => { noise(t, 0.5, 0.12, { f: 300, f2: 3200, q: 2.5, a: 0.35 }); tone(180, t, 0.5, 0.08, { type: 'sawtooth', f2t: 720, filter: 'lowpass', f: 1500, a: 0.3 }); },
    wave: t => { chord([45, 52, 57], t, 1.4, 0.08, { type: 'sawtooth', filter: 'lowpass', f: 400, f2: 1400, fdur: 0.6, a: 0.25, verb: 0.4 }); kick(t, 0.4, sfxBus, { f: 90, dur: 0.8 }); },
    win: t => {
      const seq = [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36]];
      seq.forEach(([m, d]) => tone(mtof(m), t + d, 0.3, 0.1, { type: 'sawtooth', filter: 'lowpass', f: 2200, verb: 0.3 }));
      chord([60, 64, 67, 72, 76], t + 0.5, 1.8, 0.07, { type: 'sawtooth', filter: 'lowpass', f: 2600, f2: 900, a: 0.02, verb: 0.5 });
      [84, 88, 91].forEach((m, i) => bell(mtof(m), t + 0.5 + i * 0.08, 1.2, 0.05, { ratio: 2, verb: 0.6 }));
      kick(t + 0.5, 0.4, sfxBus);
    },
    lose: t => { [[64, 0], [62, 0.35], [60, 0.7], [59, 1.05]].forEach(([m, d]) => tone(mtof(m - 12), t + d, 0.9, 0.09, { type: 'triangle', verb: 0.5, a: 0.05 })); chord([45, 48, 52], t + 1.1, 2, 0.05, { type: 'sawtooth', filter: 'lowpass', f: 500, a: 0.3, verb: 0.5 }); },

    // 養成與抽卡
    upgrade: t => { [0, 0.07, 0.14].forEach((d, i) => bell(mtof(79 + i * 4), t + d, 0.4, 0.06, { ratio: 2, verb: 0.35 })); noise(t, 0.2, 0.05, { f: 2000, f2: 6000, q: 2 }); },
    upgradeBig: t => { [0, 0.06, 0.12, 0.18, 0.26].forEach((d, i) => bell(mtof(76 + [0, 4, 7, 12, 16][i]), t + d, 0.8, 0.07, { ratio: 2, verb: 0.5 })); kick(t + 0.26, 0.25, sfxBus, { f: 120 }); },
    salvage: t => { noise(t, 0.25, 0.25, { filter: 'lowpass', f: 1800, f2: 300 }); tone(160, t, 0.3, 0.25, { f2t: 60 }); for (let i = 0; i < 5; i++) bell(rnd(1500, 3000), t + 0.1 + i * 0.04, 0.15, 0.03); },
    equip: t => { noise(t, 0.03, 0.2, { filter: 'highpass', f: 2500 }); tone(440, t + 0.02, 0.15, 0.08, { type: 'triangle', f2t: 880 }); bell(1760, t + 0.08, 0.3, 0.04, { verb: 0.3 }); },
    pull: t => { noise(t, 0.6, 0.12, { f: 400, f2: 4000, q: 1.5, a: 0.4 }); bell(1175, t + 0.4, 0.8, 0.06, { verb: 0.6 }); },
    stamina: t => { [0, 0.05, 0.1].forEach((d, i) => bell(mtof(84 + i * 3), t + d, 0.4, 0.04, { verb: 0.4 })); },
  };

  function play(name, o) {
    if (!ready() || !SFX[name]) return;
    o = o || {};
    const now = performance.now();
    if (last[name] && now - last[name] < (o.gap != null ? o.gap : 35)) return;
    last[name] = now;
    SFX[name](ctx.currentTime + 0.01 + (o.delay || 0), o);
  }

  /* ================= 終結技配樂（與 UltFx 的時間軸對齊，k = 時間倍率） ================= */
  const ULT = {
    // 凱恩「結案」：心跳般的低音 → 證據板的拍照快門與紅線 → 放大鏡鎖定 → 蓋章 → 玻璃碎裂與十字斬
    kane(t, k) {
      chord([40, 47, 52], t, 2.9 * k, 0.05, { type: 'sawtooth', filter: 'lowpass', f: 300, f2: 1400, fdur: 2.2 * k, a: 0.5 * k, verb: 0.4 });
      [0.05, 0.45].forEach(d => kick(t + d * k, 0.35, sfxBus, { f: 70, f2: 35, dur: 0.4 }));
      bell(mtof(88), t + 0.2 * k, 1.2, 0.05, { ratio: 1.41, verb: 0.6 });
      [0.65, 0.78, 0.9, 1.02, 1.14].forEach(d => { noise(t + d * k, 0.04, 0.2, { filter: 'highpass', f: 4000 }); tone(1200, t + d * k, 0.05, 0.05, { type: 'square', filter: 'bandpass', f: 2000 }); });
      [0.8, 1.0, 1.2].forEach(d => noise(t + d * k, 0.25, 0.06, { f: 900, f2: 2400, q: 6, a: 0.1 }));
      tone(600, t + 1.3 * k, 0.35 * k, 0.06, { f2t: 1800, type: 'triangle', verb: 0.3 });
      bell(2637, t + 1.62 * k, 0.4, 0.07, { ratio: 1.5 });
      // 蓋章
      kick(t + 1.75 * k, 0.8, sfxBus, { f: 110, f2: 30, dur: 0.5 });
      noise(t + 1.75 * k, 0.25, 0.4, { filter: 'lowpass', f: 1200, f2: 200, verb: 0.4 });
      // 碎裂與十字斬
      shatter(t + 2.0 * k, 0.55, { n: 24 });
      swish(t + 2.15 * k, 0.5, 6000, 500, 0.28, -0.4); swish(t + 2.25 * k, 0.5, 6000, 500, 0.28, 0.4);
      boom(t + 2.35 * k, 0.5, { f: 70, nf: 900, dur: 0.9, crackle: 4 });
    },
    // 龍爪：賭場輪盤 → 發牌 → 三道巨大爪痕 → 血花
    longzhao(t, k) {
      chord([38, 45, 50, 53], t, 2.8 * k, 0.045, { type: 'sawtooth', filter: 'lowpass', f: 250, f2: 1600, fdur: 1.5 * k, a: 0.3 * k, verb: 0.4 });
      // 輪盤滾珠：逐漸變慢的滴答
      let d = 0.1;
      for (let i = 0, gap = 0.035; d < 1.35; i++, gap *= 1.09) { tone(rnd(2600, 3000), t + d * k, 0.03, 0.05, { type: 'triangle', pan: Math.sin(i * 0.8) * 0.6 }); d += gap; }
      tone(2200, t + 1.38 * k, 0.4, 0.09, { type: 'triangle', verb: 0.4 });
      bell(mtof(81), t + 1.4 * k, 0.8, 0.06, { ratio: 1.5, verb: 0.5 });
      // 撲克牌與籌碼
      for (let i = 0; i < 8; i++) noise(t + (0.2 + i * 0.09) * k, 0.05, 0.08, { filter: 'highpass', f: 3000, pan: rnd(-0.7, 0.7) });
      // 機械爪上膛 → 三道斬擊
      [1.2, 1.26].forEach(x => tone(900, t + x * k, 0.06, 0.1, { type: 'square', filter: 'bandpass', f: 1800, q: 4 }));
      [1.52, 1.62, 1.72].forEach((x, i) => {
        swish(t + x * k, 0.55, 7000, 400, 0.26, (i - 1) * 0.5);
        tone(1100 + i * 150, t + x * k, 0.3, 0.06, { type: 'square', filter: 'bandpass', f: 2500, q: 8 });
        kick(t + (x + 0.03) * k, 0.45, sfxBus, { f: 120 });
      });
      // 血花
      [1.9, 1.98, 2.08].forEach(x => noise(t + x * k, 0.3, 0.2, { f: 700, f2: 250, q: 3 }));
      boom(t + 1.85 * k, 0.45, { f: 60, nf: 700, dur: 1.0, crackle: 3 });
      chord([50, 53, 56], t + 1.9 * k, 1.0, 0.05, { type: 'sawtooth', filter: 'lowpass', f: 1800, f2: 300, verb: 0.5 });
    },
    // 莫卡兄弟：文件翻飛 → 簽名 → 水柱 → 結冰 → 碎冰（配上一點不安的滑音）
    mocha(t, k) {
      chord([57, 61, 64, 68], t, 2.8 * k, 0.03, { type: 'triangle', a: 0.4 * k, verb: 0.6 });
      for (let i = 0; i < 14; i++) noise(t + (0.05 + i * 0.05) * k, 0.1, 0.07, { f: rnd(1500, 3500), q: 0.9, pan: rnd(-0.8, 0.8) });
      // 簽名的筆劃聲
      noise(t + 0.75 * k, 0.4 * k, 0.1, { f: 3500, f2: 5000, q: 3, a: 0.05 });
      // 「⋯⋯嗎？」不安的滑音
      tone(mtof(76), t + 0.95 * k, 0.5, 0.05, { type: 'triangle', f2t: mtof(71), verb: 0.4 });
      // 水管噴水
      noise(t + 1.05 * k, 0.55 * k, 0.28, { filter: 'lowpass', f: 1200, f2: 2600, a: 0.05 });
      noise(t + 1.05 * k, 0.55 * k, 0.12, { filter: 'highpass', f: 5000, a: 0.05 });
      // 結冰
      noise(t + 1.5 * k, 0.5 * k, 0.12, { f: 2000, f2: 7000, q: 4, a: 0.1 });
      for (let i = 0; i < 12; i++) bell(rnd(2400, 5200), t + (1.5 + i * 0.035) * k, 0.4, 0.05, { ratio: 2.76, pan: rnd(-0.6, 0.6), verb: 0.4 });
      // 碎冰
      tone(90, t + 2.1 * k, 0.6, 0.45, { f2t: 35 });
      shatter(t + 2.1 * k, 0.55, { n: 26, lo: 2800, hi: 7500 });
    },
    // 阿蘭：心跳與呼吸 → 瞄準鏡 → 槍響 → 炎彈爆炸
    alan(t, k) {
      chord([41, 48, 53], t, 1.7 * k, 0.04, { type: 'sawtooth', filter: 'lowpass', f: 200, f2: 800, fdur: 1.5 * k, a: 0.4 * k, verb: 0.3 });
      [0.25, 0.42, 0.85, 1.02].forEach(d => kick(t + d * k, 0.4, sfxBus, { f: 60, f2: 32, dur: 0.3 }));
      noise(t + 0.6 * k, 0.5 * k, 0.05, { filter: 'lowpass', f: 800, a: 0.2 });   // 吸氣
      [0.75, 1.0, 1.2].forEach(d => tone(3000, t + d * k, 0.04, 0.04, { type: 'square', filter: 'highpass', f: 2500 }));   // 瞄準鏡刻度
      tone(1800, t + 1.35 * k, 0.2, 0.04, { verb: 0.3 });
      // 槍響
      const s = t + 1.6 * k;
      noise(s, 0.09, 0.9, { filter: 'highpass', f: 700, a: 0.001 });
      tone(140, s, 0.4, 0.8, { f2t: 35, gdur: 0.25, a: 0.001 });
      noise(s + 0.01, 1.4, 0.3, { filter: 'lowpass', f: 2000, f2: 150, verb: 0.7 });
      // 炎彈爆炸
      boom(t + 1.78 * k, 0.75, { f: 70, nf: 1800, dur: 1.2, crackle: 18 });
      noise(t + 1.78 * k, 1.2, 0.18, { f: 400, f2: 2500, q: 0.8, a: 0.3 });
      chord([53, 57, 60, 65], t + 1.85 * k, 1.1, 0.05, { type: 'sawtooth', filter: 'lowpass', f: 2600, f2: 500, a: 0.05, verb: 0.5 });
    },
  };
  ULT.mark = (t, k) => {
    // 四個石窪依序注滿（每滿一窪一聲清亮的鈴音，音高逐級上升）→ 最後一窪滿溢、奔流 → 浪花 → 蓋章
    chord([52, 59, 64, 67], t, 2.8 * k, 0.03, { type: 'triangle', a: 0.4 * k, verb: 0.6 });
    [0, 1, 2, 3].forEach(i => {
      const d = 0.82 + i * 0.2;
      noise(t + d * k, 0.18 * k, 0.12, { filter: 'lowpass', f: 500, f2: 1600, a: 0.02 });   // 注水
      tone(mtof(55 + i * 2), t + d * k, 0.18 * k, 0.05, { type: 'sine', f2t: mtof(67 + i * 2), gdur: 0.17 * k });   // 水位上升
      bell(mtof([76, 79, 83, 88][i]), t + (d + 0.18) * k, 0.6, 0.05, { ratio: 2, index: 0.5, verb: 0.6 });   // 盈
    });
    noise(t + 1.64 * k, 0.3 * k, 0.3, { filter: 'lowpass', f: 600, f2: 2600, a: 0.15 });   // 滿溢奔流
    noise(t + 1.87 * k, 0.6, 0.4, { filter: 'lowpass', f: 1800, f2: 300, a: 0.01, verb: 0.4 });   // 浪花
    tone(110, t + 1.87 * k, 0.5, 0.35, { f2t: 45, a: 0.003 });
    for (let i = 0; i < 10; i++) bell(rnd(1500, 2600), t + (1.9 + i * 0.03) * k, 0.2, 0.03, { ratio: 1.0, index: 0.6, pan: rnd(-0.6, 0.6) });
    kick(t + 2.12 * k, 0.6, sfxBus, { f: 110, f2: 32, dur: 0.4 });   // 印章
    chord([59, 64, 67, 71], t + 2.15 * k, 0.9, 0.04, { type: 'triangle', verb: 0.6 });
  };
  ULT.raiden = (t, k) => {
    // 警報與掃描 → 機械步伐 → 鎖定的嗶聲（每個目標一聲）→ 蓄電 → 落雷 → 低頻餘震
    [0, 0.35, 0.7].forEach(d => tone(740, t + d * k, 0.25, 0.05, { type: 'square', f2t: 520, gdur: 0.24, filter: 'lowpass', f: 2400 }));
    noise(t, 1.4 * k, 0.05, { f: 1200, f2: 3000, q: 2, a: 0.3 * k });
    [0.1, 0.45].forEach(d => { kick(t + d * k, 0.6, sfxBus, { f: 70, f2: 30, dur: 0.3 }); noise(t + d * k, 0.15, 0.15, { filter: 'lowpass', f: 900, a: 0.002 }); });
    [0.78, 0.89, 1.0, 1.11].forEach(d => tone(1760, t + d * k, 0.08, 0.05, { type: 'square', filter: 'bandpass', f: 1800 }));
    tone(80, t + 1.35 * k, 0.45 * k, 0.12, { type: 'sawtooth', f2t: 600, gdur: 0.43 * k, filter: 'lowpass', f: 1800 });   // 蓄電
    noise(t + 1.35 * k, 0.45 * k, 0.1, { filter: 'highpass', f: 3000, a: 0.3 * k });
    noise(t + 1.78 * k, 0.5, 0.55, { filter: 'highpass', f: 5000, f2: 900, a: 0.001 });   // 落雷
    boom(t + 1.78 * k, 0.85, { f: 55, nf: 3000, dur: 1.2, crackle: 25 });
    chord([40, 47, 52, 55], t + 1.85 * k, 1.0, 0.05, { type: 'sawtooth', filter: 'lowpass', f: 1800, f2: 300, verb: 0.5 });
  };
  ULT.otg = (t, k) => {
    // 低沉的嗡鳴與月升 → 鎖鏈拖地 → 裂口撕下（一連串撕裂聲）→ 月蝕的下沉音 → 引爆 → 倒置十字落下
    chord([38, 45, 50, 53], t, 2.8 * k, 0.035, { type: 'sawtooth', filter: 'lowpass', f: 400, f2: 1200, fdur: 1.6 * k, a: 0.5 * k, verb: 0.7 });
    tone(41, t, 1.8 * k, 0.2, { a: 0.6 * k });
    for (let i = 0; i < 14; i++) bell(rnd(2000, 3400), t + (0.15 + i * 0.045) * k, 0.12, 0.025, { ratio: 1.41, index: 2, pan: rnd(-0.6, 0.6) });   // 鎖鏈
    for (let i = 0; i < 8; i++) noise(t + (0.82 + i * 0.07) * k, 0.12, 0.12, { f: 2400, f2: 700, q: 1.2, a: 0.004, pan: rnd(-0.5, 0.5) });   // 撕裂
    tone(330, t + 1.5 * k, 0.32 * k, 0.06, { type: 'sawtooth', f2t: 60, gdur: 0.3 * k, filter: 'lowpass', f: 1400 });   // 月蝕
    noise(t + 1.5 * k, 0.3 * k, 0.15, { filter: 'lowpass', f: 300, f2: 2000, a: 0.25 * k });
    boom(t + 1.79 * k, 0.85, { f: 60, nf: 1600, dur: 1.3, crackle: 10 });
    noise(t + 1.8 * k, 0.6, 0.2, { f: 1800, f2: 400, q: 0.8, a: 0.004 });
    kick(t + 2.05 * k, 0.75, sfxBus, { f: 90, f2: 28, dur: 0.5 });   // 十字落下
    chord([38, 41, 45, 50], t + 2.08 * k, 1.0, 0.05, { type: 'sawtooth', filter: 'lowpass', f: 1600, f2: 300, verb: 0.6 });
  };
  ULT.miller = (t, k) => {
    // 雨聲 → 三響喪鐘 → 撐傘的風聲 → 收傘 → 花雨落下的低鳴 → 訃告蓋印
    noise(t, 2.8 * k, 0.07, { filter: 'highpass', f: 3500, f2: 5000, a: 0.3 * k, verb: 0.5 });   // 雨
    chord([45, 52, 57, 60], t, 2.8 * k, 0.028, { type: 'triangle', a: 0.5 * k, verb: 0.75 });   // A 小調的輓歌和聲
    [0.15, 0.6, 1.05].forEach((d, i) => bell(mtof([45, 45, 40][i]), t + d * k, 2.2, 0.11, { ratio: 1.41, index: 1.6, verb: 0.8 }));   // 喪鐘
    swish(t + 0.95 * k, 0.4, 300, 2400, 0.35 * k, 0);   // 黑傘張開
    for (let i = 0; i < 8; i++) bell(mtof([76, 79, 81, 84, 81, 79, 76, 72][i]), t + (1.0 + i * 0.07) * k, 0.5, 0.025, { ratio: 2, index: 0.4, verb: 0.7, pan: rnd(-0.5, 0.5) });   // 花瓣盤旋
    swish(t + 1.55 * k, 0.35, 2400, 400, 0.22 * k, 0);   // 收傘
    boom(t + 1.8 * k, 0.55, { f: 55, nf: 900, dur: 1.3, crackle: 0 });
    tone(55, t + 1.8 * k, 1.0, 0.3, { f2t: 30, a: 0.01 });
    chord([45, 48, 52, 57], t + 1.85 * k, 1.1, 0.045, { type: 'sawtooth', filter: 'lowpass', f: 1800, f2: 400, verb: 0.7 });
    [1.95, 2.11, 2.27].forEach((d, i) => bell(mtof(69 + i * 3), t + d * k, 0.6, 0.04, { ratio: 1, index: 0.6, verb: 0.6 }));   // 悲悼 Ⅰ Ⅱ Ⅲ
    kick(t + 2.08 * k, 0.7, sfxBus, { f: 100, f2: 30, dur: 0.45 });   // 訃告印
    noise(t + 2.08 * k, 0.25, 0.25, { filter: 'lowpass', f: 1000, f2: 160, verb: 0.4 });
  };
  ULT.alexandra = (t, k) => {
    // 警笛（上下滑音）→ 公路的轟鳴 → 頭燈衝來 → 風刃橫掃
    for (let i = 0; i < 4; i++) tone(i % 2 ? 1300 : 750, t + i * 0.3 * k, 0.3 * k, 0.045, { type: 'square', f2t: i % 2 ? 750 : 1300, gdur: 0.28 * k, filter: 'lowpass', f: 2600, verb: 0.3 });
    chord([43, 50, 55], t, 2.8 * k, 0.04, { type: 'sawtooth', filter: 'lowpass', f: 250, f2: 1500, fdur: 1.6 * k, a: 0.3 * k, verb: 0.4 });
    tone(55, t + 0.45 * k, 1.3 * k, 0.18, { type: 'sawtooth', f2t: 140, gdur: 1.2 * k, filter: 'lowpass', f: 600, a: 0.2 });   // 引擎
    noise(t + 0.45 * k, 1.3 * k, 0.12, { f: 300, f2: 2600, q: 0.8, a: 1.0 * k });
    noise(t + 1.25 * k, 0.25 * k, 0.12, { filter: 'highpass', f: 2500 });   // 封鎖線拉開
    tone(2400, t + 1.4 * k, 0.3, 0.05, { f2t: 1200, type: 'triangle' });     // 輪胎尖嘯
    noise(t + 1.4 * k, 0.35, 0.18, { f: 3500, q: 6, a: 0.02 });
    boom(t + 1.73 * k, 0.7, { f: 80, nf: 2200, dur: 1.0, crackle: 6 });
    swish(t + 1.7 * k, 0.5, 900, 7000, 0.5, -0.5); swish(t + 1.85 * k, 0.4, 7000, 600, 0.6, 0.5);
    chord([55, 59, 62, 67], t + 1.8 * k, 1.0, 0.05, { type: 'sawtooth', filter: 'lowpass', f: 2600, f2: 600, verb: 0.5 });
  };
  ULT.hanye = (t, k) => {
    // 稀疏的鐘聲與打字聲 → 作圖的筆劃 → 四道刻度 → 劍光與空間裂開 → 彈射 → Q.E.D.
    chord([50, 57, 62, 64], t, 2.8 * k, 0.03, { type: 'triangle', a: 0.5 * k, verb: 0.7 });
    [0.1, 0.5, 0.9].forEach((d, i) => bell(mtof([86, 81, 88][i]), t + d * k, 1.2, 0.04, { ratio: 1.0, index: 0.5, verb: 0.7 }));
    for (let i = 0; i < 18; i++) tone(rnd(2800, 3400), t + (0.52 + i * 0.05) * k, 0.02, 0.03, { type: 'square', filter: 'highpass', f: 2000 });
    [0.72, 0.84, 0.96, 1.08, 1.16, 1.24].forEach(d => noise(t + d * k, 0.25 * k, 0.05, { f: 4000, f2: 6000, q: 3, a: 0.05 }));
    bell(mtof(93), t + 1.36 * k, 0.8, 0.06, { ratio: 2, verb: 0.5 });
    [1.45, 1.495, 1.54, 1.585].forEach((d, i) => { tone(mtof(74 + i * 3), t + d * k, 0.15, 0.08, { type: 'triangle' }); kick(t + d * k, 0.18, sfxBus, { f: 200 }); });
    noise(t + 1.76 * k, 0.4, 0.5, { filter: 'highpass', f: 6000, f2: 1500, a: 0.002 });
    tone(4200, t + 1.76 * k, 0.5, 0.05, { f2t: 600 });
    tone(60, t + 1.85 * k, 1.2, 0.35, { f2t: 28, a: 0.01 });   // 空間裂開的低鳴
    noise(t + 1.85 * k, 1.0, 0.15, { filter: 'lowpass', f: 400, f2: 80, verb: 0.6 });
    [1.95, 2.05, 2.15, 2.25].forEach(d => bell(rnd(1800, 2600), t + d * k, 0.3, 0.05, { ratio: 1, index: 0.8, verb: 0.4, pan: rnd(-0.6, 0.6) }));
    chord([62, 66, 69, 74], t + 2.05 * k, 1.2, 0.04, { type: 'triangle', verb: 0.6 });
  };
  ULT.gordon = (t, k) => {
    // 交易所的嘈雜與報價 → 一路上漲的琶音 → 漲停鐘 → 崩盤 → 巨浪 → 蓋章
    noise(t, 1.3 * k, 0.04, { f: 900, f2: 1400, q: 0.5, a: 0.3 * k });
    for (let i = 0; i < 20; i++) tone(mtof(60 + Math.round(i * 1.1)), t + (0.15 + i * 0.05) * k, 0.07, 0.035, { type: 'square', filter: 'lowpass', f: 3200 });
    bell(mtof(84), t + 1.1 * k, 1.0, 0.08, { ratio: 2.01, index: 1.5, verb: 0.5 }); bell(mtof(91), t + 1.16 * k, 1.0, 0.06, { ratio: 2.01, verb: 0.5 });
    tone(880, t + 1.38 * k, 0.6 * k, 0.07, { type: 'sawtooth', f2t: 80, gdur: 0.5 * k, filter: 'lowpass', f: 2000 });   // 崩盤
    kick(t + 1.38 * k, 0.5, sfxBus, { f: 90 });
    noise(t + 1.5 * k, 0.6 * k, 0.3, { filter: 'lowpass', f: 300, f2: 2400, a: 0.4 * k });   // 巨浪湧來
    boom(t + 1.62 * k, 0.6, { f: 60, nf: 1200, dur: 1.2, crackle: 4 });
    for (let i = 0; i < 12; i++) bell(rnd(3600, 5200), t + (1.7 + i * 0.03) * k, 0.15, 0.03, { ratio: 1.7, pan: rnd(-0.7, 0.7) });   // 硬幣
    kick(t + 1.95 * k, 0.8, sfxBus, { f: 120, f2: 30, dur: 0.5 });   // 印章
    noise(t + 1.95 * k, 0.3, 0.35, { filter: 'lowpass', f: 1200, f2: 180, verb: 0.4 });
    chord([53, 56, 60, 65], t + 2.0 * k, 1.0, 0.05, { type: 'sawtooth', filter: 'lowpass', f: 2400, f2: 500, verb: 0.5 });
  };
  function ult(key, k) {
    if (!ready() || !ULT[key]) return;
    duck(3.2 * k);
    ULT[key](ctx.currentTime + 0.02, k);
  }

  /* ================= 長版終結技：提示點音效 + 背景和聲 =================
   * 演出腳本提供 cues = [[毫秒, 音效名稱, 參數]] 與 bed（和弦進行），這裡依時間一次排程好，
   * 畫面與聲音用同一份時間表，不會對不上。 */
  const CUE = {
    shutter(t) { noise(t, 0.03, 0.35, { filter: 'highpass', f: 3500 }); tone(1800, t, 0.04, 0.08, { type: 'square', filter: 'bandpass', f: 2500 }); noise(t + 0.06, 0.05, 0.2, { filter: 'highpass', f: 2500 }); },
    heartbeat(t) { kick(t, 0.55, cueOut, { f: 62, f2: 30, dur: 0.35 }); kick(t + 0.2, 0.38, cueOut, { f: 55, f2: 28, dur: 0.3 }); },
    whoosh(t, o) { noise(t, o.dur || 0.55, o.vol || 0.28, { f: 250, f2: 4200, q: 1.1, a: (o.dur || 0.55) * 0.55, pan: o.pan, dest: cueOut }); },
    whooshDown(t, o) { noise(t, o.dur || 0.5, o.vol || 0.25, { f: 4200, f2: 260, q: 1.1, a: 0.05, pan: o.pan, dest: cueOut }); },
    swish(t, o) { noise(t, 0.2, o.vol || 0.45, { f: 6500, f2: 450, q: 1.5, a: 0.05, pan: o.pan, dest: cueOut }); },
    stamp(t) { kick(t, 0.9, cueOut, { f: 120, f2: 30, dur: 0.6 }); noise(t, 0.3, 0.45, { filter: 'lowpass', f: 1300, f2: 180, verb: 0.5, dest: cueOut }); tone(90, t, 0.8, 0.2, { f2t: 40, dest: cueOut }); },
    impact(t, o) { kick(t, o.vol || 0.8, cueOut, { f: 90, f2: 24, dur: 0.9 }); noise(t, 0.6, (o.vol || 0.8) * 0.5, { filter: 'lowpass', f: 1600, f2: 120, verb: 0.5, dest: cueOut }); },
    tick(t) { tone(rnd(2600, 3000), t, 0.03, 0.06, { type: 'triangle', dest: cueOut }); },
    // 滴答聲：slow > 1 越來越慢、< 1 越來越快。間隔最短 12 毫秒、最多 200 聲，避免間隔收斂時永遠走不到 dur 而卡死
    ticks(t, o) { let d = 0, n = 0; for (let gap = o.gap || 0.03; d < (o.dur || 1.5) && n < 200; gap = Math.max(0.012, gap * (o.slow || 1.08)), n++) { tone(rnd(2500, 3100), t + d, 0.03, 0.05, { type: 'triangle', pan: Math.sin(d * 9) * 0.6, dest: cueOut }); d += gap; } },
    cards(t, o) { for (let i = 0; i < (o.n || 14); i++) noise(t + i * rnd(0.03, 0.07), 0.05, 0.09, { filter: 'highpass', f: 2800, pan: rnd(-0.8, 0.8), dest: cueOut }); },
    chips(t, o) { for (let i = 0; i < (o.n || 16); i++) bell(rnd(2800, 4200), t + i * rnd(0.02, 0.06), 0.14, 0.05, { ratio: 1.8, index: 1, pan: rnd(-0.7, 0.7), dest: cueOut }); },
    claw(t, o) { noise(t, 0.28, 0.6, { f: 7500, f2: 380, q: 1.6, a: 0.02, pan: o.pan, dest: cueOut }); tone(1150, t, 0.35, 0.07, { type: 'square', filter: 'bandpass', f: 2600, q: 9, dest: cueOut }); kick(t + 0.03, 0.55, cueOut, { f: 130 }); },
    blood(t) { for (let i = 0; i < 3; i++) noise(t + i * 0.07, 0.3, 0.2, { f: 800, f2: 250, q: 3, dest: cueOut }); },
    paper(t, o) { for (let i = 0; i < (o.n || 10); i++) noise(t + i * rnd(0.04, 0.09), 0.09, 0.07, { f: rnd(1500, 4000), q: 0.9, pan: rnd(-0.8, 0.8), dest: cueOut }); },
    sign(t, o) { noise(t, o.dur || 0.5, 0.12, { f: 3600, f2: 5200, q: 3, a: 0.04, dest: cueOut }); },
    water(t, o) { noise(t, o.dur || 1.2, 0.3, { filter: 'lowpass', f: 900, f2: 2600, a: 0.08, dest: cueOut }); noise(t, o.dur || 1.2, 0.12, { filter: 'highpass', f: 5000, a: 0.08, dest: cueOut }); },
    freeze(t, o) { noise(t, o.dur || 1, 0.14, { f: 1800, f2: 7500, q: 4, a: 0.2, dest: cueOut }); for (let i = 0; i < 14; i++) bell(rnd(2400, 5600), t + i * (o.dur || 1) / 14, 0.45, 0.05, { ratio: 2.76, pan: rnd(-0.6, 0.6), verb: 0.4, dest: cueOut }); },
    glass(t, o) { shatterTo(t, o.vol || 0.6, cueOut, o.n || 26); },
    scope(t) { tone(3200, t, 0.03, 0.06, { type: 'square', filter: 'highpass', f: 2500, dest: cueOut }); noise(t, 0.05, 0.1, { filter: 'highpass', f: 4000, dest: cueOut }); },
    reload(t) { [0, 0.16, 0.34].forEach((d, i) => { noise(t + d, 0.05, 0.3, { filter: 'bandpass', f: 1800 + i * 500, q: 3, dest: cueOut }); tone(700 + i * 200, t + d, 0.05, 0.08, { type: 'square', filter: 'bandpass', f: 1500, dest: cueOut }); }); },
    gun(t) { noise(t, 0.1, 1, { filter: 'highpass', f: 700, a: 0.001, dest: cueOut }); tone(140, t, 0.45, 0.85, { f2t: 32, gdur: 0.25, a: 0.001, dest: cueOut }); noise(t + 0.01, 1.6, 0.32, { filter: 'lowpass', f: 2200, f2: 150, verb: 0.7, dest: cueOut }); },
    boom(t, o) { tone(70, t, 1.4, o.vol || 0.8, { f2t: 25, gdur: 0.8, a: 0.003, dest: cueOut }); noise(t, 1.8, (o.vol || 0.8) * 0.8, { filter: 'lowpass', f: 2000, f2: 150, a: 0.004, verb: 0.5, dest: cueOut }); for (let i = 0; i < 20; i++) noise(t + 0.05 + Math.random() * 1.2, 0.02, 0.2 * Math.random(), { filter: 'highpass', f: 2500, pan: rnd(-0.7, 0.7), dest: cueOut }); },
    riser(t, o) { noise(t, o.dur || 1.5, o.vol || 0.18, { f: 250, f2: 6000, q: 1.2, a: (o.dur || 1.5) * 0.9, dest: cueOut }); tone(110, t, o.dur || 1.5, 0.06, { type: 'sawtooth', f2t: 440, filter: 'lowpass', f: 600, f2: 3000, a: (o.dur || 1.5) * 0.8, dest: cueOut }); },
    sting(t, o) { chord(o.notes || [50, 57, 62, 65], t, o.dur || 1.6, 0.06, { type: 'sawtooth', filter: 'lowpass', f: 3000, f2: 600, a: 0.01, verb: 0.6, dest: cueOut }); kick(t, 0.5, cueOut, { f: 80 }); },
    blip(t, o) { for (let i = 0; i < (o.n || 8); i++) tone(rnd(700, 950) * (o.pitch || 1), t + i * 0.055, 0.03, 0.03, { type: 'square', filter: 'lowpass', f: 2200, dest: cueOut }); },
    beam(t, o) { tone(300, t, o.dur || 0.6, 0.08, { type: 'sawtooth', f2t: 1800, filter: 'lowpass', f: 2500, a: 0.05, dest: cueOut }); bell(1800, t + (o.dur || 0.6), 0.6, 0.06, { verb: 0.5, dest: cueOut }); },
    flare(t) { tone(900, t, 0.8, 0.07, { f2t: 2600, type: 'triangle', dest: cueOut }); noise(t, 0.8, 0.1, { f: 1500, f2: 5000, q: 2, a: 0.3, dest: cueOut }); noise(t + 0.8, 0.5, 0.25, { filter: 'lowpass', f: 1500, f2: 300, verb: 0.5, dest: cueOut }); },
    laser(t) { tone(2400, t, 0.5, 0.05, { vib: [30, 40], dest: cueOut }); },
    chime(t, o) { (o.notes || [79, 83, 86]).forEach((m, i) => bell(mtof(m), t + i * 0.07, 0.8, 0.06, { ratio: 2, verb: 0.5, dest: cueOut })); },
    crack(t) { for (let i = 0; i < 8; i++) noise(t + i * 0.025, 0.04, 0.3, { filter: 'highpass', f: 2000 + i * 300, dest: cueOut }); tone(3000, t, 0.3, 0.04, { f2t: 900, dest: cueOut }); },
    rumble(t, o) { noise(t, o.dur || 1.5, o.vol || 0.2, { filter: 'lowpass', f: 180, a: 0.3, dest: cueOut }); },
    // 環境與道具
    rain(t, o) { noise(t, o.dur || 4, o.vol || 0.12, { filter: 'lowpass', f: 2600, a: 0.3, dest: cueOut }); noise(t, o.dur || 4, (o.vol || 0.12) * 0.4, { filter: 'highpass', f: 6000, a: 0.3, dest: cueOut }); },
    footsteps(t, o) { for (let i = 0; i < (o.n || 8); i++) { const tt = t + i * (o.gap || 0.3); tone(95, tt, 0.09, 0.14 * (o.vol || 1), { f2t: 55, dest: cueOut, pan: i % 2 ? 0.3 : -0.3 }); noise(tt, 0.06, 0.06 * (o.vol || 1), { filter: 'lowpass', f: 1400, dest: cueOut }); noise(tt + 0.02, 0.05, 0.03, { filter: 'highpass', f: 4000, dest: cueOut }); } },
    ring(t, o) { for (let r = 0; r < (o.n || 2); r++) for (let i = 0; i < 18; i++) tone(i % 2 ? 1320 : 1060, t + r * 1.1 + i * 0.042, 0.04, 0.05, { type: 'square', filter: 'lowpass', f: 3000, dest: cueOut }); },
    siren(t, o) { const d = o.dur || 4; for (let i = 0; i < d / 0.55; i++) tone(i % 2 ? 960 : 720, t + i * 0.55, 0.56, o.vol || 0.035, { type: 'triangle', filter: 'lowpass', f: 1800, a: 0.04, verb: 0.5, dest: cueOut, pan: Math.sin(i * 0.6) * 0.5 }); },
    radio(t, o) { for (let i = 0; i < (o.n || 4); i++) { const tt = t + i * rnd(0.35, 0.7); noise(tt, rnd(0.15, 0.35), 0.05, { f: 1900, q: 3, dest: cueOut }); tone(1800, tt, 0.03, 0.03, { type: 'square', dest: cueOut }); } },
    cuffs(t) { [0, 0.09, 0.16].forEach((d, i) => { tone(2400 + i * 400, t + d, 0.05, 0.1, { type: 'square', filter: 'bandpass', f: 3200, q: 4, dest: cueOut }); noise(t + d, 0.04, 0.25, { filter: 'highpass', f: 3000, dest: cueOut }); }); bell(3500, t + 0.18, 0.5, 0.05, { ratio: 1.41, verb: 0.3, dest: cueOut }); },
    click(t) { noise(t, 0.02, 0.3, { filter: 'highpass', f: 2500, dest: cueOut }); tone(900, t, 0.03, 0.08, { type: 'square', dest: cueOut }); },
    wind(t, o) { noise(t, o.dur || 3, o.vol || 0.1, { f: 500, f2: 900, q: 0.6, a: 0.6, dest: cueOut }); noise(t + 0.4, (o.dur || 3) - 0.4, (o.vol || 0.1) * 0.6, { f: 1200, f2: 600, q: 0.8, a: 0.5, dest: cueOut }); },
    shieldUp(t) { tone(300, t, 0.6, 0.1, { type: 'triangle', f2t: 900, a: 0.1, verb: 0.4, dest: cueOut }); for (let i = 0; i < 6; i++) bell(900 + i * 180, t + 0.15 + i * 0.05, 0.6, 0.04, { ratio: 1.5, verb: 0.5, dest: cueOut }); noise(t, 0.5, 0.08, { f: 1500, f2: 5000, q: 2, a: 0.3, dest: cueOut }); },
    ricochet(t, o) { for (let i = 0; i < (o.n || 6); i++) { const tt = t + i * rnd(0.12, 0.3); tone(rnd(2200, 3400), tt, 0.18, 0.05, { f2t: rnd(700, 1200), type: 'triangle', pan: rnd(-0.6, 0.2), dest: cueOut }); noise(tt, 0.04, 0.12, { filter: 'highpass', f: 3000, dest: cueOut }); } },
    gunfire(t, o) { for (let i = 0; i < (o.n || 8); i++) { const tt = t + i * rnd(0.1, 0.22); noise(tt, 0.06, 0.18, { filter: 'bandpass', f: 1400, q: 0.8, pan: 0.5, dest: cueOut }); tone(160, tt, 0.08, 0.12, { f2t: 60, dest: cueOut }); } },
    tear(t) { noise(t, 0.45, 0.3, { f: 2500, f2: 900, q: 1.2, a: 0.02, dest: cueOut }); for (let i = 0; i < 10; i++) noise(t + i * 0.035, 0.03, 0.12, { filter: 'highpass', f: 3000, dest: cueOut }); },
    pop(t) { noise(t, 0.05, 0.4, { filter: 'highpass', f: 1200, dest: cueOut }); tone(500, t, 0.08, 0.2, { f2t: 1400, type: 'square', filter: 'lowpass', f: 2500, dest: cueOut }); },
    door(t) { kick(t, 0.7, cueOut, { f: 80, f2: 35, dur: 0.5 }); noise(t, 0.35, 0.3, { filter: 'lowpass', f: 900, f2: 200, verb: 0.4, dest: cueOut }); for (let i = 0; i < 4; i++) noise(t + 0.05 + i * 0.04, 0.03, 0.08, { filter: 'bandpass', f: 1500, dest: cueOut }); },
    // 亞歷山卓：引擎轟鳴、輪胎尖嘯
    engine(t, o) { const d = o.dur || 2; tone(48, t, d, o.vol || 0.16, { type: 'sawtooth', f2t: o.up ? 120 : 60, gdur: d, filter: 'lowpass', f: 500, a: 0.2, dest: cueOut }); noise(t, d, (o.vol || 0.16) * 0.6, { filter: 'lowpass', f: 300, f2: 900, a: 0.3, dest: cueOut }); },
    screech(t, o) { const d = o.dur || 0.9; tone(2300, t, d, 0.05, { type: 'sawtooth', f2t: 1500, filter: 'bandpass', f: 2600, q: 6, a: 0.03, dest: cueOut }); noise(t, d, 0.25, { f: 3200, q: 4, a: 0.03, dest: cueOut }); },
    // 戈登：開盤鐘、收銀機
    bell(t, o) { for (let i = 0; i < (o.n || 3); i++) bell(mtof(81), t + i * 0.32, 1.2, 0.09, { ratio: 2.76, index: 1.8, verb: 0.6, dest: cueOut }); },
    register(t) { tone(1100, t, 0.05, 0.1, { type: 'square', filter: 'bandpass', f: 1800, q: 3, dest: cueOut }); bell(2637, t + 0.06, 0.6, 0.08, { ratio: 2.01, index: 1.4, verb: 0.3, dest: cueOut }); bell(3951, t + 0.1, 0.5, 0.06, { ratio: 2.01, verb: 0.3, dest: cueOut }); },
    // 寒夜：翻頁、時鐘的滴答
    page(t, o) { for (let i = 0; i < (o.n || 4); i++) noise(t + i * 0.12, 0.18, 0.08, { f: 2600, f2: 1200, q: 0.8, a: 0.03, pan: rnd(-0.6, 0.6), dest: cueOut }); },
    clock(t, o) { for (let i = 0; i < (o.n || 6); i++) tone(i % 2 ? 1900 : 1500, t + i * (o.gap || 0.5), 0.03, 0.06, { type: 'triangle', verb: 0.4, dest: cueOut }); },
    // P5 風格：清脆的介面衝擊音
    punch(t) { tone(1400, t, 0.12, 0.12, { type: 'square', f2t: 260, filter: 'lowpass', f: 3000, dest: cueOut }); noise(t, 0.06, 0.3, { filter: 'highpass', f: 2500, dest: cueOut }); kick(t, 0.5, cueOut, { f: 140, f2: 50, dur: 0.25 }); },
    // 剪貼信字母蓋上
    letter(t, o) { noise(t, 0.05, 0.22, { filter: 'bandpass', f: 1200 + (o.i || 0) % 5 * 180, q: 1.5, dest: cueOut }); tone(220 + (o.i || 0) % 4 * 30, t, 0.06, 0.12, { type: 'triangle', f2t: 120, dest: cueOut }); },
    // 爵士放克的節奏底：行走貝斯＋反拍鈸＋2、4 拍小鼓
    groove(t, o) {
      const bpm = o.bpm || 150, e = 60 / bpm / 2, n = Math.floor((o.dur || 4) / e);
      const riff = o.riff || [40, 40, 52, 40, 50, 40, 47, 49, 40, 40, 52, 40, 55, 54, 52, 47];
      for (let i = 0; i < n; i++) {
        const tt = t + i * e;
        tone(mtof(riff[i % riff.length]), tt, e * 0.85, 0.16, { type: 'sawtooth', filter: 'lowpass', f: 900, f2: 300, fdur: e * 0.8, a: 0.004, dest: cueOut });
        if (i % 2) noise(tt, 0.05, 0.05, { filter: 'highpass', f: 7500, dest: cueOut });
        if (i % 4 === 2) snare(tt, 0.13, cueOut);
        if (i % 4 === 0) kick(tt, 0.3, cueOut);
        if (o.chords && i % 8 === 0) chord(o.chords[(i / 8) % o.chords.length], tt, e * 7.5, 0.025, { type: 'square', filter: 'lowpass', f: 1800, a: 0.01, verb: 0.3, dest: cueOut });
      }
    },
  };
  function shatterTo(t, vol, dest, n) {
    noise(t, 0.6, vol * 0.7, { filter: 'highpass', f: 2600, a: 0.002, verb: 0.3, dest });
    for (let i = 0; i < n; i++) bell(rnd(2200, 7000), t + Math.random() * 0.35, rnd(0.08, 0.35), vol * rnd(0.07, 0.18), { ratio: rnd(1.4, 4.2), index: 1.2, pan: rnd(-0.8, 0.8), verb: 0.25, dest });
  }
  let cueOut = null;
  /** 排程一整段演出的聲音；回傳 { stop() }（跳過時淡出） */
  function score(spec, k) {
    if (!ready()) return { stop() {} };
    k = k || 1;
    const out = ctx.createGain(); out.connect(sfxBus); out._sfx = true;
    const t0 = ctx.currentTime + 0.03, at = ms => t0 + ms * k / 1000;
    const prev = cueOut; cueOut = out;
    duck(null, 0.12);
    // 背景和聲：每段和弦以長音墊鋪底，低音持續
    const bed = spec.bed || [];
    bed.forEach(([ms, notes, len], i) => {
      const end = i + 1 < bed.length ? bed[i + 1][0] : (spec.dur || ms + 2000);
      const d = (len || end - ms) * k / 1000 + 0.6;
      notes.forEach((m, j) => tone(mtof(m), at(ms), d, j ? 0.022 : 0.05, { type: j ? 'sawtooth' : 'triangle', detune: j % 2 ? 7 : -7, filter: 'lowpass', f: j ? 900 : 400, a: 0.35, verb: 0.5, dest: out }));
    });
    (spec.cues || []).forEach(([ms, name, o]) => { if (CUE[name]) CUE[name](at(ms), o || {}); });
    cueOut = prev;
    return {
      stop(soft) {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t + (soft ? 0.8 : 0), soft ? 0.5 : 0.1);
        setTimeout(() => out.disconnect(), soft ? 5000 : 1500);
        duck(soft ? 1.2 : 0.01);
      },
    };
  }

  /** 暫時壓低背景音樂 */
  function duck(sec, to) {
    if (!ctx) return;
    const g = duckNode, t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(to != null ? to : 0.3, t, 0.08);
    if (sec) g.gain.setTargetAtTime(1, t + sec, 0.5);
  }

  /* ================= 抽卡演出配樂 ================= */
  function gacha(T, results) {
    if (!ready()) return { stop() {} };
    const out = ctx.createGain(); out.connect(sfxBus); out._sfx = true;
    const t0 = ctx.currentTime + 0.02, at = ms => t0 + ms / 1000;
    const o = x => Object.assign({ dest: out }, x);
    duck(null, 0.12);
    // 文字散落、聚合成書
    for (let i = 0; i < 24; i++) bell(rnd(1800, 4200), at(rnd(0, T.converge)), 0.3, 0.025, o({ ratio: 2, pan: rnd(-0.8, 0.8), verb: 0.4 }));
    noise(at(0), T.form / 1000, 0.06, o({ f: 800, f2: 3000, q: 1.5, a: 0.8 }));
    bell(mtof(74), at(T.converge), 1.6, 0.06, o({ ratio: 1.5, verb: 0.6 }));
    // 書本放大、墜入星空
    noise(at(T.form), (T.fall - T.form) / 1000 + 0.4, 0.14, o({ filter: 'lowpass', f: 300, f2: 3500, fdur: (T.fall - T.form) / 1000, a: 1.2 }));
    tone(55, at(T.form), (T.space - T.form) / 1000, 0.18, o({ type: 'sawtooth', f2t: 110, filter: 'lowpass', f: 200, f2: 900, a: 1.5, verb: 0.3 }));
    kick(at(T.fall), 0.5, out, { f: 80, f2: 25, dur: 1.2 });
    // 太空：長音墊
    chord([50, 57, 64, 69, 76], at(T.space), (T.absorbEnd - T.space) / 1000 + 1.5, 0.028, o({ type: 'triangle', a: 1.2, verb: 0.8 }));
    // 星球一顆顆出現：音高依稀有度
    const best = results.reduce((m, r) => Math.max(m, r.rarity || 3), 3);
    results.forEach((r, i) => {
      const tt = at(T.planet0 + i * T.gap), rar = r.rarity || 3;
      const base = rar >= 5 ? 88 : rar >= 4 ? 83 : 76;
      bell(mtof(base + [0, 2, 4, 7, 9][i % 5]), tt, rar >= 5 ? 2.2 : 1.2, rar >= 5 ? 0.09 : 0.05, o({ ratio: rar >= 5 ? 1.5 : 2, verb: 0.7, pan: ((i % 5) - 2) * 0.3 }));
      if (rar >= 5) { chord([62, 69, 74, 78], tt, 2.4, 0.03, o({ type: 'sawtooth', filter: 'lowpass', f: 3000, f2: 800, verb: 0.7 })); noise(tt, 1.5, 0.08, o({ filter: 'highpass', f: 6000, a: 0.2 })); }
    });
    // 虛影現身與舉書
    noise(at(T.ghost), (T.formed - T.ghost) / 1000, 0.07, o({ f: 300, f2: 1200, q: 3, a: 0.8, verb: 0.6 }));
    chord(best >= 5 ? [38, 45, 50, 54] : [38, 45, 50, 53], at(T.ghost), (T.raised - T.ghost) / 1000 + 1, 0.04, o({ type: 'sawtooth', filter: 'lowpass', f: 300, f2: 1200, fdur: 2, a: 1, verb: 0.6 }));
    // 書本吸收星球
    results.forEach((r, i) => {
      const tt = at(T.absorb + i * T.agap + T.adur * 0.85);
      noise(at(T.absorb + i * T.agap), T.adur / 1000, 0.035, o({ f: 1500, f2: 5000, q: 3, a: 0.6 }));
      bell(mtof(81 + (i % 4) * 2), tt, 0.5, 0.04, o({ ratio: 2, verb: 0.5 }));
    });
    // 鏡頭轉向書本、揭曉
    noise(at(T.turn), (T.turned - T.turn) / 1000, 0.08, o({ f: 400, f2: 2200, q: 1, a: 0.9 }));
    const fin = best >= 5 ? [62, 66, 69, 74, 78, 81] : best >= 4 ? [62, 65, 69, 74, 77] : [62, 65, 69, 74];
    fin.forEach((m, i) => bell(mtof(m + 12), at(T.turned - 200 + i * 70), 2.4, 0.06, o({ ratio: 2, verb: 0.8 })));
    chord(fin.slice(0, 4), at(T.turned), 3, 0.04, o({ type: 'sawtooth', filter: 'lowpass', f: 2400, f2: 700, a: 0.05, verb: 0.7 }));
    return {
      stop(soft) {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t + (soft ? 1.2 : 0), soft ? 0.6 : 0.12);
        setTimeout(() => out.disconnect(), soft ? 5000 : 1500);
        duck(soft ? 1.5 : 0.01);
      },
    };
  }

  /* ================= 背景音樂（步進式編曲，前瞻排程） ================= */
  const players = [];   // { def, bus, step, next, sd, stopAt }
  const TRACKS = {
    // 選單：黑色電影感的慢板爵士（D 多利安），柔和電鋼琴、行走貝斯、刷鼓、唱片雜訊
    menu: {
      bpm: 74, steps: 8, bars: 8,   // 每小節 8 步（八分音符，帶搖擺）
      chords: [
        { b: 38, v: [53, 57, 60, 64] },   // Dm9
        { b: 43, v: [53, 57, 59, 64] },   // G13
        { b: 36, v: [52, 55, 59, 62] },   // Cmaj9
        { b: 45, v: [55, 61, 64, 65] },   // A7b9
      ],
      mel: [[0, 76, 3], [3, 74, 1], [4, 72, 2], [6, 69, 2]],
      step(t, i, sd, out) {
        const bar = Math.floor(i / 8) % this.bars, s = i % 8, ch = this.chords[bar % 4];
        const sw = s % 2 ? sd * 0.18 : 0, tt = t + sw;
        if (s === 0) {
          ch.v.forEach((m, j) => tone(mtof(m), tt + j * 0.012, sd * 7.5, 0.035, { dest: out, type: 'sine', vib: [5, 1.2], a: 0.01, verb: 0.35 }));
          ch.v.forEach(m => tone(mtof(m + 12), tt, sd * 3, 0.008, { dest: out, type: 'triangle', verb: 0.35 }));
        }
        if (s === 3 && bar % 2) ch.v.slice(1).forEach(m => tone(mtof(m), tt, sd * 1.4, 0.022, { dest: out, verb: 0.3 }));
        // 行走貝斯（四分音符）
        if (s % 2 === 0) {
          const nxt = this.chords[(bar + 1) % 4].b;
          const walk = [ch.b, ch.b + 7, ch.b + 12, nxt + (nxt > ch.b ? -1 : 1)][s / 2];
          tone(mtof(walk), tt, sd * 1.8, 0.14, { dest: out, type: 'triangle', filter: 'lowpass', f: 700, a: 0.008 });
        }
        // 刷鼓
        if (s === 0 || (s === 5 && bar % 2)) kick(tt, 0.18, out, { f: 110, f2: 45 });
        if (s === 2 || s === 6) noise(tt, 0.22, 0.05, { dest: out, f: 2500, q: 0.4, a: 0.02, verb: 0.2 });
        noise(tt, 0.06, s % 2 ? 0.012 : 0.02, { dest: out, filter: 'highpass', f: 8000 });
        // 唱片雜訊
        if (Math.random() < 0.5) noise(t + Math.random() * sd, 0.006, rnd(0.004, 0.02), { dest: out, filter: 'highpass', f: 2000 });
        // 小號般的旋律，每 4 小節出現一次
        if (bar === 4 || bar === 6) this.mel.forEach(([st, m, len]) => {
          if (st === s) tone(mtof(bar === 6 ? m - 2 : m), tt, sd * len * 0.95, 0.03, { dest: out, type: 'sawtooth', filter: 'lowpass', f: 1300, vib: [5.5, 3], a: 0.05, verb: 0.45 });
        });
      },
    },
    // 戰鬥：E 小調的都市黑色電子節拍，前 8 小節只有鼓組、貝斯與長音，後 8 小節加上琶音與主旋律
    battle: {
      bpm: 128, steps: 16, bars: 16,
      chords: [
        { r: 40, v: [52, 55, 59] },   // Em
        { r: 36, v: [52, 55, 60] },   // C
        { r: 38, v: [50, 54, 57] },   // D
        { r: 35, v: [51, 54, 59] },   // B
      ],
      lead: [   // [步, 音, 長度]，一小節一組
        [[0, 71, 3], [4, 74, 2], [6, 72, 2], [8, 71, 4], [14, 67, 2]],
        [[0, 72, 4], [6, 71, 2], [8, 67, 6]],
        [[0, 69, 2], [2, 71, 2], [4, 74, 4], [10, 76, 2], [12, 74, 4]],
        [[0, 75, 6], [8, 71, 4], [12, 66, 4]],
      ],
      step(t, i, sd, out) {
        const bar = Math.floor(i / 16) % this.bars, s = i % 16, ch = this.chords[bar % 4], B = bar >= 8;
        // 鼓組
        if (s === 0 || s === 8 || (B && (s === 4 || s === 12)) || (!B && s === 10 && bar % 2)) kick(t, 0.42, out);
        if (s === 4 || s === 12) snare(t, 0.2, out, { verb: 0.15 });
        if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.05 : 0.03, out);
        else if (B) hat(t, 0.018, out);
        if (s === 14 && bar % 2) hat(t, 0.04, out, true);
        if (bar % 8 === 7 && s >= 12) snare(t, 0.06 + (s - 12) * 0.03, out);
        // 貝斯：八度交替的十六分音符
        const bn = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 12][s];
        tone(mtof(ch.r + bn), t, sd * 0.9, 0.11, { dest: out, type: 'sawtooth', filter: 'lowpass', f: 900, f2: 250, fdur: sd * 0.8, a: 0.004 });
        // 長音墊
        if (s === 0) ch.v.forEach((m, j) => {
          tone(mtof(m), t, sd * 16, 0.022, { dest: out, type: 'sawtooth', detune: -8, filter: 'lowpass', f: 1100, a: 0.25, verb: 0.4 });
          tone(mtof(m), t, sd * 16, 0.022, { dest: out, type: 'sawtooth', detune: 8, filter: 'lowpass', f: 1100, a: 0.25 });
        });
        // 琶音
        if (B) {
          const arp = ch.v.concat(ch.v.map(m => m + 12));
          tone(mtof(arp[(s * 3) % arp.length] + 12), t, sd * 0.8, 0.018, { dest: out, type: 'square', filter: 'lowpass', f: 2600, pan: Math.sin(i * 0.7) * 0.5, verb: 0.3 });
        }
        // 主旋律
        if (B) this.lead[bar % 4].forEach(([st, m, len]) => {
          if (st === s) tone(mtof(m), t, sd * len, 0.035, { dest: out, type: 'sawtooth', filter: 'lowpass', f: 2200, vib: [6, 4], a: 0.02, verb: 0.35 });
        });
        // 段落交界的上升噪音
        if (bar % 8 === 7 && s === 0) noise(t, sd * 16, 0.05, { dest: out, f: 400, f2: 6000, q: 1, a: sd * 14 });
      },
    },
    // 抽卡頁：F 利底亞的星空長音與閃爍的琶音
    gacha: {
      bpm: 60, steps: 4, bars: 8,
      chords: [[41, 53, 57, 60, 64], [43, 55, 59, 62, 66], [45, 52, 57, 60, 64], [43, 55, 59, 62, 67]],
      scale: [77, 79, 81, 83, 84, 86, 88, 89, 91, 93],
      step(t, i, sd, out) {
        const bar = Math.floor(i / 4) % this.bars, s = i % 4, ch = this.chords[Math.floor(bar / 2) % 4];
        if (s === 0 && bar % 2 === 0) ch.forEach((m, j) => tone(mtof(m), t + j * 0.05, sd * 8.5, j ? 0.02 : 0.04, { dest: out, type: j ? 'triangle' : 'sine', a: sd * 2, verb: 0.7, vib: [0.3 + j * 0.1, 1.5] }));
        const n = Math.random() < 0.65 ? 1 + (Math.random() < 0.3 ? 1 : 0) : 0;
        for (let k = 0; k < n; k++) {
          const m = this.scale[Math.floor(Math.random() * this.scale.length)];
          bell(mtof(m), t + Math.random() * sd, 1.6, rnd(0.012, 0.03), { dest: out, ratio: 2, index: 0.9, pan: rnd(-0.7, 0.7), verb: 0.8 });
        }
        if (s === 0 && bar % 4 === 0) noise(t, sd * 4, 0.012, { dest: out, f: 800, f2: 2400, q: 2, a: sd * 2, verb: 0.6 });
      },
    },
  };

  function startTrack(name) {
    const def = TRACKS[name];
    if (!def || !ctx) return;
    const bus = ctx.createGain();
    bus.connect(musicBus);
    const t = ctx.currentTime;
    bus.gain.setValueAtTime(1e-4, t);
    bus.gain.exponentialRampToValueAtTime(1, t + 1.5);
    const sd = 60 / def.bpm / (def.steps / 4);
    players.push({ name, def, bus, step: 0, next: t + 0.1, sd, stopAt: 0 });
  }
  function stopPlayers() {
    const t = ctx.currentTime;
    players.forEach(p => {
      if (p.stopAt) return;
      p.stopAt = t + 1.4;
      p.bus.gain.cancelScheduledValues(t);
      p.bus.gain.setValueAtTime(p.bus.gain.value, t);
      p.bus.gain.linearRampToValueAtTime(0, t + 1.2);
    });
  }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (let n = players.length - 1; n >= 0; n--) {
      const p = players[n];
      if (p.stopAt && now > p.stopAt) { p.bus.disconnect(); players.splice(n, 1); continue; }
      if (p.next < now - 0.2) p.next = now + 0.05;   // 分頁被凍結後回來：跳過錯過的拍子
      while (p.next < now + 0.2 && (!p.stopAt || p.next < p.stopAt)) {
        if (!pref.muted && pref.music > 0) p.def.step(p.next, p.step, p.sd, p.bus);
        p.next += p.sd; p.step++;
      }
    }
  }
  function music(name) {
    if (name === wantTrack) return;
    wantTrack = name;
    if (!ctx || ctx.state !== 'running') return;
    stopPlayers();
    if (name) startTrack(name);
  }

  function set(k, v) {
    if (k === 'muted') pref.muted = !!v;
    else pref[k] = Math.max(0, Math.min(1, +v || 0));
    savePref();
    if (ctx) {
      applyVol();
      if (!pref.muted && ctx.state !== 'running') ctx.resume();
      if (!pref.muted && wantTrack && !players.some(p => !p.stopAt)) startTrack(wantTrack);
    }
  }

  /* ================= 配音（目前以瀏覽器內建英文語音打樣） =================
   * lines = [[毫秒, 台詞]]；之後換成錄好的音檔時只要改這裡。 */
  function pickVoice(lang) {
    if (!('speechSynthesis' in window)) return null;
    const vs = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(lang));
    const male = /guy|david|mark|george|daniel|ryan|christopher|eric|male|james|brian|andrew|roger|steffan/i;
    return vs.find(v => male.test(v.name) && /natural|neural|online/i.test(v.name)) || vs.find(v => male.test(v.name)) || vs[0] || null;
  }
  if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; }
  function say(lines, k, opt) {
    opt = opt || {};
    const timers = [];
    const ok = 'speechSynthesis' in window && !pref.muted;
    if (ok) speechSynthesis.cancel();
    if (ok) lines.forEach(([ms, text, lo]) => timers.push(setTimeout(() => {
      const o = Object.assign({}, opt, lo || {});   // 每句台詞可以覆寫音高、語速（例如無線電裡的隊友）
      const v = pickVoice(o.lang || 'en');
      const u = new SpeechSynthesisUtterance(text);
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'en-US';
      u.pitch = o.pitch || 1; u.rate = (o.rate || 1) / Math.max(0.6, k || 1);
      u.volume = Math.min(1, pref.master * Math.max(0.3, pref.sfx));
      speechSynthesis.speak(u);
    }, ms * (k || 1))));
    return { cancel(hard) { timers.forEach(clearTimeout); if (hard && 'speechSynthesis' in window) speechSynthesis.cancel(); } };
  }

  return { play, ult, gacha, score, say, music, set, pref, duck, get ready() { return ready(); } };
})();
