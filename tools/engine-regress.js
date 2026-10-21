// 戰鬥引擎回歸測試：在 Node 中以固定亂數種子跑大量自動戰鬥，記錄完整戰鬥紀錄與統計。
// 用法：
//   node tools/engine-regress.js record <輸出檔>     記錄基準
//   node tools/engine-regress.js compare <基準檔>    與基準比較（完全一致才算通過）
// 修改 js/engine.js 的結構（而不是數值）前後各跑一次，確認行為沒有改變。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'battle-cfg.json'), 'utf8'));

function makeEngine(seed) {
  let s = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => { s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const ctx = vm.createContext({ console, Math: math, JSON, Object, Array, Number, String, Set, Map });
  ['relics.js', 'quotes.js', 'engine.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f }));
  return vm.runInContext('Engine', ctx);
}

function scenarios() {
  const list = [];
  const base = fixture.cfg;
  const encounters = [{ id: 'default', enemies: base.enemies }].concat(fixture.dungeons);
  const variants = [
    { name: 'std', rules: {} },
    { name: 'random', rules: { critMode: 'random' } },
    { name: 'bbImm+enhStack', rules: { bbImmediate: true, kaneEnhStack: true, critMode: 'random' } },
    { name: 'noTech+lacerMax', rules: { lzTechnique: false, mochaTechnique: false, alanTechnique: false, kaneTechnique: false, lacerMax: 3 } },
    { name: 'dummy+infSP', rules: { enemyAttack: false, infiniteSP: true } },
    { name: 'noRelics', rules: { critMode: 'random' }, noBuild: true },
  ];
  encounters.forEach(enc => variants.forEach(v => [1, 2, 3].forEach(seed => {
    if (v.name !== 'random' && v.name !== 'bbImm+enhStack' && v.name !== 'noRelics' && seed > 1) return;   // 沒有亂數差異的只跑一次
    const cfg = JSON.parse(JSON.stringify(base));
    cfg.enemies = enc.enemies;
    Object.assign(cfg.rules, v.rules);
    if (v.noBuild) cfg.build = {};
    list.push({ key: `${enc.id}/${v.name}/${seed}`, cfg, seed, interrupts: seed % 2 === 1 });
  })));
  // 隊伍組合變化
  [['kane', 'alan'], ['longzhao', 'mocha'], ['mocha', 'kane', 'longzhao']].forEach((team, i) => {
    const cfg = JSON.parse(JSON.stringify(base));
    cfg.team = team.concat([null, null, null, null]).slice(0, 4);
    cfg.rules.critMode = 'random';
    list.push({ key: `team${i}`, cfg, seed: 11 + i, interrupts: true });
  });
  return list;
}

function run(sc) {
  const E = makeEngine(sc.seed);
  E.setInterrupts(sc.interrupts);
  E.newBattle(sc.cfg);
  let steps = 0, ultToggle = 0;
  for (; steps < 20000; steps++) {
    const S = E.state();
    if (['win', 'lose', 'timeout'].includes(S.phase)) break;
    if (process.env.PREVIEW && E.preview) {   // 預覽不得改變任何狀態：每一步都先試算所有可能的行動
      const before = JSON.stringify(S);
      if (S.phase === 'input') { E.preview('basic'); E.preview('skill'); }
      S.units.filter(u => u.side === 'ally' && E.canUlt(u.id)).forEach(u => E.preview({ ult: u.id }));
      if (JSON.stringify(E.state()) !== before) throw new Error('preview 改變了戰鬥狀態：' + sc.key);
    }
    if (S.phase === 'between') {
      const full = S.units.find(u => u.side === 'ally' && E.canUlt(u.id));
      if (full && (ultToggle++ % 2 === 0)) E.ult(full.id);   // 空檔中施放終結技
      else E.proceed();
    } else if (S.phase === 'input') {
      if (steps % 97 === 13 && E.canUndo()) E.undo();          // 偶爾撤銷，測試歷史紀錄
      E.autoStep();
    } else throw new Error('unexpected phase ' + S.phase);
  }
  const S = E.state();
  const ev = E.drainEvents();
  return {
    phase: S.phase, steps, time: S.time,
    log: S.log.map(l => `${l.type}|${l.text}|${l.detail}`),
    stats: S.stats,
    units: S.units.map(u => ({ id: u.id, hp: u.hp, alive: u.alive, energy: u.energy, av: u.av })),
    fx: ev.map(e => e.fx ? JSON.stringify(e.fx) : '').join('\n'),
  };
}

const [mode, file] = process.argv.slice(2);
const out = {};
for (const sc of scenarios()) out[sc.key] = run(sc);
if (mode === 'record') {
  fs.writeFileSync(file, JSON.stringify(out));
  const n = Object.keys(out).length;
  const lines = Object.values(out).reduce((s, r) => s + r.log.length, 0);
  console.log(`已記錄 ${n} 場戰鬥、${lines} 行戰鬥紀錄 → ${file}`);
  console.log(Object.entries(out).map(([k, r]) => `${k}: ${r.phase} (${r.log.length})`).join('\n'));
} else if (mode === 'compare') {
  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
  let bad = 0;
  for (const k of Object.keys(ref)) {
    const a = ref[k], b = out[k];
    if (!b) { console.log(`✗ ${k}：缺少`); bad++; continue; }
    const n = Math.max(a.log.length, b.log.length);
    let first = -1;
    for (let i = 0; i < n; i++) if (a.log[i] !== b.log[i]) { first = i; break; }
    const same = first < 0 && JSON.stringify(a.stats) === JSON.stringify(b.stats) && JSON.stringify(a.units) === JSON.stringify(b.units) && a.fx === b.fx && a.phase === b.phase;
    if (!same) {
      bad++;
      console.log(`✗ ${k}`);
      if (first >= 0) console.log(`   第 ${first} 行不同：\n   基準：${a.log[first]}\n   目前：${b.log[first]}`);
      else console.log('   紀錄相同，但統計／單位狀態／特效資料不同');
    }
  }
  console.log(bad ? `\n${bad} 場不一致` : `\n全部 ${Object.keys(ref).length} 場一致 ✓`);
  process.exit(bad ? 1 : 0);
}
