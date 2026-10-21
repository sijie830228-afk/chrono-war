'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..'), engineSource = fs.readFileSync(path.join(root, 'js/engine.js'), 'utf8');
let tests = 0;
function test(name, fn) { fn(); tests++; console.log('✓ ' + name); }
const plain = o => JSON.parse(JSON.stringify(o));
function setup(team = ['hanye'], source = engineSource, seed = 17) {
  let rnd = seed;
  const math = Object.create(Math); math.random = () => { rnd = rnd + 0x6D2B79F5 | 0; let x = Math.imul(rnd ^ rnd >>> 15, 1 | rnd); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const ctx = vm.createContext({ console, Math: math, JSON, Object, Array, Number, String, Set, Map });
  for (const f of ['relics', 'quotes']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx);
  vm.runInContext(source, ctx);
  const E = vm.runInContext('Engine', ctx), cfg = vm.runInContext('JSON.parse(JSON.stringify(DEFAULT_CONFIG))', ctx);
  cfg.team = team;
  for (const k of Object.keys(cfg.rules)) if (/Technique$/.test(k)) cfg.rules[k] = false;
  Object.assign(cfg.rules, { enemyAttack: false, cashbox: false, critMode: 'expected', maxCycles: 50 });
  cfg.build = Object.fromEntries(team.map(k => [k, { useRelics: false, traces: { a1: false, a2: false, a3: false } }]));
  cfg.enemies = [0, 1, 2].map(i => ({ wave: 1, type: 'thug', name: '靶' + i, hp: 2e6, atk: 100, spd: 100, lvl: 80, tough: 30, weak: '物理,風,空,哀', effRes: 0 }));
  E.setInterrupts(true); E.newBattle(cfg); E.drainEvents();
  const s = E.state(), u = s.units.find(x => x.side === 'ally'), e = s.units.find(x => x.side === 'enemy');
  s.current = u.id; s.currentExtra = false; s.phase = 'input'; s.sp = 5; u.energy = 0;
  s.units.forEach(x => x.av = x.id === u.id ? 0 : 10000);
  return { ctx, E, cfg, s, u, e };
}
for (const key of ['hanye', 'mocha', 'longzhao', 'miller', 'mark']) test(key + ': basic energy belongs to its own hit snapshot', () => {
  const b = setup([key]); b.E.act('basic'); const evs = b.E.drainEvents();
  const e = evs.find(x => x.fx && x.fx.energyGains && x.fx.energyGains.some(g => g.id === b.u.id));
  assert.ok(e); assert.equal(e.fx.kind, 'dmg'); assert.equal(e.fx.src, b.u.id);
  const g = e.fx.energyGains.find(g => g.id === b.u.id); assert.equal(g.before, 0); assert.equal(g.after, 20);
  assert.equal(e.snap.units.find(x => x.id === b.u.id).energy, 20);
  const before = evs.find(x => x.entry.type === 'act'); assert.equal(before.snap.units.find(x => x.id === b.u.id).energy, 0);
});
test('Enemy hit energy is attached to the exact target, including shield absorption', () => {
  const b = setup(['hanye', 'mark']); b.s.rules.enemyAttack = true; b.u.shield = 1e6;
  b.s.units.filter(x => x.side === 'ally').forEach(x => x.energy = 0);
  b.s.phase = 'between'; b.s.current = null; b.u.av = 10000; b.e.av = 0;
  b.E.proceed(); const hit = b.E.drainEvents().find(x => x.fx && x.fx.src === b.e.id && x.fx.kind === 'dmg');
  assert.ok(hit); const gain = hit.fx.energyGains.find(x => x.id === hit.fx.tgt);
  assert.equal(gain.before, 0); assert.equal(gain.after, 10);
  assert.equal(hit.snap.units.find(x => x.id === gain.id).energy, 10);
});
test('Ultimate base refund is attached to a hit without changing its amount', () => {
  const b = setup(['miller']); b.u.energy = b.u.maxEnergy; b.E.ult(b.u.id);
  const evs = b.E.drainEvents(), hit = evs.find(x => x.fx && x.fx.energyGains && x.fx.energyGains.some(g => g.id === b.u.id));
  assert.ok(hit); assert.equal(hit.fx.kind, 'dmg'); assert.equal(hit.fx.energyGains[0].after, 5); assert.equal(b.u.energy, 5);
  assert.equal(evs.find(x => x.entry.type === 'ult').snap.units.find(x => x.id === b.u.id).energy, 0);
});
test('Weakness break keeps basic energy on weapon contact rather than the later break damage', () => {
  const b = setup(['hanye']); b.s.rules.toughness = true; b.e.tough = 1; b.e.weak = ['space']; b.E.act('basic');
  const evs = b.E.drainEvents(); assert.ok(evs.some(e => /擊破傷害/.test(e.entry.text)));
  const hit = evs.find(e => e.fx && e.fx.energyGains);
  assert.ok(hit.fx.line); assert.match(hit.entry.text, /普攻/);
});
test('A non-damaging ultimate binds its refund to the cast rather than a previous action', () => {
  const b = setup(['gordon']); b.u.energy = b.u.maxEnergy; b.E.ult(b.u.id);
  const ev = b.E.drainEvents().find(e => e.fx && e.fx.energyGains);
  assert.ok(ev); assert.equal(ev.fx.kind, 'ult'); assert.equal(ev.fx.energyGains[0].before, 0); assert.equal(ev.fx.energyGains[0].after, 5);
});
test('O.T.G. suffering is synchronized with self-laceration and remains a resource', () => {
  const b = setup(['otg']); b.u.lacer = [{ dur: 2, src: b.u.id }, { dur: 2, src: b.u.id }];
  b.E.act('basic'); b.E.proceed();
  const e = b.E.drainEvents().find(x => x.fx && x.fx.kind === 'dot' && x.fx.tgt === b.u.id && x.fx.energyGains);
  assert.ok(e); assert.equal(e.fx.dotType, 'lacer'); assert.equal(e.fx.energyGains[0].sufferAfter, 2); assert.equal(e.snap.units.find(x => x.id === b.u.id).suffer, 2);
});
test('DoT metadata distinguishes laceration, original sin, blood break, and all mourning stages', () => {
  const b = setup(['longzhao', 'otg', 'miller']); const og = b.s.units.find(x => x.key === 'otg');
  b.e.lacer = [{ dur: 3, src: b.u.id }, { dur: 3, src: og.id, orig: true }]; b.e.bloodBreak = 1;
  b.e.mourn = [{ st: 1, first: false }, { st: 2, first: false }, { st: 3, first: false }];
  b.s.phase = 'between'; b.s.current = null; b.u.av = 10000; b.e.av = 0; b.E.proceed();
  const dots = b.E.drainEvents().filter(x => x.fx && x.fx.kind === 'dot').map(x => x.fx);
  for (const type of ['lacer', 'original', 'bloodBreak', 'mourn']) assert.ok(dots.some(f => f.dotType === type), type);
  assert.deepEqual(plain(dots.filter(f => f.dotType === 'mourn').map(f => f.dotStage)), [1, 2, 3]);
});
test('Alexandra talent follow-up requests the same police sweep as her technique', () => {
  const b = setup(['alexandra']); b.u.siren = 4;
  b.s.phase = 'between'; b.s.current = null; b.u.av = 10000; b.e.av = 0; b.s.rules.enemyAttack = true;
  b.E.proceed();
  const evs = b.E.drainEvents(), follow = evs.find(x => x.fx && x.fx.kind === 'follow' && x.fx.src === b.u.id);
  assert.ok(follow); assert.equal(follow.fx.visual, 'policeDrift');
  assert.equal(evs.filter(x => x.fx && x.fx.kind === 'dmg' && /圍捕行動/.test(x.entry.text)).length, 3);
});

function uiHarness() {
  const b = setup(['hanye']); let now = 0, next = 0;
  const timers = new Map(), c = b.ctx;
  Object.assign(c, { setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, at: now + delay, delay }); return id; }, clearTimeout: id => timers.delete(id), setInterval() {},
    document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => ({ classList: { contains: () => true }, getBoundingClientRect: () => ({ left: 100, top: 100, width: 100, height: 100 }) }) }, window: { addEventListener() {} },
    UltFx: { stop() {} }, UltFilm: { stop() {} }, UltCine: { stop() {} }, Sound: { play() {} }, renders: [], fxSeen: [], logSeen: [],
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8'), c);
  vm.runInContext(`renderBattle=()=>renders.push(JSON.parse(JSON.stringify(V))); renderEnergyGains=()=>renders.push(JSON.parse(JSON.stringify(V))); renderLogFull=()=>{}; appendLog=e=>logSeen.push(e.text); fx=f=>fxSeen.push(f); energyPulse=()=>{}; pump=()=>false; scheduleAuto=()=>{}; CFG.ui.speed=1; CFG.ui.ultAnim='off';`, c);
  return { ...b, timers, run: src => vm.runInContext(src, c), tick(ms) {
    const end = now + ms;
    while (true) { const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; timers.delete(due[0]); now = due[1].at; due[1].fn(); }
    now = end;
  } };
}
test('Energy waits for weapon contact, then persists into subsequent logs', () => {
  const b = uiHarness(); b.E.act('basic');
  b.ctx.evs = b.E.drainEvents(); b.run(`queue=groupSubs(evs.filter(e=>e.fx&&e.fx.energyGains)); playNext();`);
  assert.equal(b.run('V.units.find(u=>u.key==="hanye").energy'), 0);
  b.tick(59); assert.equal(b.run('V.units.find(u=>u.key==="hanye").energy'), 0);
  b.tick(1); assert.equal(b.run('V.units.find(u=>u.key==="hanye").energy'), 20);
});
test('Restart/flush cancels pending energy callbacks', () => {
  const b = uiHarness(); b.E.act('basic'); b.ctx.evs = b.E.drainEvents(); b.run(`queue=groupSubs(evs.filter(e=>e.fx&&e.fx.energyGains));playNext();flush(true);`);
  const n = b.ctx.renders.length; b.tick(1000); assert.equal(b.ctx.renders.length, n); assert.equal(b.run('impactTimers.size'), 0);
});
test('O.T.G. ultimate keeps all cast-time targets, including targets already killed by DoT', () => {
  const b = uiHarness(); b.u.key = 'otg';
  b.ctx.castSnap = { units: plain(b.s.units) }; b.s.units.filter(u => u.side === 'enemy').forEach(u => u.alive = false);
  b.ctx.testEv = { fx: { src: b.u.id }, snap: b.ctx.castSnap };
  b.run(`playUltShow=(key,units,main,opt)=>({key,targets:opt.targets,onSkip:opt.onSkip});result=playUltCine(testEv);`);
  assert.equal(b.run('result.targets.length'), 3);
});
test('Skipping a full ultimate cancels deferred cast energy without touching later playback', () => {
  const b = uiHarness(); b.ctx.testEv = { fx: { src: b.u.id }, snap: { units: plain(b.s.units) } };
  b.run(`playUltShow=(key,units,main,opt)=>opt;playNext=()=>{};expired=false;impactLater(()=>expired=true,9000);result=playUltCine(testEv);result.onSkip();`);
  b.tick(10000); assert.equal(b.run('expired'), false); assert.equal(b.run('impactTimers.size'), 0);
});
test('Consecutive DoT uses 150ms hits and 45ms intervening status logs', () => {
  const b = uiHarness(); const snap = plain({ units: b.s.units });
  b.ctx.evs = [{ idx: 0, entry: { type: 'dot', text: 'dot' }, fx: { kind: 'dot', tgt: b.e.id }, snap }, { idx: 1, entry: { type: 'buff', text: 'stage' }, snap }, { idx: 2, entry: { type: 'dot', text: 'dot' }, fx: { kind: 'dot', tgt: b.e.id }, snap }];
  b.run('queue=evs;playNext()'); assert.equal([...b.timers.values()][0].delay, 150); b.tick(150);
  assert.equal([...b.timers.values()][0].delay, 45); b.tick(45); assert.equal([...b.timers.values()][0].delay, 150);
});
test('At 4x battle speed, the queue still waits for the full capped-speed police sweep', () => {
  const b = uiHarness(); b.ctx.evs = [{ idx: 0, entry: { type: 'info', text: 'sweep' }, fx: { kind: 'follow', visual: 'policeDrift', src: b.u.id }, snap: { units: plain(b.s.units) } }];
  b.run('CFG.ui.speed=4;policeDrift=()=>{};followBanner=()=>{};queue=evs;playNext()');
  assert.equal([...b.timers.values()][0].delay, 575);
});
test('Car sweep commits each target once when reached, with energy on its bound hit', () => {
  const b = uiHarness(), es = b.s.units.filter(x => x.side === 'enemy'), initial = { units: plain(b.s.units) };
  const evs = es.map((e, i) => {
    const snap = plain(initial); snap.units.find(x => x.id === e.id).hp -= 100;
    if (i === 2) snap.units.find(x => x.id === b.u.id).energy = 10;
    return { idx: i, entry: { type: 'dmg', text: e.id }, fx: { kind: 'dmg', src: b.u.id, tgt: e.id, ...(i === 2 ? { energyGains: [{ id: b.u.id, before: 0, after: 10 }] } : {}) }, snap };
  });
  b.ctx.startSnap = initial; b.ctx.evs = evs; b.ctx.sourceId = b.u.id; b.ctx.enemyIds = es.map(x => x.id);
  b.run('V=startSnap;queue=evs;sweep=driftHits(sourceId);sweep.hit(enemyIds[0])');
  assert.equal(b.run('V.units.find(u=>u.id===enemyIds[0]).hp'), es[0].hp - 100);
  assert.equal(b.run('V.units.find(u=>u.id===enemyIds[1]).hp'), es[1].hp); assert.equal(b.run('V.units.find(u=>u.id===sourceId).energy'), 0);
  b.run('sweep.hit(enemyIds[1]);sweep.hit(enemyIds[2]);sweep.end();sweep.end()');
  assert.equal(b.ctx.logSeen.length, 3); assert.equal(b.run('V.units.find(u=>u.id===sourceId).energy'), 10);
});

if (process.argv[2]) {
  const original = fs.readFileSync(process.argv[2], 'utf8');
  for (const team of [['otg', 'miller', 'alexandra'], ['longzhao', 'otg', 'miller'], ['hanye', 'mark', 'alexandra']]) for (const seed of [1, 2, 3]) {
    test('Combat unchanged: ' + team.join('/') + ' seed ' + seed, () => {
      const run = source => {
        const b = setup(team, source, seed); b.cfg.rules.enemyAttack = true; b.cfg.rules.maxCycles = 20;
        b.cfg.enemies.forEach(e => e.hp = 15000); b.E.newBattle(b.cfg);
        for (let i = 0; i < 20000 && !['win', 'lose', 'timeout'].includes(b.E.state().phase); i++) {
          if (b.E.state().phase === 'between') b.E.proceed(); else b.E.autoStep();
        }
        const s = b.E.state(); return plain({ phase: s.phase, time: s.time, stats: s.stats, units: s.units.map(u => ({ id: u.id, hp: u.hp, energy: u.energy, suffer: u.suffer })), log: s.log });
      };
      assert.deepEqual(run(engineSource), run(original));
    });
  }
}
console.log(`\n${tests} combat/presentation checks passed.`);
