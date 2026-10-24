'use strict';
/* =========================================================
 * 時序之戰 — 玩家資料與養成系統
 * 妙具背包／裝備、金句裝備、經緯（行跡）、體力、副本、抽卡、動作紀錄。
 * 實際寫入由 save.js（SaveSys）負責；這裡的 save() 只會通知存檔系統。
 * ========================================================= */

const Meta = (() => {
  const LEGACY_KEY = 'shixu_save_v1';   // 舊版存檔位置（只用於轉移）
  const ACTIVITY_MAX = 3000;
  const STAMINA_MAX = 240;
  const STAMINA_MS = 6 * 60 * 1000;   // 每 6 分鐘回復 1 點
  const PULL_COST = 160;
  const clone = o => JSON.parse(JSON.stringify(o));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- 經緯（行跡） ---------- */
  const TRACES = {
    kane:     { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'atkPct', v: 28 }, { stat: 'cr', v: 12 }, { stat: 'hpPct', v: 10 }] },
    longzhao: { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'atkPct', v: 28 }, { stat: 'ehr', v: 18 }, { stat: 'spd', v: 5 }] },
    mocha:    { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'hpPct', v: 18 }, { stat: 'spd', v: 9 }, { stat: 'effRes', v: 10 }] },
    alan:     { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'atkPct', v: 28 }, { stat: 'defPct', v: 22.5 }, { stat: 'hpPct', v: 10 }] },
    gordon:   { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'atkPct', v: 18 }, { stat: 'spd', v: 9 }, { stat: 'cr', v: 6.7 }] },
    alexandra: { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'atkPct', v: 18 }, { stat: 'spd', v: 9 }, { stat: 'hpPct', v: 10 }] },
    mark:     { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'atkPct', v: 18 }, { stat: 'cr', v: 9.3 }, { stat: 'err', v: 8 }] },
    hanye:    { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'atkPct', v: 28 }, { stat: 'cd', v: 24 }, { stat: 'defPct', v: 12.5 }] },
    otg:      { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'atkPct', v: 28 }, { stat: 'ehr', v: 18 }, { stat: 'hpPct', v: 10 }] },
    miller:   { skills: '普攻 Lv.6 · 戰技 Lv.10 · 終結技 Lv.10 · 天賦 Lv.10', nodes: [{ stat: 'hpPct', v: 28 }, { stat: 'ehr', v: 18 }, { stat: 'spd', v: 5 }] },
  };

  /* ---------- 副本 ---------- */
  const E = (wave, type, name, hp, atk, spd, tough, weak, lvl) => ({ wave, type, name, hp, atk, spd, lvl: lvl || 80, tough, weak, effRes: 20 });
  const DUNGEONS = [
    { id: 'casino', name: '第九街地下賭場', kind: 'relic', sets: ['ironfist', 'detective'], cost: 40,
      desc: '賭場深處的保險櫃裡，據說藏著偵探與打手都想要的東西。',
      enemies: [E(1, 'thug', '看場打手', 50000, 900, 100, 30, '物理,冰'), E(1, 'binder', '荷官', 60000, 950, 110, 40, '火,物理'), E(1, 'thug', '看場打手', 50000, 900, 100, 30, '物理,冰'),
        E(2, 'boss', '賭場老闆', 220000, 1300, 115, 140, '物理,火', 82), E(2, 'guard', '金庫保鑣', 90000, 1000, 95, 90, '冰,火', 82)] },
    { id: 'agency', name: '莫卡兄弟代理事務所', kind: 'relic', sets: ['contract', 'ledger'], cost: 40,
      desc: '堆滿未簽合約的事務所，帳簿上的數字每天都不一樣。',
      enemies: [E(1, 'medic', '會計', 55000, 800, 105, 40, '冰,火'), E(1, 'thug', '催收員', 50000, 900, 100, 30, '物理,冰'),
        E(2, 'guard', '法務保鑣', 100000, 1000, 95, 90, '冰,物理', 82), E(2, 'boss', '甲方代表', 200000, 1300, 118, 140, '冰,火', 82)] },
    { id: 'range', name: '焦土靶場', kind: 'relic', sets: ['scorch', 'detective'], cost: 40,
      desc: '阿蘭常去的廢棄靶場。靶子會反擊。',
      enemies: [E(1, 'guard', '裝甲靶機', 80000, 900, 90, 90, '火,物理'), E(1, 'binder', '電擊靶機', 60000, 950, 110, 40, '火'),
        E(2, 'boss', '移動砲台', 240000, 1350, 110, 160, '火,冰', 82)] },
    { id: 'neon', name: '霓虹迴廊', kind: 'planar', sets: ['neon', 'auction'], cost: 40,
      desc: '不夜街的後巷，拍賣槌與霓虹燈一起閃爍。',
      enemies: [E(1, 'thug', '街頭混混', 50000, 900, 105, 30, '物理,冰'), E(1, 'medic', '地下醫生', 55000, 800, 110, 40, '物理,火'), E(1, 'thug', '街頭混混', 50000, 900, 105, 30, '物理,冰'),
        E(2, 'boss', '拍賣師', 230000, 1300, 120, 140, '物理,冰', 82)] },
    { id: 'site', name: '鋼骨工地', kind: 'planar', sets: ['steel', 'tower'], cost: 40,
      desc: '蓋了一半的契約之塔，鋼骨之間迴盪著簽約的回音。',
      enemies: [E(1, 'guard', '工地保全', 90000, 950, 95, 90, '冰,火'), E(1, 'binder', '吊車操作員', 60000, 950, 105, 40, '物理,冰'),
        E(2, 'boss', '工頭', 240000, 1350, 112, 160, '火,物理', 82), E(2, 'guard', '工地保全', 90000, 950, 95, 90, '冰,火', 82)] },
    { id: 'tomorrow', name: '明日公司・廢棄治安站', kind: 'relic', sets: ['detective', 'contract'], cost: 40,
      desc: '舊市政治安承包部留下的巡邏站。站裡的處刑官還在執勤，而且從來沒有結過任何一件案子。',
      enemies: [E(1, 'thug', '巡邏無人機 A', 45000, 900, 102, 30, '雷,冰'), E(1, 'binder', '電擊捕獲網', 55000, 950, 108, 40, '雷,物理'), E(1, 'thug', '巡邏無人機 B', 45000, 900, 102, 30, '雷,冰'),
        E(2, 'raiden', '自律處刑官・「雷霆-09型」', 260000, 1150, 108, 160, '冰,風', 82)] },
  ];

  /* ---------- 抽卡 ---------- */
  const BANNERS = {
    char: { name: '角色活動躍遷「真相只有一個」', type: 'char', up5: { kind: 'char', id: 'kane' },
      up4: [{ kind: 'char', id: 'longzhao' }, { kind: 'char', id: 'alan' }],
      std5: [{ kind: 'char', id: 'mocha' }], rate5: 0.006, soft: 74, hard: 90, win: 0.5 },
    lc: { name: '金句活動躍遷「罪證確鑿」', type: 'lc', up5: { kind: 'lc', id: 'irrefutable' },
      up4: [{ kind: 'lc', id: 'ninthRule' }, { kind: 'lc', id: 'clause7' }, { kind: 'lc', id: 'lastCover' }],
      std5: [{ kind: 'lc', id: 'leverage' }, { kind: 'lc', id: 'greenWave' }, { kind: 'lc', id: 'noAnswer' }], rate5: 0.008, soft: 66, hard: 80, win: 0.75 },
  };
  const POOL4 = [{ kind: 'char', id: 'longzhao' }, { kind: 'char', id: 'alan' },
    { kind: 'lc', id: 'ninthRule' }, { kind: 'lc', id: 'clause7' }, { kind: 'lc', id: 'lastCover' },
    ...['internNotes', 'uniqueSolution', 'bouquetForYou', 'fieldExam', 'trafficControl', 'scratchPaper', 'rainyRequiem'].map(id => ({ kind: 'lc', id }))];
  const POOL3 = ['firstClue', 'blankCheck', 'smallTalk', 'silentGold', 'trafficLight', 'domain', 'obituary'].map(id => ({ kind: 'lc', id }));

  // 專屬金句：存檔裡還沒有時送一把，並在角色沒有裝備金句時替他裝上
  const SIGNATURE = { gordon: 'leverage', alexandra: 'greenWave', mark: 'internNotes', hanye: 'uniqueSolution', miller: 'bouquetForYou', otg: 'noAnswer' };

  /* ---------- 存檔 ---------- */
  let S = null;
  function fresh() {
    let id = 1;
    const inv = [], equip = {};
    Object.entries(Relics.DEFAULTS).forEach(([k, lo]) => {
      equip[k] = {};
      Object.entries(lo).forEach(([slot, it]) => {
        const item = Object.assign(clone(it), { id: id++, slot });
        inv.push(item);
        equip[k][slot] = item.id;
      });
    });
    const traces = {};
    Object.keys(TRACES).forEach(k => { traces[k] = { a1: true, a2: true, a3: true, nodes: TRACES[k].nodes.map(() => true) }; });
    return {
      v: 1, nextId: id, inv, equip, traces,
      lc: { kane: { id: 'irrefutable', rank: 1 }, longzhao: { id: 'ninthRule', rank: 1 }, mocha: { id: 'clause7', rank: 1 }, alan: { id: 'lastCover', rank: 1 }, gordon: { id: 'leverage', rank: 1 } },
      crystals: 3000, stamina: STAMINA_MAX, staminaTs: Date.now(), shards: 8000,
      gacha: { char: { pity5: 0, pity4: 0, guar: false }, lc: { pity5: 0, pity4: 0, guar: false }, history: [] },
      owned: { chars: { kane: 1, longzhao: 1, mocha: 1, alan: 1, gordon: 1, alexandra: 1, hanye: 1, mark: 1, miller: 1 }, lcs: { irrefutable: 1, ninthRule: 1, clause7: 1, lastCover: 1, leverage: 1 } },
      drops: [], activity: [], createdAt: Date.now(),
    };
  }
  let onSave = null;
  /** 載入玩家資料（null = 開新遊戲） */
  function init(data) {
    S = data && data.v === 1 ? data : fresh();
    if (!Array.isArray(S.activity)) S.activity = [];
    if (!Array.isArray(S.drops)) S.drops = [];
    if (!S.createdAt) S.createdAt = Date.now();
    migrateNewChars();
    S.inv.forEach(it => { if (it.main === 'imagDmg') it.main = 'luckDmg'; });   // 戈登改為運屬性：舊的虛數增傷位面球一併轉換
    S.inv.forEach(it => Relics.migrateItem(it));   // 擊破特攻已失效：舊妙具的擊破特攻詞條改為攻擊力%
  }
  /** 新角色加入時，舊存檔自動取得該角色與其預設妙具、經緯 */
  function migrateNewChars() {
    Object.keys(Relics.DEFAULTS).forEach(k => {
      if (S.owned.chars[k]) return;
      S.owned.chars[k] = 1;
      S.equip[k] = S.equip[k] || {};
      Object.entries(Relics.DEFAULTS[k]).forEach(([slot, it]) => {
        const item = Object.assign(clone(it), { id: S.nextId++, slot });
        S.inv.push(item);
        S.equip[k][slot] = item.id;
      });
      if (TRACES[k] && !S.traces[k]) S.traces[k] = { a1: true, a2: true, a3: true, nodes: TRACES[k].nodes.map(() => true) };
    });
    // 新角色的專屬金句：舊存檔還沒有時送一把並裝備（該角色沒裝備其他金句時）
    Object.entries(SIGNATURE).forEach(([k, id]) => {
      if (S.owned.lcs[id]) return;
      S.owned.lcs[id] = 1;
      if (!S.lc[k]) S.lc[k] = { id, rank: 1 };
    });
  }
  function legacy() {
    try { const s = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); return s && s.v === 1 ? s : null; } catch (e) { return null; }
  }
  function save() { if (onSave) onSave(); }
  /** 動作紀錄：type = gacha / dungeon / upgrade / salvage / equip / quote / trace / battle / system */
  function record(type, text) {
    S.activity.unshift({ t: Date.now(), type, text });
    if (S.activity.length > ACTIVITY_MAX) S.activity.length = ACTIVITY_MAX;
    save();
  }
  const itemName = it => `${Relics.SETS[it.set] ? Relics.SETS[it.set].name : '妙具'}・${Relics.SLOT_NAME[it.slot]}（${Relics.STAT_LABEL[it.main]}）`;
  init(null);

  function tickStamina() {
    const n = Math.floor((Date.now() - S.staminaTs) / STAMINA_MS);
    if (n > 0) { S.stamina = Math.min(STAMINA_MAX, S.stamina + n); S.staminaTs += n * STAMINA_MS; }
    if (S.stamina >= STAMINA_MAX) S.staminaTs = Date.now();
  }
  function staminaEta() { return S.stamina >= STAMINA_MAX ? 0 : STAMINA_MS - (Date.now() - S.staminaTs); }

  /* ---------- 妙具 ---------- */
  const item = id => S.inv.find(i => i.id === id);
  function owner(id) { return Object.keys(S.equip).find(k => Object.values(S.equip[k] || {}).includes(id)) || null; }
  function loadout(key) {
    const o = {};
    Relics.SLOTS.forEach(s => { const id = (S.equip[key] || {})[s.key]; o[s.key] = id ? item(id) || null : null; });
    return o;
  }
  function equipItem(key, id) {
    const it = item(id); if (!it) return;
    const from = owner(id);
    Object.keys(S.equip).forEach(k => { if (S.equip[k][it.slot] === id) delete S.equip[k][it.slot]; });
    (S.equip[key] = S.equip[key] || {})[it.slot] = id;
    record('equip', `${CHARS[key].name} 裝備 ${itemName(it)} +${it.level}${from && from !== key ? `（從 ${CHARS[from].name} 身上取下）` : ''}`);
  }
  function unequip(key, slot) {
    const id = S.equip[key] && S.equip[key][slot];
    if (!id) return;
    delete S.equip[key][slot];
    record('equip', `${CHARS[key].name} 卸下 ${itemName(item(id))}`);
  }
  /** 強化 n 級，回傳每級的結果訊息；晶體不足時中止 */
  function upgrade(id, n) {
    const it = item(id); const notes = [];
    const from = it.level;
    let spent = 0;
    for (let i = 0; i < n && it.level < 15; i++) {
      const cost = Relics.upgradeCost(it.level);
      if (S.crystals < cost) { notes.push('妙具經驗不足'); break; }
      S.crystals -= cost; spent += cost;
      const r = Relics.levelUp(it);
      notes.push(`+${it.level}${r ? '：' + r : ''}`);
    }
    if (it.level > from) {
      const gains = notes.filter(x => x.includes('：')).map(x => x.split('：')[1]);
      record('upgrade', `強化 ${itemName(it)} +${from} → +${it.level}，消耗妙具經驗 ${spent}${gains.length ? '（' + gains.join('、') + '）' : ''}`);
    } else save();
    return notes;
  }
  function salvage(id) {
    const it = item(id); if (!it) return 0;
    Object.keys(S.equip).forEach(k => { if (S.equip[k][it.slot] === id) delete S.equip[k][it.slot]; });
    S.inv = S.inv.filter(i => i.id !== id);
    const v = Relics.salvageValue(it);
    S.crystals += v;
    record('salvage', `分解 ${itemName(it)} +${it.level}，獲得妙具經驗 ${v}`);
    return v;
  }
  function addItem(it) { it.id = S.nextId++; S.inv.push(it); return it; }

  /* ---------- 戰鬥用配置 ---------- */
  function optsFor(key, cfg) {
    const tr = S.traces[key] || { a1: true, a2: true, a3: true, nodes: [] };
    return {
      loadout: loadout(key), useRelics: cfg.rules.useRelics !== false,
      lc: S.lc[key] || null,
      nodes: (TRACES[key] ? TRACES[key].nodes : []).filter((_, i) => tr.nodes[i] !== false),
      traces: { a1: tr.a1 !== false, a2: tr.a2 !== false, a3: tr.a3 !== false },
    };
  }
  function build(cfg) { const o = {}; Object.keys(CHARS).forEach(k => { o[k] = optsFor(k, cfg); }); return o; }
  function panel(key, cfg, override) {
    const b = Relics.compute(key, cfg.chars[key], Object.assign(optsFor(key, cfg), override || {}));
    return {
      atk: b.baseAtk * (1 + b.atkPct) + b.atkFlat, hp: b.hp, def: b.def,
      spd: b.spdBase * (1 + b.spdPct) + b.spdFlat, cr: b.cr, cd: b.cd, dmgBonus: b.dmgBonus,
      ehr: b.ehr, effRes: b.effRes, be: b.be, err: b.err, sets: b.sets, lc: b.lc,
    };
  }

  /* ---------- 副本 ---------- */
  function runDungeon(did) {
    tickStamina();
    const d = DUNGEONS.find(x => x.id === did);
    if (!d) return { error: '找不到副本' };
    if (S.stamina < d.cost) return { error: `體力不足（需要 ${d.cost}）` };
    S.stamina -= d.cost;
    if (S.stamina < STAMINA_MAX && S.stamina + d.cost >= STAMINA_MAX) S.staminaTs = Date.now();
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    const items = [];
    for (let i = 0; i < n; i++) items.push(addItem(Relics.genItem(d.sets, d.kind)));
    const crystals = 300 + Math.floor(Math.random() * 3) * 100;
    S.crystals += crystals;
    S.drops = items.map(i => i.id).concat(S.drops).slice(0, 30);
    record('dungeon', `${d.name}：消耗體力 ${d.cost}，獲得 ${items.map(itemName).join('、')}，妙具經驗 +${crystals}`);
    return { items, crystals };
  }

  /* ---------- 抽卡 ---------- */
  function rollOne(b, st) {
    st.pity5 += 1; st.pity4 += 1;
    let p5 = b.rate5;
    if (st.pity5 >= b.soft) p5 += (st.pity5 - b.soft + 1) * 0.06;
    if (st.pity5 >= b.hard) p5 = 1;
    const r = Math.random();
    if (r < p5) {
      st.pity5 = 0; st.pity4 = 0;
      if (st.guar || !b.std5.length || Math.random() < b.win) { st.guar = false; return Object.assign({ rarity: 5, featured: true }, b.up5); }
      st.guar = true;
      return Object.assign({ rarity: 5, featured: false }, pick(b.std5));
    }
    if (r < p5 + 0.051 || st.pity4 >= 10) {
      st.pity4 = 0;
      const g = Math.random() < 0.5 ? pick(b.up4) : pick(POOL4);
      return Object.assign({ rarity: 4, featured: b.up4.some(x => x.id === g.id) }, g);
    }
    return Object.assign({ rarity: 3 }, pick(POOL3));
  }
  function pull(bk, n) {
    const b = BANNERS[bk];
    if (S.shards < PULL_COST * n) return { error: `時序碎片不足（需要 ${PULL_COST * n}）` };
    S.shards -= PULL_COST * n;
    const st = S.gacha[bk];
    const res = [];
    for (let i = 0; i < n; i++) {
      const g = rollOne(b, st);
      const bag = g.kind === 'char' ? S.owned.chars : S.owned.lcs;
      g.isNew = !bag[g.id];
      bag[g.id] = (bag[g.id] || 0) + 1;
      res.push(g);
      S.gacha.history.unshift({ t: Date.now(), banner: bk, kind: g.kind, id: g.id, rarity: g.rarity });
    }
    S.gacha.history = S.gacha.history.slice(0, 200);
    const hi = res.filter(g => g.rarity >= 4).map(g => `${g.rarity}★${nameOf(g)}`);
    record('gacha', `${b.name} 躍遷 ×${n}（−${PULL_COST * n} 碎片）：${hi.length ? hi.join('、') : '全部 3★'}${res.some(g => g.rarity === 3) && hi.length ? `，3★ ×${res.filter(g => g.rarity === 3).length}` : ''}`);
    return { res };
  }
  const nameOf = g => (g.kind === 'char' ? (CHARS[g.id].fullName || CHARS[g.id].name) : '《' + Quotes.LIST[g.id].name + '》');

  return {
    TRACES, DUNGEONS, BANNERS, PULL_COST, STAMINA_MAX,
    get: () => S, save, init, legacy, record, itemName, tickStamina, staminaEta,
    set onSave(fn) { onSave = fn; },
    item, owner, loadout, equipItem, unequip, upgrade, salvage,
    optsFor, build, panel, runDungeon, pull, nameOf,
  };
})();
