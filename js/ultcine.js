'use strict';
/* =========================================================
 * 時序之戰 — 終結技完整演出（9.5～12 秒）
 * 以 2.5D 透視鏡頭實作：角色、敵人、道具都放在三維空間中，
 * 鏡頭可以推近、拉遠、橫移、甩鏡、翻滾，前後景自然產生視差；
 * 每段演出會叫出一名隊友協力（依隊伍自動選擇），敵人會閃避、被擊退、被冰封。
 * 畫面與聲音共用同一份時間表（cues），由 Sound.score 排程。
 *   UltCine.play(key, { enemies:[{type,name}], main, team:[key], k, onSkip }) → 演出長度（毫秒）
 * ========================================================= */

const UltCine = (() => {
  const D = () => UltFx.draw;
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a == null ? 0 : a, Math.min(b == null ? 1 : b, x));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;
  const eo = p => 1 - Math.pow(1 - p, 3);
  const eio = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const eback = p => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const bump = (t, a, w) => Math.max(0, 1 - Math.abs(t - a) / w);
  const win = (t, a, b, fi, fo) => prog(t, a, a + (fi || 200)) * (1 - prog(t, b - (fo || 250), b));   // 在 [a,b] 內淡入淡出
  let st = null;

  /* ================= 素材準備 ================= */
  /** 角色立繪 → 世界座標的看板（H = 世界高度），以臉部為錨點 */
  function prepAlly(key, H) {
    const a = Art.get(key);
    if (!a || !a.canvas) return null;
    const pxH = Math.min(a.h, 1300), sc = pxH / a.h, pxW = Math.round(a.w * sc);
    const cv = document.createElement('canvas'); cv.width = pxW; cv.height = pxH;
    const g = cv.getContext('2d');
    g.drawImage(a.canvas, 0, 0, pxW, pxH);
    g.globalCompositeOperation = 'destination-in';
    const gr = g.createLinearGradient(0, pxH * 0.62, 0, pxH * 0.97);
    gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, pxW, pxH);
    const u = H / a.h;
    return { cv, w: a.w * u, h: H, ax: a.facePx[0] * u, ay: a.facePx[1] * u };
  }
  /** 敵人剪影 → 看板（含外光與純白剪影，錨點在腳底中央） */
  function prepEnemy(type, H) {
    const a = Art.enemy(type);
    if (!a || !a.canvas) return null;
    const pad = 36, W = a.w + pad * 2, Hp = a.h + pad * 2;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hp; return c; };
    const cv = mk(), g = cv.getContext('2d');
    const [r, gg, b] = a.light;
    g.shadowColor = `rgba(${r},${gg},${b},.85)`; g.shadowBlur = 22;
    g.drawImage(a.canvas, pad, pad);
    g.shadowBlur = 0; g.drawImage(a.canvas, pad, pad);
    const white = mk(), w2 = white.getContext('2d');
    w2.drawImage(a.canvas, pad, pad);
    w2.globalCompositeOperation = 'source-in'; w2.fillStyle = '#fff'; w2.fillRect(0, 0, W, Hp);
    const u = H / a.h;
    return { cv, white, w: W * u, h: Hp * u, ax: W * u / 2, ay: (a.h + pad) * u, light: a.light };
  }

  /* ================= 鏡頭與投影 ================= */
  /** 鏡頭關鍵格：{ t, x, y, z, r, cut }；cut = 在該時間瞬間切換 */
  function camAt(keys, t) {
    if (t <= keys[0].t) return Object.assign({}, keys[0]);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t < b.t) {
        if (b.cut) return Object.assign({}, a);
        const p = (b.ease || eio)((t - a.t) / (b.t - a.t));
        return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z: lerp(a.z, b.z, p), r: lerp(a.r || 0, b.r || 0, p) };
      }
    }
    return Object.assign({}, keys[keys.length - 1]);
  }
  function P(X, Y, Z) {
    const c = st.cam, d = Z - c.z;
    if (d < 60) return null;
    const s = st.F / d;
    return { x: st.vw / 2 + (X - c.x) * s, y: st.vh / 2 + (Y - c.y) * s, s };
  }
  function shakeOf(t, events) {
    let a = 0;
    events.forEach(([t0, d, amp]) => { if (t >= t0 && t < t0 + d) a = Math.max(a, amp * (1 - (t - t0) / d)); });
    return a;
  }

  /* ================= 繪製工具（世界座標） ================= */
  function sprite(c, spr, X, Y, Z, o) {
    if (!spr) return null;
    o = o || {};
    const p = P(X, Y, Z);
    if (!p || (o.alpha != null && o.alpha <= 0.01)) return p;
    const w = spr.w * p.s * (o.scale || 1), h = spr.h * p.s * (o.scale || 1) * (o.sy || 1);
    if (p.x + w * 2 < 0 || p.x - w * 2 > st.vw || p.y - h * 2 > st.vh || p.y + h * 2 < 0) return p;
    c.save();
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    c.translate(p.x, p.y);
    if (o.rot) c.rotate(o.rot);
    if (o.flip) c.scale(-1, 1);
    const ax = spr.ax * p.s * (o.scale || 1), ay = spr.ay * p.s * (o.scale || 1) * (o.sy || 1);
    if (o.filter) c.filter = o.filter;
    c.drawImage(spr.cv, -ax, -ay, w, h);
    c.filter = 'none';
    if (o.flash > 0 && spr.white) { c.globalAlpha = Math.min(1, o.flash) * (o.alpha == null ? 1 : o.alpha); c.drawImage(spr.white, -ax, -ay, w, h); }
    c.restore();
    return p;
  }
  function glow3(c, X, Y, Z, R, col, a) { const p = P(X, Y, Z); if (p) D().glowDot(c, p.x, p.y, R * p.s, col, a); return p; }
  function blade3(c, A, B, w, fill, glow) {
    const a = P(A[0], A[1], A[2]), b = P(B[0], B[1], B[2]);
    if (!a || !b) return;
    D().blade(c, a.x, a.y, b.x, b.y, w * (a.s + b.s) / 2, fill, glow);
  }
  function line3(c, A, B, w, col, glow, alpha) {
    const a = P(A[0], A[1], A[2]), b = P(B[0], B[1], B[2]);
    if (!a || !b) return;
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.strokeStyle = col; c.lineWidth = Math.max(1, w * (a.s + b.s) / 2); c.lineCap = 'round';
    if (glow) { c.shadowColor = glow; c.shadowBlur = 14; }
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.restore();
  }
  function ring3(c, X, Y, Z, R, col, lw, a, squash) {
    const p = P(X, Y, Z);
    if (!p || a <= 0) return;
    c.save(); c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = Math.max(1, lw * p.s);
    c.beginPath(); c.ellipse(p.x, p.y, R * p.s, R * p.s * (squash || 0.28), 0, 0, TAU); c.stroke(); c.restore();
  }
  /** 沿二次曲線取點（世界座標） */
  function quad(A, C, B, u) { const v = 1 - u; return [v * v * A[0] + 2 * v * u * C[0] + u * u * B[0], v * v * A[1] + 2 * v * u * C[1] + u * u * B[1], v * v * A[2] + 2 * v * u * C[2] + u * u * B[2]]; }

  /* ================= 繪製工具（螢幕座標） ================= */
  function letterbox(c, t) {
    const h = st.vh * 0.085 * eo(prog(t, 0, 380)) * (1 - prog(t, st.dur - 500, st.dur));
    if (h <= 0) return;
    c.fillStyle = '#000'; c.fillRect(0, 0, st.vw, h); c.fillRect(0, st.vh - h, st.vw, h);
  }
  /** 底部字幕（逐字出現） */
  function subtitle(c, t, t0, t1, text, col) {
    const a = win(t, t0, t1, 150, 250);
    if (a <= 0) return;
    const n = Math.min([...text].length, Math.floor((t - t0) / 42) + 1);
    const s = [...text].slice(0, n).join('');
    c.save(); c.globalAlpha = a;
    c.font = `600 ${Math.round(st.vh * 0.03)}px ${D().SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#000'; c.shadowBlur = 8; c.fillStyle = col || '#f2f4fa';
    c.fillText(s, st.vw / 2, st.vh * 0.86);
    c.restore();
  }
  /** 對話框：跟著角色的螢幕位置 */
  function bubble(c, t, t0, t1, who, text, anchor, col) {
    const a = win(t, t0, t1, 160, 220);
    if (a <= 0 || !anchor) return;
    const n = Math.min([...text].length, Math.floor((t - t0) / 45) + 1);
    const s = [...text].slice(0, n).join('');
    const fs = Math.round(st.vh * 0.026);
    c.save(); c.globalAlpha = a;
    c.font = `600 ${fs}px ${D().SANS}`;
    const tw = Math.max(c.measureText(text).width, fs * 5) + fs * 1.6, th = fs * 2.6;
    let x = clamp(anchor.x - tw / 2, 16, st.vw - tw - 16), y = clamp(anchor.y - th - 20, st.vh * 0.1, st.vh * 0.78);
    const k = eback(prog(t, t0, t0 + 260));
    c.translate(x + tw / 2, y + th / 2); c.scale(k, k); c.translate(-(x + tw / 2), -(y + th / 2));
    c.fillStyle = 'rgba(10,12,22,.88)'; c.strokeStyle = col || '#e8c56a'; c.lineWidth = 2;
    D().roundRect(c, x, y, tw, th, 10); c.fill(); c.stroke();
    c.fillStyle = col || '#e8c56a'; c.font = `700 ${Math.round(fs * 0.72)}px ${D().SANS}`; c.textBaseline = 'top';
    c.fillText(who, x + fs * 0.8, y + fs * 0.35);
    c.fillStyle = '#f2f4fa'; c.font = `600 ${fs}px ${D().SANS}`;
    c.fillText(s, x + fs * 0.8, y + fs * 1.2);
    c.restore();
  }
  // 全畫面的色調、閃光、暗角：鏡頭翻滾時畫布是旋轉的，所以一律畫超大的矩形，避免角落露出
  const full = c => c.fillRect(-st.vw, -st.vh, st.vw * 3, st.vh * 3);
  function grade(c, col, a) { if (a <= 0) return; c.save(); c.globalAlpha = a; c.fillStyle = col; full(c); c.restore(); }
  function flash(c, col, a) { if (a <= 0) return; c.save(); c.globalAlpha = Math.min(1, a); c.fillStyle = col; full(c); c.restore(); }
  function desaturate(c, a) { if (a <= 0) return; c.save(); c.globalCompositeOperation = 'saturation'; c.globalAlpha = a; c.fillStyle = '#808080'; full(c); c.restore(); }
  function vignette(c, col, a) {
    const g = c.createRadialGradient(st.vw / 2, st.vh / 2, Math.min(st.vw, st.vh) * 0.3, st.vw / 2, st.vh / 2, Math.max(st.vw, st.vh) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
    c.save(); c.globalAlpha = a; c.fillStyle = g; full(c); c.restore();
  }
  function speedLines(c, t, a, col, dir) {
    if (a <= 0) return;
    c.save(); c.globalAlpha = a; c.strokeStyle = col;
    st.lines.forEach(l => {
      const span = st.vw + l.len;
      let x = ((t * l.v + l.o) % span) - l.len;
      if (dir < 0) x = st.vw - x - l.len;
      c.lineWidth = l.w; c.beginPath(); c.moveTo(x, l.y); c.lineTo(x + l.len, l.y); c.stroke();
    });
    c.restore();
  }
  function rain(c, t, a, col) {
    if (a <= 0) return;
    c.save(); c.globalAlpha = a; c.strokeStyle = col || 'rgba(170,190,230,.5)'; c.lineWidth = 1;
    st.rain.forEach(r => {
      const y = ((t * r.v + r.o) % (st.vh + 80)) - 40, x = (r.x + y * 0.18) % st.vw;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - r.l * 0.18, y - r.l); c.stroke();
    });
    c.restore();
  }
  function screenParticles(c, list, t, t0, cx, cy, col, grav, life) {
    const dt = (t - t0) / 1000;
    if (dt < 0 || dt * 1000 > life) return;
    c.save();
    list.forEach(p => {
      const x = cx + Math.cos(p.a) * p.v * dt, y = cy + Math.sin(p.a) * p.v * dt + grav * dt * dt;
      c.globalAlpha = Math.max(0, 1 - dt * 1000 / life);
      c.fillStyle = typeof col === 'function' ? col(p) : col;
      c.translate(x, y); c.rotate(p.r * dt);
      c.beginPath(); c.moveTo(0, -p.s); c.lineTo(p.s * 0.55, p.s * 0.4); c.lineTo(-p.s * 0.5, p.s * 0.3); c.closePath(); c.fill();
      c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    });
    c.restore();
  }
  function bigTitle(c, t, t0, t1, lines, x, y, size, fill, glow) {
    const a = win(t, t0, t1, 120, 300);
    if (a <= 0) return;
    lines.forEach((ln, i) => D().title(c, ln.text, x + (ln.indent || 0) * size, y + i * size * 1.2, size * (ln.k || 1), {
      t, start: t0 + 80 + i * 260, per: 55, align: ln.align || 'left', alpha: a, glow: ln.glow || glow, fill: ln.fill || fill, rot: ln.rot }));
  }

  /* ================= 場景共用：佈局、敵人、隊友協力 ================= */
  const ALLY_POS = { X: -380, Y: -160, Z: 520 };
  const PARTNER_POS = { X: -840, Y: -110, Z: 380 };
  const GROUND = 330;
  function layout(s, o) {
    s.actor = { key: o.key, spr: prepAlly(o.key, 1400), X: ALLY_POS.X, Y: ALLY_POS.Y, Z: ALLY_POS.Z };
    const list = (o.enemies && o.enemies.length ? o.enemies : [{ type: 'thug', name: '敵人' }]).slice(0, 5);
    const n = list.length;
    s.en = list.map((e, i) => {
      const H = e.type === 'boss' ? 700 : e.type === 'guard' ? 600 : 540;
      return { type: e.type, name: e.name, phase2: !!e.phase2, H, spr: prepEnemy(e, H), X: 540 + (i - (n - 1) / 2) * 310, Y: GROUND, Z: 1500 + (i % 2) * 90,
        kx: 0, ky: 0, rot: 0, flash: 0, alpha: 1, frozen: 0, wet: 0, ph: i * 1.7 };
    });
    s.mi = Math.max(0, list.findIndex(e => e.main));
    s.M = s.en[s.mi];
    s.chest = e => [e.X + e.kx, e.Y - e.H * 0.55 + e.ky, e.Z];
    const R = s.R;
    s.lines = Array.from({ length: 34 }, () => ({ y: R() * s.vh, v: 1.4 + R() * 2.6, o: R() * 3000, len: 90 + R() * 280, w: 0.6 + R() * 1.8 }));
    s.rain = Array.from({ length: 140 }, () => ({ x: R() * s.vw, o: R() * 2000, v: 0.9 + R() * 0.8, l: 14 + R() * 26 }));
    // 協力的隊友：依場景偏好挑一位在場的隊友
    const team = (o.team || []).filter(k => k !== o.key);
    const pk = (s.sc.prefs || []).find(k => team.includes(k)) || null;
    s.partner = pk ? { key: pk, spr: prepAlly(pk, 1250), X: PARTNER_POS.X, Y: PARTNER_POS.Y, Z: PARTNER_POS.Z } : null;
    s.line = (LINES[o.key] || {})[pk] || null;
    s.solo = (LINES[o.key] || {}).solo;
    // 背景：戰場畫布的快照，放在很遠的平面上
    const src = document.querySelector('.st-canvas');
    const bg = document.createElement('canvas');
    bg.width = Math.max(2, Math.round(s.vw)); bg.height = Math.max(2, Math.round(s.vh));
    const bgc = bg.getContext('2d');
    try { if (src && src.width) bgc.drawImage(src, 0, 0, bg.width, bg.height); else throw 0; }
    catch (e) { const g = bgc.createLinearGradient(0, 0, 0, bg.height); g.addColorStop(0, '#0a0d1c'); g.addColorStop(1, '#171022'); bgc.fillStyle = g; bgc.fillRect(0, 0, bg.width, bg.height); }
    s.bg = bg;
    const s0 = s.F / (6000 + 620);
    s.bgW = s.vw / s0 * 1.4; s.bgH = s.vh / s0 * 1.4;
  }
  function drawBG(c, dim) {
    const p = P(180, -10, 6000);
    if (p) c.drawImage(st.bg, p.x - st.bgW * p.s / 2, p.y - st.bgH * p.s / 2, st.bgW * p.s, st.bgH * p.s);
    grade(c, '#000', dim == null ? 0.45 : dim);
  }
  function drawEnemies(c, t, o) {
    o = o || {};
    const list = st.en.map((e, i) => ({ e, i })).sort((a, b) => b.e.Z - a.e.Z);
    list.forEach(({ e, i }) => {
      if (e.alpha <= 0.01) return;
      const br = 1 + 0.012 * Math.sin(t * 0.003 + e.ph);
      const X = e.X + e.kx, Y = e.Y + e.ky;
      // 腳下陰影
      const f = P(X, e.Y, e.Z);
      if (f) { c.save(); c.globalAlpha = 0.5 * e.alpha; c.fillStyle = '#000'; c.beginPath(); c.ellipse(f.x, f.y, 120 * f.s, 26 * f.s, 0, 0, TAU); c.fill(); c.restore(); }
      const dim = o.focus != null && o.focus !== i ? o.dimOthers || 0.35 : 1;
      if (e.spr) sprite(c, e.spr, X, Y, e.Z, { sy: br, rot: e.rot, alpha: e.alpha * dim, flash: e.flash, filter: e.wet > 0 ? `saturate(${1 - e.wet * 0.5}) hue-rotate(${-e.wet * 30}deg) brightness(${1 + e.wet * 0.2})` : null });
      else glow3(c, X, Y - e.H * 0.5, e.Z, e.H * 0.4, 'rgba(0,0,0,.9)', e.alpha * dim);
      if (e.frozen > 0) iceBlock(c, e, e.frozen, t);
    });
  }
  function iceBlock(c, e, a, t) {
    const pts = [[-170, 20], [-190, -e.H * 0.6], [-120, -e.H - 60], [60, -e.H - 90], [180, -e.H * 0.7], [160, 30]];
    const pp = pts.map(([dx, dy]) => P(e.X + e.kx + dx * a, e.Y + dy * a, e.Z - 40)).filter(Boolean);
    if (pp.length < 3) return;
    c.save();
    c.globalAlpha = 0.55 * Math.min(1, a);
    const g = c.createLinearGradient(pp[0].x, pp[2].y, pp[4].x, pp[0].y);
    g.addColorStop(0, 'rgba(230,248,255,.9)'); g.addColorStop(0.5, 'rgba(120,200,255,.35)'); g.addColorStop(1, 'rgba(200,240,255,.8)');
    c.fillStyle = g; c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5;
    c.beginPath(); pp.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill(); c.stroke();
    c.globalAlpha = 0.7 * Math.min(1, a); c.beginPath(); c.moveTo(pp[1].x, pp[1].y); c.lineTo(pp[3].x, pp[3].y); c.moveTo(pp[2].x, pp[2].y); c.lineTo(pp[4].x, pp[4].y); c.stroke();
    c.restore();
  }
  function drawActor(c, o) { const a = st.actor; return sprite(c, a.spr, a.X + (o && o.dx || 0), a.Y + (o && o.dy || 0), a.Z + (o && o.dz || 0), o); }

  /** 隊友協力：從側邊滑入 → 說出台詞 → 發出協力效果 → 主角回應 */
  const ASSIST_COL = { kane: '#9fd0ff', mocha: '#bfefff', longzhao: '#ff5a5a', alan: '#ffab4a' };
  function partnerBeat(c, t, t0, target) {
    const pa = st.partner;
    if (!pa) {
      const ap = P(st.actor.X, st.actor.Y, st.actor.Z);
      bubble(c, t, t0 + 200, t0 + 1300, CHARS_NAME[st.actor.key], st.solo || '', ap, ASSIST_COL[st.actor.key]);
      return;
    }
    const inP = eo(prog(t, t0, t0 + 420)), outP = eio(prog(t, t0 + 1250, t0 + 1450));
    const X = lerp(pa.X - 500, pa.X, inP) - outP * 300;
    const p = sprite(c, pa.spr, X, pa.Y, pa.Z, { alpha: inP * (1 - outP) });
    const [say, reply] = st.line || ['', ''];
    bubble(c, t, t0 + 180, t0 + 1250, CHARS_NAME[pa.key], say, p, ASSIST_COL[pa.key]);
    // 協力效果：從隊友飛向目標（主角或敵人）
    const from = [X + 120, pa.Y + 60, pa.Z], to = target || [st.actor.X, st.actor.Y + 120, st.actor.Z];
    const u = eio(prog(t, t0 + 650, t0 + 1100));
    if (u > 0 && u < 1) {
      const mid = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 260, (from[2] + to[2]) / 2];
      const q = quad(from, mid, to, u), q2 = quad(from, mid, to, Math.max(0, u - 0.12));
      assistFx(c, pa.key, q, q2, t);
    }
    if (u >= 1) glow3(c, to[0], to[1], to[2], 220, ASSIST_COL[pa.key], (1 - prog(t, t0 + 1100, t0 + 1500)) * 0.8);
    if (reply) bubble(c, t, t0 + 1150, t0 + 1650, CHARS_NAME[st.actor.key], reply, P(st.actor.X, st.actor.Y, st.actor.Z), ASSIST_COL[st.actor.key]);
  }
  function assistFx(c, key, q, q2, t) {
    const p = P(q[0], q[1], q[2]);
    if (!p) return;
    const col = ASSIST_COL[key];
    line3(c, q2, q, 10, col, col, 0.8);
    c.save(); c.translate(p.x, p.y); c.rotate(t * 0.02);
    const s = p.s;
    if (key === 'mocha') {            // 資料夾
      c.fillStyle = '#f4f2ea'; c.fillRect(-60 * s, -44 * s, 120 * s, 88 * s);
      c.fillStyle = '#c9a44e'; c.fillRect(-60 * s, -44 * s, 120 * s, 14 * s);
      c.fillStyle = 'rgba(40,44,60,.5)'; for (let i = 0; i < 4; i++) c.fillRect(-48 * s, (-20 + i * 14) * s, 90 * s, 4 * s);
    } else if (key === 'longzhao') {  // 籌碼
      c.fillStyle = '#c41e2c'; c.beginPath(); c.arc(0, 0, 40 * s, 0, TAU); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 8 * s; c.setLineDash([10 * s, 10 * s]); c.beginPath(); c.arc(0, 0, 32 * s, 0, TAU); c.stroke();
    } else if (key === 'alan') {      // 燃燒彈頭
      D().glowDot(c, 0, 0, 90 * s, 'rgba(255,170,70,.9)', 1);
      c.fillStyle = '#fff4d8'; c.beginPath(); c.arc(0, 0, 14 * s, 0, TAU); c.fill();
    } else {                          // 凱恩：放大鏡的光
      c.strokeStyle = '#c9a45a'; c.lineWidth = 9 * s; c.beginPath(); c.arc(0, 0, 50 * s, 0, TAU); c.stroke();
      D().glowDot(c, 0, 0, 70 * s, 'rgba(170,215,255,.7)', 1);
    }
    c.restore();
  }
  const CHARS_NAME = { kane: '凱恩', longzhao: '龍爪', mocha: '莫卡兄弟', alan: '阿蘭' };
  // 協力台詞：[隊友的台詞, 主角的回應]；solo = 沒有隊友時主角自己的台詞
  const LINES = {
    kane: { mocha: ['委託人的資料，全在這裡了。', '收到。'], alan: ['照明彈——給你看清楚。', '謝了。'], longzhao: ['押你贏，別讓我輸錢。', '賭注成立。'], solo: '不需要幫手，證據已經夠了。' },
    longzhao: { mocha: ['籌碼，我們代墊。', '記帳上。'], kane: ['莊家的底牌……我看穿了。', '那就開牌。'], alan: ['牌桌我幫你看著。', '夠意思。'], solo: '這一桌，我一個人就夠了。' },
    mocha: { kane: ['條款第七條——你們違約了。', '收到……吧？'], alan: ['要幫忙嗎？', '不用……大概。'], longzhao: ['欠的帳，連本帶利。', '我們會處理……吧。'], solo: '交給我們。……應該。' },
    alan: { kane: ['目標座標，已確認。', '收到，準備射擊。'], longzhao: ['開槍，別讓我等。', '安靜。'], mocha: ['燃燒彈的費用已入帳。', '……回頭再算。'], solo: '風向、距離……確認。' },
  };
  const ASSIST_CUE = { mocha: 'paper', alan: 'flare', longzhao: 'chips', kane: 'beam' };

  /* =========================================================
   * 凱恩「結案」（10.5 秒）
   * 冷開場：雨夜中的特寫與快門 → 甩鏡到敵人，證據照片與紅線 → 隊友協力 → 仰角標題
   * → 俯衝鎖定嫌疑人 → 蓋章、時間凍結、玻璃裂痕 → 疾衝十字斬、碎裂擊退 → 拉遠收尾
   * ========================================================= */
  const KANE = {
    dur: 10500, prefs: ['mocha', 'alan', 'longzhao'],
    setup(s) {
      const R = s.R;
      s.photos = s.en.map((e, i) => ({ e, t: 1650 + i * 130, rot: (R() - 0.5) * 0.5, kind: i % 3 }));
      s.cracks = Array.from({ length: 22 }, (_, i) => {
        const a = i / 22 * TAU + R() * 0.25, len = 120 + R() * Math.max(s.vw, s.vh) * 0.6, seg = [];
        let x = 0, y = 0;
        for (let j = 0; j < 8; j++) { const aa = a + (R() - 0.5) * 0.5; x += Math.cos(aa) * len / 8; y += Math.sin(aa) * len / 8; seg.push([x, y]); }
        return seg;
      });
      s.shards = Array.from({ length: 70 }, () => ({ a: R() * TAU, v: 300 + R() * 1400, r: (R() - 0.5) * 14, s: 8 + R() * 30 }));
      s.ink = Array.from({ length: 22 }, () => ({ a: R() * TAU, d: 60 + R() * 160, r: 3 + R() * 10 }));
    },
    cam(s) {
      const M = s.M, A = ALLY_POS;
      return [
        { t: 0, x: A.X + 40, y: A.Y - 10, z: A.Z - 560, r: 0.02 },
        { t: 1300, x: A.X + 20, y: A.Y - 5, z: A.Z - 480, r: 0 },
        { t: 1400, x: -80, y: -40, z: -220, r: -0.06, cut: true },
        { t: 2500, x: M.X - 60, y: M.Y - 300, z: M.Z - 1200, r: 0.03 },
        { t: 2750, x: M.X - 70, y: M.Y - 305, z: M.Z - 1170, r: 0.03 },
        { t: 3200, x: -160, y: -50, z: -780, r: 0 },
        { t: 4250, x: -220, y: -60, z: -720, r: 0 },
        { t: 4300, x: A.X + 320, y: A.Y + 110, z: A.Z - 640, r: -0.07, cut: true },
        { t: 5600, x: A.X + 290, y: A.Y + 80, z: A.Z - 560, r: -0.03 },
        { t: 6200, x: M.X, y: M.Y - 250, z: M.Z - 780, r: 0 },
        { t: 7000, x: M.X, y: M.Y - 255, z: M.Z - 640, r: 0.02 },
        { t: 7650, x: M.X, y: M.Y - 255, z: M.Z - 620, r: 0.02 },
        { t: 8150, x: M.X - 500, y: M.Y - 220, z: M.Z - 1200, r: -0.09 },
        { t: 8700, x: M.X + 120, y: M.Y - 260, z: M.Z - 1300, r: 0.05 },
        { t: 9500, x: M.X + 220, y: M.Y - 300, z: M.Z - 1550, r: 0.02 },
        { t: 10500, x: M.X + 200, y: M.Y - 300, z: M.Z - 1750, r: 0 },
      ];
    },
    shake: [[7000, 200, 22], [8350, 160, 16], [8480, 160, 16], [8620, 500, 30]],
    score(s) {
      return {
        cues: [[0, 'rumble', { dur: 1.4, vol: 0.12 }], [200, 'blip', { n: 16, pitch: 0.9 }], [500, 'shutter'], [850, 'shutter'], [1400, 'whoosh', { dur: 0.5 }],
          ...s.photos.map(p => [p.t, 'shutter']), [2000, 'laser'],
          [3000, 'whoosh', { pan: -0.5, dur: 0.4 }], [3200, 'blip', { n: 12, pitch: 0.95 }], [3850, s.partner ? ASSIST_CUE[s.partner.key] : 'chime'], [4350, 'blip', { n: 4, pitch: 0.8 }],
          [4300, 'sting', { notes: [40, 47, 52, 55] }], [4650, 'chime', { notes: [83, 86, 90] }], [5650, 'whoosh', { dur: 0.6 }], [5900, 'heartbeat'], [6450, 'heartbeat'],
          [6300, 'scope'], [6900, 'scope'], [7000, 'stamp'], [7650, 'crack'], [8050, 'whoosh', { dur: 0.35, pan: 0.6 }], [8350, 'swish', { pan: -0.4 }], [8480, 'swish', { pan: 0.4 }],
          [8620, 'glass', { vol: 0.75, n: 32 }], [8630, 'impact', { vol: 0.9 }], [9500, 'sting', { notes: [40, 47, 52, 59], dur: 2.2 }]],
        bed: [[0, [28, 40, 47]], [2800, [33, 40, 45]], [4300, [28, 40, 47, 52]], [5700, [29, 41, 48]], [7000, [28, 35, 40]], [9500, [28, 40, 47, 52, 59]]],
      };
    },
    draw(c, t, s) {
      const M = s.M, mc = s.chest(M);
      // 敵人狀態
      s.en.forEach((e, i) => {
        const main = i === s.mi;
        const photo = s.photos[i];
        e.kx = -14 * bump(t, photo.t + 80, 160);
        const kb = eo(prog(t, 8620, 9100));
        e.kx += kb * (main ? 150 : 70) * (i >= s.mi ? 1 : -1);
        e.rot = kb * (main ? 0.32 : 0.14) * (i >= s.mi ? 1 : -1);
        e.flash = main ? 0.9 * bump(t, 8650, 250) + 0.5 * bump(t, 7020, 150) : 0.4 * bump(t, 8700, 250);
      });
      drawBG(c, 0.5);
      grade(c, 'rgb(12,24,52)', 0.35);
      const freeze = win(t, 7050, 8650, 80, 150);
      drawEnemies(c, t, { focus: t > 5800 && t < 7700 ? s.mi : null, dimOthers: 0.3 });
      // 證據照片與紅線
      const pa = t < 4300 ? 1 - prog(t, 4150, 4300) : t < 5600 ? 0 : prog(t, 5650, 5900) * (1 - prog(t, 7000, 7300));
      s.photos.forEach((ph, i) => {
        const e = ph.e, sp = prog(t, ph.t, ph.t + 220);
        if (sp <= 0 || pa <= 0) return;
        const pos = [e.X + e.kx, e.Y - e.H - 80, e.Z - 20];
        const lp = eo(prog(t, 2000 + i * 70, 2500 + i * 70));
        if (lp > 0) {
          const end = [lerp(pos[0], mc[0], lp), lerp(pos[1], mc[1], lp), lerp(pos[2], mc[2], lp)];
          line3(c, pos, end, 5, '#e02a36', 'rgba(255,40,50,.8)', pa);
        }
        const p = P(...pos);
        if (!p) return;
        c.save(); c.globalAlpha = pa; c.translate(p.x, p.y); c.rotate(ph.rot); const k = eback(sp) * p.s * 1.6; c.scale(k, k);
        c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 14;
        c.fillStyle = '#f2efe6'; c.fillRect(-44, -52, 88, 104); c.shadowBlur = 0;
        const g = c.createLinearGradient(0, -44, 0, 30); g.addColorStop(0, '#39455e'); g.addColorStop(1, '#141a28');
        c.fillStyle = g; c.fillRect(-37, -44, 74, 72);
        c.fillStyle = 'rgba(10,12,20,.9)'; c.beginPath(); c.arc(0, -16, 11, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(-24, 28); c.quadraticCurveTo(0, -6, 24, 28); c.fill();
        c.fillStyle = '#e02a36'; c.font = `900 22px ${D().SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(['?', '!', '✕'][ph.kind], 22, -30);
        c.fillStyle = '#c21d2a'; c.beginPath(); c.arc(0, -46, 5, 0, TAU); c.fill();
        c.restore();
      });
      // 凱恩：一開始在左前方；疾衝後出現在敵人身前
      const dash = prog(t, 8050, 8450);
      if (t < 8050) drawActor(c);
      else if (t < 8500) {
        for (let k = 5; k >= 0; k--) {
          const u = clamp(dash - k * 0.07);
          const X = lerp(ALLY_POS.X, M.X + 430, eio(u)), Z = lerp(ALLY_POS.Z, M.Z - 380, eio(u));
          sprite(c, s.actor.spr, X, ALLY_POS.Y + 40, Z, { alpha: k ? 0.18 * (1 - k / 6) : 1, filter: k ? 'brightness(1.8) saturate(0)' : null });
        }
      } else sprite(c, s.actor.spr, M.X + 430, ALLY_POS.Y + 130, M.Z - 380, { flip: true, alpha: 1 });
      // 十字斬
      [[8350, -0.6], [8480, 0.6]].forEach(([t0, ang]) => {
        const p = eo(prog(t, t0, t0 + 90)), w = 34 * (1 - prog(t, t0 + 90, t0 + 480));
        if (p <= 0 || w <= 0) return;
        const L = 1300, dx = Math.cos(ang), dy = Math.sin(ang);
        const a = [mc[0] - dx * L, mc[1] - dy * L, mc[2] - 30];
        blade3(c, a, [a[0] + dx * 2 * L * p, a[1] + dy * 2 * L * p, mc[2] - 30], w, '#ffffff', '#8fb8ff');
      });
      desaturate(c, freeze * 0.85);
      grade(c, 'rgb(150,190,255)', freeze * 0.12);
      // 蓋章「結案」（貼在嫌疑人身上）
      if (t >= 7000 && t < 8650) {
        const p = P(mc[0], mc[1], mc[2] - 40);
        if (p) {
          const sp = prog(t, 7000, 7080), k = lerp(3, 1, eo(sp)) * p.s * 1.7;
          c.save(); c.globalAlpha = Math.min(1, sp * 3) * (1 - prog(t, 8500, 8650)); c.translate(p.x, p.y); c.rotate(-0.2); c.scale(k, k);
          c.strokeStyle = '#d4202e'; c.fillStyle = '#d4202e'; c.shadowColor = 'rgba(255,40,50,.6)'; c.shadowBlur = 10;
          c.lineWidth = 6; D().roundRect(c, -95, -48, 190, 96, 10); c.stroke();
          c.lineWidth = 2; D().roundRect(c, -84, -38, 168, 76, 6); c.stroke();
          c.font = `900 58px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('結案', 0, 2);
          c.restore();
          const q = eo(prog(t, 7080, 7250));
          c.save(); c.fillStyle = '#c01826'; c.globalAlpha = 1 - prog(t, 8500, 8650);
          s.ink.forEach(d => { c.beginPath(); c.arc(p.x + Math.cos(d.a) * d.d * q * p.s * 1.7, p.y + Math.sin(d.a) * d.d * q * p.s * 1.2, d.r * p.s * 1.5, 0, TAU); c.fill(); });
          c.restore();
        }
      }
      // 隊友協力（寬鏡頭）
      if (t > 3000 && t < 4800) partnerBeat(c, t, 3000, s.partner && s.partner.key === 'alan' ? mc : null);
      // 螢幕層
      rain(c, t, (1 - prog(t, 4000, 4400)) * 0.8 + prog(t, 9400, 9800) * 0.6);
      speedLines(c, t, 0.4 * win(t, 1400, 2400) + 0.5 * win(t, 8000, 8600, 60, 150), 'rgba(190,215,255,.7)', 1);
      flash(c, '#ffffff', 0.55 * bump(t, 510, 110) + 0.45 * bump(t, 860, 110) + 0.3 * bump(t, 4650, 200) + 0.7 * bump(t, 8630, 260));
      subtitle(c, t, 200, 1350, '……所有的線索，都指向同一個答案。');
      bigTitle(c, t, 4300, 5700, [{ text: '結案', k: 1 }], st.vw * 0.62, st.vh * 0.46, st.vh * 0.2, { grad: [[0, '#ffffff'], [1, '#b8cdf5']] }, 'rgba(160,200,255,.8)');
      if (t > 4400 && t < 5700) {
        const a = win(t, 4550, 5700, 200, 300);
        D().label(c, 'C A S E   C L O S E D', st.vw * 0.62, st.vh * 0.64, st.vh * 0.026, '#dfe8ff', a, 'left');
        D().label(c, '凱恩', st.vw * 0.62, st.vh * 0.3, st.vh * 0.03, '#9fb6e0', a, 'left');
      }
      // 放大鏡鎖定
      const la = win(t, 5750, 7050, 250, 150);
      if (la > 0) {
        const p = P(...mc);
        if (p) {
          const r = lerp(st.vh * 0.4, st.vh * 0.2, eio(prog(t, 5750, 6900)));
          c.save(); c.globalAlpha = la;
          c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.rect(0, 0, st.vw, st.vh); c.arc(p.x, p.y, r, 0, TAU, true); c.fill();
          c.strokeStyle = '#c9a45a'; c.lineWidth = 12; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
          c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 4; c.beginPath(); c.arc(p.x, p.y, r * 0.86, -2.4, -1.7); c.stroke();
          const rr = lerp(r * 0.8, r * 0.3, eo(prog(t, 6300, 6900)));
          c.strokeStyle = '#ff3440'; c.lineWidth = 3; c.shadowColor = '#ff3440'; c.shadowBlur = 12;
          c.beginPath(); c.arc(p.x, p.y, rr, 0, TAU); c.stroke();
          for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + t * 0.002; c.beginPath(); c.moveTo(p.x + Math.cos(a) * (rr + 8), p.y + Math.sin(a) * (rr + 8)); c.lineTo(p.x + Math.cos(a) * (rr + 34), p.y + Math.sin(a) * (rr + 34)); c.stroke(); }
          c.restore();
          D().label(c, `嫌疑人鎖定：${M.name}`, p.x, p.y + r + 30, st.vh * 0.024, '#ff8a90', la * prog(t, 6800, 6950), 'center');
        }
      }
      // 玻璃裂痕與碎片
      const cp = eo(prog(t, 7650, 7850));
      const sp0 = P(...mc);
      if (cp > 0 && t < 8650 && sp0) {
        c.save(); c.strokeStyle = 'rgba(235,245,255,.95)'; c.lineWidth = 1.8; c.shadowColor = '#9cc4ff'; c.shadowBlur = 6;
        c.translate(sp0.x, sp0.y);
        s.cracks.forEach(seg => { const n = seg.length * cp; c.beginPath(); c.moveTo(0, 0); for (let j = 0; j < n; j++) c.lineTo(seg[j][0], seg[j][1]); c.stroke(); });
        c.restore();
      }
      if (sp0) screenParticles(c, s.shards, t, 8620, sp0.x, sp0.y, 'rgba(210,230,255,.85)', 600, 1100);
      subtitle(c, t, 9700, 10400, '結案。', '#dfe8ff');
      vignette(c, 'rgba(0,0,10,.9)', 0.75);
    },
  };

  /* =========================================================
   * 龍爪「贏家奠定規則，輸家失去所有」（11 秒）
   * 賭桌輪盤的俯角特寫、撲克牌迎面飛來 → 升鏡揭露龍爪 → 隊友協力 → 滾珠落格 ALL IN
   * → 標題 → 機械義肢蓄力 → 甩鏡三道巨爪（鏡頭隨爪痕翻滾）→ 血雨慢鏡 → 特寫收尾
   * ========================================================= */
  const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', 'K', 'Q', 'J', '10', '9'];
  const LONGZHAO = {
    dur: 11000, prefs: ['mocha', 'kane', 'alan'],
    setup(s) {
      const R = s.R;
      s.wheel = { X: 180, Y: GROUND + 40, Z: 1050, R: 360 };
      s.cards = Array.from({ length: 46 }, () => ({ X: -600 + R() * 1500, Y: -500 + R() * 800, Z0: 1400 + R() * 2600, v: 1.3 + R() * 1.8, rot: R() * TAU, vr: (R() - 0.5) * 8, suit: Math.floor(R() * 4), rank: RANKS[Math.floor(R() * 6)], t: R() * 900 }));
      s.chips = Array.from({ length: 60 }, () => ({ x: R() * s.vw, y: -60 - R() * s.vh, v: 300 + R() * 500, r: 10 + R() * 14, col: ['#c41e2c', '#1b1b22', '#d8b34a', '#e8e4da'][Math.floor(R() * 4)], ph: R() * 6 }));
      s.sparks = Array.from({ length: 60 }, () => ({ a: R() * TAU, d: 200 + R() * 500, t: R() }));
      s.blood = s.en.map(() => Array.from({ length: 40 }, () => ({ a: -Math.PI / 2 + (R() - 0.5) * 2.8, v: 300 + R() * 900, r: 3 + R() * 9, d: R() * 150 })));
      const c0 = s.en.reduce((a, e) => [a[0] + e.X / s.en.length, a[1] + (e.Y - e.H * 0.55) / s.en.length, a[2] + e.Z / s.en.length], [0, 0, 0]);
      s.c0 = c0;
      s.claws = [[-0.5, -150, 7650], [-0.3, 0, 7900], [-0.7, 150, 8150]].map(([ang, off, t0]) => {
        const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, L = 1500;
        return { t0, f: [-44, 0, 44].map(o => [[c0[0] + nx * (off + o) - dx * L, c0[1] + ny * (off + o) - dy * L, c0[2] - 150], [c0[0] + nx * (off + o) + dx * L, c0[1] + ny * (off + o) + dy * L, c0[2] - 150]]) };
      });
    },
    cam(s) {
      const W = s.wheel, A = ALLY_POS, c0 = s.c0;
      return [
        { t: 0, x: W.X, y: W.Y - 150, z: W.Z - 660, r: 0.16 },
        { t: 1550, x: W.X + 40, y: W.Y - 130, z: W.Z - 600, r: -0.06 },
        { t: 1600, x: -160, y: -80, z: -560, r: 0, cut: true },
        { t: 2950, x: -230, y: -95, z: -430, r: 0 },
        { t: 3300, x: -460, y: -60, z: -860, r: 0 },
        { t: 4450, x: -420, y: -60, z: -820, r: 0 },
        { t: 4800, x: W.X, y: W.Y - 170, z: W.Z - 720, r: 0.1 },
        { t: 5650, x: W.X, y: W.Y - 160, z: W.Z - 660, r: 0.02 },
        { t: 5700, x: A.X + 330, y: A.Y + 40, z: A.Z - 700, r: -0.03, cut: true },
        { t: 6400, x: A.X + 300, y: A.Y + 120, z: A.Z - 640, r: -0.02 },
        { t: 7300, x: A.X + 430, y: A.Y + 380, z: A.Z - 470, r: -0.06 },
        { t: 7550, x: c0[0] - 50, y: c0[1] - 20, z: c0[2] - 1250, r: 0.08, ease: eo },
        { t: 7800, x: c0[0] - 20, y: c0[1] - 20, z: c0[2] - 1150, r: -0.07 },
        { t: 8050, x: c0[0] + 20, y: c0[1] - 20, z: c0[2] - 1080, r: 0.08 },
        { t: 8300, x: c0[0], y: c0[1] - 30, z: c0[2] - 1050, r: -0.03 },
        { t: 10000, x: c0[0], y: c0[1] - 40, z: c0[2] - 900, r: 0 },
        { t: 10100, x: A.X + 30, y: A.Y - 10, z: A.Z - 520, r: 0.03, cut: true },
        { t: 11000, x: A.X + 25, y: A.Y - 8, z: A.Z - 460, r: 0 },
      ];
    },
    shake: [[5400, 200, 10], [7650, 180, 22], [7900, 180, 24], [8150, 300, 30], [8800, 400, 10]],
    score(s) {
      return {
        cues: [[0, 'ticks', { dur: 1.5, gap: 0.03, slow: 1.05 }], [0, 'cards', { n: 22 }], [300, 'riser', { dur: 1.2, vol: 0.1 }], [1600, 'whoosh'], [1800, 'blip', { n: 14, pitch: 0.85 }],
          [3100, 'whoosh', { pan: -0.5, dur: 0.4 }], [3300, 'blip', { n: 8 }], [3850, s.partner ? ASSIST_CUE[s.partner.key] : 'chips'], [4250, 'blip', { n: 4, pitch: 0.8 }],
          [4550, 'ticks', { dur: 0.85, gap: 0.06, slow: 1.14 }], [5400, 'sting', { notes: [38, 45, 50, 53] }], [5420, 'chips', { n: 22 }],
          [5700, 'sting', { notes: [38, 45, 50, 54], dur: 1.4 }], [6400, 'riser', { dur: 1.1, vol: 0.22 }], [6500, 'rumble', { dur: 1, vol: 0.2 }],
          [7650, 'claw', { pan: -0.4 }], [7900, 'claw', { pan: 0.1 }], [8150, 'claw', { pan: 0.5 }], [8170, 'impact'], [8800, 'blood'], [9050, 'blood'],
          [10100, 'chips', { n: 34 }], [10100, 'sting', { notes: [50, 53, 57, 62], dur: 2 }]],
        bed: [[0, [26, 38, 45]], [1600, [26, 38, 45, 50]], [4500, [31, 43, 50]], [5700, [26, 38, 45, 53]], [7500, [25, 37, 44]], [8800, [26, 38, 45, 50]], [10100, [26, 38, 45, 53, 57]]],
      };
    },
    draw(c, t, s) {
      const W = s.wheel;
      s.en.forEach((e, i) => {
        e.kx = -40 * eo(prog(t, 6500, 7200)) * (1 - prog(t, 7600, 7700));
        const hits = s.claws.filter(cl => t > cl.t0).length;
        e.kx += hits * 45 * (i % 2 ? 1 : -1) * eo(prog(t, 7650, 8400));
        e.rot = hits * 0.07 * (i % 2 ? 1 : -1);
        e.flash = s.claws.reduce((a, cl) => a + 0.7 * bump(t, cl.t0 + 40, 140), 0);
        e.ky = 30 * eo(prog(t, 8900, 9800));
      });
      drawBG(c, 0.6);
      grade(c, 'rgb(60,4,12)', 0.35);
      drawEnemies(c, t);
      // 輪盤（平躺在桌面上的圓盤）
      const wa = 1 - prog(t, 6300, 6800);
      const wp = P(W.X, W.Y, W.Z);
      if (wp && wa > 0) {
        const rot = 16 * eo(prog(t, 0, 5300)), R = W.R * wp.s, sq = 0.42;
        c.save(); c.globalAlpha = wa; c.translate(wp.x, wp.y); c.scale(1, sq); c.rotate(rot);
        c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 30;
        for (let i = 0; i < 37; i++) {
          c.fillStyle = i === 0 ? '#0d5b30' : i % 2 ? '#8a0d1a' : '#111116';
          c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, i / 37 * TAU, (i + 1) / 37 * TAU); c.closePath(); c.fill();
        }
        c.shadowBlur = 0;
        c.strokeStyle = '#d8b04a'; c.lineWidth = 8 * wp.s; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
        c.fillStyle = '#1a0a0c'; c.beginPath(); c.arc(0, 0, R * 0.6, 0, TAU); c.fill();
        c.strokeStyle = '#b8903a'; c.lineWidth = 6 * wp.s;
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.beginPath(); c.moveTo(Math.cos(a) * R * 0.1, Math.sin(a) * R * 0.1); c.lineTo(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55); c.stroke(); }
        c.fillStyle = '#e8c56a'; c.beginPath(); c.arc(0, 0, R * 0.12, 0, TAU); c.fill();
        // 滾珠（逆向，逐漸變慢）
        const bp = prog(t, 0, 5300), ba = -26 * eo(bp) - rot, br = R * lerp(0.9, 0.74, eo(prog(t, 4300, 5300)));
        c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 16;
        c.beginPath(); c.arc(Math.cos(ba) * br, Math.sin(ba) * br, 9 * wp.s, 0, TAU); c.fill();
        c.restore();
        if (t > 5300) {
          D().glowDot(c, wp.x, wp.y, R * 1.1, 'rgba(255,40,50,.7)', bump(t, 5450, 400) * wa);
          const a = win(t, 5350, 5700, 60, 200) * wa;
          D().label(c, 'ALL  IN', wp.x, wp.y - R * sq - 40, st.vh * 0.07, '#ffd97a', a, 'center', D().SERIF);
        }
      }
      // 龍爪與蓄力
      if ((t > 1500 && t < 4500) || (t > 5690 && t < 7550)) drawActor(c);
      if (t > 10050) drawActor(c, { dy: -8 * Math.sin(t * 0.01) });
      const ch = win(t, 6400, 7550, 300, 100);
      if (ch > 0) {
        const hp = [ALLY_POS.X + 450, ALLY_POS.Y + 410, ALLY_POS.Z - 20];   // 握著球棒的機械義肢
        glow3(c, ...hp, 260 * (0.5 + eo(prog(t, 6400, 7400))), 'rgba(255,40,40,.85)', ch);
        s.sparks.forEach(sp => {
          const u = ((t - 6400) / 900 + sp.t) % 1, d = sp.d * (1 - u);
          const p = P(hp[0] + Math.cos(sp.a) * d, hp[1] + Math.sin(sp.a) * d, hp[2]);
          if (p) { c.save(); c.globalAlpha = ch * u; c.fillStyle = '#ffb0a0'; c.beginPath(); c.arc(p.x, p.y, 3 * p.s * 1.5, 0, TAU); c.fill(); c.restore(); }
        });
      }
      // 撲克牌：從遠處迎面飛過鏡頭
      if (t < 3000 || (t > 7600 && t < 9000)) s.cards.forEach(cd => {
        const t0 = t < 3000 ? cd.t : 7600 + cd.t * 0.4;
        const dt = (t - t0) / 1000; if (dt < 0) return;
        const Z = cd.Z0 - cd.v * 1000 * dt + (t < 3000 ? 0 : 400);
        const p = P(cd.X + (t < 3000 ? 0 : 400), cd.Y + 60 * dt * dt * 100, Z);
        if (!p || p.s > 6) return;
        c.save(); c.globalAlpha = Math.min(1, dt * 3) * (t < 3000 ? 1 - prog(t, 2600, 3000) : 1 - prog(t, 8600, 9000));
        c.translate(p.x, p.y); c.rotate(cd.rot + cd.vr * dt); c.scale(p.s * 1.4, p.s * 1.4 * Math.cos(dt * 3 + cd.rot));
        c.fillStyle = '#f5f1e8'; D().roundRect(c, -28, -40, 56, 80, 6); c.fill();
        c.strokeStyle = '#c9a44e'; c.lineWidth = 1.5; D().roundRect(c, -24, -36, 48, 72, 4); c.stroke();
        c.fillStyle = cd.suit % 3 ? '#c21a28' : '#16161c'; c.font = `700 30px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(SUITS[cd.suit], 0, 4); c.font = `800 13px ${D().SANS}`; c.fillText(cd.rank, -15, -26);
        if (t > 7600) { c.strokeStyle = '#ff2030'; c.lineWidth = 3; c.beginPath(); c.moveTo(-32, 20); c.lineTo(32, -20); c.stroke(); }
        c.restore();
      });
      // 三道巨爪
      s.claws.forEach(cl => {
        const p = eo(prog(t, cl.t0, cl.t0 + 80));
        if (p <= 0) return;
        const life = 1 - prog(t, cl.t0 + 150, 10500);
        cl.f.forEach(([A, B], j) => {
          const E = [lerp(A[0], B[0], p), lerp(A[1], B[1], p), A[2]];
          const w = (t < cl.t0 + 160 ? 22 : lerp(22, 9, prog(t, cl.t0 + 160, cl.t0 + 600))) * (j === 1 ? 1.15 : 0.9);
          c.save(); c.globalAlpha = life;
          blade3(c, A, E, w * 1.8, 'rgba(110,0,12,.9)', null);
          blade3(c, A, E, w, t < cl.t0 + 200 ? '#fff0f0' : '#ff3044', '#ff1a30');
          c.restore();
        });
        flash(c, '#ff2030', 0.32 * bump(t, cl.t0 + 40, 180));
      });
      // 血花
      if (t > 8800) s.en.forEach((e, i) => {
        const mc = s.chest(e), p0 = P(...mc);
        if (!p0) return;
        D().glowDot(c, p0.x, p0.y, 160 * p0.s * eo(prog(t, 8800, 9100)), 'rgba(180,0,20,.85)', 1 - prog(t, 9300, 10000));
        s.blood[i].forEach(d => {
          const dt = (t - 8800 - d.d) / 1000; if (dt <= 0) return;
          const x = p0.x + Math.cos(d.a) * d.v * dt * p0.s * 1.4, y = p0.y + (Math.sin(d.a) * d.v * dt + 1300 * dt * dt) * p0.s * 1.4;
          c.save(); c.globalAlpha = Math.max(0, 1 - dt * 0.9); c.fillStyle = d.r > 7 ? '#7a0010' : '#c0101f';
          c.beginPath(); c.arc(x, y, d.r * p0.s * 1.4, 0, TAU); c.fill(); c.restore();
        });
      });
      if (t > 3100 && t < 4900) partnerBeat(c, t, 3100, s.partner && s.partner.key !== 'mocha' ? s.chest(s.M) : [W.X, W.Y - 40, W.Z]);
      // 螢幕層
      if (t > 10100 || (t > 5400 && t < 6300)) s.chips.forEach(ch2 => {
        const t0 = t > 10100 ? 10100 : 5400, dt = (t - t0) / 1000;
        const y = ch2.y + ch2.v * dt * 1.6;
        if (y > st.vh + 30) return;
        c.save(); c.translate(ch2.x + Math.sin(dt * 3 + ch2.ph) * 20, y); c.scale(1, 0.4 + 0.6 * Math.abs(Math.cos(dt * 6 + ch2.ph)));
        c.fillStyle = ch2.col; c.beginPath(); c.arc(0, 0, ch2.r, 0, TAU); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 3; c.setLineDash([4, 4]); c.beginPath(); c.arc(0, 0, ch2.r * 0.8, 0, TAU); c.stroke(); c.restore();
      });
      speedLines(c, t, 0.45 * win(t, 7500, 8400, 60, 200), 'rgba(255,120,120,.7)', -1);
      subtitle(c, t, 1800, 2950, '賭桌上的規矩，由贏家來定。', '#ffe0c0');
      bigTitle(c, t, 5700, 6450, [{ text: '贏家奠定規則，' }, { text: '輸家失去所有', indent: 1, k: 1.12, fill: { grad: [[0, '#ffd0c8'], [0.5, '#ff3a3a'], [1, '#8a0a14']] }, glow: 'rgba(255,40,50,.8)' }],
        st.vw * 0.46, st.vh * 0.38, st.vh * 0.075, { grad: [[0, '#fff4c8'], [0.5, '#f0c050'], [1, '#a8721a']] }, 'rgba(255,200,90,.6)');
      subtitle(c, t, 10200, 10900, '——願賭服輸。', '#ffd0c8');
      vignette(c, 'rgba(20,0,4,.95)', 0.8);
    },
  };

  /* =========================================================
   * 莫卡兄弟「我們能處理好這一切⋯⋯嗎？」（12 秒）
   * 文件風暴中的主觀鏡頭 → 委任契約自動簽名、兩枚印章 → 隊友協力 → 側面視角的水管爆開、水柱橫掃
   * → 標題（⋯⋯嗎？）→ 環繞鏡頭中水柱結冰、敵人被冰封 → 「兄友」「弟恭」蓋章 → 冰塊朝鏡頭爆裂 → 報告書糊上鏡頭
   * ========================================================= */
  const MOCHA = {
    dur: 12000, prefs: ['kane', 'alan', 'longzhao'],
    setup(s) {
      const R = s.R;
      s.papers = Array.from({ length: 70 }, () => ({ a: R() * TAU, r: 250 + R() * 900, y: -500 + R() * 900, z: 100 + R() * 1400, v: 0.4 + R() * 0.8, rot: R() * TAU, vr: (R() - 0.5) * 4, lines: 3 + Math.floor(R() * 4) }));
      s.contract = [150, -80, 950];
      s.sig = Array.from({ length: 70 }, (_, i) => { const u = i / 69; return [u * 150 - 75, Math.sin(u * 19) * 9 + Math.sin(u * 6.5) * 7 - u * 6]; });
      s.pipe = { X: -120, Y0: GROUND + 40, Y1: 40, Z: 850 };
      const noz = [s.pipe.X + 70, s.pipe.Y1, s.pipe.Z];
      s.jets = s.en.map(e => { const tgt = [e.X, e.Y - e.H * 0.5, e.Z]; const mid = [(noz[0] + tgt[0]) / 2, Math.min(noz[1], tgt[1]) - 380, (noz[2] + tgt[2]) / 2]; return Array.from({ length: 40 }, (_, j) => quad(noz, mid, tgt, j / 39)); });
      s.drops = Array.from({ length: 80 }, () => ({ j: Math.floor(R() * s.en.length), u: 0.15 + R() * 0.85, a: R() * TAU, v: 60 + R() * 260, r: 2 + R() * 5, d: R() * 300 }));
      s.shards3 = Array.from({ length: 90 }, () => { const e = s.en[Math.floor(R() * s.en.length)]; return { X: e.X + (R() - 0.5) * 300, Y: e.Y - R() * e.H, Z: e.Z, vx: (R() - 0.5) * 1500, vy: -200 - R() * 900, vz: -300 - R() * 1800, s: 10 + R() * 34, rot: R() * TAU, vr: (R() - 0.5) * 10 }; });
      s.snow = Array.from({ length: 120 }, () => ({ x: R() * s.vw, y: R() * s.vh, v: 20 + R() * 60, r: 1 + R() * 2.5, ph: R() * 6 }));
      s.mid = s.en.reduce((a, e) => a + e.X / s.en.length, 0);
    },
    cam(s) {
      const A = ALLY_POS, P0 = s.pipe, ct = s.contract, m = s.mid;
      return [
        { t: 0, x: 0, y: -120, z: 150, r: 0.12 },
        { t: 1500, x: -170, y: -110, z: -300, r: -0.03 },
        { t: 1750, x: ct[0], y: ct[1] + 30, z: ct[2] - 900, r: 0 },
        { t: 3000, x: ct[0] + 20, y: ct[1] + 40, z: ct[2] - 780, r: 0.01 },
        { t: 3300, x: -360, y: -60, z: -860, r: 0 },
        { t: 4450, x: -330, y: -60, z: -820, r: 0 },
        { t: 4800, x: P0.X - 250, y: 10, z: P0.Z - 1050, r: 0.13 },
        { t: 5650, x: P0.X + 260, y: -20, z: P0.Z - 1150, r: 0.04 },
        { t: 5700, x: A.X + 360, y: A.Y + 60, z: A.Z - 760, r: 0, cut: true },
        { t: 6450, x: A.X + 340, y: A.Y + 50, z: A.Z - 700, r: 0 },
        { t: 6500, x: m - 380, y: -30, z: 560, r: -0.12, cut: true },
        { t: 8200, x: m + 300, y: -80, z: 720, r: 0.12, ease: p => p },
        { t: 8400, x: m, y: -80, z: 620, r: 0 },
        { t: 9400, x: m, y: -70, z: 660, r: 0 },
        { t: 9600, x: 120, y: -40, z: -700, r: 0 },
        { t: 12000, x: 90, y: -40, z: -760, r: 0 },
      ];
    },
    shake: [[2700, 150, 8], [2850, 150, 8], [5100, 700, 6], [8400, 150, 12], [8600, 150, 12], [9000, 450, 30]],
    score(s) {
      return {
        cues: [[0, 'paper', { n: 34 }], [300, 'blip', { n: 12 }], [1700, 'whoosh'], [1950, 'sign', { dur: 0.7 }], [2700, 'stamp'], [2850, 'stamp'], [2700, 'blip', { n: 3, pitch: 0.7 }],
          [3150, 'whoosh', { pan: -0.5, dur: 0.4 }], [3350, 'blip', { n: 8 }], [3900, s.partner ? ASSIST_CUE[s.partner.key] : 'paper'], [4300, 'blip', { n: 6, pitch: 0.8 }],
          [4500, 'rumble', { dur: 0.6 }], [4600, 'ticks', { dur: 0.5, gap: 0.05, slow: 1 }], [5100, 'water', { dur: 1.4 }], [5700, 'sting', { notes: [45, 52, 57, 61] }], [6100, 'blip', { n: 3, pitch: 0.6 }],
          [6600, 'freeze', { dur: 1.6 }], [8400, 'stamp'], [8600, 'stamp'], [9000, 'glass', { vol: 0.75, n: 36 }], [9020, 'impact'], [10300, 'paper', { n: 8 }], [11000, 'chime', { notes: [81, 84, 88] }]],
        bed: [[0, [33, 45, 52, 57]], [1600, [33, 45, 52, 56]], [4500, [35, 47, 54]], [5700, [33, 45, 52, 57, 61]], [6500, [33, 45, 52, 59]], [9000, [33, 45, 52, 57, 64]]],
      };
    },
    draw(c, t, s) {
      const frz = eo(prog(t, 6600, 7600)), shatter = t > 9000;
      s.en.forEach((e, i) => {
        e.wet = win(t, 5250, 9000, 300, 100);
        e.kx = 50 * eo(prog(t, 5250, 5800)) * (1 - prog(t, 8800, 9000)) + 90 * eo(prog(t, 9000, 9400));
        e.frozen = shatter ? 0 : eo(prog(t, 7000 + i * 150, 8000 + i * 150));
        e.flash = 0.8 * bump(t, 9030, 220);
        e.rot = 0.12 * eo(prog(t, 9000, 9500)) * (i % 2 ? 1 : -1);
      });
      drawBG(c, 0.55);
      grade(c, 'rgb(10,40,70)', 0.3 + frz * 0.2);
      drawEnemies(c, t);
      // 水管
      const pp = s.pipe, pA = P(pp.X, pp.Y0, pp.Z), pB = P(pp.X, pp.Y1, pp.Z);
      if (pA && pB && t > 4300 && t < 9600) {
        const a = win(t, 4300, 9600, 200, 300);
        c.save(); c.globalAlpha = a;
        const w = 60 * pA.s;
        const g = c.createLinearGradient(pA.x - w, 0, pA.x + w, 0); g.addColorStop(0, '#2a3446'); g.addColorStop(0.45, '#8a98b0'); g.addColorStop(1, '#1a2230');
        c.fillStyle = g; c.fillRect(pA.x - w / 2, pB.y, w, pA.y - pB.y);
        c.fillRect(pB.x - w / 2, pB.y - w * 0.3, w * 1.6, w * 0.6);
        // 壓力表
        const gx = pB.x - w * 0.9, gy = pB.y + w * 1.2, gr = w * 0.55;
        c.fillStyle = '#e8e4da'; c.beginPath(); c.arc(gx, gy, gr, 0, TAU); c.fill(); c.strokeStyle = '#444'; c.lineWidth = 3; c.stroke();
        const na = -2.3 + 4.2 * eio(prog(t, 4500, 5100)) + (t < 5100 ? Math.sin(t * 0.08) * 0.15 : 0);
        c.strokeStyle = '#c21a28'; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + Math.cos(na) * gr * 0.85, gy + Math.sin(na) * gr * 0.85); c.stroke();
        c.restore();
      }
      // 水柱 → 結冰
      if (t > 5100 && !shatter) s.jets.forEach((pts, j) => {
        const hp = eo(prog(t, 5100 + j * 60, 5500 + j * 60)), n = Math.max(2, Math.floor(pts.length * hp));
        const tt = Math.min(t, 6600);
        const sp = pts.slice(0, n).map((q, i) => P(q[0] + Math.sin(tt * 0.03 + i * 0.6) * 12 * (1 - frz), q[1] + Math.cos(tt * 0.025 + i * 0.5) * 12 * (1 - frz), q[2])).filter(Boolean);
        if (sp.length < 2) return;
        const path = () => { c.beginPath(); sp.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); };
        const sAvg = sp[Math.floor(sp.length / 2)].s;
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
        c.shadowColor = frz > 0.5 ? '#dff6ff' : '#3aa8ff'; c.shadowBlur = 18;
        c.strokeStyle = `rgba(${lerp(60, 205, frz)},${lerp(160, 238, frz)},255,.9)`; c.lineWidth = 46 * sAvg; path(); c.stroke();
        c.shadowBlur = 0; c.strokeStyle = `rgba(255,255,255,${0.7 + 0.3 * frz})`; c.lineWidth = 12 * sAvg; path(); c.stroke();
        if (frz > 0) {
          c.fillStyle = 'rgba(230,248,255,.85)'; c.strokeStyle = 'rgba(120,200,255,.9)'; c.lineWidth = 1;
          sp.forEach((q, i) => {
            if (i % 3 || i < 2) return;
            const g2 = eo(prog(t, 6600 + i * 18, 6900 + i * 18)); if (g2 <= 0) return;
            const nx = -(q.y - sp[i - 1].y), ny = q.x - sp[i - 1].x, L = Math.hypot(nx, ny) || 1, side = i % 2 ? 1 : -1, l = (30 + (i * 37 % 26)) * g2 * q.s * 1.5;
            c.beginPath(); c.moveTo(q.x - ny / L * 8, q.y + nx / L * 8); c.lineTo(q.x + nx / L * l * side, q.y + ny / L * l * side); c.lineTo(q.x + ny / L * 8, q.y - nx / L * 8); c.closePath(); c.fill(); c.stroke();
          });
        }
        c.restore();
      });
      // 水花（結冰後停在空中）
      if (t > 5150 && !shatter) s.drops.forEach(d => {
        const q = s.jets[d.j][Math.floor(d.u * 39)];
        const dt = (Math.min(t, 6700) - 5150 - d.d) / 1000; if (dt <= 0) return;
        const p = P(q[0] + Math.cos(d.a) * d.v * dt, q[1] + Math.sin(d.a) * d.v * dt + 500 * dt * dt, q[2]);
        if (p) { c.save(); c.fillStyle = frz > 0.3 ? '#eafaff' : '#6cc4ff'; c.beginPath(); c.arc(p.x, p.y, d.r * p.s * 1.5, 0, TAU); c.fill(); c.restore(); }
      });
      // 冰塊碎片朝鏡頭飛來
      if (shatter) s.shards3.forEach(sh => {
        const dt = (t - 9000) / 1000;
        const p = P(sh.X + sh.vx * dt, sh.Y + sh.vy * dt + 900 * dt * dt, sh.Z + sh.vz * dt);
        if (!p || p.s > 8) return;
        c.save(); c.globalAlpha = Math.max(0, 1 - dt * 0.9); c.translate(p.x, p.y); c.rotate(sh.rot + sh.vr * dt);
        const z = sh.s * p.s * 1.5;
        c.fillStyle = 'rgba(220,245,255,.9)'; c.strokeStyle = '#9adcff'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -z); c.lineTo(z * 0.45, 0); c.lineTo(0, z * 0.8); c.lineTo(-z * 0.4, 0); c.closePath(); c.fill(); c.stroke(); c.restore();
      });
      // 兄弟
      if ((t > 1450 && t < 4450) || (t > 5690 && t < 6500)) drawActor(c);
      // 委任契約
      const ka = win(t, 1650, 3050, 250, 300);
      const cp = P(...s.contract);
      if (ka > 0 && cp) {
        c.save(); c.globalAlpha = ka; c.translate(cp.x, cp.y); c.rotate(-0.04); const k = cp.s * 1.45 * eback(prog(t, 1650, 1900)); c.scale(k, k);
        c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 20; c.fillStyle = '#f7f4ea'; c.fillRect(-110, -140, 220, 280); c.shadowBlur = 0;
        c.fillStyle = '#1c2436'; c.font = `900 22px ${D().SERIF}`; c.textAlign = 'center'; c.fillText('委 任 契 約', 0, -104);
        c.fillStyle = 'rgba(40,44,60,.5)'; for (let i = 0; i < 7; i++) c.fillRect(-86, -78 + i * 16, i % 3 === 2 ? 110 : 172, 3);
        if (s.partner && s.partner.key === 'kane' && t > 3800) { c.fillStyle = 'rgba(255,40,50,.35)'; c.fillRect(-90, -30, 180, 14); }
        c.fillStyle = '#1c2436'; c.font = `700 13px ${D().SANS}`; c.textAlign = 'left'; c.fillText('甲方', -86, 60); c.fillText('乙方　莫卡兄弟', -86, 98);
        const n = Math.floor(s.sig.length * prog(t, 1950, 2600));
        if (n > 1) { c.strokeStyle = '#1a4ca8'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); for (let i = 0; i < n; i++) { const [x, y] = s.sig[i]; i ? c.lineTo(x + 20, y + 52) : c.moveTo(x + 20, y + 52); } c.stroke(); }
        [[2700, '兄友', -50], [2850, '弟恭', 50]].forEach(([t0, txt, x]) => {
          const q = prog(t, t0, t0 + 70); if (q <= 0) return;
          c.save(); c.translate(x, 118); c.rotate(-0.15); const z = lerp(2.4, 1, eo(q)); c.scale(z, z);
          c.strokeStyle = '#c21a28'; c.fillStyle = '#c21a28'; c.lineWidth = 2.5; c.strokeRect(-26, -16, 52, 32);
          c.font = `900 17px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 0, 1); c.restore();
        });
        c.restore();
      }
      // 環繞中的紙張
      const pa = t < 1700 ? 1 : (t > 9500 ? prog(t, 9500, 10000) : 0);
      if (pa > 0) s.papers.forEach(pp2 => {
        const a = pp2.a + t * 0.0006 * pp2.v * (t < 1700 ? 3 : 1);
        const fall = t > 9500 ? (t - 9500) * 0.25 : 0;
        const p = P(Math.cos(a) * pp2.r - 100, pp2.y + fall + (t < 1700 ? Math.sin(t * 0.002 + pp2.rot) * 60 : 0), pp2.z + Math.sin(a) * 300);
        if (!p || p.s > 5) return;
        c.save(); c.globalAlpha = pa; c.translate(p.x, p.y); c.rotate(pp2.rot + t * 0.001 * pp2.vr); c.scale(p.s * 1.6, p.s * 1.6);
        c.fillStyle = '#f4f2ec'; c.fillRect(-26, -34, 52, 68);
        c.fillStyle = 'rgba(60,64,80,.55)'; for (let i = 0; i < pp2.lines; i++) c.fillRect(-19, -24 + i * 9, i === pp2.lines - 1 ? 22 : 38, 2.5);
        c.restore();
      });
      // 冰面蓋章「兄友」「弟恭」
      [[8400, '兄友', -0.3], [8600, '弟恭', 0.3]].forEach(([t0, txt, off], i) => {
        const e = s.en[Math.min(s.en.length - 1, i === 0 ? 0 : s.en.length - 1)];
        const p = P(e.X + e.kx + off * 100, e.Y - e.H * 0.6, e.Z - 80);
        const q = prog(t, t0, t0 + 70);
        if (!p || q <= 0 || shatter) return;
        c.save(); c.translate(p.x, p.y); c.rotate(-0.15 + off * 0.3); const z = lerp(3, 1, eo(q)) * p.s * 2.2; c.scale(z, z);
        c.strokeStyle = '#c21a28'; c.fillStyle = '#c21a28'; c.shadowColor = 'rgba(255,40,50,.6)'; c.shadowBlur = 10; c.lineWidth = 4; c.strokeRect(-46, -28, 92, 56);
        c.font = `900 32px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 0, 2); c.restore();
      });
      if (t > 3150 && t < 4950) partnerBeat(c, t, 3150, s.partner && s.partner.key === 'kane' ? [s.contract[0], s.contract[1] - 30, s.contract[2]] : null);
      // 螢幕層：雪、閃光、標題、字幕
      const sa = win(t, 6600, 9100, 400, 150);
      if (sa > 0) { c.save(); c.globalAlpha = sa; c.fillStyle = '#fff'; s.snow.forEach(f => { const y = (f.y + t * f.v * 0.001 * 60) % st.vh, x = f.x + Math.sin(t * 0.001 + f.ph) * 20; c.beginPath(); c.arc(x, y, f.r, 0, TAU); c.fill(); }); c.restore(); }
      flash(c, '#e8f8ff', 0.6 * bump(t, 9010, 260) + 0.2 * bump(t, 6650, 300));
      subtitle(c, t, 350, 1450, '委任契約，確認無誤。', '#cfeeff');
      subtitle(c, t, 2650, 3050, '……應該。', '#cfeeff');
      bigTitle(c, t, 5700, 6450, [{ text: '我們能處理好這一切', align: 'center' }], st.vw * 0.66, st.vh * 0.3, st.vh * 0.06, { grad: [[0, '#ffffff'], [1, '#a6dcff']] }, 'rgba(140,220,255,.7)');
      if (t > 6000 && t < 6450) D().title(c, '⋯⋯嗎？', st.vw * 0.66, st.vh * 0.42, st.vh * 0.075, { t, start: 6050, per: 80, align: 'center', alpha: win(t, 6000, 6450, 80, 200), glow: 'rgba(140,220,255,.5)', fill: '#dff3ff', rot: i => Math.sin(t * 0.018 + i) * 0.1 });
      subtitle(c, t, 8350, 8900, '買一送一。', '#ffd0c8');
      // 報告書糊上鏡頭
      const rp = prog(t, 10250, 11600);
      if (rp > 0 && rp < 1) {
        const x = lerp(-st.vw * 0.2, st.vw * 1.3, eio(rp)), y = st.vh * 0.5 + Math.sin(rp * 6) * 30;
        const w = st.vw * 0.75, h = st.vh * 0.95;
        c.save(); c.translate(x, y); c.rotate(-0.15 + rp * 0.3);
        c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 30; c.fillStyle = '#f7f4ea'; c.fillRect(-w / 2, -h / 2, w, h); c.shadowBlur = 0;
        c.fillStyle = '#1c2436'; c.font = `900 ${Math.round(h * 0.07)}px ${D().SERIF}`; c.textAlign = 'center'; c.fillText('結 案 報 告', 0, -h * 0.3);
        c.font = `700 ${Math.round(h * 0.04)}px ${D().SANS}`; c.fillText('處理完畢。', 0, -h * 0.12);
        c.fillStyle = '#9aa0b4'; c.font = `600 ${Math.round(h * 0.028)}px ${D().SANS}`; c.fillText('（大概）', w * 0.12, -h * 0.05);
        c.fillStyle = 'rgba(40,44,60,.35)'; for (let i = 0; i < 6; i++) c.fillRect(-w * 0.35, h * 0.02 + i * h * 0.05, w * (i % 2 ? 0.5 : 0.7), h * 0.012);
        c.restore();
      }
      vignette(c, 'rgba(0,6,14,.9)', 0.7);
    },
  };

  /* =========================================================
   * 阿蘭「炎彈：勇氣判決」（9.5 秒）
   * 眼部大特寫 → 隊友協力（標記座標／遞上燃燒彈）與上膛 → 標題 → 狙擊鏡三段變焦、心跳、屏息
   * → 開槍：鏡頭跟著子彈飛越戰場（子彈時間）→ 炎彈爆炸、衝擊波、火柱 → 掩護的六角護盾 → 收槍
   * ========================================================= */
  const ALAN = {
    dur: 9500, prefs: ['kane', 'mocha', 'longzhao'],
    setup(s) {
      const R = s.R;
      s.embers = Array.from({ length: 90 }, () => ({ x: R() * s.vw, y: s.vh * (0.5 + R() * 0.7), vy: 40 + R() * 160, sw: R() * TAU, r: 0.8 + R() * 2.4 }));
      s.fire = Array.from({ length: 120 }, () => ({ a: R() * TAU, v: 200 + R() * 900, r: 2 + R() * 6, life: 500 + R() * 900 }));
      s.muzzle = [ALLY_POS.X + 260, ALLY_POS.Y + 120, ALLY_POS.Z + 40];
      s.mc = s.chest(s.M);
    },
    cam(s) {
      const A = ALLY_POS, M = s.M, mc = s.mc, mz = s.muzzle;
      const along = u => [lerp(mz[0], mc[0], u), lerp(mz[1], mc[1], u), lerp(mz[2], mc[2], u)];
      const b0 = along(0.05), b1 = along(0.8);
      return [
        { t: 0, x: A.X + 20, y: A.Y - 20, z: A.Z - 330, r: 0.03 },
        { t: 1350, x: A.X + 15, y: A.Y - 16, z: A.Z - 290, r: 0.01 },
        { t: 1650, x: -420, y: -60, z: -820, r: 0 },
        { t: 2800, x: -400, y: -60, z: -780, r: 0 },
        { t: 2850, x: A.X + 340, y: A.Y + 60, z: A.Z - 720, r: -0.04, cut: true },
        { t: 3550, x: A.X + 320, y: A.Y + 50, z: A.Z - 660, r: -0.02 },
        { t: 3600, x: M.X, y: mc[1], z: M.Z - 1500, r: 0, cut: true },
        { t: 3800, x: M.X, y: mc[1], z: M.Z - 1250, r: 0, ease: eo },
        { t: 4250, x: M.X, y: mc[1], z: M.Z - 1250, r: 0 },
        { t: 4400, x: M.X, y: mc[1], z: M.Z - 980, r: 0, ease: eo },
        { t: 4750, x: M.X, y: mc[1], z: M.Z - 980, r: 0 },
        { t: 4900, x: M.X, y: mc[1], z: M.Z - 760, r: 0, ease: eo },
        { t: 5950, x: M.X, y: mc[1], z: M.Z - 740, r: 0 },
        { t: 6000, x: b0[0] - 120, y: b0[1] - 60, z: b0[2] - 260, r: 0.06, cut: true },
        { t: 7100, x: b1[0] - 120, y: b1[1] - 70, z: b1[2] - 300, r: -0.03, ease: p => p },
        { t: 7300, x: M.X - 200, y: mc[1] - 40, z: M.Z - 1300, r: 0.02, ease: eo },
        { t: 8300, x: M.X - 350, y: mc[1] - 20, z: M.Z - 1500, r: 0 },
        { t: 8400, x: A.X + 40, y: A.Y + 10, z: A.Z - 520, r: 0, cut: true },
        { t: 9500, x: A.X + 35, y: A.Y + 5, z: A.Z - 470, r: 0 },
      ];
    },
    shake: [[6000, 180, 18], [7150, 600, 34], [7300, 300, 14]],
    score(s) {
      return {
        cues: [[0, 'rumble', { dur: 1.3, vol: 0.1 }], [300, 'blip', { n: 8, pitch: 0.9 }], [1650, 'whoosh', { pan: -0.5 }], [1800, 'blip', { n: 9 }], [2250, s.partner ? ASSIST_CUE[s.partner.key] : 'laser'],
          [2650, 'blip', { n: 4 }], [2550, 'reload'], [2850, 'sting', { notes: [41, 48, 53, 57] }], [3600, 'whoosh', { dur: 0.4 }], [3800, 'scope'], [4400, 'scope'], [4900, 'scope'],
          [5000, 'heartbeat'], [5450, 'heartbeat'], [5600, 'laser'], [6000, 'gun'], [6100, 'whooshDown', { dur: 1.1, vol: 0.22 }], [7150, 'boom', { vol: 0.95 }], [7160, 'impact'], [7350, 'boom', { vol: 0.5 }],
          [7700, 'chime', { notes: [76, 79, 83] }], [8400, 'sting', { notes: [41, 48, 53, 57, 60], dur: 2 }]],
        bed: [[0, [29, 41, 48]], [1600, [29, 41, 48, 53]], [2850, [29, 41, 48, 52]], [3600, [28, 40, 47]], [6000, [29, 41, 48]], [7150, [29, 41, 48, 53, 57]]],
      };
    },
    draw(c, t, s) {
      const M = s.M, mc = s.mc, mz = s.muzzle;
      s.en.forEach((e, i) => {
        const main = i === s.mi, d = Math.abs(i - s.mi);
        const kb = eo(prog(t, 7150 + d * 120, 7700 + d * 120));
        e.kx = kb * (main ? 0 : (i > s.mi ? 1 : -1) * 120);
        e.ky = kb * (main ? 60 : 20);
        e.rot = kb * (main ? 0.1 : (i > s.mi ? 0.25 : -0.25));
        e.flash = main ? 0.9 * bump(t, 7170, 300) : 0.5 * bump(t, 7350, 300);
      });
      drawBG(c, 0.55);
      grade(c, 'rgb(40,16,4)', 0.35);
      drawEnemies(c, t, { focus: t > 3600 && t < 6000 ? s.mi : null, dimOthers: 0.4 });
      // 凱恩協力：紅點標記目標
      if (s.partner && s.partner.key === 'kane' && t > 2250 && t < 7150) {
        const p = P(...mc);
        if (p) D().glowDot(c, p.x, p.y, 26 * p.s * 2, 'rgba(255,40,40,.95)', 0.9);
      }
      if ((t < 1400) || (t > 1600 && t < 3600) || t > 8350) drawActor(c, { dy: t > 8350 ? -6 * eo(prog(t, 8400, 9000)) : 0 });
      // 子彈
      const bu = eio(prog(t, 6000, 7150));
      if (t >= 6000 && t < 7160) {
        const b = [lerp(mz[0], mc[0], bu), lerp(mz[1], mc[1], bu), lerp(mz[2], mc[2], bu)];
        const tail = [lerp(mz[0], mc[0], Math.max(0, bu - 0.08)), lerp(mz[1], mc[1], Math.max(0, bu - 0.08)), lerp(mz[2], mc[2], Math.max(0, bu - 0.08))];
        line3(c, tail, b, 16, 'rgba(255,140,40,.8)', '#ff6a10', 0.9);
        line3(c, tail, b, 5, '#fff6e0', null, 1);
        glow3(c, ...b, 90, 'rgba(255,190,90,.9)', 1);
        // 熱浪般的空氣擾動環
        for (let k = 1; k <= 4; k++) {
          const u = Math.max(0, bu - k * 0.05);
          ring3(c, lerp(mz[0], mc[0], u), lerp(mz[1], mc[1], u), lerp(mz[2], mc[2], u), 60 + k * 12, 'rgba(255,200,140,.6)', 3, (1 - k / 5) * 0.6, 1);
        }
      }
      if (t >= 6000 && t < 6200) glow3(c, ...mz, 260, 'rgba(255,230,180,.95)', 1 - prog(t, 6000, 6200));
      // 爆炸
      if (t >= 7150) {
        const others = s.en.filter((e, i) => i !== s.mi);
        [[mc, 7150, 1]].concat(others.map(e => [s.chest(e), 7350, 0.55])).forEach(([pos, t0, k]) => {
          if (t < t0) return;
          const fp = eo(prog(t, t0, t0 + 320)), fa = 1 - prog(t, t0 + 300, t0 + 1300);
          const p = P(...pos);
          if (!p) return;
          const R = 520 * k * fp * p.s;
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = fa;
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, R));
          g.addColorStop(0, '#fffbe8'); g.addColorStop(0.25, '#ffd66a'); g.addColorStop(0.55, '#ff7a1c'); g.addColorStop(0.85, 'rgba(180,30,10,.6)'); g.addColorStop(1, 'rgba(80,0,0,0)');
          c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, Math.max(1, R), 0, TAU); c.fill();
          // 火柱
          const ph = eo(prog(t, t0 + 50, t0 + 500)) * (1 - prog(t, t0 + 700, t0 + 1400));
          const top = P(pos[0], pos[1] - 1100 * k * ph, pos[2]);
          if (top) { const w = 120 * k * p.s; const g2 = c.createLinearGradient(0, p.y, 0, top.y); g2.addColorStop(0, 'rgba(255,160,60,.9)'); g2.addColorStop(1, 'rgba(255,60,20,0)'); c.fillStyle = g2; c.fillRect(p.x - w / 2, top.y, w, p.y - top.y); }
          c.restore();
          ring3(c, pos[0], s.M.Y, pos[2], 1400 * k * eo(prog(t, t0, t0 + 700)), '#ffd9a0', 30 * (1 - prog(t, t0, t0 + 700)), 1 - prog(t, t0, t0 + 700), 0.25);
          if (k === 1) {
            const dt = (t - t0) / 1000;
            s.fire.forEach(f => {
              if (dt * 1000 > f.life) return;
              const x = p.x + Math.cos(f.a) * f.v * dt * p.s * 1.5, y = p.y + (Math.sin(f.a) * f.v * dt - 200 * dt * dt) * p.s * 1.5;
              c.save(); c.globalAlpha = 1 - dt * 1000 / f.life; c.fillStyle = f.r > 4 ? '#ffe08a' : '#ff8a2a'; c.beginPath(); c.arc(x, y, f.r * p.s * 1.5, 0, TAU); c.fill(); c.restore();
            });
          }
        });
      }
      // 掩護：六角護盾（世界平面，位於我方前方）
      const ha = win(t, 7600, 8400, 200, 300);
      if (ha > 0) {
        const size = 90, h = size * Math.sqrt(3), Z = 300;
        c.save(); c.lineWidth = 2;
        for (let row = -4; row <= 4; row++) for (let col = -9; col <= 9; col++) {
          const X = -200 + col * size * 1.5, Y = -80 + row * h + (col % 2 ? h / 2 : 0);
          const wave = Math.max(0, 1 - Math.abs(col / 9 - lerp(-1.2, 1.2, prog(t, 7600, 8300))) * 3);
          const pts = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const q = P(X + Math.cos(a) * size * 0.95, Y + Math.sin(a) * size * 0.95, Z); if (q) pts.push(q); }
          if (pts.length < 6) continue;
          c.globalAlpha = ha * (0.15 + 0.65 * wave); c.strokeStyle = '#ffc070'; c.fillStyle = `rgba(255,170,80,${0.05 + 0.12 * wave})`;
          c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath(); c.fill(); c.stroke();
        }
        c.restore();
      }
      if (t > 1650 && t < 3200) partnerBeat(c, t, 1650, s.partner && s.partner.key === 'kane' ? mc : null);
      // 狙擊鏡
      const sa = win(t, 3600, 6000, 80, 60);
      if (sa > 0) {
        const p = P(...mc), R = Math.min(st.vw, st.vh) * 0.4;
        const sway = (1 - prog(t, 4000, 5600)) * 14, x = st.vw / 2 + Math.sin(t * 0.006) * sway, y = st.vh / 2 + Math.cos(t * 0.0047) * sway;
        const beat = 1 + 0.02 * (bump(t, 5020, 80) + bump(t, 5470, 80));
        c.save(); c.globalAlpha = sa;
        c.fillStyle = '#050403'; c.beginPath(); c.rect(0, 0, st.vw, st.vh); c.arc(x, y, R * beat, 0, TAU, true); c.fill();
        const vg = c.createRadialGradient(x, y, R * 0.55, x, y, R); vg.addColorStop(0, 'rgba(255,140,40,.04)'); vg.addColorStop(1, 'rgba(0,0,0,.85)');
        c.fillStyle = vg; c.beginPath(); c.arc(x, y, R * beat, 0, TAU); c.fill();
        c.strokeStyle = '#1c140e'; c.lineWidth = 18; c.stroke();
        c.strokeStyle = 'rgba(20,14,8,.95)'; c.lineWidth = 7;
        [[-1, 0], [1, 0], [0, 1]].forEach(([dx, dy]) => { c.beginPath(); c.moveTo(x + dx * R, y + dy * R); c.lineTo(x + dx * R * 0.35, y + dy * R * 0.35); c.stroke(); });
        c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - R * 0.35, y); c.lineTo(x + R * 0.35, y); c.moveTo(x, y - R); c.lineTo(x, y + R * 0.35); c.stroke();
        c.fillStyle = 'rgba(30,20,10,.95)';
        for (let i = -4; i <= 4; i++) { if (!i) continue; c.beginPath(); c.arc(x + i * R * 0.075, y, 2.4, 0, TAU); c.fill(); c.beginPath(); c.arc(x, y + i * R * 0.075, 2.4, 0, TAU); c.fill(); }
        if (t > 5600) { c.fillStyle = '#ff3a1a'; c.shadowColor = '#ff3a1a'; c.shadowBlur = 12; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); c.shadowBlur = 0; }
        c.font = `600 ${Math.round(st.vh * 0.02)}px Consolas, monospace`; c.fillStyle = 'rgba(255,170,90,.9)'; c.textAlign = 'left';
        const zoom = t < 3800 ? 2 : t < 4400 ? 4 : t < 4900 ? 8 : 12;
        c.fillText(`×${zoom}   RNG ${Math.round(lerp(880, 412, prog(t, 3600, 5000)))} m`, x + R * 0.42, y + R * 0.45);
        c.fillText(`WIND ← ${(2.3 + Math.sin(t * 0.01) * 0.2).toFixed(1)}`, x + R * 0.42, y + R * 0.45 + st.vh * 0.028);
        c.fillText(t > 5600 ? '■ 鎖定' : `BREATH ${'■'.repeat(1 + Math.floor(prog(t, 3600, 5600) * 4))}`, x + R * 0.42, y + R * 0.45 + st.vh * 0.056);
        if (p) D().label(c, M.name, x, y - R * 0.55, st.vh * 0.022, 'rgba(255,170,90,.9)', sa, 'center');
        c.restore();
      }
      desaturate(c, 0.7 * win(t, 5200, 6000, 400, 60));
      // 火星
      const ea = t < 1500 ? 1 : t > 7100 ? 1 : 0.4;
      c.save(); s.embers.forEach(e => { const y = (e.y - (t * e.vy / 1000)) % (st.vh + 20), yy = y < -10 ? y + st.vh + 20 : y; c.globalAlpha = ea * 0.8; c.fillStyle = e.r > 2 ? '#ffb45a' : '#ff7a2a'; c.beginPath(); c.arc(e.x + Math.sin(e.sw + t * 0.002) * 16, yy, e.r, 0, TAU); c.fill(); }); c.restore();
      flash(c, '#fff4dc', 0.9 * bump(t, 6010, 120) + 0.5 * bump(t, 7170, 250));
      speedLines(c, t, 0.5 * win(t, 6000, 7150, 60, 60), 'rgba(255,190,120,.7)', 1);
      subtitle(c, t, 350, 1350, '……風向，確認。', '#ffe0c0');
      bigTitle(c, t, 2850, 3600, [{ text: '炎彈：' }, { text: '勇氣判決', indent: 0.6, k: 1.35, fill: { grad: [[0, '#fff6d8'], [0.5, '#ffb04a'], [1, '#d0480e']] }, glow: 'rgba(255,90,20,.8)' }],
        st.vw * 0.5, st.vh * 0.36, st.vh * 0.075, { grad: [[0, '#fff0c8'], [1, '#ff9a3c']] }, 'rgba(255,140,40,.7)');
      subtitle(c, t, 8500, 9300, '判決，執行完畢。', '#ffe0c0');
      vignette(c, 'rgba(10,4,0,.95)', 0.75);
    },
  };

  const SCENES = { kane: KANE, longzhao: LONGZHAO, mocha: MOCHA, alan: ALAN };

  /* ================= 播放控制 ================= */
  function play(key, o) {
    const sc = SCENES[key];
    if (!sc) return 0;
    stop();
    o = o || {};
    const vw = innerWidth, vh = innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    const root = document.createElement('div');
    root.className = 'ultcine full';
    root.innerHTML = '<canvas></canvas><div class="uc-skip">點擊畫面跳過</div>';
    const cv = root.querySelector('canvas');
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    document.body.appendChild(root);
    const k = o.k || 1;
    st = { key, sc, root, ctx: cv.getContext('2d'), vw, vh, dpr, k, F: vh * 1.05, dur: sc.dur, t0: performance.now(), onSkip: o.onSkip, R: UltFx.draw.rng(Date.now() & 0xffff), cam: { x: 0, y: 0, z: -600, r: 0 } };
    layout(st, { key, enemies: o.enemies, team: o.team });
    sc.setup(st);
    st.keys = sc.cam(st);
    root.addEventListener('click', ev => { ev.stopPropagation(); skip(); });
    st.keyH = ev => { if (ev.key === 'Escape' || ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); skip(); } };
    window.addEventListener('keydown', st.keyH, true);
    st.audio = typeof Sound !== 'undefined' ? Sound.score(Object.assign({ dur: sc.dur }, sc.score(st)), k) : null;
    st.raf = requestAnimationFrame(frame);
    // 保險：分頁在背景時 requestAnimationFrame 會暫停，時間到就直接收掉
    const mine = st;
    st.guard = setTimeout(() => { if (st === mine) stop(true); }, sc.dur * k + 600);
    return sc.dur * k;
  }
  function render(t) {
    const c = st.ctx;
    c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
    c.fillStyle = '#05060c'; c.fillRect(0, 0, st.vw, st.vh);
    const cam = camAt(st.keys, t);
    const sh = shakeOf(t, st.sc.shake || []);
    if (sh) { cam.x += (Math.random() - 0.5) * 2 * sh; cam.y += (Math.random() - 0.5) * 2 * sh; }
    st.cam = cam;
    c.save();
    c.translate(st.vw / 2, st.vh / 2); c.rotate(cam.r || 0); c.translate(-st.vw / 2, -st.vh / 2);
    st.sc.draw(c, t, st);
    c.restore();
    letterbox(c, t);
    // 最後 450 毫秒整體淡出，回到戰場
    st.root.style.opacity = String(1 - prog(t, st.dur - 450, st.dur));
  }
  function frame(now) {
    if (!st) return;
    const t = (now - st.t0) / st.k;
    if (t >= st.dur) { stop(true); return; }
    render(t);
    st.raf = requestAnimationFrame(frame);
  }
  function stop(natural) {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    clearTimeout(st.guard);
    window.removeEventListener('keydown', st.keyH, true);
    if (st.audio) st.audio.stop(!!natural);
    st.root.remove();
    st = null;
  }
  function skip() {
    const cb = st && st.onSkip;
    stop(false);
    if (cb) cb();
  }
  /** 除錯用：跳到指定時間（毫秒，未縮放）並停住畫面 */
  function seek(t) {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    if (st.audio) { st.audio.stop(false); st.audio = null; }
    st.t0 = performance.now() - t * st.k;
    render(t);
  }

  const peak = sh => (sh && sh.length ? sh.reduce((a, b) => (b[2] > a[2] ? b : a))[0] : 0);   // 最強的一次震動 = 命中瞬間
  const impact = key => { const sc = SCENES[key]; return sc ? (sc.impact != null ? sc.impact : peak(sc.shake)) : 0; };
  return { play, stop, skip, seek, impact, has: key => !!SCENES[key], get active() { return !!st; }, duration: key => (SCENES[key] ? SCENES[key].dur : 0) };
})();
