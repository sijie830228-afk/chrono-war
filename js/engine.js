'use strict';
/* =========================================================
 * 時序之戰 — 戰鬥引擎
 * 角色技能、敵人 AI、行動值、韌性擊破、護盾、波次都在這個檔案。
 * 每一筆戰鬥紀錄都會附帶「當下狀態快照 + 視覺特效資訊」，供介面逐筆播放。
 * ========================================================= */

// 本質：物理、火、水、風、雷、冰、草；平衡：命、運、時、空、律（目前有角色的：運、空）；情感：喜、怒、哀、樂（目前有角色的：哀）；虛數為舊屬性，保留給舊資料
const ELEM_NAME = { phys: '物理', fire: '火', water: '水', wind: '風', thunder: '雷', ice: '冰', grass: '草', luck: '運', space: '空', joy: '喜', anger: '怒', sorrow: '哀', mirth: '樂', imag: '虛數' };
const ELEM_KEY = Object.fromEntries(Object.entries(ELEM_NAME).map(([k, v]) => [v, k]));
const ELEM_BREAK_MULT = { phys: 2, fire: 2, water: 1.5, wind: 1.5, thunder: 1.5, ice: 1, grass: 1.5, luck: 1, space: 1, joy: 1, anger: 1, sorrow: 1, mirth: 1, imag: 1 };
const LEVEL_MULT = 3767.5533;   // 80 級擊破基礎係數

// path = 命途（性相），power = 權能（本質／平衡……）
const CHARS = {
  longzhao: {
    name: '龍爪', rarity: 4, elem: 'phys', path: '沌', power: '本質', faction: '第九街', role: '持續傷害輸出／副C', weapon: '機械義肢',
    actions: { basic: '鐵拳裁決', skill: '裂骨爪', ult: '贏家奠定規則，輸家失去所有' },
    skillTarget: 'enemy', ultTarget: 'all',
  },
  kane: {
    name: '凱恩', rarity: 5, elem: 'phys', path: '啟', power: '本質', faction: '布魯克林警署第七分局', role: '主C／額外回合', weapon: '執勤配備',
    actions: { basic: '直覺反應', enhanced: '收網', skill: '犯罪現場觀察實錄', ult: '結案' },
    skillTarget: 'enemy', ultTarget: 'enemy',
  },
  mocha: {
    name: '莫卡兄弟', rarity: 5, elem: 'ice', path: '意', power: '本質', faction: '莫卡兄弟', role: '輔助／代理執行', weapon: '文書用具+水管',
    actions: { basic: '我來處理', skill: '甲方，請簽這裡', ult: '我們能處理好這一切⋯⋯嗎？' },
    skillTarget: 'ally', ultTarget: 'all',
  },
  alan: {
    name: '阿蘭', fullName: '安珀莉亞・阿蘭', rarity: 4, elem: 'fire', path: '穩', power: '本質', faction: '第九街', role: '兌現增援／護盾', weapon: '狙擊槍',
    actions: { basic: '靜默：冷槍', enhanced: '焦土：曳光爆破', skill: '決策：高位佈防', ult: '炎彈：勇氣判決' },
    skillTarget: 'none', ultTarget: 'enemy',
  },
  gordon: {
    name: '戈登', rarity: 5, elem: 'luck', path: '穩', power: '平衡', faction: '時間總局-經濟與發展部', role: '輔助／副C', weapon: '匕首（致摯愛）',
    actions: { basic: '我買了', skill: '機會成本', ult: '股票排山倒海' },
    skillTarget: 'none', ultTarget: 'none',
  },
  alexandra: {
    name: '亞歷山卓', rarity: 5, elem: 'wind', path: '境', power: '本質', faction: '布魯克林警署第七分局', role: '單體增益／副C／行動提前', weapon: '警車+執勤配備',
    actions: { basic: '攔停罰單', skill: '請系好安全帶', ult: '速度與執勤' },
    skillTarget: 'ally', ultTarget: 'enemy',
  },
  mark: {
    name: '馬克', rarity: 4, elem: 'water', path: '穩', power: '本質', faction: '布魯克林警署第七分局', role: '餘料投入／追擊', weapon: '筆記本+初級執勤配備',
    actions: { basic: '以柔克剛', skill: '上善若水', ult: '盈科後進' },
    skillTarget: 'ally', ultTarget: 'all',
  },
  hanye: {
    name: '寒夜', rarity: 4, elem: 'space', path: '型', power: '平衡', faction: '時間總局-收錄部', role: '主C／累積彈射', weapon: '機械儲能裝置（劍擬態）',
    actions: { basic: '單點·解析', skill: '推廣·極限定義', ult: '構造·唯一證明' },
    skillTarget: 'none', ultTarget: 'enemy',
  },
  otg: {
    name: 'O.T.G.', fullName: 'O.T.G.（only the godless）', rarity: 5, elem: 'phys', path: '秘', power: '本質', faction: '第九街', role: '持續傷害主C', weapon: '超乎常人極限的肉體',
    actions: { basic: '惡的問題', enhanced: '受造物的有限性', skill: '與獸共舞', ult: '神不在的滿月' },
    skillTarget: 'enemy', ultTarget: 'all', ultRes: '苦難',
  },
  miller: {
    name: '米勒', rarity: 4, elem: 'sorrow', path: '秘', power: '情感', faction: '第九街', role: '持續傷害附加／治療', weapon: '鐵骨黑傘',
    actions: { basic: '收好，你的訃告', skill: '罌粟與白菊，你喜歡哪一種？', ult: '願你安息，願我銘記' },
    skillTarget: 'enemy', ultTarget: 'all',
  },
};

const ENEMY_TYPES = {
  thug:   { name: '打手',     desc: '對隨機我方單體造成 100% 攻擊力物理傷害。' },
  binder: { name: '束縛者',   desc: '對隨機我方單體造成 90% 攻擊力傷害，並有 65% 機率施加［禁錮］（跳過下一個回合）。「壁壘」可抵抗。' },
  guard:  { name: '重裝保鑣', desc: '奇數回合為敵方全體附加護盾（自身最大生命 8%，2 回合）；偶數回合對單體造成 80% 攻擊力傷害。' },
  medic:  { name: '街頭醫生', desc: '若有敵方友軍生命低於 70%，回復其 15% 最大生命；否則對單體造成 60% 攻擊力傷害。' },
  boss:   { name: '頭目',     desc: '每第 3 個回合對我方全體造成 150% 攻擊力傷害，其餘回合對單體造成 120%。' },
  raiden: { name: '自律處刑官・「雷霆-09型」', boss: true, desc: '對我方施加「通緝」。通緝達 6 層的角色會被「緝捕行動」以額外回合強化攻擊；每 3 回合與生命降到 50% 轉階段時施放全體攻擊【全面通緝】。我方在自己回合沒有攻擊首領時，通緝 −2。' },
};

const DEFAULT_CONFIG = {
  team: ['kane', 'longzhao', 'mocha', 'alan'],
  // 角色本體的基礎數值（不含金句、妙具、經緯節點）
  chars: {
    longzhao: { lvl: 80, baseAtk: 640, atkPct: 0, hp: 1150, def: 520, spd: 100, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 110, startEnergy: 50 },
    kane:     { lvl: 80, baseAtk: 670, atkPct: 0, hp: 1150, def: 480, spd: 101, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 140, startEnergy: 50 },
    mocha:    { lvl: 80, baseAtk: 560, atkPct: 0, hp: 1250, def: 560, spd: 100, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 120, startEnergy: 50 },
    alan:     { lvl: 80, baseAtk: 580, atkPct: 0, hp: 1200, def: 600, spd: 102, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 120, startEnergy: 50 },
    gordon:   { lvl: 80, baseAtk: 620, atkPct: 0, hp: 1100, def: 460, spd: 103, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 120, startEnergy: 50 },
    alexandra: { lvl: 80, baseAtk: 600, atkPct: 0, hp: 1200, def: 520, spd: 104, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 120, startEnergy: 50 },
    mark:     { lvl: 80, baseAtk: 560, atkPct: 0, hp: 1100, def: 480, spd: 102, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 120, startEnergy: 50 },
    hanye:    { lvl: 80, baseAtk: 620, atkPct: 0, hp: 1050, def: 440, spd: 100, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 120, startEnergy: 50 },
    otg:      { lvl: 80, baseAtk: 660, atkPct: 0, hp: 1300, def: 500, spd: 98, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 9, startEnergy: 0 },
    miller:   { lvl: 80, baseAtk: 480, atkPct: 0, hp: 1350, def: 500, spd: 102, cr: 5, cd: 50, dmgBonus: 0, ehr: 0, effRes: 0, be: 0, err: 100, maxEnergy: 120, startEnergy: 50 },
  },
  enemies: [
    { wave: 1, type: 'thug',   name: '第九街打手 A', hp: 40000,  atk: 900,  spd: 100, lvl: 80, tough: 30,  weak: '火,冰',   effRes: 10 },
    { wave: 1, type: 'binder', name: '鐵鍊束縛者',   hp: 50000,  atk: 950,  spd: 108, lvl: 80, tough: 40,  weak: '物理,火', effRes: 20 },
    { wave: 1, type: 'thug',   name: '第九街打手 B', hp: 40000,  atk: 900,  spd: 100, lvl: 80, tough: 30,  weak: '火,冰',   effRes: 10 },
    { wave: 2, type: 'medic',  name: '黑診所醫生',   hp: 60000,  atk: 800,  spd: 110, lvl: 82, tough: 40,  weak: '物理,冰', effRes: 20 },
    { wave: 2, type: 'boss',   name: '街區頭目',     hp: 250000, atk: 1400, spd: 120, lvl: 82, tough: 160, weak: '物理,火', effRes: 30 },
    { wave: 2, type: 'guard',  name: '重裝保鑣',     hp: 90000,  atk: 1000, spd: 95,  lvl: 82, tough: 90,  weak: '冰,火',   effRes: 30 },
  ],
  rules: {
    critMode: 'expected',
    resNonWeak: 20,
    bbImmediate: false,
    kaneEnhStack: false,
    kaneTechnique: true,
    useRelics: true,
    lacerMax: 0,
    enemyAttack: true,
    infiniteSP: false,
    maxCycles: 30,
    lzTechnique: true,
    mochaTechnique: true,
    mochaTechTarget: 'kane',
    alanTechnique: true,
    gordonTechnique: true,
    alexTechnique: true,
    hanyeTechnique: true,
    markTechnique: true,
    millerTechnique: true,
    otgTechnique: true,
    toughness: false,   // 韌性與弱點擊破（舊機制，目前關閉）
    cashbox: true,      // 本質權能：兌現匣
  },
  ui: { anim: true, speed: 1, autoInterval: 600 },
};


const Engine = (() => {
  let S = null;
  let history = [];
  let events = [];

  /* ---------- 小工具 ---------- */
  const U = id => S.units.find(u => u.id === id);
  const allies = () => S.units.filter(u => u.side === 'ally' && u.alive);
  const enemies = () => S.units.filter(u => u.side === 'enemy' && u.alive);
  const findKey = key => S.units.find(u => u.side === 'ally' && u.key === key);
  const alive = key => { const u = findKey(key); return u && u.alive ? u : null; };
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pct = n => (n * 100).toFixed(1).replace(/\.0$/, '') + '%';
  const cycle = () => (S.time < 150 ? 0 : 1 + Math.floor((S.time - 150) / 100));
  const rand = arr => arr[Math.floor(Math.random() * arr.length)];
  const lowestHp = list => list.reduce((a, b) => (b.hp < a.hp ? b : a));
  const highestHp = list => list.reduce((a, b) => (b.hp > a.hp ? b : a));

  function snap() {
    return JSON.parse(JSON.stringify({
      units: S.units, sp: S.sp, proxy: S.proxy, model: S.model, current: S.current, currentExtra: S.currentExtra,
      time: S.time, wave: S.wave, extraQueue: S.extraQueue, loom: S.loom, cashbox: S.cashbox, flow: S.flow, duel: S.duel,
    }));
  }
  function log(type, text, detail, fx) {
    const entry = { type, text, detail: detail || '', cycle: cycle() + 1 };
    if (fx && fx.crit) entry.crit = true;   // 暴擊的紀錄另外標示
    if (fx && (fx.kind === 'dmg' || fx.kind === 'dot') && fx.tgt) entry.tgt = fx.tgt;
    if (fx && fx.up) { entry.up = fx.up; delete fx.up; }   // 附傷：掛在第 up 筆之前的主傷害底下
    if (fx && fx.syncTo != null) entry.syncTo = fx.syncTo;   // 同步治療：與對應持續傷害一起播放
    S.log.push(entry);
    events.push({ idx: S.log.length - 1, entry, fx: fx || null, snap: snap() });
  }

  /* =========================================================
   * 事件驅動：生命週期鉤子
   * 戰鬥流程只負責在固定時間點「發出事件」，本身不認識任何角色。
   * 角色天賦、額外能力、秘技、妙具套裝、金句、狀態效果全部以鉤子登記在下方各區塊。
   * 新增角色時：在 SKILLS 加上技能，並用 on(事件, 函式, 順序) 登記被動即可。
   *
   *   事件            ctx 內容                        時間點
   *   battleStart     {}                              建立隊伍與第一波敵人之後（秘技、開場效果）
   *   waveStart       {wave}                          每一波敵人出場後
   *   turnStart       {u, extra}                      我方回合開始、可以操作之前
   *   dotTick         {u}                             敵人回合開始，結算持續傷害
   *   enemyAction     {u}                             敵人行動之後（在此排入追加攻擊、反擊）
   *   turnEnd         {u}                             回合結束，持續時間遞減之前
   *   beforeAction    {u, kind}                       我方行動（basic / skill / ult）之前
   *   afterAction     {u, kind}                       我方行動的技能效果結算完畢
   *   beforeHit       {att, tgt, o, mod}              每段傷害計算前；累加 mod.dmg（增傷）、mod.cd（暴傷）
   *   afterHit        {att, tgt, o, dmg, killed}      每段傷害之後（受擊回能、受擊拉條、反擊……）
   *   afterAttack     {att, targets, marked, o}       一次攻擊動作的所有傷害都結束後
   *   onBreak         {e, att, elem}                  弱點擊破（擊破傷害與延後已結算）
   *   onKill          {u, killer, lacer, bloodBreak, peek}  單位倒下（身上狀態已清除，原本的層數放在 ctx）
   *   beforeControl   {u, kind, src, resisted}        即將被施加控制；設 resisted = true 即抵抗
   *   followUp        {u}                             發動了追加攻擊
   *   extraTurn       {u, why}                        獲得額外回合
   *   selfAdvance     {u}                             因自身技能使自己行動提前 100%
 *   loomRun         {L}                             時間織機啟動、執行任務之前
 *   loomTask        {task}                          時間織機每執行完一份校準任務
 *   residue         {u, kind, n, why}               本質角色即將逸散餘料（可以修改 n）
 *   cashout         {u, by, contributors, form, load, proto, targets}  兌現匣兌現完畢（u = 兌現匣本身，by = 填滿兌現匣的角色，contributors = 這批餘料的投入者）
   *
   * 追加攻擊與反擊：鉤子呼叫 queueFollowUp(單位, 種類, 目標) 排入佇列，
   * 當前動作結束後由 resolveFollowUps() 依序執行 FOLLOW_UPS[種類]。佇列存在戰鬥狀態中，可撤銷、可存檔。
   * ========================================================= */
  const HOOKS = {};
  function on(evt, fn, order) {
    const list = HOOKS[evt] || (HOOKS[evt] = []);
    list.push({ fn, order: order || 0 });
    list.sort((a, b) => a.order - b.order);
  }
  function emit(evt, ctx) {
    const list = HOOKS[evt];
    if (list) for (const h of list) h.fn(ctx);
    return ctx;
  }
  /** 數值修正：依登記順序逐項加上（不影響浮點運算順序） */
  const MODS = {};
  function mod(stat, fn, order) {
    const list = MODS[stat] || (MODS[stat] = []);
    list.push({ fn, order: order || 0 });
    list.sort((a, b) => a.order - b.order);
  }
  function modAdd(v, stat, u, tgt) { const l = MODS[stat]; if (l) for (const m of l) v += m.fn(u, tgt); return v; }

  /* ---------- 數值 ---------- */
  function buffSum(u, k) { return u.buffs.reduce((s, b) => s + (b.stats[k] || 0), 0); }
  function hasSet(u, s) { return u.side === 'ally' && u.base.sets.includes(s); }
  /** 經緯：額外能力是否啟用 */
  function tr(u, a) { return !!u && u.side === 'ally' && u.base.traces[a] !== false; }
  /** 金句：裝備且性相相符時回傳 { rank, v }，否則 null */
  /** 金句：tier = 'path'（性相層，預設）或 'power'（權能層）；生效時回傳 { rank, v }，否則 null */
  function lcOn(u, id, tier) {
    const l = u && u.side === 'ally' && u.base.lc;
    if (!l || l.id !== id || !(tier === 'power' ? l.pactive : l.active)) return null;
    return { rank: l.rank, v: Quotes.LIST[id].val(l.rank) };
  }
  function rawSpd(u) {
    if (u.side === 'timer') return u.base.spd;
    if (u.side === 'enemy') return u.base.spd * (1 + buffSum(u, 'spdPct'));
    return u.base.spdBase * (1 + u.base.spdPct + buffSum(u, 'spdPct')) + u.base.spdFlat;
  }
  function getSpd(u) { return modAdd(rawSpd(u), 'spd', u); }
  /** 速度改變時等比例調整行動值（當前行動者除外，回合結束時會重置） */
  function syncSpeeds() {
    S.units.forEach(u => {
      if (!u.alive) return;
      const s = getSpd(u);
      if (u.spdCache && Math.abs(s - u.spdCache) > 1e-9 && u.id !== S.current) u.av *= u.spdCache / s;
      u.spdCache = s;
    });
  }
  function getBE(u) { return (u.base.be || 0) + buffSum(u, 'be'); }
  function getBreakEff(u) { return modAdd(buffSum(u, 'breakEff'), 'breakEff', u); }
  function laceStacks(e) { return e.lacer.length + e.bloodBreak; }

  function getAtk(u, tgt, excludeElite) {
    if (u.side === 'enemy') return u.base.atk * (1 + buffSum(u, 'atkPct'));
    const p = modAdd(u.base.atkPct + buffSum(u, 'atkPct'), 'atkPct', u, tgt);
    const flat = u.buffs.reduce((s, b) => s + (excludeElite && b.name === '精銳' ? 0 : (b.stats.atkFlat || 0)), 0);
    return u.base.baseAtk * (1 + p) + u.base.atkFlat + flat;
  }
  function getCR(u) { return u.base.cr + buffSum(u, 'cr') + (u.side === 'ally' ? modAdd(0, 'cr', u) : 0); }
  function getCD(u) { return modAdd(u.base.cd + buffSum(u, 'cd'), 'cd', u); }

  /* ---------- 增益、能量、戰技點、行動值 ---------- */
  function addBuff(u, b) {
    if (!u.alive) return;
    const i = u.buffs.findIndex(x => x.name === b.name);
    if (i >= 0) u.buffs[i] = b; else u.buffs.push(b);
    syncSpeeds();
  }
  function removeBuff(u, name) { u.buffs = u.buffs.filter(b => b.name !== name); }
  const hasBuff = (u, name) => u.buffs.some(b => b.name === name);

  /** 不以能量施放終結技的角色：施放時改為支付自己的資源（能量條顯示該資源） */
  const ULT_PAY = {};
  // Presentation metadata only: preserve combat order, amounts, and RNG. Patch
  // snapshots from the causal hit forward so later status logs cannot undo it.
  function bindEnergy(u, before, eventIdx, sufferBefore) {
    if (before === u.energy && sufferBefore == null) return;
    let anchor = null, fallback = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i], f = e.fx;
      if (eventIdx != null) { if (e.idx === eventIdx) { anchor = e; break; } continue; }
      if (f && (f.kind === 'dmg' || f.kind === 'dot') && !f.sub) {
        if (!fallback) fallback = e;
        if (sufferBefore != null ? f.tgt === u.id : f.src === u.id && f.kind === 'dmg' && f.line) { anchor = e; break; }
      }
      if (['turn', 'act', 'ult'].includes(e.entry.type) || f && f.kind === 'follow') {
        anchor = fallback || (f && f.src === u.id ? e : null); break;
      }
    }
    anchor = anchor || fallback;
    if (!anchor || !anchor.fx) return;
    const list = anchor.fx.energyGains || (anchor.fx.energyGains = []);
    let gain = list.find(x => x.id === u.id);
    if (!gain) { gain = { id: u.id, before, after: u.energy }; list.push(gain); }
    gain.after = u.energy;
    if (sufferBefore != null) { if (gain.sufferBefore == null) gain.sufferBefore = sufferBefore; gain.sufferAfter = u.suffer; }
    for (let i = events.indexOf(anchor); i < events.length; i++) {
      const unit = events[i].snap.units.find(x => x.id === u.id);
      if (unit) { unit.energy = u.energy; if (sufferBefore != null) unit.suffer = u.suffer; }
    }
  }
  function gainEnergy(u, amt, eventIdx) {
    if (!u || !u.alive || u.side !== 'ally' || ULT_PAY[u.key]) return;
    const before = u.energy;
    u.energy = Math.min(u.maxEnergy, u.energy + amt * (u.base.err + modAdd(0, 'err', u)));
    bindEnergy(u, before, eventIdx);
  }
  function spGain(n) { S.sp = Math.min(S.spMax, S.sp + (n || 1)); }
  function spUse() { if (!S.rules.infiniteSP) S.sp -= 1; }
  /** 角色可以阻止自己使用戰技（例如阿蘭持有掩護時） */
  const SKILL_LOCK = {};
  function canSkillFor(u) {
    if (u && SKILL_LOCK[u.key] && SKILL_LOCK[u.key](u)) return false;
    return S.rules.infiniteSP || S.sp >= 1;
  }

  function advance(u, p) {
    if (!u.alive) return;
    if (S.current === u.id) {
      u.pendingAdv += p;
      log('buff', `${u.name} 行動提前 ${pct(p)}（本回合結束後生效）`, '', { kind: 'av', tgt: u.id, dir: 'up', p });
    } else {
      u.av = Math.max(0, u.av - p * 10000 / getSpd(u));
      log('buff', `${u.name} 行動提前 ${pct(p)}`, '', { kind: 'av', tgt: u.id, dir: 'up', p });
    }
  }
  function delay(u, p) {
    if (!u.alive) return;
    u.av += p * 10000 / getSpd(u);
    log('buff', `${u.name} 行動延後 ${pct(p)}`, '', { kind: 'av', tgt: u.id, dir: 'down', p });
  }

  function enemyTarget() {
    let t = U(S.target);
    if (!t || !t.alive || t.side !== 'enemy') { t = enemies()[0]; S.target = t ? t.id : null; }
    return t;
  }
  function allyTarget() {
    let t = U(S.allyTarget);
    if (!t || !t.alive || t.side !== 'ally') {
      t = allies().find(a => a.key !== 'mocha') || allies()[0];
      S.allyTarget = t ? t.id : null;
    }
    return t;
  }

  /* ---------- 護盾 / 治療 / 控制 ---------- */
  function addShield(src, tgt, amt, mode, dur) {
    if (!tgt.alive) return;
    const before = tgt.shield;
    tgt.shield = mode === 'max' ? Math.max(tgt.shield, amt) : tgt.shield + amt;
    tgt.shieldDur = Math.max(tgt.shieldDur, dur);
    log('shield', `${tgt.name} 獲得護盾 ${fmt(amt)}（現有 ${fmt(tgt.shield)}）`, '',
      { kind: 'shield', src: src.id, tgt: tgt.id, amt: tgt.shield - before || amt });
  }
  function heal(src, tgt, amt, opt = {}) {
    if (!tgt.alive) return;
    amt *= 1 + (tgt.side === 'ally' ? (flowEnv()?.healReceived || 0) : 0);
    const real = Math.min(amt, tgt.maxHp - tgt.hp);
    tgt.hp += real;
    log('heal', `${src.name} 治療 ${tgt.name}：+${fmt(real)}`, '', { kind: 'heal', src: src.id, tgt: tgt.id, amt: real, ...opt });
  }
  /** 施加控制（目前只有禁錮）；beforeControl 鉤子可以抵抗 */
  function applyControl(t, kind, src) {
    if (!t.alive) return false;
    if (emit('beforeControl', { u: t, kind, src, resisted: false }).resisted) return false;
    t.stunned = true;
    log('buff', `${t.name} 被［禁錮］，將跳過下一個回合`, '', { kind: 'stun', tgt: t.id });
    return true;
  }

  /* ---------- 傷害 ---------- */
  function dealDamage(att, tgt, o) {
    if (!tgt || !tgt.alive) return 0;
    const atk = getAtk(att, tgt);
    const base = o.base != null ? o.base : atk * o.mult;
    const mods = emit('beforeHit', { att, tgt, o, mod: { dmg: 0, cd: 0 } }).mod;   // 妙具、金句、天賦的條件加成
    const db = o.breakDmg ? 0 : (att.side === 'ally' ? att.base.dmgBonus : 0) + buffSum(att, 'dmgBonus') + (o.extraBonus || 0) + mods.dmg;
    const beMult = o.breakDmg ? 1 + getBE(att) : 1;
    const pierce = S.loom && S.loom.pierce && att.side === 'ally' ? S.loom.pierce : 0;   // 《千百倍槓桿》：時間織機任務無視防禦
    const defRed = Math.min(1, buffSum(tgt, 'defRed') + buffSum(att, 'defIgnore') + pierce + (o.defIgnore || 0));
    const def = (tgt.side === 'enemy' ? 200 + 10 * tgt.base.lvl : tgt.base.def) * (1 - defRed);
    const defMult = 1 - def / (def + 200 + 10 * att.base.lvl);
    const resRed = tgt.side === 'enemy' ? buffSum(tgt, 'resRed') + (att.side === 'ally' ? buffSum(att, 'resPen') : 0) : 0;   // 全屬性抗性降低（馬克額外能力一）、抗性穿透（瀆神之軀）
    const res = tgt.side === 'enemy' ? (tgt.weak.includes(o.elem) ? 0 : S.rules.resNonWeak / 100) - resRed : 0;
    const resMult = 1 - res;
    const brk = toughOn();
    const toughMult = tgt.side === 'enemy' && brk ? (tgt.broken ? 1 : 0.9) : 1;
    const takenMult = 1 - Math.min(1, buffSum(tgt, 'dmgTakenRed') + (tgt.side === 'ally' ? (flowEnv()?.takenRed || 0) : 0));
    const vuln = tgt.side === 'enemy' ? marketVuln() : 0;   // 股市下跌造成的易傷
    const taken = buffSum(tgt, 'dmgTakenUp');                // 押送等「受到的傷害提高」
    const vulnMult = 1 + vuln + taken;
    const dealtMult = 1 - Math.min(1, buffSum(att, 'dmgDealtRed') + (att.side === 'enemy' ? (flowEnv()?.enemyDealtRed || 0) : 0));
    let critMult = 1, critTxt = '不可暴擊', crit = false;
    if (o.canCrit !== false && !o.breakDmg && att.side === 'ally') {
      const cr = Math.min(1, Math.max(0, getCR(att)));
      const cd = getCD(att) + mods.cd;
      if (S.rules.critMode === 'expected') { critMult = 1 + cr * cd; critTxt = `期望 ×${critMult.toFixed(3)}（${pct(cr)}/${pct(cd)}）`; }
      else { crit = Math.random() < cr; critMult = crit ? 1 + cd : 1; critTxt = crit ? `暴擊 ×${critMult.toFixed(2)}` : '未暴擊'; }
    }
    let dmg = base * (1 + db) * beMult * defMult * resMult * toughMult * takenMult * dealtMult * critMult * vulnMult;
    if (o.adjust) dmg = o.adjust(dmg);                                   // 例如 O.T.G. 額外能力二的自傷減免
    if (o.keep1 && tgt.hp > 1) dmg = Math.min(dmg, tgt.hp - 1);          // 不會使生命值低於 1
    let absorbed = 0;
    if (tgt.shield > 0) {
      absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed;
      if (tgt.shield <= 0.5) { tgt.shield = 0; tgt.shieldDur = 0; }
    }
    tgt.hp -= dmg - absorbed;

    if (!o.self) {   // 自傷不計入輸出統計
      const st = S.stats[att.id] || (S.stats[att.id] = { total: 0, src: {} });
      st.total += dmg;
      st.src[o.label] = (st.src[o.label] || 0) + dmg;
    }

    const detail = [
      o.base != null ? `基礎值 ${fmt(base)}${o.note ? '（' + o.note + '）' : ''}` : `攻擊力 ${fmt(atk)} × ${pct(o.mult)} = ${fmt(base)}`,
      o.breakDmg ? `擊破特攻區 ×${beMult.toFixed(3)}` : `增傷區 ×${(1 + db).toFixed(3)}`,
      `防禦區 ×${defMult.toFixed(3)}${defRed ? `（減防 ${pct(defRed)}）` : ''}`,
      `抗性區 ×${resMult.toFixed(3)}${resRed ? `（抗性 −${pct(resRed)}）` : ''}`,
      tgt.side === 'enemy' && brk ? `韌性區 ×${toughMult}${tgt.broken ? '（已擊破）' : ''}` : '',
      takenMult !== 1 ? `承傷區 ×${takenMult.toFixed(3)}` : '',
      vuln || taken ? `易傷區 ×${vulnMult.toFixed(3)}（${[vuln ? '股市' : '', taken ? '受到傷害提高' : ''].filter(Boolean).join('、')}）` : '',
      dealtMult !== 1 ? `輸出減益 ×${dealtMult.toFixed(3)}` : '',
      `暴擊區 ${critTxt}`,
      absorbed ? `護盾吸收 ${fmt(absorbed)}` : '',
    ].filter(Boolean).join('\n');
    // 附傷：找同一個行動中、同一個目標最近的主傷害，掛在它底下（紀錄以樹狀顯示，播放時和主傷害同時出現）
    let up = 0;
    if (o.sub) {
      for (let i = S.log.length - 1, n = 0; i >= 0 && n < 80; i--, n++) {
        const l = S.log[i];
        if (l.type === 'turn' || l.type === 'act' || l.type === 'ult') break;
        if ((l.type === 'dmg' || l.type === 'dot') && !l.up && l.tgt === tgt.id) { up = S.log.length - i; break; }
      }
    }
    const tail = `${fmt(dmg)} ${ELEM_NAME[o.elem]}傷害${crit ? ' 💥' : ''}${absorbed ? `（護盾吸收 ${fmt(absorbed)}）` : ''}`;
    log(o.dot ? 'dot' : (att.side === 'ally' ? 'dmg' : 'hurt'),
      up ? `${att.name}【${o.label}】${tail}` : `${att.name}【${o.label}】→ ${tgt.name}：${tail}`,
      detail, { kind: o.dot ? 'dot' : 'dmg', src: att.id, tgt: tgt.id, amt: dmg - absorbed, absorbed, crit, elem: o.elem, line: !o.dot && !o.breakDmg && !up, fast: o.fast || undefined, ...(o.fxGroup && !o.dot && !up ? o.fxGroup : {}), sub: up ? true : undefined, up: up || undefined,
        ...(o.dot ? { dotType: o.dotType || (/原罪/.test(o.label) ? 'original' : /血破/.test(o.label) ? 'bloodBreak' : /悲悼/.test(o.label) || o.elem === 'sorrow' ? 'mourn' : /裂傷/.test(o.label) ? 'lacer' : o.elem), dotStage: o.dotStage || 1 } : {}) });

    const eventIdx = S.log.length - 1;
    if (tgt.hp <= 0.5) {
      handleDeath(tgt, att);
      emit('afterHit', { att, tgt, o, dmg, eventIdx, killed: true });
      return dmg;
    }
    // 削韌（擊破機制關閉時不處理）
    if (brk && tgt.side === 'enemy' && o.tough && !tgt.broken && tgt.weak.includes(o.elem)) {
      const red = o.tough * (1 + getBreakEff(att));
      tgt.tough = Math.max(0, tgt.tough - red);
      if (tgt.tough <= 0) breakEnemy(tgt, att, o.elem);
    }
    emit('afterHit', { att, tgt, o, dmg, eventIdx, killed: false });
    return dmg;
  }

  function breakEnemy(e, att, elem) {
    e.broken = true; e.tough = 0;
    log('break', `⚡ ${e.name} 弱點擊破！（${att.name}，${ELEM_NAME[elem]}）`, '', { kind: 'break', src: att.id, tgt: e.id });
    const base = ELEM_BREAK_MULT[elem] * LEVEL_MULT * (0.5 + e.maxTough / 40);
    dealDamage(att, e, { base, elem, label: '擊破傷害', breakDmg: true, canCrit: false,
      note: `${ELEM_NAME[elem]}係數 ${ELEM_BREAK_MULT[elem]} × 等級係數 × (0.5 + 韌性 ${e.maxTough}/40)` });
    if (e.alive) delay(e, 0.25);
    emit('onBreak', { e, att, elem });
  }

  /** 一次「攻擊動作」（atype：basic / skill / ult / followup / extra） */
  function attack(att, targets, mult, elem, label, extra) {
    targets = targets.filter(t => t && t.alive);
    const marked = targets.filter(t => t.peek || t.flagrant);
    const o = Object.assign({ mult, elem, label }, extra || {});
    // 群體攻擊：同一次動作的命中標成同一組，介面一次播出角色自己的群體特效（不影響結算）
    const grp = targets.length > 1 && !o.fast ? { grp: S.log.length + 1, area: 'aoe' } : null;
    targets.forEach(t => dealDamage(att, t, Object.assign({}, o, grp ? { fxGroup: grp } : {})));
    emit('afterAttack', { att, targets, marked, o });
  }
  /** 倍率不同的多段攻擊（例如主目標＋擴散）仍視為同一次攻擊動作 */
  function attackEach(att, hits, extra) {
    const targets = hits.map(h => h.t).filter(t => t && t.alive);
    const marked = targets.filter(t => t.peek || t.flagrant);
    // 擴散（第一筆為主目標、其餘標籤不同）或群體（每筆標籤相同）：同樣標成同一組
    const grp = hits.filter(h => h.t && h.t.alive).length > 1 && !(extra && extra.fast) ? S.log.length + 1 : 0;
    const area = hits.every(h => h.label === hits[0].label) ? 'aoe' : 'blast';
    hits.forEach((h, i) => dealDamage(att, h.t, Object.assign({ mult: h.mult, base: h.base, note: h.note, label: h.label, tough: h.tough }, extra, grp ? { fxGroup: { grp, area, main: area === 'blast' && i === 0 } } : {})));
    emit('afterAttack', { att, targets, marked, o: extra });
  }

  /* ---------- 追加攻擊／反擊佇列 ---------- */
  const FOLLOW_UPS = {};
  function queueFollowUp(u, kind, tgt) { S.followQueue.push({ id: u.id, kind, tgt: tgt ? tgt.id : null }); }
  function resolveFollowUps() {
    let guard = 0;
    while (S.followQueue.length && guard++ < 50) {
      if (!enemies().length || !allies().length) { S.followQueue = []; return; }
      const q = S.followQueue.shift();
      const u = U(q.id), fn = FOLLOW_UPS[q.kind];
      if (u && u.alive && fn) fn(u, q.tgt ? U(q.tgt) : null);
    }
  }
  /** 給予額外回合 */
  function grantExtra(u, why) {
    S.extraQueue.push({ id: u.id });
    emit('extraTurn', { u, why: why || '獲得額外回合' });
  }

  function handleDeath(u, killer) {
    u.hp = 0; u.alive = false; u.shield = 0;
    const ctx = { u, killer, lacer: u.lacer ? u.lacer.length : 0, lacerStacks: u.lacer ? u.lacer.slice() : [], bloodBreak: u.bloodBreak || 0, peek: !!u.peek, sample: !!u.sample, mourn: u.mourn ? u.mourn.slice() : [] };
    if (u.side === 'ally') log('kill', `✖ ${u.name} 倒下`, '', { kind: 'kill', tgt: u.id });
    else {
      log('kill', `✖ ${u.name} 被擊敗`, '', { kind: 'kill', tgt: u.id });
      u.lacer = []; u.bloodBreak = 0; u.peek = false; u.flagrant = false; u.sample = false; u.mourn = [];
    }
    emit('onKill', ctx);
    if (u.side === 'enemy' && S.target === u.id) enemyTarget();
  }

  function checkEnd() {
    if (!enemies().length) {
      if (S.wave < S.waves.length - 1) { spawnWave(S.wave + 1); return false; }
      S.phase = 'win'; log('sys', `🏆 勝利！共 ${S.waves.length} 波，經過 ${cycle() + 1} 輪，行動值 ${fmt(S.time)}`); return true;
    }
    if (!allies().length) { S.phase = 'lose'; log('sys', '💀 全員倒下，戰鬥失敗'); return true; }
    return false;
  }

  /* =========================================================
   * 通用規則（也用鉤子實作，方便之後調整）
   * ========================================================= */
  // 受到敵人攻擊時回復 10 能量
  on('afterHit', c => { if (c.att.side === 'enemy' && c.tgt.side === 'ally' && !c.o.dot) gainEnergy(c.tgt, 10, c.eventIdx); }, 10);
  // 攻擊後移除「下一次攻擊」類的增益
  on('afterAttack', c => { if (c.att.side === 'ally' && c.att.buffs.some(b => b.consume)) c.att.buffs = c.att.buffs.filter(b => !b.consume); }, 100);

  const SKILLS = {};

  /* =========================================================
   * 本質權能：兌現匣
   *   本質權能角色行動時逸散「本質餘料」（元素 = 角色屬性）：普攻 1 份、戰技 2 份、終結技 3 份。
   *   兌現匣收滿 10 份就「兌現」一次（多出來的留給下一次）：
   *     數量最多的元素 → 形制（攻擊形式），次多的元素 → 裝填（附加效果）；數量相同時，先投入的元素優先。
   *     10 份全是同一種元素 → 原型兌現（更強的專屬效果）。
   *   兌現由兌現匣本身發動（不是隊友）：兌現匣的攻擊力與擊破特攻 = 這批 10 份餘料投入者的加權平均（依份數），
   *   傷害 = 兌現匣攻擊力 × 倍率 × (1 + 擊破特攻)，不會暴擊，也不吃角色的增傷與套裝。
   * ========================================================= */
  const RESIDUE = { basic: 1, skill: 2, ult: 3 };
  const CASH_CAP = 10;
  const essenceAlly = u => u && u.side === 'ally' && CHARS[u.key].power === '本質';
  const cashOn = () => S.rules.cashbox !== false;
  /** 形制：回傳這次兌現的命中清單 [{ t, mult }]；after 為命中後的額外處理 */
  const CASH_FORM = {
    phys:    { aim: 'hp', name: '重錘', desc: '對生命值最高的敵方單體造成 360% 物理屬性傷害。', hits: es => [{ t: highestHp(es), mult: 3.6 }] },
    fire:    { aim: 'adj', name: '爆燃', desc: '對主目標造成 200%、其相鄰目標造成 100% 火屬性傷害。',
      hits: (es, m) => { const i = es.indexOf(m); return [{ t: m, mult: 2.0 }].concat([es[i - 1], es[i + 1]].filter(Boolean).map(t => ({ t, mult: 1.0 }))); } },
    water:   { aim: 'all', name: '潮湧', desc: '對敵方全體造成 120% 水屬性傷害。', hits: es => es.map(t => ({ t, mult: 1.2 })) },
    wind:    { aim: 'rand', name: '迴旋', desc: '進行 6 次彈射，每次對隨機敵方單體造成 60% 風屬性傷害。', hits: es => Array.from({ length: 6 }, () => ({ t: rand(es), mult: 0.6 })) },
    thunder: { aim: 'chain', name: '連鎖', desc: '對主目標造成 180% 雷屬性傷害，並連鎖至其餘每名敵人各 90%。', hits: (es, m) => [{ t: m, mult: 1.8 }].concat(es.filter(e => e !== m).map(t => ({ t, mult: 0.9 }))) },
    ice:     { aim: 'main', name: '霜錐', desc: '對主目標造成 260% 冰屬性傷害，並使其行動延後 20%。', hits: (es, m) => [{ t: m, mult: 2.6 }], after: ts => ts.forEach(e => e.alive && delay(e, 0.2)) },
    grass:   { aim: 'all', name: '蔓生', desc: '對敵方全體造成 100% 草屬性傷害。', hits: es => es.map(t => ({ t, mult: 1.0 })) },
  };
  const debuffOn = (ts, name, dur, stats) => ts.filter(e => e.alive).forEach(e => addBuff(e, { name, dur, debuff: true, stats }));
  /** 裝填：次多元素的附加效果（u = 結算者，ts = 被命中的敵人） */
  const CASH_LOAD = {
    phys:    { name: '破甲', desc: '命中的敵人防禦力降低 15%，持續 2 回合。', run: (u, ts) => debuffOn(ts, '破甲', 2, { defRed: 0.15 }) },
    fire:    { name: '灼燒', desc: '命中的敵人受到的傷害提高 10%，持續 2 回合。', run: (u, ts) => debuffOn(ts, '灼燒', 2, { dmgTakenUp: 0.10 }) },
    water:   { name: '回流', desc: '我方全體回復等同於自身最大生命 8% 的生命。', run: u => allies().forEach(a => heal(u, a, 0.08 * a.maxHp)) },
    wind:    { name: '順風', desc: '我方全體行動提前 12%。', run: () => allies().forEach(a => advance(a, 0.12)) },
    thunder: { name: '過載', desc: '命中的敵人行動延後 15%。', run: (u, ts) => ts.filter(e => e.alive).forEach(e => delay(e, 0.15)) },
    ice:     { name: '凍結', desc: '命中的敵人造成的傷害降低 20%，持續 2 回合。', run: (u, ts) => debuffOn(ts, '凍結', 2, { dmgDealtRed: 0.20 }) },
    grass:   { name: '滋養', desc: '我方全體恢復 8 點能量。', run: () => allies().forEach(a => gainEnergy(a, 8)) },
  };
  /** 原型兌現：10 份同元素 */
  const CASH_PROTO = {
    phys:    { aim: 'main', name: '斷頭台', desc: '對主目標造成 800% 物理屬性傷害。', hits: (es, m) => [{ t: m, mult: 8.0 }] },
    fire:    { aim: 'all', name: '焚城', desc: '對敵方全體造成 300% 火屬性傷害，並使其受到的傷害提高 20%，持續 2 回合。', hits: es => es.map(t => ({ t, mult: 3.0 })), after: ts => debuffOn(ts, '焚城', 2, { dmgTakenUp: 0.20 }) },
    water:   { aim: 'all', name: '海嘯', desc: '對敵方全體造成 250% 水屬性傷害，我方全體回復 15% 最大生命。', hits: es => es.map(t => ({ t, mult: 2.5 })), after: (ts, u) => allies().forEach(a => heal(u, a, 0.15 * a.maxHp)) },
    wind:    { aim: 'rand', name: '颶風眼', desc: '進行 12 次彈射，每次 70% 風屬性傷害，隨後我方全體行動提前 20%。', hits: es => Array.from({ length: 12 }, () => ({ t: rand(es), mult: 0.7 })), after: () => allies().forEach(a => advance(a, 0.20)) },
    thunder: { aim: 'all', name: '天罰', desc: '對敵方全體造成 280% 雷屬性傷害，並使其行動延後 30%。', hits: es => es.map(t => ({ t, mult: 2.8 })), after: ts => ts.filter(e => e.alive).forEach(e => delay(e, 0.3)) },
    ice:     { aim: 'all', name: '絕對零度', desc: '對敵方全體造成 220% 冰屬性傷害，並使其造成的傷害降低 40%，持續 2 回合。', hits: es => es.map(t => ({ t, mult: 2.2 })), after: ts => debuffOn(ts, '絕對零度', 2, { dmgDealtRed: 0.40 }) },
    grass:   { aim: 'all', name: '萬物生', desc: '對敵方全體造成 200% 草屬性傷害，我方全體恢復 20 點能量，並恢復 1 個戰技點。', hits: es => es.map(t => ({ t, mult: 2.0 })), after: () => { allies().forEach(a => gainEnergy(a, 20)); spGain(); } },
  };
  /** 依數量（多→少）排序元素；數量相同時先投入的優先 */
  function rankElems(items) {
    const first = {}, cnt = {};
    items.forEach((x, i) => { if (!(x.e in first)) first[x.e] = i; cnt[x.e] = (cnt[x.e] || 0) + 1; });
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || first[a] - first[b]).map(e => ({ e, n: cnt[e] }));
  }
  /** 投入餘料（elem 預設為角色自己的屬性；馬克可以投入「榜樣」屬性的餘料） */
  function addResidue(u, n, why, elem) {
    const B = S.cashbox, e = elem || u.elem;
    if (!B || !cashOn() || n <= 0) return;
    for (let i = 0; i < n; i++) B.items.push({ e, by: u.id });
    log('buff', `兌現匣 ← ${u.name} ${elem ? '投入' : '逸散'} ${n} 份${ELEM_NAME[e]}餘料${why ? '（' + why + '）' : ''}（${Math.min(CASH_CAP, B.items.length)}/${CASH_CAP}）`, '', { kind: 'residue', src: u.id, e, n, full: B.items.length >= CASH_CAP });
    while (B.items.length >= CASH_CAP && enemies().length) cashOut(B.items.splice(0, CASH_CAP), u);
  }
  /** 兌現匣本身（攻擊者）：不在行動軸上，只在兌現時建立 */
  function cashboxUnit(batch, form) {
    const us = batch.map(x => U(x.by)).filter(Boolean);
    const avg = f => us.reduce((sum, u) => sum + f(u), 0) / Math.max(1, us.length);
    return { id: 'cashbox', side: 'ally', key: 'cashbox', name: '兌現匣', alive: true, buffs: [], elem: form,
      base: { lvl: Math.round(avg(u => u.base.lvl)) || 80, baseAtk: 0, atkPct: 0, atkFlat: 0, cr: 0, cd: 0, dmgBonus: 0, be: 0, sets: [], traces: {}, lc: null },
      atk: avg(u => getAtk(u, null)), be: avg(u => getBE(u)) };
  }
  function cashOut(batch, by) {
    const B = S.cashbox, rank = rankElems(batch), form = rank[0].e, load = rank[1] ? rank[1].e : null, proto = !load;
    const F = proto ? CASH_PROTO[form] : CASH_FORM[form], Ld = load ? CASH_LOAD[load] : null;
    if (!F) return;
    const u = cashboxUnit(batch, form);
    const contributors = [...new Set(batch.map(x => x.by))].map(U).filter(Boolean);
    B.count = (B.count || 0) + 1;
    const mix = rank.map(r => `${ELEM_NAME[r.e]}×${r.n}`).join('、');
    const who = rankElems(batch.map(x => ({ e: x.by }))).map(r => `${U(r.e) ? U(r.e).name : '?'}×${r.n}`).join('、');
    log('info', proto ? `◆ 兌現匣【原型兌現·${F.name}】（${mix}）` : `◆ 兌現匣【兌現】形制：${ELEM_NAME[form]}·${F.name}／裝填：${ELEM_NAME[load]}·${Ld.name}（${mix}）`,
      `投入者：${who}\n兌現匣攻擊力 ${fmt(u.atk)}、擊破特攻 ${pct(u.be)}（投入者依份數加權平均）`, { kind: 'cashout', src: 'cashbox', form, load, proto });
    const es = enemies(), m = enemyTarget();
    const be = u.be, hits = F.hits(es, m && m.alive ? m : es[0]);
    const label = proto ? `原型兌現·${F.name}` : `兌現·${F.name}`;
    const hitT = [], marked = [];
    hits.forEach(h => {
      if (!h.t || !h.t.alive) return;
      if (!hitT.includes(h.t)) { hitT.push(h.t); if (h.t.peek || h.t.flagrant) marked.push(h.t); }
      dealDamage(u, h.t, { base: u.atk * h.mult * (1 + be), elem: form, label, atype: 'cashout', canCrit: false, note: `兌現匣攻擊力 ${fmt(u.atk)} × ${pct(h.mult)} × (1 + 擊破特攻 ${pct(be)})` });
    });
    emit('afterAttack', { att: u, targets: hitT, marked, o: { atype: 'cashout' } });
    if (F.after) F.after(hitT, u);
    if (Ld) { Ld.run(u, hitT); log('buff', `裝填·${Ld.name}：${Ld.desc}`); }
    emit('cashout', { u, by, contributors, form, load, proto, targets: hitT });
  }
  // 本質角色的普攻／戰技／終結技 → 逸散餘料
  on('afterAction', c => {
    if (!essenceAlly(c.u) || !RESIDUE[c.kind] || !c.u.alive) return;
    const extra = emit('residue', { u: c.u, kind: c.kind, n: RESIDUE[c.kind], why: '' });
    addResidue(c.u, extra.n, extra.why);
  }, 50);

  /* =========================================================
   * 龍爪：裂傷、血破
   * ========================================================= */
  /*
   * 裂傷：每層記錄施加者（src = 單位 id），結算時依施加者分組計算「不超過施加者攻擊力 120%」的上限。
   *   原罪裂傷（orig）：O.T.G. 終結技施加，被視為裂傷，每層造成 O.T.G. 攻擊力 180% 的傷害。
   *   裂傷也可以施加在我方（O.T.G.）身上，在該角色的回合開始時結算。
   */
  /** 裂傷持續 2 回合；龍爪額外能力一「機械改造」使龍爪施加的裂傷延長 1 回合 */
  const lacerDur = src => 2 + (src && src.key === 'longzhao' && tr(src, 'a1') ? 1 : 0);
  function pushLacer(e, src, o) {
    o = o || {};
    src = src || findKey('longzhao');
    e.lacer.push({ dur: o.dur || lacerDur(src), src: src ? src.id : null, orig: !!o.orig });
    const max = S.rules.lacerMax;
    if (max > 0 && e.lacer.length > max) e.lacer.shift();
    if (e.record != null) e.record += 1;
  }
  /** 施加裂傷：chance 為基礎機率（null = 必定）；o.owner 指定裂傷屬於誰（預設為施加者） */
  function applyLacer(src, e, chance, o) {
    o = o || {};
    if (!e || !e.alive) return false;
    if (chance != null) {
      const p = chance * (1 + (src.side === 'ally' ? getEHR(src) : 0)) * (1 - (e.base.effRes || 0));
      if (Math.random() >= p) { log('buff', `${o.orig ? '原罪裂傷' : '裂傷'} 施加失敗（實際機率 ${pct(Math.min(1, p))}）→ ${e.name}`); return false; }
    }
    pushLacer(e, o.owner || src, o);
    log('buff', `${e.name} 獲得 ${o.orig ? '原罪裂傷' : '裂傷'}${o.why ? '（' + o.why + '）' : ''}（現有 ${e.lacer.length} 層${e.record != null ? `，記錄 ${e.record}` : ''}）`);
    return true;
  }
  /**
   * 結算目標身上的裂傷傷害（依施加者與種類分組，各自一筆紀錄）；factor = 倍率（引爆時為原傷害的 80%／100%／120%⋯⋯），回傳結算的層數。
   * 只造成傷害，不減少持續時間。
   */
  function lacerDamage(e, factor, tag, o) {
    o = o || {};
    if (!e || !e.alive || !e.lacer.length) return 0;
    const groups = new Map();
    e.lacer.forEach(s => { const k = (s.src || '') + (s.orig ? '#o' : ''); const g = groups.get(k) || { src: s.src, orig: s.orig, n: 0 }; g.n += 1; groups.set(k, g); });
    let n = 0;
    for (const g of groups.values()) {
      const owner = (g.src && U(g.src)) || findKey('longzhao') || findKey('otg');
      if (!owner || !e.alive) continue;
      const atk = getAtk(owner, e);
      const per = g.orig ? 1.8 * atk : Math.min(0.16 * e.maxHp, 1.2 * atk);
      const f = factor == null ? 1 : factor;
      dealDamage(owner, e, Object.assign({ base: per * g.n * f, elem: 'phys', canCrit: false, dot: true, label: (g.orig ? '原罪裂傷' : '裂傷') + (tag || ''),
        note: `${g.n} 層 × ${g.orig ? `${owner.name}攻擊力 180%` : `min(16%最大生命, ${owner.name}攻擊力 120% ${fmt(1.2 * atk)})`}${f !== 1 ? ` × ${pct(f)}` : ''}` }, o));
      n += g.n;
    }
    return n;
  }
  SKILLS.longzhao = {
    basic(u) {
      const t = enemyTarget(); spGain();
      attack(u, [t], 0.5, 'phys', '普攻·鐵拳裁決', { tough: 10, atype: 'basic' });
      applyLacer(u, t, 0.65);
      gainEnergy(u, 20);
    },
    skill(u) {
      const t = enemyTarget(); spUse();
      attack(u, [t], 1.1, 'phys', '戰技·裂骨爪', { tough: 20, atype: 'skill' });
      applyLacer(u, t, null);
      applyLacer(u, t, null);   // 戰技施加 2 層裂傷
      gainEnergy(u, 30);
    },
    ult(u) {
      attack(u, enemies(), 1.0, 'phys', '終結技', { tough: 20, atype: 'ult' });
      enemies().forEach(e => applyLacer(u, e, null));
      enemies().forEach(e => {
        const add = Math.max(1, Math.floor(e.record * 0.5));
        e.bloodBreak += add;
        log('buff', `${e.name} 獲得 血破×${add}（記錄 ${e.record} × 50%）`);
      });
    },
  };
  // 額外能力一：目標每層裂傷／血破，攻擊力 +5%（裂傷持續時間 +1 回合寫在 lacerDur）
  mod('atkPct', (u, t) => (u.key === 'longzhao' && tr(u, 'a1') && t && t.side === 'enemy' ? 0.05 * laceStacks(t) : 0), 20);
  // 敵人回合開始時結算裂傷（任何人施加的）；龍爪在場時，天賦把結算的裂傷轉為血破，並結算血破
  on('dotTick', c => {
    const e = c.u, lz = findKey('longzhao');
    const lacerStep = () => {
      const n = e.lacer.length;
      if (!n || !e.alive) return;
      lacerDamage(e, 1, '');
      if (!e.alive) return;
      if (lz) {
        const add = Math.max(1, Math.floor(n * 0.5));
        e.bloodBreak += add;
        e.record = 0;
        log('buff', `龍爪【裂痕記錄】：結算 ${n} 層裂傷 → ${e.name} 獲得 血破×${add}，清空記錄`);
      }
      e.lacer.forEach(s => s.dur--);
      e.lacer = e.lacer.filter(s => s.dur > 0);
    };
    const bbStep = () => {
      const n = e.bloodBreak;
      if (!n || !e.alive || !lz) return;
      const atk = getAtk(lz, e);
      const per = Math.min(0.24 * e.maxHp, 2.0 * atk);
      e.bloodBreak = 0;
      const a2 = tr(lz, 'a2');
      dealDamage(lz, e, { base: per * n, elem: 'phys', canCrit: false, dot: true, extraBonus: a2 ? 0.20 : 0, label: '血破', note: `${n} 層 × min(24%最大生命, 200%攻擊 ${fmt(2 * atk)})${a2 ? '，額外能力二 +20%' : ''}` });
      if (e.alive && a2) dealDamage(lz, e, { mult: 0.5, elem: 'phys', label: '血破·附加傷害', atype: 'extra', sub: true });
    };
    if (S.rules.bbImmediate) { lacerStep(); bbStep(); } else { bbStep(); lacerStep(); }
  }, 10);
  // 額外能力三：贏家通吃 — 敵人倒下時，裂傷與血破轉移到生命最高的敵人
  on('onKill', c => {
    const u = c.u, lz = alive('longzhao');
    if (u.side !== 'enemy' || !lz || !tr(lz, 'a3') || !(c.lacer || c.bloodBreak)) return;
    const rest = enemies();
    if (!rest.length) return;
    const r = rest.reduce((a, b) => (b.hp > a.hp ? b : a));
    c.lacerStacks.forEach(st => { const src = st.src && U(st.src); pushLacer(r, src, { orig: st.orig }); });
    r.bloodBreak += c.bloodBreak;
    log('buff', `龍爪【贏家通吃】：${u.name} 的 裂傷×${c.lacer}、血破×${c.bloodBreak} 轉移至 ${r.name}（刷新持續時間）`);
  }, 10);
  // 秘技：街頭威懾
  on('battleStart', () => {
    const lz = findKey('longzhao');
    if (!lz || !S.rules.lzTechnique) return;
    log('info', '龍爪 秘技【街頭威懾】');
    enemies().forEach(e => applyLacer(lz, e, null));
  }, 20);

  /* =========================================================
   * 凱恩：管中窺豹、現行犯、線索、收網
   * ========================================================= */
  const CLUE_MAX = 14;
  function addClue(n, why) {
    const k = alive('kane');
    if (!k) return;
    const before = k.clues;
    k.clues = Math.min(CLUE_MAX, k.clues + n);
    log('buff', `凱恩 獲得 ${n} 層線索${why ? '（' + why + '）' : ''}：${before} → ${k.clues}${k.clues === CLUE_MAX ? '（上限）' : ''}`);
  }
  /** 管中窺豹只能存在於一名敵人身上 */
  function setPeek(e) {
    S.units.forEach(x => { if (x.side === 'enemy') x.peek = false; });
    e.peek = true;
  }
  function kaneEnhanced() { return S.units.some(e => e.side === 'enemy' && e.alive && e.flagrant); }
  function onFlagrant(e) {
    log('buff', `${e.name} 的［管中窺豹］轉變為［現行犯］`);
    const k = alive('kane');
    if (!k) return;
    log('buff', '凱恩 普攻替換為 強化普攻·收網');
    advance(k, 1.0);
    emit('selfAdvance', { u: k });
  }
  /** 額外能力二：攻擊力 > 2600 → 暴擊率 +20%；每多 200 攻擊力速度 +3（最多 +15） */
  function kaneA2(u) {
    if (u.key !== 'kane' || !tr(u, 'a2')) return { cr: 0, spd: 0 };
    const atk = getAtk(u, null);
    if (atk <= 2600) return { cr: 0, spd: 0 };
    return { cr: 0.20, spd: Math.min(15, 3 * Math.floor((atk - 2600) / 200)) };
  }
  mod('spd', u => kaneA2(u).spd);
  mod('cr', u => kaneA2(u).cr);
  SKILLS.kane = {
    basic(u) {
      if (kaneEnhanced()) return SKILLS.kane.enhanced(u);
      const t = enemyTarget(); spGain();
      attack(u, [t], 1.0, 'phys', '普攻·直覺反應', { tough: 10, atype: 'basic' });
      addClue(2, '直覺反應');
      gainEnergy(u, 20);
    },
    /** 強化普攻：場上有現行犯時取代普攻；不恢復戰技點 */
    enhanced(u) {
      const n = enemies().length;
      let m = 3;
      if (S.rules.kaneEnhStack) { if (n <= 3) m += 1; if (n === 1) m += 2; }
      else if (n === 1) m += 2; else if (n <= 3) m += 1;
      log('info', `收網倍率 ${pct(m)}（場上敵人 ${n} 名）`);
      attack(u, enemies(), m, 'phys', '強化普攻·收網', { tough: 10, atype: 'basic' });
      if (tr(u, 'a3')) addClue(1, '額外能力三');
      gainEnergy(u, 20);
    },
    skill(u) {
      const t = enemyTarget(); spUse();
      const hadPeek = t.peek;
      attack(u, [t], 1.5, 'phys', '戰技·犯罪現場觀察實錄', { tough: 20, atype: 'skill' });
      if (t.alive) {
        if (hadPeek) { t.peek = false; t.flagrant = true; onFlagrant(t); }
        else { setPeek(t); log('buff', `${t.name} 獲得［管中窺豹］`); }
      }
      gainEnergy(u, 30);
    },
    ult(u) {
      const t = enemyTarget();
      const f = t.flagrant;
      attack(u, [t], f ? 7.0 : 5.0, 'phys', '終結技·結案', { tough: 30, atype: 'ult' });
      if (f) {
        advance(u, 0.5);
        if (t.alive) { t.flagrant = false; setPeek(t); log('buff', `${t.name} 的［現行犯］轉變為［管中窺豹］`); }
      }
    },
  };
  // 天賦：我方攻擊命中 管中窺豹／現行犯 → 凱恩 +1 線索，該敵人行動提前 10%
  on('afterAttack', c => {
    if (c.att.side !== 'ally' || !c.marked.length || !alive('kane')) return;
    addClue(1);
    c.marked.forEach(t => { if (t.alive) advance(t, 0.10); });
  }, 10);
  // 天賦：被標記的敵人行動後，凱恩發動追加攻擊
  on('enemyAction', c => {
    const k = alive('kane'), e = c.u;
    if (k && e.alive && (e.peek || e.flagrant)) queueFollowUp(k, 'kane', e);
  }, 10);
  FOLLOW_UPS.kane = (k, e) => {
    if (!e || !e.alive || !(e.peek || e.flagrant)) return;
    log('info', `▶ ${e.name}（${e.flagrant ? '現行犯' : '管中窺豹'}）行動 → 凱恩 追加攻擊`, '', { kind: 'follow', src: k.id, name: '行動中' });
    attack(k, [e], 1.5, 'phys', '追加攻擊·行動中', { tough: 10, atype: 'followup' });
    gainEnergy(k, 10);
    emit('followUp', { u: k });
    if (k.clues >= 7 && !k.kaneExtraUsed) {
      k.clues -= 7;
      k.kaneExtraUsed = true;
      grantExtra(k, '獲得額外回合');
      log('buff', `線索 ≥ 7 → 消耗 7 層（剩餘 ${k.clues}），凱恩 立刻獲得額外回合（每回合 1 次）`);
    }
  };
  // 行動中的額外回合每回合只能觸發一次：凱恩自己的（非額外）回合開始時重置
  on('turnStart', c => { if (c.u.key === 'kane' && !c.extra) c.u.kaneExtraUsed = false; }, 5);
  // 天賦：管中窺豹的持有者倒下時，轉移到生命值最低的敵人
  on('onKill', c => {
    if (c.u.side !== 'enemy' || !c.peek || !alive('kane') || !enemies().length) return;
    const r = lowestHp(enemies());
    setPeek(r);
    log('buff', `［管中窺豹］轉移至 ${r.name}`);
  }, 20);
  // 天賦：每波開始時，生命值最低的敵人獲得管中窺豹
  on('waveStart', () => {
    if (!alive('kane') || !enemies().length) return;
    const t = lowestHp(enemies());
    setPeek(t);
    log('buff', `凱恩【觀察後再行動】：生命值最低的 ${t.name} 獲得［管中窺豹］`);
  }, 10);
  // 額外能力一與秘技：先行
  on('battleStart', () => {
    const k = findKey('kane');
    if (!k) return;
    if (tr(k, 'a1')) addClue(7, '額外能力一');
    if (S.rules.kaneTechnique) { log('info', '凱恩 秘技【先行】'); advance(k, 0.35); }
  }, 40);

  /* =========================================================
   * 莫卡兄弟：被代理人、印記、默契、代理執行
   * ========================================================= */
  function setProxy(a) {
    S.proxy = a.id;
    if (!a.mark) a.mark = '兄友';
    log('buff', `${a.name} 成為「被代理人」［${a.mark}］`);
  }
  function switchMark(a) {
    const m = alive('mocha');
    a.mark = a.mark === '兄友' ? '弟恭' : '兄友';
    log('buff', `${a.name} 的印記切換為［${a.mark}］`);
    if (m && tr(m, 'a1')) {
      gainEnergy(m, 15);
      addBuff(a, { name: '售後服務', dur: 1, stats: { dmgTakenRed: 0.15 } });
      log('buff', `售後服務：莫卡兄弟 回復 15 能量，${a.name} 受到傷害 −15%（1回合）`);
    }
  }
  function proxyExec(m, mark) {
    const p = S.proxy ? U(S.proxy) : null;
    if (mark === '兄友') {
      log('info', '▶ 代理執行-兄：合法催收程序');
      attack(m, enemies(), 1.5, 'ice', '代理執行-兄', { tough: 10, atype: 'extra' });
      enemies().forEach(e => addBuff(e, { name: '疑點', dur: 3, stats: { defRed: 0.10, dmgDealtRed: 0.30 } }));
      log('buff', '敵方全體 獲得 疑點（防禦 −10%，造成傷害 −30%，3回合）');
    } else {
      log('info', '▶ 代理執行-弟：公關預算浮報');
      const cap = 0.25 * getAtk(m, null, true);
      allies().forEach(a => addBuff(a, { name: '精銳', dur: 3, stats: { atkFlat: Math.min(0.40 * a.base.baseAtk, cap), cd: 0.50 } }));
      log('buff', `我方全體 獲得 精銳（攻擊力 +min(40%基礎攻擊, ${fmt(cap)})，暴傷 +50%，3回合）`);
    }
    if (p && p.alive && p.mark === mark) switchMark(p);
  }
  SKILLS.mocha = {
    basic(u) {
      const t = enemyTarget(); spGain();
      attack(u, [t], 1.0, 'ice', '普攻·我來處理', { tough: 10, atype: 'basic' });
      gainEnergy(u, 20);
    },
    skill(u) {
      const a = allyTarget(); spUse();
      if (S.proxy === a.id) switchMark(a);
      else setProxy(a);
      u.tacit += 1;
      log('buff', `莫卡兄弟 獲得 1 默契（${u.tacit}）`);
      gainEnergy(u, 30);
    },
    ult(u) {
      attack(u, enemies(), 1.2, 'ice', '終結技', { tough: 20, atype: 'ult' });
      let di = false;
      const p = S.proxy ? U(S.proxy) : null;
      if (p && p.alive) {
        if (p.mark) { di = p.mark === '弟恭'; proxyExec(u, p.mark); }
      } else if (allies().length) {
        const first = allies()[0];
        first.mark = '兄友';
        setProxy(first);
      }
      u.tacit += di ? 2 : 1;
      log('buff', `莫卡兄弟 獲得 ${di ? 2 : 1} 默契（${u.tacit}）`);
    },
  };
  // 被代理人：攻擊力 +20%、暴擊傷害 +20%
  mod('atkPct', u => (S.proxy === u.id ? 0.20 : 0), 10);
  mod('cd', u => (S.proxy === u.id ? 0.20 : 0));
  // 天賦：買一送一，帳單分開結 — 被代理人回合開始時，消耗 2 默契插入代理執行
  on('turnStart', c => {
    const p = c.u, m = alive('mocha');
    if (S.proxy !== p.id || !m || m.tacit < 2 || !p.mark) return;
    m.tacit -= 2;
    const mark0 = p.mark;
    log('info', '▶ 莫卡兄弟【買一送一，帳單分開結】消耗 2 默契，插入代理執行', '', { kind: 'cast', src: m.id });
    addBuff(m, { name: '帳單分開結', dur: 1, stats: { dmgBonus: 0.20 } });
    if (p.id !== m.id) addBuff(p, { name: '帳單分開結', dur: 1, stats: { dmgBonus: 0.20 } });
    proxyExec(m, mark0);
    if (tr(m, 'a2') && S.a2Turn !== S.turnNo) {   // 額外能力二：內線交易
      S.a2Turn = S.turnNo;
      m.tacit += 1;
      if (mark0 === '兄友') addBuff(p, { name: '內線交易·速', dur: 2, stats: { spdPct: 0.10 } });
      else addBuff(p, { name: '內線交易·暴', dur: 2, stats: { cr: 0.12 } });
      log('buff', `內線交易：莫卡兄弟 +1 默契（${m.tacit}），${p.name} 獲得 ${mark0 === '兄友' ? '速度 +10%' : '暴擊率 +12%'}（2回合）`);
    }
  }, 10);
  // 被代理人倒下時失去代理
  on('onKill', c => {
    if (c.u.side === 'ally' && S.proxy === c.u.id) { S.proxy = null; log('buff', '被代理人消失'); }
  }, 30);
  // 額外能力三（啟動資金）與秘技（預付訂金）
  on('battleStart', () => {
    const m = findKey('mocha');
    if (!m) return;
    if (tr(m, 'a3')) { m.tacit = 2; log('buff', '莫卡兄弟【啟動資金】：獲得 2 默契'); }
    if (S.rules.mochaTechnique) {
      const a = findKey(S.rules.mochaTechTarget) || allies()[0];
      log('info', '莫卡兄弟 秘技【預付訂金，該不退還】');
      setProxy(a);
    }
  }, 10);

  /* =========================================================
   * 阿蘭：掩護、護盾、擊破
   * ========================================================= */
  function alanBulwark() {
    if (!tr(alive('alan'), 'a2')) return;
    const list = allies().filter(a => a.shield > 0 && !hasBuff(a, '壁壘'));
    list.forEach(a => addBuff(a, { name: '壁壘', dur: 999, stats: {} }));
    if (list.length) log('buff', `阿蘭【壁壘】：${list.map(a => a.name).join('、')} 可抵抗 1 次控制效果`);
  }
  /** 阿蘭提供的護盾量倍率：持有掩護 +10%、收束 +10%（妙具另計） */
  function alanShieldMult(u) { const lc = lcOn(u, 'lastCover'); return (1 + (u.cover > 0 ? 0.10 : 0) + (hasBuff(u, '收束') ? 0.10 : 0) + (lc ? lc.v.sh / 100 : 0)) * (hasSet(u, 'steel2') ? 1.1 : 1); }
  /** 阿蘭的護盾：持續 2 回合，疊加後不超過戰技護盾量的 200% */
  function alanShield(u, a, amt) {
    const cap = 2 * 2048 * alanShieldMult(u);
    addShield(u, a, Math.max(0, Math.min(amt, cap - a.shield)), 'add', 2);
  }
  /** 天賦：掩護歸零時，額外投入一份火屬性餘料 */
  function coverSpent(u) { if (u.cover === 0) addResidue(u, 1, '掩護歸零', 'fire'); }
  SKILL_LOCK.alan = u => u.cover > 0;   // 天賦：持有掩護時只能使用強化普攻
  SKILLS.alan = {
    basic(u) {
      if (u.cover > 0) return SKILLS.alan.enhanced(u, false);
      const t = enemyTarget(); spGain();
      attack(u, [t], 0.8, 'fire', '普攻·靜默：冷槍', { tough: 10, atype: 'basic' });
      gainEnergy(u, 20);
    },
    enhanced(u, asFollowUp) {
      if (!asFollowUp) { u.cover -= 1; spGain(); log('buff', `阿蘭 消耗 1 點掩護（剩餘 ${u.cover}）`); }
      const t = enemyTarget();
      if (!t) return;
      const es = enemies();
      const i = es.indexOf(t);
      const adj = [es[i - 1], es[i + 1]].filter(Boolean);
      const label = asFollowUp ? '強化普攻（追加攻擊）' : '強化普攻·焦土：曳光爆破';
      attackEach(u, [{ t, mult: 1.2, label, tough: 20 }].concat(adj.map(a => ({ t: a, mult: 0.6, label: label + '·擴散', tough: 10 }))),
        { elem: 'fire', atype: asFollowUp ? 'followup' : 'basic' });
      if (asFollowUp) emit('followUp', { u });
      u.tracer = true;   // 這次行動若使兌現匣兌現 → 我方全體額外護盾（在兌現時結算）
      if (!asFollowUp) { gainEnergy(u, 20); coverSpent(u); }
    },
    skill(u) {
      spUse();
      const amt = 2048 * alanShieldMult(u);
      allies().forEach(a => alanShield(u, a, amt));
      u.cover = Math.min(3, u.cover + 2);
      log('buff', `阿蘭 獲得 2 點掩護（${u.cover}/3）→ 隨後獲得額外回合`);
      grantExtra(u);
      gainEnergy(u, 30);
    },
    ult(u) {
      u.cover = Math.min(3, u.cover + 2);
      log('buff', `阿蘭 獲得 2 點掩護（${u.cover}/3）`);
      const t = enemyTarget();
      attack(u, [t], 2.25, 'fire', '終結技·炎彈：勇氣判決', { tough: 30, atype: 'ult' });
      if (enemies().length) { log('info', '▶ 自動施放 強化普攻（視為追加攻擊，不消耗掩護）', '', { kind: 'follow', src: u.id, name: '焦土：曳光爆破' }); SKILLS.alan.enhanced(u, true); }
    },
  };
  // 強化普攻：此次行動使兌現匣兌現 → 我方全體額外護盾
  on('cashout', c => {
    const al = alive('alan');
    if (!al || !c.by || c.by.id !== al.id || !al.tracer) return;
    al.tracer = false;
    const amt = 512 * alanShieldMult(al);
    log('info', '曳光爆破 引發兌現 → 我方全體 額外護盾');
    allies().forEach(a => alanShield(al, a, amt));
  }, 10);
  on('afterAction', c => { if (c.u.key === 'alan') c.u.tracer = false; }, 90);
  // 額外能力一：破綻 — 被兌現命中的敵人獲得［破綻］（2 回合），受到的暴擊傷害 +30%
  on('cashout', c => {
    if (!tr(alive('alan'), 'a1')) return;
    const ts = c.targets.filter(e => e.alive);
    ts.forEach(e => addBuff(e, { name: '破綻', dur: 2, debuff: true, stats: {} }));
    if (ts.length) log('buff', `阿蘭【破綻】：${ts.map(e => e.name).join('、')} 受到的暴擊傷害 +30%（2 回合）`);
  }, 20);
  on('beforeHit', c => { if (c.tgt.side === 'enemy' && hasBuff(c.tgt, '破綻') && tr(alive('alan'), 'a1')) c.mod.cd += 0.30; }, 50);
  // 額外能力二：壁壘 — 行動後，持有護盾的我方可抵抗 1 次控制
  on('afterAction', c => { if (c.u.key === 'alan') alanBulwark(); }, 40);
  on('beforeControl', c => {
    if (c.resisted || !hasBuff(c.u, '壁壘')) return;
    removeBuff(c.u, '壁壘');
    log('buff', `${c.u.name} 的 壁壘 抵抗了禁錮`, '', { kind: 'resist', tgt: c.u.id });
    c.resisted = true;
  }, 10);
  // 額外能力三：收束 — 每次兌現，阿蘭給予的護盾量 +10%（2 回合）；形制或裝填為火時額外 +1 戰技點
  on('cashout', c => {
    const al = alive('alan');
    if (!al || !tr(al, 'a3')) return;
    addBuff(al, { name: '收束', dur: 2, stats: {} });
    log('buff', '阿蘭【收束】給予的護盾量 +10%（2回合）');
    if (c.form === 'fire' || c.load === 'fire') { spGain(); log('buff', '阿蘭【收束】兌現含火屬性 → 額外獲得 1 戰技點'); }
  }, 30);
  // 秘技：戰術演繹
  on('battleStart', () => {
    const al = findKey('alan');
    if (!al || !S.rules.alanTechnique) return;
    log('info', '阿蘭 秘技【戰術演繹】');
    advance(al, 0.30);
    spGain();
    log('buff', '阿蘭 獲得 1 戰技點');
  }, 30);
  on('battleStart', () => alanBulwark(), 60);

  /* =========================================================
   * 平衡權能：時間織機
   *   平衡角色把［校準任務］投入時間織機；每投入（或重新投入）一份，充能 +50%，最多 500%。
   *   充能達 100% 可以主動啟動（不佔回合，和終結技一樣隨時可按）：依投入順序執行所有任務，充能歸零。
   *   開局與換波時，時間織機自動執行一次並清空所有任務。
   *   可儲存的任務數依在場平衡角色人數：1／2／3／4 人 → 2／3／5／10 份（標為「不佔儲存」的任務除外）。
   * ========================================================= */
  const LOOM_CAP = [0, 2, 3, 5, 10];
  const TASK_NAME = { up: '漲', down: '跌', long: '做多', short: '做空', cash: '套現', bottom: '抄底', fuse: '熔斷', hedge: '對沖' };
  /** 常駐任務（帶有執行次數）：不佔儲存、不提供充能，每次啟動執行一次，次數歸零後消除 */
  const TASK_FREE = new Set(['fuse', 'cash', 'bottom', 'hedge']);
  const TASK_USES = { fuse: 3, cash: 3, bottom: 3, hedge: 3 };
  const STAGES = ['跌停', '大跌', '小跌', '均衡', '小漲', '大漲', '漲停'];
  const toughOn = () => S.rules.toughness !== false;   // 舊存檔與測試資料沒有這個欄位時視為開啟
  const balanceCount = () => S.units.filter(u => u.side === 'ally' && u.alive && CHARS[u.key].power === '平衡').length;
  const loomCap = () => LOOM_CAP[Math.min(4, balanceCount())];
  const loomUsed = () => S.loom.tasks.filter(x => !TASK_FREE.has(x.kind)).length;
  const hasTask = kind => !!(S.loom && S.loom.tasks.some(x => x.kind === kind));
  function loomAdd(kind, o) {
    const L = S.loom;
    if (!L || !loomCap()) return false;
    if (!TASK_FREE.has(kind) && loomUsed() >= loomCap()) {
      log('buff', `時間織機已滿（${loomCap()} 份），［校準任務·${TASK_NAME[kind]}］無法投入`);
      return false;
    }
    L.tasks.push(Object.assign({ kind, uses: 0 }, TASK_USES[kind] ? { left: TASK_USES[kind] } : {}, o || {}));
    if (!TASK_FREE.has(kind)) L.charge = Math.min(5, L.charge + 0.5);
    log('buff', `時間織機 投入［校準任務·${TASK_NAME[kind]}］${TASK_FREE.has(kind) ? '（常駐任務，不佔儲存）' : `（充能 ${pct(L.charge)}）`}`, '', { kind: 'loom', task: kind, src: (o && o.owner) || null });
    return true;
  }
  function loomRemove(task) { const L = S.loom, i = L.tasks.indexOf(task); if (i >= 0) L.tasks.splice(i, 1); }
  /** 常駐任務：消耗 1 次執行次數，歸零時消除（回傳是否已消除） */
  function spendUse(t) {
    t.left -= 1;
    if (t.left > 0) return false;
    loomRemove(t);
    log('buff', `［校準任務·${TASK_NAME[t.kind]}］執行次數歸零，消除`);
    return true;
  }
  /** 啟動時間織機：依序執行所有任務（執行中新投入的任務要等下一次） */
  function runLoom(why) {
    const L = S.loom;
    const list = L.tasks.slice();
    L.charge = 0;
    log('info', `⏳ 時間織機 啟動${why ? '（' + why + '）' : ''}：${list.map(x => TASK_NAME[x.kind]).join('、') || '沒有任務'}`, '', { kind: 'loomRun' });
    emit('loomRun', { L });
    for (const task of list) {
      if (!L.tasks.includes(task)) continue;
      task.uses += 1;
      TASKS[task.kind](task);
      emit('loomTask', { task });
    }
    L.pierce = 0;
    profitEval();
  }
  /**
   * 開局、換波：執行一次後清空原本的任務（常駐任務也是執行一次後一併清除）。
   * 執行過程中新產生的任務（例如因此漲停而投入的［熔斷］、［套現］）保留下來。
   */
  function loomPurge(why) {
    const L = S.loom;
    if (!L) return;
    const old = L.tasks.slice();
    if (old.length) runLoom(why);
    L.tasks = L.tasks.filter(x => !old.includes(x));
    L.charge = Math.min(5, 0.5 * loomUsed());
    // 被清掉的套現／抄底不會再歸還利潤，這裡直接還給時間織機
    if (L.gordon && old.some(x => x.kind === 'cash' || x.kind === 'bottom') && !L.tasks.some(x => x.kind === 'cash' || x.kind === 'bottom')) L.profit = true;
  }
  on('battleStart', () => loomPurge('開局'), 70);
  on('waveStart', c => { if (c.wave > 0) loomPurge('換波'); }, 20);

  /* =========================================================
   * 戈登：股市如戰場
   *   股市七階：跌停、大跌、小跌、均衡、小漲、大漲、漲停（S.loom.market = -3 … +3），開局與換波時回到均衡。
   *   ［校準優化·利潤］（S.loom.profit = true）：時間織機執行完所有任務後，股市不為均衡時轉變為［做多］／［做空］投入，隨後利潤消失；
   *   套現／抄底的執行次數歸零時，時間織機重新獲得利潤。
   *   股市到達漲停／跌停：投入［熔斷］，並投入［套現］（漲停）或［抄底］（跌停）。對沖存在時不會觸發。
   * ========================================================= */
  const STAGE_FX = { '-3': { slow: 0.2, vuln: 0.2 }, '-2': { slow: 0.1, vuln: 0.1 }, '-1': { slow: 0.05, vuln: 0 }, '1': { haste: 0.05, extra: 0.1 }, '2': { haste: 0.10, extra: 0.2 }, '3': { haste: 0.15, extra: 0.3 } };
  /** 目前股市帶來的效果（沒有戈登時為 null）；對沖存在時跌停與漲停的效果同時生效 */
  function marketFx() {
    const L = S && S.loom;
    if (!L || !L.gordon) return null;
    const f = Object.assign({ slow: 0, vuln: 0, haste: 0, extra: 0 }, STAGE_FX[L.market] || {});
    if (L.tasks.some(x => x.kind === 'hedge')) Object.assign(f, { slow: 0.2, vuln: 0.2, haste: 0.15, extra: 0.3 });
    return f;
  }
  function marketVuln() { const f = marketFx(); return f ? f.vuln : 0; }
  // 股市：敵方減速、我方加速（沒有戈登時為 0，不影響原本的數值）
  mod('spd', u => { const f = marketFx(); if (!f || u.side === 'timer') return 0; return u.side === 'enemy' ? -rawSpd(u) * f.slow : rawSpd(u) * f.haste; }, 5);
  // 股市上漲：我方攻擊後追加戈登攻擊力 × 比例的運屬性附加傷害
  on('afterAttack', c => {
    const f = marketFx(), g = alive('gordon');
    if (!f || !f.extra || !g || c.att.side !== 'ally') return;
    c.targets.filter(t => t.alive).forEach(t => dealDamage(g, t, { base: f.extra * getAtk(g, t), elem: 'luck', label: '股市·運附加傷害', atype: 'extra', sub: true, note: `戈登攻擊力 × ${pct(f.extra)}` }));
  }, 20);
  /** 股市移動 d 階；熔斷存在時只有熔斷本身能改變股市 */
  function marketShift(d, byFuse) {
    const L = S.loom;
    if (!L || !L.gordon) return;
    if (!byFuse && hasTask('fuse')) { log('buff', `股市［${STAGES[L.market + 3]}］熔斷中，無法變動`); return; }
    const before = L.market;
    L.market = Math.max(-3, Math.min(3, L.market + d));
    if (L.market === before) return;
    log('buff', `股市：${STAGES[before + 3]} → ${STAGES[L.market + 3]}`, '', { kind: 'market', v: L.market, from: before });
    (L.hist || (L.hist = [0])).push(L.market);   // 股市面板的走勢圖
    if (L.hist.length > 40) L.hist.shift();
    syncSpeeds();
    if (byFuse || Math.abs(L.market) !== 3) return;
    if (hasTask('hedge')) { log('buff', '［對沖］存在：不觸發熔斷、套現或抄底'); return; }
    if (!hasTask('fuse')) loomAdd('fuse', { from: L.market });
    const k = L.market === 3 ? 'cash' : 'bottom';
    if (!hasTask(k)) loomAdd(k);
  }
  function marketReset(why) {
    const L = S.loom;
    if (!L || !L.gordon || L.market === 0) return;
    log('buff', `股市回到［均衡］（${why}）`, '', { kind: 'market', v: 0, from: L.market });
    L.market = 0;
    (L.hist || (L.hist = [0])).push(0);
    syncSpeeds();
  }
  on('waveStart', c => { if (c.wave > 0) marketReset('轉波次'); }, 21);
  /** ［校準優化·利潤］：織機執行完所有任務後，股市不為均衡 → 轉變為做多／做空並投入，隨後利潤消失 */
  function profitEval() {
    const L = S.loom;
    if (!L || !L.gordon || !L.profit || L.market === 0) return;
    const kind = L.market > 0 ? 'long' : 'short';
    if (loomAdd(kind, { profit: true })) { L.profit = false; log('buff', `［校準優化·利潤］轉變為［校準任務·${TASK_NAME[kind]}］，利潤消失`); }
  }
  /** 套現／抄底的執行次數歸零 → 時間織機重新獲得利潤 */
  function profitBack(t) {
    if (!spendUse(t)) return;
    S.loom.profit = true;
    log('buff', '時間織機重新獲得［校準優化·利潤］');
  }
  function wealth(a, dur) { addBuff(a, { name: '財源滾滾', dur, stats: {} }); }
  const TASKS = {
    up(t) { marketShift(+1); loomRemove(t); },
    down(t) { marketShift(-1); loomRemove(t); },
    long(t) {
      loomRemove(t);
      marketShift(+1);
      const g = alive('gordon'), n = Math.max(0, S.loom.market);
      if (g && n && enemies().length) attack(g, enemies(), 0.3 * n, 'luck', '校準任務·做多', { atype: 'extra', note: `上漲 ${n} 階` });
    },
    short(t) {
      loomRemove(t);
      marketShift(-1);
      const g = alive('gordon'), n = Math.max(0, -S.loom.market);
      if (g && n) { gainEnergy(g, 5 * n); log('buff', `［校準任務·做空］下跌 ${n} 階 → 戈登 恢復 ${5 * n} 能量`); }
    },
    fuse(t) { marketShift(S.loom.market > 0 ? -1 : S.loom.market < 0 ? +1 : 0, true); spendUse(t); },
    cash(t) {
      const g = alive('gordon');
      if (g && enemies().length) {
        log('info', '▶ ［校準任務·套現］10 段彈射', '', { kind: 'cast', src: g.id });
        const hit = [];
        for (let i = 0; i < 10 && enemies().length; i++) { const e = rand(enemies()); if (!hit.includes(e)) hit.push(e); dealDamage(g, e, { mult: 0.25, elem: 'luck', label: '校準任務·套現', atype: 'extra', fast: true }); }
        emit('afterAttack', { att: g, targets: hit, marked: [], o: { atype: 'extra' } });
        advance(g, 0.30);
        if (tr(g, 'a1')) { allies().forEach(a => gainEnergy(a, 5)); log('buff', '戈登【大撒幣】：我方全體恢復 5 點能量'); }
      }
      profitBack(t);
    },
    bottom(t) {
      const g = alive('gordon');
      allies().forEach(a => wealth(a, 999));
      spGain(2);
      log('buff', '［校準任務·抄底］我方全體獲得［財源滾滾］，回復 2 個戰技點');
      if (g) advance(g, 0.30);
      profitBack(t);
    },
    hedge(t) {
      const g = alive('gordon');
      if (g && enemies().length) {
        const es = enemies(), main = highestHp(es), i = es.indexOf(main);
        attackEach(g, [{ t: main, mult: 1.2, label: '校準任務·對沖' }].concat([es[i - 1], es[i + 1]].filter(Boolean).map(e => ({ t: e, mult: 0.6, label: '校準任務·對沖·相鄰' }))), { elem: 'luck', atype: 'extra' });
        if (main.alive) { addBuff(main, { name: '債務糾紛', dur: 1, debuff: true, stats: { dmgDealtRed: 0.30 } }); log('buff', `${main.name} 陷入［債務糾紛］（造成的傷害 −30%，1 回合）`); }
      }
      spendUse(t);
      syncSpeeds();
    },
  };
  SKILLS.gordon = {
    basic(u) {
      const t = enemyTarget(); spGain();
      attack(u, [t], 1.0, 'luck', '普攻·我買了', { tough: 10, atype: 'basic' });
      // 額外能力二：致摯愛 — 與目標賭一局（基礎勝率 50%，股市每上漲一階 +10%、每下跌一階 −10%）
      if (tr(u, 'a2') && S.loom) {
        const p = Math.max(0, Math.min(1, 0.5 + 0.1 * S.loom.market)), win = Math.random() < p;
        log('buff', `戈登【致摯愛】與 ${t.name} 賭了一局（勝率 ${pct(p)}）：${win ? '勝利' : '失敗'}`);
        if (loomAdd(win ? 'up' : 'down', { owner: u.id })) emit('loomInsert', { u, n: 1 });
      }
      gainEnergy(u, 20);
    },
    /** 戰技：投入［漲］或［跌］；每多消耗 2 戰技點多投入一張，最多三張，每張可分別選擇（opt.dirs） */
    skill(u, o) {
      o = o || {};
      let dirs = Array.isArray(o.dirs) && o.dirs.length ? o.dirs.slice(0, 3) : Array(Math.max(1, Math.min(3, Math.floor(o.n || 1)))).fill(o.dir);
      dirs = dirs.map(d => (d === 'down' ? 'down' : 'up'));
      while (dirs.length > 1 && !S.rules.infiniteSP && S.sp < 1 + 2 * (dirs.length - 1)) dirs.pop();
      const cost = 1 + 2 * (dirs.length - 1);
      if (!S.rules.infiniteSP) S.sp -= cost;
      const cnt = d => dirs.filter(x => x === d).length;
      log('buff', `戈登【機會成本】投入 ${[cnt('up') ? `${cnt('up')} 張［漲］` : '', cnt('down') ? `${cnt('down')} 張［跌］` : ''].filter(Boolean).join('、')}（消耗 ${cost} 戰技點；超出儲存數的不會投入）`);
      let put = 0;
      for (const d of dirs) if (loomAdd(d, { owner: u.id })) put++;
      if (put) emit('loomInsert', { u, n: put });
      gainEnergy(u, 30);
    },
    /** 終結技：移除自己投入的漲／跌，投入［對沖］（常駐 3 次） */
    ult(u) {
      const L = S.loom;
      if (L) {
        const mine = L.tasks.filter(x => x.owner === u.id && (x.kind === 'up' || x.kind === 'down'));
        mine.forEach(loomRemove);
        if (mine.length) log('buff', `移除戈登投入的 ${mine.length} 張校準任務`);
      }
      const old = L && L.tasks.find(x => x.kind === 'hedge');
      if (old) { old.left = 3; log('buff', '［校準任務·對沖］已存在：執行次數重設為 3'); }
      else if (loomAdd('hedge', { owner: u.id })) emit('loomInsert', { u, n: 1 });
      syncSpeeds();
    },
  };
  // 財源滾滾：持有者下次行動時消耗，行動提前 10%
  on('afterAction', c => {
    if ((c.kind !== 'basic' && c.kind !== 'skill') || !hasBuff(c.u, '財源滾滾')) return;
    removeBuff(c.u, '財源滾滾');
    log('buff', `${c.u.name} 消耗［財源滾滾］`);
    advance(c.u, 0.10);
  }, 5);
  // 額外能力三：白手起家 — 熔斷把股市從跌停推回均衡的期間，戈登攻擊力 +20%
  mod('atkPct', u => (u.key === 'gordon' && tr(u, 'a3') && S.loom && S.loom.tasks.some(x => x.kind === 'fuse' && x.from === -3) ? 0.20 : 0), 60);
  // 秘技：保密協議 — 進入戰鬥時我方全體獲得財源滾滾
  on('battleStart', () => {
    if (!findKey('gordon') || !S.rules.gordonTechnique) return;
    log('info', '戈登 秘技【保密協議】');
    allies().forEach(a => wealth(a, 999));
    log('buff', '我方全體獲得［財源滾滾］');
  }, 35);

  /* =========================================================
   * 亞歷山卓：鳴笛、護航專車、押送、圍捕行動
   * ========================================================= */
  const SIREN_MAX = 7;
  const isBadBuff = b => !!(b.debuff || b.stats.defRed || b.stats.dmgDealtRed || b.stats.dmgTakenUp);
  /** 敵人身上的負面效果數：每個減益狀態各算 1；裂傷、血破、管中窺豹／現行犯、樣本、悲悼各算 1 */
  function debuffCount(e) {
    if (!e || e.side !== 'enemy' || !e.alive) return 0;
    return e.buffs.filter(isBadBuff).length + (e.lacer.length ? 1 : 0) + (e.bloodBreak ? 1 : 0) + (e.peek || e.flagrant ? 1 : 0) + (e.sample ? 1 : 0) + (e.mourn && e.mourn.length ? 1 : 0);
  }
  const anyDebuffed = () => enemies().some(e => debuffCount(e) > 0);
  function escortHolder() { const h = S.escort ? U(S.escort) : null; return h && h.alive ? h : null; }
  /** 鳴笛達到 5 點時排入追加攻擊（同一時間只排一次） */
  function addSiren(n, why) {
    const x = alive('alexandra');
    if (!x || n <= 0) return;
    const before = x.siren;
    x.siren = Math.min(SIREN_MAX, x.siren + n);
    log('buff', `亞歷山卓 獲得 ${n} 點鳴笛${why ? '（' + why + '）' : ''}：${before} → ${x.siren}${x.siren === SIREN_MAX ? '（上限）' : ''}`);
    if (x.siren >= 5 && !S.followQueue.some(q => q.kind === 'alexandra')) queueFollowUp(x, 'alexandra');
  }
  /** 護航專車只對最新指定的目標生效；攻擊力% 與速度由下方 mod 提供，固定攻擊力以施加當下的亞歷山卓攻擊力計算 */
  function setEscort(x, a) {
    S.units.forEach(u => removeBuff(u, '護航專車'));
    S.escort = null;
    const flat = 0.15 * getAtk(x, null);
    S.escort = a.id;
    addBuff(a, { name: '護航專車', dur: 999, stats: { atkFlat: flat } });
    log('buff', `${a.name} 獲得［護航專車］（攻擊力 +30% +${fmt(flat)}、速度 +20，攻擊時附加傷害）`, '', { kind: 'escort', src: x.id, tgt: a.id });
  }
  function clearEscort() {
    if (!S.escort) return;
    S.units.forEach(u => removeBuff(u, '護航專車'));
    S.escort = null;
    syncSpeeds();
  }
  mod('atkPct', u => (S.escort === u.id ? 0.30 + (tr(alive('alexandra'), 'a3') && anyDebuffed() ? 0.07 : 0) : 0), 50);
  mod('spd', u => (S.escort === u.id ? 20 : 0), 50);
  SKILLS.alexandra = {
    basic(u) {
      const t = enemyTarget(); spGain();
      const marked = debuffCount(t) > 0;
      attack(u, [t], 1.0, 'wind', '普攻·攔停罰單', { tough: 10, atype: 'basic' });
      if (marked) addSiren(1, '目標帶有負面效果');
      gainEnergy(u, 20);
    },
    skill(u) {
      const a = allyTarget(); spUse();
      setEscort(u, a);
      addBuff(a, { name: '請系好安全帶', dur: 2, stats: { dmgBonus: 0.10 } });
      log('buff', `${a.name} 造成的傷害 +10%（2 回合）`);
      addSiren(1, '請系好安全帶');
      gainEnergy(u, 30);
    },
    ult(u) {
      addSiren(2, '速度與執勤');
      const t = enemyTarget();
      if (t) {
        addBuff(t, { name: '押送', dur: 2, debuff: true, stats: { dmgTakenUp: 0.20, dmgDealtRed: 0.30 } });
        log('buff', `${t.name} 被［押送］（受到的傷害 +20%，造成的傷害 −30%，2 回合）`);
        advance(t, 1.0);
      }
      attack(u, enemies(), 3.0, 'wind', '終結技·速度與執勤', { tough: 20, atype: 'ult' });
    },
  };
  // 護航專車：持有者行動時亞歷山卓獲得 1 鳴笛（亞歷山卓每個回合最多 2 次）
  on('turnStart', c => { if (c.u.key === 'alexandra') c.u.escortTrig = 0; }, 5);
  on('afterAction', c => {
    const x = alive('alexandra');
    if (!x || c.u.id !== S.escort || (x.escortTrig || 0) >= 2) return;
    x.escortTrig = (x.escortTrig || 0) + 1;
    addSiren(1, `${c.u.name} 持有護航專車並行動，${x.escortTrig}/2`);
  }, 45);
  // 護航專車：持有者攻擊時，對每個被命中的目標附加 500 + 亞歷山卓攻擊力 5% 的風屬性傷害
  on('afterAttack', c => {
    const x = alive('alexandra');
    if (!x || c.att.side !== 'ally' || c.att.id !== S.escort) return;
    c.targets.filter(t => t.alive).forEach(t => dealDamage(x, t, { base: 500 + 0.05 * getAtk(x, t), elem: 'wind', label: '護航專車·附加傷害', atype: 'extra', sub: true, note: '500 + 亞歷山卓攻擊力 × 5%' }));
  }, 25);
  // 天賦：敵人每行動一次 +1 鳴笛
  on('enemyAction', c => { if (alive('alexandra')) addSiren(1, `${c.u.name} 行動`); }, 20);
  FOLLOW_UPS.alexandra = x => {
    if (x.siren < 5) return;
    x.siren -= 5;
    log('info', `▶ 消耗 5 點鳴笛（剩餘 ${x.siren}）→ 亞歷山卓 追加攻擊【圍捕行動】`, '', { kind: 'follow', src: x.id, name: '圍捕行動', visual: 'policeDrift' });
    attack(x, enemies(), 1.2, 'wind', '追加攻擊·圍捕行動', { tough: 10, atype: 'followup' });
    gainEnergy(x, 10);
    emit('followUp', { u: x });
    spGain();
    log('buff', '圍捕行動：恢復 1 戰技點');
    advance(x, 0.19);
    const h = escortHolder();
    if (h && h.id !== x.id) advance(h, 0.19);
  };
  // 額外能力一：後勤也在職責範圍 — 我方追加攻擊時，亞歷山卓 +5 能量，該角色攻擊力 +17%（最多 2 層，持續整場戰鬥）
  on('followUp', c => {
    const x = alive('alexandra');
    if (!x || !tr(x, 'a1') || c.u.side !== 'ally') return;
    gainEnergy(x, 5);
    const old = c.u.buffs.find(b => b.name === '後勤支援');
    if (old && old.stacks >= 2) return;
    const stacks = (old ? old.stacks : 0) + 1;
    addBuff(c.u, { name: '後勤支援', dur: 999, stacks, stats: { atkPct: 0.17 * stacks } });
    log('buff', `亞歷山卓【後勤也在職責範圍】：${c.u.name} 攻擊力 +${17 * stacks}%（${stacks}/2 層）`);
  }, 20);
  // 額外能力二：違規難逃法網恢恢 — 敵人行動時帶有 ≥ 2 個負面效果 → 防禦力 −13%（2 回合）
  on('dotTick', c => {
    const e = c.u, x = alive('alexandra');
    if (!x || !tr(x, 'a2') || !e.alive) return;
    const n = debuffCount(e);
    if (n < 2) return;
    addBuff(e, { name: '違規開罰', dur: 2, debuff: true, stats: { defRed: 0.13 } });
    log('buff', `亞歷山卓【違規難逃法網恢恢】：${e.name} 帶有 ${n} 個負面效果 → 防禦力 −13%（2 回合）`);
  }, 50);
  // 額外能力三：飆車不忘遵紀守法 — 帶有負面效果的敵人受到的暴擊傷害 +11%
  on('beforeHit', c => { if (c.att.side === 'ally' && !c.o.breakDmg && c.tgt.side === 'enemy' && tr(alive('alexandra'), 'a3') && debuffCount(c.tgt) > 0) c.mod.cd += 0.11; }, 60);
  // 持有者或亞歷山卓倒下時，護航專車消失
  on('onKill', c => {
    if (c.u.side === 'ally' && (S.escort === c.u.id || c.u.key === 'alexandra')) { clearEscort(); log('buff', '［護航專車］消失'); }
  }, 35);
  // 秘技：油門踩到底，抓穩！
  on('battleStart', () => {
    const x = findKey('alexandra');
    if (!x || !S.rules.alexTechnique) return;
    log('info', '亞歷山卓 秘技【油門踩到底，抓穩！】', '', { kind: 'drift', src: x.id });
    attack(x, enemies(), 0.5, 'wind', '秘技·油門踩到底', { atype: 'extra', fast: true });
    allies().forEach(a => advance(a, 0.23));
    spGain();
    log('buff', '我方全體行動提前 23%，獲得 1 戰技點');
  }, 25);

  /* =========================================================
   * 寒夜：刻度、校準任務·度量／測度、樣本、構築
   *   ［度量］：普攻投入；啟動時執行並消除，寒夜獲得 1 層度量（每次獲得刻度時額外 +1／層，2 回合，最多 3 層）。
   *   ［測度］：終結技把最先投入的度量轉化而成；留在時間織機中，每次啟動消耗 1 次執行次數，
   *            使下次戰技的前四分之一段數帶有擴散。已有測度時，轉化改為使其執行次數 +3。
   * ========================================================= */
  TASK_NAME.measure = '度量';
  TASK_NAME.gauge = '測度';
  function measureStacks(h) { const b = h.buffs.find(x => x.name === '度量'); return b ? b.stacks : 0; }
  function addTicks(h, n, why) {
    if (!h || !h.alive) return;
    const extra = measureStacks(h);
    h.ticks += n + extra;
    log('buff', `寒夜 獲得 ${n}${extra ? ` + ${extra}（度量）` : ''} 層刻度${why ? '（' + why + '）' : ''}：共 ${h.ticks} 層`);
  }
  function setSample(e) {
    S.units.forEach(x => { if (x.side === 'enemy') x.sample = false; });
    e.sample = true;
    log('buff', `${e.name} 獲得標記［樣本］`);
  }
  TASK_FREE.add('gauge');   // 測度：唯一的常駐任務，不佔儲存、不充能
  /** 終結技：最先投入的度量轉化為測度（已有測度時改為執行次數 +3） */
  function convertMeasure() {
    const L = S.loom;
    const m = L && L.tasks.find(x => x.kind === 'measure');
    if (!m) return;
    const g = L.tasks.find(x => x.kind === 'gauge');
    if (g) {
      loomRemove(m);
      g.left += 3;
      log('buff', `［校準任務·度量］轉化為測度並併入既有的［校準任務·測度］：執行次數 +3（剩 ${g.left} 次）`, '', { kind: 'loom', task: 'gauge' });
    } else {
      m.kind = 'gauge'; m.left = 3; m.uses = 0;
      log('buff', '最先投入的［校準任務·度量］轉化為［校準任務·測度］（3 次）', '', { kind: 'loom', task: 'gauge' });
    }
  }
  TASKS.measure = t => {
    loomRemove(t);
    const h = alive('hanye');
    if (!h) return;
    const old = h.buffs.find(b => b.name === '度量');
    const stacks = Math.min(3, (old ? old.stacks : 0) + 1);
    addBuff(h, { name: '度量', dur: 2, stacks, stats: {} });
    log('buff', `［校準任務·度量］執行：寒夜［度量］${stacks} 層（每次獲得刻度時額外 +${stacks}，2 回合）`);
  };
  TASKS.gauge = t => {
    t.left -= 1;
    const h = alive('hanye');
    if (h) { h.spreadReady = true; log('buff', `［校準任務·測度］執行：寒夜 下次戰技的前四分之一段數帶有擴散（剩 ${t.left} 次）`); }
    if (t.left <= 0) { loomRemove(t); log('buff', '［校準任務·測度］執行次數歸零，消除'); }
  };
  SKILLS.hanye = {
    basic(u) {
      const t = enemyTarget(); spGain();
      attack(u, [t], 0.3, 'space', '普攻·單點·解析', { tough: 10, atype: 'basic' });
      const bonus = u.orderBonus || 0;
      u.orderBonus = 0;
      addTicks(u, 1 + bonus, bonus ? '單點·解析＋良序性' : '單點·解析');
      const had = S.loom && S.loom.tasks.find(x => x.kind === 'measure' || x.kind === 'gauge');
      if (loomAdd('measure', { owner: u.id })) {
        emit('loomInsert', { u, n: 1 });
        // 天賦：織機中已有度量或測度時再投入一張度量 → 額外回合（不能在這個天賦給的額外回合中再次觸發）
        if (had && !u.inRecurExtra) {
          u.recurExtra = true;
          grantExtra(u, '單調·遞推');
          log('buff', `寒夜【單調·遞推】：時間織機中已有［${had.kind === 'gauge' ? '測度' : '度量'}］，再投入一張度量 → 獲得額外回合`);
        }
      }
      gainEnergy(u, 20);
    },
    /** 戰技：3 段 + 刻度層數（+ 遞推 5 層）= 彈射段數，每段 25% 空屬性傷害，隨後消除刻度 */
    skill(u) {
      spUse();
      const held = u.ticks, bonus = u.recurBonus ? 5 : 0, hits = 3 + held + bonus;
      const construct = hasBuff(u, '構築');
      const spread = u.spreadReady ? Math.ceil(hits / 4) : 0;
      const qed = u.qedReady && lcOn(u, 'uniqueSolution', 'power');   // 金句《唯一解》［收斂］：時間織機啟動後的下一次戰技無視防禦，段數 ≥ 12 時 2 倍
      u.qedReady = false;
      const defIgnore = (construct ? 0.15 : 0) + (qed ? qed.v.def / 100 * (hits >= 12 ? 2 : 1) : 0);
      const curve = { kind: construct ? 'gaussian' : spread ? 'double' : held >= 8 ? 'wave' : 'arch',
        frequency: 2 + held % 3, center: 0.35 + (S.turnNo % 5) * 0.075, width: 0.14 + Math.min(held, 24) / 160,
        amplitude: 0.5 + Math.min(hits, 40) / 160 };
      log('info', `推廣·極限定義：3 段 + 刻度 ${held} 層${bonus ? ' + 遞推 5 層' : ''} → ${hits} 段彈射${construct ? '（構築：無視 15% 防禦、易彈向樣本）' : ''}${spread ? `，前 ${spread} 段帶擴散` : ''}`, '', { kind: 'riemann', src: u.id, n: hits, construct, curve });
      const hit = [], marked = [];
      const touch = t => { if (!hit.includes(t)) { hit.push(t); if (t.peek || t.flagrant) marked.push(t); } };
      for (let i = 0; i < hits && enemies().length; i++) {
        const es = enemies(), smp = es.find(e => e.sample);
        const t = construct && smp && Math.random() < 0.5 ? smp : rand(es);
        const adj = i < spread ? [es[es.indexOf(t) - 1], es[es.indexOf(t) + 1]].filter(Boolean) : [];
        touch(t);
        dealDamage(u, t, { mult: 0.25, elem: 'space', label: '戰技·推廣·極限定義', tough: 5, atype: 'skill', defIgnore, fast: true });
        adj.forEach(e => { touch(e); dealDamage(u, e, { mult: 0.3, elem: 'space', label: '測度·擴散', atype: 'skill', defIgnore, fast: true }); });
      }
      emit('afterAttack', { att: u, targets: hit, marked, o: { atype: 'skill' } });
      u.ticks = 0; u.recurBonus = false; u.spreadReady = false;
      log('buff', '寒夜 消除所有刻度');
      S.units.forEach(e => { if (e.side === 'enemy' && e.sample) { e.sample = false; log('buff', `${e.name} 的［樣本］標記消失`); } });
      if (construct) { removeBuff(u, '構築'); log('buff', '寒夜 的［構築］在戰技施放後結束'); }
      if (tr(u, 'a1') && held >= 3) { gainEnergy(u, 5 * Math.floor(held / 3)); log('buff', `寒夜【對稱性】：刻度 ${held} 層 → 恢復 ${5 * Math.floor(held / 3)} 能量`); }
      gainEnergy(u, 30);
    },
    ult(u) {
      addTicks(u, 4, '構造·唯一證明');
      const t = enemyTarget();
      attack(u, [t], 2.4, 'space', '終結技·構造·唯一證明', { tough: 30, atype: 'ult' });
      if (t && t.alive) setSample(t);
      addBuff(u, { name: '構築', dur: 999, stats: {} });
      log('buff', '寒夜 獲得［構築］：戰技無視 15% 防禦，彈射到樣本的機率提高 50%（持續到下次施放戰技後）');
      convertMeasure();
    },
  };
  // 天賦：單調·遞推 — 時間織機每執行一份校準任務，寒夜累積 1 層刻度、行動提前 10%；單次累計 ≥ 40% → 下次戰技額外 5 層刻度
  // 天賦給的額外回合：開始時標記，回合結束時清除（這段期間不能再觸發額外回合）
  on('turnStart', c => { if (c.u.key === 'hanye') { c.u.inRecurExtra = !!(c.extra && c.u.recurExtra); c.u.recurExtra = false; } }, 5);
  on('turnEnd', c => { if (c.u.key === 'hanye') c.u.inRecurExtra = false; }, 5);
  on('loomRun', () => { const h = alive('hanye'); if (h) h.loomAdv = 0; }, 20);
  on('loomTask', () => {
    const h = alive('hanye');
    if (!h) return;
    h.loomAdv = (h.loomAdv || 0) + 0.10;
    addTicks(h, 1, '單調·遞推');
    advance(h, 0.10);
    if (h.loomAdv >= 0.40 - 1e-9 && !h.recurBonus) { h.recurBonus = true; log('buff', '寒夜【單調·遞推】：本次時間織機累計行動提前達到 40% → 下次戰技額外計入 5 層刻度'); }
  }, 10);
  // 額外能力三：完備性 — 每層刻度暴擊率 +1%；超過 100% 的暴擊率每 1% 轉為 1.5% 暴擊傷害
  mod('cr', u => (u.key === 'hanye' && tr(u, 'a3') ? 0.01 * (u.ticks || 0) : 0), 30);
  mod('cd', u => { if (u.key !== 'hanye' || !tr(u, 'a3')) return 0; const cr = getCR(u); return cr > 1 ? (cr - 1) * 1.5 : 0; }, 30);
  // 額外能力二：良序性 — 構築期間樣本被消滅 → 轉移至生命百分比最高的敵人，下一次普攻額外 +2 刻度
  on('onKill', c => {
    const h = alive('hanye');
    if (c.u.side !== 'enemy' || !c.sample || !h || !tr(h, 'a2') || !hasBuff(h, '構築') || !enemies().length) return;
    const r = enemies().reduce((a, b) => (b.hp / b.maxHp > a.hp / a.maxHp ? b : a));
    log('buff', `寒夜【良序性】：［樣本］轉移，下一次普攻額外累積 2 層刻度`);
    setSample(r);
    h.orderBonus = 2;
  }, 40);
  // 秘技：先驗 — 開場 2 層刻度；時間織機首次清空後投入一張度量
  on('battleStart', () => {
    const h = findKey('hanye');
    if (!h || !S.rules.hanyeTechnique) return;
    log('info', '寒夜 秘技【先驗】');
    addTicks(h, 2, '先驗');
  }, 65);
  on('battleStart', () => {
    const h = findKey('hanye');
    if (!h || !S.rules.hanyeTechnique) return;
    log('buff', '寒夜【先驗】：時間織機首次清空後投入 1 張［校準任務·度量］');
    loomAdd('measure', { owner: h.id });
  }, 75);

  /* =========================================================
   * 馬克：經驗、榜樣、實戰演練、跬步千里／循序漸進／而勝於藍
   * ========================================================= */
  const EXP_MAX = 15, EXP_FINALE = 12;
  const markAlive = () => alive('mark');
  function modelUnit() { const m = S.model ? U(S.model) : null; return m && m.alive && markAlive() ? m : null; }
  /** 榜樣對應的餘料屬性：榜樣為本質角色且屬性有對應餘料時用它的屬性，否則改投水屬性 */
  const modelResidueElem = m => (m && essenceAlly(m) && CASH_FORM[m.elem] ? m.elem : 'water');
  function addExp(n, why) {
    const k = markAlive();
    if (!k || n <= 0) return;
    const before = k.exp;
    k.exp = Math.min(EXP_MAX, k.exp + n);
    log('buff', `馬克 獲得 ${n} 點經驗${why ? '（' + why + '）' : ''}：${before} → ${k.exp}${k.exp === EXP_MAX ? '（上限）' : ''}`);
    if (k.exp >= EXP_FINALE && !S.followQueue.some(q => q.kind === 'markFinale')) queueFollowUp(k, 'markFinale');
  }
  function setModel(k, a) {
    S.model = a.id;
    log('buff', `${a.name} 成為「榜樣」（暴擊率 +10%、暴擊傷害 +30%，馬克獲得同樣效果）`, '', { kind: 'model', src: k.id, tgt: a.id });
  }
  // 榜樣與馬克本人：暴擊率 +10%、暴擊傷害 +30%（馬克就是榜樣時只算一次）
  const modelBuffed = u => !!modelUnit() && u.side === 'ally' && (u.id === S.model || u.key === 'mark');
  mod('cr', u => (modelBuffed(u) ? 0.10 : 0), 40);
  mod('cd', u => (modelBuffed(u) ? 0.30 : 0), 40);
  SKILLS.mark = {
    basic(u) {
      const t = enemyTarget(); spGain();
      const es = enemies(), i = es.indexOf(t);
      attackEach(u, [{ t, mult: 0.8, label: '普攻·以柔克剛', tough: 10 }].concat([es[i - 1], es[i + 1]].filter(Boolean).map(e => ({ t: e, mult: 0.4, label: '普攻·以柔克剛·相鄰', tough: 5 }))), { elem: 'water', atype: 'basic' });
      const m = modelUnit();
      if (m && t.alive) dealDamage(u, t, { base: 0.8 * getAtk(m, t), elem: m.elem, label: '以柔克剛·榜樣', atype: 'basic', sub: true, note: `榜樣 ${m.name} 攻擊力 × 80%` });
      addExp(1, '以柔克剛');
      gainEnergy(u, 20);
    },
    skill(u) {
      const a = allyTarget(); spUse();
      setModel(u, a);
      addExp(1, '上善若水');
      if (u.modelResidueTurn !== u.ownTurns) {   // 每回合 1 次：額外投入 1 份與榜樣同屬性的餘料
        u.modelResidueTurn = u.ownTurns;
        const e = modelResidueElem(a);
        addResidue(u, 1, `上善若水·${a.name === u.name ? '自身' : '榜樣'}${e === a.elem ? '' : '（改投水屬性）'}`, e);
      }
      gainEnergy(u, 30);
    },
    ult(u) {
      attack(u, enemies(), 1.6, 'water', '終結技·盈科後進', { tough: 20, atype: 'ult' });
      addExp(2, '盈科後進');
      addBuff(u, { name: '實戰演練', dur: 2, stats: {} });
      log('buff', '馬克 獲得［實戰演練］：追加攻擊傷害 +25%，追加攻擊時榜樣行動提前 10%（2 回合）');
    },
  };
  /** 馬克的追加攻擊共通流程：額外能力一（能量、抗性）、實戰演練（拉條）、額外能力二（餘料） */
  function markFollow(k, name, kind, hits, expGain) {
    const ex = k.exp;
    log('info', `▶ 馬克 追加攻擊【${name}】`, '', { kind: 'follow', src: k.id, name });
    const es = enemies();
    if (!es.length) return [];
    const list = hits(es, enemyTarget());
    attackEach(k, list, { elem: 'water', atype: 'followup' });
    gainEnergy(k, 10);
    if (tr(k, 'a1')) {
      gainEnergy(k, ex);
      const ts = [...new Set(list.map(h => h.t))].filter(e => e.alive);
      ts.forEach(e => addBuff(e, { name: '流轉·' + kind, dur: 2, debuff: true, stats: { resRed: 0.04 } }));
      log('buff', `馬克【流轉】：恢復 ${ex} 能量（經驗 ${ex} × 1）；${ts.map(e => e.name).join('、')} 全屬性抗性 −4%（${name}，2 回合）`);
    }
    const m = modelUnit();
    if (hasBuff(k, '實戰演練') && m) {
      advance(m, 0.10);
      if (tr(k, 'a2')) { const e = modelResidueElem(m); addResidue(k, 1, '觀潮' + (e === m.elem ? '' : '（改投水屬性）'), e); }
    }
    if (expGain) addExp(expGain, name);
    emit('followUp', { u: k });
    return list;
  }
  FOLLOW_UPS.markStep = k => markFollow(k, '跬步千里', '跬步', (es, t) => [{ t, mult: 0.9, label: '追加攻擊·跬步千里', tough: 10 }], 2);
  FOLLOW_UPS.markSeq = k => markFollow(k, '循序漸進', '循序', (es, t) => {
    const i = es.indexOf(t);
    return [{ t, mult: 1.3, label: '追加攻擊·循序漸進', tough: 10 }].concat([es[i - 1], es[i + 1]].filter(Boolean).map(e => ({ t: e, mult: 1.1, label: '追加攻擊·循序漸進·相鄰', tough: 5 })));
  }, 3);
  FOLLOW_UPS.markFinale = k => {
    if (k.exp < EXP_FINALE) return;
    k.exp -= EXP_FINALE;
    log('buff', `馬克 消耗 ${EXP_FINALE} 點經驗（剩餘 ${k.exp}）`);
    const list = markFollow(k, '而勝於藍', '而勝', es => es.map(t => ({ t, mult: 1.5, label: '追加攻擊·而勝於藍', tough: 10 })), 0);
    const ts = [...new Set(list.map(h => h.t))].filter(e => e.alive);
    ts.forEach(e => addBuff(e, { name: '知悉', dur: 2, debuff: true, stats: { dmgTakenUp: 0.10 } }));
    if (ts.length) log('buff', `${ts.map(e => e.name).join('、')} 獲得［知悉］（受到的傷害 +10%，2 回合）`);
    if (tr(k, 'a3')) { spGain(); log('buff', '馬克【逆止】：恢復 1 個戰技點'); }
  };
  // 實戰演練：追加攻擊傷害 +25%
  on('beforeHit', c => { if (c.att.key === 'mark' && c.o.atype === 'followup' && hasBuff(c.att, '實戰演練')) c.mod.dmg += 0.25; }, 70);
  // 天賦：隊友用技能（普攻／戰技／終結技）攻擊敵人 → 非榜樣 +1 經驗；榜樣 → 循序漸進（每回合最多 2 次）
  on('afterAttack', c => {
    const k = markAlive(), a = c.att;
    if (!k || a.side !== 'ally' || a.key === 'mark' || !c.targets.length || !['basic', 'skill', 'ult'].includes(c.o && c.o.atype)) return;
    if (a.id === S.model && modelUnit()) { if ((k.seqCount || 0) < 2) { k.seqCount = (k.seqCount || 0) + 1; queueFollowUp(k, 'markSeq'); } }
    else addExp(1, `${a.name} 的技能`);
  }, 30);
  // 天賦：隊友發動追加攻擊 → 非榜樣：跬步千里（每回合 1 次）；榜樣：循序漸進（與上面共用每回合 2 次）
  on('followUp', c => {
    const k = markAlive(), a = c.u;
    if (!k || a.side !== 'ally' || a.key === 'mark') return;
    if (a.id === S.model && modelUnit()) { if ((k.seqCount || 0) < 2) { k.seqCount = (k.seqCount || 0) + 1; queueFollowUp(k, 'markSeq'); } }
    else if (!k.stepUsed) { k.stepUsed = true; queueFollowUp(k, 'markStep'); }
  }, 30);
  // 每回合的次數限制：馬克行動後重置
  on('afterAction', c => { if (c.u.key === 'mark') { c.u.stepUsed = false; c.u.seqCount = 0; } }, 95);
  // 榜樣倒下時消失
  on('onKill', c => { if (c.u.side === 'ally' && S.model === c.u.id) { S.model = null; log('buff', '「榜樣」消失'); } }, 36);
  // 秘技：心如止水 — 發動戰鬥的我方單位（隊伍第一位）獲得［斂藏］：被攻擊的機率 −50%（3 回合）
  on('battleStart', () => {
    const k = findKey('mark');
    if (!k || !S.rules.markTechnique) return;
    const lead = allies()[0];
    log('info', '馬克 秘技【心如止水】');
    addBuff(lead, { name: '斂藏', dur: 3, stats: { aggroDown: 0.5 } });
    log('buff', `${lead.name} 獲得［斂藏］：被敵人選為攻擊目標的機率 −50%（3 回合）`);
  }, 26);

  /* =========================================================
   * 情感權能：星流
   *   S.flow = { v: −100 … +100, ext: null | { side: 'grow' | 'fade', by: 屬性 }, pend }
   *   情感角色把星流推向「長」（+）或「消」（−）；0% 為「中節」。
   *   到達 ±100%（極長／極消）時：釋放環境特殊效果（由最終推動的角色屬性決定），場上所有情感角色進入自己的特殊狀態，
   *   並出現以 75 速度行動的「星流計時器」。輪到計時器時，星流回到中節，角色與環境的特殊效果消失。
   *   特殊效果期間的推動值以 10% 縮放暫存（最多 ±30%），計時結束時正式計入。
   * ========================================================= */
  const emotionAlly = u => !!u && u.side === 'ally' && !!CHARS[u.key] && CHARS[u.key].power === '情感';
  const FLOW_EXT = { grow: '極長', fade: '極消' };
  /** 環境效果以星流狀態即時計算，不受角色自身回合扣時；換波沿用，計時器結束時全部撤除。 */
  const FLOW_ENV = {
    joy: {
      grow: { name: '歡欣共鳴', desc: '我方全體暴擊率提高 15%。', cr: 0.15 },
      fade: { name: '靜心庇護', desc: '我方全體受到的傷害降低 15%。', takenRed: 0.15 },
    },
    anger: {
      grow: { name: '燎原怒意', desc: '我方全體造成的直接傷害提高 20%（不含持續傷害）。', direct: 0.20 },
      fade: { name: '餘燼壓制', desc: '敵方全體造成的傷害降低 20%。', enemyDealtRed: 0.20 },
    },
    sorrow: {
      grow: { name: '悼歌迴盪', desc: '敵方全體受到的持續傷害增傷提高 25 個百分點。', dot: 0.25 },
      fade: { name: '寂雨安魂', desc: '敵方全體速度降低 15%；我方全體受到的治療提高 25%。', enemySpd: -0.15, healReceived: 0.25 },
    },
    mirth: {
      grow: { name: '輕快節拍', desc: '我方全體速度提高 15%。', allySpd: 0.15 },
      fade: { name: '悠然回奏', desc: '我方全體能量恢復效率提高 15 個百分點。', err: 0.15 },
    },
  };
  function flowEnv() { const e = S && S.flow && S.flow.ext; return e && FLOW_ENV[e.by] && FLOW_ENV[e.by][e.side]; }
  mod('cr', u => (u.side === 'ally' ? (flowEnv()?.cr || 0) : 0), 80);
  mod('err', u => (u.side === 'ally' ? (flowEnv()?.err || 0) : 0), 80);
  mod('spd', u => rawSpd(u) * (u.side === 'ally' ? (flowEnv()?.allySpd || 0) : u.side === 'enemy' ? (flowEnv()?.enemySpd || 0) : 0), 80);
  on('beforeHit', c => {
    const env = flowEnv();
    if (!env || c.att.side !== 'ally' || c.tgt.side !== 'enemy') return;
    c.mod.dmg += c.o.dot ? (env.dot || 0) : (env.direct || 0);
  }, 85);
  function ensureFlowTimer() {
    const F = S.flow;
    if (!F || !F.ext) { S.units = S.units.filter(x => x.id !== 'flowTimer'); return; }
    const timer = S.units.find(x => x.id === 'flowTimer');
    if (!Number.isFinite(F.ext.endsAt)) F.ext.endsAt = S.time + (timer ? Math.max(0, timer.av) : 10000 / 75);
    if (timer) return;
    S.units.push({ id: 'flowTimer', side: 'timer', key: 'flowTimer', name: '星流計時器', alive: true, buffs: [], base: { spd: 75, lvl: 80 },
      hp: 1, maxHp: 1, shield: 0, shieldDur: 0, pendingAdv: 0, av: Math.max(0, F.ext.endsAt - S.time), spdCache: 75 });
  }
  const flowTxt = v => `${v > 0 ? '長 ' : v < 0 ? '消 ' : '中節 '}${Math.abs(v) % 1 ? Math.abs(v).toFixed(1) : Math.abs(v)}%`;
  /** 目前的星流狀態：極長／極消／長／消／中節（沒有情感角色時為 null） */
  function flowState() {
    const F = S.flow;
    if (!F) return null;
    return F.ext ? FLOW_EXT[F.ext.side] : F.v > 0 ? '長' : F.v < 0 ? '消' : '中節';
  }
  /** 推動星流：amt > 0 → 長，amt < 0 → 消 */
  function pushFlow(u, amt, why) {
    const F = S.flow;
    if (!F || !amt) return;
    const dir = amt > 0 ? '長' : '消';
    emit('flowPush', { u, amt });
    if (F.ext) {
      const before = F.pend;
      F.pend = Math.max(-30, Math.min(30, F.pend + amt * 0.1));
      log('buff', `${u.name}${why ? `【${why}】` : ''} 向「${dir}」推動 ${Math.abs(amt)}% → 特殊效果期間以 10% 暫存：${flowTxt(before)} → ${flowTxt(F.pend)}（計時結束時計入）`, '', { kind: 'flow', v: F.v, pend: F.pend, src: u.id });
      return;
    }
    const before = F.v;
    F.v = Math.max(-100, Math.min(100, F.v + amt));
    log('buff', `${u.name}${why ? `【${why}】` : ''} 使星流向「${dir}」推動 ${Math.abs(amt)}%：${flowTxt(before)} → ${flowTxt(F.v)}`, '', { kind: 'flow', v: F.v, from: before, src: u.id });
    if (Math.abs(F.v) >= 100 - 1e-9) flowExtreme(u, F.v > 0 ? 'grow' : 'fade');
  }
  function flowExtreme(u, side) {
    const F = S.flow;
    F.ext = { side, by: u.elem, endsAt: S.time + 10000 / 75 };
    F.pend = 0;
    syncSpeeds();
    log('info', `✧ 星流到達【${FLOW_EXT[side]}】（由 ${u.name} 推動，${ELEM_NAME[u.elem]}屬性）`, '', { kind: 'flowExt', side, elem: u.elem, src: u.id });
    const env = FLOW_ENV[u.elem] && FLOW_ENV[u.elem][side];
    if (env) log('buff', `環境特殊效果【${env.name}】：${env.desc}`);
    emit('flowExtreme', { side, by: u });
    S.units = S.units.filter(x => x.id !== 'flowTimer');
    ensureFlowTimer();
    log('buff', '星流計時器 出現（速度 75）');
  }
  /** 計時器的回合：星流回到中節，特殊效果消失，暫存的推動值正式計入 */
  function flowEnd() {
    const F = S.flow;
    S.units = S.units.filter(x => x.id !== 'flowTimer');
    if (!F || !F.ext) return;
    const side = F.ext.side;
    F.ext = null;
    F.v = 0;
    syncSpeeds();
    log('info', `星流計時結束：星流回到中節，【${FLOW_EXT[side]}】的角色與環境特殊效果消失`, '', { kind: 'flow', v: 0 });
    emit('flowEnd', { side });
    if (F.pend) { F.v = F.pend; log('buff', `暫存的推動值正式計入：星流 ${flowTxt(F.v)}`, '', { kind: 'flow', v: F.v, from: 0 }); }
    F.pend = 0;
  }

  /* =========================================================
   * 米勒：悲悼、花束（罌粟／白菊）、葬禮、回響
   *   米勒的傷害以自身生命值上限計算。
   *   悲悼：每個獨立計算階段（1 → 2 → 3），敵人回合開始時造成（30% + 階段 × 15%）米勒生命值上限的哀屬性持續傷害後推進；
   *         第三階段結算後消失。同一目標最多 3 個（陰雨連綿 +1）。
   * ========================================================= */
  function getEHR(u) { return u.base.ehr + buffSum(u, 'ehr') + modAdd(0, 'ehr', u); }
  /** 場上的持續傷害效果數：每個悲悼、每層裂傷、每層血破各算 1 */
  const dotEffects = () => enemies().reduce((n, e) => n + (e.mourn ? e.mourn.length : 0) + e.lacer.length + e.bloodBreak, 0);
  // 額外能力三：敬輓 — 每個持續傷害效果效果命中 +8%（最多 48%）
  mod('ehr', u => (u.key === 'miller' && tr(u, 'a3') ? Math.min(0.48, 0.08 * dotEffects()) : 0), 10);
  /** 米勒的生命值上限：額外能力三使超過 100% 的效果命中每 1% 轉為生命值上限 +1% */
  function millerHp(u) {
    const ehr = tr(u, 'a3') ? getEHR(u) : 0;
    const m = u.base.hp * (1 + Math.max(0, ehr - 1));
    if (Math.abs(m - u.maxHp) > 0.5) { u.maxHp = m; u.hp = Math.min(u.hp, m); }
    return u.maxHp;
  }
  const mournMax = () => 3 + (hasBuff(findKey('miller') || { buffs: [] }, '陰雨連綿') ? 1 : 0);
  function applyMourn(src, e, chance, why) {
    if (!e || !e.alive) return false;
    if (chance != null) {
      const p = chance * (1 + getEHR(src)) * (1 - e.base.effRes);
      if (Math.random() >= p) { log('buff', `悲悼 施加失敗（實際機率 ${pct(Math.min(1, p))}）→ ${e.name}`); return false; }
    }
    if (e.mourn.length >= mournMax()) {
      log('buff', `${e.name} 的悲悼已達上限（${mournMax()} 個）→ 額外觸發一次最高階段的悲悼`);
      triggerMourn(src, e, '滿額施加');
      return false;
    }
    e.mourn.push({ st: 1, first: true });
    log('buff', `${e.name} 獲得 悲悼（第一階段）${why ? '（' + why + '）' : ''}：現有 ${e.mourn.length} 個`);
    return true;
  }
  /** 結算一個悲悼的傷害（不推進階段） */
  function mournHit(mi, e, m, label) {
    const hp = millerHp(mi), r = 0.30 + 0.15 * m.st;
    dealDamage(mi, e, { base: r * hp, elem: 'sorrow', canCrit: false, dot: true, dotType: 'mourn', dotStage: m.st, label, note: `米勒生命值上限 ${fmt(hp)} × (30% + 第${m.st}階段 × 15%)` });
  }
  /** 額外觸發悲悼：不推進階段、不消除，也不觸發最終結算。 */
  function triggerMourn(mi, e, why, all = false) {
    if (!e.alive || !e.mourn.length) return;
    const list = all ? e.mourn.slice() : [e.mourn.reduce((a, b) => (b.st > a.st ? b : a))];
    for (const m of list) {
      if (!e.alive) break;
      mournHit(mi, e, m, `悲悼·${why}（第${m.st}階段）`);
    }
  }
  const BOUQUET = ['花束·罌粟', '花束·白菊'];
  function setBouquet(e, name, dur) {
    BOUQUET.forEach(n => removeBuff(e, n));
    addBuff(e, name === '花束·罌粟' ? { name, dur, debuff: true, stats: { defRed: 0.10 } } : { name, dur, debuff: true, stats: {} });
  }
  /** 米勒的直接攻擊：以生命值上限計算 */
  function millerHits(u, hits, label, atype) {
    const hp = millerHp(u);
    attackEach(u, hits.map(h => ({ t: h.t, mult: 0, base: h.r * hp, note: `米勒生命值上限 ${fmt(hp)} × ${pct(h.r)}`, label: h.label || label, tough: h.tough || 10 })), { elem: 'sorrow', atype });
  }
  SKILLS.miller = {
    basic(u) {
      const t = enemyTarget(); spGain();
      millerHits(u, [{ t, r: 0.5 }], '普攻·收好，你的訃告', 'basic');
      applyMourn(u, t, 0.80);
      gainEnergy(u, 20);
    },
    skill(u) {
      const t = enemyTarget(); spUse();
      const es = enemies(), i = es.indexOf(t), adj = [es[i - 1], es[i + 1]].filter(Boolean);
      const high = t.hp / t.maxHp > 0.5;   // 依主目標受擊前的狀態獻上花束
      millerHits(u, [{ t, r: 0.8 }].concat(adj.map(e => ({ t: e, r: 0.8, label: '戰技·罌粟與白菊·相鄰' }))), '戰技·罌粟與白菊', 'skill');
      [t].concat(adj).forEach(e => applyMourn(u, e, 1.0));
      const bonus = u.funeralBonus || 0;
      if (t.alive) {
        setBouquet(t, high ? '花束·罌粟' : '花束·白菊', 3);
        log('buff', `米勒 向 ${t.name} 獻上［${high ? '罌粟' : '白菊'}］（3 回合）：${high ? '防禦力 −10%；生命值首次降至 50% 以下時轉為白菊' : '受到的持續傷害 +20%；被擊敗時轉移最高階段的悲悼'}`);
      }
      pushFlow(u, (high ? 1 : -1) * (25 + bonus), (high ? '罌粟' : '白菊') + (bonus ? '（葬禮 +5%）' : ''));
      gainEnergy(u, 30);
    },
    ult(u) {
      millerHits(u, enemies().map(t => ({ t, r: 1.5, tough: 20 })), '終結技·願你安息，願我銘記', 'ult');
      enemies().forEach(e => applyMourn(u, e, 1.10));
      u.funeral = 2;
      enemies().forEach(e => addBuff(e, { name: '回響', dur: 999, debuff: true, stats: {} }));
      log('buff', '米勒 展開領域［葬禮］（2 回合）：米勒行動時星流向當前傾向推動 10%；敵方全體獲得［回響］');
    },
  };
  // 葬禮：進入米勒回合時持續時間 −1，歸零時消除（回響一併消除）
  on('turnStart', c => {
    const u = c.u;
    if (u.key !== 'miller' || !u.funeral) return;
    u.funeral -= 1;
    if (u.funeral > 0) { log('buff', `［葬禮］剩餘 ${u.funeral} 回合`); return; }
    S.units.forEach(e => { if (e.side === 'enemy') removeBuff(e, '回響'); });
    log('buff', '［葬禮］結束，敵方的［回響］消除');
  }, 15);
  // 葬禮：米勒回合行動時，星流向當前傾向推動 10%；星流為中節時，改為使這次戰技的推動值 +5%
  on('beforeAction', c => {
    const u = c.u;
    u.funeralBonus = 0;
    if (u.key !== 'miller' || !u.funeral || c.kind === 'ult' || !S.flow) return;
    const st = flowState();
    if (st === '中節') { if (c.kind === 'skill') u.funeralBonus = 5; }
    else if (!S.flow.ext) pushFlow(u, S.flow.v > 0 ? 10 : -10, '葬禮');
    else pushFlow(u, S.flow.ext.side === 'grow' ? 10 : -10, '葬禮');
  }, 20);
  // 悲悼：敵人回合開始時逐一結算並推進階段
  on('dotTick', c => {
    const e = c.u, mi = findKey('miller');
    if (!mi || !e.mourn || !e.mourn.length) return;
    for (const m of e.mourn.slice()) {
      if (!e.alive) return;
      mournHit(mi, e, m, `悲悼·第${m.st}階段`);
      if (!e.alive) return;
      if (m.first && tr(mi, 'a2')) { m.first = false; log('buff', `米勒【音容宛在】：第一次結算的悲悼不推進階段（第${m.st}階段）`); continue; }
      m.first = false;
      if (m.st < 3) { m.st += 1; continue; }
      e.mourn.splice(e.mourn.indexOf(m), 1);
      log('buff', `${e.name} 的一個悲悼完成第三階段，消失（剩 ${e.mourn.length} 個）`);
      mournEnd(mi, e);
    }
  }, 15);
  /** 悲悼最終結算後：敬悼（額外能力一）與回響 */
  function mournEnd(mi, e) {
    if (mi.alive && tr(mi, 'a1') && e.alive) {
      const es = enemies(), i = es.indexOf(e);
      log('info', '▶ 米勒【敬悼】', '', { kind: 'cast', src: mi.id });
      millerHits(mi, [{ t: e, r: 0.6 }].concat([es[i - 1], es[i + 1]].filter(Boolean).map(x => ({ t: x, r: 0.6, label: '敬悼·相鄰' }))), '敬悼', 'extra');
    }
    if (e.alive && hasBuff(e, '回響')) applyMourn(mi, e, 0.90, '回響');
  }
  // 天賦：為你奏響輓歌 — 每次觸發持續傷害，為生命值百分比最低的我方回復（米勒生命值上限 1% + 該次持續傷害 1%）
  on('afterHit', c => {
    if (!c.o.dot || c.att.side !== 'ally' || c.tgt.side !== 'enemy') return;
    const mi = alive('miller');
    if (!mi) return;
    const t = allies().reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a));
    heal(mi, t, 0.01 * millerHp(mi) + 0.01 * c.dmg, { syncTo: c.eventIdx });
  }, 30);
  // 星流到達極長／極消：米勒進入盛大告別／陰雨連綿；計時結束時消失
  on('flowExtreme', c => {
    const mi = alive('miller');
    if (!mi) return;
    const name = c.side === 'grow' ? '盛大告別' : '陰雨連綿';
    addBuff(mi, { name, dur: 999, stats: {} });
    log('buff', `米勒 進入［${name}］：${c.side === 'grow' ? '攻擊敵人時額外觸發目標身上全部悲悼各一次' : '可附加的悲悼最大數量 +1'}`);
  }, 10);
  on('flowEnd', () => { const mi = findKey('miller'); if (mi) { removeBuff(mi, '盛大告別'); removeBuff(mi, '陰雨連綿'); } }, 10);
  // 盛大告別：米勒攻擊敵人時，額外觸發目標身上全部悲悼各一次（不推進階段）
  on('afterAttack', c => {
    const mi = c.att;
    if (mi.key !== 'miller' || !hasBuff(mi, '盛大告別') || !c.o || c.o.atype === 'extra') return;
    c.targets.filter(e => e.alive && e.mourn && e.mourn.length).forEach(e => {
      triggerMourn(mi, e, '盛大告別', true);
    });
  }, 35);
  // 罌粟：生命值首次降至 50% 以下 → 轉為白菊（不推動星流）
  on('afterHit', c => {
    const e = c.tgt;
    if (c.killed || e.side !== 'enemy' || e.hp / e.maxHp > 0.5) return;
    const b = e.buffs.find(x => x.name === '花束·罌粟');
    if (!b) return;
    setBouquet(e, '花束·白菊', b.dur);
    log('buff', `${e.name} 的［罌粟］轉化為［白菊］`);
  }, 35);
  // 白菊：受到的持續傷害 +20%；告死：受到的持續傷害 +15%
  on('beforeHit', c => {
    if (!c.o.dot || c.tgt.side !== 'enemy') return;
    if (hasBuff(c.tgt, '花束·白菊')) c.mod.dmg += 0.20;
    if (hasBuff(c.tgt, '告死')) c.mod.dmg += 0.15;
  }, 80);
  // 白菊：持有者被擊敗時，把階段最高的悲悼轉移到生命值百分比最高的敵人
  on('onKill', c => {
    const u = c.u;
    if (u.side !== 'enemy' || !c.mourn || !c.mourn.length || !hasBuff(u, '花束·白菊') || !enemies().length) return;
    const m = c.mourn.reduce((a, b) => (b.st > a.st ? b : a));
    const r = enemies().reduce((a, b) => (b.hp / b.maxHp > a.hp / a.maxHp ? b : a));
    if (r.mourn.length >= mournMax()) return;
    r.mourn.push({ st: m.st, first: m.first });
    log('buff', `［白菊］：${u.name} 的第${m.st}階段悲悼轉移至 ${r.name}`);
  }, 45);
  // 秘技：今日，我們共聚一堂⋯⋯ — 敵方全體［告死］：受到的持續傷害 +15%（2 回合）
  on('battleStart', () => {
    if (!findKey('miller') || !S.rules.millerTechnique) return;
    log('info', '米勒 秘技【今日，我們共聚一堂⋯⋯】');
    enemies().forEach(e => addBuff(e, { name: '告死', dur: 2, debuff: true, stats: {} }));
    log('buff', '敵方全體 獲得［告死］：受到的持續傷害 +15%（2 回合）');
  }, 27);

  /* =========================================================
   * O.T.G.：生死角力、苦難、瀆神之軀、原罪裂傷
   *   S.duel = { id: 敵人 id, dur }：O.T.G. 與該敵人互相角力（場上只有一名敵人）。
   *   O.T.G. 自己身上的裂傷（u.lacer）在 O.T.G. 的回合開始時結算；每結算 1 層獲得 1 點「苦難」（上限 12）。
   *   終結技不使用能量，而是消耗 9 點苦難（能量條顯示苦難，滿 9 點即可施放）。
   * ========================================================= */
  const SUFFER_MAX = 12, SUFFER_ULT = 9;
  const otgAlive = () => alive('otg');
  const duelFoe = () => { const e = S.duel ? U(S.duel.id) : null; return e && e.alive ? e : null; };
  function syncSuffer(u) { u.energy = Math.min(SUFFER_ULT, u.suffer || 0); }
  ULT_PAY.otg = u => { u.suffer = Math.max(0, (u.suffer || 0) - SUFFER_ULT); syncSuffer(u); log('buff', `O.T.G. 消耗 ${SUFFER_ULT} 點苦難（剩餘 ${u.suffer}）`); };
  function addSuffer(u, n, why) {
    if (!u || n <= 0) return;
    if (hasBuff(u, '瀆神之軀')) { log('buff', '［瀆神之軀］狀態下無法獲得苦難'); return; }
    const before = u.suffer || 0;
    const energyBefore = u.energy;
    u.suffer = Math.min(SUFFER_MAX, before + n);
    syncSuffer(u);
    bindEnergy(u, energyBefore, null, before);
    log('buff', `O.T.G. 獲得 ${n} 點苦難${why ? '（' + why + '）' : ''}：${before} → ${u.suffer}${u.suffer >= SUFFER_ULT ? '（可施放終結技）' : ''}`);
  }
  function startDuel(u, e) {
    S.duel = { id: e.id, dur: 2 };
    log('buff', `O.T.G. 與 ${e.name} 進入［生死角力］（2 回合）：${e.name} 陷入嘲諷；O.T.G. 普攻強化、無法施放戰技`, '', { kind: 'duel', src: u.id, tgt: e.id });
  }
  function endDuel(why) {
    if (!S.duel) return;
    S.duel = null;
    log('buff', `［生死角力］結束${why ? '（' + why + '）' : ''}，O.T.G. 解除戰技限制`);
  }
  /** 額外能力二：自身承受的裂傷，超過最大生命 10%（生命低於 20% 時為 5%）的部分降低 90% */
  function selfLacerAdjust(u) {
    if (!tr(u, 'a2')) return null;
    return d => { const th = (u.hp / u.maxHp < 0.2 ? 0.05 : 0.10) * u.maxHp; return d <= th ? d : th + (d - th) * 0.1; };
  }
  /** 結算 O.T.G. 自身的裂傷一次（tick = 回合開始的正常結算，會減少持續時間） */
  function selfLacer(u, o) {
    o = o || {};
    const n = u.lacer.length;
    if (!n || !u.alive) return 0;
    const atk = getAtk(u, null), per = Math.min(0.16 * u.maxHp, 1.2 * atk);
    const duel = S.duel && duelFoe() ? 0.15 : 0;
    dealDamage(u, u, { base: per * n, elem: 'phys', canCrit: false, dot: true, self: true, extraBonus: duel, label: '裂傷（自身）' + (o.tag || ''), keep1: !!o.keep1, adjust: selfLacerAdjust(u),
      note: `${n} 層 × min(16%最大生命, 攻擊力 120% ${fmt(1.2 * atk)})${duel ? '，生死角力 +15%' : ''}${tr(u, 'a2') ? '，額外能力二：超過門檻的部分 −90%' : ''}` });
    addSuffer(u, n, '承受裂傷');
    if (o.tick) { u.lacer.forEach(s => s.dur--); u.lacer = u.lacer.filter(s => s.dur > 0); }
    return n;
  }
  /** 立即結算目標身上「所有」持續傷害（裂傷、血破、悲悼），各以原傷害 × factor，不消耗 */
  function allDot(e, factor, tag) {
    lacerDamage(e, factor, tag);
    const lz = findKey('longzhao');
    if (e.alive && e.bloodBreak && lz) {
      const atk = getAtk(lz, e), per = Math.min(0.24 * e.maxHp, 2.0 * atk);
      dealDamage(lz, e, { base: per * e.bloodBreak * factor, elem: 'phys', canCrit: false, dot: true, extraBonus: tr(lz, 'a2') ? 0.20 : 0, label: '血破' + (tag || ''), note: `${e.bloodBreak} 層 × ${pct(factor)}` });
    }
    const mi = findKey('miller');
    if (e.alive && mi && e.mourn && e.mourn.length) e.mourn.slice().forEach(m => { if (e.alive) mournHit(mi, e, m, `悲悼·第${m.st}階段${tag || ''}`); });
  }
  SKILL_LOCK.otg = () => !!S.duel;   // 生死角力期間無法施放戰技
  SKILLS.otg = {
    basic(u) {
      if (S.duel && duelFoe()) { S.target = S.duel.id; return SKILLS.otg.enhanced(u, false, duelFoe()); }   // 生死角力：普攻鎖定角力中的敵人
      const t = enemyTarget(); spGain();
      attack(u, [t], 1.0, 'phys', '普攻·惡的問題', { tough: 10, atype: 'basic' });
      applyLacer(u, t, 1.0);
    },
    /** 強化普攻：受造物的有限性（asFollow = 天賦的追加攻擊） */
    enhanced(u, asFollow, tgt) {
      const t = tgt && tgt.alive ? tgt : enemyTarget();
      if (!t) return;
      if (!asFollow) spGain();
      attack(u, [t], 1.6, 'phys', asFollow ? '追加攻擊·受造物的有限性' : '強化普攻·受造物的有限性', { tough: 20, atype: asFollow ? 'followup' : 'basic' });
      if (!t.alive) return;
      if (S.duel && S.duel.id === t.id) {
        allDot(t, 1.0, '·立即結算');
        selfLacer(u, { keep1: true, tag: '·立即結算' });
      } else lacerDamage(t, 0.8, '·立即結算 80%');
    },
    skill(u) {
      const t = enemyTarget(); spUse();
      otgDuel(u, t);
      grantExtra(u, '與獸共舞');
      u.skipTick = true;   // 不結束回合：這次行動結束時不扣狀態回合數，和接下來的行動算同一回合
      log('buff', 'O.T.G.【與獸共舞】施放後不結束回合');
    },
    ult(u) {
      advance(u, 1.0);
      allies().filter(a => a.id !== u.id).forEach(a => advance(a, 0.30));
      // 剝離自身的裂傷與負面效果 → 原罪裂傷
      const nL = u.lacer.length, bad = u.buffs.filter(isBadBuff), n = nL + bad.length;
      u.lacer = []; bad.forEach(b => removeBuff(u, b.name));
      const k = n || 2;
      log('buff', `O.T.G. 剝離自身 ${nL} 層裂傷、${bad.length} 個負面效果 → 敵方全體各獲得 ${k} 層［原罪裂傷］${n ? '' : '（自身無裂傷，基礎 2 層）'}`);
      enemies().forEach(e => { for (let i = 0; i < k; i++) pushLacer(e, u, { orig: true }); });
      addBuff(u, { name: '瀆神之軀', dur: 3, stats: { resPen: 0.20 } });
      log('buff', 'O.T.G. 進入［瀆神之軀］（3 回合）：抗性穿透 +20%，每次攻擊後為自身與目標各施加 1 層裂傷');
      // 額外能力三：每剝離 1 層（最多 5 層）引爆倍率 +10%，並投入 1 份物理餘料
      const a3 = tr(u, 'a3') ? Math.min(5, n) : 0;
      const f = 1.2 + 0.1 * a3;
      log('info', `▶ 引爆敵方全體的裂傷（原傷害 ${pct(f)}${a3 ? `，超我 +${a3 * 10}%` : ''}）`, '', { kind: 'cast', src: u.id });
      enemies().forEach(e => lacerDamage(e, f, '·引爆'));
      if (S.duel) { S.duel.dur += 1; log('buff', `［生死角力］延長 1 回合（剩 ${S.duel.dur} 回合）`); }
      if (a3) { u.a3Cash = true; addResidue(u, a3, '超我', 'phys'); u.a3Cash = false; }
    },
  };
  /** 進入生死角力（戰技與秘技共用）；額外能力一：為自身與目標各施加 1 層裂傷 */
  function otgDuel(u, t) {
    if (!t || !t.alive) return;
    startDuel(u, t);
    if (tr(u, 'a1')) { applyLacer(u, u, null, { why: '本我' }); applyLacer(u, t, null, { why: '本我' }); }
  }
  // O.T.G. 回合開始：結算自身裂傷 → 生死角力持續時間 −1 → 天賦追加攻擊次數重置
  on('turnStart', c => {
    const u = c.u;
    if (u.key !== 'otg') return;
    if (!c.extra) {
      selfLacer(u, { tick: true });
      if (S.duel) { S.duel.dur -= 1; if (S.duel.dur <= 0) endDuel('持續時間結束'); else log('buff', `［生死角力］剩餘 ${S.duel.dur} 回合`); }
    }
    u.otgFollow = 0;
  }, 8);
  // 嘲諷：生死角力中的敵人只會攻擊 O.T.G.（寫在 enemyAct）；它行動後為主目標（O.T.G.）施加 1 層裂傷
  on('enemyAction', c => {
    const u = otgAlive();
    if (!u || !S.duel || S.duel.id !== c.u.id) return;
    applyLacer(c.u, u, 1.0, { owner: u, why: '生死角力' });
  }, 5);
  // 生死角力：O.T.G. 攻擊後為主目標施加 1 層裂傷；瀆神之軀：再為自身與目標各施加 1 層
  on('afterAttack', c => {
    const u = c.att;
    if (u.key !== 'otg' || !c.targets.length) return;
    const t = c.targets[0];
    if (S.duel && duelFoe()) applyLacer(u, t, 1.0, { why: '生死角力' });
    if (hasBuff(u, '瀆神之軀')) { applyLacer(u, u, null, { why: '瀆神之軀' }); applyLacer(u, t, null, { why: '瀆神之軀' }); }
  }, 12);
  // 生死角力：該敵人受到 O.T.G. 的持續傷害 +15%
  on('beforeHit', c => { if (c.o.dot && c.att.key === 'otg' && S.duel && c.tgt.id === S.duel.id) c.mod.dmg += 0.15; }, 82);
  // 額外能力一：本我 — 自身每 1 層負面效果或每損失 10% 生命，傷害 +8%（最多 48%）
  on('beforeHit', c => {
    const u = c.att;
    if (u.key !== 'otg' || c.tgt.side !== 'enemy' || !tr(u, 'a1')) return;
    const deb = u.lacer.length + u.buffs.filter(isBadBuff).length, lost = Math.floor((1 - u.hp / u.maxHp) * 10 + 1e-9);
    c.mod.dmg += Math.min(0.48, 0.08 * (deb + lost));
  }, 83);
  // 天賦：同時處於瀆神之軀與生死角力時，受到敵人攻擊 → 對其施放視為追加攻擊的強化普攻（每回合 2 次）
  on('afterHit', c => {
    const u = c.tgt;
    if (u.key !== 'otg' || c.killed || c.att.side !== 'enemy' || c.o.dot || !u.alive || !S.duel || !hasBuff(u, '瀆神之軀') || (u.otgFollow || 0) >= 2) return;
    if (S.followQueue.some(q => q.kind === 'otg')) return;
    u.otgFollow = (u.otgFollow || 0) + 1;
    queueFollowUp(u, 'otg', c.att);
  }, 40);
  FOLLOW_UPS.otg = (u, e) => {
    if (!e || !e.alive) e = enemyTarget();
    if (!e) return;
    log('info', `▶ O.T.G.【苦難無救贖】受到攻擊 → 追加攻擊（${u.otgFollow}/2）`, '', { kind: 'follow', src: u.id, name: '受造物的有限性' });
    SKILLS.otg.enhanced(u, true, e);
    emit('followUp', { u });
    if (tr(u, 'a2') && u.alive) heal(u, u, 0.25 * (u.maxHp - u.hp));
  };
  // 生死角力的敵人被擊敗或 O.T.G. 倒下 → 生死角力消失
  on('onKill', c => {
    if (!S.duel) return;
    if (c.u.id === S.duel.id) endDuel(`${c.u.name} 被擊敗`);
    else if (c.u.key === 'otg') endDuel('O.T.G. 倒下');
  }, 37);
  // 額外能力三：超我投入的餘料觸發兌現 → 受到兌現傷害的敵人各 1 層裂傷
  on('cashout', c => {
    const u = c.by;
    if (!u || u.key !== 'otg' || !u.a3Cash) return;
    c.targets.filter(e => e.alive).forEach(e => applyLacer(u, e, null, { why: '超我' }));
  }, 50);
  // 秘技：原罪清算 — 對生命值上限最高的敵人施放一次不消耗戰技點的戰技，自身獲得 2 層裂傷
  on('battleStart', () => {
    const u = findKey('otg');
    if (!u || !S.rules.otgTechnique || !enemies().length) return;
    log('info', 'O.T.G. 秘技【原罪清算】');
    const t = enemies().reduce((a, b) => (b.maxHp > a.maxHp ? b : a));
    otgDuel(u, t);
    applyLacer(u, u, null, { why: '原罪清算' }); applyLacer(u, u, null, { why: '原罪清算' });
  }, 28);

  /* =========================================================
   * 妙具套裝
   * ========================================================= */
  mod('atkPct', u => (hasSet(u, 'neon2') && rawSpd(u) >= 120 ? 0.12 : 0), 30);                                       // 霓虹不夜街 2
  mod('atkPct', () => (S.units.some(a => a.side === 'ally' && a.alive && hasSet(a, 'tower2')) ? 0.08 : 0), 40);     // 契約之塔 2
  on('beforeHit', c => { if (c.att.side === 'ally' && !c.o.breakDmg && hasSet(c.att, 'ironfist4') && c.tgt.side === 'enemy' && laceStacks(c.tgt) > 0) c.mod.dmg += 0.16; }, 10);
  on('beforeHit', c => { if (c.att.side === 'ally' && !c.o.breakDmg && hasSet(c.att, 'detective4') && c.o.atype === 'followup') c.mod.dmg += 0.20; }, 20);
  on('beforeHit', c => { if (c.att.side === 'ally' && !c.o.breakDmg && hasSet(c.att, 'auction2') && (c.o.atype === 'basic' || c.o.atype === 'skill') && getCR(c.att) >= 0.7) c.mod.dmg += 0.20; }, 30);
  on('cashout', c => {
    c.contributors.filter(a => a.alive && hasSet(a, 'scorch4')).forEach(a => {
      addBuff(a, { name: '焦土狙擊手', dur: 2, stats: { be: 0.20 } });
      log('buff', `妙具【焦土狙擊手】：${a.name} 投入的餘料參與兌現 → 擊破特攻 +20%（2回合）`);
    });
  }, 40);
  on('beforeAction', c => {
    if (c.kind !== 'ult' || !hasSet(c.u, 'ledger4')) return;
    allies().forEach(a => addBuff(a, { name: '冰封的帳簿', dur: 2, stats: { cd: 0.16 } }));
    log('buff', '妙具【冰封的帳簿】：我方全體暴擊傷害 +16%（2回合）');
  }, 10);
  on('afterAction', c => {
    if (c.kind !== 'skill' || !hasSet(c.u, 'contract4')) return;
    allies().forEach(a => addBuff(a, { name: '代理人的委任狀', dur: 2, stats: { atkPct: 0.08 } }));
    log('buff', `妙具【代理人的委任狀】：我方全體攻擊力 +8%（2回合）`);
  }, 10);
  on('afterAction', c => {
    if (c.kind !== 'ult' || !hasSet(c.u, 'detective4') || !c.u.alive) return;
    addBuff(c.u, { name: '偵探的放大鏡', dur: 2, stats: { cr: 0.12 } });
    log('buff', `妙具【偵探的放大鏡】：${c.u.name} 暴擊率 +12%（2回合）`);
  }, 30);

  /* =========================================================
   * 金句
   * ========================================================= */
  /** 裝備者投入的餘料有參與這次兌現、且金句權能層生效的我方角色 */
  const cashLc = (c, id) => c.contributors.filter(a => a.alive && lcOn(a, id, 'power'));
  function stackBuff(u, name, max, dur, statsOf) {
    const old = u.buffs.find(b => b.name === name);
    const stacks = Math.min(max, (old ? old.stacks : 0) + 1);
    addBuff(u, { name, dur, stacks, stats: statsOf(stacks) });
    return stacks;
  }
  // 《不可反駁的推演》性相：追加攻擊或額外回合 → 鎖定；權能：自身行動提前 100% → 回點與罪證確鑿
  function irrefutableLock(u, why) {
    const lc = lcOn(u, 'irrefutable');
    if (!lc) return;
    const stacks = stackBuff(u, '鎖定', 2, 2, k => ({ dmgBonus: lc.v.lockDmg / 100 * k, defIgnore: lc.v.lockDef / 100 * k }));
    log('buff', `金句《不可反駁的推演》：${why} → ${u.name} 【鎖定】${stacks} 層（增傷 +${Math.round(lc.v.lockDmg * stacks)}%，無視防禦 ${Math.round(lc.v.lockDef * stacks)}%）`);
  }
  on('followUp', c => irrefutableLock(c.u, '發動追加攻擊'), 10);
  on('extraTurn', c => irrefutableLock(c.u, c.why), 10);
  on('selfAdvance', c => {
    const u = c.u, lc = lcOn(u, 'irrefutable', 'power');
    if (!lc) return;
    if (u.lcSpAt == null || u.ownTurns - u.lcSpAt >= 2) {
      u.lcSpAt = u.ownTurns;
      spGain();
      log('buff', `金句《不可反駁的推演》［當庭對質］：${u.name} 行動提前 100% → 恢復 1 戰技點`);
    }
    addBuff(u, { name: '罪證確鑿', dur: 999, consume: true, stats: { cd: lc.v.cd / 100 } });
    log('buff', `金句《不可反駁的推演》［當庭對質］：${u.name} 下一次攻擊暴擊傷害 +${Math.round(lc.v.cd)}%`);
  }, 10);
  // 《第九街的規矩》性相：持續傷害增加；權能：每次兌現 →【利滾利】持續傷害再提高（2 層）
  on('beforeHit', c => {
    if (c.att.side !== 'ally' || c.o.breakDmg || !c.o.dot) return;
    const nr = lcOn(c.att, 'ninthRule');
    if (nr) c.mod.dmg += nr.v.dot / 100;
    const pr = lcOn(c.att, 'ninthRule', 'power'), b = pr && c.att.buffs.find(x => x.name === '利滾利');
    if (b) c.mod.dmg += pr.v.roll / 100 * b.stacks;
  }, 40);
  on('cashout', () => allies().forEach(a => {
    const lc = lcOn(a, 'ninthRule', 'power');
    if (!lc) return;
    const k = stackBuff(a, '利滾利', 2, 2, () => ({}));
    log('buff', `金句《第九街的規矩》［利滾利］：${a.name} 持續傷害 +${Math.round(lc.v.roll * k)}%（${k}/2 層）`);
  }), 32);
  // 《合約第七條》性相：戰技指定的目標攻擊力提高；權能：投入的餘料參與兌現 → 我方全體攻擊力提高
  on('afterAction', c => {
    const c7 = c.kind === 'skill' && lcOn(c.u, 'clause7');
    if (!c7) return;
    const tgt = CHARS[c.u.key].skillTarget === 'ally' ? allyTarget() : c.u;
    if (!tgt) return;
    addBuff(tgt, { name: '附加條款', dur: 2, stats: { atkPct: c7.v.atk / 100 } });
    log('buff', `金句《合約第七條》：${tgt.name} 攻擊力 +${Math.round(c7.v.atk)}%（2回合）`);
  }, 20);
  on('cashout', c => {
    const h = cashLc(c, 'clause7')[0], lc = h && lcOn(h, 'clause7', 'power');
    if (!lc) return;
    allies().forEach(a => addBuff(a, { name: '履約保證', dur: 1, stats: { atkPct: lc.v.team / 100 } }));
    log('buff', `金句《合約第七條》［履約保證］：我方全體攻擊力 +${Math.round(lc.v.team)}%（1回合）`);
  }, 31);
  // 《掩護到最後一刻》性相：提供的護盾量提高（寫在阿蘭的護盾倍率）；權能：投入的餘料參與兌現 → 我方全體減傷
  on('cashout', c => {
    const h = cashLc(c, 'lastCover')[0], lc = h && lcOn(h, 'lastCover', 'power');
    if (!lc) return;
    allies().forEach(a => addBuff(a, { name: '不退讓', dur: 2, stats: { dmgTakenRed: lc.v.red / 100 } }));
    log('buff', `金句《掩護到最後一刻》［不退讓］：我方全體受到的傷害 −${Math.round(lc.v.red)}%（2回合）`);
  }, 30);
  // 《千百倍槓桿》性相：施放戰技 → 流動資本；權能：投入校準任務再 +1 層，漲停／跌停時啟動時間織機 → 回點、任務無視防禦
  function leverageStack(u, why) {
    const lc = lcOn(u, 'leverage');
    if (!lc) return;
    const k = stackBuff(u, '流動資本', 3, 999, s => ({ atkPct: lc.v.atk / 100 * s }));
    log('buff', `金句《千百倍槓桿》：${why} → ${u.name} 【流動資本】${k} 層（攻擊力 +${Math.round(lc.v.atk * k)}%，運屬性傷害 +${Math.round(lc.v.imag * k)}%）`);
  }
  on('afterAction', c => { if (c.kind === 'skill') leverageStack(c.u, '施放戰技'); }, 12);
  on('loomInsert', c => { if (lcOn(c.u, 'leverage', 'power')) leverageStack(c.u, '投入校準任務'); }, 10);
  on('beforeHit', c => {
    if (c.att.side !== 'ally' || c.o.breakDmg || c.o.elem !== 'luck') return;
    const lc = lcOn(c.att, 'leverage'), b = lc && c.att.buffs.find(x => x.name === '流動資本');
    if (b) c.mod.dmg += lc.v.imag / 100 * b.stacks;
  }, 50);
  on('loomRun', c => {
    const L = c.L;
    if (!L.gordon || Math.abs(L.market) !== 3) return;
    const u = allies().find(a => lcOn(a, 'leverage', 'power'));
    if (!u) return;
    const lc = lcOn(u, 'leverage', 'power');
    spGain();
    L.pierce = lc.v.def / 100;
    log('buff', `金句《千百倍槓桿》［槓桿操作］：股市［${STAGES[L.market + 3]}］→ 恢復 1 戰技點，本次任務無視防禦 ${Math.round(lc.v.def)}%`);
  }, 10);
  // 《一路綠燈》性相：戰技指定的目標增傷；權能：投入的餘料參與兌現 → 敵方全體【封鎖】
  on('afterAction', c => {
    const gw = c.kind === 'skill' && lcOn(c.u, 'greenWave');
    if (!gw) return;
    const tgt = CHARS[c.u.key].skillTarget === 'ally' ? allyTarget() : c.u;
    if (!tgt) return;
    addBuff(tgt, { name: '開道', dur: 2, stats: { dmgBonus: gw.v.dmg / 100 } });
    log('buff', `金句《一路綠燈》：${tgt.name} 造成的傷害 +${Math.round(gw.v.dmg)}%（2回合）`);
  }, 22);
  on('cashout', c => {
    const h = cashLc(c, 'greenWave')[0], gw = h && lcOn(h, 'greenWave', 'power');
    if (!gw || !enemies().length) return;
    enemies().forEach(e => addBuff(e, { name: '封鎖', dur: 2, debuff: true, stats: { dmgTakenUp: gw.v.vuln / 100 } }));
    log('buff', `金句《一路綠燈》［封鎖線］：敵方全體陷入【封鎖】，受到的傷害 +${Math.round(gw.v.vuln)}%（2 回合）`);
  }, 33);
  // 《實習筆記》性相：每點經驗暴擊傷害提高（最多 12 點）；權能：追加攻擊增傷，投入的餘料參與兌現後 2 倍
  // 《現場勘驗》性相：追加攻擊增傷；權能：追加攻擊額外逸散 1 份餘料（每回合 1 次）
  mod('cd', u => { const lc = lcOn(u, 'internNotes'); return lc ? Math.min(12, u.exp || 0) * lc.v.cd / 100 : 0; }, 50);
  on('beforeHit', c => {
    if (c.att.side !== 'ally' || c.o.breakDmg || c.o.atype !== 'followup') return;
    const a = lcOn(c.att, 'internNotes', 'power'), b = lcOn(c.att, 'fieldExam');
    if (a) c.mod.dmg += a.v.fu / 100 * (hasBuff(c.att, '整理筆記') ? 2 : 1);
    if (b) c.mod.dmg += b.v.fu / 100;
  }, 56);
  on('cashout', c => cashLc(c, 'internNotes').forEach(a => { addBuff(a, { name: '整理筆記', dur: 2, stats: {} }); log('buff', `金句《實習筆記》［整理筆記］：${a.name} 的追加攻擊增傷提高為 2 倍（2回合）`); }), 34);
  on('followUp', c => {
    const u = c.u;
    if (!lcOn(u, 'fieldExam', 'power') || u.feTurn === u.ownTurns) return;
    u.feTurn = u.ownTurns;
    addResidue(u, 1, '金句《現場勘驗》［證物袋］');
  }, 25);
  // 《唯一解》性相：戰技增傷；權能：時間織機啟動後，下一次戰技無視防禦（收斂時 2 倍，寫在寒夜的戰技裡）
  on('beforeHit', c => {
    const lc = c.att.side === 'ally' && !c.o.breakDmg && c.o.atype === 'skill' && lcOn(c.att, 'uniqueSolution');
    if (lc) c.mod.dmg += lc.v.skill / 100;
  }, 57);
  on('loomRun', () => allies().forEach(a => { if (lcOn(a, 'uniqueSolution', 'power') && !a.qedReady) { a.qedReady = true; log('buff', `金句《唯一解》［收斂］：${a.name} 下一次戰技無視部分防禦`); } }), 30);
  // 《獻給你的花》性相：目標每個持續傷害效果使持續傷害提高；權能：星流到達極端點時回能
  // 《雨中的告別式》性相：目標帶有 2 個以上負面效果時持續傷害提高；權能：推動星流 →【雨聲】持續傷害提高
  on('beforeHit', c => {
    if (c.att.side !== 'ally' || !c.o.dot || c.tgt.side !== 'enemy') return;
    const bq = lcOn(c.att, 'bouquetForYou'), rq = lcOn(c.att, 'rainyRequiem'), rp = lcOn(c.att, 'rainyRequiem', 'power');
    if (bq) c.mod.dmg += Math.min(4, (c.tgt.mourn ? c.tgt.mourn.length : 0) + c.tgt.lacer.length + c.tgt.bloodBreak) * bq.v.dot / 100;
    if (rq && debuffCount(c.tgt) >= 2) c.mod.dmg += rq.v.dot / 100;
    const b = rp && c.att.buffs.find(x => x.name === '雨聲');
    if (b) c.mod.dmg += rp.v.push / 100 * b.stacks;
  }, 58);
  on('flowExtreme', () => allies().forEach(a => {
    const lc = lcOn(a, 'bouquetForYou', 'power');
    if (!lc) return;
    gainEnergy(a, lc.v.en);
    log('buff', `金句《獻給你的花》［花語］：星流到達極端點 → ${a.name} 恢復 ${Math.round(lc.v.en)} 點能量`);
  }), 20);
  on('flowPush', c => {
    const lc = lcOn(c.u, 'rainyRequiem', 'power');
    if (!lc) return;
    const k = stackBuff(c.u, '雨聲', 3, 2, () => ({}));
    log('buff', `金句《雨中的告別式》［雨聲］：${c.u.name} 持續傷害 +${Math.round(lc.v.push * k)}%（${k}/3 層）`);
  }, 10);
  // 《交通管制》性相：戰技指定的目標速度提高；權能：投入的餘料參與兌現 → 我方全體行動提前
  on('afterAction', c => {
    const tc = c.kind === 'skill' && lcOn(c.u, 'trafficControl');
    if (!tc) return;
    const tgt = CHARS[c.u.key].skillTarget === 'ally' ? allyTarget() : c.u;
    if (!tgt) return;
    addBuff(tgt, { name: '讓路', dur: 2, stats: { spdPct: tc.v.spd / 100 } });
    log('buff', `金句《交通管制》：${tgt.name} 速度 +${Math.round(tc.v.spd)}%（2回合）`);
  }, 21);
  on('cashout', c => {
    const h = cashLc(c, 'trafficControl')[0], lc = h && lcOn(h, 'trafficControl', 'power');
    if (!lc) return;
    log('buff', `金句《交通管制》［綠波］：我方全體行動提前 ${Math.round(lc.v.adv)}%`);
    allies().forEach(a => advance(a, lc.v.adv / 100));
  }, 35);
  // 《演算草稿》性相：普攻後下一次戰技暴擊率提高；權能：時間織機每執行一份任務 →【演算】（最多 5 層）；兩者都在施放戰技後移除
  on('afterAction', c => {
    const lc = c.kind === 'basic' && lcOn(c.u, 'scratchPaper');
    if (lc && !hasBuff(c.u, '草稿')) addBuff(c.u, { name: '草稿', dur: 999, stats: { cr: lc.v.basic / 100 } });
  }, 23);
  on('loomTask', () => allies().forEach(a => {
    const lc = lcOn(a, 'scratchPaper', 'power');
    if (!lc) return;
    const old = a.buffs.find(b => b.name === '演算');
    if (old && old.stacks >= 5) return;
    stackBuff(a, '演算', 5, 999, k => ({ cr: lc.v.cr / 100 * k }));
  }), 30);
  on('afterAction', c => {
    if (c.kind !== 'skill') return;
    ['演算', '草稿'].forEach(n => { if (hasBuff(c.u, n)) { removeBuff(c.u, n); log('buff', `${c.u.name} 的【${n}】在戰技後移除`); } });
  }, 96);

  // 《無人應答的禱告》性相：每承受一次持續傷害 →【受難】增傷（4 層）；生命低於 50% 暴傷提高
  //                    權能：投入的餘料參與兌現 → 被兌現命中的敵人身上的裂傷立即結算（原傷害 × 比例）
  on('afterHit', c => {
    const u = c.tgt;
    if (u.side !== 'ally' || !c.o.dot || !u.alive) return;
    const lc = lcOn(u, 'noAnswer');
    if (!lc) return;
    const k = stackBuff(u, '受難', 4, 2, s => ({ dmgBonus: lc.v.pain / 100 * s }));
    log('buff', `金句《無人應答的禱告》：${u.name} 承受持續傷害 →【受難】${k} 層（增傷 +${Math.round(lc.v.pain * k)}%）`);
  }, 45);
  mod('cd', u => { const lc = lcOn(u, 'noAnswer'); return lc && u.hp < u.maxHp * 0.5 ? lc.v.cd / 100 : 0; }, 55);
  on('cashout', c => {
    const h = cashLc(c, 'noAnswer')[0], lc = h && lcOn(h, 'noAnswer', 'power');
    if (!lc) return;
    const ts = c.targets.filter(e => e.alive && e.lacer.length);
    if (!ts.length) return;
    log('info', `▶ 金句《無人應答的禱告》［迴響的空堂］：兌現命中的敵人身上的裂傷立即結算（原傷害 ${Math.round(lc.v.echo)}%）`, '', { kind: 'cast', src: h.id });
    ts.forEach(e => lacerDamage(e, lc.v.echo / 100, '·迴響'));
  }, 36);

  // 開場：列出妙具套裝與金句
  on('battleStart', () => {
    const sets = allies().filter(a => a.base.sets.length).map(a => `${a.name}：${a.base.sets.map(s => Relics.SETS[s.slice(0, -1)].name + s.slice(-1) + '件').join('、')}`);
    if (sets.length) log('info', '妙具套裝 — ' + sets.join('；'));
    allies().forEach(a => {
      if (!a.base.lc) return;
      const q = Quotes.LIST[a.base.lc.id];
      const L = a.base.lc, on = [L.active ? `性相【${q.skill}】` : '', L.pactive ? `權能【${q.pskill}】` : ''].filter(Boolean);
      log('info', `${a.name} 裝備金句《${q.name}》疊影 ${L.rank} 階：${on.length ? on.join('、') + ' 生效' : '性相與權能皆不符，技能未生效'}`);
    });
  }, 50);

  /* =========================================================
   * 敵人 AI（依類型）
   * ========================================================= */
  function enemyHit(e, t, mult) { dealDamage(e, t, { mult, elem: 'phys', canCrit: false, label: '攻擊' }); }
  const ENEMY_AI = {
    thug(e, t) { enemyHit(e, t, 1.0); },
    binder(e, t) {
      enemyHit(e, t, 0.9);
      if (t.alive && Math.random() < 0.65 * (1 - t.base.effRes)) applyControl(t, 'stun', e);
    },
    guard(e, t) {
      if (e.turns % 2 === 1) {
        log('info', `${e.name} 架起防線`, '', { kind: 'cast', src: e.id });
        enemies().forEach(x => addShield(e, x, 0.08 * e.maxHp, 'max', 2));
      } else enemyHit(e, t, 0.8);
    },
    medic(e, t) {
      const hurt = enemies().filter(x => x.hp / x.maxHp < 0.7).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) heal(e, hurt, 0.15 * hurt.maxHp);
      else enemyHit(e, t, 0.6);
    },
    boss(e, t, al) {
      if (e.turns % 3 === 0) {
        log('info', `${e.name} 發動 全體攻擊`, '', { kind: 'cast', src: e.id });
        al.forEach(a => enemyHit(e, a, 1.5));
      } else enemyHit(e, t, 1.2);
    },
  };
  function enemyAct(e) {
    e.turns += 1;
    const al = allies();
    if (!al.length) return;
    // 被選為目標的權重：一般為 1，［斂藏］等效果會降低（全部都是 1 時與等機率抽選完全相同）
    const w = al.map(a => Math.max(0.05, 1 - buffSum(a, 'aggroDown'))), sum = w.reduce((x, y) => x + y, 0);
    let r = Math.random() * sum, t = al[al.length - 1];
    for (let i = 0; i < al.length; i++) { if (r < w[i]) { t = al[i]; break; } r -= w[i]; }
    const og = alive('otg');
    if (og && S.duel && S.duel.id === e.id) t = og;   // 生死角力：嘲諷
    (ENEMY_AI[e.type] || ENEMY_AI.thug)(e, t, al);
  }

  /* =========================================================
   * 首領：自律處刑官・「雷霆-09型」（type: raiden）
   *   我方身上的「通緝」層數存在 u.wanted。
   *   常規：奇數回合【警棍制止】、偶數回合【合理執法】；每第 3 回合與轉入二階段時施放終結技【全面通緝】。
   *   緝捕行動：回合結束（或終結技後）若我方有人通緝 ≥ 6，立刻進入額外回合，對層數最高者施放強化攻擊
   *            （6～8 層【電棍制伏】、≥ 9 層【強制執行】）。緝捕的額外回合結束時不會再連鎖觸發。
   *   良民守則：我方在自己的回合沒有直接傷害首領 → 回合結束時通緝 −2；
   *            單體增援技能（戰技以隊友為目標）把目標的 2 層通緝轉到施放者身上，O.T.G. 的嘲諷則從通緝最高的隊友身上轉 2 層。
   * ========================================================= */
  const raidens = () => enemies().filter(e => e.type === 'raiden');
  function addWanted(a, n, why) {
    if (!a || !a.alive || n === 0) return;
    const before = a.wanted || 0;
    a.wanted = Math.max(0, before + n);
    if (a.wanted === before) return;
    log('buff', `${a.name} 的「通緝」${n > 0 ? '+' : '−'}${Math.abs(n)}${why ? '（' + why + '）' : ''}：${before} → ${a.wanted}`, '', { kind: 'wanted', tgt: a.id, n });
  }
  /** 緝捕對象：通緝最高（同層數時攻擊力最高）且 ≥ 6 */
  function chaseTarget() {
    const list = allies().filter(a => (a.wanted || 0) >= 6);
    if (!list.length) return null;
    return list.reduce((a, b) => (b.wanted > a.wanted || (b.wanted === a.wanted && getAtk(b, null) > getAtk(a, null)) ? b : a));
  }
  function chaseCheck(e) {
    if (!e.alive || S.extraQueue.some(q => q.id === e.id)) return;
    const t = chaseTarget();
    if (!t) return;
    e.chase = t.id;
    S.extraQueue.push({ id: e.id });
    log('info', `▶ ${e.name}【緝捕行動】：${t.name} 的通緝達 ${t.wanted} 層 → 立即進入額外回合`, '', { kind: 'cast', src: e.id, tgt: t.id });
  }
  /** 首領的攻擊；二階段的傷害降低 20% */
  function raidenHit(e, t, mult, label, o) {
    const m = e.phase2 ? mult * 0.8 : mult;
    return dealDamage(e, t, Object.assign({ mult: m, elem: 'thunder', canCrit: false, label }, o || {}, e.phase2 ? { note: ((o && o.note) || `倍率 ${pct(mult)}`) + ' × 80%（二階段）' } : {}));
  }
  function raidenUlt(e) {
    const al = allies();
    if (!al.length) return;
    log('info', `✦ ${e.name} 施放終結技【全面通緝】`, '', { kind: 'eult', src: e.id, key: 'raiden' });
    al.forEach(a => raidenHit(e, a, 1.4, '全面通緝'));
    const live = allies();
    if (!live.length) return;
    const main = live.reduce((a, b) => ((b.wanted || 0) > (a.wanted || 0) ? b : a));
    live.forEach(a => addWanted(a, a === main ? 5 : 3, '全面通緝'));
    chaseCheck(e);
  }
  /** 緝捕行動的強化攻擊 */
  function raidenChase(e) {
    let t = U(e.chase);
    e.chase = null;
    if (!t || !t.alive || (t.wanted || 0) < 6) t = chaseTarget();
    if (!t) { log('info', `${e.name} 的緝捕對象已不在通緝名單上`); return; }
    const w = t.wanted;
    if (w >= 9) {
      const hadShield = t.shield > 0;
      log('info', `▶ ${e.name}【重罪處決：強制執行】→ ${t.name}（通緝 ${w} 層）`, '', { kind: 'cast', src: e.id, tgt: t.id });
      raidenHit(e, t, 2.5 + 0.15 * w, '重罪處決：強制執行', { note: `倍率 250% + 通緝 ${w} 層 × 15%` });
      if (t.alive) { t.wanted = 0; log('buff', `${t.name} 的「通緝」清零`, '', { kind: 'wanted', tgt: t.id, n: -w }); }
      if (!t.alive || (hadShield && t.shield <= 0)) {
        addBuff(e, { name: '執法權限', dur: 2, stats: { atkPct: 0.20 } });
        log('buff', `${e.name}：${t.alive ? '擊破護盾' : '目標無法戰鬥'} → 攻擊力 +20%（2 回合），行動提前 30%`);
        advance(e, 0.30);
      }
    } else {
      log('info', `▶ ${e.name}【輕罪鎮壓：電棍制伏】→ ${t.name}（通緝 ${w} 層）`, '', { kind: 'cast', src: e.id, tgt: t.id });
      raidenHit(e, t, 1.6, '輕罪鎮壓：電棍制伏');
      if (t.alive) {
        if (Math.random() < 0.5 * (1 - (t.base.effRes || 0))) { delay(t, 0.25); log('buff', `${t.name} 陷入［麻痺］（行動延後 25%）`, '', { kind: 'stun', tgt: t.id }); }
        else log('buff', `${t.name} 抵抗了［麻痺］`);
        addWanted(t, -6, '電棍制伏');
      }
    }
  }
  ENEMY_AI.raiden = (e, t) => {
    if (S.currentExtra && e.chase) { e.turns -= 1; return raidenChase(e); }   // 緝捕行動的額外回合不計回合數
    if (e.ultNext) { e.ultNext = false; if (S.currentExtra) e.turns -= 1; return raidenUlt(e); }   // 轉階段的額外回合不計回合數
    if (e.turns % 3 === 0) return raidenUlt(e);
    const w0 = t.wanted || 0;
    if (e.turns % 2 === 1) {
      log('info', `${e.name}【警棍制止】→ ${t.name}`, '', { kind: 'cast', src: e.id });
      raidenHit(e, t, 1.0, '警棍制止');
      addWanted(t, 1, '警棍制止');
    } else {
      log('info', `${e.name}【合理執法】→ ${t.name}${w0 >= 4 ? '（通緝 ≥ 4：無視 15% 防禦）' : ''}`, '', { kind: 'cast', src: e.id });
      raidenHit(e, t, 1.5, '合理執法', w0 >= 4 ? { defIgnore: 0.15 } : {});
      addWanted(t, 3, '合理執法');
    }
    if (!S.currentExtra) chaseCheck(e);
  };
  // 入場：【全員盤查】
  on('waveStart', () => raidens().forEach(e => {
    if (e.entered) return;
    e.entered = true;
    const al = allies();
    if (!al.length) return;
    log('info', `${e.name} 入場【全員盤查】`, '', { kind: 'cast', src: e.id });
    al.forEach(a => addWanted(a, 1, '全員盤查'));
    const top = al.reduce((a, b) => (getAtk(b, null) > getAtk(a, null) ? b : a));
    addWanted(top, 2, '全員盤查：攻擊力最高');
  }), 30);
  // 轉階段：生命值降到 50% 以下 → 進入二階段，立即以額外回合施放終結技；同時觸發「敵人轉階段」
  on('afterHit', c => {
    const e = c.tgt;
    if (e.type !== 'raiden' || c.killed || e.phase2 || e.hp > e.maxHp * 0.5) return;
    e.phase2 = true;
    log('wave', `━━ ${e.name} 進入二階段 ━━`, '', { kind: 'phase', src: e.id, n: 2 });
    phaseCleanse(e);
    emit('enemyPhase', { u: e });
    e.ultNext = true; e.chase = null;
    if (!S.extraQueue.some(q => q.id === e.id)) S.extraQueue.push({ id: e.id });
  }, 60);
  /** 轉階段：清除身上所有常規負面效果（減益狀態、裂傷、血破、悲悼、禁錮）。
   *  角色機制的標記（管中窺豹／現行犯、樣本、記錄）與生死角力不算常規負面效果，保留。生命值不變。 */
  function phaseCleanse(e) {
    const bad = e.buffs.filter(isBadBuff), parts = [];
    if (bad.length) parts.push(bad.map(b => b.name).join('、'));
    if (e.lacer.length) parts.push(`裂傷×${e.lacer.length}`);
    if (e.bloodBreak) parts.push(`血破×${e.bloodBreak}`);
    if (e.mourn && e.mourn.length) parts.push(`悲悼×${e.mourn.length}`);
    if (e.stunned) parts.push('禁錮');
    e.buffs = e.buffs.filter(b => !isBadBuff(b)); e.lacer = []; e.bloodBreak = 0; e.mourn = []; e.stunned = false;
    log('buff', parts.length ? `${e.name} 轉階段：清除所有負面效果（${parts.join('、')}）` : `${e.name} 轉階段：身上沒有負面效果可清除`, '', parts.length ? { kind: 'cleanse', tgt: e.id } : undefined);
  }
  // 敵人轉階段：時間織機清空並執行任務、股市回到均衡
  on('enemyPhase', c => { loomPurge('敵人轉階段'); marketReset('敵人轉階段'); }, 10);
  // 良民守則
  on('turnStart', c => { if (c.u.side === 'ally') c.u.hitBoss = false; }, 2);
  on('afterHit', c => { if (c.att.side === 'ally' && c.tgt.type === 'raiden' && !c.o.dot) c.att.hitBoss = true; }, 61);
  on('turnEnd', c => {
    const u = c.u;
    if (u.side !== 'ally' || !raidens().length || !u.alive || u.hitBoss || !(u.wanted > 0)) return;
    addWanted(u, -Math.min(2, u.wanted), '良民守則：本回合沒有攻擊首領');
  }, 20);
  on('afterAction', c => {
    const u = c.u;
    if (c.kind !== 'skill' || !raidens().length || !u.alive) return;
    let from = null;
    if (CHARS[u.key].skillTarget === 'ally') from = allyTarget();
    else if (u.key === 'otg') { const o = allies().filter(a => a !== u && a.wanted > 0); from = o.length ? o.reduce((a, b) => (b.wanted > a.wanted ? b : a)) : null; }
    if (!from || from === u || !(from.wanted > 0)) return;
    const n = Math.min(2, from.wanted);
    from.wanted -= n; u.wanted = (u.wanted || 0) + n;
    log('buff', `良民守則：${from.name} 的 ${n} 層「通緝」轉移到 ${u.name}（${from.wanted} ／ ${u.wanted}）`, '', { kind: 'wanted', tgt: u.id, n });
  }, 15);

  /* ---------- 回合流程 ---------- */
  function startTurn(u, extra) {
    S.turnNo += 1;
    S.current = u.id;
    S.currentExtra = extra;
    u.ownTurns = (u.ownTurns || 0) + 1;
    log('turn', `${extra ? '【額外回合】' : ''}${u.name} 的回合`, '', { kind: 'turn', src: u.id });
    if (u.side === 'timer') { flowEnd(); S.current = null; return; }   // 星流計時器
    if (u.side === 'enemy') {
      if (!extra) emit('dotTick', { u });   // 額外回合（雷霆-09 的緝捕行動）不結算持續傷害
      if (checkEnd()) return;
      if (!u.alive) { S.current = null; return; }
      if (u.broken) { u.broken = false; u.tough = u.maxTough; log('buff', `${u.name} 韌性恢復`); }
      if (S.rules.enemyAttack) enemyAct(u);
      else log('info', `${u.name} 沒有行動（木樁模式）`);
      if (checkEnd()) return;
      emit('enemyAction', { u });
      resolveFollowUps();
      if (checkEnd()) return;
      endTurn(u);
    } else {
      if (u.stunned) {
        u.stunned = false;
        log('info', `${u.name} 處於禁錮狀態，跳過回合`);
        endTurn(u);
        return;
      }
      emit('turnStart', { u, extra });
      if (checkEnd()) return;
      if (!u.alive) { S.current = null; return; }   // 回合開始時被自身的持續傷害擊倒（O.T.G.）
      S.phase = 'input';
    }
  }

  function endTurn(u) {
    emit('turnEnd', { u });
    const cont = u.skipTick; u.skipTick = false;   // 「施放後不結束回合」的技能：狀態回合數留到同一回合真正結束時再扣
    if (!cont) {
      u.buffs.forEach(b => { if (b.dur < 900) b.dur--; });
      u.buffs = u.buffs.filter(b => b.dur > 0);
    }
    if (u.shield > 0 && !cont) {
      u.shieldDur -= 1;
      if (u.shieldDur <= 0) { u.shield = 0; log('buff', `${u.name} 的護盾消失`); }
    }
    if (!S.currentExtra) { u.av = 10000 / getSpd(u); u.spdCache = getSpd(u); }
    if (u.pendingAdv) { u.av = Math.max(0, u.av - u.pendingAdv * 10000 / getSpd(u)); u.pendingAdv = 0; }
    S.current = null;
    syncSpeeds();
  }

  function runUntilInput() {
    let guard = 0;
    S.phase = 'running';
    while (S.phase === 'running' && guard++ < 100000) {
      if (checkEnd()) return;
      if (S.extraQueue.length) {
        const q = S.extraQueue.shift();
        const u = U(q.id);
        if (u && u.alive) startTurn(u, true);
        continue;
      }
      syncSpeeds();
      const list = S.units.filter(u => u.alive);
      const next = list.reduce((a, b) => (b.av < a.av - 1e-9 ? b : a));
      const d = next.av;
      list.forEach(u => { u.av -= d; });
      S.time += d;
      if (cycle() >= S.rules.maxCycles) { S.phase = 'timeout'; log('sys', `⏱ 已達 ${S.rules.maxCycles} 輪上限，戰鬥結束`); return; }
      startTurn(next, false);
      // 敵人回合結束後的「空檔」：讓介面有機會插入預約好的終結技
      if (interrupts && next.side === 'enemy' && S.phase === 'running' && allies().length) { S.phase = 'between'; return; }
    }
  }
  let interrupts = false;

  /* ---------- 建立戰鬥 / 波次 ---------- */
  function parseWeak(s) {
    return String(s || '').split(/[,，、\s]+/).map(x => ELEM_KEY[x.trim()] || x.trim()).filter(x => ELEM_NAME[x]);
  }
  function mkEnemy(c, w, j) {
    return {
      id: `w${w}e${j}`, side: 'enemy', type: ENEMY_TYPES[c.type] ? c.type : 'thug', name: c.name || `敵人 ${j + 1}`,
      base: { lvl: +c.lvl, atk: +c.atk, spd: +c.spd, effRes: c.effRes / 100 },
      weak: parseWeak(c.weak), maxTough: +c.tough || 30, tough: +c.tough || 30, broken: false,
      maxHp: +c.hp, hp: +c.hp, shield: 0, shieldDur: 0, turns: 0,
      av: 10000 / c.spd, spdCache: +c.spd, alive: true, buffs: [], pendingAdv: 0,
      lacer: [], bloodBreak: 0, record: 0, peek: false, suspect: false, flagrant: false, sample: false, mourn: [],
    };
  }
  function spawnWave(i) {
    S.wave = i;
    S.units = S.units.filter(u => u.side === 'ally' || u.side === 'timer');
    S.waves[i].forEach((c, j) => S.units.push(mkEnemy(c, i, j)));
    S.target = null;
    log('wave', `━━ 第 ${i + 1} / ${S.waves.length} 波 ━━`, '', { kind: 'wave' });
    emit('waveStart', { wave: i });
    syncSpeeds();
    enemyTarget();
  }

  function newBattle(cfg) {
    history = [];
    events = [];
    const groups = {};
    cfg.enemies.forEach(c => { const w = Math.max(1, Math.floor(+c.wave || 1)); (groups[w] = groups[w] || []).push(c); });
    const waves = Object.keys(groups).map(Number).sort((a, b) => a - b).map(k => groups[k]);
    S = {
      rules: JSON.parse(JSON.stringify(cfg.rules)),
      units: [], sp: 3, spMax: 5, time: 0, extraQueue: [], followQueue: [], phase: 'running',
      current: null, currentExtra: false, turnNo: 0, log: [], stats: {},
      proxy: null, target: null, allyTarget: null, a2Turn: -1, waves, wave: 0, escort: null, model: null, duel: null,
    };
    const seen = new Set();
    cfg.team.forEach(key => {
      if (!key || !CHARS[key] || seen.has(key)) return;
      seen.add(key);
      const c = cfg.chars[key];
      const base = Relics.compute(key, c, (cfg.build || {})[key] || { useRelics: false });
      const u = {
        id: 'a_' + key, side: 'ally', key, name: CHARS[key].name, elem: CHARS[key].elem, base,
        maxHp: base.hp, hp: base.hp, maxEnergy: +c.maxEnergy, energy: c.maxEnergy * c.startEnergy / 100,
        shield: 0, shieldDur: 0, stunned: false,
        av: 0, alive: true, buffs: [], pendingAdv: 0, mark: null, tacit: 0, clues: 0, cover: 0, siren: 0, ticks: 0, exp: 0, lacer: [], suffer: 0, wanted: 0,
      };
      S.units.push(u);
    });
    // 時間織機：隊伍中有平衡權能角色時才存在；股市屬於戈登的天賦
    const hasGordon = !!findKey('gordon');
    S.loom = S.units.some(u => CHARS[u.key].power === '平衡') ? { tasks: [], charge: 0, market: 0, hist: [0], gordon: hasGordon, profit: hasGordon } : null;
    // 兌現匣：隊伍中有本質權能角色時才存在
    S.cashbox = S.units.some(essenceAlly) && cashOn() ? { items: [], count: 0 } : null;
    // 星流：隊伍中有情感權能角色時才存在
    S.flow = S.units.some(emotionAlly) ? { v: 0, ext: null, pend: 0 } : null;
    S.units.forEach(u => { u.av = 10000 / getSpd(u); u.spdCache = getSpd(u); });
    log('sys', '⚔ 戰鬥開始');
    spawnWave(0);
    emit('battleStart', {});
    allyTarget();
    runUntilInput();
    return S;
  }

  /* ---------- 行動 ---------- */
  function pushHistory() {
    history.push(JSON.stringify(S));
    if (history.length > 80) history.shift();
  }
  let previewing = false;   // 預覽模式：行動結算完就停，不推進到下一個回合

  function doAct(kind, opt) {
    const u = U(S.current);
    if (S.phase !== 'input' || !u) return false;
    if (kind === 'skill' && !canSkillFor(u)) return false;
    S.phase = 'running';
    const enh = (u.key === 'kane' && kaneEnhanced()) || (u.key === 'alan' && u.cover > 0) || (u.key === 'otg' && !!S.duel);
    const name = kind === 'skill' ? '戰技·' + CHARS[u.key].actions.skill
      : (enh ? '強化普攻·' + CHARS[u.key].actions.enhanced : '普攻·' + CHARS[u.key].actions.basic);
    log('act', `${u.name} 使用 ${name}`, '', { kind: 'cast', src: u.id });
    emit('beforeAction', { u, kind });
    SKILLS[u.key][kind](u, opt);
    emit('afterAction', { u, kind });
    resolveFollowUps();
    if (checkEnd()) return true;
    endTurn(u);
    if (!previewing) runUntilInput();
    return true;
  }
  function doUlt(id) {
    const u = U(id);
    const back = S.phase;   // 我方回合（input）或敵人回合之間的空檔（between）都可以施放
    if ((back !== 'input' && back !== 'between') || !u || !u.alive || u.energy < u.maxEnergy - 1e-9) return false;
    S.phase = 'running';
    if (ULT_PAY[u.key]) ULT_PAY[u.key](u); else u.energy = 0;
    log('ult', `✦ ${u.name} 施放終結技【${CHARS[u.key].actions.ult}】`, '', { kind: 'ult', src: u.id });
    emit('beforeAction', { u, kind: 'ult' });
    SKILLS[u.key].ult(u);
    gainEnergy(u, 5);
    emit('afterAction', { u, kind: 'ult' });
    resolveFollowUps();
    syncSpeeds();
    if (checkEnd()) return true;
    S.phase = back;
    return true;
  }
  /** 主動啟動時間織機：充能 ≥ 100% 時可用，和終結技一樣不佔回合 */
  function doLoom() {
    const L = S.loom, back = S.phase;
    if (!L || L.charge < 1 - 1e-9 || (back !== 'input' && back !== 'between')) return false;
    S.phase = 'running';
    runLoom('主動啟動');
    resolveFollowUps();
    syncSpeeds();
    if (checkEnd()) return true;
    S.phase = back;
    return true;
  }

  /* ---------- 自動戰鬥 AI（簡易） ---------- */
  function breakTarget(elem) {
    const es = enemies();
    const c = es.filter(e => !e.broken && e.weak.includes(elem)).sort((a, b) => a.tough - b.tough)[0];
    return c || highestHp(es);
  }
  /**
   * 自動戰鬥：現在是否值得啟動時間織機（讓寒夜、戈登吃滿織機的增益，而不是一充滿就啟動）
   *   寒夜：要投入度量拿額外回合時先不啟動（織機裡要留一張度量）；湊到 4 份任務一次執行 → 遞推 +5 刻度；
   *         輪到寒夜且織機已滿或已有 2 張度量 → 先啟動，度量層數會讓接下來獲得的刻度變多
   *   戈登：有套現／抄底／對沖／熔斷 → 充能夠就執行；漲跌任務累積 2 張以上再一起推股市；漲停／跌停時配合《千百倍槓桿》回點
   *   其他情況：織機已滿才啟動，避免之後的任務投不進去
   */
  function loomWorth(u) {
    const L = S.loom;
    if (!L || L.charge < 1 - 1e-9 || !L.tasks.length) return false;
    const n = L.tasks.length, used = L.tasks.filter(x => !TASK_FREE.has(x.kind)).length, full = used >= loomCap();
    const h = alive('hanye'), g = alive('gordon');
    if (h && h.energy >= h.maxEnergy - 1e-9 && L.tasks.some(x => x.kind === 'measure')) return false;   // 先讓終結技轉成測度，避免啟動織機先消耗度量
    if (h && u && u.id === h.id && !full && !u.inRecurExtra && L.tasks.some(x => x.kind === 'measure')) return false;   // 先普攻拿額外回合
    if (g && L.tasks.some(x => TASK_FREE.has(x.kind) && x.kind !== 'gauge')) return true;
    if (h && n >= 4 && !h.recurBonus) return true;
    if (h && u && u.id === h.id && (full || L.tasks.filter(x => x.kind === 'measure').length >= 2)) return true;
    if (g && Math.abs(L.market) === 3 && allies().some(a => lcOn(a, 'leverage', 'power'))) return true;
    if (g && L.tasks.filter(x => ['up', 'down', 'long', 'short'].includes(x.kind)).length >= 2) return true;
    if (g && L.market !== 0 && L.tasks.some(x => x.kind === 'long' || x.kind === 'short')) return true;   // 做多／做空：順勢再推一格
    return full;
  }
  function autoStep() {
    if (!S || S.phase !== 'input') return;
    pushHistory();
    if (loomWorth(U(S.current))) doLoom();   // 先啟動織機：度量層數會讓寒夜終結技的刻度變多
    for (let guard = 0; guard < 10 && S.phase === 'input'; guard++) {
      const a = allies().find(x => {
        if (x.energy < x.maxEnergy - 1e-9) return false;
        if (x.key !== 'hanye' || S.current !== x.id || hasBuff(x, '構築')) return true;
        const L = S.loom;
        return !L || L.tasks.some(t => t.kind === 'measure') || L.tasks.filter(t => !TASK_FREE.has(t.kind)).length >= loomCap();
      });
      if (!a) break;
      if (a.key === 'kane') { const f = enemies().find(e => e.flagrant); S.target = (f || highestHp(enemies())).id; }
      else if (a.key === 'alan') S.target = breakTarget('fire').id;
      else if (a.key === 'alexandra' || a.key === 'hanye') S.target = highestHp(enemies()).id;
      doUlt(a.id);
    }
    if (S.phase === 'input' && loomWorth(U(S.current))) doLoom();
    if (S.phase !== 'input') return;
    const u = U(S.current);
    const es = enemies();
    let kind = 'basic', opt;
    if (u.key === 'kane') {
      const pk = es.find(e => e.peek);
      if (kaneEnhanced()) kind = 'basic';
      else if (canSkillFor(u)) { kind = 'skill'; S.target = (pk || highestHp(es)).id; }   // 對管中窺豹施放 → 現行犯
      else S.target = (pk || highestHp(es)).id;
    } else if (u.key === 'longzhao') {
      S.target = highestHp(es).id;
      if (S.rules.infiniteSP || S.sp >= 3) kind = 'skill';
    } else if (u.key === 'mocha') {
      const p = S.proxy ? U(S.proxy) : null;
      S.target = highestHp(es).id;
      if ((!p || !p.alive) && canSkillFor(u)) {
        kind = 'skill';
        const k = alive('kane');
        S.allyTarget = (k || allies()[0]).id;
      }
    } else if (u.key === 'alan') {
      S.target = breakTarget('fire').id;
      if (u.cover === 0 && canSkillFor(u) && allies().some(a => a.shield < 500)) kind = 'skill';
    } else if (u.key === 'gordon') {
      // 順著股市的方向推到漲停／跌停（換取熔斷與套現或抄底），只投入「還差幾格」的張數；
      // 熔斷中或任務已排夠時，仍投入 1 張當作充能，讓織機能再次啟動執行常駐任務（套現／抄底／熔斷／對沖）
      S.target = highestHp(es).id;
      const L = S.loom;
      if (L && canSkillFor(u)) {
        const locked = L.tasks.some(x => x.kind === 'fuse');
        const room = loomCap() - L.tasks.filter(x => !TASK_FREE.has(x.kind)).length - (alive('hanye') ? 1 : 0);   // 和寒夜同隊時留一格給度量
        const dir = L.market < 0 ? 'down' : 'up', sign = dir === 'up' ? 1 : -1;
        const queued = L.tasks.filter(x => x.kind === dir || x.kind === (dir === 'up' ? 'long' : 'short')).length;
        const need = locked ? 0 : 3 - sign * L.market - queued;
        // 織機裡有值得執行的任務（常駐任務、做多／做空）但充能不夠啟動；至少留 1 點戰技點給隊友
        const fuel = L.charge < 1 - 1e-9 && L.tasks.some(x => ['cash', 'bottom', 'hedge', 'fuse', 'long', 'short'].includes(x.kind)) && (S.rules.infiniteSP || S.sp >= 2);
        const chargeNeed = Math.max(0, Math.ceil((1 - L.charge - 1e-9) / 0.5));   // 還要幾張才能啟動織機
        if (room > 0 && (need > 0 || fuel)) {
          let n = Math.max(1, Math.min(3, Math.max(need, need > 0 ? chargeNeed : 1), room));
          while (n > 1 && !S.rules.infiniteSP && S.sp - (1 + 2 * (n - 1)) < 1) n--;   // 多投的張數要留 1 點戰技點給隊友
          kind = 'skill'; opt = { dir, n };
        }
      }
    } else if (u.key === 'alexandra') {
      // 護航專車給攻擊力最高的隊友；普攻優先打帶有負面效果的敵人（可多拿鳴笛）
      const deb = es.filter(e => debuffCount(e) > 0);
      S.target = highestHp(deb.length ? deb : es).id;
      const mates = allies().filter(a => a.id !== u.id && a.key !== 'mocha');
      const best = mates.length ? mates.reduce((a, b) => (getAtk(b, null) > getAtk(a, null) ? b : a)) : u;
      if (canSkillFor(u) && (!escortHolder() || S.escort !== best.id || S.rules.infiniteSP || S.sp >= 4)) { kind = 'skill'; S.allyTarget = best.id; }
    } else if (u.key === 'mark') {
      // 沒有榜樣時，把攻擊力最高的隊友設為榜樣；之後普攻累積經驗（普攻也會附帶榜樣屬性的傷害）
      S.target = highestHp(es).id;
      const mates = allies().filter(a => a.id !== u.id && a.key !== 'mocha');
      const best = mates.length ? mates.reduce((a, b) => (getAtk(b, null) > getAtk(a, null) ? b : a)) : u;
      if (canSkillFor(u) && (!modelUnit() || (S.model !== best.id && S.sp >= 3))) { kind = 'skill'; S.allyTarget = best.id; }
    } else if (u.key === 'otg') {
      // 沒有生死角力時，對生命值上限最高的敵人施放戰技；角力中普攻（強化）打角力對象
      const f = S.duel && U(S.duel.id);
      if (f && f.alive) S.target = f.id;
      else if (canSkillFor(u)) { kind = 'skill'; S.target = es.reduce((a, b) => (b.maxHp > a.maxHp ? b : a)).id; }
      else S.target = highestHp(es).id;
    } else if (u.key === 'miller') {
      // 戰技打生命值最高的敵人（罌粟推「長」）；戰技點不夠時普攻補悲悼
      const few = es.filter(e => e.mourn.length < 3);
      S.target = highestHp(few.length ? few : es).id;
      if (canSkillFor(u) && (S.rules.infiniteSP || S.sp >= 2)) { kind = 'skill'; S.target = highestHp(es).id; }
    } else if (u.key === 'hanye') {
      // 能拿額外回合時先普攻（織機裡已有度量或測度、還有空位、不在天賦的額外回合中）；
      // 沒有遞推時先累積到 24 段：刻度同時提升暴率，避免低段戰技頻繁清空刻度；單敵瀕死則提前收尾
      const smp = es.find(e => e.sample);
      S.target = (smp || highestHp(es)).id;
      const L = S.loom, room = L ? loomCap() - L.tasks.filter(x => !TASK_FREE.has(x.kind)).length : 0;
      const canExtra = L && room > 0 && !u.inRecurExtra && L.tasks.some(x => x.kind === 'measure' || x.kind === 'gauge');
      const segs = 3 + u.ticks + (u.recurBonus ? 5 : 0);
      const finish = es.length === 1 && segs >= 6 && es[0].hp < getAtk(u, es[0]) * segs * 0.12;
      if (canSkillFor(u) && (finish || (!canExtra && (u.recurBonus || segs >= 24)))) kind = 'skill';
    }
    doAct(kind, opt);
  }

  function forecast(n, V) {
    const real = S;
    S = Object.assign({}, S, V);   // 播放快照／預覽依各自的星流環境推算，不改動真實狀態。
    try { return forecastUnits(n, V); } finally { S = real; }
  }
  function forecastUnits(n, V) {
    const res = [];
    (V.extraQueue || []).forEach(q => res.push({ id: q.id, extra: true, at: 0 }));
    const sim = [];
    V.units.forEach(u => {
      if (!u.alive) return;
      const full = 10000 / getSpd(u);
      if (u.id === V.current) {
        const av = V.currentExtra ? u.av : full;
        sim.push({ id: u.id, av: Math.max(0, av - u.pendingAdv * full), full, once: u.side === 'timer' });
      } else sim.push({ id: u.id, av: u.av, full, once: u.side === 'timer' });
    });
    let acc = 0;
    while (res.length < n && sim.length) {
      let f = sim[0];
      sim.forEach(x => { if (x.av < f.av - 1e-9) f = x; });
      const d = f.av; acc += d;
      sim.forEach(x => { x.av -= d; });
      res.push({ id: f.id, at: acc });
      if (f.once) {
        sim.splice(sim.indexOf(f), 1);
        S = Object.assign({}, S, { flow: S.flow ? Object.assign({}, S.flow, { ext: null }) : null });
        sim.forEach(x => {
          const u = V.units.find(u => u.id === x.id), full = 10000 / getSpd(u);
          x.av *= full / x.full; x.full = full;
        });
      }
      else f.av = f.full;
    }
    return res;
  }

  /**
   * 行動預覽：在戰鬥狀態的複本上試算一次行動，回傳行動後的行動軸與各單位變化，
   * 真正的戰鬥狀態、紀錄、撤銷歷史完全不受影響。
   * action：'basic' | 'skill' | { ult: 角色 id }；target / allyTarget 可指定試算用的目標。
   */
  function preview(action, opt) {
    if (!S || (S.phase !== 'input' && S.phase !== 'between')) return null;
    opt = opt || {};
    const real = S, realEvents = events, rnd = Math.random;
    let out = null;
    try {
      const log0 = real.log;
      real.log = [];   // 戰鬥紀錄可能很長，不需要複製
      try { S = JSON.parse(JSON.stringify(real)); } finally { real.log = log0; }
      S.rules.critMode = 'expected';   // 預覽一律用期望值，結果才穩定
      events = [];
      previewing = true;
      let seed = 1;
      Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      if (opt.target) S.target = opt.target;
      if (opt.allyTarget) S.allyTarget = opt.allyTarget;
      const actor = action && action.ult ? action.ult : S.current;
      const ok = action && action.ult ? doUlt(action.ult) : doAct(action);
      if (!ok) return null;
      const before = new Map(real.units.map(u => [u.id, u]));
      out = {
        actor,
        forecast: forecast(12, S),
        ended: ['win', 'lose', 'timeout'].includes(S.phase),
        waveCleared: S.wave !== real.wave,
        units: S.units.filter(u => before.has(u.id)).map(u => {
          const b = before.get(u.id);
          return { id: u.id, hp: u.hp, maxHp: u.maxHp, shield: u.shield, alive: u.alive, dmg: Math.max(0, b.hp - u.hp) + Math.max(0, b.shield - u.shield),
            broken: !!u.broken && !b.broken, killed: b.alive && !u.alive, tough: u.tough, maxTough: u.maxTough, toughLoss: Math.max(0, (b.tough || 0) - (u.tough || 0)) };
        }),
      };
    } finally {
      S = real; events = realEvents; previewing = false; Math.random = rnd;
    }
    return out;
  }

  return {
    CHARS, ENEMY_TYPES, DEFAULT_CONFIG, FLOW_ENV,
    newBattle,
    state: () => S,
    drainEvents() { const e = events; events = []; return e; },
    act(kind, opt) { if (!S || S.phase !== 'input') return false; pushHistory(); if (!doAct(kind, opt)) { history.pop(); return false; } return true; },
    /** 主動啟動時間織機 */
    loom() { if (!S || (S.phase !== 'input' && S.phase !== 'between')) return false; pushHistory(); if (!doLoom()) { history.pop(); return false; } return true; },
    canLoom: () => !!S && !!S.loom && S.loom.charge >= 1 - 1e-9 && (S.phase === 'input' || S.phase === 'between'),
    loomCap: () => (S && S.loom ? loomCap() : 0),
    STAGES, TASK_NAME, TASK_FREE,
    flowState: () => (S ? flowState() : null),
    otgEnhanced: st => !!(st && st.duel),
    /** 兌現匣的形制／裝填／原型兌現表，以及排序（介面與權能頁使用） */
    CASH: { FORM: CASH_FORM, LOAD: CASH_LOAD, PROTO: CASH_PROTO, RESIDUE, CAP: CASH_CAP }, rankElems,
    marketFx: () => (S ? marketFx() : null),
    ult(id) { if (!S || (S.phase !== 'input' && S.phase !== 'between')) return false; pushHistory(); if (!doUlt(id)) { history.pop(); return false; } return true; },
    /** 空檔結束，繼續推進到下一個空檔或我方回合 */
    proceed() { if (S && S.phase === 'between') runUntilInput(); },
    setInterrupts(v) { interrupts = !!v; },
    canUlt(id) { const u = S && U(id); return !!u && u.alive && u.side === 'ally' && u.energy >= u.maxEnergy - 1e-9; },
    undo() { if (history.length) { S = JSON.parse(history.pop()); if (!S.followQueue) S.followQueue = []; events = []; } },
    /** 存檔用：匯出目前戰鬥（戰鬥紀錄只保留最後 600 筆，不含撤銷歷史） */
    exportState() {
      if (!S) return null;
      const c = JSON.parse(JSON.stringify(S));
      if (c.log.length > 600) {
        const removed = c.log.length - 600;
        c.log = c.log.slice(-600);
        c.log.forEach(l => {
          if (l.syncTo == null) return;
          if (l.syncTo < removed) delete l.syncTo;
          else l.syncTo -= removed;
        });
      }
      return c;
    },
    importState(st) {
      if (!st || !Array.isArray(st.units) || !st.rules) return false;
      S = st; history = []; events = [];
      if (!S.followQueue) S.followQueue = [];   // 舊版存檔沒有追擊佇列
      if (!('loom' in S)) S.loom = null;          // 舊版存檔沒有時間織機
      if (!('cashbox' in S)) S.cashbox = null;    // 舊版存檔沒有兌現匣
      if (!('flow' in S)) S.flow = null;          // 舊版存檔沒有星流
      if (!('duel' in S)) S.duel = null;
      ensureFlowTimer();
      syncSpeeds();
      S.units.forEach(u => { if (u.side === 'enemy' && !u.mourn) u.mourn = []; if (!u.lacer && u.side === 'ally') u.lacer = []; });
      return true;
    },
    canUndo: () => history.length > 0,
    canSkill: () => !!S && S.current && canSkillFor(U(S.current)),
    /** 長按角色時顯示的即時數值 */
    liveStats(id) {
      const u = S && U(id);
      if (!u) return null;
      if (u.side === 'ally') {
        return {
          side: 'ally', atk: getAtk(u, null), hp: u.hp, maxHp: u.maxHp, def: u.base.def, spd: getSpd(u),
          cr: getCR(u), cd: getCD(u), dmgBonus: u.base.dmgBonus + buffSum(u, 'dmgBonus'), be: getBE(u), breakEff: getBreakEff(u),
          ehr: u.base.ehr, effRes: u.base.effRes, err: u.base.err + modAdd(0, 'err', u), dmgTakenRed: buffSum(u, 'dmgTakenRed') + (flowEnv()?.takenRed || 0), defIgnore: buffSum(u, 'defIgnore'),
          energy: u.energy, maxEnergy: u.maxEnergy, av: u.av, shield: u.shield, shieldDur: u.shieldDur,
          sets: u.base.sets, lc: u.base.lc, traces: u.base.traces,
        };
      }
      const defRed = Math.min(1, buffSum(u, 'defRed'));
      return {
        side: 'enemy', atk: u.base.atk, hp: u.hp, maxHp: u.maxHp, spd: getSpd(u), def: (200 + 10 * u.base.lvl) * (1 - defRed), defRed,
        dmgDealtRed: buffSum(u, 'dmgDealtRed'), weak: u.weak, resNonWeak: S.rules.resNonWeak / 100, effRes: u.base.effRes,
        tough: u.tough, maxTough: u.maxTough, broken: u.broken, av: u.av, shield: u.shield, lvl: u.base.lvl, type: u.type,
      };
    },
    kaneEnhanced: units => units.some(e => e.side === 'enemy' && e.alive && e.flagrant),
    debuffCount: e => (S ? debuffCount(e) : 0),
    autoStep,
    forecast,
    preview,
    /** 目前登記的鉤子（除錯用） */
    hooks: () => Object.fromEntries(Object.entries(HOOKS).map(([k, v]) => [k, v.length])),
    setTarget(id) { if (S) S.target = id; },
    setAllyTarget(id) { if (S) S.allyTarget = id; },
    getAtk: (u, t) => getAtk(u, t), getSpd: u => getSpd(u), getCR: u => getCR(u), getCD: u => getCD(u), getBE: u => getBE(u),
    cycle: () => cycle() + 1,
    fmt, pct,
  };
})();
