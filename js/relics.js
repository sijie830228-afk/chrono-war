'use strict';
/* =========================================================
 * 時序之戰 — 妙具系統（物品、詞條、套裝、強化、面板計算）
 * 6 個欄位：頭部、手部、軀幹、腳部（隨身妙具，2/4 件套）＋ 位面球、連結繩（場域妙具，2 件套）
 * 物品皆為 5★，等級 0～15；主詞條隨等級成長，每 3 級新增副詞條或強化一條既有副詞條。
 * ========================================================= */

const Relics = (() => {
  const SLOTS = [
    { key: 'head',   name: '頭部',   kind: 'relic' },
    { key: 'hands',  name: '手部',   kind: 'relic' },
    { key: 'body',   name: '軀幹',   kind: 'relic' },
    { key: 'feet',   name: '腳部',   kind: 'relic' },
    { key: 'sphere', name: '位面球', kind: 'planar' },
    { key: 'rope',   name: '連結繩', kind: 'planar' },
  ];
  const SLOT_NAME = Object.fromEntries(SLOTS.map(s => [s.key, s.name]));
  const KIND_NAME = { relic: '隨身妙具', planar: '場域妙具' };

  const STAT_LABEL = {
    hpFlat: '生命', atkFlat: '攻擊力', defFlat: '防禦', hpPct: '生命%', atkPct: '攻擊%', defPct: '防禦%',
    spd: '速度', spdPct: '速度%', cr: '暴擊率', cd: '暴擊傷害', ehr: '效果命中', effRes: '效果抵抗',
    be: '攻擊%（舊・擊破特攻）', err: '能量恢復效率', physDmg: '物理增傷', iceDmg: '冰增傷', fireDmg: '火增傷', imagDmg: '虛數增傷', windDmg: '風增傷', spaceDmg: '空增傷', luckDmg: '運增傷',
    waterDmg: '水增傷', thunderDmg: '雷增傷', grassDmg: '草增傷', sorrowDmg: '哀增傷',
  };
  const FLAT = new Set(['hpFlat', 'atkFlat', 'defFlat', 'spd']);

  // 主詞條滿級（+15）數值
  const MAIN = {
    hpFlat: 705.6, atkFlat: 352.8, hpPct: 43.2, atkPct: 43.2, defPct: 54, cr: 32.4, cd: 64.8, ehr: 43.2,
    spd: 25, physDmg: 38.9, iceDmg: 38.9, fireDmg: 38.9, imagDmg: 38.9, windDmg: 38.9, spaceDmg: 38.9, luckDmg: 38.9, waterDmg: 38.9, thunderDmg: 38.9, grassDmg: 38.9, sorrowDmg: 38.9, err: 19.4,
  };
  const SLOT_MAIN = {
    head: ['hpFlat'],
    hands: ['atkFlat'],
    body: ['hpPct', 'atkPct', 'defPct', 'cr', 'cd', 'ehr'],
    feet: ['hpPct', 'atkPct', 'defPct', 'spd'],
    sphere: ['hpPct', 'atkPct', 'defPct', 'physDmg', 'fireDmg', 'waterDmg', 'iceDmg', 'windDmg', 'luckDmg', 'spaceDmg', 'sorrowDmg'],
    rope: ['hpPct', 'atkPct', 'defPct', 'err'],
  };
  // 副詞條單次數值
  const SUB = {
    hpFlat: 38.1, atkFlat: 19.05, defFlat: 19.05, hpPct: 3.89, atkPct: 3.89, defPct: 4.86,
    spd: 2.3, cr: 2.92, cd: 5.83, ehr: 3.89, effRes: 3.89,
  };

  // 範例套裝（2 件的靜態數值寫在 p2 / p4；條件效果在 engine.js 以 hasSet() 判斷）
  const SETS = {
    ironfist:  { kind: 'relic',  name: '第九街的鐵拳',   p2: { atkPct: 12 }, p2txt: '攻擊力提高 12%。',
      p4txt: '對身上有裂傷或血破的敵人造成的傷害提高 16%（含持續傷害）。' },
    detective: { kind: 'relic',  name: '偵探的放大鏡',   p2: { physDmg: 10 }, p2txt: '物理屬性傷害提高 10%。',
      p4txt: '追加攻擊造成的傷害提高 20%。施放終結技後，暴擊率提高 12%，持續 2 回合。' },
    contract:  { kind: 'relic',  name: '代理人的委任狀', p2: { spdPct: 6 }, p2txt: '速度提高 6%。',
      p4txt: '施放戰技後，使我方全體攻擊力提高 8%，持續 2 回合。' },
    scorch:    { kind: 'relic',  name: '焦土狙擊手',     p2: { atkPct: 12 }, p2txt: '攻擊力提高 12%。',
      p4: { atkPct: 12 }, p4txt: '攻擊力再提高 12%。穿戴者投入的餘料參與兌現匣的兌現後，攻擊力額外提高 15%，持續 2 回合。' },
    ledger:    { kind: 'relic',  name: '冰封的帳簿',     p2: { iceDmg: 10 }, p2txt: '冰屬性傷害提高 10%。',
      p4txt: '施放終結技時，使我方全體暴擊傷害提高 16%，持續 2 回合。' },
    neon:      { kind: 'planar', name: '霓虹不夜街', p2: { atkPct: 12 },
      p2txt: '攻擊力提高 12%。當速度大於等於 120 時，攻擊力額外提高 12%。' },
    auction:   { kind: 'planar', name: '地下拍賣行', p2: { cr: 8 },
      p2txt: '暴擊率提高 8%。當暴擊率大於等於 70% 時，普攻與戰技造成的傷害提高 20%。' },
    steel:     { kind: 'planar', name: '鋼骨防線',   p2: { atkPct: 12 },
      p2txt: '攻擊力提高 12%。提供的護盾量提高 10%。' },
    tower:     { kind: 'planar', name: '契約之塔',   p2: { err: 5 },
      p2txt: '能量恢復效率提高 5%。穿戴者在場時，我方全體攻擊力提高 8%（同名效果不疊加）。' },
  };

  /** 擊破特攻已失效：舊妙具的擊破特攻詞條改為攻擊力%（主詞條直接替換；副詞條與既有攻擊% 合併，主詞條就是攻擊% 時改為暴擊率） */
  function migrateItem(it) {
    if (!it) return it;
    if (it.main === 'be') it.main = 'atkPct';
    const subs = [];
    (it.subs || []).forEach(sb => {
      if (sb.stat !== 'be') { subs.push(sb); return; }
      const to = it.main === 'atkPct' ? 'cr' : 'atkPct', same = subs.find(x => x.stat === to) || (it.subs || []).find(x => x.stat === to && x !== sb);
      if (same) same.rolls = Math.min(6, (+same.rolls || 0) + (+sb.rolls || 0));
      else subs.push({ stat: to, rolls: sb.rolls });
    });
    it.subs = subs.filter((x, j) => subs.indexOf(x) === j);
    return it;
  }
  function P(set, main, subs) {
    return { set, main, level: 15, subs: subs.split(' ').map(s => { const [stat, r] = s.split(':'); return { stat, rolls: +r }; }) };
  }
  // 初始存檔附帶的範例配裝（皆為 +15）
  const DEFAULTS = {
    kane: {
      head:   P('detective', 'hpFlat',  'cr:2 cd:3 atkPct:2 spd:1'),
      hands:  P('detective', 'atkFlat', 'cr:1 cd:3 atkPct:3 hpPct:1'),
      body:   P('detective', 'cd',      'cr:2 atkPct:3 spd:2 atkFlat:1'),
      feet:   P('detective', 'atkPct',  'cr:1 cd:3 spd:2 hpFlat:2'),
      sphere: P('auction',   'physDmg', 'cr:1 cd:3 atkPct:3 defFlat:1'),
      rope:   P('auction',   'atkPct',  'cr:1 cd:3 spd:2 hpPct:2'),
    },
    longzhao: {
      head:   P('ironfist', 'hpFlat',  'atkPct:3 ehr:2 spd:1 cr:2'),
      hands:  P('ironfist', 'atkFlat', 'atkPct:3 ehr:2 spd:1 hpPct:2'),
      body:   P('ironfist', 'atkPct',  'ehr:3 spd:1 cr:2 defFlat:2'),
      feet:   P('ironfist', 'spd',     'atkPct:3 ehr:2 cr:2 hpFlat:1'),
      sphere: P('neon',     'physDmg', 'atkPct:3 spd:1 ehr:2 cd:2'),
      rope:   P('neon',     'atkPct',  'spd:2 ehr:2 cr:2 hpPct:2'),
    },
    mocha: {
      head:   P('contract', 'hpFlat',  'spd:3 hpPct:2 defPct:2 effRes:1'),
      hands:  P('contract', 'atkFlat', 'spd:3 atkPct:2 hpPct:2 effRes:1'),
      body:   P('contract', 'hpPct',   'spd:2 defPct:2 effRes:2 atkPct:2'),
      feet:   P('contract', 'spd',     'hpPct:2 defPct:2 effRes:2 atkPct:2'),
      sphere: P('tower',    'hpPct',   'spd:2 defPct:2 hpFlat:2 atkPct:2'),
      rope:   P('tower',    'err',     'spd:2 hpPct:2 defPct:2 effRes:2'),
    },
    alan: {
      head:   P('scorch', 'hpFlat',   'atkPct:3 spd:2 cr:2 defPct:1'),
      hands:  P('scorch', 'atkFlat',  'atkPct:3 spd:2 cr:2 hpPct:1'),
      body:   P('scorch', 'atkPct',   'cr:3 spd:2 defPct:2 effRes:1'),
      feet:   P('scorch', 'spd',      'atkPct:3 cr:2 defPct:2 hpPct:1'),
      sphere: P('steel',  'fireDmg',  'atkPct:3 spd:2 cr:2 hpFlat:1'),
      rope:   P('steel',  'atkPct',   'spd:3 cr:2 defPct:2 effRes:1'),
    },
    gordon: {
      head:   P('contract', 'hpFlat',  'spd:2 atkPct:3 cr:2 hpPct:1'),
      hands:  P('contract', 'atkFlat', 'spd:2 atkPct:3 cd:2 hpPct:1'),
      body:   P('contract', 'cr',      'spd:2 atkPct:3 cd:2 defPct:1'),
      feet:   P('contract', 'spd',     'atkPct:3 cr:2 cd:2 hpPct:1'),
      sphere: P('tower',    'luckDmg', 'spd:2 atkPct:3 cr:2 hpFlat:1'),
      rope:   P('tower',    'err',     'spd:3 atkPct:3 cd:1 hpPct:1'),
    },
    alexandra: {
      head:   P('contract', 'hpFlat',  'spd:3 atkPct:2 cr:2 cd:1'),
      hands:  P('contract', 'atkFlat', 'spd:2 atkPct:3 cd:2 hpPct:1'),
      body:   P('contract', 'atkPct',  'spd:3 cr:2 cd:2 defPct:1'),
      feet:   P('contract', 'spd',     'atkPct:3 cr:2 cd:2 hpPct:1'),
      sphere: P('tower',    'windDmg', 'spd:2 atkPct:3 cr:2 hpFlat:1'),
      rope:   P('tower',    'err',     'spd:3 atkPct:3 cd:1 hpPct:1'),
    },
    mark: {
      head:   P('detective', 'hpFlat',   'atkPct:3 cr:2 cd:2 spd:1'),
      hands:  P('detective', 'atkFlat',  'atkPct:3 cr:2 cd:2 spd:1'),
      body:   P('detective', 'cr',       'atkPct:3 cd:3 spd:1 hpPct:1'),
      feet:   P('detective', 'spd',      'atkPct:3 cr:2 cd:2 hpFlat:1'),
      sphere: P('tower',     'waterDmg', 'atkPct:3 cr:2 cd:2 spd:1'),
      rope:   P('tower',     'err',      'atkPct:3 cr:2 spd:2 hpPct:1'),
    },
    otg: {
      head:   P('ironfist', 'hpFlat',   'atkPct:3 ehr:2 spd:2 cr:1'),
      hands:  P('ironfist', 'atkFlat',  'atkPct:3 ehr:2 spd:1 hpPct:2'),
      body:   P('ironfist', 'atkPct',   'ehr:3 spd:2 hpPct:2 defFlat:1'),
      feet:   P('ironfist', 'atkPct',   'ehr:2 spd:2 hpPct:3 effRes:1'),
      sphere: P('neon',     'physDmg',  'atkPct:3 ehr:2 spd:2 hpFlat:1'),
      rope:   P('neon',     'atkPct',   'ehr:3 spd:2 hpPct:2 defPct:1'),
    },
    miller: {
      head:   P('ironfist', 'hpFlat',   'hpPct:3 ehr:3 defPct:1 effRes:1'),
      hands:  P('ironfist', 'atkFlat',  'hpPct:3 ehr:2 spd:1 effRes:2'),
      body:   P('ironfist', 'ehr',      'hpPct:4 defPct:2 hpFlat:1 effRes:1'),
      feet:   P('ironfist', 'spd',      'hpPct:3 ehr:3 defPct:1 effRes:1'),
      sphere: P('tower',    'sorrowDmg', 'hpPct:3 ehr:2 defPct:2 defFlat:1'),
      rope:   P('tower',    'hpPct',    'ehr:3 spd:1 defPct:2 hpFlat:2'),
    },
    hanye: {
      head:   P('ironfist', 'hpFlat',   'atkPct:3 cd:3 spd:1 cr:1'),
      hands:  P('ironfist', 'atkFlat',  'atkPct:3 cd:3 spd:1 hpPct:1'),
      body:   P('ironfist', 'cd',       'atkPct:3 cr:2 spd:2 defFlat:1'),
      feet:   P('ironfist', 'atkPct',   'cd:3 spd:2 cr:2 hpFlat:1'),
      sphere: P('auction',  'spaceDmg', 'atkPct:3 cd:3 spd:1 defFlat:1'),
      rope:   P('auction',  'atkPct',   'cd:3 spd:2 cr:2 hpPct:1'),
    },
  };

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  function mainValue(main, level) {
    const lv = level == null ? 15 : level;
    return MAIN[main] * (0.16 + 0.84 * lv / 15);
  }

  /** 副本掉落：隨機欄位、主詞條、3～4 條初始副詞條 */
  function genItem(sets, kind) {
    const slot = pick(SLOTS.filter(s => s.kind === kind)).key;
    const main = pick(SLOT_MAIN[slot]);
    const pool = Object.keys(SUB).filter(k => k !== main).sort(() => Math.random() - 0.5);
    const n = Math.random() < 0.2 ? 4 : 3;
    return { set: pick(sets), slot, main, level: 0, subs: pool.slice(0, n).map(stat => ({ stat, rolls: 1 })) };
  }
  /** 升 1 級；每到 3 的倍數：副詞條不足 4 條就新增，否則隨機強化一條 */
  function levelUp(item) {
    if (item.level >= 15) return null;
    item.level += 1;
    if (item.level % 3 !== 0) return '';
    if (item.subs.length < 4) {
      const pool = Object.keys(SUB).filter(k => k !== item.main && !item.subs.some(s => s.stat === k));
      const stat = pick(pool);
      item.subs.push({ stat, rolls: 1 });
      return `新增副詞條「${STAT_LABEL[stat]}」`;
    }
    const s = pick(item.subs);
    s.rolls += 1;
    return `「${STAT_LABEL[s.stat]}」強化 +1 次`;
  }
  const upgradeCost = level => 60 + 20 * level;   // 0 → 15 共 3000
  const salvageValue = item => 150 + 80 * (item.level || 0);

  /** 加總一組妙具的數值（loadout = { slot: item }），並回傳啟用中的套裝 */
  function sum(loadout) {
    const t = {};
    const add = (k, v) => { t[k] = (t[k] || 0) + v; };
    const counts = {};
    if (loadout) {
      SLOTS.forEach(s => {
        const p = migrateItem(loadout[s.key]);
        if (!p) return;
        if (p.main && SLOT_MAIN[s.key].includes(p.main)) add(p.main, mainValue(p.main, p.level));
        (p.subs || []).slice(0, 4).forEach(sb => {
          if (sb && SUB[sb.stat] && sb.stat !== p.main) add(sb.stat, SUB[sb.stat] * Math.max(0, Math.min(6, +sb.rolls || 0)));
        });
        if (p.set && SETS[p.set] && SETS[p.set].kind === s.kind) counts[p.set] = (counts[p.set] || 0) + 1;
      });
    }
    const sets = [];
    Object.entries(counts).forEach(([k, n]) => {
      const S = SETS[k];
      if (n >= 2) { sets.push(k + '2'); Object.entries(S.p2 || {}).forEach(([a, v]) => add(a, v)); }
      if (S.kind === 'relic' && n >= 4) { sets.push(k + '4'); Object.entries(S.p4 || {}).forEach(([a, v]) => add(a, v)); }
    });
    return { t, sets, counts };
  }

  /**
   * 角色本體 + 金句 + 經緯節點 + 妙具 → 戰鬥用數值
   * opts = { loadout, useRelics, lc: {id, rank}, nodes: [{stat, v}], traces: {a1,a2,a3} }
   */
  function compute(key, c, opts) {
    opts = opts || {};
    const { t, sets } = opts.useRelics === false ? { t: {}, sets: [] } : sum(opts.loadout);
    const add = (k, v) => { t[k] = (t[k] || 0) + v; };
    (opts.nodes || []).forEach(n => add(n.stat, n.v));
    const q = opts.lc && Quotes.LIST[opts.lc.id];
    const lcActive = !!q && q.path === CHARS[key].path;          // 性相層
    const lcPower = !!q && !!q.power && q.power === CHARS[key].power;   // 權能層
    if (lcActive) Object.entries(q.stat(opts.lc.rank || 1)).forEach(([k, v]) => add(k, v));
    if (lcPower && q.pstat) Object.entries(q.pstat(opts.lc.rank || 1)).forEach(([k, v]) => add(k, v));
    const g = k => t[k] || 0;
    const elem = CHARS[key].elem;
    return {
      lvl: +c.lvl,
      baseAtk: +c.baseAtk + (q ? q.atk : 0), atkPct: (+c.atkPct + g('atkPct')) / 100, atkFlat: g('atkFlat'),
      hp: (+c.hp + (q ? q.hp : 0)) * (1 + g('hpPct') / 100) + g('hpFlat'),
      def: (+c.def + (q ? q.def : 0)) * (1 + g('defPct') / 100) + g('defFlat'),
      spdBase: +c.spd, spdPct: g('spdPct') / 100, spdFlat: g('spd'),
      cr: (+c.cr + g('cr')) / 100, cd: (+c.cd + g('cd')) / 100,
      dmgBonus: (+c.dmgBonus + g(elem + 'Dmg')) / 100,
      ehr: (+c.ehr + g('ehr')) / 100, effRes: ((+c.effRes || 0) + g('effRes')) / 100,
      be: ((+c.be || 0) + g('be')) / 100, err: (+c.err + g('err')) / 100,
      sets,
      lc: q ? { id: opts.lc.id, rank: opts.lc.rank || 1, active: lcActive, pactive: lcPower } : null,
      traces: Object.assign({ a1: true, a2: true, a3: true }, opts.traces || {}),
    };
  }
  function fmtStat(k, v) { return FLAT.has(k) ? (k === 'spd' ? v.toFixed(1) : Math.round(v).toString()) : v.toFixed(1) + '%'; }

  return {
    SLOTS, SLOT_NAME, KIND_NAME, STAT_LABEL, MAIN, SLOT_MAIN, SUB, SETS, DEFAULTS, FLAT,
    mainValue, genItem, levelUp, upgradeCost, salvageValue, sum, compute, fmtStat, migrateItem,
  };
})();
