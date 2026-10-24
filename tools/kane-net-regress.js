'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,'js',n+'.js'),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
let checks=0;const previews={};
function test(name,fn){fn();checks++;console.log('✓ '+name);}
function setup(n,speed=1,enhanced=true){
  let now=0,next=0;const timers=new Map(),overlays=[],sounds=[],hits=[],recoils=[],renders=[];
  const cards=new Map();
  const card=id=>{if(!cards.has(id))cards.set(id,{id,style:{setProperty(){}},classList:{remove(){},add(){}},getBoundingClientRect(){return {left:id.startsWith('a_')?100:360+Number(id.at(-1))*190,top:id.startsWith('a_')?500:80,width:140,height:240};}});return cards.get(id);};
  const math=Object.create(Math);math.random=()=>.5;
  const c=vm.createContext({console,Math:math,JSON,Object,Array,Number,String,Set,Map,innerWidth:1500,innerHeight:900,
    setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay,delay});return id;},clearTimeout:id=>timers.delete(id),setInterval(){},requestAnimationFrame(){},
    document:{addEventListener(){},createElementNS:()=>({style:{setProperty(){}},setAttribute(k,v){this[k]=v;},remove(){this.removed=true;}}),
      querySelector:s=>s==='#fx'?{appendChild:el=>overlays.push(el)}:s==='.field'?card('field'):/data-uid="([^"]+)"/.test(s)?card(s.match(/data-uid="([^"]+)"/)[1]):null,
      querySelectorAll:s=>s.includes('.kane-net')?overlays.filter(x=>!x.removed):[],},
    window:{addEventListener(){}},Sound:{play:(name)=>sounds.push({name,at:now})},UltFx:{stop(){}},UltFilm:{stop(){}},UltCine:{stop(){}},
    renderSeen:s=>renders.push(plain(s)),hitSeen:f=>hits.push({f:plain(f),at:now}),recoilSeen:(id,cls)=>recoils.push({id,cls,at:now}),card,
  });
  const run=s=>vm.runInContext(s,c);
  for(const x of ['relics','quotes','engine','cutin','ui'])vm.runInContext(read(x),c);
  const E=run('Engine'),cfg=run('JSON.parse(JSON.stringify(DEFAULT_CONFIG))');cfg.team=['kane'];
  for(const k of Object.keys(cfg.rules))if(/Technique$/.test(k))cfg.rules[k]=false;
  Object.assign(cfg.rules,{cashbox:false,enemyAttack:false,critMode:'expected',toughness:false});
  cfg.build={kane:{useRelics:false,traces:{a1:false,a2:false,a3:false}}};
  cfg.enemies=Array.from({length:n},(_,i)=>({wave:1,type:'thug',name:'測試目標'+i,hp:2e6,atk:0,spd:100,lvl:80,tough:9999,weak:'物理',effRes:0}));
  E.setInterrupts(true);E.newBattle(cfg);E.drainEvents();const S=E.state(),a=S.units.find(u=>u.key==='kane'),es=S.units.filter(u=>u.side==='enemy');
  S.phase='input';S.current=a.id;S.currentExtra=false;S.target=es[0].id;a.energy=0;a.av=0;es.forEach(e=>e.av=10000);if(enhanced)es[0].flagrant=true;
  const before=plain(S);E.act('basic');const events=plain(E.drainEvents()),after=JSON.stringify(E.state());
  const index=events.findIndex(e=>e.fx&&e.fx.kind==='dmg'&&e.fx.line&&e.fx.src===a.id);
  assert.ok(index>=0);c.before=before;c.events=events.slice(index);c.previewEvents=events;c.battleConfig=cfg;
  run(`renderBattle=()=>renderSeen(V);renderEnergyGains=()=>renderSeen(V);renderLogFull=()=>{};appendLog=()=>{};energyPulse=()=>{};fx=f=>hitSeen(f);addCls=(el,cls)=>{if(el)recoilSeen(el.id,cls);};pump=()=>false;scheduleAuto=()=>{};CFG.ui.speed=${speed};CFG.ui.ultAnim='off';V=before;queue=groupSubs(events);playNext();`);
  return {E,c,run,before,events,after,hits,sounds,recoils,overlays,timers,es,k:1/Math.min(speed,2),tick(ms){
    const end=now+ms;while(true){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();}now=end;
  }};
}
for(const n of [1,3,5])for(const speed of [.5,1,2,4])test(`${n} targets at ${speed}x: contraction, all damage and energy land together`,()=>{
  const b=setup(n,speed);assert.equal(b.overlays.length,1);
  const svg=b.overlays[0];assert.ok(!/NaN|undefined|Infinity/.test(svg.innerHTML));
  assert.equal((svg.innerHTML.match(/class="knet-web"/g)||[]).length,n);
  assert.equal(b.run('V.units.find(u=>u.key==="kane").energy'),0);
  const end=[...b.timers.values()].find(t=>t.delay>=1040*b.k);assert.ok(end,'Queue must wait until the capped-speed animation finishes');
  b.tick(620*b.k-.01);assert.equal(b.hits.filter(x=>x.f.kind==='dmg').length,0);assert.equal(b.sounds.some(x=>x.name==='netSnap'),false);
  assert.equal(b.run('V.units.find(u=>u.side==="enemy").hp'),b.es[0].maxHp);
  b.tick(.01);const hits=b.hits.filter(x=>x.f.kind==='dmg');assert.equal(hits.length,n);
  assert.ok(hits.every(x=>x.at===620*b.k));assert.equal(b.sounds.filter(x=>x.name==='netSnap').length,1);
  assert.equal(b.run('V.units.find(u=>u.key==="kane").energy'),20);
  assert.equal(b.recoils.filter(x=>x.cls==='net-caught').length,n);
  assert.equal(JSON.stringify(b.E.state()),b.after);
  b.tick(5000);assert.equal(b.hits.filter(x=>x.f.kind==='dmg').length,n);assert.ok(svg.removed);
  if(speed===1)previews[n]={before:b.before,events:b.events,config:b.c.battleConfig};
});
test('Skipping/restarting cancels the net, delayed sound and pending hit presentation',()=>{
  const b=setup(3);b.tick(400);b.run('flush(true)');b.tick(3000);
  assert.ok(b.overlays[0].removed);assert.equal(b.hits.length,0);assert.equal(b.sounds.some(x=>x.name==='netSnap'),false);assert.equal(b.run('impactTimers.size'),0);
  assert.equal(JSON.stringify(b.E.state()),b.after);
});
test('An ordinary basic still uses its normal contact frame and no clue net',()=>{
  const b=setup(1,1,false);assert.equal(b.overlays.length,0);b.tick(89);assert.equal(b.run('V.units.find(u=>u.key==="kane").energy'),0);b.tick(1);
  assert.equal(b.run('V.units.find(u=>u.key==="kane").energy'),20);assert.equal(b.sounds.some(x=>x.name==='netSnap'),false);
});
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(previews));
console.log(checks+' clue-net checks passed');
