'use strict';
// Lifecycle and drawing-contract checks. Visual composition is checked in-browser.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ultfilm.js'), 'utf8');
const audioSource = fs.readFileSync(path.join(root, 'js/audio.js'), 'utf8');
let checks = 0, frames = 0;
function test(name, fn) { fn(); checks++; console.log('✓ ' + name); }
function harness({ art = true, width = 1600, height = 900 } = {}) {
  const contexts = [], roots = [], listeners = new Map(), raf = new Map(), timers = new Map(), scores = [], stops = [];
  let clock = 0, next = 0;
  const finite = args => args.forEach(a => { if (typeof a === 'number') assert.ok(Number.isFinite(a), 'Canvas argument must be finite'); });
  function makeContext() {
    let depth = 0;
    const ctx = new Proxy({ depth: () => depth }, {
      get(o, k) {
        if (k in o) return o[k];
        if (k === 'save') return () => depth++;
        if (k === 'restore') return () => { assert.ok(depth > 0, 'Unbalanced canvas restore'); depth--; };
        if (/^create.*Gradient$/.test(k)) return (...args) => { finite(args); return { addColorStop: (p) => assert.ok(p >= 0 && p <= 1) }; };
        if (k === 'measureText') return t => ({ width: t.length * 15 });
        return (...args) => {
          finite(args);
          if (k === 'arc') assert.ok(args[2] >= 0, 'Negative arc radius');
          if (k === 'ellipse') assert.ok(args[2] >= 0 && args[3] >= 0, 'Negative ellipse radius');
        };
      },
      set(o, k, val) { finite([val]); o[k] = val; return true; },
    });
    contexts.push(ctx); return ctx;
  }
  function makeCanvas() { const c = makeContext(); return { width: 800, height: 1280, getContext: () => c }; }
  const heroCanvas = makeCanvas(), enemyCanvas = makeCanvas();
  const env = {
    console, Math, innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    performance: { now: () => clock },
    requestAnimationFrame: fn => { const id = ++next; raf.set(id, fn); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    document: {
      body: { appendChild: root => roots.push(root) },
      querySelector: () => null,
      createElement: tag => {
        if (tag === 'canvas') return makeCanvas();
        const events = new Map(), cv = makeCanvas();
        const el = { style: {}, querySelector: () => cv, addEventListener: (n, fn) => events.set(n, fn), events,
          remove: () => { const idx = roots.indexOf(el); if (idx >= 0) roots.splice(idx, 1); } };
        return el;
      },
    },
    Art: {
      get: () => art ? { canvas: heroCanvas, w: 800, h: 1280, facePx: [400, 180] } : null,
      enemy: () => art ? { canvas: enemyCanvas } : null,
    },
    UltFx: { draw: { SERIF: 'serif', SANS: 'sans-serif', glowDot() {}, roundRect() {} } },
    Sound: {
      ult() {},
      score: (spec, k) => { scores.push({ spec, k }); return { stop: soft => stops.push(soft) }; },
      say: () => ({ cancel() {} }),
    },
  };
  const ctx = vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ultfx.js'), 'utf8') + '\nthis.fx = UltFx;', ctx);
  vm.runInContext(source + '\nthis.film = UltFilm;', ctx);
  return { film: ctx.film, fx: ctx.fx, roots, listeners, raf, timers, scores, stops,
    seek(t) { ctx.film.seek(t); contexts.forEach(c => assert.equal(c.depth(), 0, 'Canvas save/restore balance')); frames++; },
    tick(ms) { clock = ms; const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(fn => fn(ms)); },
  };
}
const enemies = n => Array.from({ length: n }, (_, i) => ({ type: i % 2 ? 'boss' : 'thug', name: '目標 ' + i, main: i === 0 }));
for (const key of ['mark', 'miller', 'otg']) {
  const duration = { mark: 13000, miller: 12500, otg: 12800 }[key];
  for (const art of [true, false]) for (const n of [0, 1, 3, 5]) {
    test(`${key}: all scenes, ${n} targets, artwork ${art ? 'present' : 'missing'}`, () => {
      const h = harness({ art });
      assert.equal(h.film.has(key), true); assert.equal(h.film.play(key, { enemies: enemies(n) }), duration);
      const spec = h.scores[0].spec;
      for (const [ms, name] of spec.cues) {
        assert.ok(ms >= 0 && ms < duration); assert.ok(audioSource.includes(name + '(t'), 'Unknown sound cue ' + name);
      }
      // Scan through cuts and motion at 30fps, including both sides of every scene boundary.
      for (let t = 0; t < duration; t += 1000 / 30) h.seek(t);
      for (const t of [2399, 2400, 4799, 4800, 5099, 5100, 6649, 6650, 7199, 7200, 9399, 9400, 9499, 9500, duration - 1]) h.seek(t);
      h.film.stop(); assert.equal(h.roots.length, 0); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
    });
  }
  test(`${key}: natural completion and scaled duration`, () => {
    const h = harness(); assert.equal(h.film.play(key, { k: 0.25, enemies: enemies(3) }), duration * 0.25);
    h.tick(duration * 0.25 - 1); assert.equal(h.film.active, true);
    h.tick(duration * 0.25); assert.equal(h.film.active, false); assert.equal(h.roots.length, 0);
    assert.equal(h.raf.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.deepEqual(h.stops, [true]);
  });
  test(`${key}: skip invokes its callback once and tears down playback`, () => {
    const h = harness(); let calls = 0;
    h.film.play(key, { onSkip: () => calls++ }); h.film.skip(); h.film.skip();
    assert.equal(calls, 1); assert.equal(h.roots.length, 0); assert.equal(h.raf.size, 0); assert.equal(h.timers.size, 0); assert.deepEqual(h.stops, [false]);
  });
  test(`${key}: click and keyboard skip`, () => {
    for (const keyName of ['Escape', ' ', 'Enter', 'click']) {
      const h = harness(); let calls = 0; h.film.play(key, { onSkip: () => calls++ });
      if (keyName === 'click') h.roots[0].events.get('click')({ stopPropagation() {} });
      else h.listeners.get('keydown')({ key: keyName, preventDefault() {}, stopPropagation() {} });
      assert.equal(calls, 1); assert.equal(h.film.active, false); assert.equal(h.listeners.size, 0);
    }
  });
}
test('O.T.G. short cut scans all frames, targets, missing artwork, and skip', () => {
  for (const art of [true, false]) for (const n of [1, 3, 5]) {
    const h = harness({ art }); let skipped = 0;
    assert.equal(h.fx.play('otg', { targets: Array.from({ length: n }, (_, i) => ({ x: 350 + i * 180, y: 330 })), onSkip: () => skipped++ }), 2800);
    assert.equal(h.fx.impact('otg'), 1790); assert.equal(h.film.impact('otg'), 9000);
    for (let t = 0; t < 2800; t += 1000 / 30) { h.fx.seek(t); frames++; }
    h.fx.skip(); assert.equal(skipped, 1); assert.equal(h.roots.length, 0);
  }
});
test('Replacing a film removes the previous film and sound', () => {
  const h = harness(); h.film.play('mark'); h.film.play('miller');
  assert.equal(h.roots.length, 1); assert.equal(h.stops.length, 1); assert.equal(h.listeners.size, 1);
  h.film.stop(); assert.equal(h.roots.length, 0);
});
test('Existing seven full films and short animations remain registered', () => {
  const h = harness();
  for (const key of ['kane', 'longzhao', 'mocha', 'alan', 'alexandra', 'hanye', 'gordon']) assert.equal(h.film.has(key), true);
  const fx = fs.readFileSync(path.join(root, 'js/ultfx.js'), 'utf8');
  assert.match(fx, /mark:\s*MARK/); assert.match(fx, /miller:\s*MILLER/);
  assert.equal(h.film.play('unknown'), 0); assert.equal(h.film.active, false);
});
console.log(`\n${checks} checks passed; ${frames} animation frames scanned.`);
