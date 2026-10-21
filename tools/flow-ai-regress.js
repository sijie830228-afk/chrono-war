'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..');
let count = 0;
function test(name, f) { f(); count++; console.log('✓ ' + name); }
function battle(key = 'miller') {
  const math = Object.create(Math); math.random = () => 0.5;
  const ctx = vm.createContext({ console, Math: math, JSON, Object, Array, Number, String, Set, Map });
  ['relics', 'quotes', 'engine'].forEach(f => vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx));
  const { E, cfg } = vm.runInContext('({E:Engine,cfg:JSON.parse(JSON.stringify(DEFAULT_CONFIG))})', ctx);
  cfg.team = [key]; cfg.chars[key].cr = 0; cfg.chars[key].hp = 1000;
  Object.keys(cfg.rules).filter(k => /Technique$/.test(k)).forEach(k => cfg.rules[k] = false);
  Object.assign(cfg.rules, { enemyAttack: false, cashbox: false, critMode: 'expected' });
  cfg.build = { [key]: { useRelics: false, traces: { a1: false, a2: false, a3: false } } };
  cfg.enemies = [{ wave: 1, type: 'thug', name: '靶', hp: 1e7, atk: 1000, spd: 100, lvl: 80, tough: 30, weak: '哀,空,喜,怒,樂', effRes: 0 }];
  E.newBattle(cfg); const s = E.state(), u = s.units[0], e = s.units[1];
  s.current = u.id; s.currentExtra = true; s.phase = 'input'; s.sp = 5; s.log = []; s.stats = {}; s.time = 0;
  u.av = 0; u.energy = 0; u.hp = 500; u.ticks = 0; e.av = 1e5;
  E.drainEvents(); return { E, u, e, cfg };
}
function activate(elem, side) {
  const b = battle(); b.u.elem = elem; b.E.state().flow.v = side === 'grow' ? 75 : -75;
  if (side === 'fade') b.e.hp = 1e6;
  b.E.act('skill'); b.e.buffs = []; b.E.drainEvents(); return b;
}
function expiry(b) {
  const s = b.E.state(); s.units.find(x => x.id === 'flowTimer').av = 0;
  s.flow.ext.endsAt = s.time; b.u.av = 100; s.currentExtra = false;
  b.E.act('basic');
}

test('喜·極長提供 15% 暴率，計時結束後撤除', () => {
  const b = activate('joy', 'grow'); assert.equal(b.E.getCR(b.u), 0.15); expiry(b); assert.equal(b.E.getCR(b.u), 0);
});
test('喜·極消提供 15% 減傷，結束後撤除', () => {
  const b = activate('joy', 'fade'); assert.equal(b.E.liveStats(b.u.id).dmgTakenRed, 0.15); expiry(b); assert.equal(b.E.liveStats(b.u.id).dmgTakenRed, 0);
});
test('怒·極長直接傷害實際提高 20%', () => {
  const normal = battle(); normal.E.act('basic');
  const b = activate('anger', 'grow'); b.u.elem = 'sorrow'; b.E.state().stats = {}; b.E.act('basic');
  assert.equal(b.E.state().stats.a_miller.src['普攻·收好，你的訃告'], 300);
});
test('怒·極消實際降低敵方傷害 20%', () => {
  function hurt(b) {
    const s = b.E.state(); s.rules.enemyAttack = true; s.units.find(x => x.side === 'enemy').av = 0;
    b.u.av = 100; s.currentExtra = false; b.E.act('basic');
    return Object.entries(s.stats).filter(([k]) => k.startsWith('w')).reduce((n,[,v]) => n + v.total, 0);
  }
  assert.ok(Math.abs(hurt(activate('anger', 'fade')) / hurt(battle()) - 0.8) < 1e-9);
});
test('哀·極長強化悲悼傷害；傷害與治療事件綁在一起', () => {
  const b = activate('sorrow', 'grow'); b.e.mourn = [{st:3,first:false},{st:1,first:false},{st:2,first:false}];
  b.E.state().stats = {}; b.E.state().log = []; b.E.act('basic');
  assert.equal(b.E.state().stats.a_miller.src['悲悼·滿額施加（第3階段）'], 468.75);
  const evs = b.E.drainEvents(), heal = evs.find(x => x.fx?.kind === 'heal');
  assert.ok(heal); assert.equal(evs.find(x => x.idx === heal.entry.syncTo).fx.kind, 'dot');
});
test('哀·極消減速敵人且治療提高 25%，不影響計時器速度', () => {
  const b = activate('sorrow', 'fade'); assert.equal(b.E.getSpd(b.e), 85);
  assert.equal(b.E.getSpd(b.E.state().units.find(x => x.side === 'timer')), 75);
  b.e.mourn = [{st:3,first:false},{st:1,first:false},{st:2,first:false},{st:1,first:false}];
  const hp = b.u.hp; b.E.act('basic'); assert.equal(b.u.hp - hp, 17.1875);
  expiry(b); assert.equal(b.E.getSpd(b.e), 100);
});
test('樂·極長增加我方速度 15%，結束後恢復', () => {
  const b = activate('mirth', 'grow'); assert.ok(Math.abs(b.E.getSpd(b.u) - 117.3) < 1e-8);
  expiry(b); assert.equal(b.E.getSpd(b.u), 102);
});
test('樂·極消增加能量恢復效率，實際回能及面板一致', () => {
  const b = activate('mirth', 'fade'); b.u.energy = 0; b.E.act('basic');
  assert.equal(b.u.energy, 23); assert.equal(b.E.liveStats(b.u.id).err, 1.15);
});
test('極端環境換波保留同一計時器及剩餘時間，新敵人仍受環境影響', () => {
  const b = activate('sorrow', 'fade'), s = b.E.state(), timer = s.units.find(x => x.side === 'timer');
  const remain = timer.av, ends = s.flow.ext.endsAt;
  s.waves.push([{...b.cfg.enemies[0], name:'下一波', hp:1e7}]); b.e.hp = 1;
  s.extraQueue = [{id:b.u.id}]; s.currentExtra = false;
  b.E.act('basic'); assert.equal(s.wave, 1);
  assert.equal(s.units.find(x => x.id === 'flowTimer'), timer); assert.equal(timer.av, remain);
  assert.equal(s.flow.ext.endsAt, ends); assert.equal(b.E.getSpd(s.units.find(x => x.side === 'enemy')), 85);
  expiry(b); assert.equal(s.flow.ext, null); assert.ok(!s.units.some(x => x.id === 'flowTimer'));
});
test('星流計時器在預測行動序列只出現一次', () => {
  const b = activate('sorrow', 'grow'); assert.equal(b.E.forecast(30,b.E.state()).filter(x => x.id === 'flowTimer').length, 1);
});
test('載入計時器遺失的存檔能按剩餘期限補回', () => {
  const b = activate('sorrow', 'grow'), s = JSON.parse(JSON.stringify(b.E.state()));
  s.time += 20; s.units = s.units.filter(x => x.id !== 'flowTimer'); b.E.importState(s);
  assert.ok(Math.abs(s.units.find(x => x.id === 'flowTimer').av - (s.flow.ext.endsAt - s.time)) < 1e-9);
});
test('載入舊版沒有期限的極端星流會補回可結束的計時器', () => {
  const b = activate('sorrow', 'grow'), s = JSON.parse(JSON.stringify(b.E.state()));
  delete s.flow.ext.endsAt; s.units = s.units.filter(x => x.id !== 'flowTimer'); b.E.importState(s);
  assert.ok(Number.isFinite(s.units.find(x => x.id === 'flowTimer').av));
});
test('星流結束計入暫存值，並清除米勒特殊狀態', () => {
  const b = activate('sorrow', 'grow'); b.E.state().flow.pend = -7.5; expiry(b);
  assert.equal(b.E.state().flow.v, -7.5); assert.equal(b.E.state().flow.pend, 0);
  assert.ok(!b.u.buffs.some(x => x.name === '盛大告別' || x.name === '陰雨連綿'));
});
test('寒夜累積到高段爆發時施放戰技', () => {
  const b = battle('hanye'); b.u.ticks = 24; b.u.buffs.push({name:'構築',dur:999,stats:{}});
  b.E.state().loom.tasks = []; b.E.state().loom.charge = 0;
  b.E.autoStep(); assert.ok(b.E.state().log.some(x => x.type === 'act' && x.text.includes('戰技·推廣')));
});
test('寒夜滿能量但沒有度量時先普攻備料，下次自動可轉測度', () => {
  const b = battle('hanye'); b.u.energy = b.u.maxEnergy; b.E.autoStep();
  assert.ok(b.E.state().log.some(x => x.type === 'act' && x.text.includes('普攻·單點')));
  b.E.autoStep(); assert.ok(b.E.state().log.some(x => x.text.includes('轉化為［校準任務·測度］')));
});
test('寒夜戰技圖形會隨實際刻度、擴散與構築改變', () => {
  const kinds = [];
  for(const [ticks,spread,construct] of [[0,false,false],[9,false,false],[4,true,false],[4,false,true]]) {
    const b = battle('hanye'); b.u.ticks = ticks; b.u.spreadReady = spread;
    if(construct) b.u.buffs.push({name:'構築',dur:999,stats:{}});
    b.E.act('skill'); const f = b.E.drainEvents().find(x => x.fx?.kind === 'riemann').fx;
    assert.equal(f.n,3+ticks); kinds.push(f.curve.kind);
  }
  assert.deepEqual(kinds,['arch','wave','double','gaussian']);
});
test('星流效果存在時，預覽不改變真實速度、期限或事件', () => {
  const b = activate('sorrow','fade'), before=JSON.stringify(b.E.state());
  assert.ok(b.E.preview('skill')); assert.equal(JSON.stringify(b.E.state()),before);
});
test('行動預測在計時器到期後恢復環境減速，且不改變戰鬥', () => {
  const b = activate('sorrow','fade'); b.e.av=150;
  const before=JSON.stringify(b.E.state());
  const list=b.E.forecast(8,b.E.state()), timer=list.find(x=>x.id==='flowTimer'), enemy=list.find(x=>x.id===b.e.id);
  assert.ok(Math.abs(enemy.at - (timer.at + (150-timer.at)*0.85)) < 1e-8);
  assert.equal(JSON.stringify(b.E.state()),before);
});
test('同步治療在播放佇列與主持續傷害合為同一筆', () => {
  const ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
  const fn=ui.slice(ui.indexOf('function groupSubs('),ui.indexOf('/**\n * 空檔處理'));
  const group=vm.runInNewContext(fn+'; groupSubs');
  const grouped=group([{idx:10,entry:{type:'dot'}},{idx:11,entry:{type:'heal',syncTo:10}}]);
  assert.equal(grouped.length,1); assert.equal(grouped[0].subs[0].entry.type,'heal');
});
test('截短戰鬥存檔時修正同步治療索引，且不更動原始紀錄', () => {
  const b=battle(),s=b.E.state(); s.log=Array.from({length:602},()=>({type:'buff',text:'紀錄'}));
  s.log[600]={type:'dot',text:'傷害'};s.log[601]={type:'heal',text:'治療',syncTo:600};
  const saved=b.E.exportState();assert.equal(saved.log.length,600);assert.equal(saved.log[599].syncTo,598);
  assert.equal(s.log[601].syncTo,600);
});
console.log(`全部 ${count} 項星流與自動戰鬥驗證通過。`);
