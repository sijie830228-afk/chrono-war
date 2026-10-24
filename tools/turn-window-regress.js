'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,'js',n+'.js'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));let checks=0;const fixtures={};
function test(name,fn){fn();checks++;console.log('✓ '+name);}
function setup(team=['mocha','kane'],windows=true){
  const math=Object.create(Math);math.random=()=>.1;
  let now=0,next=0;const timers=new Map(),presented=[];
  const ctx=vm.createContext({console,Math:math,JSON,Object,Array,Number,String,Set,Map,
    innerWidth:1280,innerHeight:720,window:{addEventListener(){}},document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];}},
    setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(){},requestAnimationFrame(){},
    Sound:{play(){}},SaveSys:{touch(){}},seen:f=>presented.push(plain(f))});
  const run=s=>vm.runInContext(s,ctx);
  for(const name of ['relics','quotes','engine','cutin','ui'])run(read(name));
  const E=run('Engine'),cfg=run('JSON.parse(JSON.stringify(DEFAULT_CONFIG))');cfg.team=team;
  for(const k of Object.keys(cfg.rules))if(/Technique$/.test(k))cfg.rules[k]=false;
  Object.assign(cfg.rules,{enemyAttack:true,cashbox:false,critMode:'expected',toughness:false,maxCycles:50});
  cfg.build=Object.fromEntries(team.map(k=>[k,{useRelics:false,traces:{a1:false,a2:false,a3:false}}]));
  cfg.enemies=[{wave:1,type:'thug',name:'窗口測試靶',hp:2e6,atk:20,spd:100,lvl:80,tough:9999,weak:'物理,冰',effRes:0}];
  E.setInterrupts(true);E.setTurnWindows(windows);E.newBattle(cfg);
  while(E.state().phase==='between')E.proceed();
  const s=E.state(),a=s.units.find(u=>u.key===team.at(-1)),m=s.units.find(u=>u.key==='mocha'),e=s.units.find(u=>u.side==='enemy');
  s.phase='input';s.turnWindow=null;s.current=a.id;s.currentExtra=false;s.turnNo=42;s.sp=5;s.log=[];s.stats={};
  s.units.forEach(u=>{u.av=u.side==='enemy'?10000:1;u.energy=0;});s.target=e.id;
  if(m){s.proxy=a.id;a.mark='兄友';m.tacit=2;}
  E.drainEvents();
  run("renderBattle=()=>{};renderLogFull=()=>{};renderEnergyGains=()=>{};energyPulse=()=>{};appendLog=()=>{};recordBattleEnd=()=>{};closePop=()=>{};fx=f=>seen(f);playArea=()=>0;playUltCine=()=>0;scheduleAuto=()=>{};CFG.ui.anim=true;CFG.ui.ultAnim='off';view='battle';");
  return{E,cfg,ctx,run,s,a,m,e,presented,timers,tickAll(){let n=0;while(timers.size&&n++<1000){const [id,t]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);now=t.at;t.fn();}assert.ok(n<1000,'Playback must reach an input boundary');}};
}
test('Proxy waits through turn entry, targeting, preview and an inserted ultimate',()=>{
  const b=setup();b.s.phase='between';b.s.turnWindow={stage:'input',id:b.a.id};b.E.proceed();
  assert.equal(b.m.tacit,2);assert.equal(b.E.state().phase,'input');
  const before=JSON.stringify(b.E.state());assert.ok(b.E.preview('basic'));assert.equal(JSON.stringify(b.E.state()),before);
  b.E.setTarget(b.e.id);b.a.energy=b.a.maxEnergy;assert.ok(b.E.ult(b.a.id));assert.equal(b.m.tacit,2);
});
for(const kind of ['basic','skill'])test('Proxy completes before the confirmed '+kind+' cast and spends once',()=>{
  const b=setup();assert.ok(b.E.act(kind));const events=b.E.drainEvents();
  const proxy=events.findIndex(x=>x.entry.text.includes('插入代理執行'));
  const hit=events.findIndex(x=>x.entry.text.includes('【代理執行-兄】'));
  const cast=events.findIndex(x=>x.entry.type==='act'&&x.fx.src===b.a.id);
  assert.ok(proxy>=0&&hit>proxy&&cast>hit);assert.equal(b.m.tacit,0);assert.equal(b.a.mark,'弟恭');
  assert.equal(b.s.phase,'between');assert.equal(b.s.turnWindow.stage,'after');assert.equal(b.s.current,null);
  fixtures['proxy-'+kind]={before:events[0].snap,events};
});
test('Younger proxy buffs the action which was just confirmed',()=>{
  const b=setup();b.a.mark='弟恭';const atk=b.E.getAtk(b.a,b.e);b.E.act('basic');
  assert.ok(b.E.getAtk(b.a,b.e)>atk);const ev=b.E.drainEvents();
  assert.ok(ev.findIndex(x=>x.entry.text.includes('公關預算浮報'))<ev.findIndex(x=>x.entry.type==='act'));
});
test('An invalid skill never consumes proxy tacit or emits proxy events',()=>{
  const b=setup();b.s.sp=0;assert.equal(b.E.act('skill'),false);assert.equal(b.m.tacit,2);assert.equal(b.E.drainEvents().length,0);
});
test('Proxy wave clear preserves the uncast action and its skill point',()=>{
  const b=setup();b.e.hp=1;b.s.waves.push(plain(b.s.waves[0]));const sp=b.s.sp;b.E.act('skill');
  assert.equal(b.s.wave,1);assert.equal(b.s.phase,'input');assert.equal(b.s.current,b.a.id);assert.equal(b.s.sp,sp);
  assert.equal(b.a.energy,0);assert.ok(!b.E.drainEvents().some(x=>x.entry.type==='act'));
  b.E.act('skill');assert.equal(b.m.tacit,0);assert.equal(b.s.sp,sp-1);
});
function dotWindow(){
  const b=setup(['longzhao']);b.e.av=0;b.E.act('skill');b.E.drainEvents();b.a.energy=b.a.maxEnergy;
  b.E.proceed();return b;
}
test('Enemy DoT is real, but the enemy action has not been computed at the pre-turn window',()=>{
  const b=dotWindow(),ev=b.E.drainEvents();assert.ok(ev.some(x=>x.fx?.kind==='dot'));
  assert.ok(!ev.some(x=>x.fx?.src===b.e.id&&x.fx.kind==='dmg'));
  assert.equal(b.s.turnWindow.stage,'enemy');assert.equal(b.s.current,b.e.id);
  const time=b.s.time,turn=b.s.turnNo,dur=b.e.lacer.map(x=>x.dur);
  b.E.ult(b.a.id);assert.equal(b.s.turnWindow.stage,'enemy');assert.equal(b.s.time,time);assert.equal(b.s.turnNo,turn);
  b.E.proceed();const resumed=b.E.drainEvents();assert.equal(resumed.filter(x=>x.fx?.src===b.e.id&&x.fx.kind==='dmg').length,1);
  assert.ok(!resumed.some(x=>x.fx?.kind==='dot'));assert.equal(b.s.turnWindow.stage,'after');assert.ok(dur.every(n=>n===1));
});
test('Inserted ultimate can kill the pending enemy, which then never attacks',()=>{
  const b=dotWindow();b.e.hp=1;b.E.drainEvents();b.E.ult(b.a.id);assert.equal(b.s.phase,'win');
  b.E.proceed();assert.ok(!b.E.drainEvents().some(x=>x.fx?.src===b.e.id&&x.fx.kind==='dmg'));
});
test('Post-action ultimate is before the next turn and does not repeat the chosen action',()=>{
  const b=setup(['kane']);b.a.energy=b.a.maxEnergy-20;b.E.act('basic');
  assert.equal(b.s.turnNo,42);assert.equal(b.s.phase,'between');assert.equal(b.s.turnWindow.stage,'after');
  assert.ok(b.E.ult(b.a.id));assert.equal(b.s.turnNo,42);assert.equal(b.s.current,null);
  const ev=b.E.drainEvents();assert.equal(ev.filter(x=>x.entry.type==='act').length,1);assert.equal(ev.filter(x=>x.entry.type==='ult').length,1);
  b.E.proceed();assert.equal(b.s.turnNo,43);
});
test('Serialization and undo retain a pending enemy action without repeating DoT',()=>{
  const b=dotWindow(),saved=plain(b.E.exportState()),count=saved.log.filter(x=>x.type==='dot').length;
  b.E.ult(b.a.id);b.E.undo();assert.equal(b.E.state().turnWindow.stage,'enemy');
  b.E.importState(saved);b.E.proceed();assert.equal(b.E.state().log.filter(x=>x.type==='dot').length,count);
  assert.equal(b.E.state().turnWindow.stage,'after');
});
test('Extra enemy turns keep insertion windows while skipping regular DoT',()=>{
  const b=setup(['longzhao']);b.s.phase='between';b.s.extraQueue=[{id:b.e.id}];
  b.e.lacer=[{owner:b.a.id,dur:2}];b.E.proceed();assert.equal(b.s.turnWindow.stage,'enemy');
  assert.equal(b.s.currentExtra,true);assert.ok(!b.E.drainEvents().some(x=>x.fx?.kind==='dot'));
  b.E.proceed();assert.equal(b.s.turnWindow.stage,'after');
});
test('UI confirmation during DoT queues an ultimate before the enemy strike, without flushing',()=>{
  const b=setup(['longzhao']);b.e.av=0;b.E.act('skill');b.E.drainEvents();b.a.energy=b.a.maxEnergy;
  b.run('run(()=>Engine.proceed())');assert.equal(b.s.turnWindow.stage,'enemy');
  b.ctx.actor=b.a.id;b.run('armed=actor;fireUlt()');assert.equal(b.run('ultQueue.length'),1);assert.equal(b.s.log.filter(x=>x.type==='ult').length,0);
  b.tickAll();const f=b.presented,ult=f.findIndex(x=>x.kind==='ult'),enemy=f.findIndex(x=>x.kind==='dmg'&&x.src===b.e.id),dot=f.findIndex(x=>x.kind==='dot');
  assert.ok(dot>=0&&ult>dot&&enemy>ult);assert.equal(b.run('ultQueue.length'),0);
});
test('Aiming holds the pre-turn boundary; cancel resumes it',()=>{
  const b=dotWindow();b.E.drainEvents();b.ctx.actor=b.a.id;b.run('armed=actor;playing=false');
  assert.equal(b.run('pump()'),false);assert.equal(b.s.turnWindow.stage,'enemy');
  b.run('cancelUlt()');b.tickAll();assert.equal(b.run('armed'),null);assert.equal(b.s.phase,'input');
});
test('No-animation UI also resumes all windows to the next skill selection',()=>{
  const b=setup(['kane']);b.run("CFG.ui.anim=false;run(()=>Engine.act('basic'))");
  assert.equal(b.s.phase,'input');assert.equal(b.run('playing'),false);assert.equal(b.s.turnWindow,null);
});
for(const team of [['mocha','kane','longzhao'],['miller','otg','alexandra'],['gordon','hanye','mark','alan']])test('New windows preserve uninterrupted battle results: '+team.join('/'),()=>{
  function simulate(windows){
    const b=setup(team,windows);b.cfg.enemies[0].hp=120000;b.cfg.rules.maxCycles=8;
    b.cfg.rules.lzTechnique=true;b.cfg.rules.millerTechnique=true;b.E.newBattle(b.cfg);
    let steps=0;while(!['win','lose','timeout'].includes(b.E.state().phase)&&steps++<5000){
      if(b.E.state().phase==='between')b.E.proceed();else b.E.autoStep();
    }
    assert.ok(steps<5000);const s=b.E.state();
    return plain({phase:s.phase,time:s.time,sp:s.sp,stats:s.stats,units:s.units,log:s.log,flow:s.flow,loom:s.loom});
  }
  assert.deepEqual(simulate(true),simulate(false));
});
test('Empty and solid Kane markers use one glyph and one enemy icon, including malformed legacy overlap',()=>{
  const b=setup(['kane']);b.ctx.unit=b.e;b.e.peek=true;b.e.flagrant=true;
  b.run("enemyHpBars=()=>'';enemySvg=()=>'';buffChips=()=>'';barAttr=()=>'';curPv=null;");
  const html=b.run('enemyUnit(unit,Engine.state(),Engine.state())');
  assert.equal((html.match(/data-st="s:flagrant"/g)||[]).length,1);assert.ok(!html.includes('data-st="s:peek"'));
  assert.ok(b.run("statusChip('flagrant','現行犯',{solid:true})").includes('solid-mark'));
  assert.equal(b.run('SPECIAL_ST.peek[0]'),b.run('SPECIAL_ST.flagrant[0]'));
});
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures));
console.log(checks+' turn-window/proxy/marker checks passed');
