'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..'), read = n => fs.readFileSync(path.join(root, 'js', n + '.js'), 'utf8'), plain = x => JSON.parse(JSON.stringify(x));
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('✓ ' + name); }
function setup(source = read('engine')) {
  let now = 0, next = 0; const timers = new Map(), banners = [], seen = [];
  const math = Object.create(Math); math.random = () => .1;
  const ctx = vm.createContext({ console, Math: math, JSON, Set, Map, innerWidth: 1280, innerHeight: 720,
    document: { addEventListener() {}, querySelector: s => s === '#fx' ? { appendChild: x => banners.push(x) } : s === '.field' ? { getBoundingClientRect: () => ({ left: 120, top: 0, width: 1000, height: 500 }) } : null,
      querySelectorAll: s => s.includes('.fbanner') ? banners.filter(x => !x.removed) : [], createElement: () => ({ dataset: {}, style: {}, setAttribute(k, v) { this[k] = v; }, remove() { this.removed = true; } }) },
    window: { addEventListener() {} }, setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id), setInterval() {}, requestAnimationFrame() {},
    Art: { get: k => ({ url: 'blob:' + k }), bg: k => 'background-image:url(blob:' + k + ')' }, Sound: { play() {} }, SaveSys: { touch() {} }, UltFx: { stop() {}, active: true }, UltFilm: { stop() {}, active: false }, UltCine: { stop() {}, active: false }, seen: f => seen.push(plain(f)) });
  const run = s => vm.runInContext(s, ctx);
  for (const n of ['relics', 'quotes']) run(read(n)); run(source); run(read('ui'));
  const E = run('Engine'), cfg = run('JSON.parse(JSON.stringify(DEFAULT_CONFIG))'); cfg.team = ['metonic', 'mark', 'alexandra'];
  for (const k of Object.keys(cfg.rules)) if (/Technique$/.test(k)) cfg.rules[k] = false;
  Object.assign(cfg.rules, { cashbox: false, toughness: false, enemyAttack: false, critMode: 'expected', maxCycles: 50 });
  cfg.build = Object.fromEntries(cfg.team.map(k => [k, { useRelics: false, traces: { a1: false, a2: false, a3: false } }]));
  cfg.enemies = [0, 1, 2].map(i => ({ wave: 1, type: 'thug', name: 'Moon target ' + i, hp: 2e7, atk: 20, spd: 100, lvl: 80, tough: 999, weak: '時', effRes: 0 }));
  E.setInterrupts(true); E.setTurnWindows(true); E.newBattle(cfg);
  const s = E.state(), u = s.units.find(x => x.key === 'metonic'), e = s.units.filter(x => x.side === 'enemy')[1];
  Object.assign(s, { current: u.id, phase: 'input', currentExtra: false, turnWindow: null, turnNo: 40, target: e.id, sp: 5, log: [], stats: {} });
  s.units.forEach(x => { x.av = 10000; x.energy = 0; }); E.drainEvents();
  run("CFG.ui.speed=1;CFG.ui.anim=true;CFG.ui.ultAnim='off';view='battle';renderBattle=()=>{};renderLogFull=()=>{};renderEnergyGains=()=>{};energyPulse=()=>{};appendLog=()=>{};recordBattleEnd=()=>{};closePop=()=>{};playArea=()=>0;scheduleAuto=()=>{};");
  const input = () => Object.assign(s, { current: u.id, phase: 'input', currentExtra: false, turnWindow: null });
  return { ctx, E, s, u, e, run, banners, seen, timers, input,
    summon() { input(); E.act('skill'); E.drainEvents(); input(); return s.units.find(x => x.key === 'moon' && x.alive); },
    spring() { input(); u.winter = u.energy = 19; assert.ok(E.ult(u.id)); E.drainEvents(); input(); },
    moonTurn() { const m = s.units.find(x => x.key === 'moon' && x.alive); s.units.forEach(x => x.av = x.id === m.id ? 0 : 10000); s.phase = 'between'; s.current = null; s.turnWindow = null; E.proceed(); },
    tick(ms) { const end = now + ms; let n = 0; while (true) { const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; assert.ok(n++ < 2000); timers.delete(due[0]); now = due[1].at; due[1].fn(); } now = end; } };
}
test('Ordinary Metonic basic has no cooperative banner', () => {
  const b = setup(); b.summon(); b.E.act('basic'); const ev = b.E.drainEvents(); assert.ok(!ev.some(x => x.fx?.kind === 'coop'));
  assert.equal(ev.filter(x => x.fx?.kind === 'dmg' && x.entry.text.includes('普攻·七道月光')).length, 7);
});
test('Cooperative basic summons missing Moonshadow, then cues both before its first hit', () => {
  const b = setup(); b.spring(); b.E.act('basic'); const ev = b.E.drainEvents(), coop = ev.find(x => x.fx?.kind === 'coop');
  assert.ok(coop); assert.equal(ev.filter(x => x.fx?.kind === 'coop').length, 1); assert.equal(coop.fx.artKey, 'metonic_duo');
  assert.ok(coop.snap.units.some(x => x.id === coop.fx.partner && x.key === 'moon' && x.alive));
  assert.ok(ev.indexOf(coop) < ev.findIndex(x => x.fx?.kind === 'dmg'));
  assert.equal(ev.filter(x => x.fx?.kind === 'dmg' && !x.entry.text.includes('相鄰') && x.entry.text.includes('強化普攻·枯木終逢春')).length, 14);
});
test('Moonshadow own normal turn cues only its solo art and retains owner attribution', () => {
  const b = setup(); const m = b.summon(); b.moonTurn(); const ev = b.E.drainEvents(), f = ev.find(x => x.fx?.kind === 'follow');
  assert.equal(f.fx.artKey, 'moon'); assert.equal(f.fx.visual, 'moonSolo'); assert.equal(f.fx.performer, m.id); assert.equal(f.fx.src, b.u.id);
  const hits = ev.filter(x => x.fx?.kind === 'dmg' && x.fx.src === m.id); assert.equal(hits.length, 7); assert.ok(hits.every(x => x.fx.src === m.id));
  assert.ok(ev.indexOf(f) < ev.indexOf(hits[0])); assert.ok(b.s.stats[b.u.id].total > 0);
});
test('Moonshadow own enhanced turn cues the combined cooperative art once', () => {
  const b = setup(); b.summon(); b.spring(); b.moonTurn(); const ev = b.E.drainEvents(), f = ev.filter(x => x.fx?.kind === 'follow' && x.fx.visual === 'metonicCoop');
  assert.equal(f.length, 1); assert.equal(f[0].fx.visual, 'metonicCoop'); assert.equal(f[0].fx.artKey, 'metonic_duo');
  assert.equal(ev.filter(x => x.fx?.kind === 'dmg' && x.entry.text.includes('月影·枯木終逢春') && !x.entry.text.includes('相鄰')).length, 14);
});
test('Skill-triggered Moonshadow strike uses its solo art, not Metonic portrait', () => {
  const b = setup(); b.summon(); b.E.act('skill'); const f = b.E.drainEvents().find(x => x.fx?.visual === 'moonSolo'); assert.ok(f); assert.equal(f.fx.artKey, 'moon');
});
for (const coop of [true, false]) test((coop ? 'Cooperative' : 'Moon solo') + ' banner displays the complete correct illustration and name', () => {
  const b = setup(); b.ctx.payload = coop ? { kind: 'coop', src: b.u.id, name: '枯木終逢春', artKey: 'metonic_duo' } : { kind: 'follow', src: b.u.id, name: '月影・七道月光', visual: 'moonSolo', artKey: 'moon' };
  b.run('fx(payload)'); const el = b.banners.at(-1); assert.equal(el.dataset.art, coop ? 'moon+metonic' : 'moon');
  assert.ok(el.innerHTML.includes('<img src="blob:' + (coop ? 'metonic' : 'moon') + '"'));
  if(coop) { assert.ok(el.innerHTML.includes('fb-partner')); assert.ok(el.innerHTML.includes('fb-owner')); assert.ok(el.innerHTML.includes('blob:moon')); assert.ok(!el.innerHTML.includes('blob:metonic_duo')); }
  assert.ok(el.innerHTML.includes(coop ? '默冬章 × 月影' : 'alt="月影立繪"'));
  assert.ok(el.innerHTML.includes(coop ? '協同攻擊 · CO-OP' : '追加攻擊 · FOLLOW-UP'));
  assert.ok(!/NaN|undefined|Infinity/.test(el.innerHTML + el.style.cssText));
});
test('Moon enhanced follow-up also selects the dual illustration and cooperative label', () => {
  const b = setup(); b.ctx.payload = { kind: 'follow', src: b.u.id, name: '月影・枯木終逢春', visual: 'metonicCoop', artKey: 'metonic_duo' };
  b.run('followBanner(payload)'); assert.equal(b.banners[0].dataset.art, 'moon+metonic'); assert.ok(b.banners[0].innerHTML.includes('協同攻擊'));
});
test('Spring thunder remains Metonic-only follow-up artwork', () => {
  const b = setup(); b.ctx.payload = { kind: 'follow', src: b.u.id, name: '春雷' }; b.run('followBanner(payload)'); assert.equal(b.banners[0].dataset.art, 'metonic'); assert.ok(!b.banners[0].className.includes('fb-lunar'));
});
test('At 4x speed each lunar banner finishes before the next attack event', () => {
  for (const [kind, visual, duration] of [['coop', null, 725], ['follow', 'metonicCoop', 725], ['follow', 'moonSolo', 625]]) {
    const b = setup(); b.ctx.event = { idx: 0, entry: { type: 'info', text: 'test' }, snap: plain(b.s), fx: { kind, visual, src: b.u.id } };
    b.run('CFG.ui.speed=4;fx=f=>seen(f);queue=[event];playNext()'); assert.equal(b.timers.get(b.run('playTimer')).at, duration);
  }
});
test('No-animation playback resolves cooperative attacks without leaving a banner', () => {
  const b = setup(); b.spring(); b.run("CFG.ui.anim=false;run(()=>Engine.act('basic'))"); assert.equal(b.run('playing'), false); assert.equal(b.banners.length, 0);
});
test('Flushing removes lunar presentation without changing combat state', () => {
  const b = setup(); const state = JSON.stringify(b.E.exportState()); b.ctx.payload = { kind: 'coop', src: b.u.id, name: '枯木終逢春' };
  b.run('followBanner(payload);flush(true)'); assert.ok(b.banners[0].removed); assert.equal(JSON.stringify(b.E.exportState()), state);
});
if (process.env.METONIC_BEFORE_ENGINE) test('Solo/cooperative presentation preserves exact gameplay and passive results against previous engine', () => {
  const old = fs.readFileSync(process.env.METONIC_BEFORE_ENGINE, 'utf8');
  for (const scenario of ['normal', 'coop', 'moon', 'moonCoop', 'skill', 'skillCoop']) {
    function simulate(source) {
      const b = setup(source); b.summon(); if (['coop', 'moonCoop', 'skillCoop'].includes(scenario)) b.spring();
      if (scenario.startsWith('moon')) b.moonTurn(); else b.E.act(scenario.startsWith('skill') ? 'skill' : 'basic');
      const s = plain(b.E.exportState()); delete s.log; return s;
    }
    assert.deepEqual(simulate(read('engine')), simulate(old), scenario);
  }
});
console.log(checks + ' Metonic cooperative-art checks passed');
