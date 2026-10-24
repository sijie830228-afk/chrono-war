'use strict';
/* =========================================================
 * 時序之戰 — 戰鬥介面（播放佇列、特效、終結技蓄勢、自動戰鬥、狀態說明、長按數值、設定）
 * 角色／副本／抽卡頁在 ui-meta.js
 * ========================================================= */

const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Engine.fmt(n);
const P1 = v => (v * 100).toFixed(1) + '%';

let CFG = mergeCfg(null);   // 實際內容在啟動時由存檔系統載入（ui-save.js）
let view = 'battle';
let sideTab = 'log';
let queue = [], playing = false, V = null, playTimer = null;   // 播放佇列
let armed = null;                                              // 蓄勢中的終結技角色 id
let ultQueue = [];                                             // 預約的終結技（在空檔依序發動）
let logOpen = false;                                           // 戰鬥紀錄抽屜
let paused = false;                                            // 暫停選單開啟中
const prevVals = {};                                           // 數值條上一次的值（讓血量、能量漸變）
let autoOn = false, autoTimer = null;
let shownLog = 0;
let activeDungeon = null, dungeonClaimed = false;              // 副本戰鬥
let battleRecorded = false;                                    // 本場戰鬥結果是否已寫入動作紀錄
let readyPrev = {}, endCued = false;                           // 音效：終結技充能狀態、結束音效是否已播放

// 每種紀錄播放後停留的時間（毫秒，1× 速度）
const DELAY = { turn: 520, act: 420, ult: 1350, dmg: 430, hurt: 430, dot: 150, heal: 420, shield: 330, break: 700,
  kill: 600, wave: 1000, sys: 500, info: 340, buff: 210 };
let playbackEpoch = 0, impactTimers = new Set(), dotChain = false;
const HIT_MS = { kane: 90, longzhao: 140, mocha: 360, alan: 110, alexandra: 120, hanye: 60, gordon: 70, mark: 150, miller: 160, otg: 110, enemy: 60 };
function impactLater(fn, delay) {
  const epoch = playbackEpoch;
  const id = setTimeout(() => { impactTimers.delete(id); if (epoch === playbackEpoch) fn(); }, delay);
  impactTimers.add(id); return id;
}
function eventGains(ev) { return [ev].concat(ev.subs || []).flatMap(x => x.fx && x.fx.energyGains || []); }
function energySnapshot(gains, before) {
  if (!V || !gains.length) return;
  V = Object.assign({}, V, { units: V.units.map(u => {
    const list = gains.filter(g => g.id === u.id); if (!list.length) return u;
    const g = before ? list[0] : list[list.length - 1];
    const copy = Object.assign({}, u, { energy: before ? g.before : g.after });
    if (g.sufferBefore != null) copy.suffer = before ? g.sufferBefore : g.sufferAfter;
    return copy;
  }) });
}
function energyPulse(gains) {
  gains.forEach(g => {
    const el = cardEl(g.id);
    const amt = g.sufferBefore != null ? g.sufferAfter - g.sufferBefore : g.after - g.before;
    if (g.sufferBefore != null) {
      if (amt > 0) sufferChargeFx(el, g.sufferBefore < 9 && g.sufferAfter >= 9 ? 'ready' : 'gain', amt);
    } else {
      addCls(el, 'energy-pulse');
      if (amt > 0.01) floatText(el, '能量 +' + Math.round(amt), 'energy');
    }
  });
}
/** Resource feedback lives outside the card so log renders cannot cut off its animation. */
function sufferChargeFx(card, mode, amount) {
  const orb = card && card.querySelector('.otg-charge');
  if (!orb) return;
  const p = center(orb), k = FXK();
  if (mode === 'spend') {
    for (let i = 0; i < 9; i++) fxDiv('suffer-fx suffer-break', p.x, p.y,
      `--a:${i * 40}deg;animation-duration:${.65 * k}s`, 700);
    fxDiv('suffer-fx suffer-seal spend', p.x, p.y, `animation-duration:${.65 * k}s`, 700);
    return;
  }
  const origin = center(card);
  // Fixed paths avoid consuming the battle's random sequence for resource feedback.
  for (let i = 0; i < Math.min(6, amount + 2); i++) {
    const x = origin.x + (i - 2) * 9, y = origin.r.top + origin.r.height * .55 + (i % 2) * 12;
    fxDiv('suffer-fx suffer-thread', p.x, p.y,
      `--sx:${x - p.x}px;--sy:${y - p.y}px;animation-duration:${.48 * k}s;animation-delay:${i * 25 * k}ms`, 700);
  }
  fxDiv('suffer-fx suffer-seal ' + mode, p.x, p.y, `animation-duration:${(mode === 'ready' ? 1 : .5) * k}s`, 1100);
  const caption = fxDiv('suffer-fx suffer-caption', p.x, p.y + 40, `animation-duration:${1.1 * k}s`, 1200);
  caption.textContent = mode === 'ready' ? '九印齊明 · 終結就緒' : '苦難 +' + amount;
}
function renderEnergyGains(gains) {
  const W = viewState(), S = Engine.state(), party = W.units.filter(u => u.side === 'ally');
  [...new Set(gains.map(g => g.id))].forEach(id => {
    const u = party.find(u => u.id === id), card = cardEl(id);
    if (!u || !card) return;
    const template = document.createElement('template'); template.innerHTML = allyCard(u, W, S, party.indexOf(u));
    const orb = card.querySelector('[data-ult]'), next = template.content.querySelector('[data-ult]');
    if (orb && next) orb.replaceWith(next);
    if (gains.some(g => g.id === id && g.sufferBefore != null)) {
      const chips = card.querySelector('.chips'), replacement = template.content.querySelector('.chips');
      if (chips && replacement) chips.replaceWith(replacement);
    }
    const full = u.alive && u.energy >= u.maxEnergy - 1e-9;
    if (full && readyPrev[id] === false) Sound.play('ultReady', { gap: 250 });
    readyPrev[id] = full;
  });
  applyTweens(); // Preserve the combatant DOM nodes and their ongoing hit animations.
}
function hitDelay(f) {
  if (!f || !f.line || f.kind !== 'dmg') return 0;
  const u = Engine.state().units.find(x => x.id === f.src);
  return (HIT_MS[u && u.side === 'ally' ? u.key : 'enemy'] || 80) * FXK();
}

/** 以預設值為底，套上存檔中的戰鬥設定（缺的欄位補預設） */
function mergeCfg(s) {
  const d = clone(DEFAULT_CONFIG);
  if (s) {
    if (Array.isArray(s.team)) d.team = s.team.concat([null, null, null, null]).slice(0, 4);
    Object.keys(d.chars).forEach(k => Object.assign(d.chars[k], (s.chars || {})[k] || {}));
    if (Array.isArray(s.enemies) && s.enemies.length) d.enemies = s.enemies;
    Object.assign(d.rules, s.rules || {});
    Object.assign(d.ui, s.ui || {});
  }
  d.ui.raidenSkin = d.ui.raidenSkin === 'kane' ? 'kane' : 'raiden';
  return d;
}
function saveCfg() { if (typeof SaveSys !== 'undefined') SaveSys.touch(); }
/** 存檔用：目前的戰鬥（含副本狀態） */
function battleSnapshot() {
  const st = Engine.exportState();
  return st ? { state: st, activeDungeon, dungeonClaimed, battleRecorded } : null;
}
/** 戰鬥結束時寫一筆動作紀錄 */
function recordBattleEnd() {
  const S = Engine.state();
  if (!S || battleRecorded || !['win', 'lose', 'timeout'].includes(S.phase)) return;
  battleRecorded = true;
  const total = S.units.filter(u => u.side === 'ally').reduce((s, a) => s + ((S.stats[a.id] || {}).total || 0), 0) + ((S.stats.cashbox || {}).total || 0);
  const d = activeDungeon && Meta.DUNGEONS.find(x => x.id === activeDungeon);
  const res = { win: '勝利', lose: '失敗', timeout: '達到輪數上限' }[S.phase];
  Meta.record('battle', `${d ? '副本「' + d.name + '」' : '自訂戰鬥'}${res}：第 ${Engine.cycle()} 輪、${S.waves.length} 波，我方總傷害 ${fmt(total)}`);
}

/* ================= 彈窗 ================= */
function openModal(html, cls) {
  $('#modal').className = 'modal ' + (cls || '');
  $('#modalBox').innerHTML = `<button class="mclose" data-cmd="closemodal" title="關閉（Esc）">✕</button>` + html;
}
function closeModal() { $('#modal').className = 'modal hidden'; $('#modalBox').innerHTML = ''; }
function openPop(anchor, html) {
  const p = $('#pop');
  p.innerHTML = html;
  p.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const w = p.offsetWidth, h = p.offsetHeight;
  let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  let y = r.bottom + 6;
  if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
  p.style.left = x + 'px'; p.style.top = y + 'px';
}
function closePop() { $('#pop').classList.add('hidden'); }

/* ================= 指令執行與播放 ================= */
function run(fn) {
  if (playing) flush(true);
  clearTimeout(autoTimer);
  closePop();
  fn();
  recordBattleEnd();
  SaveSys.touch();
  const evs = Engine.drainEvents();
  if (CFG.ui.anim && view === 'battle') {
    queue.push(...groupSubs(evs));
    if (!playing) playNext();
  } else {
    shownLog = Engine.state().log.length;
    V = null;
    renderLogFull();
    renderBattle();
    if (!pump()) scheduleAuto();
  }
}
/** 附傷：把掛在主傷害底下的事件併入主傷害，播放時一起出現 */
function groupSubs(evs) {
  const byIdx = new Map(evs.map(e => [e.idx, e]));
  return evs.filter(e => {
    const p = e.entry.syncTo != null ? byIdx.get(e.entry.syncTo) : e.entry.up && byIdx.get(e.idx - e.entry.up);
    if (!p) return true;
    (p.subs || (p.subs = [])).push(e);
    return false;
  });
}
/**
 * 空檔處理：引擎停在「敵人回合之間」或我方回合時，
 * 先發動預約的終結技；若是空檔且沒有預約，就繼續推進。回傳是否又執行了指令。
 */
function pump() {
  const S = Engine.state();
  if (!S || view !== 'battle' || paused || playing) return false;
  if (S.phase === 'input' || S.phase === 'between') {
    ultQueue = ultQueue.filter(id => Engine.canUlt(id));
    if (ultQueue.length) {
      const id = ultQueue.shift();
      if (armed === id) armed = null;
      run(() => Engine.ult(id));
      return true;
    }
  }
  if (S.phase === 'between' && !armed) { run(() => Engine.proceed()); return true; }
  return false;
}
function playNext() {
  if (paused) { playTimer = null; return; }
  if (!queue.length) {
    playing = false; V = null;
    renderBattle();
    if (!pump()) scheduleAuto();
    return;
  }
  playing = true;
  const ev = queue.shift();
    if (ev.fx && ev.fx.kind === 'dmg' && ev.fx.line && (ev.fx.grp || isKaneNetHit(ev))) {   // 群攻與單目標收網共用命中時間軸
    const d = playArea(ev);
    if (d) { playTimer = setTimeout(playNext, d); return; }
  }
  V = ev.snap;
  if (ev.subs) {   // 附傷：目標的生命以最後一筆附傷結算後的狀態顯示
    const last = ev.subs[ev.subs.length - 1].snap;
    const targets = new Set([ev.fx && ev.fx.tgt, ...ev.subs.map(x => x.fx && x.fx.tgt), ...eventGains(ev).map(g => g.id)]);
    V = Object.assign({}, ev.snap, { units: ev.snap.units.map(u => targets.has(u.id) ? (last.units.find(x => x.id === u.id) || u) : u) });
  }
  const gains = eventGains(ev);
  energySnapshot(gains, true);   // Wait for the actual weapon/contact frame.
  renderBattle();
  appendLog(ev.entry, ev.subs && ev.subs.map(x => x.entry));
  shownLog = Math.max(shownLog, ev.idx + 1, ...(ev.subs || []).map(x => x.idx + 1));
  let hold = (DELAY[ev.entry.type] || 300) / CFG.ui.speed;
  if (ev.fx && ev.fx.kind === 'dot') dotChain = true;
  else if (['turn', 'act', 'ult', 'wave', 'kill'].includes(ev.entry.type) || ev.fx && ['follow', 'proxy', 'dmg', 'drift', 'cashout', 'loomRun'].includes(ev.fx.kind)) dotChain = false;
  if (dotChain && ['info', 'buff'].includes(ev.entry.type) && !ev.fx) hold = 45 / CFG.ui.speed;
  if (ev.fx && ev.fx.fast) hold *= 0.32;                                            // 寒夜的連續彈射
  else if (ev.fx && ev.fx.kind === 'riemann') hold = (ev.fx.n >= 12 ? 1100 : 800) / CFG.ui.speed;
  else if (ev.fx && ev.fx.kind === 'cashout') hold = 1000 / CFG.ui.speed;
  else if (ev.fx && ev.fx.kind === 'residue' && ev.fx.full) hold = Math.max(hold, (560 + 120 * Math.max(0, ev.fx.n - 1) + 60) * FXK());   // 光點全部落進彈匣後才兌現
  else if (ev.fx && ev.fx.kind === 'proxy') hold = 1050 * FXK();
  else if (ev.fx && ev.fx.kind === 'follow') hold = (ev.fx.visual === 'policeDrift' ? 1150 : 650) / CFG.ui.speed;
  else if (ev.fx && ev.fx.kind === 'drift') hold = 1150 / CFG.ui.speed;
  else if (ev.fx && ev.fx.kind === 'phase') hold = 1300 / CFG.ui.speed;
  if (ev.fx && ev.fx.kind === 'eult' && ultMode() !== 'off') {   // 敵方首領的終結技演出（3 秒版），傷害同樣在命中瞬間結算
    const d = playEnemyUlt(ev);
    if (d) hold = d + 60;
  }
  if (ev.fx && ev.fx.kind === 'ult' && ultMode() !== 'off') {
    const d = playUltCine(ev);
    if (d) { hold = d + 60; ev.fx.cine = true; scheduleUltHits(ultShown); }
  }
  const energyAt = ev.fx && ev.fx.kind === 'ult' && ev.fx.cine && ultShown ? ultShown.impact : hitDelay(ev.fx);
  if (gains.length) {
    const apply = () => { energySnapshot(gains, false); renderEnergyGains(gains); energyPulse(gains); };
    if (energyAt) impactLater(apply, energyAt); else apply();
    hold = Math.max(hold, energyAt + 30 * FXK());
  }
  if (ev.fx && (ev.fx.kind === 'drift' || ev.fx.visual === 'policeDrift')) {
    hold = Math.max(hold, 1150 * FXK());
    if (ev.fx.kind === 'follow') { followBanner(ev.fx); Sound.play('ultReady', { gap: 200 }); }
    policeDrift(driftHits(ev.fx.src)); Sound.play('drift');
  } else if (ev.fx) fx(ev.fx);
  if (ev.subs) ev.subs.forEach((x, i) => {
    if (!x.fx) return;
    if (x.entry.syncTo != null) fx(x.fx);   // 持續傷害與米勒治療：同一播放幀，不另外等待
    else setTimeout(() => fx(x.fx), (60 + i * 50) * FXK());
  });
  playTimer = setTimeout(playNext, hold);
}
/** Keep sweep damage in the queue until a car reaches each card. Buffs and
 * synced healing stay in their original order and no additional damage is dealt. */
function driftHits(src) {
  let last = -1;
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i], f = q.fx;
    if (['turn', 'act', 'ult', 'wave'].includes(q.entry.type) || f && ['follow', 'proxy', 'cashout', 'loomRun', 'drift'].includes(f.kind)) break;
    if (f && f.src === src && f.kind === 'dmg' && !f.sub) last = i;
  }
  if (last < 0) return null;
  const pending = queue.splice(0, last + 1), done = new Set();
  const present = ev => {
    if (done.has(ev)) return; done.add(ev);
    appendLog(ev.entry, ev.subs && ev.subs.map(x => x.entry));
    shownLog = Math.max(shownLog, ev.idx + 1, ...(ev.subs || []).map(x => x.idx + 1));
    const list = [ev].concat(ev.subs || []), tail = list[list.length - 1].snap;
    const ids = new Set(list.flatMap(x => [x.fx && x.fx.tgt, ...(x.fx && x.fx.energyGains || []).map(g => g.id)]));
    V = Object.assign({}, V, { units: V.units.map(u => ids.has(u.id) ? tail.units.find(x => x.id === u.id) || u : u) });
    renderBattle();
    list.forEach(x => { if (x.fx) fx(Object.assign({}, x.fx, { line: false })); });
    energyPulse(eventGains(ev));
  };
  return { hit(id) {
    const at = pending.findIndex(e => e.fx && e.fx.tgt === id && e.fx.src === src);
    if (at < 0) return;
    for (let i = 0; i <= at; i++) present(pending[i]);
  }, end() { pending.forEach(present); } };
}
/* ---------- 擴散與群體攻擊 ----------
 * 同一次動作的多筆命中（引擎標上同一個 grp）一起從佇列取出：先播一次角色自己的範圍特效，
 * 各目標的傷害數字、受擊與紀錄在特效打到該目標的瞬間依序呈現（結算本身早已完成，只是呈現時機）。 */
function isKaneNetHit(ev) {
  const f = ev.fx, units = ev.snap && ev.snap.units || viewState().units;
  return !!(f && f.kind === 'dmg' && f.line && ev.entry && ev.entry.text.includes('強化普攻·收網')
    && units.some(u => u.id === f.src && u.key === 'kane'));
}
function playArea(ev) {
  const g = ev.fx.grp, s = cardEl(ev.fx.src), net = isKaneNetHit(ev);
  if (!s) return 0;
  let last = -1;
  for (let i = 0; g != null && i < queue.length; i++) {
    const q = queue[i], f = q.fx;
    if (['turn', 'act', 'ult', 'wave'].includes(q.entry.type) || f && ['follow', 'proxy', 'cashout', 'loomRun', 'drift', 'ult', 'eult'].includes(f.kind)) break;
    if (f && f.grp === g) last = i;
  }
  const pending = [ev].concat(queue.splice(0, last + 1));
  const hits = pending.filter(x => x.fx && x.fx.grp === g && x.fx.kind === 'dmg');
  const tg = [...new Set(hits.map(x => x.fx.tgt))].map(id => ({ id, el: cardEl(id), main: hits.some(x => x.fx.tgt === id && x.fx.main) })).filter(x => x.el);
  if (!tg.length || tg.length < 2 && !net) { queue.unshift(...pending.slice(1)); return 0; }
  tg.forEach(x => { const c = center(x.el); x.hp = { x: c.x, y: c.r.top + c.r.height * 0.55 }; });
  tg.sort((a, b) => a.hp.x - b.hp.x);
  const W = viewState(), src = (W.units || []).find(u => u.id === ev.fx.src);
  const key = src && src.side === 'ally' ? src.key : 'enemy';
  addCls(s, 'lunge');
  Sound.play('atk_' + key);
  const at = areaFx(key, ev.fx, s, tg, ev.fx.area);
  let tPrev = 0;
  pending.forEach(x => {
    const f = x.fx;
    if (f && f.grp === g && f.kind === 'dmg' && at[f.tgt] != null) tPrev = Math.max(tPrev, at[f.tgt]);
    impactLater(() => presentArea(x, g), tPrev);
  });
  if (net) {
    // Run after every same-frame snapshot has been rendered, so all targets retain the recoil.
    impactLater(() => {
      tg.forEach(x => { const t = cardEl(x.id); if (t) { t.style.setProperty('--net-k', FXK()); addCls(t, 'net-caught'); } });
      shakeField(true);
    }, tPrev);
  }
  return net ? Math.max(tPrev + 430 / CFG.ui.speed, 1040 * FXK()) : tPrev + 430 / CFG.ui.speed;
}
function presentArea(ev, g) {
  appendLog(ev.entry, ev.subs && ev.subs.map(x => x.entry));
  shownLog = Math.max(shownLog, ev.idx + 1, ...(ev.subs || []).map(x => x.idx + 1));
  const list = [ev].concat(ev.subs || []);
  V = list[list.length - 1].snap;   // 依佇列順序呈現，最後一筆的快照就是此刻的狀態
  renderBattle();
  list.forEach(x => {
    if (!x.fx) return;
    const own = x.fx.grp === g && x.fx.kind === 'dmg';
    fx(Object.assign({}, x.fx, { line: false }));
    if (own) {
      const t = cardEl(x.fx.tgt);
      if (t) addCls(t, 'knock-up');
      if (x.fx.crit || x.fx.big) shakeField(true);
    }
  });
  energyPulse(eventGains(ev));
}
/** 從 a 畫一條細線到 b（彈道、紅線、走勢線） */
function fxLine(a, b, col, delay, dur, cls) {
  const len = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x), k = FXK();
  setTimeout(() => fxDiv(cls || 'tracer', a.x, a.y, `--len:${len}px;--r:${ang}rad;--c:${col};animation-duration:${(dur || 0.3) * k}s`, (dur || 0.3) * 1000 + 100), (delay || 0) * k);
}
const later = (fn, ms) => setTimeout(fn, ms * FXK());
/**
 * 角色自己的擴散（blast）與群體（aoe）特效。tg = 由左到右的目標 [{ id, el, hp, main }]。
 * 回傳每個目標的命中時間（毫秒，已含倍速）。
 */
function areaFx(key, f, s, tg, area) {
  const k = FXK(), a = center(s), at = {};
  const L = tg[0].hp, R = tg[tg.length - 1].hp, C = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 }, span = Math.max(160, R.x - L.x + 160);
  const main = tg.find(x => x.main) || tg[Math.floor(tg.length / 2)];
  const side = tg.filter(x => x !== main);
  const set = (x, ms) => { at[x.id] = ms * k; };
  const sweep = (t0, dur) => tg.forEach(x => set(x, t0 + dur * (x.hp.x - L.x) / Math.max(1, R.x - L.x)));   // 由左到右掃過
  const col = ELEM_COLOR[f.elem] || '#fff';
  switch (area === 'blast' ? key + ':blast' : key) {
    case 'kane': {
      Object.assign(at, kaneNetFx(tg));
      break;
    }
    case 'longzhao': {    // 三道巨爪橫掃整排，血花依序濺開
      [-26, 0, 26].forEach((o, i) => slash({ x: C.x, y: C.y + o }, 8 + i * 4, '#ff4a3a', i * 70, span, 8));
      sweep(120, 220);
      tg.forEach(x => later(() => { burst(x.hp, 'splat', '#b30f25', 0.5); sparks(x.hp, '#d0142c', 10, 60); }, (at[x.id] / k)));
      break;
    }
    case 'mocha': {       // 地面結霜擴開，冰錐從每個目標腳下依序竄出
      burst({ x: C.x, y: C.y + 40 }, 'frostfloor', '#9fe4ff', 0.7);
      tg.forEach((x, i) => {
        const t0 = 220 + Math.abs(x.hp.x - C.x) / Math.max(1, span) * 260;
        later(() => { [-14, 0, 14].forEach((o, j) => fxDiv('icespike', x.hp.x + o, x.hp.y + 44, `--s:${j === 1 ? 1 : 0.7};animation-duration:${0.55 * k}s`, 650)); burst(x.hp, 'frost', '#9fe4ff', 0.5); }, t0);
        set(x, t0 + 60);
      });
      break;
    }
    case 'gordon': {      // 做多：一條走勢線由左往右爬升，K 線沿途長出，金幣灑在每個目標上
      const pts = tg.map((x, i) => ({ x: x.hp.x, y: x.hp.y + 30 - i * 26 }));
      const p0 = { x: pts[0].x - 70, y: pts[0].y + 30 };
      [p0].concat(pts).forEach((p, i, arr) => { if (i) fxLine(arr[i - 1], p, '#ff4a58', (i - 1) * 110, 0.6, 'trend'); });
      tg.forEach((x, i) => {
        const t0 = 90 + i * 110;
        later(() => { for (let j = 0; j < 3; j++) fxDiv('candle', x.hp.x + (j - 1) * 14, x.hp.y + 16, `--c:${j === 1 ? '#2fe07a' : '#ff4a58'};--h:${(20 + Math.random() * 34).toFixed(0)}px;animation-duration:${0.55 * k}s`, 800); burst(x.hp, 'splat', '#ffd36a', 0.4); sparks(x.hp, '#fff0b0', 8, 50); }, t0);
        set(x, t0 + 40);
      });
      later(() => fxDiv('arrowup', pts[pts.length - 1].x + 30, pts[pts.length - 1].y - 10, `animation-duration:${0.7 * k}s`, 700), tg.length * 110);
      break;
    }
    case 'gordon:blast': {   // 對沖：主目標一根長 K 線，向兩側分出一紅一綠兩條相反的走勢
      fxDiv('candle', main.hp.x, main.hp.y + 20, `--c:#ffd36a;--h:64px;animation-duration:${0.6 * k}s`, 800);
      burst(main.hp, 'splat', '#ffd36a', 0.45); set(main, 90);
      side.forEach((x, i) => {
        const up = x.hp.x < main.hp.x ? i % 2 === 0 : i % 2 === 1, c2 = up ? '#ff4a58' : '#2fe07a';
        fxLine(main.hp, { x: x.hp.x, y: x.hp.y + (up ? -26 : 26) }, c2, 140, 0.45, 'trend');
        later(() => { fxDiv('candle', x.hp.x, x.hp.y + 16, `--c:${c2};--h:36px;animation-duration:${0.5 * k}s`, 700); sparks(x.hp, c2, 8, 45); }, 280);
        set(x, 290);
      });
      break;
    }
    case 'alexandra': {   // 紅藍警燈交替掃過整排，旋風跟著由左往右捲過
      slash({ x: C.x, y: C.y - 10 }, 4, '#7ff0bf', 0, span, 6); slash({ x: C.x, y: C.y + 16 }, -4, '#dcfff1', 80, span, 4);
      sweep(100, 280);
      tg.forEach((x, i) => later(() => { fxDiv('siren', x.hp.x, x.hp.y - 30, `--c:${i % 2 ? '#3a7aff' : '#ff3a4a'};animation-duration:${0.3 * k}s`, 400); burst(x.hp, 'gust', '#5fe3a8', 0.5); }, at[x.id] / k - 30));
      break;
    }
    case 'mark': {        // 一道浪由左側湧入，依序拍過每個目標
      const y = C.y + 6, x0 = L.x - 120, x1 = R.x + 120;
      fxDiv('tide', x0, y, `--dx:${x1 - x0}px;animation-duration:${0.62 * k}s`, 720);
      tg.forEach(x => { set(x, 60 + 560 * (x.hp.x - x0) / (x1 - x0)); later(() => { burst(x.hp, 'ripple', '#4fa8ff', 0.5); sparks(x.hp, '#bfe6ff', 10, 60); }, at[x.id] / k); });
      break;
    }
    case 'mark:blast': {  // 水流先擊中主目標，漣漪沿地面擴散到兩側
      slash({ x: main.hp.x, y: main.hp.y - 10 }, -14, '#8fd0ff', 0, 210, 6);
      later(() => { burst(main.hp, 'ripple', '#4fa8ff', 0.5); sparks(main.hp, '#bfe6ff', 10, 55); }, 130); set(main, 130);
      const reach = Math.max(...side.map(x => Math.abs(x.hp.x - main.hp.x)), 120) * 2 + 80;
      [0, 110].forEach(d => later(() => fxDiv('groundring', main.hp.x, main.hp.y + 42, `--w:${reach}px;--c:${d ? '#bfe6ff' : '#4fa8ff'};animation-duration:${0.5 * k}s`, 600), 160 + d));
      side.forEach(x => { set(x, 330); later(() => { burst({ x: x.hp.x, y: x.hp.y + 8 }, 'ripple', '#8fd0ff', 0.45); sparks(x.hp, '#d6efff', 6, 45); }, 330); });
      break;
    }
    case 'miller': {      // 一把巨大的黑傘撐在整排上方，雨幕與花瓣同時落下
      fxDiv('umbwide', C.x, C.y - 80, `--w:${span}px;animation-duration:${0.9 * k}s`, 1000);
      for (let i = 0; i < 16; i++) fxDiv('rainl', L.x - 60 + Math.random() * (span - 40), C.y - 100 - Math.random() * 30, `animation-delay:${(i * 25 * k).toFixed(0)}ms;animation-duration:${0.42 * k}s`, 800);
      for (let i = 0; i < 14; i++) fxDiv(i % 2 ? 'petal w' : 'petal r', L.x - 60 + Math.random() * (span - 40), C.y - 60 - Math.random() * 30, `--c:${i % 2 ? '#f2f2f6' : '#c8203c'};--dx:${(Math.random() * 50 - 25).toFixed(0)}px;animation-delay:${(80 + i * 35) * k | 0}ms;animation-duration:${0.95 * k}s`, 1400);
      tg.forEach(x => { set(x, 300); later(() => { burst({ x: x.hp.x, y: x.hp.y + 10 }, 'ripple', '#9fa8e0', 0.55); burst(x.hp, 'splat', '#2a2540', 0.35); }, 300); });
      break;
    }
    case 'miller:blast': {   // 傘撐在主目標上方，花瓣隨風飄向兩側，落地時泛起紫色漣漪
      fxDiv('umb', main.hp.x, main.hp.y - 46, `animation-duration:${0.62 * k}s`, 700);
      for (let i = 0; i < 6; i++) fxDiv('rainl', main.hp.x + (Math.random() * 100 - 50), main.hp.y - 90, `animation-delay:${(i * 35 * k).toFixed(0)}ms;animation-duration:${0.42 * k}s`, 700);
      later(() => { burst({ x: main.hp.x, y: main.hp.y + 10 }, 'ripple', '#9fa8e0', 0.55); burst(main.hp, 'splat', '#2a2540', 0.35); }, 160); set(main, 160);
      side.forEach(x => {
        for (let i = 0; i < 5; i++) fxDiv(i % 2 ? 'petal w' : 'petal r', main.hp.x, main.hp.y - 40, `--c:${i % 2 ? '#f2f2f6' : '#c8203c'};--dx:${(x.hp.x - main.hp.x + Math.random() * 30 - 15).toFixed(0)}px;animation-delay:${(120 + i * 40) * k | 0}ms;animation-duration:${0.7 * k}s`, 1100);
        set(x, 420); later(() => burst({ x: x.hp.x, y: x.hp.y + 10 }, 'ripple', '#b9b2f1', 0.5), 420);
      });
      break;
    }
    case 'alan:blast': {     // 曳光彈命中主目標爆開，衝擊波沿地面推向兩側，再各自炸起一團火
      const m0 = { x: a.x, y: a.y - 20 };
      burst(m0, 'muzzle', '#ffd08a', 0.25); fxLine(m0, main.hp, '#ffb36b', 0, 0.22);
      later(() => { burst(main.hp, 'boom', '#ff8a4c', 0.6); sparks(main.hp, '#ffcf7a', 16, 80); }, 110); set(main, 110);
      const reach = Math.max(...side.map(x => Math.abs(x.hp.x - main.hp.x)), 120) * 2 + 60;
      later(() => fxDiv('groundring', main.hp.x, main.hp.y + 36, `--w:${reach}px;--c:#ff9a4c;animation-duration:${0.4 * k}s`, 500), 150);
      side.forEach(x => { set(x, 250); later(() => { burst(x.hp, 'boom', '#ff6a3a', 0.45); sparks(x.hp, '#ffcf7a', 8, 55); }, 250); });
      break;
    }
    default: {            // 其他：以屬性色的衝擊波由主目標（或中央）擴散
      const o = area === 'blast' ? main : { hp: C };
      fxLine({ x: a.x, y: a.y - 20 }, o.hp, col, 0, 0.22);
      later(() => fxDiv('groundring', o.hp.x, o.hp.y + 36, `--w:${span + 80}px;--c:${col};animation-duration:${0.45 * k}s`, 550), 120);
      tg.forEach(x => { set(x, 140 + Math.abs(x.hp.x - o.hp.x) * 0.4); later(() => { burst(x.hp, 'splat', col, 0.4); sparks(x.hp, col, 8, 50); }, at[x.id] / k); });
    }
  }
  return at;
}
/** 收網：先以證物與鬆弛紅線包圍每個目標，再在 620ms 同時拉向各自的命中點。 */
function kaneNetFx(tg) {
  const k = FXK(), hit = 620 * k, at = {}, ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('class', 'kane-net'); el.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
  el.setAttribute('aria-hidden', 'true'); el.style.setProperty('--net-k', k);
  const nodes = [[-70,-88],[-14,-102],[69,-63],[72,57],[17,87],[-67,58]];
  const links = tg.map(x => `${x.hp.x - 70},${x.hp.y - 88}`).join(' ');
  el.innerHTML = `<g class="knet-links"><polyline points="${links}"/></g>` + tg.map((x, i) => {
    at[x.id] = hit;
    return `<g transform="translate(${x.hp.x} ${x.hp.y})">
      <g class="knet-web">
        <g class="knet-loose">${nodes.map(([px,py],j)=>`<path class="knet-thread" d="M${px} ${py}Q${px*.25+(j%2?22:-22)} ${py*.5} 0 0"/>`).join('')}</g>
        <g class="knet-taut">${nodes.map(([px,py])=>`<path class="knet-thread" d="M${px} ${py} 0 0"/>`).join('')}</g>
        <path class="knet-cross" d="M-70-88 69-63-67 58-14-102 72 57 17 87-70-88"/>
        <g transform="translate(-70 -65) scale(.30)">${CastFx.evidence(0,0,i+1,i%2?8:-11)}</g>
        ${nodes.slice(1).map(([px,py])=>`<circle class="knet-pin" cx="${px}" cy="${py}" r="2.8"/>`).join('')}
      </g>
      <g class="knet-snap">
        <path class="knet-cinch" d="M-87 31-11 3 83-28M-54-48-4-4 61 43M-17-77-2-9 16 72"/>
        <g transform="rotate(-9)" class="knet-stamp"><path d="M-49-24H49V24H-49ZM-44-19H44V19H-44Z"/><text x="0" y="9">收 網</text></g>
        <path class="knet-ink" d="M-60-16l-4-2m115 41 5 2M-31 33l-2 4M39-35l2-4M-56 12h-4M55-8l5-2"/>
      </g>
    </g>`;
  }).join('');
  $('#fx').appendChild(el);
  Sound.play('netPin');
  impactLater(() => Sound.play('netPull'), 330 * k);
  impactLater(() => Sound.play('netSnap'), hit);
  impactLater(() => el.remove(), 1020 * k);
  return at;
}
/* ---------- 對我方施放的技能 ----------
 * 道具從施放者的角色卡以弧線飛到目標（契約、筆記頁、迷你警車、預算單據），落下時在目標身上留下各自的痕跡。 */
/** 讓一個道具從 a 飛到 b；o = { lift, spin, dur, delay, ease, face }；onLand(b 的中心) */
function flyProp(from, to, cls, html, o, onLand) {
  if (!from || !to) { if (to && onLand) onLand(center(to)); return; }
  const a = center(from), b = center(to), k = FXK(), epoch = playbackEpoch;
  const pb = { x: b.x, y: b.r.top + b.r.height * 0.42 };
  if (from === to) { if (onLand) later(() => onLand(pb), 60); return; }
  const lift = o.lift == null ? 90 : o.lift, cx = (a.x + pb.x) / 2, cy = Math.min(a.y, pb.y) - lift;
  const d = document.createElement('div');
  d.className = 'prop ' + cls; d.innerHTML = html || '';
  $('#fx').appendChild(d);
  const kf = Array.from({ length: 13 }, (_, j) => {
    const u = j / 12, v = 1 - u, x = v * v * a.x + 2 * v * u * cx + u * u * pb.x, y = v * v * a.y + 2 * v * u * cy + u * u * pb.y;
    const flip = o.face && pb.x < a.x ? ' scaleX(-1)' : '';
    return { transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${((o.spin || 0) * Math.sin(u * Math.PI * 2)).toFixed(1)}deg) scale(${(0.7 + 0.3 * Math.sin(u * Math.PI)).toFixed(2)})${flip}`, opacity: j === 0 ? 0 : j === 12 ? 0.9 : 1 };
  });
  const an = d.animate(kf, { duration: (o.dur || 600) * k, delay: (o.delay || 0) * k, easing: o.ease || 'cubic-bezier(.35,.05,.45,1)', fill: 'forwards' });
  an.onfinish = () => { d.remove(); if (epoch === playbackEpoch && onLand) onLand(pb); };
}
/** 莫卡兄弟戰技：遞出一份契約，落在被代理人身上時蓋上「兄友／弟恭」的冰藍印章 */
function contractFx(s, t, f) {
  if (!t) return;
  Sound.play('contract');
  flyProp(s, t, 'contract', '<b></b><i></i><i></i><i></i>', { lift: 110, spin: 14, dur: 640 }, b => {
    const d = fxDiv('mocha-seal', b.x, b.y, `animation-duration:${0.8 * FXK()}s`, 900); d.textContent = f.mark || '';
    burst(b, 'frost', '#9fe4ff', 0.45); addCls(t, 'contractpulse');
    floatText(t, f.sw ? `印記切換［${f.mark}］` : `被代理人［${f.mark}］`, 'escort');
  });
}
/** 代理執行-弟：一疊浮報的預算單據從莫卡兄弟撒向全隊，落下時換成精銳的軍階 */
function budgetFx(s, f) {
  Sound.play('budget');
  (f.tgts || []).map(cardEl).filter(Boolean).forEach((t, i) => flyProp(s, t, 'receipt', '<i></i><i></i>', { lift: 140 + i * 18, spin: 40, dur: 620, delay: i * 70 }, b => {
    const d = fxDiv('rankpop', b.x, b.y - 40, `animation-duration:${0.9 * FXK()}s`, 1000); d.innerHTML = '<i></i><i></i>';
    addCls(t, 'contractpulse'); sparks(b, '#bfefff', 6, 40);
  }));
}
/** 阿蘭戰技：信號彈拉出火光，蜂巢狀的護盾由近到遠依序罩住每一張角色卡 */
function barrierFx(s, f) {
  const k = FXK(), a = s ? center(s) : null;
  Sound.play('barrier');
  if (s) burst({ x: a.x, y: a.r.top + a.r.height * 0.3 }, 'muzzle', '#ffd08a', 0.3);
  (f.tgts || []).map(cardEl).filter(Boolean).forEach(t => {
    const r = t.getBoundingClientRect(), dist = a ? Math.abs(r.left + r.width / 2 - a.x) : 0, wait = 80 + dist * 0.35;
    if (a && t !== s) fxLine({ x: a.x, y: a.r.top + 20 }, { x: r.left + r.width / 2, y: r.top + 20 }, '#ffb36b', wait - 60, 0.3);
    later(() => {
      const d = document.createElement('div');
      d.className = 'alan-dome'; d.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;animation-duration:${0.9 * k}s`;
      $('#fx').appendChild(d); setTimeout(() => d.remove(), 950 * k);
    }, wait);
  });
}
/** 敵方終結技：目標取自接下來這名敵人造成的傷害紀錄（我方角色卡的位置） */
function playEnemyUlt(ev) {
  const key = ev.fx.key, ids = [];
  if (!UltFx.has(key)) return 0;
  for (const q of queue) {
    if (q.entry.type === 'turn' || (q.fx && (q.fx.kind === 'ult' || q.fx.kind === 'eult'))) break;
    const f = q.fx;
    if (f && f.kind === 'dmg' && f.src === ev.fx.src && f.tgt && f.tgt.startsWith('a_') && !ids.includes(f.tgt)) ids.push(f.tgt);
  }
  const targets = ids.map(cardEl).filter(Boolean).map(el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.35 }; });
  const source = ((ev.snap && ev.snap.units) || viewState().units).find(u => u.id === ev.fx.src);
  const d = UltFx.play(key, { targets, artKey: Art.enemyKey(source || key), k: FXK(), onSkip: () => { clearTimeout(playTimer); clearTimeout(ultHitTimer); playNext(); } });
  if (d) { ultShown = { impact: UltFx.impact(key) * FXK(), film: false }; scheduleUltHits(ultShown); }
  return d;
}
/** 終結技全螢幕演出：目標取自接下來同一位角色造成的傷害紀錄 */
function playUltCine(ev) {
  const S = Engine.state();
  const u = S.units.find(x => x.id === ev.fx.src);
  if (!u || u.side !== 'ally') return 0;
  const snapUnits = (ev.snap && ev.snap.units) || S.units;
  const ids = [];
  for (const q of queue) {
    if (q.entry.type === 'turn' || (q.fx && q.fx.kind === 'ult')) break;
    const f = q.fx;
    if (f && (f.kind === 'dmg' || f.kind === 'dot') && f.src === u.id && f.tgt && !f.tgt.startsWith('a_') && !ids.includes(f.tgt)) ids.push(f.tgt);
  }
  if (u.key === 'otg') ids.length = 0;   // 全體原罪引爆也包含被其他裂傷先擊倒的目標。
  if (!ids.length) snapUnits.filter(x => x.side === 'enemy' && x.alive).forEach(x => ids.push(x.id));
  const pt = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 }; };
  const targets = ids.map(cardEl).filter(Boolean).map(pt);
  if (S.target && ids.includes(S.target)) {   // 單體技以目前選取的目標為主
    const i = ids.indexOf(S.target);
    if (i > 0 && targets[i]) targets.unshift(targets.splice(i, 1)[0]);
  }
  const onSkip = () => {
    clearTimeout(playTimer); clearTimeout(ultHitTimer);
    impactTimers.forEach(clearTimeout); impactTimers.clear();
    playNext();
  };
  // 完整版：以施放當下（紀錄快照）的敵人陣容演出
  return playUltShow(u.key, snapUnits, ids[0] || S.target, { targets, onSkip });
}
/** 依設定播放終結技演出：完整版優先使用短片版（有做的角色），其次 2.5D 版，精簡版為 3 秒短版 */
let ultShown = null;   // 剛開始播放的終結技演出：{ impact: 命中瞬間（毫秒，已縮放）, film: 是否為不對應戰場位置的短片 }
function playUltShow(key, units, mainId, o) {
  o = o || {};
  if (ultMode() === 'off') { ultShown = null; return showCutin(null, key); }
  const enemies = units.filter(x => x.side === 'enemy' && x.alive).map(x => ({ type: x.type, name: x.name, phase2: !!x.phase2, main: x.id === mainId }));
  const team = units.filter(x => x.side === 'ally' && x.alive).map(x => x.key);
  const opt = { enemies, team, k: FXK(), onSkip: o.onSkip };
  const M = ultMode() === 'full' && UltFilm.has(key) ? UltFilm : ultMode() === 'full' && UltCine.has(key) ? UltCine : UltFx;
  const d = M === UltFx ? UltFx.play(key, { targets: o.targets || [], k: FXK(), onSkip: o.onSkip }) : M.play(key, opt);
  ultShown = d ? { impact: (M.impact ? M.impact(key) : 0) * FXK(), film: M !== UltFx } : null;
  return d;
}
/**
 * 終結技的傷害在演出的命中瞬間結算：把終結技之後、下一個回合／行動／追加攻擊之前的傷害紀錄，
 * 在命中瞬間一次播放（血條同步更新），傷害數字顯示在演出畫面上方；跳過演出時照原本的順序播放。
 */
let ultHitTimer = null;
const ULT_STOP = new Set(['turn', 'act', 'ult', 'wave']);
function scheduleUltHits(show) {
  clearTimeout(ultHitTimer);
  if (!show || !show.impact) return;
  let last = -1;
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i], k = q.fx && q.fx.kind;
    if (ULT_STOP.has(q.entry.type) || k === 'follow' || k === 'proxy' || k === 'cashout' || k === 'loomRun' || k === 'flowExt') break;
    if (k === 'dmg' || k === 'dot') last = i;
  }
  if (last < 0) return;
  const lastEv = queue[last];
  ultHitTimer = setTimeout(() => {
    const at = queue.indexOf(lastEv);
    if (at < 0 || !UltFx.active && !UltFilm.active && !UltCine.active) return;
    const evs = queue.splice(0, at + 1);
    const hits = [];
    evs.forEach(ev => {
      appendLog(ev.entry, ev.subs && ev.subs.map(x => x.entry));
      shownLog = Math.max(shownLog, ev.idx + 1, ...(ev.subs || []).map(x => x.idx + 1));
      [ev].concat(ev.subs || []).forEach(x => { if (x.fx && (x.fx.kind === 'dmg' || x.fx.kind === 'dot')) hits.push(x.fx); });
      energyPulse(eventGains(ev));
    });
    const tail = evs[evs.length - 1];
    V = tail.subs ? tail.subs[tail.subs.length - 1].snap : tail.snap;
    renderBattle();
    ultNumbers(hits, show.film);
  }, show.impact);
}
/** 演出畫面上方的傷害數字：精簡版對齊戰場上的敵人，短片版排在畫面中央 */
function ultNumbers(hits, film) {
  let host = $('#ultnums');
  if (!host) { host = document.createElement('div'); host.id = 'ultnums'; document.body.appendChild(host); }
  const ids = [...new Set(hits.map(f => f.tgt))];
  const crit = hits.some(f => f.crit);
  Sound.play('hit', { elem: hits[0] && hits[0].elem, crit, gap: 20 });
  hits.forEach((f, i) => {
    const el = cardEl(f.tgt), slot = ids.indexOf(f.tgt), nth = hits.slice(0, i).filter(x => x.tgt === f.tgt).length;
    if (f.kind === 'dot' && !film && el) dotFx(el, f);
    let x, y;
    if (!film && el) { const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height * 0.3; }
    else { x = innerWidth * (0.5 + (slot - (ids.length - 1) / 2) * Math.min(0.2, 0.8 / Math.max(1, ids.length))); y = innerHeight * 0.42; }
    const d = document.createElement('div');
    const sub = !!f.sub;
    d.className = 'ultnum' + (f.crit ? ' crit' : '') + (sub ? ' sub' : '') + (f.kind === 'dot' ? ' dot' : '');
    d.innerHTML = sub ? `<i style="color:${ELEM_COLOR[f.elem] || '#fff'}">↳ ${fmt(f.amt)}</i>` : f.crit ? `<small>暴擊</small>${fmt(f.amt)}` : fmt(f.amt);
    d.style.left = (x + (Math.random() * 30 - 15)) + 'px';
    d.style.top = (y + nth * 30) + 'px';
    d.style.animationDelay = (Math.min(i, 12) * 45) + 'ms';
    d.style.animationDuration = (1.5 * FXK()) + 's';
    host.appendChild(d);
    setTimeout(() => d.remove(), 1600 * FXK() + Math.min(i, 12) * 45 + 100);
  });
}
/** 終結技演出模式：full / short / off（舊存檔的 true/false 自動換算） */
function ultMode() {
  const m = CFG.ui.ultAnim;
  return m === false ? 'off' : m === 'short' || m === 'off' ? m : 'full';
}
function clearCombatFx() {
  playbackEpoch++; dotChain = false; cbHold = 0;
  impactTimers.forEach(clearTimeout); impactTimers.clear();
  document.querySelectorAll('.drift-car,.drift-skid,.suffer-fx,.phaseban,.cutin,.kane-net,.fbanner').forEach(el => el.remove());
  document.querySelectorAll('.net-caught').forEach(el => el.classList.remove('net-caught'));
  clearTimeout(ultHitTimer);
  UltFx.stop();
  UltCine.stop();
  UltFilm.stop();
}
function flush(noPump) {
  clearCombatFx();
  clearTimeout(playTimer);
  queue = []; playing = false; V = null;
  shownLog = Engine.state().log.length;
  renderLogFull();
  renderBattle();
  if (!noPump) pump();
}
function scheduleAuto() {
  clearTimeout(autoTimer);
  const ok = () => autoOn && !paused && !playing && !armed && view === 'battle' && Engine.state() && Engine.state().phase === 'input';
  if (ok()) autoTimer = setTimeout(() => { if (ok()) run(() => Engine.autoStep()); }, Math.max(0, +CFG.ui.autoInterval || 0));
}
function viewState() {
  const S = Engine.state();
  return V ? Object.assign({}, S, V, { phase: 'playing' }) : S;
}

/* ================= 特效 ================= */
const cardEl = id => document.querySelector(`[data-uid="${id}"]`);
function center(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; }
function addCls(el, c) { if (!el) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c); }

function floatText(el, text, cls, html) {
  if (!el) return;
  const { r } = center(el);
  const d = document.createElement('div');
  d.className = 'float ' + cls;
  if (html) d.innerHTML = text; else d.textContent = text;
  const n = +(el.dataset.fl || 0); el.dataset.fl = n + 1;
  d.style.left = (r.left + r.width / 2 + (Math.random() * 50 - 25)) + 'px';
  d.style.top = (r.top + r.height * 0.3 + (n % 3) * 22) + 'px';
  d.style.animationDuration = (1.2 / Math.min(CFG.ui.speed, 2)) + 's';
  $('#fx').appendChild(d);
  setTimeout(() => d.remove(), 1400);
}
function drawLine(from, to, color) {
  const a = center(from), b = center(to);
  const svg = $('#fxsvg'), ns = 'http://www.w3.org/2000/svg';
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ln = document.createElementNS(ns, 'line');
  ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y); ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
  ln.setAttribute('class', 'atkline');
  ln.style.stroke = color; ln.style.color = color;
  ln.style.strokeDasharray = len; ln.style.setProperty('--len', len);
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', b.x); c.setAttribute('cy', b.y); c.setAttribute('r', 18);
  c.setAttribute('class', 'impact'); c.style.stroke = color;
  svg.appendChild(ln); svg.appendChild(c);
  setTimeout(() => { ln.remove(); c.remove(); }, 900);
}
/** 校準任務飛向時間織機的小卡片 */
const TASK_COL = { up: '#ff5a64', down: '#3fd884', hedge: '#ffd36a', measure: '#8fb4ff', gauge: '#8fb4ff' };

function flyChip(from, to, text, col) {
  const a = center(from), b = center(to);
  const d = fxDiv('flychip', a.x, a.y, `--dx:${b.x - a.x}px;--dy:${b.y - a.y}px;--c:${col};animation-duration:${0.6 * FXK()}s`, 750);
  d.textContent = text;
}
/** 寒夜戰技：黎曼和 → 積分。段數少時是粗糙的長條與明顯的誤差；段數多（≥ 12）時長條收斂成平滑的積分面積 */
function riemannFx(n, construct, curve = {}) {
  const row = $('#enemies');
  if (!row) return;
  const r = row.getBoundingClientRect();
  const W = Math.max(120, Math.min(820, window.innerWidth - 24, r.width * 0.9)), H = Math.max(150, Math.min(260, r.height * 0.85));
  const dpr = Math.min(2, window.devicePixelRatio || 1), high = n >= 12, dur = (high ? 1250 : 950) * FXK();
  const host = document.createElement('div');
  host.className = 'riemann' + (high ? ' high' : '');
  host.dataset.curve = curve.kind || 'arch';
  host.style.cssText = `left:${r.left + (r.width - W) / 2}px;top:${r.top + Math.max(0, (r.height - H) / 2)}px;width:${W}px;height:${H}px`;
  const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = H * dpr;
  host.appendChild(cv); $('#fx').appendChild(host);
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const pad = 26, x0 = pad, x1 = W - pad * 0.6, base = H - 22, top = 18;
  const amp = curve.amplitude || 0.65, freq = curve.frequency || 2, mid = curve.center || 0.5, width = curve.width || 0.2;
  const profiles = {
    arch: { label: '拋物線', formula: 'f(x) = b + a·4x(1−x)', f: x => 0.12 + amp * 4 * x * (1 - x) },
    wave: { label: '諧波', formula: `f(x) = b + a·sin²(${freq}πx)`, f: x => 0.14 + amp * Math.sin(freq * Math.PI * x) ** 2 },
    double: { label: '雙峰擴散', formula: 'f(x) = b + a·sin²(2πx)', f: x => 0.14 + amp * Math.sin(2 * Math.PI * x) ** 2 },
    gaussian: { label: '樣本聚焦', formula: 'f(x) = b + a·exp(−((x−μ)/σ)²)', f: x => 0.12 + amp * Math.exp(-(((x - mid) / width) ** 2)) },
  };
  const profile = profiles[curve.kind] || profiles.arch, f = profile.f;
  host.setAttribute('aria-label', `寒夜戰技：${profile.label}，${n} 段${construct ? '，構築' : ''}`);
  const caption = document.createElement('div'); caption.className = 'riemann-caption';
  caption.textContent = `${profile.label} · ${profile.formula}`; host.appendChild(caption);
  const X = u => x0 + (x1 - x0) * u, Y = v => base - (base - top) * v;
  const bars = Math.min(n, 60), t0 = performance.now();
  const ease = p => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);
  const step = now => {
    const p = (now - t0) / dur;
    if (p >= 1 || !host.isConnected) { host.remove(); return; }
    c.clearRect(0, 0, W, H);
    c.globalAlpha = Math.min(1, p * 6) * (1 - Math.max(0, (p - 0.85) / 0.15));
    // 座標軸
    c.strokeStyle = 'rgba(190,210,255,.55)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x0, top - 6); c.lineTo(x0, base); c.lineTo(x1 + 6, base); c.stroke();
    // 長條（中點黎曼和）逐根長出
    const shown = Math.floor(bars * ease((p - 0.1) / 0.45)), merge = high ? ease((p - 0.55) / 0.25) : 0;
    for (let i = 0; i < shown; i++) {
      const a = i / bars, b = (i + 1) / bars, h = f((a + b) / 2), gx = high ? 0.5 : 2;
      c.fillStyle = `rgba(143,180,255,${(high ? 0.5 : 0.32) * (1 - merge)})`; c.strokeStyle = `rgba(235,242,255,${0.85 * (1 - merge)})`; c.lineWidth = 1;
      c.fillRect(X(a) + gx / 2, Y(h), X(b) - X(a) - gx, base - Y(h)); if (!high || bars < 30) c.strokeRect(X(a) + gx / 2, Y(h), X(b) - X(a) - gx, base - Y(h));
      if (!high) {   // 誤差：曲線與長條頂端之間的區域
        c.beginPath(); c.moveTo(X(a), Y(h));
        for (let k = 0; k <= 8; k++) { const u = a + (b - a) * k / 8; c.lineTo(X(u), Y(f(u))); }
        c.lineTo(X(b), Y(h)); c.closePath(); c.fillStyle = 'rgba(255,150,90,.45)'; c.fill();
      }
    }
    // 積分面積（高段）
    if (merge > 0) {
      const g = c.createLinearGradient(0, top, 0, base); g.addColorStop(0, 'rgba(220,232,255,.85)'); g.addColorStop(1, 'rgba(110,150,255,.25)');
      c.save(); c.globalAlpha *= merge; c.fillStyle = g; c.shadowColor = '#8fb4ff'; c.shadowBlur = 24;
      c.beginPath(); c.moveTo(X(0), base); for (let k = 0; k <= 80; k++) c.lineTo(X(k / 80), Y(f(k / 80))); c.lineTo(X(1), base); c.closePath(); c.fill(); c.restore();
    }
    // 曲線
    const cp = ease(p / 0.3);
    c.strokeStyle = '#ffffff'; c.lineWidth = 2.2; c.shadowColor = '#8fb4ff'; c.shadowBlur = 10;
    c.beginPath(); for (let k = 0; k <= 80 * cp; k++) { const u = k / 80; k ? c.lineTo(X(u), Y(f(u))) : c.moveTo(X(u), Y(f(u))); } c.stroke(); c.shadowBlur = 0;
    // 標示
    c.font = 'italic 600 15px Georgia, serif'; c.fillStyle = '#e6eeff'; c.textBaseline = 'top';
    if (high && merge > 0.2) {
      c.save(); c.globalAlpha *= merge; c.font = 'italic 700 46px Georgia, serif'; c.shadowColor = '#8fb4ff'; c.shadowBlur = 20;
      c.fillText('∫', X(0.06), Y(0.95)); c.restore();
      c.fillText(`lim Σ f(xᵢ)Δx = ∫ f(x)dx    n = ${n}`, X(0.16), 2);
    } else c.fillText(`Σ f(xᵢ)Δx    n = ${n}${high ? '' : '    ε ≠ 0'}`, X(0.03), 2);
    if (construct) { c.font = '700 12px sans-serif'; c.fillStyle = '#ffe9a8'; c.textAlign = 'right'; c.fillText('構築：易彈向［樣本］', x1, base + 5); c.textAlign = 'left'; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/** 追加攻擊與代理執行共用橫幅；代理依事件記錄的實際執行者選取單人頭像。 */
const FB_PARTS = { fire: 'ember', ice: 'shard', wind: 'streak', water: 'drop', phys: 'cut', space: 'cell', luck: 'coin', thunder: 'bolt', grass: 'leaf', sorrow: 'drop', joy: 'ember', anger: 'ember', mirth: 'coin' };
function followBanner(f) {
  const W = viewState();
  const u = (W.units || []).find(x => x.id === f.src) || Engine.state().units.find(x => x.id === f.src);
  const field = $('.field');
  if (!u || !field) return;
  document.querySelectorAll('#fx .fbanner').forEach(e => e.remove());   // 連續追擊：只留最新的一條
  const proxy = f.kind === 'proxy';
  const role = proxy && f.role === 'elder' ? '兄' : proxy && f.role === 'younger' ? '弟' : '';
  const artKey = proxy && role ? 'mocha_' + f.role : u.key;
  const ch = Engine.CHARS[u.key], col = ELEM_COLOR[u.elem] || '#fff', r = field.getBoundingClientRect(), art = Art.get(artKey);
  const label = proxy ? '代理執行' : '追加攻擊', who = role ? '莫卡兄弟・' + role : ch.fullName || ch.name;
  const duration = proxy ? 1.05 : 1.25;
  const left = proxy ? Math.max(12, Math.min(r.left + 14, innerWidth - Math.min(440, innerWidth - 24) - 12)) : r.left + 14;
  const part = FB_PARTS[u.elem] || 'cut';
  const parts = Array.from({ length: 14 }, (_, i) => `<i class="fb-p ${part}" style="left:${(8 + Math.random() * 84).toFixed(0)}%;top:${(10 + Math.random() * 80).toFixed(0)}%;--dx:${((Math.random() - 0.3) * 120).toFixed(0)}px;--dy:${((Math.random() - 0.5) * 70).toFixed(0)}px;animation-delay:${(0.12 + i * 0.03).toFixed(2)}s"></i>`).join('');
  const d = document.createElement('div');
  d.className = 'fbanner e-' + u.elem + (proxy ? ' fb-proxy ' + f.role : '');
  d.dataset.kind = f.kind; d.dataset.art = artKey;
  d.setAttribute('aria-label', `${label}${role ? '・' + role : ''}：${f.name || label}`);
  d.style.cssText = `left:${left}px;top:${r.top + r.height * 0.4}px;--c:${col};animation-duration:${(duration * FXK()).toFixed(2)}s`;
  d.innerHTML = `<div class="fb-band"></div>${parts}
    <div class="fb-art">${art ? `<span style="${Art.bg(artKey, 'face', 260)}"></span>` : `<b>${esc(ch.name[0])}</b>`}</div>
    <div class="fb-txt"><small>${label} · ${proxy ? 'PROXY' : 'FOLLOW-UP'}${role ? `<i class="fb-role">${role}</i>` : ''}</small><b>${esc(f.name || label)}</b><em>${esc(who)}<span>${esc(ELEM_NAME[u.elem])}</span></em></div>`;
  $('#fx').appendChild(d);
  setTimeout(() => d.remove(), (duration * 1000 + 50) * FXK() + 100);
}
/**
 * 亞歷山卓秘技：警車從左側甩尾切入，橫向飄移掃過敵方全體 → 輪胎煙、煞車痕、紅藍警燈、風刃
 * 以 requestAnimationFrame 驅動，總長約 1.1 秒（隨倍速縮短）。
 */
function policeDrift(payload) {
  const row = $('#enemies'), A = Art.get('police_car');
  if (!row) { if (payload) payload.end(); return; }
  const R = row.getBoundingClientRect(), k = FXK(), dur = 1100 * k;
  const W = Math.min(340, Math.max(200, innerWidth * 0.26)), H = A ? W * A.h / A.w : W * 0.66;
  const y = R.top + R.height * 0.62;                       // 車身中心：敵人腳邊略上
  const x0 = -W, x1 = innerWidth + W * 0.6;
  const car = document.createElement('div');
  car.className = 'drift-car';
  car.style.cssText = `width:${W}px;height:${H}px;${A ? `background-image:url(${A.url})` : ''}`;
  car.innerHTML = '<i class="lb r"></i><i class="lb b"></i>';
  const skid = document.createElement('canvas');
  skid.className = 'drift-skid'; skid.width = innerWidth; skid.height = innerHeight;
  const g = skid.getContext('2d');
  $('#fx').append(skid, car);
  const hits = [...document.querySelectorAll('.eunit:not(.dead)')].map(el => { const r = el.getBoundingClientRect(); return { el, id: el.dataset.uid, x: r.left + r.width / 2, y: r.top + r.height * 0.5, done: false }; });
  const t0 = performance.now();
  const epoch = playbackEpoch;
  let lastSmoke = 0, prev = null;
  const step = now => {
    if (epoch !== playbackEpoch || !car.isConnected) { car.remove(); skid.remove(); return; }
    const p = Math.min(1, (now - t0) / dur);
    // 速度曲線：快速切入 → 飄移時略減速 → 加速離開
    const e = p < 0.25 ? 0.32 * (p / 0.25) : p < 0.75 ? 0.32 + 0.4 * ((p - 0.25) / 0.5) : 0.72 + 0.28 * Math.pow((p - 0.75) / 0.25, 1.6);
    const x = x0 + (x1 - x0) * e;
    const yaw = p < 0.2 ? -18 * (p / 0.2) : p < 0.8 ? -18 + 26 * ((p - 0.2) / 0.6) : 8 - 8 * ((p - 0.8) / 0.2);   // 甩尾的車身角度
    const bob = Math.sin(p * 40) * 2;
    car.style.transform = `translate(${x - W / 2}px, ${y - H / 2 + bob}px) rotate(${yaw}deg) skewX(${(-yaw * 0.4).toFixed(1)}deg)`;
    // 煞車痕：後輪的位置
    const rx = x - W * 0.32, ry = y + H * 0.36;
    if (prev) {
      g.strokeStyle = 'rgba(20,20,26,.55)'; g.lineWidth = 7; g.lineCap = 'round';
      [[0, 0], [W * 0.18, -H * 0.1]].forEach(([dx, dy]) => { g.beginPath(); g.moveTo(prev[0] + dx, prev[1] + dy); g.lineTo(rx + dx, ry + dy); g.stroke(); });
    }
    prev = [rx, ry];
    // 輪胎煙
    if (now - lastSmoke > 28 && p < 0.92) {
      lastSmoke = now;
      fxDiv('drift-smoke', rx + (Math.random() - 0.5) * 20, ry - 6, `--s:${(0.8 + Math.random() * 0.9).toFixed(2)};--dx:${(-30 - Math.random() * 50).toFixed(0)}px;animation-duration:${(0.7 + Math.random() * 0.4) * k}s`, 1200);
    }
    // 掃過每個敵人：風刃 + 撞擊
    hits.forEach(h => {
      if (h.done || x < h.x - W * 0.1) return;
      h.done = true;
      if (payload) payload.hit(h.id);
      slash({ x: h.x, y: h.y }, -8, '#7ff0bf', 0, 260, 6); slash({ x: h.x, y: h.y + 16 }, 4, '#dcfff1', 40, 220, 3);
      burst({ x: h.x, y: h.y }, 'gust', '#5fe3a8', 0.5); sparks({ x: h.x, y: h.y }, '#dcfff1', 10, 70);
      addCls(cardEl(h.id) || h.el, 'knock-down');
    });
    if (p < 1) requestAnimationFrame(step);
    else { if (payload) payload.end(); car.remove(); skid.classList.add('fade'); setTimeout(() => skid.remove(), 700 * k); }
  };
  requestAnimationFrame(step);
  // Hidden tabs can suspend RAF; keep queued damage/logs and cleanup complete.
  impactLater(() => { if (payload) payload.end(); car.remove(); skid.classList.add('fade'); setTimeout(() => skid.remove(), 700 * k); }, dur + 10);
}
/** 行動提前／延後：行動條上該單位的頭像旁出現半透明的箭頭（提前往上、延後往下），提前 100% 時箭頭較大 */
function avArrow(f) {
  const el = document.querySelector(`#timeline .tl[data-unit="${f.tgt}"]:not(.now)`) || document.querySelector(`#timeline .tl[data-unit="${f.tgt}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect(), up = f.dir === 'up', big = f.p >= 0.99;
  // 直接放在頁面最上層（行動條的圖層比 #fx 高），位置在頭像右側
  const d = document.createElement('div');
  d.className = 'fxp avarrow ' + (up ? 'up' : 'down') + (big ? ' big' : '');
  d.style.cssText = `left:${r.left + Math.min(r.width - 18, 58)}px;top:${r.top + r.height / 2}px;animation-duration:${(0.9 * FXK()).toFixed(2)}s`;
  d.innerHTML = '<i></i><i></i><i></i>';
  d.querySelectorAll('i').forEach(i => { i.style.animationDuration = (0.9 * FXK()).toFixed(2) + 's'; });
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1000 * FXK() + 100);
  addCls(el, up ? 'tl-up' : 'tl-down');
}
/** 首領轉階段：警戒條紋從兩側切入 → 雷光劈下 →「PHASE Ⅱ」→ 閃光與震動（約 1.2 秒） */
function phaseFx(f, s) {
  const k = FXK(), u = (viewState().units || []).find(x => x.id === f.src);
  const d = document.createElement('div');
  d.className = 'phaseban' + (u && u.type === 'raiden' ? ' raiden-overload' : '');
  d.style.animationDuration = (1.2 * k) + 's';
  const bolt = (x, delay) => `<svg class="pb-bolt" style="left:${x}%;animation-delay:${(delay * k).toFixed(2)}s;animation-duration:${(0.45 * k).toFixed(2)}s" viewBox="0 0 60 400" preserveAspectRatio="none"><path d="M34 0 18 150 38 160 12 400 50 190 30 180 46 0z"/></svg>`;
  d.innerHTML = `<i class="pb-flash" style="animation-duration:${(0.5 * k).toFixed(2)}s"></i>
    <i class="pb-tape a" style="animation-duration:${(1.2 * k).toFixed(2)}s"></i><i class="pb-tape b" style="animation-duration:${(1.2 * k).toFixed(2)}s"></i>
    ${bolt(22, 0.12)}${bolt(71, 0.2)}${bolt(48, 0.28)}
    <div class="pb-txt" style="animation-duration:${(1.2 * k).toFixed(2)}s"><small>${esc(u ? u.name : '')}</small><b>PHASE Ⅱ</b><em>第二階段・全面執法</em></div>`;
  document.body.appendChild(d);
  impactLater(() => d.remove(), 1250 * k);
  if (s) addCls(s, 'phaseflash');
  impactLater(() => shakeField(true), 150 * k);
  Sound.play('phase');
}
/** 鎖鏈：從 a 甩向 b（hold = 綁住後停留的比例，用於生死角力） */
function chainFx(a, b, dur, life, hold) {
  const len = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
  fxDiv('chain' + (hold ? ' hold' : ''), a.x, a.y, `--len:${len.toFixed(0)}px;--r:${ang}rad;animation-duration:${(dur * FXK()).toFixed(2)}s`, life);
}
/** 星流到達極長／極消：畫面中央的標題 */
function flowBanner(f) {
  const d = document.createElement('div');
  d.className = 'cashban flowban ' + (f.side === 'grow' ? 'grow' : 'fade');
  d.style.setProperty('--c', f.side === 'grow' ? '#ffd9a0' : '#9fb8ff'); d.style.setProperty('--c2', ELEM_COLOR[f.elem] || '#fff');
  d.style.animationDuration = (1.3 * FXK()) + 's';
  d.innerHTML = `<small>星流</small><b>${f.side === 'grow' ? '極長' : '極消'}</b><em>${esc(ELEM_NAME[f.elem] || '')}屬性 · 計時器出現</em>`;
  $('#fx').appendChild(d);
  setTimeout(() => d.remove(), 1400 * FXK() + 100);
}
/** 兌現：畫面中央的標題 */
function cashBanner(f) {
  const C = Engine.CASH, F = f.proto ? C.PROTO[f.form] : C.FORM[f.form], L = f.load && C.LOAD[f.load];
  if (!F) return;
  const d = document.createElement('div');
  d.className = 'cashban' + (f.proto ? ' proto' : '');
  d.style.setProperty('--c', ELEM_COLOR[f.form] || '#fff'); d.style.setProperty('--c2', L ? ELEM_COLOR[f.load] : ELEM_COLOR[f.form]);
  d.style.animationDuration = (1.1 * FXK()) + 's';
  d.innerHTML = f.proto ? `<small>原型兌現</small><b>${esc(ELEM_NAME[f.form])}・${esc(F.name)}</b>`
    : `<small>兌現</small><b>${esc(ELEM_NAME[f.form])}・${esc(F.name)}</b><em>裝填 ${esc(ELEM_NAME[f.load])}・${esc(L.name)}</em>`;
  $('#fx').appendChild(d);
  setTimeout(() => d.remove(), 1200 * FXK() + 100);
}
const ELEM_COLOR = { phys: '#dfe4f0', fire: '#ff8a4c', water: '#4fa8ff', wind: '#5fe3a8', thunder: '#b48cff', ice: '#7fd4ff', grass: '#7ed957', luck: '#ffd36a', space: '#8fb4ff', joy: '#ffc0d8', anger: '#ff5a5a', sorrow: '#9fa8e0', mirth: '#ffe07a', imag: '#c9a0ff' };

function fx(f) {
  const s = f.src ? cardEl(f.src) : null;
  const t = f.tgt ? cardEl(f.tgt) : null;
  const tAlly = f.tgt && f.tgt.startsWith('a_');
  switch (f.kind) {
    case 'dmg':
    case 'dot':
      if (f.line && s && t && s !== t) attackFx(f, s, t);
      else if (f.kind === 'dot' && t) { dotFx(t, f); Sound.play('dot', { gap: 65, type: f.dotType || (f.elem === 'sorrow' ? 'mourn' : f.elem) }); }
      else Sound.play(tAlly ? 'hurt' : 'hit', { elem: f.elem, crit: f.crit, gap: 60 });
      if (f.absorbed > 0.5) Sound.play('absorb', { delay: 0.08 });
      if (t) {
        addCls(t, 'hit');
        if (f.amt > 0.5 && f.sub) {
          floatText(t, `<i style="color:${ELEM_COLOR[f.elem] || '#fff'}">↳ ${fmt(f.amt)}</i>`, 'sub' + (f.crit ? ' subcrit' : ''), true);
        } else if (f.amt > 0.5) {
          if (f.crit && !tAlly) {   // 暴擊：金色大字、「暴擊」標籤與閃光，和一般傷害明顯區分
            floatText(t, `<small>暴擊</small>${fmt(f.amt)}`, 'crit', true);
            const b = center(t); burst({ x: b.x, y: b.r.top + b.r.height * 0.45 }, 'critburst', '#ffd24c', 0.45);
          } else floatText(t, '-' + fmt(f.amt), f.kind === 'dot' ? 'dot' : tAlly ? 'hurt' : 'dmg');
        }
        if (f.absorbed > 0.5) floatText(t, '🛡 -' + fmt(f.absorbed), 'absorb');
      }
      break;
    case 'heal':
      if (s && t && s !== t) drawLine(s, t, '#5cff9a');
      addCls(t, 'healpulse'); floatText(t, '+' + fmt(f.amt), f.syncTo != null ? 'heal soft' : 'heal');
      Sound.play(f.syncTo != null ? 'healSoft' : 'heal', f.syncTo != null ? { gap: 120 } : undefined);   // 米勒天賦：持續傷害轉治療，音量壓低、不疊加
      break;
    case 'shield': addCls(t, 'shpulse'); floatText(t, '🛡 +' + fmt(f.amt), 'shield'); Sound.play('shield', { gap: 120 }); break;
    case 'break': addCls(t, 'brkflash'); floatText(t, '弱點擊破！', 'break'); Sound.play('break'); break;
    case 'stun': floatText(t, '禁錮', 'stun'); addCls(t, 'hit'); Sound.play('stun'); break;
    case 'resist': floatText(t, '抵抗！', 'shield'); Sound.play('resist'); break;
    case 'ult':
      if (s && s.querySelector('.otg-charge')) sufferChargeFx(s, 'spend');
      addCls(s, 'ultflash'); floatText(s, '✦ 終結技', 'ult');
      if (!f.cine) { showCutin(f.src); Sound.play('ultArm'); }
      break;
    case 'cast': addCls(s, 'lunge'); break;
    case 'proxy':
      if (f.role === 'younger') budgetFx(s, f);   // 代理執行-弟：浮報的預算單據飛向全隊，換成精銳的軍階
    // falls through
    case 'follow': addCls(s, 'lunge'); followBanner(f); Sound.play('ultReady', { gap: 200 }); break;
    case 'contract': contractFx(s, t, f); break;   // 莫卡兄弟：遞出契約、蓋上印記
    case 'barrier': barrierFx(s, f); break;        // 阿蘭：為全隊展開護盾
    case 'phase': phaseFx(f, s); break;   // 首領轉階段
    case 'cleanse': if (t) { addCls(t, 'cleanse'); floatText(t, '負面效果清除', 'shield'); burst(center(t), 'ripple', '#e8f0ff', 0.6); } break;   // 轉階段淨化
    case 'av': avArrow(f); break;          // 行動值改變：行動條上的箭頭
    case 'wanted':   // 通緝層數變化
      if (t) floatText(t, `通緝 ${f.n > 0 ? '+' : '−'}${Math.abs(f.n)}`, f.n > 0 ? 'wanted' : 'wanted down');
      break;
    case 'duel':     // O.T.G. 生死角力：一條鎖鏈把雙方綁在一起
      if (s && t) {
        const A = center(s), B = center(t);
        chainFx({ x: A.x, y: A.r.top + A.r.height * 0.3 }, { x: B.x, y: B.r.top + B.r.height * 0.5 }, 1.1, 1300, true);
        addCls(s, 'duelpulse'); addCls(t, 'duelpulse');
        floatText(s, '生死角力', 'duel'); floatText(t, '生死角力', 'duel');
      }
      Sound.play('duel');
      break;
    case 'drift': policeDrift(); Sound.play('drift'); break;
    case 'kill': addCls(t, 'hit'); Sound.play('kill'); break;
    case 'turn': Sound.play(f.src && f.src.startsWith('a_') ? 'turn' : 'turnEnemy'); break;
    case 'wave': Sound.play('wave'); break;
    case 'loom':
      Sound.play('buff', { gap: 60 }); addCls($('#loom'), 'lm-pulse');
      if (s && $('#loom')) flyChip(s, $('#loom'), Engine.TASK_NAME[f.task] || '任務', TASK_COL[f.task] || '#c9a0ff');
      break;
    case 'loomRun': Sound.play('shield'); addCls($('#loom'), 'lm-fire'); break;
    case 'market': {
      const up = f.v > (f.from != null ? f.from : 0);
      Sound.play(up ? 'mkUp' : 'mkDown', { gap: 80 }); addCls($('#market'), up ? 'mk-up' : 'mk-down');
      break;
    }
    case 'riemann': riemannFx(f.n, f.construct, f.curve); Sound.play('riemann', { n: f.n }); break;
    case 'flow': {   // 星流推動
      const el = $('#flow');
      if (el) { addCls(el, f.v > (f.from || 0) ? 'fl-grow' : 'fl-fade'); if (s && f.from != null) flyChip(s, el, f.v > f.from ? '長' : '消', f.v > f.from ? '#ffd9a0' : '#9fb8ff'); }
      Sound.play('buff', { gap: 60 });
      break;
    }
    case 'flowExt': addCls($('#flow'), 'fl-ext'); flowBanner(f); Sound.play('cashout'); break;
    case 'residue': residueOrbs(s, f); break;
    case 'cashout': {
      cbHold = 0; addCls($('#cashbox'), 'cb-fire'); cashBanner(f); Sound.play('cashout');
      break;
    }
    case 'model':    // 馬克：筆記本撕下的一頁飄向榜樣，落下時泛起漣漪
      Sound.play('model');
      flyProp(s, t, 'page', '<i></i><i></i><i></i>', { lift: 120, spin: 30, dur: 620 }, b => {
        addCls(t, 'modelpulse'); burst(b, 'ripple', '#4fa8ff', 0.6); burst({ x: b.x, y: b.y + 10 }, 'ripple', '#bfe6ff', 0.45); floatText(t, '榜樣', 'escort');
      });
      break;
    case 'escort':   // 亞歷山卓：迷你警車鳴著警笛開到目標身邊，紅藍警燈閃過
      Sound.play('escort');
      flyProp(s, t, 'cruiser', '<i class="lb"></i>', { lift: 40, dur: 560, ease: 'cubic-bezier(.5,0,.2,1)', face: true }, b => {
        addCls(t, 'escortpulse'); fxDiv('siren', b.x - 22, b.y - 30, `--c:#ff3a4a;animation-duration:${0.32 * FXK()}s`, 400);
        later(() => fxDiv('siren', b.x + 22, b.y - 30, `--c:#3a7aff;animation-duration:${0.32 * FXK()}s`, 400), 90); floatText(t, '護航專車', 'escort');
      });
      break;
    default: break;
  }
}

/* ================= 狀態說明 ================= */
const STAT_NAME = { atkPct: '攻擊%', atkFlat: '攻擊力', cd: '暴擊傷害', cr: '暴擊率', spdPct: '速度%', dmgBonus: '造成傷害', be: '擊破特攻',
  dmgTakenRed: '受到傷害', defRed: '防禦力', dmgDealtRed: '造成傷害', breakEff: '擊破效率', defIgnore: '無視防禦' };
const NEG = new Set(['defRed', 'dmgDealtRed', 'dmgTakenRed']);
function statLine(k, v) {
  if (k === 'atkFlat') return `攻擊力 +${Math.round(v)}`;
  if (k === 'dmgTakenUp') return `受到傷害 +${Engine.pct(v)}`;
  const sign = NEG.has(k) ? '−' : '+';
  return `${STAT_NAME[k] || k} ${sign}${Engine.pct(v)}`;
}
const BUFF_INFO = {
  '疑點': ['減益', '莫卡兄弟「代理執行-兄」施加。防禦力降低 10%，造成的傷害降低 30%。'],
  '精銳': ['增益', '莫卡兄弟「代理執行-弟」提供。攻擊力提高 40%（不超過莫卡兄弟攻擊力的 25%），暴擊傷害提高 50%。'],
  '帳單分開結': ['增益', '莫卡兄弟天賦觸發時，莫卡兄弟與被代理人造成的傷害提高 20%。'],
  '內線交易·速': ['增益', '莫卡兄弟額外能力二：觸發時印記為「兄友」，被代理人速度提高 10%。'],
  '內線交易·暴': ['增益', '莫卡兄弟額外能力二：觸發時印記為「弟恭」，被代理人暴擊率提高 12%。'],
  '售後服務': ['增益', '莫卡兄弟額外能力一：印記切換時，被代理人受到的傷害降低 15%。'],
  '壁壘': ['增益', '阿蘭額外能力二：可以抵抗 1 次控制效果（例如禁錮），生效後移除。'],
  '收束': ['增益', '阿蘭額外能力三：兌現匣每次兌現時，阿蘭給予的護盾量提高 10%；兌現的形制或裝填為火屬性時額外 +1 戰技點。'],
  '破綻': ['減益', '阿蘭額外能力一：受到兌現匣兌現攻擊的敵人，受到的暴擊傷害提高 30%。'],
  '破甲': ['減益', '兌現匣・物理裝填：防禦力降低 15%。'],
  '灼燒': ['減益', '兌現匣・火裝填：受到的傷害提高 10%。'],
  '凍結': ['減益', '兌現匣・冰裝填：造成的傷害降低 20%。'],
  '焚城': ['減益', '兌現匣・火原型兌現：受到的傷害提高 20%。'],
  '絕對零度': ['減益', '兌現匣・冰原型兌現：造成的傷害降低 40%。'],
  '財源滾滾': ['增益', '戈登［校準任務·抄底］或秘技【保密協議】提供。持有者下次行動（普攻、戰技）時消耗，使其行動提前 10%。'],
  '債務糾紛': ['減益', '戈登［校準任務·對沖］施加於主目標。造成的傷害降低 30%，持續 1 回合。'],
  '花束·罌粟': ['減益', '米勒戰技：主目標生命值大於 50% 時獻上（星流向「長」推動 25%）。防禦力降低 10%。生命值首次降至 50% 以下時轉化為白菊（不推動星流）。'],
  '花束·白菊': ['減益', '米勒戰技：主目標生命值小於等於 50% 時獻上（星流向「消」推動 25%）。受到的持續傷害提高 20%；被擊敗時，階段最高的悲悼轉移到生命值百分比最高的敵人。'],
  '回響': ['減益', '米勒終結技「葬禮」期間：悲悼消除時，有 90% 基礎機率再施加 1 個悲悼。葬禮結束時消除。'],
  '瀆神之軀': ['增益', 'O.T.G. 終結技：抗性穿透 +20%；每次攻擊後為自身與攻擊目標各施加 1 層裂傷；無法獲得苦難。與生死角力同時存在時，受到敵人攻擊會以強化普攻反擊（每回合 2 次）。'],
  '告死': ['減益', '米勒秘技：受到的持續傷害提高 15%。'],
  '盛大告別': ['增益', '米勒天賦：星流到達「極長」時進入。米勒攻擊敵人時，額外觸發目標身上全部悲悼各一次（不推進階段、不消除）。星流計時結束時消失。'],
  '陰雨連綿': ['增益', '米勒天賦：星流到達「極消」時進入。可附加的悲悼最大數量 +1。星流計時結束時消失。'],
  '焦土狙擊手': ['增益', '妙具「焦土狙擊手」4 件：穿戴者投入的餘料參與兌現匣的兌現後，攻擊力提高 15%。'],
  '偵探的放大鏡': ['增益', '妙具「偵探的放大鏡」4 件：施放終結技後，暴擊率提高 12%。'],
  '冰封的帳簿': ['增益', '妙具「冰封的帳簿」4 件：穿戴者施放終結技時，我方全體暴擊傷害提高 16%。'],
  '代理人的委任狀': ['增益', '妙具「代理人的委任狀」4 件：穿戴者施放戰技後，我方全體攻擊力提高 8%。'],
  '流動資本': ['增益', '金句《千百倍槓桿》：施放戰技時獲得（權能層：投入校準任務時再獲得 1 層），最多 3 層。每層提高攻擊力與造成的運屬性傷害。'],
  '鎖定': ['增益', '金句《不可反駁的推演》：發動追加攻擊或獲得額外回合時獲得，最多 2 層。每層提高造成的傷害，並無視目標部分防禦力。'],
  '罪證確鑿': ['增益', '金句《不可反駁的推演》：因自身技能行動提前 100% 時獲得。下一次攻擊的暴擊傷害提高，攻擊後移除。'],
  '附加條款': ['增益', '金句《合約第七條》：戰技指定的目標攻擊力提高。'],
  '不退讓': ['增益', '金句《掩護到最後一刻》：裝備者投入的餘料參與兌現匣的兌現後，我方全體受到的傷害降低。'],
  '實戰演練': ['增益', '馬克終結技提供。馬克發動追加攻擊時：追加攻擊傷害 +25%、榜樣行動提前 10%；額外能力二：再投入 1 份榜樣屬性的餘料。'],
  '知悉': ['減益', '馬克「而勝於藍」施加。受到的傷害提高 10%。'],
  '流轉·跬步': ['減益', '馬克額外能力一：被「跬步千里」命中，全屬性抗性 −4%。不同追加攻擊的效果可以疊加。'],
  '流轉·循序': ['減益', '馬克額外能力一：被「循序漸進」命中，全屬性抗性 −4%。不同追加攻擊的效果可以疊加。'],
  '流轉·而勝': ['減益', '馬克額外能力一：被「而勝於藍」命中，全屬性抗性 −4%。不同追加攻擊的效果可以疊加。'],
  '斂藏': ['增益', '馬克秘技「心如止水」：被敵人選為單體攻擊目標的機率降低 50%。'],
  '護航專車': ['增益', '亞歷山卓戰技指定（只對最新的目標生效）。攻擊力 +30% 並加上施加當下亞歷山卓攻擊力 15% 的固定值，速度 +20；攻擊時對每個命中的目標附加 500 + 亞歷山卓攻擊力 5% 的風屬性傷害。持有者行動時亞歷山卓獲得 1 點鳴笛（每回合最多 2 次）。額外能力三：場上有帶負面效果的敵人時攻擊力再 +7%。'],
  '請系好安全帶': ['增益', '亞歷山卓戰技：被指定獲得護航專車的隊友造成的傷害提高 10%，持續 2 回合（以該隊友的回合計）。'],
  '封鎖': ['減益', '金句《一路綠燈》權能層［封鎖線］：裝備者投入的餘料參與兌現後，施加於敵方全體。受到的傷害提高。'],
  '執法權限': ['增益', '雷霆-09型的【強制執行】擊倒目標或擊破護盾時獲得：攻擊力提高 20%，持續 2 回合。'],
  '受難': ['增益', '金句《無人應答的禱告》性相層：每承受一次持續傷害獲得 1 層，每層使造成的傷害提高，最多 4 層。'],
  '開道': ['增益', '金句《一路綠燈》性相層：裝備者施放戰技後，戰技指定的我方目標造成的傷害提高。'],
  '利滾利': ['增益', '金句《第九街的規矩》權能層：兌現匣每兌現一次獲得 1 層，每層使持續傷害提高，最多 2 層。'],
  '履約保證': ['增益', '金句《合約第七條》權能層：裝備者投入的餘料參與兌現後，我方全體攻擊力提高。'],
  '整理筆記': ['增益', '金句《實習筆記》權能層：裝備者投入的餘料參與兌現後，追加攻擊的增傷提高為 2 倍。'],
  '雨聲': ['增益', '金句《雨中的告別式》權能層：每次推動星流獲得 1 層，每層使持續傷害提高，最多 3 層。'],
  '草稿': ['增益', '金句《演算草稿》性相層：施放普攻後，下一次戰技的暴擊率提高；施放戰技後移除。'],
  '讓路': ['增益', '金句《交通管制》：裝備者施放戰技後，戰技指定的我方目標速度提高。'],
  '演算': ['增益', '金句《演算草稿》權能層：時間織機每執行一份校準任務獲得 1 層，每層提高暴擊率，最多 5 層；施放戰技後移除。'],
  '押送': ['減益', '亞歷山卓終結技施加。受到的傷害提高 20%，造成的傷害降低 30%。'],
  '違規開罰': ['減益', '亞歷山卓額外能力二：敵人行動時帶有 2 個以上負面效果，防禦力降低 13%。'],
  '後勤支援': ['增益', '亞歷山卓額外能力一：我方發動追加攻擊時獲得，每層攻擊力 +17%，最多 2 層，持續整場戰鬥。'],
  '度量': ['增益', '寒夜［校準任務·度量］提供。每層使寒夜每次獲得刻度時額外 +1 層，最多 3 層。'],
  '構築': ['增益', '寒夜終結技提供，持續到下次施放戰技後。戰技無視敵人 15% 防禦力，且每段彈射有 50% 機率直接彈向帶有［樣本］的敵人。'],
};
const ST_INFO = {
  lacer: ['裂傷', '持續傷害', '龍爪、O.T.G. 施加（O.T.G. 也會施加在自己身上，在自己的回合開始時結算）。每層在該敵人回合開始時造成最大生命 16% 的物理持續傷害（不超過龍爪攻擊力 120%），每層各自持續 2 回合。結算後，依結算層數 × 50% 轉為血破（至少 1 層）。'],
  bb: ['血破', '持續傷害', '被視為裂傷。在該敵人下一次回合開始時，每層造成最大生命 24% 的物理持續傷害（不超過龍爪攻擊力 200%），結算後立刻消失。龍爪額外能力二：傷害 +20%，並額外造成 50% 攻擊力附加傷害。'],
  record: ['裂痕記錄', '記錄', '自上次結算後被施加的裂傷層數。龍爪終結技會依「當前記錄 × 50%」施加血破；天賦結算後清空。'],
  peek: ['管中窺豹', '標記', '凱恩天賦。只會存在於一名敵人身上。被我方攻擊命中時：凱恩 +1 線索，該敵人行動提前 10%。該敵人行動時，凱恩發動追加攻擊。凱恩戰技命中時轉為現行犯。持有者死亡時轉移至生命值最低的敵人。'],
  flagrant: ['現行犯', '標記', '凱恩戰技命中管中窺豹時轉變而成。場上有現行犯時，凱恩普攻替換為強化普攻「收網」。被命中與行動時的效果同管中窺豹。凱恩終結技對其額外 +200% 傷害，並將其轉回管中窺豹。'],
  broken: ['弱點擊破', '狀態', '韌性歸零（舊機制）。受到的傷害不再有 0.9 倍的韌性減免。將在該敵人下一次回合開始時恢復韌性。'],
  proxy: ['被代理人', '增益', '莫卡兄弟戰技指定。攻擊力 +20%、暴擊傷害 +20%。持有印記且莫卡兄弟有 ≥2 默契時，會在確認普攻／戰技後、正式施放前觸發代理執行。'],
  mark: ['印記', '標記', '「兄友」→ 代理執行-兄（全體冰傷＋疑點），「弟恭」→ 代理執行-弟（全體精銳）。每次執行後切換。只有被代理人的印記會生效。'],
  tacit: ['默契', '資源', '莫卡兄弟的資源。被代理人確認普攻／戰技時若 ≥ 2 點，消耗 2 點，在本人施放前插入一次代理執行。'],
  clues: ['線索', '資源', '凱恩的資源（最多 14 層）。追加攻擊時若大於等於 7 層，消耗 7 層並立刻獲得額外回合（每回合 1 次）。'],
  enh: ['收網就緒', '狀態', '場上有現行犯時，凱恩的普攻替換為強化普攻「收網」：對全體造成 300% 起的物理傷害，不恢復戰技點。'],
  cover: ['掩護（阿蘭）', '資源', '最多 3 點。持有時阿蘭的普攻替換為強化普攻、無法使用戰技，提供的護盾量 +10%。強化普攻消耗 1 點；歸零時額外投入 1 份火屬性餘料。'],
  exp: ['經驗', '資源', '馬克的資源（上限 15 點）。非榜樣隊友用技能攻擊敵人 +1；跬步千里 +2；循序漸進 +3；馬克的普攻、戰技 +1、終結技 +2。達到 12 點時消耗 12 點，發動追加攻擊「而勝於藍」：全體 150% 水屬性傷害並施加［知悉］。'],
  model: ['榜樣', '增益', '馬克戰技指定（場上只有一個）。榜樣與馬克暴擊率 +10%、暴擊傷害 +30%。榜樣用技能攻擊敵人或發動追加攻擊時，馬克發動追加攻擊「循序漸進」（每回合最多 2 次）；馬克的普攻會附帶榜樣攻擊力 80% 的榜樣屬性傷害。'],
  siren: ['鳴笛', '資源', '亞歷山卓的資源（上限 7 點）。敵人每行動一次 +1；普攻命中帶負面效果的敵人、戰技、護航專車持有者行動時也會獲得。達到 5 點時消耗 5 點，發動追加攻擊「圍捕行動」：全體 120% 風屬性傷害、恢復 1 戰技點，自身與護航專車持有者行動提前 19%。'],
  ticks: ['刻度', '資源', '寒夜的資源（無上限）。戰技的彈射段數 = 3 + 刻度層數，施放後清空。額外能力三：每層暴擊率 +1%，超過 100% 的暴擊率每 1% 轉為 1.5% 暴擊傷害。'],
  spread: ['擴散就緒', '狀態', '［校準任務·測度］執行後獲得。下一次戰技的前四分之一段數，對目標的相鄰敵人額外造成 30% 攻擊力空屬性傷害。'],
  recur: ['遞推', '狀態', '寒夜天賦：單次時間織機啟動使寒夜累計行動提前超過 40%。下一次戰技額外計入 5 層刻度（段數 +5）。'],
  sample: ['樣本', '標記', '寒夜終結技施加，直到寒夜下次施放戰技。寒夜持有「構築」時，戰技彈射到樣本的機率提高。構築期間樣本被消滅時，轉移到生命百分比最高的敵人。'],
  wanted: ['通緝', '標記', '自律處刑官・「雷霆-09型」施加。達到 6 層時，首領回合結束後會以額外回合「緝捕」：6～8 層受到【電棍制伏】（可能麻痺，通緝 −6），9 層以上受到【重罪處決】（毀滅性傷害，通緝清零）。在自己的回合沒有攻擊首領時，回合結束時通緝 −2；以隊友為目標的戰技會把對方的 2 層轉到自己身上。'],
  phase2: ['二階段', '狀態', '雷霆-09型的生命值降到 50% 以下時進入，立即施放【全面通緝】。'],
  suffer: ['苦難', '資源', 'O.T.G. 的資源（上限 12 點）。O.T.G. 每承受結算 1 層裂傷獲得 1 點；達到 9 點時可消耗 9 點施放終結技（能量環顯示苦難）。［瀆神之軀］狀態下無法獲得。'],
  duel: ['生死角力', '狀態', 'O.T.G. 以戰技「與獸共舞」施加於自身與一名敵人（場上同時只有一名）。O.T.G. 普攻改為強化普攻，且只能鎖定角力中的敵人；無法施放戰技。該敵人陷入嘲諷，只攻擊 O.T.G.。雙方攻擊後，為對方施加 1 層裂傷（2 回合）。該敵人受到 O.T.G. 的持續傷害 +15%；O.T.G. 承受的自身裂傷也 +15%。O.T.G. 回合開始時持續回合 −1（額外回合不扣），終結技可延長 1 回合；該敵人被擊敗或 O.T.G. 倒下時消失。'],
  mourn: ['悲悼', '持續傷害', '米勒施加的哀屬性持續傷害，每個獨立計算階段（施加時為第一階段）。敵人回合開始時造成米勒生命值上限 ×（30% + 階段 × 15%）的傷害，然後推進一個階段；第三階段結算後消失。同一目標最多 3 個（陰雨連綿 +1）；滿額後再次成功施加時，額外觸發一次最高階段的悲悼（不推進階段、不消除）。額外能力二：第一次結算時不推進階段。'],
  funeral: ['葬禮', '領域', '米勒終結技展開。進入米勒回合時持續時間 −1，歸零時消除。期間米勒回合行動時，星流向當前傾向推動 10%；星流為中節時，改為使戰技的推動值 +5%。敵方全體帶有［回響］。'],
  stun: ['禁錮', '控制', '束縛者施加。跳過下一個回合。「壁壘」可抵抗。'],
  adv: ['待拉條', '狀態', '在自己回合中獲得的行動提前，會在本回合結束、行動值重置後才生效。'],
};
/* ---------- 狀態小圖標 ----------
 * 特殊狀態：各自的圖示，底色是效果給予者的屬性色（例如護航專車＝警笛、生死角力＝鐵鍊）。
 * 常規效果（增傷、受到傷害提高、行動提前等）：常規模板，不上色，右上角以箭頭標示提高／降低。
 * 右下角的數字是剩餘回合（沒有剩餘回合就不顯示）；左上角的小數字是層數或資源值。點圖標看完整說明。 */
const GLYPH = {
  chain: '<rect x="1.5" y="8.5" width="11" height="7" rx="3.5"/><rect x="11.5" y="8.5" width="11" height="7" rx="3.5"/><path d="M7 12h10"/>',
  siren: '<path d="M6 17v-5a6 6 0 0 1 12 0v5"/><path d="M4 17h16v3H4z"/><path d="M12 2.5v2M3.5 6l1.6 1.4M20.5 6l-1.6 1.4"/><path d="M10 10a2 2 0 0 1 2-2"/>',
  cross: '<path d="M12 3v18M7.5 15h9"/><circle cx="12" cy="7" r="3.2"/>',
  belt: '<path d="M5 3l14 18"/><rect x="8.5" y="9.5" width="7" height="5" rx="1"/><path d="M12 11v2"/>',
  cuffs: '<circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/><path d="M9.5 11.5 11 8h2l1.5 3.5"/>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M8 10.5h8M8 13.5h5"/>',
  box: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
  question: '<path d="M9 9a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.8V15"/><circle cx="12" cy="18.5" r="1" fill="currentColor"/>',
  chevron: '<path d="M5 11l7-5 7 5M5 17l7-5 7 5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M12 5.5v13" stroke-dasharray="2 2"/>',
  shake: '<path d="M2.5 11l4-4 5 2.5L16 7l5.5 4-6.5 6.5-3-2-3 2z"/><path d="M9 13l3 2"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  wall: '<path d="M3 6h18v12H3zM3 10h18M3 14h18M8 6v4M14 6v4M11 10v4M17 10v4M8 14v4M14 14v4"/>',
  converge: '<path d="M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5"/><circle cx="12" cy="12" r="2.2"/>',
  breach: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><path d="M10.5 8.5 13 11l-2 2 2.5 2.5"/>',
  coins: '<ellipse cx="9" cy="7.5" rx="5" ry="2.5"/><path d="M4 7.5v4c0 1.4 2.2 2.5 5 2.5"/><ellipse cx="15" cy="14.5" rx="5" ry="2.5"/><path d="M10 14.5v3c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-3"/>',
  torn: '<path d="M6 3h8l4 4v6l-3 2 3 2v4H6z"/><path d="M9 9h5M9 13h4"/>',
  letter: '<rect x="3" y="6" width="18" height="13" rx="1"/><path d="M3 7l9 6 9-6"/>',
  star: '<path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16.3l-5.4 2.9 1.3-6-4.5-4 6-.6z"/>',
  rain: '<path d="M6 14a4.5 4.5 0 0 1 1.2-8.8A6 6 0 0 1 18 7a3.6 3.6 0 0 1 0 7z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  note: '<path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z"/><path d="M6 3v18M9.5 8h5.5M9.5 12h5.5"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  swirl: '<path d="M4 12a8 8 0 1 0 8-8"/><path d="M8 12a4 4 0 1 0 4-4"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5"/>',
  ruler: '<path d="M3 16 16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>',
  grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
  badge: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M12 7l1.4 2.8 3 .4-2.2 2.1.5 3L12 13.8l-2.7 1.5.5-3-2.2-2.1 3-.4z"/>',
  slash: '<path d="M4 20 20 4M8 21l13-13"/><path d="M6 9.5c0 1.2-.8 2.2-1.8 2.2S2.5 10.7 2.5 9.5 4.2 6 4.2 6 6 8.3 6 9.5z" fill="currentColor"/>',
  splat: '<circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 2.5v4.5M12 17v4.5M2.5 12H7M17 12h4.5M5 5l3.3 3.3M15.7 15.7 19 19M19 5l-3.3 3.3M8.3 15.7 5 19"/>',
  tear: '<path d="M12 3s5 6 5 10a5 5 0 0 1-10 0c0-4 5-10 5-10z"/><path d="M10 13.5a2 2 0 0 0 2 2"/>',
  lens: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 21 21"/><circle cx="10" cy="10" r="2" fill="currentColor"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r="1" fill="currentColor"/>',
  flask: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M6.5 15h11"/>',
  tally: '<path d="M5 5v14M9 5v14M13 5v14M17 5v14M3 15l18-6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shieldbreak: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M12 2l-2 6 3 3-2 5 1 6"/>',
  two: '<text x="12" y="17.5" text-anchor="middle" font-size="15" font-weight="900" font-family="Georgia,serif" fill="currentColor" stroke="none">Ⅱ</text>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>',
  stamp: '<path d="M9 3h6v6l3 3v3H6v-3l3-3z"/><path d="M5 18.5h14v2.5H5z"/>',
  model: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7L12 14.6l-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z"/>',
  spread: '<circle cx="12" cy="12" r="2.2"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  net: '<path d="M3 5c6 3 12 3 18 0M3 12c6 3 12 3 18 0M3 19c6-3 12-3 18 0M6 4v16M12 4v16M18 4v16"/>',
  plus5: '<text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="900" fill="currentColor" stroke="none">+5</text>',
  link: '<path d="M6 12c0-2.2 1.6-3.8 3.4-3.8 3 0 4.2 7.6 7.2 7.6 1.8 0 3.4-1.6 3.4-3.8s-1.6-3.8-3.4-3.8c-3 0-4.2 7.6-7.2 7.6C7.6 15.8 6 14.2 6 12z"/>',
  pin: '<path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/>',
  scope: '<circle cx="12" cy="12" r="8"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  book: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6v14"/>',
  ticks: '<path d="M3 18h18M5 18v-7M9 18v-4M13 18v-7M17 18v-4"/>',
  ff: '<path d="M3 6l8 6-8 6zM12 6l8 6-8 6z"/>',
  sword: '<path d="M14 3.5h6.5V10L9.5 21 6 17.5z"/><path d="M4.5 14.5l5 5M3 21l2.5-2.5"/>',
  burst: '<path d="M12 2l2 6 6-2-4 5 5 3-6 1 1 6-4-4-4 4 1-6-6-1 5-3-4-5 6 2z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  wing: '<path d="M3 17h11l6-6M3 12h9M3 7h6"/>',
  ring: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>',
  hammer: '<path d="M4 20l9-9M11 5l5-2 5 5-2 5z"/>',
  hide: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><path d="M4 4l16 16"/>',
  heal: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  dotup: '<path d="M10 4s5 6 5 10a5 5 0 0 1-10 0c0-4 5-10 5-10z"/><path d="M19 4v6M16 7h6"/>',
};
// 特殊狀態：名稱 → [圖示, 給予者]（給予者決定底色的屬性）
const SPECIAL_BUFF = {
  '護航專車': ['siren', 'alexandra'], '請系好安全帶': ['belt', 'alexandra'], '押送': ['cuffs', 'alexandra'], '違規開罰': ['ticket', 'alexandra'], '後勤支援': ['box', 'alexandra'],
  '疑點': ['question', 'mocha'], '精銳': ['chevron', 'mocha'], '帳單分開結': ['receipt', 'mocha'], '內線交易·速': ['shake', 'mocha'], '內線交易·暴': ['shake', 'mocha'], '售後服務': ['bell', 'mocha'],
  '壁壘': ['wall', 'alan'], '收束': ['converge', 'alan'], '破綻': ['breach', 'alan'],
  '財源滾滾': ['coins', 'gordon'], '債務糾紛': ['torn', 'gordon'],
  '花束·罌粟': ['@poppy', 'miller'], '花束·白菊': ['@mum', 'miller'], '回響': ['bell', 'miller'], '告死': ['letter', 'miller'], '盛大告別': ['star', 'miller'], '陰雨連綿': ['rain', 'miller'],
  '瀆神之軀': ['cross', 'otg'],
  '實戰演練': ['note', 'mark'], '知悉': ['eye', 'mark'], '流轉·跬步': ['swirl', 'mark'], '流轉·循序': ['swirl', 'mark'], '流轉·而勝': ['swirl', 'mark'], '斂藏': ['drop', 'mark'],
  '度量': ['ruler', 'hanye'], '構築': ['grid', 'hanye'],
  '執法權限': ['badge', 'raiden'],
};
// 角色機制的狀態（不在 buffs 裡）：s:key → [圖示, 給予者 或 null（常規）, 是否為資源]
const SPECIAL_ST = {
  lacer: ['slash', 'longzhao'], bb: ['splat', 'longzhao'], record: ['tally', 'longzhao'], peek: ['lens', 'kane'], flagrant: ['lens', 'kane'], enh: ['net', 'kane', 1], clues: ['pin', 'kane', 1],
  sample: ['flask', 'hanye'], spread: ['spread', 'hanye', 1], recur: ['plus5', 'hanye', 1], ticks: ['ticks', 'hanye', 1],
  phase2: ['two', 'raiden'], duel: ['chain', 'otg'], suffer: ['cross', 'otg', 1], mourn: ['tear', 'miller'], funeral: ['umbrella', 'miller'],
  proxy: ['stamp', 'mocha'], mark: ['stamp', 'mocha'], tacit: ['link', 'mocha', 1], cover: ['scope', 'alan', 1], model: ['model', 'mark'], exp: ['book', 'mark', 1], siren: ['siren', 'alexandra', 1],
  stun: ['lock', null], broken: ['shieldbreak', null], adv: ['ff', null],
};
// 金句、妙具給的效果一律走常規模板：沒有數值欄位的，依實際效果指定圖示
const REG_NAME = { '流動資本': 'sword', '鎖定': 'burst', '罪證確鑿': 'star', '附加條款': 'sword', '不退讓': 'shield', '封鎖': 'shieldbreak', '受難': 'burst', '開道': 'burst',
  '利滾利': 'dotup', '履約保證': 'sword', '整理筆記': 'burst', '雨聲': 'dotup', '草稿': 'star', '讓路': 'wing', '演算': 'star' };
// 常規模板：依效果的主要數值挑圖示
const REG_STAT = [['atkPct', 'sword'], ['atkFlat', 'sword'], ['dmgBonus', 'burst'], ['cr', 'star'], ['cd', 'star'], ['dmgTakenUp', 'shieldbreak'], ['defRed', 'shield'], ['dmgTakenRed', 'shield'],
  ['dmgDealtRed', 'sword'], ['spdPct', 'wing'], ['resRed', 'ring'], ['resPen', 'ring'], ['aggroDown', 'hide'], ['healUp', 'heal']];
const giverColor = k => ELEM_COLOR[k === 'raiden' ? 'thunder' : (Engine.CHARS[k] || {}).elem] || '#8a8aa0';
/** 淺色底（例如物理的銀白）改用深色圖示，維持對比 */
function lightColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 175;
}
/** 一個狀態圖標。o = { glyph, by, reg, down, turns, stack, title, hot } */
function stIcon(st, o) {
  const g = o.glyph || '';
  const face = g[0] === '@' ? `<i class="sfl ${g === '@poppy' ? 'r' : 'w'}"></i>` : GLYPH[g] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPH[g]}</svg>` : `<em>${esc((o.title || '?')[0])}</em>`;
  const cls = ['sic', o.reg ? 'reg' : 'sp', o.res ? 'res' : '', o.down ? 'down' : o.reg ? 'up' : '', o.hot ? 'hot' : '', o.solid ? 'solid-mark' : ''].join(' ');
  const ec = o.reg ? '' : giverColor(o.by);
  return `<span class="${cls}${ec && lightColor(ec) ? ' lt' : ''}" data-st="${esc(st)}" title="${esc(o.title || '')}"${ec ? ` style="--ec:${ec}"` : ''}>${face}${o.stack > 1 || (o.res && o.stack != null) ? `<i class="stk">${o.stack}</i>` : ''}${o.turns > 0 ? `<b>${o.turns}</b>` : ''}</span>`;
}
/** 角色機制的狀態（裂傷、管中窺豹、生死角力……） */
function statusChip(key, title, o) {
  o = o || {};
  const [glyph, by, res] = SPECIAL_ST[key] || ['', null];
  return stIcon('s:' + key, Object.assign({ glyph, by, reg: !by, res: !!res, title }, o));
}
function buffChips(u) {
  return u.buffs.map(b => {
    const bad = !!(b.debuff || b.stats.defRed || b.stats.dmgDealtRed || b.stats.dmgTakenUp);
    const sp = SPECIAL_BUFF[b.name], turns = b.dur < 900 ? b.dur : 0;
    const title = `${b.name}${b.stacks ? ` ×${b.stacks}` : ''}${turns ? `（剩 ${turns} 回合）` : ''}${BUFF_INFO[b.name] ? '：' + BUFF_INFO[b.name][1] : ''}`;
    if (sp) return stIcon('b:' + b.name, { glyph: sp[0], by: sp[1], turns, stack: b.stacks, title });
    const st = REG_STAT.find(([k]) => b.stats[k]);
    return stIcon('b:' + b.name, { glyph: REG_NAME[b.name] || (st ? st[1] : ''), reg: true, down: bad, turns, stack: b.stacks, title });
  }).join('');
}
function showStatus(chipEl) {
  const uid = chipEl.closest('[data-uid]').dataset.uid;
  const st = chipEl.dataset.st;
  const W = viewState();
  const u = W.units.find(x => x.id === uid);
  if (!u) return;
  let title, tag, desc, extra = [];
  if (st.startsWith('b:')) {
    const b = u.buffs.find(x => x.name === st.slice(2));
    if (!b) return;
    [tag, desc] = BUFF_INFO[b.name] || [b.debuff || b.stats.defRed || b.stats.dmgDealtRed ? '減益' : '增益', ''];
    title = b.name;
    extra = Object.entries(b.stats).map(([k, v]) => statLine(k, v));
    if (b.stacks) extra.push(`目前 ${b.stacks} 層`);
    extra.push(b.consume ? '下一次攻擊後移除' : b.dur < 900 ? `剩餘 ${b.dur} 回合（以 ${u.name} 的回合計）` : '持續到觸發為止');
  } else {
    const key = st.slice(2);
    [title, tag, desc] = ST_INFO[key] || [key, '', ''];
    if (key === 'lacer') extra.push(`${u.lacer.length} 層，剩餘回合：${u.lacer.map(s => s.dur).join('、')}`);
    if (key === 'bb') extra.push(`${u.bloodBreak} 層，將在 ${u.name} 下次回合開始時結算`);
    if (key === 'record') extra.push(`目前記錄 ${u.record} 層`);
    if (key === 'tacit') extra.push(`目前 ${u.tacit} 點`);
    if (key === 'clues') extra.push(`目前 ${u.clues}/14 層`);
    if (key === 'cover') extra.push(`目前 ${u.cover}/3 點`);
    if (key === 'siren') extra.push(`目前 ${u.siren}/7 點`);
    if (key === 'exp') extra.push(`目前 ${u.exp || 0}/15 點`);
    if (key === 'ticks') extra.push(`目前 ${u.ticks} 層`);
    if (key === 'mourn') extra.push(`${u.mourn.length} 個：${u.mourn.map(m => `第${m.st}階段${m.first ? '（尚未結算）' : ''}`).join('、')}`);
    if (key === 'funeral') extra.push(`剩餘 ${u.funeral} 回合`);
    if (key === 'suffer') extra.push(`目前 ${u.suffer || 0}/12 點`);
    if (key === 'wanted') extra.push(`目前 ${u.wanted || 0} 層${u.wanted >= 9 ? '（將被重罪處決）' : u.wanted >= 6 ? '（將被緝捕）' : ''}`);
    if (key === 'duel' && W.duel) { const f = W.units.find(x => x.id === W.duel.id); extra.push(`對象：${f ? f.name : '—'}，剩餘 ${W.duel.dur} 回合`); }
    if (key === 'mark' || key === 'proxy') extra.push(`印記：${u.mark || '無'}`);
    if (key === 'broken') extra.push(`韌性 0/${u.maxTough}`);
    if (key === 'adv') extra.push(`待生效 ${Engine.pct(u.pendingAdv)}`);
  }
  openPop(chipEl, `<div class="pop-h"><b>${esc(title)}</b><span class="ptag ${tag === '減益' || tag === '控制' ? 'bad' : ''}">${esc(tag)}</span></div>
    <div class="pop-d">${esc(desc)}</div>${extra.length ? `<ul>${extra.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="pop-u">${esc(u.name)}</div>`);
}

/* ================= 戰鬥畫面 ================= */
function particles() {
  const orb = Array.from({ length: 16 }, (_, i) => `<i style="--a:${(i * 360 / 16).toFixed(1)}deg;animation-delay:${(-i * 0.09).toFixed(2)}s"></i>`).join('');
  const sp = Array.from({ length: 12 }, () => `<b style="left:${(Math.random() * 100).toFixed(0)}%;animation-delay:${(Math.random() * 1.8).toFixed(2)}s"></b>`).join('');
  return `<div class="orbit">${orb}</div><div class="sparks">${sp}</div>`;
}

const ENEMY_GLYPH = { thug: '打', binder: '縛', guard: '盾', medic: '醫', boss: '首', raiden: '雷' };
const ELEM_HEX = ELEM_COLOR;

/** 戰場左側的大型立繪：換人時滑入，敵人行動時轉暗，終結技蓄勢時發光 */
function updateSplash(key, isArmed, dim) {
  const el = $('#splash');
  if (!el) return;
  const art = key && Art.get(key);
  if (art && el.dataset.key !== key) {
    el.dataset.key = key;
    el.style.setProperty('--elem', ELEM_HEX[Engine.CHARS[key].elem]);
    el.innerHTML = `<img src="${art.url}" alt=""><div class="sp-name">${esc(Engine.CHARS[key].fullName || Engine.CHARS[key].name)}</div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  } else if (key && !art && el.dataset.key) {   // 還沒有立繪的角色：不要沿用上一位的立繪
    el.dataset.key = '';
    el.innerHTML = '';
  }
  el.classList.toggle('armed', isArmed);
  el.classList.toggle('dim', dim && !isArmed);
  el.classList.toggle('none', !el.dataset.key);
}

/** 關閉長演出時的快速施放：角色專屬物件、背景與立繪，不改變戰鬥佇列。 */
function showCutin(uid, previewKey) {
  const W = viewState();
  const u = previewKey && Engine.CHARS[previewKey] ? { key: previewKey, side: 'ally' }
    : (W.units || []).find(x => x.id === uid) || Engine.state().units.find(x => x.id === uid);
  if (!u || u.side !== 'ally') return;
  const ch = Engine.CHARS[u.key], art = Art.get(u.key);
  const dur = 1.35 / Math.min(CFG.ui.speed, 2);
  const el = document.createElement('div');
  const design = typeof CastFx !== 'undefined' ? CastFx : null;
  const theme = design ? design.theme(u.key) : [ELEM_HEX[ch.elem], '#161b30', '終結技'];
  document.querySelectorAll('.cutin').forEach(x => x.remove());
  el.className = 'cutin ci-' + u.key;
  el.dataset.character = u.key;
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--elem', ELEM_HEX[ch.elem]);
  el.style.setProperty('--ci-accent', theme[0]);
  el.style.setProperty('--ci-dark', theme[1]);
  el.style.setProperty('--dur', dur + 's');
  let img = '';
  if (art) {
    const h = innerHeight * 1.2, s = h / art.h;
    const left = innerWidth * (art.duo ? 0.29 : 0.27) - art.facePx[0] * s, top = innerHeight * 0.29 - art.facePx[1] * s;
    img = `<img class="ci-art" src="${art.url}" style="height:${h}px;left:${left}px;top:${top}px" alt="">`;
  }
  const car = Art.get('police_car');
  el.innerHTML = `<div class="ci-backdrop"></div><div class="ci-band"></div>${design ? design.markup(u.key, { carUrl: car && car.url }) : ''}${img}
    <div class="ci-text"><em>${esc(theme[2])}</em><small>${esc(ch.fullName || ch.name)}</small><b>${esc(ch.actions.ult)}</b><i class="ci-rule"></i></div>`;
  document.body.appendChild(el);
  impactLater(() => el.remove(), dur * 1000 + 100);
  return dur * 1000;
}
/* ---------- 數值條漸變：先以上次的值繪製，下一幀改成新值，交給 CSS transition ---------- */
function tw(key, val) { const p = prevVals[key]; prevVals[key] = val; return { from: p == null ? val : p, to: val }; }
function barAttr(key, pct) { const v = tw(key, pct); return `style="width:${v.from}%" data-twp="width" data-tw="${v.to}%"`; }
function applyTweens() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('[data-tw]').forEach(el => { el.style.setProperty(el.dataset.twp, el.dataset.tw); el.removeAttribute('data-tw'); });
  }));
}

/* ---------- 敵人剪影 ---------- */
/*
 * 敵人人形（viewBox 0 0 120 180，頭部中心約在 60,26）。
 * 軀幹、分開的手臂與雙腿以左右漸層（#gE）做出立體感，外框以紅色輪廓光勾勒，
 * 每種敵人再疊上自己的服裝與裝備。
 */
const EN = {
  head: 'M60 11c8 0 13.5 6 13.5 14.5S68 42 60 42s-13.5-8-13.5-16.5S52 11 60 11z',
  neck: 'M54 39h12l1.5 9h-15z',
  torso: 'M43 48c6-4.5 28-4.5 34 0l9 6.5c3 3 3.8 7 3 12l-2.2 20L83 120H37l-3.8-33.5-2.2-20c-.8-5 0-9 3-12z',
  armL: 'M34.5 54.5c-5 2.5-8 7.5-8.2 13.5L23.5 100c-.2 4 1.7 6.5 5 6.5l2.8-.8 4-33.5z',
  armR: 'M85.5 54.5c5 2.5 8 7.5 8.2 13.5l2.8 32c.2 4-1.7 6.5-5 6.5l-2.8-.8-4-33.5z',
  legs: 'M38.5 118 36 148l-2 27h13.5l3.8-29.5L57 120zM81.5 118 84 148l2 27H72.5l-3.8-29.5L63 120z',
};
function enemySvg(unit, viewBox) {
  const type = typeof unit === 'string' ? unit : unit.type;
  const artKey = Art.enemyKey(unit);
  // 首領有專屬立繪時優先使用；其次是水墨剪影素材（viewBox 參數代表只要頭部特寫：行動軸、波次小頭像）
  const ep = Engine.ENEMY_TYPES[type] && Engine.ENEMY_TYPES[type].boss && Art.get(artKey);
  if (ep) return viewBox ? `<i class="eface eport" data-art="${artKey}" style="${Art.bg(artKey, 'face', 300)}"></i>`
    : `<img class="eimg eportrait ei-${type}" data-art="${artKey}" src="${ep.url}" alt="" draggable="false">`;
  const ea = Art.enemy(unit);
  if (ea) return viewBox ? `<i class="eface" style="${Art.enemyBg(type, 260)}"></i>`
    : `<img class="eimg ei-${type}" src="${ea.url}" alt="" draggable="false">`;
  let under = '', over = '', eyes = '<ellipse class="eye" cx="55" cy="26" rx="2.6" ry="1.3"/><ellipse class="eye" cx="65" cy="26" rx="2.6" ry="1.3"/>';
  const bodyOf = coat => `<path d="${EN.legs}"/>${coat}<path d="${EN.armL}"/><path d="${EN.armR}"/><path d="${EN.torso}"/><path d="${EN.neck}"/>`;
  let body = null;
  const hands = '<circle cx="28" cy="107" r="4.2"/><circle cx="92" cy="107" r="4.2"/>';
  const shoes = '<ellipse cx="40.5" cy="176" rx="8" ry="3.2"/><ellipse cx="79.5" cy="176" rx="8" ry="3.2"/>';
  const det = '<path class="det" d="M60 50v68M52 48l8 9 8-9M44 98h9M67 98h9M39 118h42"/>';
  let head = `<path d="${EN.head}"/>`;
  switch (type) {
    case 'thug':      // 連帽衫、球棒
      head += '<path d="M45 32c-1.5-13 6-22 15-22s16.5 9 15 22l2.5 13c-5 3.5-10 4.5-17.5 4.5S47.5 48.5 42.5 45z"/><ellipse class="face" cx="60" cy="29" rx="8.5" ry="10"/>';
      over = '<path class="wpn" d="M92 106 111 58"/><path class="tape" d="M93.5 101.5l3.2 1.3M95 97.5l3.2 1.3"/>';
      break;
    case 'binder':    // 毛帽、纏身鎖鏈、鎖鏈鞭
      head += '<path d="M46.5 22c1.5-9 7-13 13.5-13s12 4 13.5 13c-4 2-8.5 2.8-13.5 2.8S50.5 24 46.5 22z"/><circle cx="60" cy="8" r="2.6"/>';
      over = '<path class="chain" d="M35 60Q60 88 85 62M33 84Q60 110 87 86"/><path class="chain" d="M92 110q18 8 12 28t10 32"/><circle class="ball" cx="114" cy="172" r="5"/>';
      break;
    case 'guard':     // 頭盔護目鏡、壯碩、防暴盾
      body = `<g transform="translate(-11 0) scale(1.18 1)">${bodyOf('')}</g>`;
      head = `<path d="${EN.head}"/><path d="M45.5 27c0-11 6.5-17 14.5-17s14.5 6 14.5 17v5h-29z"/><rect class="visor" x="47.5" y="24" width="25" height="5.5" rx="2"/>`;
      eyes = '';
      over = '<rect class="shield" x="33" y="58" width="54" height="86" rx="9"/><rect class="slit" x="45" y="66" width="30" height="6" rx="2"/><path class="det" d="M60 76v60M40 104h40"/>';
      break;
    case 'medic':     // 白袍、口罩、針筒、紅十字臂章
      under = '<path class="lab" d="M42 50c6-4 30-4 36 0l8 7-1 40 4 55H31l4-55-1-40z"/>';
      head += '<path class="mask" d="M52 31h16v7c0 3.5-3.8 5.5-8 5.5s-8-2-8-5.5z"/>';
      over = '<path class="cross" d="M88 66h4v4h4v4h-4v4h-4v-4h-4v-4h4z"/><path class="wpn thin" d="M26 108 14 124"/><path class="det" d="M60 50v100"/>';
      break;
    case 'boss':      // 紳士帽、長大衣、手杖、金鍊、雪茄
      under = '<path class="coat" d="M41 49c6-5.5 32-5.5 38 0l11 8 5 58 9 60H16l9-60 5-58z"/>';
      head += '<ellipse cx="60" cy="15" rx="24" ry="5.5"/><path d="M46.5 15c1-9.5 6.5-13 13.5-13s12.5 3.5 13.5 13z"/><path class="band" d="M47 13h26"/>';
      over = '<path class="wpn" d="M94 108 100 176"/><circle class="gold" cx="93.5" cy="106" r="3.5"/><path class="goldline" d="M52 72q8 9 16 0"/><path class="cigar" d="M65 35h9"/><circle class="ember" cx="74.5" cy="35" r="1.6"/>';
      eyes = '<ellipse class="eye gold" cx="55" cy="26" rx="2.6" ry="1.2"/><ellipse class="eye gold" cx="65" cy="26" rx="2.6" ry="1.2"/>';
      break;
  }
  if (!body) body = bodyOf(under);
  return `<svg viewBox="${viewBox || '0 0 120 180'}" aria-hidden="true"><g class="silh">${body}${hands}${shoes}${head}</g>${type === 'medic' || type === 'boss' ? '' : det}${over}${eyes}</svg>`;
}

/**
 * 敵人血條。分階段的首領（雷霆-09型：50% 轉階段）每個階段各自是一條滿血條，
 * 旁邊的方塊代表其他階段：實心 ■ = 尚未擊敗（排在左側），空心 □ = 已擊敗（排在右側）。
 */
function hpBar(e, pu, hpLoss) {
  const phased = e.type === 'raiden';
  if (!phased) return `<div class="bar hp"><i ${barAttr('ehp:' + e.id, Math.max(0, e.hp / e.maxHp * 100))}></i>${hpLoss > 0.5 ? `<em class="pvloss" style="left:${Math.max(0, pu.hp) / e.maxHp * 100}%;width:${hpLoss / e.maxHp * 100}%"></em>` : ''}</div>`;
  // 兩管血條：總生命值不變，前一半是第一管（Ⅰ）、後一半是第二管（Ⅱ）；溢出的傷害直接打進第二管
  const half = e.maxHp / 2, p2 = !!e.phase2, after = pu ? Math.max(0, pu.hp) : e.hp;
  const row = (n, frac) => {
    const now = frac(e.hp), nxt = frac(after), cur = n === (p2 ? 2 : 1);
    return `<div class="phrow p${n}${cur ? ' cur' : ''}${now <= 0 ? ' gone' : ''}"><b>${n === 1 ? 'Ⅰ' : 'Ⅱ'}</b><div class="bar hp ph${n}"><i ${barAttr(`ehp:${e.id}:p${n}`, now * 100)}></i>${hpLoss > 0.5 && now > nxt ? `<em class="pvloss" style="left:${nxt * 100}%;width:${(now - nxt) * 100}%"></em>` : ''}</div></div>`;
  };
  const f1 = h => Math.max(0, Math.min(1, (h - half) / half)), f2 = h => Math.max(0, Math.min(1, h / half));
  return `<div class="phbars" title="兩管血條：第 ${p2 ? 2 : 1} 管（共 2 管）。第一管打空時進入二階段，清除身上所有常規負面效果。">${row(1, f1)}${row(2, f2)}</div>`;
}
function enemyUnit(e, W, S) {
  const c = [];
  if (e.broken) c.push(statusChip('broken', '弱點擊破', { down: true }));
  if (e.lacer.length) { const o = e.lacer.filter(x => x.orig).length; c.push(statusChip('lacer', `裂傷 ×${e.lacer.length}${o ? `（原罪 ${o}）` : ''}`, { stack: e.lacer.length, turns: Math.max(...e.lacer.map(x => x.dur)), hot: o > 0 })); }
  if (e.bloodBreak) c.push(statusChip('bb', `血破 ×${e.bloodBreak}`, { stack: e.bloodBreak }));
  if (e.record) c.push(statusChip('record', `裂痕記錄 ${e.record}`, { stack: e.record }));
  if (e.flagrant) c.push(statusChip('flagrant', '現行犯 · 收網就緒（實心）', { hot: true, solid: true }));
  else if (e.peek) c.push(statusChip('peek', '管中窺豹（空心）'));
  if (e.sample) c.push(statusChip('sample', '樣本'));
  if (e.type === 'raiden' && e.phase2) c.push(statusChip('phase2', '二階段'));
  if (W.duel && W.duel.id === e.id) c.push(statusChip('duel', `生死角力（剩 ${W.duel.dur} 回合）`, { turns: W.duel.dur }));
  if (e.mourn && e.mourn.length) c.push(statusChip('mourn', `悲悼 ×${e.mourn.length}（階段 ${e.mourn.map(m => m.st).join('·')}）`, { stack: e.mourn.length }));
  if (e.pendingAdv) c.push(statusChip('adv', `待拉條 ${Engine.pct(e.pendingAdv)}`));
  const type = Engine.ENEMY_TYPES[e.type];
  // 行動預覽：預計損失的生命、韌性以浮動的殘影標示
  const pu = curPv && e.alive && curPv.res.units.find(x => x.id === e.id);
  const hpLoss = pu ? Math.max(0, e.hp - Math.max(0, pu.hp)) : 0, tgLoss = pu ? Math.max(0, e.tough - (pu.tough || 0)) : 0;
  if (pu && pu.killed) c.unshift('<span class="chip pv-chip kill">預計擊敗</span>');
  else if (pu && pu.broken) c.unshift('<span class="chip pv-chip brk">⚡ 預計擊破</span>');
  const cls = ['eunit', 'et-' + e.type, e.type === 'raiden' && e.phase2 ? 'raiden-phase2' : '', e.alive ? '' : 'dead', e.broken ? 'broken' : '', S.target === e.id ? 'sel' : '', W.current === e.id ? 'acting' : '', e.alive && duelLock(S, W) && duelLock(S, W) !== e.id ? 'nolock' : '', pu && pu.dmg > 0.5 ? 'pv-hit' : ''].join(' ');
  const weak = e.weak.map(w => `<b class="${w}">${ELEM_NAME[w]}</b>`).join('');
  return `<div class="${cls}" data-enemy="${e.id}" data-uid="${e.id}" title="${esc(type.name)}：${esc(type.desc)}">
    <div class="ehud">
      <div class="enm"><i class="ebadge">${ENEMY_GLYPH[e.type] || '敵'}</i><b>${esc(e.name)}</b><small>Lv.${e.base.lvl}</small></div>
      ${pu && pu.dmg > 0.5 ? `<span class="pvnum">−${fmt(pu.dmg)}</span>` : ''}
      ${hpBar(e, pu, hpLoss)}
      ${e.shield > 0 ? `<div class="bar sh"><i style="width:${Math.min(100, e.shield / e.maxHp * 400)}%"></i></div>` : ''}
      ${S.rules.toughness !== false ? `<div class="bar tough"><i ${barAttr('etg:' + e.id, e.tough / e.maxTough * 100)}></i>${tgLoss > 0.01 ? `<em class="pvloss tg" style="left:${(pu.tough || 0) / e.maxTough * 100}%;width:${tgLoss / e.maxTough * 100}%"></em>` : ''}</div>` : ''}
      <div class="enums"><span>${fmt(Math.max(0, e.hp))}${e.shield > 0 ? ` <em class="shv">🛡${fmt(e.shield)}</em>` : ''}</span><span class="weak">${weak}</span></div>
    </div>
    <div class="efig">${enemySvg(e)}${cashLockMark(cbLocks, e.id)}</div>
    <div class="ebase"></div>
    <div class="chips">${c.join('')}${buffChips(e)}</div>
  </div>`;
}

const ENDED = ['win', 'lose', 'timeout'];
// 罌粟與白菊：和米勒終結技動畫同一款，畫成小圖給 CSS 使用（花瓣特效、葬禮花圈）
try { document.documentElement.style.setProperty('--fl-poppy', `url(${UltFx.flowerSprite(0)})`); document.documentElement.style.setProperty('--fl-mum', `url(${UltFx.flowerSprite(1)})`); } catch (e) { /* 畫不出來就沿用 CSS 的備用圖形 */ }
/** 生死角力：輪到持有生死角力的 O.T.G. 時，普攻只能鎖定角力中的敵人（回傳該敵人 id，否則 null） */
function duelLock(S, W) {
  W = W || S;
  if (!W.duel || armed) return null;
  const cur = (W.units || S.units).find(u => u.id === (W.current || S.current));
  return cur && cur.side === 'ally' && cur.key === 'otg' ? W.duel.id : null;
}
function sufferChargeMarkup(a) {
  const n = Math.max(0, Math.min(12, a.suffer || 0));
  const bl = a.buffs.find(b => b.name === '瀆神之軀');
  if (bl) {   // 終結技啟動後：圖標改為「瀆神之軀」剩餘回合（三段血色弧，逐回合熄滅）
    const arc = i => { const p = d => [40 + 33 * Math.cos(d * Math.PI / 180), 40 + 33 * Math.sin(d * Math.PI / 180)].map(v => v.toFixed(2)).join(' '); return `M ${p(i * 120 - 84)} A 33 33 0 0 1 ${p(i * 120 + 24)}`; };
    return `<svg class="suffer-dial blas-dial" viewBox="0 0 80 80" aria-hidden="true"><circle class="suffer-orbit" cx="40" cy="40" r="39"/>${[0, 1, 2].map(i => `<path class="blas-seg${i < bl.dur ? ' lit' : ''}" d="${arc(i)}"/>`).join('')}</svg>
      <span class="suffer-count blas-count" aria-hidden="true"><small>瀆神之軀</small><b>${bl.dur}</b><em>回合</em></span>`;
  }
  const seals = Array.from({ length: 9 }, (_, i) => {
    const point = deg => [40 + 33 * Math.cos(deg * Math.PI / 180), 40 + 33 * Math.sin(deg * Math.PI / 180)].map(v => v.toFixed(2)).join(' ');
    return `<path class="suffer-link${i < n ? ' lit' : ''}" d="M ${point(i * 40 - 84)} A 33 33 0 0 1 ${point(i * 40 - 56)}"/>`;
  }).join('');
  return `<svg class="suffer-dial" viewBox="0 0 80 80" aria-hidden="true"><circle class="suffer-orbit" cx="40" cy="40" r="39"/>${seals}</svg>
    <span class="suffer-moon" aria-hidden="true"></span><span class="suffer-cross" aria-hidden="true"></span>
    <span class="suffer-count" aria-hidden="true"><small>苦難</small><b>${n}</b></span>
    <span class="suffer-reserve" aria-hidden="true">${[10, 11, 12].map(v => `<i class="${n >= v ? 'lit' : ''}"></i>`).join('')}</span>`;
}
/**
 * 破格立繪：完整呈現上半身（頭頂到腰部），頭部突出卡片上緣，下半身淡入卡片。
 * 以立繪載入時量到的頭頂位置（art.top）對齊容器上緣，保證不會削到頭頂；
 * 縮放讓「頭頂 → 腰部（胸口再往下 1.1 倍的臉胸距離）」剛好填滿容器高度。
 */
const POP_PAD = 4;
// 橫向手機：卡片的立繪區縮小（與 style.css「手機橫屏適配」的 .art-pop 高度一致）
const compactLayout = () => !!(window.matchMedia && window.matchMedia('(orientation: landscape) and (max-height: 540px)').matches);
function popArt(key, art, blas) {
  const POP_H = compactLayout() ? 28 + 62 : 58 + 134;
  const fy = art.face[1], by = art.bust ? Math.max(art.bust[1], fy + 0.05) : fy + 0.2;
  const top = art.top != null ? Math.min(art.top, fy) : Math.max(0, fy - 0.6 * (by - fy));
  const waist = Math.min(1, by + 1.1 * (by - fy));
  const sc = (POP_H - POP_PAD) / Math.max(40, (waist - top) * art.h), H = art.h * sc;
  const y = POP_PAD - top * H, left = art.face[0] * art.w * sc;
  // 瀆神之軀：動畫的起點依目前時間推算（畫面更新時接續播放，不會重頭開始）
  const back = blas ? `<div class="bl-aura back"><i class="glow" style="${syncAnim(1400)}"></i><i class="ring" style="${syncAnim(6000)}"></i><i class="cross" style="${syncAnim(1400)}"></i></div>` : '';
  const front = blas ? `<div class="bl-aura front">${Array.from({ length: 12 }, (_, i) => { const d = 1400 + (i % 4) * 350; return `<b style="left:${4 + i * 8}%;animation-duration:${d}ms;${syncAnim(d, i * 290)}"></b>`; }).join('')
    }${Array.from({ length: 6 }, (_, i) => { const d = 2600 + (i % 3) * 500; return `<s style="left:${18 + i * 12.5}%;animation-duration:${d}ms;${syncAnim(d, i * 610)}"></s>`; }).join('')}</div>` : '';
  return `<div class="art-pop">${back}<img src="${art.url}" alt="" draggable="false" style="height:${H.toFixed(0)}px;top:${y.toFixed(0)}px;left:calc(50% - ${left.toFixed(0)}px)">${front}</div>`;
}
/** 讓重新產生的元素接續原本的 CSS 動畫進度：animation-delay = −(目前時間 mod 週期) */
function syncAnim(period, offset) { return `animation-delay:-${(((performance.now() + (offset || 0)) % period) / 1000).toFixed(3)}s`; }
/** O.T.G. 瀆神之軀：頭頂的血色光環（流光沿環流動）與從光環滴落的血 */
function bloodHalo() {
  return `<div class="bl-halo"><i class="hl" style="${syncAnim(2400)}"></i><i class="hl2" style="${syncAnim(1400)}"></i>${[0, 1, 2].map(i => `<b style="left:${28 + i * 22}%;${syncAnim(2200 + i * 400, i * 700)};animation-duration:${2200 + i * 400}ms"></b>`).join('')}</div>`;
}
/** 頭頂上的「通緝」標記：6 層以上會被緝捕（橘），9 層以上會被處決（紅、閃爍） */
function wantedMark(n) {
  const lv = n >= 9 ? 'crit' : n >= 6 ? 'hot' : '';
  return `<div class="wanted-mark ${lv}" data-st="s:wanted" title="通緝 ${n} 層${n >= 9 ? '：將被重罪處決' : n >= 6 ? '：將被緝捕' : ''}"><small>WANTED</small><b>${n}</b></div>`;
}
function allyCard(a, W, S, idx) {
  const c = [];
  if (a.mark) c.push(W.proxy === a.id ? statusChip('proxy', `被代理人［${a.mark}］`, { hot: true }) : statusChip('mark', `印記［${a.mark}］`));
  if (a.key === 'mocha') c.push(statusChip('tacit', `默契 ${a.tacit}`, { stack: a.tacit || 0, hot: (a.tacit || 0) >= 2 }));
  if (a.key === 'kane') {
    c.push(statusChip('clues', `線索 ${a.clues}/14`, { stack: a.clues || 0, hot: a.clues > 7 }));
    if (Engine.kaneEnhanced(W.units)) c.push(statusChip('enh', '收網就緒', { hot: true }));
  }
  if (a.key === 'alan') c.push(statusChip('cover', `掩護 ${a.cover}/3`, { stack: a.cover || 0, hot: a.cover > 0 }));
  if (W.model === a.id && W.units.some(x => x.key === 'mark' && x.alive)) c.push(statusChip('model', '榜樣'));
  if (a.key === 'mark') c.push(statusChip('exp', `經驗 ${a.exp || 0}/15`, { stack: a.exp || 0, hot: a.exp >= 12 }));
  if (a.key === 'alexandra') c.push(statusChip('siren', `鳴笛 ${a.siren || 0}/7`, { stack: a.siren || 0, hot: a.siren >= 5 }));
  if (a.key === 'hanye') {
    c.push(statusChip('ticks', `刻度 ${a.ticks || 0}`, { stack: a.ticks || 0, hot: a.ticks >= 8 }));
    if (a.spreadReady) c.push(statusChip('spread', '擴散就緒', { hot: true }));
    if (a.recurBonus) c.push(statusChip('recur', '遞推 +5', { hot: true }));
  }
  if (a.key === 'otg') {
    c.push(statusChip('suffer', `苦難 ${a.suffer || 0}/12`, { stack: a.suffer || 0, hot: (a.suffer || 0) >= 9 }));
    if (W.duel) c.push(statusChip('duel', `生死角力（剩 ${W.duel.dur} 回合）`, { turns: W.duel.dur }));
  }
  if (a.lacer && a.lacer.length) c.push(statusChip('lacer', `裂傷 ×${a.lacer.length}`, { stack: a.lacer.length, turns: Math.max(...a.lacer.map(x => x.dur)) }));
  if (a.key === 'miller' && a.funeral) c.push(statusChip('funeral', `葬禮（剩 ${a.funeral} 回合）`, { turns: a.funeral }));
  if (a.stunned) c.push(statusChip('stun', '禁錮', { down: true }));
  if (a.pendingAdv) c.push(statusChip('adv', `待拉條 ${Engine.pct(a.pendingAdv)}`));
  const art = Art.get(a.key);
  const enP = Math.min(1, a.energy / a.maxEnergy);
  const full = enP >= 1 - 1e-9;
  const canPress = full && a.alive && !ENDED.includes(S.phase);
  const isArmed = armed === a.id, queued = ultQueue.includes(a.id);
  const en = tw('en:' + a.id, enP);
  const blas = a.key === 'otg' && a.buffs.some(b => b.name === '瀆神之軀');
  const cls = ['card', 'ally', 'el-' + a.elem, art ? 'has-art breakout' : '', blas ? 'blasphemy' : '', a.alive ? '' : 'dead', S.allyTarget === a.id ? 'sel' : '', W.current === a.id && !armed ? 'acting' : '', isArmed ? 'armed' : ''].join(' ');
  const otg = a.key === 'otg', blocked = otg && a.buffs.some(b => b.name === '瀆神之軀');
  const orb = ['ultorb', otg ? 'otg-charge' : '', blocked ? 'suffer-locked' : '', full ? 'ready' : '', isArmed ? 'arm' : '', queued ? 'queued' : ''].join(' ');
  const lbl = queued ? '預約中' : isArmed ? '再按發動' : otg ? blocked ? `瀆神之軀 剩 ${a.buffs.find(b => b.name === '瀆神之軀').dur} 回合` : full ? `終結技${a.suffer > 9 ? ' · 餘蓄 ' + (a.suffer - 9) : ''}` : `${a.suffer || 0}/9` : full ? '終結技' : `${Math.floor(enP * 100)}%`;
  const resourceTip = otg ? blocked ? `瀆神之軀剩餘 ${a.buffs.find(b => b.name === '瀆神之軀').dur} 回合（期間無法獲得苦難；目前苦難 ${a.suffer || 0}/12）` : `苦難 ${a.suffer || 0}/12，9 點可施放，消耗後保留餘蓄` : `能量 ${a.energy.toFixed(0)}/${a.maxEnergy}`;
  return `<div class="${cls}" data-ally="${a.id}" data-uid="${a.id}" style="--elem:${ELEM_HEX[a.elem]}">
    ${art ? `<div class="art art-bg"></div>${popArt(a.key, art, blas)}<div class="art-shade"></div>` : ''}${blas ? bloodHalo() : ''}
    ${a.wanted ? wantedMark(a.wanted) : ''}
    ${isArmed ? particles() : ''}
    <button class="${orb}" data-ult="${a.id}" ${canPress ? '' : 'disabled'} aria-label="${esc(a.name)} 終結技，${resourceTip}，${lbl}" title="終結技【${esc(Engine.CHARS[a.key].actions.ult)}】${resourceTip}（鍵盤 ${idx + 1}）"
      style="--en:${en.from}" data-twp="--en" data-tw="${en.to}">
      <span class="orb-face" style="${art ? Art.bg(a.key, 'face', 380) : ''}"></span>${otg ? sufferChargeMarkup(a) : '<span class="orb-ring"></span>'}<span class="orb-lbl">${lbl}</span>
    </button>
    <div class="nm"><span>${esc(a.name)}</span><span class="tag">${ELEM_NAME[a.elem]}</span></div>
    <div class="bar hp"><i ${barAttr('ahp:' + a.id, Math.max(0, a.hp / a.maxHp * 100))}></i></div>
    ${a.shield > 0 ? `<div class="bar sh"><i style="width:${Math.min(100, a.shield / a.maxHp * 100)}%"></i></div>` : ''}
    <div class="nums"><span>${fmt(Math.max(0, a.hp))}/${fmt(a.maxHp)}</span>${a.shield > 0 ? `<span class="shv">🛡${fmt(a.shield)}</span>` : ''}</div>
    <div class="chips">${c.join('')}${buffChips(a)}</div>
  </div>`;
}

/* ---------- 行動預覽 ----------
 * pv：滑鼠正停在哪個行動上（{ kind: 'basic' | 'skill', target }），蓄勢中的終結技自動預覽。
 * 引擎在戰鬥狀態的複本上試算，結果快取到狀態改變為止。 */
let pv = null, pvKind = 'basic', curPv = null, pvCache = { key: '', res: null }, pvOutTimer = null;
function previewNow(S) {
  if (playing || paused || view !== 'battle' || ENDED.includes(S.phase)) return null;
  let action, label, target = pv && pv.target;
  const cur = S.units.find(u => u.id === S.current);
  if (armed && (S.phase === 'input' || S.phase === 'between')) {
    const a = S.units.find(u => u.id === armed);
    action = { ult: armed };
    label = `終結技【${Engine.CHARS[a.key].actions.ult}】`;
    if (Engine.CHARS[a.key].ultTarget !== 'enemy') target = null;
  } else if (pv && pv.kind && S.phase === 'input' && cur && cur.side === 'ally') {
    action = pv.kind;
    if (action === 'skill' && !Engine.canSkill()) return null;
    const enh = (cur.key === 'kane' && Engine.kaneEnhanced(S.units)) || (cur.key === 'alan' && cur.cover > 0);
    label = action === 'skill' ? '戰技' : enh ? '強化普攻' : '普攻';
    if (action === 'skill' && Engine.CHARS[cur.key].skillTarget !== 'enemy') target = null;
  } else return null;
  const tgtId = (action === 'basic' && duelLock(S)) || target || S.target;
  const key = JSON.stringify([action, tgtId, S.allyTarget, S.turnNo, S.time, S.sp, S.log.length, S.phase]);
  if (pvCache.key !== key) pvCache = { key, res: Engine.preview(action, { target: tgtId }) };
  if (!pvCache.res) return null;
  const single = action.ult ? Engine.CHARS[S.units.find(u => u.id === armed).key].ultTarget === 'enemy'
    : action === 'basic' ? !(cur.key === 'kane' && Engine.kaneEnhanced(S.units)) : Engine.CHARS[cur.key].skillTarget === 'enemy';
  const t = single && S.units.find(u => u.id === tgtId);
  const at = action === 'skill' && Engine.CHARS[cur.key].skillTarget === 'ally' && S.units.find(u => u.id === S.allyTarget);
  return { action, key, res: pvCache.res, label: label + (t ? ` → ${t.name}` : at ? ` → ${at.name}` : '') };
}
function setPv(next) {
  if (JSON.stringify(pv) === JSON.stringify(next)) return;
  pv = next;
  if (view === 'battle' && !playing) renderBattle();
}
document.addEventListener('pointerover', ev => {
  if (view !== 'battle' || ev.pointerType === 'touch') return;
  const b = ev.target.closest('[data-act]');
  if (b) { clearTimeout(pvOutTimer); pvKind = b.dataset.act; return setPv({ kind: b.dataset.act }); }
  const e = ev.target.closest('.eunit[data-enemy]');
  if (e && !e.classList.contains('dead') && !e.classList.contains('nolock')) { clearTimeout(pvOutTimer); return setPv({ kind: armed ? null : pvKind, target: e.dataset.enemy }); }
});
document.addEventListener('pointerout', ev => {
  if (!pv) return;
  const from = ev.target.closest('[data-act], .eunit[data-enemy]');
  if (!from) return;
  const to = ev.relatedTarget && ev.relatedTarget.closest ? ev.relatedTarget.closest('[data-act], .eunit[data-enemy]') : null;
  if (to && to.dataset.act === from.dataset.act && to.dataset.enemy === from.dataset.enemy) return;
  clearTimeout(pvOutTimer);
  pvOutTimer = setTimeout(() => setPv(null), 90);
});

/* ---------- 時間織機面板（平衡權能） ---------- */
const TASK_DESC = {
  up: '啟動時股市上漲一階，隨後消除。', down: '啟動時股市下跌一階，隨後消除。',
  long: '［校準優化·利潤］在上漲區間轉變而成。啟動時股市上漲一階，並對敵方全體造成戈登攻擊力 30% × 當前上漲階數的運屬性傷害，隨後消除。', short: '［校準優化·利潤］在下跌區間轉變而成。啟動時股市下跌一階，並為戈登恢復 5 × 當前下跌階數的能量，隨後消除。',
  cash: '常駐任務（3 次）。每次執行：10 段彈射，每段對隨機敵人造成戈登攻擊力 25% 的運屬性傷害，戈登行動提前 30%。次數歸零時重新獲得利潤。', bottom: '常駐任務（3 次）。每次執行：我方全體獲得［財源滾滾］，回復 2 個戰技點，戈登行動提前 30%。次數歸零時重新獲得利潤。',
  fuse: '常駐任務（3 次）。存在期間股市無法被其他任務改變（其他任務仍正常執行並消除）；每次執行使股市朝均衡移動一階。',
  hedge: '常駐任務（3 次）。存在期間漲停與跌停的效果同時生效，但不觸發熔斷、套現或抄底。每次執行：對生命值最高的敵人造成戈登攻擊力 120%、相鄰目標 60% 的運屬性傷害，主目標陷入［債務糾紛］。',
  measure: '寒夜普攻投入。啟動時執行並消除：寒夜獲得 1 層［度量］（每次獲得刻度時額外 +1，2 回合，最多 3 層）。寒夜終結技會把最先投入的度量轉化為測度。',
  gauge: '唯一的常駐任務，由寒夜終結技轉化而成。每次啟動消耗 1 次執行次數：寒夜下一次戰技的前四分之一段數帶有擴散（相鄰目標 30% 空屬性傷害）。次數歸零時消除；再轉化一張度量會使次數 +3。',
};
const STAGE_TIP = ['敵方速度 −20%、受到的傷害 +20%', '敵方速度 −10%、受到的傷害 +10%', '敵方速度 −5%', '沒有效果', '我方速度 +5%、攻擊時附加戈登攻擊力 10% 運屬性傷害', '我方速度 +10%、附加 20% 運屬性傷害', '我方速度 +15%、附加 30% 運屬性傷害'];
function renderLoom(S, W) {
  const el = $('#loom');
  const L = W.loom !== undefined ? W.loom : S.loom;
  el.classList.toggle('hidden', !L);
  if (!L) return;
  const cap = Engine.loomCap(), used = L.tasks.filter(x => !Engine.TASK_FREE.has(x.kind)).length;
  const can = !playing && Engine.canLoom();
  const chips = L.tasks.map(x => `<span class="lm-task t-${x.kind}${x.profit ? ' profit' : ''}${Engine.TASK_FREE.has(x.kind) ? ' perm' : ''}" title="校準任務·${Engine.TASK_NAME[x.kind]}：${TASK_DESC[x.kind] || ''}">${Engine.TASK_NAME[x.kind]}${x.left != null ? `<i>剩 ${x.left}</i>` : ''}</span>`).join('')
    || '<span class="lm-empty">沒有校準任務</span>';
  const conv = (W.units || S.units).some(u => u.side === 'ally' && u.key === 'hanye' && u.alive)
    ? '<div class="lm-profit" title="寒夜天賦：時間織機每執行一份校準任務，寒夜累積 1 層刻度、行動提前 10%；單次累計達到 40% 時，下次戰技額外 5 層刻度">校準優化·收斂</div>' : '';
  const prof = L.gordon ? `<div class="lm-profit" title="時間織機執行完所有任務後，若股市不為均衡，利潤轉變為做多（上漲）或做空（下跌）投入，隨後消失；套現／抄底次數歸零時重新獲得">校準優化·利潤：<em>${L.profit ? '持有' : '已投入'}</em></div>` : '';
  el.innerHTML = `<div class="lm-head">${Icon('trace')}<b>時間織機</b><span>${used}/${cap}</span></div>
    <div class="lm-charge" title="充能 ${Engine.pct(L.charge)}（每投入一份 +50%，100% 可啟動，最多 500%）">
      <i style="width:${L.charge / 5 * 100}%"></i>${[1, 2, 3, 4].map(k => `<em style="left:${k * 20}%"></em>`).join('')}<small>${Engine.pct(L.charge)}</small></div>
    <div class="lm-tasks">${chips}</div>${conv}${prof}
    <button class="lm-go" data-cmd="loom" ${can ? '' : 'disabled'} title="依投入順序執行所有校準任務（不佔回合）">啟動</button>`;
}
/* ---------- 米勒「葬禮」領域 ----------
 * 敵人身後的地面上，一道低弧度的白菊與紅罌粟圈出領域（只有後方的半圈，戰場不會被切開）；地面偶爾泛起幾圈漣漪。
 * 元素只建立一次，之後只切換 .on 與更新圈的位置，動畫不會因為畫面更新而重播。 */
function renderFuneral(W) {
  const el = $('#funeral');
  if (!el) return;
  if (!el.dataset.built) {
    el.dataset.built = '1';
    // 只留後方（上半）的一道弧：從左到右沿著扁平的弧線排開，大小依「大・小・中・小・大・中」的節奏變化
    const n = 34, rhythm = [1.3, 0.62, 0.95, 0.55, 1.12, 0.78, 0.66];
    const flowers = Array.from({ length: n }, (_, i) => {
      const u = i / (n - 1), a = Math.PI + u * Math.PI, x = 50 + Math.cos(a) * 50, y = 100 + Math.sin(a) * 100;   // y：0（弧頂）～100（兩端）
      const red = i % 3 === 1, sc = (rhythm[i % rhythm.length] * (0.85 + 0.15 * Math.sin(u * Math.PI))).toFixed(2);
      return `<i class="fn-fl ${red ? 'r' : 'w'}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--s:${sc};--r:${(i * 47) % 360}deg"></i>`;
    }).join('');
    const ripples = [[34, 112, 0], [62, 126, 2.3], [48, 104, 4.1], [24, 130, 5.6], [74, 110, 3.2]].map(([x, y, d]) => `<i class="fn-rip" style="left:${x}%;top:${y}%;animation-delay:-${d}s"></i>`).join('');
    el.innerHTML = `<div class="fn-ring">${ripples}${flowers}</div>`;
  }
  const on = (W.units || []).some(u => u.side === 'ally' && u.key === 'miller' && u.alive && u.funeral > 0);
  el.classList.toggle('on', on);
  if (!on) return;
  // 圈的位置：敵人列的腳下
  const field = document.querySelector('.field'), row = $('#enemies');
  if (!field || !row) return;
  const F = field.getBoundingClientRect(), R = row.getBoundingClientRect();
  // 弧的高度只有寬度的 7%（曲率低），兩端落在敵人腳邊，弧頂在敵人身後
  const ring = el.querySelector('.fn-ring'), w = Math.max(260, R.width * 0.98), h = Math.max(24, w * 0.07);
  ring.style.cssText = `left:${R.left - F.left + R.width / 2 - w / 2}px;top:${R.bottom - F.top - h * 1.55}px;width:${w}px;height:${h}px`;
}

/* ---------- 星流面板（情感權能） ---------- */
function renderFlow(S, W) {
  const el = $('#flow');
  if (!el) return;
  const F = W.flow !== undefined ? W.flow : S.flow;
  el.classList.toggle('hidden', !F);
  if (!F) return;
  const ext = F.ext, v = ext ? (ext.side === 'grow' ? 100 : -100) : F.v;
  const st = ext ? (ext.side === 'grow' ? '極長' : '極消') : v > 0 ? '長' : v < 0 ? '消' : '中節';
  const num = x => (Math.abs(x) % 1 ? Math.abs(x).toFixed(1) : Math.abs(x)) + '%';
  const units = W.units || S.units;
  const timer = units.find(u => u.side === 'timer');
  const states = units.filter(u => u.side === 'ally' && u.alive).flatMap(u => u.buffs.filter(b => b.name === '盛大告別' || b.name === '陰雨連綿').map(b => `${u.name}［${b.name}］`));
  el.classList.toggle('ext', !!ext);
  el.classList.toggle('grow', v > 0); el.classList.toggle('fade', v < 0);
  el.innerHTML = `<div class="fl-head">${Icon('trace')}<b>星流</b><span class="fl-st">${st}${ext ? '' : v ? ' ' + num(v) : ''}</span></div>
    <div class="fl-bar" title="星流：−100%（極消）… 0%（中節）… +100%（極長）">
      <i class="fl-fill" style="${v >= 0 ? `left:50%;width:${v / 2}%` : `left:${50 + v / 2}%;width:${-v / 2}%`}"></i>
      <em style="left:50%"></em><b class="fl-dot" style="left:${50 + v / 2}%"></b></div>
    <div class="fl-lbl"><span>極消</span><span>消</span><span>中節</span><span>長</span><span>極長</span></div>
    ${ext ? (() => {
      const env = Engine.FLOW_ENV[ext.by]?.[ext.side];
      return `<div class="fl-ext" title="${esc(env?.desc || '')} 換波保留剩餘時間；計時器行動時角色與環境效果一併結束。">${esc(env?.name || ELEM_NAME[ext.by] || '')}${timer ? ` · 剩 ${Math.max(0, timer.av).toFixed(0)} AV` : ''}${states.length ? ' · ' + states.map(esc).join('、') : ''}</div><div class="fl-env">${esc(env?.desc || '')}${F.pend ? ` 暫存${F.pend > 0 ? '長' : '消'} ${num(F.pend)}` : ''}</div>`;
    })() : ''}`;
}
/* ---------- 兌現匣（本質權能）：右上角與星流對齊的試作型彈匣 ----------
 * 外殼只建一次（浮動動畫不會因重繪而重播），之後只更新子彈、預測與計數。
 * 滿 8 份時在敵人身上預先標出兌現的鎖定目標；8 份以上皆為同一屬性時，觀察窗改用警示描邊（原型兌現預警）。 */
const CB_TIP = '品名：兌現匣（試作型）\n「人提出概念，明日公司實現。」\n本產品收集使用者於戰鬥行為中逸散之本質餘料，並於滿料時自動兌現為一次性武裝。形制依投入量最多之屬性決定，裝填依投入量次多之屬性決定。';
const CB_ARM = 8;
let cbLocks = null;   // 這一幀兌現匣預定鎖定的敵人
let cbHold = 0;   // 正在飛向彈匣、還沒落進槽位的餘料份數
function cashState(S, W) { return W.cashbox !== undefined ? W.cashbox : S.cashbox; }
function magShell() {
  const rv = [[3, 5], [3, 'b'], ['r', 5], ['r', 'b'], [38, 5], [62, 5]].map(([x, y]) => `<i class="rv" style="${x === 'r' ? 'right:3px' : `left:${x}%`};${y === 'b' ? 'bottom:5px' : `top:${y}px`}"></i>`).join('');
  return `<div class="mag" title="${esc(CB_TIP)}">
    <div class="mg-lip"></div>
    <div class="mg-body">${rv}
      <div class="mg-dept"><b>實物測試科</b><span>PT-07</span></div>
      <div class="mg-tag">試作型<small>PROTOTYPE</small></div>
      <div class="mg-head"><span class="mg-pred"></span></div>
      <div class="mg-win"><div class="mg-rounds">${Array.from({ length: Engine.CASH.CAP }, () => '<i class="rd"><b></b></i>').join('')}</div><em class="mg-warn">原型兌現</em></div>
      <div class="mg-foot"><b>TOMORROW CO.</b><span class="mg-sn">CX-10 · SN 0D-7741-A</span></div>
    </div>
    <div class="mg-plate"><span class="mg-n">0</span><small>/10</small><em class="mg-over"></em><em class="mg-cnt"></em></div>
  </div>`;
}
/** 預先標出的鎖定目標：{ col, name, proto, ids: { 敵人id: 'main' | 'sub' | 'rand' } } */
function cashLocks(S, W) {
  const B = cashState(S, W);
  if (!B || B.items.length < CB_ARM) return null;
  const C = Engine.CASH, rk = Engine.rankElems(B.items.slice(0, C.CAP)), proto = rk.length === 1, e0 = rk[0].e;
  const F = (proto ? C.PROTO : C.FORM)[e0], es = W.units.filter(u => u.side === 'enemy' && u.alive);
  if (!F || !es.length) return null;
  const m = es.find(u => u.id === S.target) || es[0], i = es.indexOf(m), ids = {};
  const set = (u, k) => { if (u) ids[u.id] = k; };
  if (F.aim === 'hp') set(es.reduce((a, b) => (b.hp > a.hp ? b : a)), 'main');
  else if (F.aim === 'main') set(m, 'main');
  else if (F.aim === 'adj') { set(es[i - 1], 'sub'); set(es[i + 1], 'sub'); set(m, 'main'); }
  else if (F.aim === 'chain') { es.forEach(u => set(u, 'sub')); set(m, 'main'); }
  else if (F.aim === 'rand') es.forEach(u => set(u, 'rand'));
  else es.forEach(u => set(u, 'main'));
  return { col: ELEM_COLOR[e0], name: F.name, proto, ids };
}
function cashLockMark(L, id) {
  const k = L && L.ids[id];
  if (!k) return '';
  return `<div class="cb-lock ${k}${L.proto ? ' proto' : ''}" style="--c:${L.col}" title="兌現匣預定鎖定：${esc(L.proto ? '原型・' : '')}${esc(L.name)}${k === 'rand' ? '（隨機彈射）' : ''}">
    <i class="ring" style="${syncAnim(1800)}"></i>${[0, 1, 2, 3].map(j => `<i class="br b${j}" style="${syncAnim(1200)}"></i>`).join('')}<small>${k === 'rand' ? '彈射' : k === 'sub' ? '波及' : '鎖定'}</small></div>`;
}
function renderCashbox(S, W) {
  const el = $('#cashbox');
  if (!el) return;
  const B = cashState(S, W);
  el.classList.toggle('hidden', !B);
  if (!B) return;
  if (!el.querySelector('.mag')) el.innerHTML = magShell();
  const C = Engine.CASH, items = B.items.slice(0, C.CAP), n = items.length;
  el.querySelectorAll('.rd').forEach((r, i) => {
    const x = items[i];
    r.classList.toggle('on', !!x);
    r.classList.toggle('pend', !!x && i >= n - cbHold);
    if (x) { r.style.setProperty('--c', ELEM_COLOR[x.e]); r.title = `${ELEM_NAME[x.e]}餘料`; } else { r.style.removeProperty('--c'); r.title = '空槽'; }
  });
  const rk = n ? Engine.rankElems(items) : [], proto = n >= CB_ARM && rk.length === 1;
  el.classList.toggle('cb-armed', n >= CB_ARM);
  el.classList.toggle('cb-proto', proto);
  if (rk.length) el.style.setProperty('--pc', ELEM_COLOR[rk[0].e]);
  let pred = '<span class="cb-none">待裝填</span>';
  if (rk.length) {
    const F = rk.length === 1 ? C.PROTO[rk[0].e] : C.FORM[rk[0].e], L = rk[1] && C.LOAD[rk[1].e];
    pred = rk.length === 1
      ? `<span title="${esc(F.desc)}"><b style="color:${ELEM_COLOR[rk[0].e]}">原型・${esc(F.name)}</b>（全為${esc(ELEM_NAME[rk[0].e])}）</span>`
      : `<span title="形制（最多）：${esc(ELEM_NAME[rk[0].e])}・${esc(F.name)}，${esc(F.desc)}\n裝填（次多）：${esc(ELEM_NAME[rk[1].e])}・${esc(L.name)}，${esc(L.desc)}"><b style="color:${ELEM_COLOR[rk[0].e]}">${esc(ELEM_NAME[rk[0].e])}・${esc(F.name)}</b> ＋ <b style="color:${ELEM_COLOR[rk[1].e]}">${esc(ELEM_NAME[rk[1].e])}・${esc(L.name)}</b></span>`;
  }
  const head = el.querySelector('.mg-pred');
  if (head.dataset.k !== pred) { head.dataset.k = pred; head.innerHTML = pred; }
  el.querySelector('.mg-over').textContent = B.items.length > C.CAP ? `+${B.items.length - C.CAP}` : '';
  const cnt = el.querySelector('.mg-cnt');
  cnt.textContent = B.count ? `兌×${B.count}` : ''; cnt.title = B.count ? `已兌現 ${B.count} 次` : '';
  el.querySelector('.mg-n').textContent = Math.min(C.CAP, B.items.length);
}
/** 本質角色行動結束：帶屬性顏色的光點劃出弧線飛進彈匣，落進槽位時「喀」一聲上膛 */
function residueOrbs(src, f) {
  const box = $('#cashbox');
  if (!src || !box || box.classList.contains('hidden')) { Sound.play('chamber', { e: f.e }); return; }
  const rounds = [...box.querySelectorAll('.rd')], n = rounds.filter(r => r.classList.contains('on')).length;
  const k = Math.min(f.n, n), col = ELEM_COLOR[f.e] || '#fff', a = center(src), epoch = playbackEpoch;
  cbHold = k;
  for (let i = 0; i < k; i++) rounds[n - k + i].classList.add('pend');
  for (let i = 0; i < k; i++) {
    const slot = rounds[n - k + i], b = center(slot), dur = 560 * FXK(), wait = i * 120 * FXK();
    const cx = (a.x + b.x) / 2 + (i - (k - 1) / 2) * 50, cy = Math.min(a.y, b.y) - 90 - i * 18;
    const kf = Array.from({ length: 13 }, (_, j) => {
      const t = j / 12, u = 1 - t, x = u * u * a.x + 2 * u * t * cx + t * t * b.x, y = u * u * a.y + 2 * u * t * cy + t * t * b.y;
      return { transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${(1 - t * 0.45).toFixed(2)})`, opacity: j === 0 ? 0 : 1 };
    });
    [0, 1, 2].forEach(g => {   // 光點本體與兩顆漸淡的殘影
      const d = document.createElement('div');
      d.className = 'rorb' + (g ? ' ghost' : '');
      d.style.cssText = `--c:${col};opacity:0;${g ? `--g:${1 - g * 0.3}` : ''}`;
      $('#fx').appendChild(d);
      const an = d.animate(kf, { duration: dur, delay: wait + g * 45 * FXK(), easing: 'cubic-bezier(.45,.05,.6,1)', fill: 'forwards' });
      an.onfinish = () => {
        d.remove();
        if (g || epoch !== playbackEpoch) return;
        cbHold = Math.max(0, cbHold - 1);
        slot.classList.remove('pend'); addCls(slot, 'ld');
        Sound.play('chamber', { e: f.e, gap: 30 });
        fxDiv('orbpop', b.x, b.y, `--c:${col}`, 420);
      };
    });
  }
}

/* ---------- 股市面板（戈登） ----------
 * 股市的七個階段才是實際的戰鬥數值；價格、K 線與跑馬燈是由階段走勢加上固定雜訊產生的「盤面」，
 * 同一個戰鬥狀態永遠畫出同一張圖（撤銷、讀檔不會跳動），只有現價的最後幾位數會即時小幅跳動。 */
const mkHash = n => { const x = Math.sin(n * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
const mkLevel = v => 100 * Math.pow(1.06, v);
const MK_PEERS = [['9TH', '第九街地產', 0.6], ['MOCA', '莫卡代理', -0.4], ['BKPD', '布魯克林保全', 0.3], ['TIME', '時間總局', 0.1], ['NEON', '霓虹不夜街', 0.8]];
function mkCandles(hist, seed) {
  const out = [];
  let prev = 100;
  const push = (close, i) => {
    const o = prev, w = 0.004 + mkHash(i * 3.1) * 0.006;
    out.push({ o, c: close, h: Math.max(o, close) * (1 + w), l: Math.min(o, close) * (1 - w) });
    prev = close;
  };
  for (let i = 0; i < 8; i++) push(100 * (1 + (mkHash(i + 0.5) - 0.5) * 0.012), i - 20);   // 開盤前的盤整
  for (let i = 1; i < hist.length; i++) {
    const a = mkLevel(hist[i - 1]), b = mkLevel(hist[i]);
    for (let j = 1; j <= 3; j++) push((a + (b - a) * j / 3) * (1 + (j < 3 ? (mkHash(i * 7 + j) - 0.5) * 0.02 : (mkHash(i * 11) - 0.5) * 0.006)), i * 10 + j);
  }
  const last = mkLevel(hist[hist.length - 1]);
  for (let j = 0; j < 4; j++) push(last * (1 + (mkHash(seed * 0.013 + j * 5.7) - 0.5) * 0.012), 999 + seed + j);   // 目前的震盪
  return out.slice(-26);
}
function mkChart(cs, w, h) {
  const hi = Math.max(...cs.map(k => k.h)), lo = Math.min(...cs.map(k => k.l)), pad = (hi - lo) * 0.08 || 1;
  const y = v => h - (v - lo + pad) / (hi - lo + pad * 2) * h, cw = w / cs.length;
  const body = cs.map((k, i) => {
    const x = cw * (i + 0.5), up = k.c >= k.o, top = y(Math.max(k.o, k.c)), bh = Math.max(1.2, y(Math.min(k.o, k.c)) - top);
    return `<g class="${up ? 'u' : 'd'}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(k.h).toFixed(1)}" y2="${y(k.l).toFixed(1)}"/><rect x="${(x - cw * 0.32).toFixed(1)}" y="${top.toFixed(1)}" width="${(cw * 0.64).toFixed(1)}" height="${bh.toFixed(1)}"/></g>`;
  }).join('');
  const ma = cs.map((k, i) => { const a = cs.slice(Math.max(0, i - 4), i + 1); return a.reduce((s, q) => s + q.c, 0) / a.length; });
  const line = ma.map((v, i) => `${(cw * (i + 0.5)).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ly = y(cs[cs.length - 1].c).toFixed(1), base = y(100);
  return `<svg class="mk-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    ${base > 0 && base < h ? `<line class="base" x1="0" x2="${w}" y1="${base.toFixed(1)}" y2="${base.toFixed(1)}"/>` : ''}
    ${body}<polyline class="ma" points="${line}"/><line class="last" x1="0" x2="${w}" y1="${ly}" y2="${ly}"/></svg>`;
}
function renderMarket(S, W) {
  const el = $('#market');
  if (!el) return;
  const L = W.loom !== undefined ? W.loom : S.loom;
  el.classList.toggle('hidden', !L || !L.gordon);
  if (!L || !L.gordon) return;
  if (!el.querySelector('.mk-main')) el.innerHTML = '<div class="mk-main"></div><div class="mk-tape"><div class="mk-tape-in"></div></div>';
  const v = L.market, hist = L.hist && L.hist.length ? L.hist : [0, v];
  const cs = mkCandles(hist, Math.round((W.time != null ? W.time : S.time) || 0));
  const price = cs[cs.length - 1].c, chg = (price / 100 - 1) * 100, up = chg >= 0;
  const hedge = L.tasks.some(x => x.kind === 'hedge');
  const lock = L.tasks.find(x => x.kind === 'fuse');
  const profit = L.profit ? '持有' : '已投入';
  el.querySelector('.mk-main').innerHTML = `
    <div class="mk-head">${Icon('chart')}<b class="mk-sym">GDN</b><span>時序股市</span><em class="mk-stage s${v}">${Engine.STAGES[v + 3]}</em></div>
    <div class="mk-quote"><b class="mk-price ${up ? 'u' : 'd'}" data-base="${price.toFixed(4)}">${price.toFixed(2)}</b>
      <span class="mk-chg ${up ? 'u' : 'd'}">${up ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%</span></div>
    ${mkChart(cs, 240, 70)}
    <div class="mk-scale" title="股市：${Engine.STAGES[v + 3]}（${STAGE_TIP[v + 3]}）">${Engine.STAGES.map((n, i) => `<i class="st${i - 3}${i - 3 === v ? ' on' : ''}"><b>${n}</b></i>`).join('')}</div>
    <div class="mk-fx">${hedge ? '<em>對沖中：跌停與漲停的效果同時生效</em>' : esc(STAGE_TIP[v + 3])}</div>
    <div class="mk-foot"><span>利潤：<b>${esc(profit)}</b></span>${lock ? `<span class="mk-lock">熔斷 剩 ${lock.left}</span>` : ''}${hedge ? '<span class="mk-hedge">對沖</span>' : ''}</div>`;
  // 跑馬燈：內容改變時才重建，避免捲動動畫一直重來
  const peers = MK_PEERS.map(([sym, name, beta], i) => {
    const p = 100 * (1 + chg / 100 * beta + (mkHash(i * 13 + hist.length) - 0.5) * 0.04), c = (p / 100 - 1) * 100;
    return `<span class="${c >= 0 ? 'u' : 'd'}">${sym} <small>${name}</small> ${p.toFixed(2)} ${c >= 0 ? '▲' : '▼'}${Math.abs(c).toFixed(2)}%</span>`;
  });
  const items = [`<span class="${up ? 'u' : 'd'}">GDN <small>時序股市</small> ${price.toFixed(2)} ${up ? '▲' : '▼'}${Math.abs(chg).toFixed(2)}%</span>`].concat(peers).join('');
  const tape = el.querySelector('.mk-tape-in');
  if (tape.dataset.sig !== items) { tape.dataset.sig = items; tape.innerHTML = items + items; }
}
// 現價的最後幾位數即時小幅跳動（只是盤面效果，不影響戰鬥）
setInterval(() => {
  const p = document.querySelector('#market:not(.hidden) .mk-price');
  if (!p || view !== 'battle') return;
  const base = +p.dataset.base, j = base * (1 + (Math.random() - 0.5) * 0.0025);
  p.textContent = j.toFixed(2);
  p.classList.remove('tk-u', 'tk-d'); void p.offsetWidth; p.classList.add(j >= +(p.dataset.prev || base) ? 'tk-u' : 'tk-d');
  p.dataset.prev = j;
}, 900);
/** 戈登的戰技：選擇漲或跌、投入幾張 */
let gskMix = ['up', null, null], gskAnchor = null;   // 戈登戰技：逐張選擇漲／跌
function gordonSkillPop(anchor) {
  gskAnchor = anchor;
  const S = Engine.state(), inf = S.rules.infiniteSP;
  const room = S.loom ? Engine.loomCap() - S.loom.tasks.filter(x => !Engine.TASK_FREE.has(x.kind)).length : 3;
  const btn = (dir, n) => { const cost = 1 + 2 * (n - 1), ok = (inf || S.sp >= cost) && (n === 1 || n <= room); return `<button data-gsk="${dir}-${n}" ${ok ? '' : 'disabled'}>${n} 張<small>${cost} 點</small></button>`; };
  const mk = S.loom ? `${Engine.STAGES[S.loom.market + 3]} · 空位 ${Math.max(0, room)}` : '—';
  openPop(anchor, `<div class="pop-h"><b>機會成本</b><span class="ptag">目前股市：${mk}</span></div>
    <div class="gsk"><div><span class="up">漲</span>${[1, 2, 3].map(n => btn('up', n)).join('')}</div>
    <div><span class="down">跌</span>${[1, 2, 3].map(n => btn('down', n)).join('')}</div>
    <div class="gsk-mix"><span>逐張</span>${gskMix.map((d, i) => `<button data-gmix="${i}" class="${d || 'none'}">${d === 'up' ? '漲' : d === 'down' ? '跌' : '—'}</button>`).join('')}${(() => {
      const n = gskMix.filter(Boolean).length, cost = 1 + 2 * (n - 1), ok = (inf || S.sp >= cost);
      return `<button data-gskgo="1" class="go" ${ok ? '' : 'disabled'}>投入<small>${n} 張 · ${cost} 點</small></button>`;
    })()}</div></div>
    <div class="pop-d">每多消耗 2 戰技點多投入一張［校準任務］，最多三張，每張可分別選擇漲或跌。超出時間織機儲存數的任務不會投入（戰技點照常消耗）。</div>`);
}

/** 保留卡片節點，以當下可見位置開始 FLIP；連續拉條時也不會跳回舊位置。 */
function updateTimeline(container, html, preview) {
  const oldNodes = new Map(), rects = new Map(), byUnit = new Map();
  container.querySelectorAll(':scope > [data-k]').forEach(el => {
    oldNodes.set(el.dataset.k, el);
    const r = el.getBoundingClientRect(); rects.set(el.dataset.k, r);
    if (el.dataset.unit && !byUnit.has(el.dataset.unit)) byUnit.set(el.dataset.unit, r);
    el.getAnimations().forEach(a => a.cancel());
  });
  const template = document.createElement('template'); template.innerHTML = html;
  const next = Array.from(template.content.children), kept = new Set();
  let cursor = container.firstElementChild;
  next.forEach(fresh => {
    const key = fresh.dataset.k;
    const node = oldNodes.get(key) || fresh; kept.add(node);
    if (node !== fresh) {
      for (const attr of Array.from(node.attributes)) if (!fresh.hasAttribute(attr.name)) node.removeAttribute(attr.name);
      for (const attr of fresh.attributes) node.setAttribute(attr.name, attr.value);
      if (node.innerHTML !== fresh.innerHTML) node.innerHTML = fresh.innerHTML;
    }
    if (node !== cursor) container.insertBefore(node, cursor);
    cursor = node.nextElementSibling;
  });
  Array.from(container.children).forEach(el => { if (!kept.has(el)) el.remove(); });
  container.classList.toggle('previewing', preview);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  for (const el of container.children) {
    const prior = rects.get(el.dataset.k) || byUnit.get(el.dataset.unit);
    const now = el.getBoundingClientRect();
    if (prior) {
      const dx = prior.left - now.left, dy = prior.top - now.top;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) el.animate([
        { transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' },
      ], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } else if (el.classList.contains('tl')) {
      el.animate([{ opacity: 0, transform: 'translateX(-16px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 320, easing: 'ease-out' });
    }
  }
}

function renderBattle() {
  const S = Engine.state();
  if (!S) return;
  const W = viewState();
  const byId = id => W.units.find(u => u.id === id) || S.units.find(u => u.id === id);
  if (armed) { const a = byId(armed); if (!a || !a.alive || ENDED.includes(S.phase) || !Engine.canUlt(armed)) armed = null; }
  ultQueue = ultQueue.filter(id => Engine.canUlt(id));

  // 音效：終結技充能完成、戰鬥結束
  W.units.forEach(u => {
    if (u.side !== 'ally') return;
    const full = u.alive && u.energy >= u.maxEnergy - 1e-9;
    if (full && readyPrev[u.id] === false) Sound.play('ultReady', { gap: 250 });
    readyPrev[u.id] = full;
  });
  if (ENDED.includes(S.phase) && !playing) {
    if (!endCued) { endCued = true; Sound.play(S.phase === 'win' ? 'win' : 'lose'); Sound.music('menu'); }
  } else if (!ENDED.includes(S.phase) && endCued) { endCued = false; Sound.music('battle'); }

  // 直式行動軸 + 輪次倒數
  const cyc = W.time < 150 ? 1 : 2 + Math.floor((W.time - 150) / 100);
  const nextB = W.time < 150 ? 150 : 150 + 100 * (Math.floor((W.time - 150) / 100) + 1);
  const remain = nextB - W.time, span = cyc === 1 ? 150 : 100;
  // 行動卡：左側立繪，右下角行動值；同一實際回合沿用同一鍵值。
  let tl = `<div class="tl-head" data-k="head" title="第 ${cyc} 輪，本輪剩餘 ${remain.toFixed(0)} 行動值；第 ${W.wave + 1}/${S.waves.length} 波">
    <b>${cyc}</b><small>輪</small><div class="bar cdbar"><i style="width:${remain / span * 100}%"></i></div><small class="tlw">${W.wave + 1}/${S.waves.length} 波</small></div>`;
  const av = u => u.side === 'ally' && Art.get(u.key)
    ? `<i class="tav" style="${Art.bg(u.key, 'face', 420)}"></i>`
    : u.side === 'enemy' ? `<i class="tav enemy">${enemySvg(u, '32 0 56 56')}</i>` : `<i class="tav">${esc(u.name[0])}</i>`;
  const item = (u, cls, val, tip, k, badge) => `<div class="tl ${u.side} ${cls}"${k ? ` data-k="${k}"` : ''} data-unit="${esc(u.id)}" title="${esc(u.name)}：${esc(tip)}">${av(u)}<span class="tl-name">${esc(u.name)}</span><b class="tlv">${val}</b>${badge || ''}</div>`;

  // 行動預覽：滑到普攻／戰技、蓄勢終結技、或滑到敵人身上時，行動軸改顯示「行動後」的順序
  const P = curPv = previewNow(S);
  if (P) tl += `<div class="tl-pv" data-k="preview">${Icon('eye')}<b>${esc(P.label)}</b></div>`;
  ultQueue.forEach(id => { const u = byId(id); if (u) tl += item(u, 'ult', '✦', '終結技（預約）', 'ult-' + id); });
  if (armed && !ultQueue.includes(armed)) tl += item(byId(armed), 'ult', '✦', '終結技', 'ult-' + armed);
  const ultPv = P && P.action && P.action.ult;
  if (W.current && byId(W.current) && (!P || ultPv)) tl += item(byId(W.current), 'now', '▶', '行動中', byId(W.current).id + ':' + (byId(W.current).ownTurns || 0));
  // 每個單位在行動軸上的第 n 次出現 → 鍵值，用來比對預覽前後的位置
  const keyed = arr => { const n = {}; return arr.map(f => ({ f, k: f.id + ':' + ((byId(f.id)?.ownTurns || 0) + (n[f.id] = (n[f.id] || 0) + 1)) })); };
  const before = keyed(Engine.forecast(12, W));
  let list = before;
  if (P) {
    const bmap = Object.fromEntries(before.map(x => [x.k, x.f]));
    const pu = id => P.res.units.find(x => x.id === id);
    let landed = false;
    list = keyed(P.res.forecast).map(x => {
      const b = bmap[x.k], p = pu(x.f.id);
      const o = Object.assign(x, { delta: b && !b.extra && !x.f.extra ? x.f.at - b.at : null, fresh: !b || (x.f.extra && !b.extra), brk: p && p.broken });
      if (!ultPv && !landed && x.f.id === P.res.actor && !x.f.extra) { o.land = true; landed = true; }
      return o;
    });
    // 預計被擊敗的敵人：在原位置留下殘影
    P.res.units.filter(u => u.killed).forEach(u => before.filter(x => x.f.id === u.id).forEach(x => list.push({ f: x.f, k: x.k, gone: true })));
    list.sort((a, b) => (b.f.extra ? 1 : 0) - (a.f.extra ? 1 : 0) || a.f.at - b.f.at);
  }
  let boundary = remain, roundNo = cyc;
  list.forEach(x => {
    const f = x.f, u = byId(f.id); if (!u) return;
    while (!f.extra && f.at > boundary + 1e-9) { roundNo++; tl += `<div class="tl-round" data-k="round-${roundNo}">${roundNo}</div>`; boundary += 100; }
    let cls = f.extra ? 'extra' : '', badge = '', tip = f.extra ? '額外回合' : `${Math.round(f.at)} 行動值後行動（速度 ${Engine.getSpd(u).toFixed(0)}）`;
    if (x.gone) { cls += ' pv-gone'; badge = '<i class="tl-d gone">擊敗</i>'; tip = '預計被擊敗'; }
    else if (P) {
      if (x.land) { cls += ' pv-land'; badge = '<i class="tl-d land">落點</i>'; tip += '（行動後的位置）'; }
      else if (x.delta != null && x.delta < -0.5) { cls += ' pv-up'; badge = `<i class="tl-d up">▲${Math.round(-x.delta)}</i>`; tip += `（提前 ${Math.round(-x.delta)}）`; }
      else if (x.delta != null && x.delta > 0.5) { cls += ' pv-dn'; badge = `<i class="tl-d dn">▼${Math.round(x.delta)}</i>`; tip += `（延後 ${Math.round(x.delta)}）`; }
      else if (x.fresh && f.extra) { cls += ' pv-up'; badge = '<i class="tl-d up">額外</i>'; }
      if (x.brk) { cls += ' pv-brk'; badge += '<i class="tl-brk">⚡</i>'; tip += '，預計被擊破'; }
    }
    tl += item(u, cls, f.extra ? '＋' : Math.round(f.at), tip, x.k, badge);
  });
  updateTimeline($('#timeline'), tl, !!P);

  const dl = !playing && duelLock(S);
  if (dl && S.target !== dl) Engine.setTarget(dl);   // 生死角力：選取框固定在角力中的敵人
  cbLocks = cashLocks(S, W);
  $('#enemies').innerHTML = W.units.filter(u => u.side === 'enemy').map(e => enemyUnit(e, W, S)).join('');
  $('#allies').innerHTML = W.units.filter(u => u.side === 'ally').map((a, i) => allyCard(a, W, S, i)).join('');
  document.querySelectorAll('.card.armed .orbit').forEach(o => {
    const card = o.parentElement;
    const rx = (Math.max(card.offsetWidth, card.offsetHeight) / 2 + 8) + 'px';
    o.querySelectorAll('i').forEach(i => i.style.setProperty('--rx', rx));
  });

  // 戰技點（角色右側）
  $('#sp').innerHTML = `<small>戰技點</small><div class="dias">${Array.from({ length: S.spMax }, (_, i) => `<i class="${S.spMax - 1 - i < W.sp ? 'on' : ''}"></i>`).join('')}</div>
    <b>${S.rules.infiniteSP ? '∞' : W.sp}</b>`;

  renderLoom(S, W);
  renderMarket(S, W);
  renderFuneral(W);
  // 彩蛋：O.T.G. 開大（瀆神之軀）期間，背景的滿月變成血月
  const stg = document.querySelector('.field .stage');
  if (stg) stg.classList.toggle('blood-moon', (W.units || []).some(u => u.side === 'ally' && u.key === 'otg' && u.alive && u.buffs.some(b => b.name === '瀆神之軀')));
  renderCashbox(S, W);
  renderFlow(S, W);

  // 普攻／戰技（最右側）
  const cur = W.current && byId(W.current);
  let skills = '';
  if (cur && cur.side === 'ally' && !ENDED.includes(S.phase)) {
    const ch = Engine.CHARS[cur.key];
    const kaneEnh = cur.key === 'kane' && Engine.kaneEnhanced(W.units);
    const enh = kaneEnh || (cur.key === 'alan' && cur.cover > 0) || (cur.key === 'otg' && !!W.duel);
    const lock = playing || !!armed || S.phase !== 'input';
    const skillNote = cur.key === 'alan' && cur.cover > 0 ? '掩護中不可用' : cur.key === 'otg' && W.duel ? '角力中不可用' : '−1 點';
    skills = `<div class="actions skills el-${cur.elem}">
      <button data-act="basic" class="skillbtn ${enh ? 'enh' : ''}" ${lock ? 'disabled' : ''} title="${esc(enh ? ch.actions.enhanced : ch.actions.basic)}（Q）">
        <span class="ico">${enh ? '✸' : '⚔'}</span><span class="lbl">${enh ? '強化普攻' : '普攻'}</span>
        <small>${esc(enh ? ch.actions.enhanced : ch.actions.basic)}</small><em>${kaneEnh ? '不回點' : '+1 點'}</em></button>
      <button data-act="skill" class="skillbtn big" ${lock || !Engine.canSkill() ? 'disabled' : ''} title="戰技·${esc(ch.actions.skill)}（E）">
        <span class="ico">✦</span><span class="lbl">戰技</span><small>${esc(ch.actions.skill)}</small><em>${skillNote}</em></button>
    </div>`;
  } else {
    skills = `<div class="actions skills idle"><div class="skill-wait">${cur && cur.side === 'enemy' ? '敵方行動中' : ''}</div></div>`;
  }
  $('#skills').innerHTML = skills;

  // 中央提示
  const tgt = byId(S.target);
  const mid = $('#midinfo');
  mid.classList.toggle('armedbar', !!armed);
  let m = '';
  if (armed) {
    const a = byId(armed);
    const now = !playing && (S.phase === 'input' || S.phase === 'between');
    const single = Engine.CHARS[a.key].ultTarget === 'enemy';
    m = `<div class="turnban arm">✦ ${esc(a.name)}【${esc(Engine.CHARS[a.key].actions.ult)}】</div>
      <div class="tgtinfo">${single ? `目標：${tgt ? esc(tgt.name) : '—'}（點敵人切換，再點一次同一個目標發動）` : '群體攻擊'}${now ? '' : ' · 確認後在最近的插入窗口發動（持續傷害後／技能施放後）'}</div>
      <div class="midbtns"><button class="primary" data-cmd="fireult">${now ? '發動' : '預約發動'}</button><button data-cmd="cancelult">取消（Esc）</button></div>`;
  } else if (ENDED.includes(S.phase) && !playing) {
    const txt = { win: '勝利', lose: '失敗', timeout: '達到輪數上限' }[S.phase];
    if (activeDungeon && S.phase === 'win') {
      const d = Meta.DUNGEONS.find(x => x.id === activeDungeon);
      m = `<div class="turnban end ${S.phase}">${txt}</div><div class="tgtinfo">副本「${esc(d.name)}」通關</div>
        <div class="midbtns">${dungeonClaimed ? '' : `<button class="primary" data-cmd="claim">🎁 領取獎勵（消耗 ${d.cost} 體力）</button>`}
        <button data-cmd="redungeon">再次挑戰</button><button data-view="dungeon">返回副本</button></div>`;
    } else {
      m = `<div class="turnban end ${S.phase}">${txt}</div><div class="midbtns"><button class="primary" data-cmd="restart">↻ 再來一場</button></div>`;
    }
  } else if (cur) {
    const ally = cur.side === 'ally';
    m = `<div class="turnban ${ally ? 'ally' : 'enemy'}">${S.currentExtra && ally ? '額外回合 · ' : ''}${esc(cur.name)} ${ally && !playing ? '的回合' : '行動中'}</div>`;
    if (ally && !playing) {
      const ch = Engine.CHARS[cur.key], allyT = byId(S.allyTarget);
      m += `<div class="tgtinfo">目標：${tgt ? esc(tgt.name) : '—'}${ch.skillTarget === 'ally' ? ` · 戰技對象：${allyT ? esc(allyT.name) : '—'}` : ''}</div>`;
    }
  }
  if (ultQueue.length) m += `<div class="qinfo">✦ 預約：${ultQueue.map(id => esc(byId(id).name)).join('、')}（在最近的回合前或行動後窗口發動）</div>`;
  if (playing) m += `<div class="midbtns"><button data-cmd="skip" class="ghostbtn">⏭ 跳過動畫</button></div>`;
  mid.innerHTML = m;

  updateSplash(armed ? byId(armed).key : cur && cur.side === 'ally' ? cur.key : null, !!armed, !!(cur && cur.side === 'enemy'));

  document.querySelector('[data-cmd=undo]').disabled = !Engine.canUndo();
  document.querySelector('[data-cmd=autostep]').disabled = playing || S.phase !== 'input' || !!armed;
  const ab = $('#autoBtn');
  ab.classList.toggle('on', autoOn);
  ab.dataset.tip = `自動戰鬥：${autoOn ? '開' : '關'}`;
  $('#speedBtn .spdv').textContent = `${CFG.ui.speed}×`;
  $('#logBtn').classList.toggle('on', logOpen);
  renderStats(S);
  applyTweens();
}

/* ---------- 各角色的打擊特效 ---------- */
const FXK = () => 1 / Math.min(CFG.ui.speed, 2);
function fxDiv(cls, x, y, css, life) {
  const d = document.createElement('div');
  d.className = 'fxp ' + cls;
  d.style.cssText = `left:${x}px;top:${y}px;${css || ''}`;
  $('#fx').appendChild(d);
  setTimeout(() => d.remove(), (life || 900) * FXK() + 100);
  return d;
}
function slash(p, deg, col, delay, len, w) {
  setTimeout(() => fxDiv('slash', p.x, p.y, `--r:${deg}deg;--c:${col};--len:${len || 170}px;--w:${w || 4}px;animation-duration:${0.34 * FXK()}s`, 500), (delay || 0) * FXK());
}
function sparks(p, col, n, dist) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = (dist || 50) * (0.5 + Math.random());
    fxDiv('spark', p.x, p.y, `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--c:${col};animation-duration:${(0.35 + Math.random() * 0.25) * FXK()}s`, 700);
  }
}
function burst(p, cls, col, dur) { fxDiv(cls, p.x, p.y, `--c:${col};animation-duration:${dur * FXK()}s`, dur * 1000 + 50); }
function shakeField(big) { addCls($('.field'), big ? 'shake2' : 'shake'); }

function attackFx(f, s, t) {
  const W = viewState();
  const src = (W.units || []).find(u => u.id === f.src) || Engine.state().units.find(u => u.id === f.src);
  const key = f.src === 'cashbox' ? 'cashbox' : src && src.side === 'ally' ? src.key : 'enemy';
  const a = center(s), b = center(t);
  const k = FXK();
  const hp = { x: b.x, y: b.r.top + b.r.height * (key === 'enemy' ? 0.45 : 0.55) };   // 命中點
  addCls(s, 'lunge');
  switch (key === 'enemy' && src && src.type === 'raiden' ? 'enemy-raiden' : key) {
    case 'kane':      // 交叉斬擊
      slash(hp, -32, '#cfe0ff', 0, 190, 5); slash(hp, 36, '#ffffff', 70, 170, 4);
      setTimeout(() => sparks(hp, '#dbe8ff', 12, 70), 90 * k);
      break;
    case 'longzhao':  // 三道爪痕 + 血花
      [-18, 0, 18].forEach((o, i) => slash({ x: hp.x + o, y: hp.y + o * 0.35 }, 64, '#ff4a3a', i * 45, 150, 5));
      setTimeout(() => { sparks(hp, '#d0142c', 14, 60); burst(hp, 'splat', '#b30f25', 0.5); }, 140 * k);
      break;
    case 'mocha': {   // 冰晶飛彈 → 霜爆
      const ang = Math.atan2(hp.y - a.y, hp.x - a.x);
      for (let i = 0; i < 3; i++) {
        setTimeout(() => fxDiv('shard', a.x + (i - 1) * 16, a.y, `--dx:${hp.x - a.x - (i - 1) * 16}px;--dy:${hp.y - a.y}px;--rot:${ang}rad;--c:#9fe4ff;animation-duration:${0.26 * k}s`, 300), i * 55 * k);
      }
      setTimeout(() => { burst(hp, 'frost', '#9fe4ff', 0.55); sparks(hp, '#d8f6ff', 12, 60); }, 360 * k);
      break;
    }
    case 'alan': {    // 狙擊彈道 → 火焰爆炸
      const len = Math.hypot(hp.x - a.x, hp.y - a.y), ang = Math.atan2(hp.y - a.y, hp.x - a.x);
      burst({ x: a.x, y: a.y - 20 }, 'muzzle', '#ffd08a', 0.25);
      fxDiv('tracer', a.x, a.y - 20, `--len:${len}px;--r:${ang}rad;--c:#ffb36b;animation-duration:${0.24 * k}s`, 300);
      setTimeout(() => { burst(hp, 'boom', '#ff8a4c', 0.6); sparks(hp, '#ffcf7a', 16, 80); }, 110 * k);
      break;
    }
    case 'cashbox': {     // 兌現匣：從匣子射出該屬性顏色的光束
      const col = ELEM_COLOR[f.elem] || '#ffd36a', len = Math.hypot(hp.x - a.x, hp.y - a.y), ang = Math.atan2(hp.y - a.y, hp.x - a.x);
      fxDiv('tracer', a.x, a.y, `--len:${len}px;--r:${ang}rad;--c:${col};animation-duration:${0.28 * k}s`, 350);
      setTimeout(() => { burst(hp, 'boom', col, 0.5); sparks(hp, col, 14, 70); }, 120 * k);
      break;
    }
    case 'alexandra': {   // 紅藍警燈一閃 → 兩道風刃 → 旋風
      fxDiv('siren', hp.x - 20, hp.y - 26, `--c:#ff3a4a;animation-duration:${0.3 * k}s`, 400);
      setTimeout(() => fxDiv('siren', hp.x + 20, hp.y - 26, `--c:#3a7aff;animation-duration:${0.3 * k}s`, 400), 80 * k);
      slash({ x: hp.x, y: hp.y - 12 }, 6, '#7ff0bf', 40, 220, 5); slash({ x: hp.x, y: hp.y + 14 }, -8, '#dcfff1', 110, 200, 4);
      setTimeout(() => { burst(hp, 'gust', '#5fe3a8', 0.5); sparks(hp, '#dcfff1', 10, 70); }, 120 * k);
      break;
    }
    case 'mark': {        // 水流的弧線 → 漣漪與水花
      slash({ x: hp.x, y: hp.y - 10 }, -14, '#8fd0ff', 30, 230, 6); slash({ x: hp.x, y: hp.y + 12 }, 10, '#4fa8ff', 100, 200, 5);
      setTimeout(() => { burst(hp, 'ripple', '#4fa8ff', 0.6); burst({ x: hp.x, y: hp.y + 6 }, 'ripple', '#bfe6ff', 0.45); sparks(hp, '#bfe6ff', 12, 60); }, 140 * k);
      break;
    }
    case 'hanye': {       // 帶刻度的直線切割 → 方格
      fxDiv('rift', hp.x, hp.y, `--r:${(-35 + Math.random() * 70).toFixed(0)}deg;--c:#8fb4ff;animation-duration:${0.36 * k}s`, 450);
      setTimeout(() => { burst(hp, 'gridsq', '#8fb4ff', 0.45); sparks(hp, '#dfe8ff', 6, 40); }, 80 * k);
      break;
    }
    case 'otg': {         // 鎖鏈抽向目標 → 纏著鎖鏈的手撕出交叉的血色裂口 → 血花與斷裂的鏈環
      chainFx(a, hp, 0.32, 380);
      setTimeout(() => {
        burst(hp, 'boom', '#3a0a10', 0.3);
        slash({ x: hp.x - 8, y: hp.y }, 58, '#d0142c', 0, 190, 8); slash({ x: hp.x + 8, y: hp.y + 4 }, -58, '#ff4a3a', 50, 180, 6);
        slash({ x: hp.x, y: hp.y }, 58, '#ffd0d0', 10, 150, 2);
      }, 110 * k);
      setTimeout(() => {
        burst(hp, 'splat', '#8a0a1c', 0.55); sparks(hp, '#ff4a3a', 16, 85);
        for (let i = 0; i < 5; i++) fxDiv('clink', hp.x, hp.y, `--dx:${(Math.random() * 140 - 70).toFixed(0)}px;--dy:${(Math.random() * 90 - 70).toFixed(0)}px;--r:${(Math.random() * 360) | 0}deg;animation-duration:${0.6 * k}s`, 700);
      }, 200 * k);
      break;
    }
    case 'miller': {      // 黑傘在目標上方撐開一閃 → 雨絲落下 → 罌粟與白菊的花瓣飄落 → 紫色漣漪
      fxDiv('umb', hp.x, hp.y - 46, `animation-duration:${0.62 * k}s`, 700);
      slash({ x: hp.x, y: hp.y - 4 }, 160, '#1c1d2b', 60, 230, 8); slash({ x: hp.x, y: hp.y - 4 }, 160, '#b9bff0', 100, 200, 2);
      for (let i = 0; i < 7; i++) fxDiv('rainl', hp.x + (Math.random() * 120 - 60), hp.y - 90 - Math.random() * 30, `animation-delay:${(i * 35 * k).toFixed(0)}ms;animation-duration:${0.42 * k}s`, 700);
      for (let i = 0; i < 8; i++) fxDiv(i % 2 ? 'petal w' : 'petal r', hp.x + (Math.random() * 100 - 50), hp.y - 50 - Math.random() * 30, `--c:${i % 2 ? '#f2f2f6' : '#c8203c'};--dx:${(Math.random() * 50 - 25).toFixed(0)}px;animation-delay:${(80 + i * 45) * k | 0}ms;animation-duration:${0.95 * k}s`, 1300);
      setTimeout(() => { burst({ x: hp.x, y: hp.y + 10 }, 'ripple', '#9fa8e0', 0.55); burst(hp, 'splat', '#2a2540', 0.35); sparks(hp, '#d8dcf4', 8, 50); }, 160 * k);
      break;
    }
    case 'gordon': {      // K 線從命中點長出 + 金幣
      for (let i = 0; i < 5; i++) {
        const up = Math.random() < 0.6;
        fxDiv('candle', hp.x + (i - 2) * 14, hp.y + 16, `--c:${up ? '#ff4a58' : '#2fe07a'};--h:${(18 + Math.random() * 40).toFixed(0)}px;animation-delay:${(i * 40 * k).toFixed(0)}ms;animation-duration:${0.55 * k}s`, 800);
      }
      burst(hp, 'splat', '#ffd36a', 0.45);
      setTimeout(() => sparks(hp, '#fff0b0', 10, 60), 90 * k);
      break;
    }
    case 'enemy-raiden': {   // 雷霆-09型：電棍的雷光劈下 → 電弧
      fxDiv('rift', hp.x, hp.y - 20, `--r:${(-75 + Math.random() * 20).toFixed(0)}deg;--c:#b48cff;animation-duration:${0.3 * k}s`, 400);
      slash(hp, 100 + Math.random() * 20, '#e8e0ff', 0, 170, 5); slash(hp, 80, '#b48cff', 40, 150, 3);
      setTimeout(() => { burst(hp, 'boom', '#b48cff', 0.4); sparks(hp, '#e8f0ff', 14, 70); }, 70 * k);
      break;
    }
    default:          // 敵人：紅色爪擊
      slash(hp, 115 + Math.random() * 30, '#ff5a4c', 0, 150, 4);
      setTimeout(() => sparks(hp, '#ff7a6a', 8, 45), 60 * k);
  }
  if (key !== 'cashbox') Sound.play('atk_' + key);
  const hitAt = HIT_MS[key] || 80;
  Sound.play(key === 'enemy' ? 'hurt' : 'hit', { elem: f.elem, crit: f.crit, delay: hitAt * k / 1000, gap: 20 });
  setTimeout(() => addCls(t, key !== 'enemy' ? 'knock-up' : 'knock-down'), 120 * k);
  if (f.crit || f.big) setTimeout(() => shakeField(true), 100 * k);
  else if (key !== 'enemy') setTimeout(() => shakeField(false), 100 * k);
}
function dotFx(t, f) {
  const b = center(t);
  const p = { x: b.x, y: b.r.top + b.r.height * 0.45 }, k = FXK();
  const type = f && (f.dotType || (f.elem === 'sorrow' ? 'mourn' : f.elem)) || 'lacer';
  const stage = Math.max(1, Math.min(3, f && f.dotStage || 1));
  const tag = { lacer: '裂傷', original: '原罪裂傷', bloodBreak: '血破', mourn: `悲悼 ${stage}`, fire: '灼燒', wind: '風化', thunder: '感電', ice: '凍傷' }[type] || '持續傷害';
  const col = { lacer: '#fa6c76', original: '#ff325d', bloodBreak: '#d43c68', mourn: '#b9b2f1', fire: '#ff9b54', wind: '#7de1b2', thunder: '#ba99ff' }[type] || '#bca0ed';
  const d = document.createElement('div');
  d.className = 'dot-impact dot-' + type; d.dataset.dotType = type;
  const life = Math.max(0.2, ({ bloodBreak: 0.8, mourn: 0.9, original: 0.7 }[type] || 0.6) * k);
  d.style.cssText = `left:${p.x}px;top:${p.y}px;--dc:${col};--life:${life}s;--power:${stage}`;
  const seed = (f && f.src || '') + type; d.dataset.source = seed;
  const rnd = (lo, hi) => (lo + Math.random() * (hi - lo)).toFixed(0);
  if (type === 'mourn') {        // 悲悼：罌粟與白菊在目標周圍綻開一圈，隨雨絲緩緩落下；階段越高花越多
    const n = 3 + stage * 2, r = 30 + stage * 8;
    d.innerHTML = `<i class="dot-halo"></i>${Array.from({ length: n }, (_, i) => `<i class="dot-fl ${i % 2 ? 'w' : 'r'}" style="--a:${i * 360 / n}deg;--r:${r}px;--d:${(i * 0.03).toFixed(2)}s;--sp:${(Math.random() * 120 - 60).toFixed(0)}deg"></i>`).join('')}<i class="dot-rain"></i><b>${tag}</b>`;
    burst(p, 'ripple', col, 0.36);
  } else if (type === 'bloodBreak') {   // 血破：傷口迸裂，血沫呈扇形噴出、拋物線落下，地面留下血跡
    d.innerHTML = `<i class="dot-burst"></i>${Array.from({ length: 14 }, (_, i) => {
      const a = (-160 + i * 140 / 13 + Math.random() * 10) * Math.PI / 180, v = 40 + Math.random() * 46;
      return `<i class="dot-blood" style="--dx:${(Math.cos(a) * v).toFixed(0)}px;--dy:${(Math.sin(a) * v).toFixed(0)}px;--fall:${rnd(34, 60)}px;--sz:${rnd(4, 9)}px;--d:${(Math.random() * 0.04).toFixed(2)}s"></i>`;
    }).join('')}<i class="dot-stain"></i><b>${tag}</b>`;
    burst(p, 'splat', '#a41748', 0.24); shakeField(false);
  } else if (type === 'original') {    // 原罪裂傷：倒十字的封印先烙上，再被兩道深紅的刃痕劈開
    d.innerHTML = '<i class="dot-halo"></i><i class="dot-seal"></i><i class="dot-razor one"></i><i class="dot-razor two"></i><i class="dot-glint"></i><b>原罪裂傷</b>';
    sparks(p, '#ff6a7b', 7, 42);
  } else if (type === 'lacer') {       // 裂傷：一道極細的刀光劃過、刃尖帶一點白光，傷口隨後裂開滲血
    const ang = rnd(-70, -30);
    d.innerHTML = `<i class="dot-razor" style="--angle:${ang}deg"></i><i class="dot-wound" style="--angle:${ang}deg"></i><i class="dot-glint" style="--angle:${ang}deg"></i>${[0, 1, 2].map(i => `<i class="dot-drop" style="left:${(i - 1) * 12 - 3}px;--d:${(0.08 + i * 0.05).toFixed(2)}s"></i>`).join('')}<b>裂傷</b>`;
    sparks(p, '#ffe0e0', 4, 22);
  } else if (type === 'fire') {        // 灼燒：火舌從下方竄起，火星往上飄
    d.innerHTML = `${Array.from({ length: 9 }, (_, i) => `<i class="dot-ember" style="left:${rnd(-26, 26)}px;--h:${rnd(30, 70)}px;--d:${(i * 0.03).toFixed(2)}s"></i>`).join('')}<i class="dot-flame"></i><b>${tag}</b>`;
  } else if (type === 'thunder') {     // 感電：鋸齒電弧在目標身上竄動
    d.innerHTML = `${[0, 1, 2].map(i => `<i class="dot-arc" style="--angle:${rnd(0, 360)}deg;--d:${(i * 0.05).toFixed(2)}s"></i>`).join('')}<i class="dot-ring"></i><b>${tag}</b>`;
  } else if (type === 'wind') {        // 風化：旋轉的氣流把碎屑削下
    d.innerHTML = `<i class="dot-swirl"></i><i class="dot-swirl two"></i>${Array.from({ length: 6 }, (_, i) => `<i class="dot-chip" style="--a:${i * 60}deg"></i>`).join('')}<b>${tag}</b>`;
  } else if (type === 'ice') {         // 凍傷：冰晶從體表長出後碎裂
    d.innerHTML = `${Array.from({ length: 6 }, (_, i) => `<i class="dot-crystal" style="--a:${i * 60}deg"></i>`).join('')}<i class="dot-ring"></i><b>${tag}</b>`;
  } else {
    d.innerHTML = '<i class="dot-ring"></i><i class="dot-halo"></i><b>' + tag + '</b>';
    sparks(p, col, 7, 38);
  }
  // A short bounded tail keeps rapid ticks legible without filling the screen.
  const active = [...document.querySelectorAll(`.dot-impact[data-dot-type="${type}"]`)];
  if (active.length >= 12) active.slice(0, active.length - 11).forEach(el => el.remove());
  $('#fx').appendChild(d); setTimeout(() => d.remove(), life * 1000 + 80);
}

function logLine(l, isNew) {
  const cyc = l.type === 'turn' ? `<span class="cyc">[第${l.cycle}輪]</span>` : '';
  return `<div class="${l.type}${l.crit ? ' crit' : ''}${isNew ? ' new' : ''}"${l.detail ? ` title="${esc(l.detail)}"` : ''}>${cyc}${l.crit ? '<b class="critTag">暴擊</b>' : ''}${esc(l.text)}</div>`;
}
/** 主傷害與附傷：
 *  主傷害
 *  ├附傷1
 *  └附傷n */
function logTree(l, subs, isNew) {
  if (!subs || !subs.length) return logLine(l, isNew);
  return `<div class="lgroup${isNew ? ' new' : ''}">${logLine(l, false)}${subs.map((x, i) =>
    `<div class="${x.type} sub${x.crit ? ' crit' : ''}"${x.detail ? ` title="${esc(x.detail)}"` : ''}><span class="tree">${i === subs.length - 1 ? '└' : '├'}</span>${x.crit ? '<b class="critTag">暴擊</b>' : ''}${esc(x.text)}</div>`).join('')}</div>`;
}
function renderLogFull() {
  const S = Engine.state();
  const el = $('#log');
  const from = Math.max(0, shownLog - 1500), list = S.log.slice(from, shownLog), kids = new Map();
  const parent = (l, i) => l.syncTo != null ? l.syncTo - from : l.up ? i - l.up : -1;
  list.forEach((l, i) => { const k = parent(l, i); if (k >= 0 && k < i) (kids.get(k) || kids.set(k, []).get(k)).push(l); });
  el.innerHTML = list.map((l, i) => (parent(l, i) >= 0 && parent(l, i) < i ? '' : logTree(l, kids.get(i), false))).join('');
  el.scrollTop = el.scrollHeight;
}
function appendLog(entry, subs) {
  const el = $('#log');
  el.insertAdjacentHTML('beforeend', logTree(entry, subs, true));
  while (el.childElementCount > 1600) el.firstElementChild.remove();
  el.scrollTop = el.scrollHeight;
}

function renderStats(S) {
  const allies = S.units.filter(u => u.side === 'ally').concat(S.stats.cashbox ? [{ id: 'cashbox', name: '兌現匣' }] : []);
  const total = allies.reduce((s, a) => s + ((S.stats[a.id] || {}).total || 0), 0);
  const cyc = Math.max(1, S.time / 100);
  let h = `<table><tr><td>我方總傷害</td><td class="n">${fmt(total)}</td></tr>
    <tr><td>經過行動值</td><td class="n">${S.time.toFixed(1)}</td></tr>
    <tr><td>平均每 100 行動值</td><td class="n">${fmt(total / cyc)}</td></tr></table>`;
  allies.forEach(a => {
    const st = S.stats[a.id] || { total: 0, src: {} };
    const share = total ? st.total / total : 0;
    h += `<h3>${esc(a.name)} — ${fmt(st.total)}（${(share * 100).toFixed(1)}%）</h3><div class="share" style="width:${share * 100}%"></div><table>`;
    Object.entries(st.src).sort((x, y) => y[1] - x[1]).forEach(([k, v]) => {
      h += `<tr><td>${esc(k)}</td><td class="n">${fmt(v)}</td><td class="n">${st.total ? (v / st.total * 100).toFixed(1) : 0}%</td></tr>`;
    });
    h += '</table>';
  });
  const taken = Object.entries(S.stats).filter(([k]) => !k.startsWith('a_') && k !== 'cashbox').reduce((s, [, v]) => s + v.total, 0);
  h += `<h3>敵方造成傷害</h3><table><tr><td>合計（含被護盾吸收）</td><td class="n">${fmt(taken)}</td></tr></table>`;
  $('#stats').innerHTML = h;
}

/* ================= 設定頁 ================= */
const CHAR_FIELDS = [
  ['lvl', '等級'], ['baseAtk', '基礎攻擊'], ['atkPct', '攻擊%'], ['hp', '生命'], ['def', '防禦'], ['spd', '速度'],
  ['cr', '暴擊率%'], ['cd', '暴傷%'], ['dmgBonus', '屬性增傷%'], ['ehr', '效果命中%'], ['effRes', '效果抵抗%'], ['err', '能量效率%'],
  ['maxEnergy', '能量上限'], ['startEnergy', '初始能量%'],
];
const ENEMY_FIELDS = [['wave', '波次'], ['type', '類型', 'type'], ['name', '名稱', 'text'], ['hp', '生命'], ['atk', '攻擊'], ['spd', '速度'],
  ['lvl', '等級'], ['tough', '韌性'], ['weak', '弱點（物理,冰,火）', 'text'], ['effRes', '效果抵抗%']];

function renderConfig() {
  const C = CFG, keys = Object.keys(Engine.CHARS);
  const opt = (v, sel, label) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${label}</option>`;
  const num = (path, v) => `<input type="number" step="any" data-path="${path}" value="${v}">`;
  const chk = (key, label) => `<label class="chk"><input type="checkbox" data-path="rules.${key}" ${C.rules[key] !== false && C.rules[key] ? 'checked' : ''}>${label}</label>`;

  let h = `<section><h2>音效與音樂</h2><div class="sndctl">${soundCtlHtml()}</div>
    <p class="notes">音樂與音效都是即時合成的，不需要下載音檔。音量設定存在這個瀏覽器，不會跟著存檔移動。第一次點擊畫面後才會開始發聲（瀏覽器的規定）。</p></section>`;
  h += `<section><h2>終結技演出</h2><div class="btns ulttest">
    <label>演出 <select data-ui="ultAnim"><option value="full">完整</option><option value="short">精簡（約 3 秒）</option><option value="off">快速</option></select></label>
    ${keys.map(k => `<button data-cmd="ulttest" data-key="${k}">▶ ${Engine.CHARS[k].name}</button>`).join('')}</div>
    <p class="notes">試播依上方選擇的模式播放；快速顯示角色專屬施放效果，精簡與完整使用目前戰鬥的敵人陣容。</p></section>`;
  h += `<section><h2>自律處刑官外觀</h2><label>外觀 <select data-ui="raidenSkin">${opt('raiden', C.ui.raidenSkin, '雷霆-09型（原版）')}${opt('kane', C.ui.raidenSkin, '異相凱恩（彩蛋）')}</select></label>
    <p class="notes">立即切換戰場、行動條與終結技中的外觀，兩個階段都會套用。技能、通緝機制與數值維持原樣。</p><div id="raidenSkinPreview" class="raiden-skin-preview" aria-label="自律處刑官外觀預覽"></div></section>`;
  h += `<section><h2>隊伍（順序 = 站位，莫卡兄弟終結技的「第一位我方」以此為準）</h2><div class="team">`;
  for (let i = 0; i < 4; i++) {
    h += `<select data-team="${i}">${opt('', C.team[i] || '', '（空）')}${keys.map(k => opt(k, C.team[i], Engine.CHARS[k].name)).join('')}</select>`;
  }
  h += `</div></section>`;

  h += `<section><h2>角色本體基礎數值（不含金句、妙具、經緯；那些請到「角色」頁設定）</h2><table><tr><th>角色</th>${CHAR_FIELDS.map(f => `<th>${f[1]}</th>`).join('')}</tr>`;
  keys.forEach(k => {
    h += `<tr><td>${Engine.CHARS[k].name}</td>${CHAR_FIELDS.map(f => `<td>${num(`chars.${k}.${f[0]}`, C.chars[k][f[0]] || 0)}</td>`).join('')}</tr>`;
  });
  h += `</table><p class="notes">最終攻擊力 = (本體攻擊 + 金句攻擊) × (1 + 攻擊%) + 妙具固定攻擊。百分比欄位填數字，例如 50 代表 50%。</p></section>`;

  h += `<section><h2>自訂戰鬥的敵人與波次（同一波次編號的敵人一起出場）</h2><table><tr>${ENEMY_FIELDS.map(f => `<th>${f[1]}</th>`).join('')}<th></th></tr>`;
  C.enemies.forEach((e, i) => {
    h += '<tr>' + ENEMY_FIELDS.map(f => {
      const p = `enemies.${i}.${f[0]}`;
      if (f[2] === 'type') return `<td><select data-path="${p}">${Object.entries(Engine.ENEMY_TYPES).map(([k, t]) => opt(k, e.type, t.name)).join('')}</select></td>`;
      if (f[2] === 'text') return `<td><input type="text" class="wide" data-path="${p}" value="${esc(e[f[0]] || '')}"></td>`;
      return `<td>${num(p, e[f[0]])}</td>`;
    }).join('') + `<td><button data-cfg="delEnemy" data-i="${i}">刪除</button></td></tr>`;
  });
  h += `</table><div class="btns" style="margin-top:8px"><button data-cfg="addEnemy">＋ 新增敵人</button></div>
    <p class="notes">敵人類型說明請看「副本」頁最下方。非弱點屬性的抗性統一由下方規則設定。</p></section>`;

  h += `<section><h2>規則與秘技</h2><div class="grid2">
    <label>暴擊計算 <select data-path="rules.critMode">${opt('expected', C.rules.critMode, '期望值（穩定，適合比較）')}${opt('random', C.rules.critMode, '隨機擲骰')}</select></label>
    <label>最大輪數 ${num('rules.maxCycles', C.rules.maxCycles)}</label>
    <label>非弱點屬性抗性% ${num('rules.resNonWeak', C.rules.resNonWeak)}</label>
    <label>裂傷層數上限（0 = 無上限）${num('rules.lacerMax', C.rules.lacerMax)}</label>
    <label>莫卡兄弟秘技目標 <select data-path="rules.mochaTechTarget">${keys.map(k => opt(k, C.rules.mochaTechTarget, Engine.CHARS[k].name)).join('')}</select></label>
    <span></span>
    ${chk('lzTechnique', '開場使用 龍爪 秘技【街頭威懾】')}
    ${chk('mochaTechnique', '開場使用 莫卡兄弟 秘技【預付訂金，該不退還】')}
    ${chk('alanTechnique', '開場使用 阿蘭 秘技【戰術演繹】')}
    ${chk('gordonTechnique', '開場使用 戈登 秘技【保密協議】')}
    ${chk('alexTechnique', '開場使用 亞歷山卓 秘技【油門踩到底，抓穩！】')}
    ${chk('hanyeTechnique', '開場使用 寒夜 秘技【先驗】')}
    ${chk('markTechnique', '開場使用 馬克 秘技【心如止水】（隊伍第一位獲得斂藏）')}
    ${chk('otgTechnique', '開場使用 O.T.G. 秘技【原罪清算】（對生命值上限最高的敵人施放戰技，自身 2 層裂傷）')}
    ${chk('millerTechnique', '開場使用 米勒 秘技【今日，我們共聚一堂⋯⋯】（敵方全體告死）')}
    ${chk('cashbox', '啟用本質權能「兌現匣」')}
    ${chk('toughness', '啟用韌性與弱點擊破（舊機制，目前預設關閉）')}
    ${chk('kaneTechnique', '開場使用 凱恩 秘技【先行】')}
    ${chk('useRelics', '戰鬥中套用妙具（關閉可比較裸裝數值）')}
    ${chk('enemyAttack', '敵人會行動（關閉 = 木樁模式）')}
    ${chk('infiniteSP', '無限戰技點')}
    ${chk('bbImmediate', '血破在產生的同一回合開始就立即結算')}
    ${chk('kaneEnhStack', '收網加成疊加（1 名敵人時 300+100+200 = 600%）')}
  </div></section>`;

  h += `<section><h2>通用規則（沙盒的預設處理方式）</h2><ul class="notes">
    <li><b>傷害公式</b>：基礎值 × (1+增傷) × 防禦區 × 抗性區 × 韌性區 × 承傷區 × 暴擊區。防禦區 = 1 − DEF/(DEF+200+10×攻擊者等級)，敵人 DEF = 200+10×等級。</li>
    <li><b>韌性與擊破</b>：只有命中弱點屬性才削韌。未擊破的敵人受到傷害 ×0.9。擊破時造成擊破傷害並使敵人行動延後 25%，敵人下一回合開始時恢復韌性。沒有實作擊破後的持續傷害。</li>
    <li><b>行動值</b> = 10000 / 速度。第 1 輪 150 行動值，之後每輪 100。行動軸上方顯示本輪剩餘行動值，並標出每一輪的結束位置。</li>
    <li><b>戰技點</b>：初始 3、上限 5。<b>能量</b>：普攻 +20、戰技 +30、終結技後 +5、追加攻擊 +10、受擊 +10，皆乘能量恢復效率。</li>
    <li><b>狀態</b>：點角色卡上的任何狀態標籤可以查看效果；<b>長按</b>角色卡可查看即時數值、金句與妙具。</li>
    <li><b>波次</b>：換波時我方的能量、行動值、增益和戰技點都保留；新敵人以滿行動值出場。</li>
  </ul></section>`;

  h += `<section class="btns"><button class="primary" data-cfg="apply">儲存並開始自訂戰鬥</button><button data-cfg="reset">恢復預設值</button></section>`;
  $('#config').innerHTML = h;
  renderRaidenSkinPreview();
}

function syncRaidenSkin() {
  if (typeof Art !== 'undefined' && Art.setRaidenSkin) Art.setRaidenSkin(CFG.ui.raidenSkin);
  document.querySelectorAll('[data-ui=raidenSkin]').forEach(el => { el.value = CFG.ui.raidenSkin === 'kane' ? 'kane' : 'raiden'; });
}
function renderRaidenSkinPreview() {
  const el = $('#raidenSkinPreview');
  if (!el) return;
  syncRaidenSkin();
  el.innerHTML = [false, true].map(phase2 => `<figure class="${phase2 ? 'raiden-phase2' : ''}"><div class="efig">${enemySvg({ type: 'raiden', phase2 })}</div><figcaption>${phase2 ? '第二階段' : '第一階段'}</figcaption></figure>`).join('');
}

if (typeof Art !== 'undefined' && Art.onReady) Art.onReady(() => { if (view === 'config') renderRaidenSkinPreview(); });

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = val;
}

/* ================= 事件 ================= */
const VIEWS = ['battle', 'chars', 'bag', 'dungeon', 'gacha', 'powers', 'save', 'config'];
function setView(v) {
  if (v !== 'battle' && playing) flush(true);
  if (v !== 'battle') { paused = false; $('#pausemenu').classList.add('hidden'); if (logOpen) { logOpen = false; $('#drawer').classList.remove('open'); } }
  closePop();
  pv = null;
  view = v;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  VIEWS.forEach(x => $('#view-' + x).classList.toggle('hidden', x !== v));
  document.body.classList.toggle('in-battle', v === 'battle');
  const S = Engine.state();
  Sound.music(v === 'battle' ? (S && ENDED.includes(S.phase) ? 'menu' : 'battle') : v === 'gacha' ? 'gacha' : 'menu');
  if (v === 'config') renderConfig();
  else if (v === 'chars') renderChars();
  else if (v === 'dungeon') renderDungeon();
  else if (v === 'gacha') renderGacha();
  else if (v === 'save') renderSave();
  else if (v === 'bag') renderBag();
  else if (v === 'powers') renderPowers();
  else { renderBattle(); if (!playing && !pump()) scheduleAuto(); }
}

/* ================= 權能頁：權能與屬性、性相、時間織機、兌現匣、星流 ================= */
const POWER_ELEMS = { 平衡: ['命', '運', '時', '空', '律'], 本質: ['物理', '火', '水', '風', '雷', '冰', '草'], 情感: ['喜', '怒', '哀', '樂'] };
/* 權能頁的敘事文本：各權能機制的官方文件與阿爾奈斯《為何探索》的頁緣註記，以及八種性相 */
const LORE = {
  essence: {
    kind: 'label', title: '品名：兌現匣（試作型）', motto: '「人提出概念，明日公司實現。」',
    body: ['本產品收集使用者於戰鬥行為中逸散之本質餘料，並於滿料時自動兌現為一次性武裝。形制依投入量最多之屬性決定，裝填依投入量次多之屬性決定。'],
    list: ['本產品僅受理本質權能之投入。其他權能之投入不予受理，亦不退還。', '兌現結果以本公司《標準本質分類》為準，使用者不得異議。', '單一屬性滿料將觸發原型兌現。本公司不對原型兌現之後果負責。',
      '本產品為試作品，使用期間產生之一切數據歸屬實物測試科所有。', '兌現匣發生異常時，請勿自行拆解，並立即聯繫風險處理部。必要時，銷毀部將主動聯繫您。'],
    listHead: '注意事項',
    note: ['我見過許多人在戰鬥中揮拳、扣下扳機、寫下一紙契約。每一次出手，他們身上的本質都朝著某個形狀用力，那是本質賦予每個個體的使命，想要成為什麼的衝動。絕大部分的衝動在出手之後就散掉了，像火星落進雨裡。明日公司做的事情，只是在雨裡擺了一個盒子。',
      '我不確定該不該讚嘆這個發明。把眾人散落的使命收集起來、熔成同一把槍，這究竟是成全了他們，還是替他們做了決定？'],
  },
  balance: {
    kind: 'manual', title: '時間總局校準部　技師手冊　第七章：時間織機操作規範',
    list: ['時間織機為本局核發予外勤技師之標準校準器具。技師應以校準任務之形式，將欲施行之校準提交織機，不得直接施行。', '校準任務一律以本局裁定之句型撰寫：目標物、事實、動作，三者缺一，織機不予受理。',
      '任務用語須符合本局核定之平衡術語與字彙表。各世界泡字彙表略有差異，技師出勤前應向資料部申領當地版本。未經核定之用語，一律退件。', '單一技師所能維持之經緯有限。同一織機之儲存數，依共同作業之技師人數核定，不得私自擴充。',
      '時間線抵達節點時，織機內尚未執行之校準將失去依據。織機將於節點前自動結算所有任務，技師不得延宕。', '本織機僅受理校準類任務，不受理適應類請求。適應之施行，須經局長級以上人員核准。',
      '校準完成後，請於七日內至歷史部登錄。逾期未登錄者，視同未曾發生。'],
    note: ['時間總局的技師簽下契約之後，自己的時間就停了。他們不再老去，卻每天坐在織機前，替別人的時間打結、接線、修補斷口。', '我曾在一處平衡橋的橋頭，看一位技師把當天的任務一張張織進去。他的手很穩，每一條線都對得整整齊齊。我問他，這些織好的布，最後交給誰。', '他想了很久，說他不知道。'],
  },
  emotion: {
    kind: 'prayer', title: '神性大教堂　《星辰禱文》第二章',
    body: ['在女神們尚為凡人的歲月裡，她們笑過、怒過、哭過、歡唱過。當她們走完凡人的一生，便將半縷靈魂刻上天穹，成為星辰，使後來的人仰望時，知道自己的悲喜並不孤單。',
      '聖徒啊，你所推動的不是你自己的情緒，而是星辰的流向。向「長」，是讓情感生長、延展、充盈；向「消」，是讓情感消散、釋放、歸於平靜。兩者皆是恩典，兩者皆不可久居。',
      '當星流抵達盡頭，那位被你呼喚的女神之星便會亮起。在那一刻，你所借用的是她完整活過的一生。', '然後，晚禱的鐘聲會響起。',
      '聽見鐘聲時，放下你借來的一切。星流將回到中節，你將回到你自己。這不是失去，這是女神們教你的最後一課：發出來，再回到中間。'],
    note: ['我在某個世界泡的古書裡讀到一句話：喜怒哀樂尚未發出的時候，叫做「中」；發出來而恰如其分，叫做「和」。寫下這句話的人大概從未聽說過神性大教堂，但我第一次見到聖徒推動星流時，想起的就是它。',
      '星流的極點不是終點。聖徒在那一瞬間借來一位女神的整段人生，快樂的人借來她所有的快樂，悲傷的人借來她所有的悲傷。若沒有鐘聲，我想沒有人承受得住。', '所以我開始覺得，情感權能真正的力量不在推向極點的那一刻，而在鐘聲響起時，願意放手的那一刻。'],
  },
};
const LORE_PATHS = [
  ['本質類', [['型', '敲擊，固化，鏈式反應！能量必等值於或給或不離的孤立系統，在熱機為熵增，在人為是熵減。是原初本質的二中之一。', '如同硬朗的鋼筋鐵骨，所有物理與線喻的一切都必須在其麾下促成。在公理與定律、邏輯與思維組成的世界中，沒有不被它管轄的。與形態、陳述、證明有關。製令於本質權能，目前置於赫萊森，是機械師、工匠、無限定者們的性相。'],
    ['意', '我前往下一個路口，我知道它在哪，那裡有家書局，所以書局存在，但我從未進入過書局，所以擁有無限本書。是原初本質的二中之一。', '存在在唯心，是人們記憶中確切存在的形而上學。是主題的概念，是信者恆信的必要與可能，同時存在的同一與矛盾。若所有人有人因此懷疑，它的根基便成了概率。與共時性、或然率、群體有關。製令於本質權能，目前置於淺意識，是集體、賭徒、偶然者的性相。']]],
  ['情感類', [['氳', '心中脈搏勃鼓，和熙流淌血液。氳，是自由與美好，它躍然於沉重的形體之中，帶給他們活的權利。是原初情感的二中之一。', '一種氣息，虛煙繚緲如夢，流入靈魂與幻零之間，是苗芽生命的最後一哩路，是永不停歇的鮮活震動與探索未知的準則，在精神的世界被永恆簇擁。與生命、靈魂、夢境、感性有關。製令於情感權能，目前別無置之，是元素與吟遊詩人們的性相。'],
    ['沌', '慾望蔽蒙貪嗔癡，法眼開外我執念想。沌，是衝破慾望後的爽朗。是原初情感的二中之一。', '純粹濃縮的感受，本為無形，在捏化塑改的刻板印象中被人們凝固。是莫桑的盲點，但也賜予人們更強大與穩定建構魔法的藍圖。與慾望、無我、心流、感官有關。製令於情感權能，目前置於星流，是魔法師、信徒、洞見者們的性相。']]],
  ['平衡類', [['穩', '一切都需安然其位，如星辰運行於不偏不倚的軌道。穩，是所有現象的門檻，是原初平衡的二中之一。', '與型共同黏著元素、凡胎、智械等生靈的現象世界；與氳共同撐起靈魂與幻零的精神世界；與啟共同服務於擁有偉大實體的蒼白世界。與穩定、時間、門扉有關。製令於平衡權能，目前置於亞伯拉罕，是技師們與平衡擁護者的性相。'],
    ['啟', '不要害怕門扉開啟的瞬間。啟，是指引與洞見，是讓你認清一切本來面目的鑰匙。愚昧無法自欺，真理從不留情。是原初平衡的二中之一。', '啟迪的鑰匙，與各性相關係良好、無互相越權。透過穩所締造的門扉，開啟萬事萬物的洞察——「啟不允許愚昧與無知別出心裁，它總是太快的讓我們洞見真相。」與鑰匙、指引、不可抗力有關。製令於平衡權能，目前置於伊萊，是技師們與學者們的性相。']]],
  ['混亂類', [['秘', '你你你、他他他。你你你、他他他、我。你你我、他他我、我。我我我我我我我我我我我我我我我我。', '加密一切的疑問。若說型與意令世界顯現，那麼秘讓他們別無二致；若說氳與沌使靈魂不同，那麼秘讓他們盲目癡愚。是萬千鳩毒，是歸一的倒影，使一切相同。與同化、鏡子、陰影有關。混亂的二分之一展現，目前置於深淵，是女王蜂、極權者、倒影的性相。'],
    ['境', '境提出假設，創造疑問。而啟不厭其煩地轉動境的孔洞，於是故事開始。', '枝繁葉茂。本能的生長與岔出，走向不同的過程，永遠沒有結局——因為它將在盡頭分出更多枝條。與故事、疑問、盛開有關。混亂的四分之二展現，目前置於花園，是綻放者、說書人、葉脈的性相。']]],
];
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function loreHtml(L) {
  const paras = (L.body || []).map(p => `<p>${esc(p)}</p>`).join('');
  const list = L.list ? (L.kind === 'manual'
    ? `<ol class="lr-art">${L.list.map((x, i) => `<li><b>第${CN_NUM[i]}條</b>${esc(x)}</li>`).join('')}</ol>`
    : `${L.listHead ? `<h4>${esc(L.listHead)}</h4>` : ''}<ol class="lr-list">${L.list.map((x, i) => `<li><b>${CN_NUM[i]}、</b>${esc(x)}</li>`).join('')}</ol>`) : '';
  return `<div class="lore">
    <div class="lr-doc lr-${L.kind}">${L.kind === 'label' ? '<div class="lr-brand">TOMORROW CO.<small>實物測試科 PT-07</small></div>' : ''}
      <h3>${esc(L.title)}</h3>${L.motto ? `<div class="lr-motto">${esc(L.motto)}</div>` : ''}${paras}${list}</div>
    <aside class="lr-note"><div class="lr-src">阿爾奈斯《為何探索》・頁緣註記</div>${L.note.map(p => `<p>${esc(p)}</p>`).join('')}</aside>
  </div>`;
}
function pathsHtml() {
  const chars = Object.entries(Engine.CHARS);
  return LORE_PATHS.map(([cat, list]) => `<div class="lp-cat"><div class="lp-cname">${esc(cat)}</div><div class="lp-grid">${list.map(([n, quote, desc]) => {
    const who = chars.filter(([, c]) => c.path === n).map(([k, c]) => `<span class="pw-ch">${Art.get(k) ? `<i style="${Art.bg(k, 'face', 380)}"></i>` : ''}${esc(c.name)}</span>`).join('');
    return `<div class="lp"><b class="lp-n">${esc(n)}</b><blockquote>「${esc(quote)}」</blockquote><p>${esc(desc)}</p><div class="lp-who">${who || '<small>尚無角色</small>'}</div></div>`;
  }).join('')}</div></div>`).join('');
}
function renderPowers() {
  const C = Engine.CASH, chars = Object.entries(Engine.CHARS);
  const who = (power, elName) => chars.filter(([, c]) => c.power === power && ELEM_NAME[c.elem] === elName).map(([k, c]) => `<span class="pw-ch">${Art.get(k) ? `<i style="${Art.bg(k, 'face', 380)}"></i>` : ''}${esc(c.name)}</span>`).join('');
  const elRow = (power, list) => list.map(n => {
    const k = ELEM_KEY[n], col = k ? ELEM_COLOR[k] : '#8a8aa0';
    return `<div class="pw-el" style="--c:${col}"><b>${esc(n)}</b><div>${who(power, n) || '<small>尚無角色</small>'}</div></div>`;
  }).join('');
  const cashRows = ['phys', 'fire', 'water', 'wind', 'thunder', 'ice', 'grass'].map(e => `<tr style="--c:${ELEM_COLOR[e]}">
      <th>${esc(ELEM_NAME[e])}</th><td><b>${esc(C.FORM[e].name)}</b><br>${esc(C.FORM[e].desc)}</td><td><b>${esc(C.LOAD[e].name)}</b><br>${esc(C.LOAD[e].desc)}</td><td><b>${esc(C.PROTO[e].name)}</b><br>${esc(C.PROTO[e].desc)}</td></tr>`).join('');
  $('#powers').innerHTML = `<div class="pw">
    <h1>權能</h1>
    <p class="pw-lead">每位角色都屬於一種權能，屬性則隸屬於權能之下。同一權能的角色共用一套戰場機制：平衡權能共用「時間織機」，本質權能共用「兌現匣」，情感權能共用「星流」。</p>
    <section><h2>權能與屬性</h2>
      ${Object.entries(POWER_ELEMS).map(([p, list]) => `<div class="pw-power"><div class="pw-pname">${esc(p)}</div><div class="pw-els">${elRow(p, list)}</div></div>`).join('')}
</section>
    <section><h2>性相</h2><p class="pw-lead">性相是角色在權能之下的另一層歸屬，金句的性相層技能依此判定。</p>${pathsHtml()}</section>
    <section><h2>平衡・時間織機</h2>${loreHtml(LORE.balance)}<div class="pw-box">
      <p>平衡權能使用者透過時間織機獲取「校準任務」，完成任務獲得特殊效果。</p>
      <ul><li>時間織機不存在於行動條中。每多一份「校準任務」令時間織機充能 50%，充能至 100% 時可主動啟動（不佔回合，和終結技一樣隨時可按）。啟動後消除所有充能，並依投入順序執行「校準任務」。最多充能至 500%。</li>
        <li>開局、轉波次、敵人轉階段時，時間織機會清空所有「校準任務」，並且執行「校準任務」特殊效果。</li>
        <li>帶有「執行次數」的任務為<b>常駐任務</b>：不佔用時間織機儲存數、不提供充能，每次時間織機啟動時執行一次，次數歸零後消除。開局、轉波次、敵人轉階段的強制清空時，常駐任務執行一次後一併清除。</li>
        <li>可儲存的任務數依我方在場的平衡權能使用者人數：</li></ul>
      <table class="pw-cap"><tr><th>平衡角色</th><td>1 位</td><td>2 位</td><td>3 位</td><td>4 位</td></tr><tr><th>可儲存</th><td>2 份</td><td>3 份</td><td>5 份</td><td>10 份</td></tr></table>
      <p class="hint">常駐任務在時間織機中以虛線框顯示，例如戈登的熔斷、套現、抄底、對沖與寒夜的測度。各角色的任務內容請看角色頁。</p></div></section>
    <section><h2>本質・兌現匣</h2>${loreHtml(LORE.essence)}<div class="pw-box">
      <p>本質權能使用者在行動時逸散的「本質餘料」會被兌現匣蒐集，蒐集滿 ${C.CAP} 份即進行一次「兌現」。</p>
      <ul><li>餘料的屬性與角色屬性相同；每次行動逸散：普攻 ${C.RESIDUE.basic} 份、戰技 ${C.RESIDUE.skill} 份、終結技 ${C.RESIDUE.ult} 份（部分角色有額外加成，例如持有掩護的阿蘭 +1）。</li>
        <li>兌現時，<b>最多</b>的元素成為「形制」，決定攻擊形式；<b>次多</b>的元素成為「裝填」，決定附加效果。數量持平時，以先進入兌現匣的元素優先。</li>
        <li>${C.CAP} 份餘料皆為同一元素時，改為進行「原型兌現」。</li>
        <li>兌現由<b>兌現匣本身</b>發動，不是任何一位隊友。兌現匣的攻擊力，是這 ${C.CAP} 份餘料投入者的加權平均（投入幾份就佔幾份權重）；傷害 = 兌現匣攻擊力 × 倍率，不會暴擊。超過 ${C.CAP} 份的餘料保留到下一次。</li></ul>
      <div class="pw-scroll"><table class="pw-cash"><tr><th></th><th>形制（最多）</th><th>裝填（次多）</th><th>原型兌現（10 份同元素）</th></tr>${cashRows}</table></div>
      <p class="hint">雷、草目前沒有角色，表格先列出完整設計。兌現匣可以在「設定 → 規則與秘技」關閉。</p></div></section>
    <section><h2>情感・星流</h2>${loreHtml(LORE.emotion)}<div class="pw-box">
      <p>情感權能使用者在戰鬥中引導星流朝向「消」與「長」，並在星流到達極端點時釋放環境特殊效果，同時場上所有情感權能使用者進入自己的特殊狀態。</p>
      <ul><li>星流的範圍是 −100%（極消）到 +100%（極長），0% 為「中節」。</li>
        <li>環境特殊效果由<b>最終推動星流到達極端點</b>的角色屬性決定。</li>
        <li>特殊效果釋放時，場上出現以 75 點速度行動的<b>計時器</b>。輪到計時器行動時，星流回到中節（0%），角色與環境的特殊效果消失。</li>
        <li>特殊環境效果持續期間，星流的推動值以 10% 縮放暫存，最多儲存上限的 30%，計時結束時正式計入推動。</li></ul>
      <div class="pw-scroll"><table class="pw-cash"><tr><th></th><th>極長（+100%）</th><th>極消（−100%）</th></tr>
        ${['joy', 'anger', 'sorrow', 'mirth'].map(e => `<tr style="--c:${ELEM_COLOR[e]}"><th>${esc(ELEM_NAME[e])}</th>${['grow', 'fade'].map(side => { const env = Engine.FLOW_ENV[e][side]; return `<td><b>${esc(env.name)}</b><small>${esc(env.desc)}</small></td>`; }).join('')}</tr>`).join('')}</table></div>
      <p class="hint">環境效果對全場生效，與角色特殊狀態同時存在；換波保留剩餘時間，計時器行動時一併結束。喜、怒、樂的效果已實作，將由未來對應情感角色觸發。</p></div></section>
  </div>`;
}

function buildCfg(enemies) {
  const c = clone(CFG);
  if (enemies) c.enemies = clone(enemies);
  c.build = Meta.build(CFG);
  return c;
}
function startBattle(opts) {
  opts = opts || {};
  if ('dungeon' in opts) activeDungeon = opts.dungeon;
  const d = activeDungeon && Meta.DUNGEONS.find(x => x.id === activeDungeon);
  if (!CFG.team.some(Boolean)) { alert('隊伍至少需要一名角色'); return; }
  if (!d && !CFG.enemies.length) { alert('至少需要一名敵人'); return; }
  clearCombatFx();
  clearTimeout(playTimer); queue = []; playing = false; V = null; armed = null; ultQueue = [];
  dungeonClaimed = false; battleRecorded = false;
  readyPrev = {}; endCued = false;
  shownLog = 0;
  $('#log').innerHTML = '';
  view = 'battle';
  setView('battle');
  if (!opts.silent) Meta.record('battle', `開始${d ? '副本「' + d.name + '」' : '自訂戰鬥'}，隊伍：${CFG.team.filter(Boolean).map(k => CHARS[k].name).join('、')}`);
  run(() => Engine.newBattle(buildCfg(d ? d.enemies : null)));
  Sound.music('battle');
}
/** 從存檔還原進行中的戰鬥 */
function resumeBattle(b) {
  if (!b || !Engine.importState(b.state)) return false;
  clearCombatFx();
  activeDungeon = b.activeDungeon || null;
  dungeonClaimed = !!b.dungeonClaimed;
  battleRecorded = b.battleRecorded != null ? !!b.battleRecorded : Engine.state().phase !== 'input';
  clearTimeout(playTimer); queue = []; playing = false; V = null; armed = null;
  readyPrev = {}; endCued = ENDED.includes(Engine.state().phase);
  shownLog = Engine.state().log.length;
  renderLogFull();
  setView('battle');
  return true;
}

/** 選技能時或已抵達窗口立即發動；持續傷害／攻擊播放中則排在最近的窗口。 */
function fireUlt() {
  const id = armed;
  armed = null;
  if (!id || !Engine.canUlt(id)) return renderBattle();
  const S = Engine.state();
  if (!playing && (S.phase === 'input' || S.phase === 'between')) return run(() => Engine.ult(id));
  if (!ultQueue.includes(id)) ultQueue.push(id);
  renderBattle();
  if (!playing) pump();
}
function cancelUlt() {
  armed = null;
  renderBattle();
  if (!playing && !pump()) scheduleAuto();
}
/** 暫停：停止動畫播放與自動戰鬥，打開暫停選單 */
function setPaused(v) {
  paused = v;
  $('#pausemenu').classList.toggle('hidden', !v);
  if (v) { clearTimeout(playTimer); clearTimeout(autoTimer); return; }
  if (queue.length) playNext();
  else if (!pump()) scheduleAuto();
}
const SPEEDS = [0.5, 1, 2, 4];
function cycleSpeed() {
  CFG.ui.speed = SPEEDS[(SPEEDS.indexOf(+CFG.ui.speed) + 1) % SPEEDS.length] || 1;
  syncUiControls(); saveCfg();
  $('#speedBtn .spdv').textContent = `${CFG.ui.speed}×`;
}
function toggleLog(open) {
  if (paused) setPaused(false);
  logOpen = open == null ? !logOpen : open;
  $('#drawer').style.top = (document.querySelector('header').getBoundingClientRect().bottom + 8) + 'px';
  $('#drawer').classList.toggle('open', logOpen);
  $('#logBtn').classList.toggle('on', logOpen);
  if (logOpen) { const el = $('#log'); el.scrollTop = el.scrollHeight; }
}

/* ----- 音量設定（暫停選單、設定頁共用） ----- */
function soundCtlHtml() {
  const p = Sound.pref;
  const row = (k, name, ic) => `<label class="sndrow">${Icon(ic)}<span>${name}</span>
    <input type="range" min="0" max="100" step="1" data-snd="${k}" value="${Math.round(p[k] * 100)}"><b>${Math.round(p[k] * 100)}</b></label>`;
  return row('master', '總音量', 'sound') + row('music', '音樂', 'music') + row('sfx', '音效', 'sparkle')
    + `<label class="sndrow mute"><input type="checkbox" data-snd="muted" ${p.muted ? 'checked' : ''}> 靜音</label>`;
}
function renderSoundCtl() {
  document.querySelectorAll('.sndctl').forEach(el => { el.innerHTML = soundCtlHtml(); });
  const mb = $('#muteBtn');
  if (mb) {
    mb.innerHTML = Icon(Sound.pref.muted ? 'mute' : 'sound');
    mb.dataset.tip = Sound.pref.muted ? '聲音：關（點擊開啟）' : '聲音：開（點擊靜音）';
    mb.classList.toggle('off', Sound.pref.muted);
  }
}
document.addEventListener('input', ev => {
  const k = ev.target.dataset.snd;
  if (!k || k === 'muted') return;
  Sound.set(k, ev.target.value / 100);
  document.querySelectorAll(`[data-snd=${k}]`).forEach(el => { if (el !== ev.target) el.value = ev.target.value; el.nextElementSibling.textContent = ev.target.value; });
});
document.addEventListener('change', ev => {
  const k = ev.target.dataset.snd;
  if (k === 'muted') { Sound.set('muted', ev.target.checked); renderSoundCtl(); }
  else if (k === 'sfx' || k === 'master') Sound.play('confirm');
});

function syncUiControls() {
  syncRaidenSkin();
  document.querySelectorAll('[data-ui=ultAnim]').forEach(el => { el.value = ultMode(); });
  renderSoundCtl();
  document.querySelector('[data-ui=anim]').checked = !!CFG.ui.anim;
  document.querySelector('[data-ui=autoInterval]').value = CFG.ui.autoInterval;
  document.querySelector('[data-ui=speed]').value = String(CFG.ui.speed);
  document.querySelectorAll('[data-crit]').forEach(el => { el.value = CFG.rules.critMode === 'random' ? 'random' : 'expected'; });
}

/* ----- 長按角色卡 ----- */
const lp = { timer: null, fired: false, x: 0, y: 0, card: null };
function lpCancel() { clearTimeout(lp.timer); lp.timer = null; if (lp.card) lp.card.classList.remove('pressing'); lp.card = null; }
document.addEventListener('pointerdown', ev => {
  if (view !== 'battle' || ev.button > 0) return;
  const card = ev.target.closest('.card[data-uid], .eunit[data-uid]');
  if (!card || ev.target.closest('button, [data-st]')) return;
  lp.x = ev.clientX; lp.y = ev.clientY; lp.fired = false; lp.card = card;
  card.classList.add('pressing');
  lp.timer = setTimeout(() => { lp.fired = true; const uid = card.dataset.uid; lpCancel(); openLive(uid); }, 500);
});
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, lpCancel));
document.addEventListener('pointermove', ev => { if (lp.timer && Math.hypot(ev.clientX - lp.x, ev.clientY - lp.y) > 10) lpCancel(); });
document.addEventListener('contextmenu', ev => { if (ev.target.closest('.card[data-uid], .eunit[data-uid]')) ev.preventDefault(); });

document.addEventListener('click', ev => {
  if (lp.fired) { lp.fired = false; return; }
  if (ev.target.id === 'modal') return closeModal();
  const stEl = ev.target.closest('[data-st]');
  if (stEl && stEl.closest('[data-uid]')) { showStatus(stEl); return; }
  if (!ev.target.closest('#pop')) closePop();
  const t = ev.target.closest('button, [data-enemy], [data-ally]');
  if (!t) return;
  const d = t.dataset;
  const S = Engine.state();
  if (d.view) { if (d.view !== 'battle') closeModal(); return setView(d.view); }
  if (d.side) {
    sideTab = d.side;
    document.querySelectorAll('.stab').forEach(b => b.classList.toggle('active', b.dataset.side === sideTab));
    $('#log').classList.toggle('hidden', sideTab !== 'log');
    $('#stats').classList.toggle('hidden', sideTab !== 'stats');
    return;
  }
  if (d.cmd) {
    switch (d.cmd) {
      case 'closemodal': return closeModal();
      case 'restart': if (paused) setPaused(false); return startBattle();
      case 'pause': return setPaused(true);
      case 'resume': return setPaused(false);
      case 'speedcycle': return cycleSpeed();
      case 'leave': if (paused) setPaused(false); flush(true); return setView('chars');
      case 'undo':
        paused = false; $('#pausemenu').classList.add('hidden');
        clearCombatFx();
        clearTimeout(playTimer); queue = []; playing = false; V = null; armed = null; ultQueue = [];
        Engine.undo();
        battleRecorded = Engine.state().phase !== 'input' && battleRecorded;
        SaveSys.touch();
        shownLog = Engine.state().log.length;
        renderLogFull();
        return setView('battle');
      case 'autostep': if (paused) setPaused(false); if (!playing && !armed) run(() => Engine.autoStep()); return;
      case 'autotoggle': autoOn = !autoOn; renderBattle(); scheduleAuto(); return;
      case 'skip': flush(); if (!playing) scheduleAuto(); return;
      case 'fireult': if (armed) fireUlt(); return;
      case 'cancelult': return cancelUlt();
      case 'claim': {
        const r = Meta.runDungeon(activeDungeon);
        if (r.error) { openModal(`<h2>無法領取</h2><p>${esc(r.error)}</p><p class="hint">可以到「副本」頁補充體力。</p>`); return; }
        dungeonClaimed = true;
        showRewards(r);
        return renderBattle();
      }
      case 'redungeon': return startBattle({ dungeon: activeDungeon });
      case 'togglelog': return toggleLog();
      case 'fullscreen': return toggleFullscreen();
      case 'portraitok': document.body.classList.add('no-rotate-hint'); try { sessionStorage.setItem('portraitOk', '1'); } catch (e) { } return;
      case 'mute': Sound.set('muted', !Sound.pref.muted); return renderSoundCtl();
      case 'loom': if (!playing && Engine.canLoom()) run(() => Engine.loom()); return;
      case 'ulttest': {
        const S = Engine.state();
        if (!S) return;
        playUltShow(d.key, S.units, S.target);
        return;
      }
    }
    return;
  }
  if (d.cfg) {
    if (d.cfg === 'apply') { Meta.record('system', '更新戰鬥設定'); saveCfg(); return startBattle({ dungeon: null }); }
    if (d.cfg === 'reset') { if (confirm('恢復戰鬥設定的預設值？（不影響妙具背包與抽卡紀錄）')) { CFG = clone(DEFAULT_CONFIG); saveCfg(); syncUiControls(); renderConfig(); } return; }
    if (d.cfg === 'addEnemy') {
      const lastWave = CFG.enemies.length ? CFG.enemies[CFG.enemies.length - 1].wave : 1;
      CFG.enemies.push({ wave: lastWave, type: 'thug', name: `敵人 ${CFG.enemies.length + 1}`, hp: 45000, atk: 900, spd: 100, lvl: 80, tough: 30, weak: '物理', effRes: 10 });
    }
    if (d.cfg === 'delEnemy') CFG.enemies.splice(+d.i, 1);
    saveCfg();
    return renderConfig();
  }
  if (view !== 'battle' || !S) return;
  // 終結技：任何時候都能按（第一下蓄勢、第二下確認；已預約的再按一下取消預約）
  if (d.ult) {
    if (ENDED.includes(S.phase) || !Engine.canUlt(d.ult)) return;
    if (ultQueue.includes(d.ult)) { ultQueue = ultQueue.filter(x => x !== d.ult); return renderBattle(); }
    if (armed === d.ult) return fireUlt();
    armed = d.ult;
    clearTimeout(autoTimer);
    return renderBattle();
  }
  if (d.gmix != null) {   // 戈登戰技：逐張切換 漲 → 跌 →（第 2、3 張）不投入
    const i = +d.gmix, cur = gskMix[i];
    gskMix[i] = cur === 'up' ? 'down' : cur === 'down' ? (i === 0 ? 'up' : null) : 'up';
    if (gskAnchor) gordonSkillPop(gskAnchor);
    return;
  }
  if (d.gskgo) {
    const dirs = gskMix.filter(Boolean);
    closePop();
    if (!armed && !playing) run(() => Engine.act('skill', { dirs }));
    return;
  }
  if (d.gsk) {   // 戈登戰技：漲／跌 × 張數
    const [dir, n] = d.gsk.split('-');
    closePop();
    if (!armed && !playing) run(() => Engine.act('skill', { dir, n: +n }));
    return;
  }
  if (d.act) {
    if (armed || playing) return;
    const cur = S.units.find(u => u.id === S.current);
    if (d.act === 'skill' && cur && cur.key === 'gordon') return gordonSkillPop(t);
    run(() => Engine.act(d.act));
    return;
  }
  if (d.enemy) {
    const e = S.units.find(u => u.id === d.enemy);
    if (!e || !e.alive) return;
    if (armed && S.target === d.enemy) return fireUlt();
    const lock = duelLock(S);
    if (lock && lock !== d.enemy) { floatText(t, '生死角力中：無法鎖定', 'shield'); return; }
    Engine.setTarget(d.enemy);
    return renderBattle();
  }
  if (d.ally && !armed) {
    const a = S.units.find(u => u.id === d.ally);
    if (a && a.alive) Engine.setAllyTarget(d.ally);
    return renderBattle();
  }
});

document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.crit != null) {   // 暴擊計算：設定與目前這場戰鬥同時生效
    CFG.rules.critMode = el.value;
    const S = Engine.state();
    if (S) S.rules.critMode = el.value;
    saveCfg();
    return;
  }
  if (el.dataset.ui) {
    const k = el.dataset.ui;
    CFG.ui[k] = el.type === 'checkbox' ? el.checked : ['ultAnim', 'raidenSkin'].includes(k) ? el.value : parseFloat(el.value) || 0;
    if (k === 'ultAnim') document.querySelectorAll('[data-ui=ultAnim]').forEach(x => { x.value = ultMode(); });
    if (k === 'raidenSkin') { CFG.ui.raidenSkin = el.value === 'kane' ? 'kane' : 'raiden'; syncRaidenSkin(); renderBattle(); renderRaidenSkinPreview(); }
    if (k === 'speed' && !CFG.ui.speed) CFG.ui.speed = 1;
    if (k === 'anim' && !CFG.ui.anim && playing) flush();
    saveCfg();
    return;
  }
  if (el.dataset.team != null) { CFG.team[+el.dataset.team] = el.value || null; saveCfg(); return; }
  if (!el.dataset.path) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'number') v = parseFloat(v) || 0;
  setPath(CFG, el.dataset.path, v);
  saveCfg();
  if (view === 'chars') renderChars();
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') {
    if (!$('#pop').classList.contains('hidden')) return closePop();
    if (!$('#modal').classList.contains('hidden')) return closeModal();
  }
  if (view !== 'battle' || ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT') return;
  if (ev.key === 'Escape' && armed) return cancelUlt();
  if (ev.key === 'Escape') { if (logOpen) return toggleLog(false); return setPaused(!paused); }
  if (paused) return;
  if (ev.key === 'z' && (ev.ctrlKey || ev.metaKey)) { document.querySelector('[data-cmd=undo]').click(); return; }
  if (/^[1-4]$/.test(ev.key)) { const b = document.querySelectorAll('#allies [data-ult]')[+ev.key - 1]; if (b && !b.disabled) b.click(); return; }
  if (ev.key === 'l' || ev.key === 'L') return toggleLog();
  if (playing || armed) return;
  if (ev.key === 'q' || ev.key === 'Q') run(() => Engine.act('basic'));
  if (ev.key === 'e' || ev.key === 'E') {
    const cur = Engine.state().units.find(u => u.id === Engine.state().current);
    if (cur && cur.key === 'gordon') { const b = document.querySelector('[data-act=skill]'); if (b && !b.disabled) gordonSkillPop(b); return; }
    run(() => Engine.act('skill'));
  }
});

window.addEventListener('resize', () => { if (view === 'battle' && !playing) renderBattle(); });

/* ----- 全螢幕（手機橫屏）：進入全螢幕後鎖定橫向；不支援的瀏覽器（如 iPhone Safari）不顯示按鈕 ----- */
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
if (document.fullscreenEnabled || document.webkitFullscreenEnabled) document.documentElement.classList.add('can-fs');
function toggleFullscreen() {
  const root = document.documentElement;
  if (fsEl()) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  const req = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!req) return;
  Promise.resolve(req.call(root, { navigationUI: 'hide' })).then(() => {
    if (screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape');
  }).catch(() => { });
}
['fullscreenchange', 'webkitfullscreenchange'].forEach(t => document.addEventListener(t, () => $('#fsBtn').classList.toggle('on', !!fsEl())));
try { if (sessionStorage.getItem('portraitOk')) document.body.classList.add('no-rotate-hint'); } catch (e) { }

// 介面音效（在各功能的點擊處理之後執行，所以能讀到更新後的狀態）
document.addEventListener('click', ev => {
  const b = ev.target.closest('button, [data-bpick], [data-bq], [data-csel], [data-bsel], [data-enemy], [data-ally], [data-slot]');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.ult) { if (armed === d.ult) Sound.play('ultArm'); return; }
  if (d.bup || d.iup) return Sound.play('upgrade');
  if (d.bsalv || d.isalv) return Sound.play('salvage');
  if (d.bequip || d.bqequip || d.iequip || d.lcequip) return Sound.play('equip');
  if (d.pull || d.cmd === 'fireult' || d.cmd === 'mute') return;
  if (d.view || d.ctab || d.bagtab || d.side) return Sound.play('tab');
  if (d.cmd === 'pause') return Sound.play('open');
  if (d.cmd === 'resume' || d.cmd === 'closemodal') return Sound.play('close');
  Sound.play('click');
});

// 靜態 HTML 中的 data-icon → 插入對應的線條圖示
document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', Icon(el.dataset.icon)));
