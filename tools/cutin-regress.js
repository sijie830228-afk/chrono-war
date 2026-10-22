'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..'), read = n => fs.readFileSync(path.join(root, 'js', n + '.js'), 'utf8');
const nodes = [], timers = new Map(), listeners = new Map(); let next = 0, checks = 0, fullCalls = 0;
const ctx = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Set, Map,
  innerWidth: 1280, innerHeight: 720, performance: { now: () => 0 },
  setTimeout: (fn, delay) => { const id = ++next; timers.set(id,{fn,delay}); return id; }, clearTimeout: id => timers.delete(id),
  setInterval() {}, requestAnimationFrame() {}, window: { addEventListener() {} },
  document: { addEventListener: (name, fn) => listeners.set(name, [...(listeners.get(name)||[]),fn]), querySelector: () => null,
    querySelectorAll: selector => selector.includes('.cutin') ? nodes.filter(n=>!n.removed) : [],
    createElement: () => ({ dataset: {}, style: { setProperty(k,v) { this[k]=v; } }, setAttribute() {}, remove() { this.removed=true; } }),
    body: { appendChild: el => nodes.push(el) },
  },
  Art: { get: k => ({url:'blob:'+k,w:512,h:768,facePx:[256,90]}) },
  Sound: { play() {} },
  UltFx: {stop(){},has:()=>true,impact:()=>100,play(){fullCalls++;return 2800;}},
  UltCine: {stop(){},has:()=>true,impact:()=>100,play(){fullCalls++;return 12000;}},
  UltFilm: {stop(){},has:()=>true,impact:()=>100,play(){fullCalls++;return 12000;}},
});
for (const n of ['relics','quotes','engine','cutin','ui']) vm.runInContext(read(n),ctx);
const run = s => vm.runInContext(s,ctx), E=run('Engine'), Cast=run('CastFx');
const keys=Object.keys(E.CHARS), previews={};
function battle(key) {
  const cfg=run('JSON.parse(JSON.stringify(DEFAULT_CONFIG))');
  cfg.team=[key]; for(const n of Object.keys(cfg.rules)) if(/Technique$/.test(n)) cfg.rules[n]=false;
  E.setInterrupts(true);E.newBattle(cfg);E.drainEvents();
  const s=E.state(),u=s.units.find(x=>x.key===key);s.current=u.id;s.phase='input';s.target=s.units.find(x=>x.side==='enemy').id;
  previews[key]=JSON.parse(JSON.stringify(s));
  return {s,u};
}
run("CFG.ui.ultAnim='off';addCls=()=>{};floatText=()=>{};closePop=()=>{};");
function test(n,fn){fn();checks++;console.log('✓ '+n);}
const motifs=new Set();
for(const key of keys) test(key+': real ultimate routes to a unique quick signature without changing combat',()=>{
  const b=battle(key), before=JSON.stringify(E.state());
  assert.ok(Cast.has(key));const svg=Cast.markup(key),m=svg.match(/data-motif="([^"]+)"/);
  assert.ok(m);assert.ok(!motifs.has(m[1]));motifs.add(m[1]);
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
  run(`fx({kind:'ult',src:${JSON.stringify(b.u.id)}})`);
  const el=nodes.at(-1);assert.equal(el.dataset.character,key);assert.ok(el.innerHTML.includes(m[1]));
  assert.ok(el.innerHTML.includes(E.CHARS[key].actions.ult));
  assert.equal(el.style['--dur'],'1.35s');assert.equal(JSON.stringify(E.state()),before);assert.equal(fullCalls,0);
  assert.equal(nodes.filter(n=>!n.removed).length,1,'No overlapping cut-ins');
});
test('Police car uses the actual available artwork with a geometry fallback',()=>{
  assert.ok(Cast.markup('alexandra',{carUrl:'blob:car'}).includes('href="blob:car"'));
  assert.ok(!Cast.markup('alexandra').includes('undefined'));
});
test('Settings preview uses quick mode for every character, including characters outside the current team',()=>{
  battle('hanye');const before=JSON.stringify(E.state()),config=run('JSON.stringify(CFG)');
  for(const key of keys){
    listeners.get('click').find(fn=>String(fn).includes("case 'ulttest'"))({target:{closest:selector=>selector.startsWith('button')?{dataset:{cmd:'ulttest',key}}:null}});
    assert.equal(nodes.at(-1).dataset.character,key);assert.ok(nodes.at(-1).innerHTML.includes(Cast.markup(key).match(/data-motif="([^"]+)"/)[1]));
  }
  assert.equal(fullCalls,0);assert.equal(JSON.stringify(E.state()),before);assert.equal(run('JSON.stringify(CFG)'),config);
});
test('Legacy disabled saves also preview quickly without changing the saved mode',()=>{
  run("CFG.ui.ultAnim=false;playUltShow('kane',Engine.state().units,Engine.state().target)");
  assert.equal(nodes.at(-1).dataset.character,'kane');assert.equal(run('CFG.ui.ultAnim'),false);assert.equal(fullCalls,0);
  run("CFG.ui.ultAnim='off'");
});
test('Cleanup cancels pending quick casts and removes their overlays',()=>{
  assert.ok(timers.size);run('clearCombatFx()');assert.equal(nodes.filter(n=>!n.removed).length,0);assert.equal(timers.size,0);
});
test('Fast playback shortens the signature; its timer cleans up independently',()=>{
  battle('kane');run("CFG.ui.speed=2;showCutin('a_kane')");
  const el=nodes.at(-1);assert.equal(el.style['--dur'],'0.675s');
  const t=[...timers.values()].at(-1);assert.equal(t.delay,775);t.fn();assert.ok(el.removed);
});
test('Missing artwork still shows the signature and skill name',()=>{
  battle('hanye');ctx.Art.get=()=>null;run("showCutin('a_hanye')");
  assert.ok(nodes.at(-1).innerHTML.includes('spatial-coordinates'));assert.ok(!nodes.at(-1).innerHTML.includes('<img'));
});
test('Unknown future characters have a harmless empty decorative scene',()=>{
  assert.equal(Cast.markup('future'), '');assert.equal(Cast.theme('future').length,3);
});
test('Full and short settings previews retain their selected presentation modes',()=>{
  for(const [mode,duration] of [['full',12000],['short',2800]]){
    run(`CFG.ui.ultAnim=${JSON.stringify(mode)}`);const n=fullCalls;
    assert.equal(run("playUltShow('kane',Engine.state().units,Engine.state().target)"),duration);
    assert.equal(fullCalls,n+1);assert.equal(run('CFG.ui.ultAnim'),mode);
  }
});
test('Both settings and pause-menu labels call the legacy off value Quick',()=>{
  assert.match(read('ui'), /value="off">快速<\/option>/);
  assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'), /value="off">快速<\/option>/);
});
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(previews));
console.log(checks+' quick-cast checks passed');
