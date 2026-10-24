'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..'), read = n => fs.readFileSync(path.join(root, 'js', n + '.js'), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('✓ ' + name); }
function setup(mark = '兄友', engine = read('engine')) {
  const math = Object.create(Math); math.random = () => .1;
  let now = 0, next = 0;
  const timers = new Map(), banners = [], played = [], sounds = [];
  const host = { appendChild: el => banners.push(el) };
  const doc = { addEventListener() {}, querySelector: s => s === '#fx' ? host : s === '.field' ? { getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 550 }) } : null,
    querySelectorAll: s => s.includes('.fbanner') ? banners.filter(x => !x.removed) : [],
    createElement: () => ({ dataset: {}, style: {}, setAttribute(k, v) { this[k] = v; }, remove() { this.removed = true; } }) };
  const ctx = vm.createContext({ console, Math: math, JSON, Set, Map, innerWidth: 1280, innerHeight: 720,
    document: doc, window: { addEventListener() {} },
    setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id), setInterval() {}, requestAnimationFrame() {},
    Art: { get: k => ({ url: 'blob:' + k }), bg: k => 'background-image:url(blob:' + k + ')' },
    Sound: { play: (...a) => sounds.push(a) }, SaveSys: { touch() {} }, UltFx: { stop() {}, active: true }, UltFilm: { stop() {}, active: false }, UltCine: { stop() {}, active: false }, seen: f => played.push(plain(f)) });
  const run = s => vm.runInContext(s, ctx);
  for (const n of ['relics', 'quotes']) run(read(n)); run(engine); run(read('ui'));
  const E = run('Engine'), cfg = run('JSON.parse(JSON.stringify(DEFAULT_CONFIG))'); cfg.team = ['mocha', 'kane', 'mark', 'alexandra'];
  for (const k of Object.keys(cfg.rules)) if (/Technique$/.test(k)) cfg.rules[k] = false;
  Object.assign(cfg.rules, { enemyAttack: false, cashbox: false, critMode: 'expected', toughness: false, maxCycles: 50 });
  cfg.build = Object.fromEntries(cfg.team.map(k => [k, { useRelics: false, traces: { a1: false, a2: false, a3: false } }]));
  cfg.enemies = [0, 1, 2].map(i => ({ wave: 1, type: 'thug', name: 'Proxy target ' + i, hp: 2e6, atk: 20, spd: 100, lvl: 80, tough: 999, weak: '冰', effRes: 0 }));
  E.setInterrupts(true); E.setTurnWindows(true); E.newBattle(cfg);
  const s = E.state(), m = s.units.find(x => x.key === 'mocha'), a = s.units.find(x => x.key === 'kane'), e = s.units.find(x => x.side === 'enemy');
  Object.assign(s, { phase: 'input', current: a.id, currentExtra: false, turnWindow: null, turnNo: 42, sp: 5, log: [], stats: {}, proxy: a.id, target: e.id });
  s.units.forEach(x => { x.av = 1000; x.energy = 0; }); a.mark = mark; m.tacit = 2;
  E.drainEvents();
  run("CFG.ui.speed=1;CFG.ui.anim=true;CFG.ui.ultAnim='off';view='battle';renderBattle=()=>{};renderLogFull=()=>{};renderEnergyGains=()=>{};energyPulse=()=>{};appendLog=()=>{};recordBattleEnd=()=>{};closePop=()=>{};playArea=()=>0;scheduleAuto=()=>{};");
  return { E, s, m, a, e, ctx, run, banners, played, timers, tick(ms) { const end = now + ms; let n = 0; while (true) { const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; assert.ok(n++ < 1000); timers.delete(due[0]); now = due[1].at; due[1].fn(); } now = end; } };
}
for (const [mark, role, name] of [['兄友', 'elder', '合法催收程序'], ['弟恭', 'younger', '公關預算浮報']]) {
  test(role + ': confirmation emits one proxy before the selected skill, retaining the pre-switch role', () => {
    const b = setup(mark); b.E.act('skill'); const events = b.E.drainEvents(), proxies = events.filter(x => x.fx?.kind === 'proxy');
    assert.equal(proxies.length, 1); const p = proxies[0]; assert.equal(p.fx.role, role); assert.equal(p.fx.name, name); assert.equal(p.fx.src, b.m.id);
    assert.equal(p.snap.units.find(x => x.id === b.a.id).mark, mark); assert.notEqual(b.a.mark, mark);
    assert.ok(events.indexOf(p) < events.findIndex(x => x.entry.type === 'act'));
    assert.equal(b.m.tacit, 0);
  });
  test(role + ': ultimate-triggered proxy emits the same solo portrait cue, without spending tacit', () => {
    const b = setup(mark); b.m.energy = b.m.maxEnergy; b.E.ult(b.m.id);
    const events = b.E.drainEvents(), proxies = events.filter(x => x.fx?.kind === 'proxy');
    assert.equal(proxies.length, 1); assert.equal(proxies[0].fx.role, role); assert.equal(b.m.tacit, mark === '弟恭' ? 4 : 3);
    assert.ok(events.findIndex(x => x.entry.type === 'ult') < events.indexOf(proxies[0]));
  });
  test(role + ': banner routes to the matching individual face even after the live mark changes', () => {
    const b = setup(mark); b.E.act('basic'); const event = b.E.drainEvents().find(x => x.fx?.kind === 'proxy'); b.ctx.payload = event.fx;
    b.run('followBanner(payload)'); const el = b.banners.at(-1);
    assert.equal(el.dataset.art, 'mocha_' + role); assert.ok(el.innerHTML.includes('blob:mocha_' + role)); assert.ok(el.innerHTML.includes('代理執行 · PROXY')); assert.ok(el.innerHTML.includes(name));
    assert.ok(!el.innerHTML.includes('追加攻擊')); assert.equal(el.dataset.kind, 'proxy');
    assert.ok(!/NaN|undefined|Infinity/.test(el.innerHTML + el.style.cssText));
  });
  test(role + ': real playback presents the proxy banner before effects and the delegated cast', () => {
    const b = setup(mark); b.run('fx=f=>{seen(f);if(f.kind===\'proxy\')followBanner(f)};run(()=>Engine.act(\'basic\'))'); b.tick(40000);
    const p = b.played.findIndex(x => x.kind === 'proxy'), cast = b.played.findIndex(x => x.kind === 'cast' && x.src === b.a.id);
    assert.ok(p >= 0 && cast > p); assert.equal(b.played[p].role, role); assert.equal(b.banners.length, 1); assert.ok(b.banners[0].removed);
    if (role === 'elder') assert.ok(b.played.findIndex(x => x.kind === 'dmg' && x.src === b.m.id) > p);
  });
}
if (process.env.MOCHA_BEFORE_ENGINE) test('Proxy presentation leaves follow-up-triggered passives and battle results identical', () => {
  const old = process.env.MOCHA_BEFORE_ENGINE && fs.readFileSync(process.env.MOCHA_BEFORE_ENGINE, 'utf8'); assert.ok(old, 'Set MOCHA_BEFORE_ENGINE to the pre-change engine');
  for (const mark of ['兄友', '弟恭']) for (const action of ['basic', 'skill', 'ult']) {
    const a = setup(mark, old), b = setup(mark); a.m.energy = b.m.energy = b.m.maxEnergy;
    for (const x of [a, b]) { if (action === 'ult') x.E.ult(x.m.id); else x.E.act(action); }
    assert.deepEqual(plain(a.E.exportState()), plain(b.E.exportState()));
  }
});
test('At 4x speed the queue waits for the complete capped-speed proxy banner', () => {
  const b = setup(); b.E.act('basic'); b.ctx.event = b.E.drainEvents().find(x => x.fx?.kind === 'proxy');
  b.run("CFG.ui.speed=4;fx=f=>seen(f);queue=[event];playNext();");
  assert.equal(b.timers.get(b.run('playTimer')).at, 525);
});
test('Ordinary follow-up banners keep their original heading, identity and lifespan', () => {
  const b = setup(); b.ctx.payload = { kind: 'follow', src: b.a.id, name: '行動中' }; b.run('followBanner(payload)');
  const el = b.banners.at(-1); assert.equal(el.dataset.art, 'kane'); assert.ok(el.innerHTML.includes('追加攻擊 · FOLLOW-UP')); assert.ok(!el.innerHTML.includes('代理執行')); assert.ok(el.style.cssText.includes('1.25s'));
});
test('Flush removes the proxy banner and its pending presentation without affecting the engine', () => {
  const b = setup(); const before = JSON.stringify(b.E.exportState()); b.ctx.payload = { kind: 'proxy', src: b.m.id, role: 'elder', name: '合法催收程序' };
  b.run('followBanner(payload);flush(true)'); assert.ok(b.banners[0].removed); assert.equal(JSON.stringify(b.E.exportState()), before);
});
test('Ultimate impact batching stops at the proxy boundary and leaves its damage queued', () => {
  const b = setup(); b.m.energy = b.m.maxEnergy; b.E.ult(b.m.id); b.ctx.events = b.E.drainEvents();
  b.run("ultNumbers=()=>{};CFG.ui.speed=1;queue=groupSubs(events);queue.shift();scheduleUltHits({impact:100});");
  const proxy = b.run("queue.findIndex(x=>x.fx?.kind==='proxy')"); assert.ok(proxy >= 0); b.tick(100);
  assert.ok(b.run("queue.some(x=>x.fx?.kind==='proxy')"));
  assert.ok(b.run("queue.slice(0,queue.findIndex(x=>x.fx?.kind==='proxy')).every(x=>!['dmg','dot'].includes(x.fx?.kind))"));
  assert.ok(b.run("queue.some(x=>x.fx?.kind==='dmg'&&x.entry.text.includes('代理執行-兄'))"));
});
console.log(checks + ' Mocha proxy/portrait checks passed');
