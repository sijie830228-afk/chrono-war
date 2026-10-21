// 寒夜終結技轉測度、米勒滿額悲悼與盛大告別的公開操作路徑驗證。
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function battle(key, { mourn = [], buffs = [], hp = 1e7, resist = 0 } = {}) {
  const math = Object.create(Math); math.random = () => 0.5;
  const ctx = vm.createContext({ console, Math: math, JSON, Object, Array, Number, String, Set, Map });
  ['relics', 'quotes', 'engine'].forEach(f => vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx));
  const { E, cfg } = vm.runInContext('({ E: Engine, cfg: JSON.parse(JSON.stringify(DEFAULT_CONFIG)) })', ctx);
  cfg.team = [key]; cfg.chars[key].cr = 0;
  cfg.chars[key].hp = 1000; cfg.chars[key].ehr = 0;
  Object.keys(cfg.rules).filter(k => /Technique$/.test(k)).forEach(k => cfg.rules[k] = false);
  Object.assign(cfg.rules, { critMode: 'expected', enemyAttack: false, cashbox: false });
  cfg.build = { [key]: { useRelics: false, traces: { a1: false, a2: false, a3: false } } };
  cfg.enemies = [0, 1, 2].map(i => ({ wave: 1, type: 'thug', name: '靶' + i, hp: 1e7, atk: 0, spd: 1, lvl: 80, tough: 30, weak: '空,哀', effRes: 0 }));
  E.newBattle(cfg);
  const s = JSON.parse(JSON.stringify(E.state()));
  const u = s.units.find(u => u.side === 'ally'), es = s.units.filter(u => u.side === 'enemy');
  s.phase = 'input'; s.current = u.id; s.currentExtra = false; s.time = 0; s.log = []; s.stats = {}; s.sp = 5;
  u.energy = u.maxEnergy; u.buffs = buffs; u.ticks = 0; u.hp = 500;
  es.forEach(e => { e.av = 1e6; e.buffs = []; });
  es[0].mourn = mourn.map(st => ({ st, first: true })); es[0].hp = hp; es[0].base.effRes = resist;
  s.target = es[0].id;
  E.importState(s); E.drainEvents();
  return { E, u: () => E.state().units.find(x => x.id === u.id), enemy: () => E.state().units.find(x => x.id === es[0].id) };
}
const measure = owner => ({ kind: 'measure', uses: 0, owner });
const hits = (E, name) => E.state().log.filter(l => l.type === 'dot' && l.text.includes('悲悼·' + name));
const srcDamage = (E, name) => Object.entries(E.state().stats.a_miller?.src || {}).filter(([k]) => k.startsWith('悲悼·' + name)).reduce((s, [,v]) => s + v, 0);

test('寒夜戰技保留度量，不再轉成測度', () => {
  const { E, u } = battle('hanye'); E.state().loom.tasks = [measure(u().id)];
  assert.equal(E.act('skill'), true);
  assert.equal(E.state().loom.tasks[0].kind, 'measure');
});
test('寒夜終結技只轉最先投入的一張度量，保留既有充能', () => {
  const { E, u } = battle('hanye'); const L = E.state().loom;
  L.tasks = [measure(u().id), measure(u().id)]; L.charge = 1;
  assert.equal(E.ult(u().id), true);
  assert.deepEqual(Array.from(L.tasks, t => t.kind), ['gauge', 'measure']);
  assert.equal(L.tasks[0].left, 3); assert.equal(L.charge, 1);
  assert.equal(E.loom(), true); assert.equal(u().spreadReady, true);
  assert.equal(L.tasks[0].left, 2);
  assert.equal(E.act('skill'), true);
  assert.ok(E.state().stats.a_hanye.src['測度·擴散'] > 0);
  assert.equal(u().spreadReady, false);
});
test('已有測度時，終結技併入度量並增加 3 次執行', () => {
  const { E, u } = battle('hanye'); const L = E.state().loom;
  L.tasks = [{ kind: 'gauge', uses: 0, left: 2, owner: u().id }, measure(u().id)];
  E.ult(u().id); assert.equal(L.tasks.length, 1); assert.equal(L.tasks[0].left, 5);
});
test('織機沒有度量時，終結技不憑空生成測度', () => {
  const { E, u } = battle('hanye'); E.ult(u().id); assert.equal(E.state().loom.tasks.length, 0);
});
test('寒夜可在敵人回合空檔用終結技轉測度', () => {
  const { E, u } = battle('hanye'); E.state().phase = 'between';
  E.state().loom.tasks = [measure(u().id)];
  assert.equal(E.ult(u().id), true); assert.equal(E.state().phase, 'between');
  assert.equal(E.state().loom.tasks[0].kind, 'gauge');
});
test('自動戰鬥在滿能量時先終結技轉換，再啟動織機', () => {
  const { E, u } = battle('hanye'); const L = E.state().loom;
  L.tasks = [measure(u().id), measure(u().id)]; L.charge = 1;
  E.autoStep();
  if (!E.state().log.some(l => l.text.includes('時間織機 啟動'))) E.autoStep();
  const log = E.state().log;
  const convert = log.findIndex(l => l.text.includes('轉化為［校準任務·測度］'));
  const loom = log.findIndex(l => l.text.includes('時間織機 啟動'));
  assert.ok(convert >= 0 && loom > convert);
});
test('悲悼剛達三個上限時只新增，不提前引爆', () => {
  const { E, enemy } = battle('miller', { mourn: [1, 2] }); E.act('basic');
  assert.equal(enemy().mourn.length, 3); assert.equal(hits(E, '滿額施加').length, 0);
});
test('悲悼滿額後補施加只觸發最高階段一次，保留全部階段及首次標記', () => {
  const { E, enemy, u } = battle('miller', { mourn: [1, 3, 2] });
  const before = JSON.stringify(enemy().mourn); E.act('basic');
  assert.equal(JSON.stringify(enemy().mourn), before);
  assert.equal(hits(E, '滿額施加').length, 1); assert.equal(srcDamage(E, '滿額施加'), 375);
  assert.equal(u().hp, 513.75); // 該次持續傷害仍觸發天賦治療。
  assert.ok(!E.state().log.some(l => l.text.includes('▶ 米勒【敬悼】')));
});
test('施加機率判定失敗時，不觸發滿額悲悼', () => {
  const { E, enemy } = battle('miller', { mourn: [1, 2, 3], resist: 1 }); E.act('basic');
  assert.equal(hits(E, '滿額施加').length, 0); assert.equal(enemy().mourn.length, 3);
});
test('陰雨連綿上限為四個，第五次成功施加才觸發', () => {
  const { E, enemy } = battle('miller', { mourn: [1, 2, 3], buffs: [{ name: '陰雨連綿', dur: 999, stats: {} }] });
  E.act('basic'); assert.equal(enemy().mourn.length, 4); assert.equal(hits(E, '滿額施加').length, 0);
  E.act('basic'); assert.equal(enemy().mourn.length, 4); assert.equal(hits(E, '滿額施加').length, 1);
});
test('盛大告別逐個觸發全部悲悼，並與滿額施加分別結算', () => {
  const { E, enemy } = battle('miller', { mourn: [1, 2, 3], buffs: [{ name: '盛大告別', dur: 999, stats: {} }] });
  const before = JSON.stringify(enemy().mourn); E.act('basic');
  assert.equal(hits(E, '盛大告別').length, 3); assert.equal(srcDamage(E, '盛大告別'), 900);
  assert.equal(hits(E, '滿額施加').length, 1); assert.equal(JSON.stringify(enemy().mourn), before);
});
test('盛大告別戰技對每個命中目標各自結算全部悲悼', () => {
  const { E } = battle('miller', { buffs: [{ name: '盛大告別', dur: 999, stats: {} }] });
  const es = E.state().units.filter(u => u.side === 'enemy');
  es.forEach((e, i) => { e.mourn = Array.from({ length: i + 1 }, () => ({ st: 1, first: true })); });
  E.setTarget(es[1].id); E.act('skill'); assert.equal(hits(E, '盛大告別').length, 6);
});
test('盛大告別終結技對全體逐個觸發，滿額目標另外觸發一次', () => {
  const { E, u } = battle('miller', { buffs: [{ name: '盛大告別', dur: 999, stats: {} }] });
  E.state().units.filter(x => x.side === 'enemy').forEach(e => { e.mourn = [1, 2, 3].map(st => ({ st, first: true })); });
  assert.equal(E.ult(u().id), true); assert.equal(hits(E, '盛大告別').length, 9);
  assert.equal(hits(E, '滿額施加').length, 3);
});
test('盛大告別擊殺後立即停止剩餘悲悼，沒有遞迴觸發', () => {
  const { E, enemy } = battle('miller', { mourn: [1, 2, 3], hp: 300, buffs: [{ name: '盛大告別', dur: 999, stats: {} }] });
  E.act('basic'); assert.equal(enemy().alive, false); assert.equal(hits(E, '盛大告別').length, 1);
  assert.equal(hits(E, '滿額施加').length, 0);
});
test('預覽可顯示新悲悼觸發而不改變真實狀態', () => {
  const { E } = battle('miller', { mourn: [1, 2, 3], buffs: [{ name: '盛大告別', dur: 999, stats: {} }] });
  const before = JSON.stringify(E.state()); assert.ok(E.preview('basic')); assert.equal(JSON.stringify(E.state()), before);
});
console.log(`全部 ${passed} 項機制驗證通過。`);
