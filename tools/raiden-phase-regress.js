'use strict';
// Public combat paths plus snapshot-based artwork routing; no browser required.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('✓ ' + name); }
function battle() {
  const math = Object.create(Math); math.random = () => .5;
  const ctx = vm.createContext({ console, Math: math, JSON, Object, Array, Number, String, Set, Map });
  for (const key of ['relics', 'quotes', 'engine']) vm.runInContext(read(key), ctx);
  const E = vm.runInContext('Engine', ctx), cfg = vm.runInContext('JSON.parse(JSON.stringify(DEFAULT_CONFIG))', ctx);
  cfg.team = ['alan'];
  for (const k of Object.keys(cfg.rules)) if (/Technique$/.test(k)) cfg.rules[k] = false;
  Object.assign(cfg.rules, { cashbox: false, critMode: 'expected', enemyAttack: true });
  cfg.build = { alan: { useRelics: false, traces: { a1: false, a2: false, a3: false } } };
  cfg.enemies = [{ wave: 1, type: 'raiden', name: '雷霆-09型', hp: 100000, atk: 0, spd: 1, lvl: 80, tough: 9999, weak: '物理', effRes: 0 }];
  E.setInterrupts(true); E.newBattle(cfg); E.drainEvents();
  const S = E.state(), a = S.units.find(u => u.side === 'ally'), e = S.units.find(u => u.side === 'enemy');
  S.phase = 'input'; S.current = a.id; S.currentExtra = false; S.target = e.id; S.sp = 5;
  a.av = 0; e.av = 10000;
  return { E, ctx, S, a, e };
}
async function artFixture(phase2 = true) {
  const pending = []; let next = 0;
  const ctx = vm.createContext({ console, Math, Promise,
    ART_IMAGES: { '自律處刑官・「雷霆-09型」': 'phase-one', ...(phase2 ? { '自律處刑官・「雷霆-09型」-第二階段': 'phase-two' } : {}) },
    Image: class { constructor() { this.naturalWidth = 32; this.naturalHeight = 48; } set src(v) { this.value = v; this.onload(); } },
    setTimeout: fn => { pending.push(fn); }, URL: { createObjectURL: () => 'blob:fixture-' + ++next },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: (x,y,w,h) => ({ data: new Uint8ClampedArray(w*h*4) }) }), toBlob: fn => fn({}) }) },
  });
  vm.runInContext(read('art'), ctx);
  const Art = vm.runInContext('Art', ctx);
  assert.equal(Art.enemyKey({ type: 'raiden', phase2: true }), 'raiden', 'Loading falls back to phase one');
  const ready = new Promise(resolve => Art.onReady(resolve));
  while (pending.length) pending.shift()();
  await ready;
  return Art;
}
function ui(b, Art) {
  Object.assign(b.ctx, { Art, setTimeout() {}, clearTimeout() {}, setInterval() {}, requestAnimationFrame() {},
    document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null }, window: { addEventListener() {} },
    Sound: { play() {} }, UltFx: { has: () => true, play: (k,o) => { b.ctx.shortOptions = o; return 2800; }, impact: () => 1780 },
    UltFilm: { has: () => true, play: (k,o) => { b.ctx.filmOptions = o; return 12000; }, impact: () => 9000 }, UltCine: {},
  });
  vm.runInContext(read('ui'), b.ctx);
  vm.runInContext("CFG.ui.ultAnim='full';scheduleUltHits=()=>{};", b.ctx);
  return code => vm.runInContext(code, b.ctx);
}
async function main() {
  const Art = await artFixture();
  test('Phase artwork selects by each unit, supports strings, and reverses on restore', () => {
    const e = { type: 'raiden', phase2: false };
    assert.equal(Art.enemyKey(e), 'raiden'); e.phase2 = true;
    assert.equal(Art.enemyKey(e), 'raiden_phase2'); assert.equal(Art.enemy(e).canvas, Art.get('raiden_phase2').canvas);
    assert.deepEqual(Array.from(Art.enemy(e).light), [110, 200, 255]);
    e.phase2 = false; assert.equal(Art.enemy(e).canvas, Art.get('raiden').canvas);
    assert.equal(Art.enemyKey('raiden'), 'raiden'); assert.equal(Art.enemyKey('thug'), 'thug');
  });
  const fallback = await artFixture(false);
  test('A missing phase-two file safely uses the first-phase portrait', () => {
    assert.equal(fallback.enemyKey({ type: 'raiden', phase2: true }), 'raiden');
    assert.equal(fallback.enemy({ type: 'raiden', phase2: true }).canvas, fallback.get('raiden').canvas);
  });
  let transition;
  test('A real hit crosses 50%, emits one phase event, and preserves pre-transition snapshots', () => {
    const b = battle(); b.e.hp = b.e.maxHp / 2 + 1;
    const before = plain(b.E.state()); assert.ok(b.E.act('basic'));
    const events = b.E.drainEvents(), phase = events.filter(e => e.fx && e.fx.kind === 'phase');
    assert.equal(phase.length, 1); assert.ok(b.e.hp > 0 && b.e.hp < b.e.maxHp/2);
    assert.equal(!!before.units.find(u=>u.id===b.e.id).phase2, false);
    assert.equal(phase[0].snap.units.find(u=>u.id===b.e.id).phase2, true);
    const ult = events.find(e=>e.fx&&e.fx.kind==='eult');
    assert.ok(ult, 'The immediate extra turn casts the phase-transition ultimate');
    assert.equal(ult.snap.units.find(u=>u.id===b.e.id).phase2, true);
    transition = { before, after: phase[0].snap, saved: plain(b.E.exportState()), events };
  });
  test('A hit above the threshold and a killing blow do not show a premature second phase', () => {
    for (const hp of [100000, 1]) { const b = battle(); b.e.hp = hp; b.E.act('basic'); assert.equal(!!b.e.phase2, false); assert.ok(!b.E.drainEvents().some(e=>e.fx&&e.fx.kind==='phase')); }
  });
  test('Damage over time also triggers the same phase snapshot', () => {
    const b = battle(); b.e.hp = b.e.maxHp/2+1; b.e.lacer = [{ src: b.a.id, dur: 3 }];
    b.S.phase = 'between'; b.S.current = null; b.a.av = 10000; b.e.av = 0;
    b.E.proceed(); const phase = b.E.drainEvents().find(e=>e.fx&&e.fx.kind==='phase');
    assert.ok(phase); assert.equal(phase.snap.units.find(u=>u.id===b.e.id).phase2, true);
  });
  test('Loading a phase-two save and starting a fresh battle select the correct forms', () => {
    const b = battle(); assert.ok(b.E.importState(plain(transition.saved)));
    assert.equal(Art.enemyKey(b.E.state().units.find(u=>u.type==='raiden')), 'raiden_phase2');
    b.E.importState(plain(transition.before));
    assert.equal(Art.enemyKey(b.E.state().units.find(u=>u.type==='raiden')), 'raiden');
    assert.equal(Art.enemyKey(battle().e), 'raiden');
  });
  test('Body sprites and action-strip portraits use the supplied snapshot, not final engine state', () => {
    const b = battle(), run = ui(b, Art); b.e.phase2 = true;
    b.ctx.oldUnit = plain(transition.before.units.find(u=>u.type==='raiden'));
    b.ctx.newUnit = plain(transition.after.units.find(u=>u.type==='raiden'));
    assert.match(run('enemySvg(oldUnit)'), /data-art="raiden"/);
    assert.match(run('enemySvg(newUnit)'), /data-art="raiden_phase2"/);
    assert.match(run("enemySvg(newUnit,'32 0 56 56')"), /data-art="raiden_phase2"/);
    assert.match(run("enemySvg(oldUnit,'32 0 56 56')"), /data-art="raiden"/);
  });
  test('Boss ultimate reads the caster phase from its cast-time snapshot', () => {
    const b = battle(), run = ui(b, Art); b.e.phase2 = true;
    for (const phase2 of [false,true]) {
      const snap = plain(b.S); snap.units.find(u=>u.id===b.e.id).phase2 = phase2;
      b.ctx.cast = { fx: { key:'raiden',src:b.e.id }, snap };
      run('playEnemyUlt(cast)'); assert.equal(b.ctx.shortOptions.artKey, phase2?'raiden_phase2':'raiden');
    }
  });
  test('Player full films retain each target phase at cast time', () => {
    const b = battle(), run = ui(b, Art); b.e.phase2 = true;
    b.ctx.castUnits = plain(b.S.units); run("playUltShow('alan',castUnits,null)");
    assert.equal(b.ctx.filmOptions.enemies[0].phase2,true);
    b.ctx.castUnits.find(u=>u.side==='enemy').phase2=false; run("playUltShow('alan',castUnits,null)");
    assert.equal(b.ctx.filmOptions.enemies[0].phase2,false);
  });
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(transition));
  console.log(`\n${checks} phase/artwork checks passed.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
