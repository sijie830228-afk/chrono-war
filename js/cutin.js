'use strict';
/* Fast, non-blocking cast signatures. Decorative only: no combat state or timers. */
const CastFx = (() => {
  const THEMES = {
    kane: ['#f65f70', '#191c2c', '線索交織・證據收束'],
    longzhao: ['#ff7256', '#241319', '機械威懾・贏家通吃'],
    mocha: ['#b4e9ff', '#15223f', '雙人代理・契約執行'],
    alan: ['#ffb96b', '#262027', '遠距鎖定・掩護展開'],
    alexandra: ['#7ddcfa', '#111e38', '警戒解除・全速執勤'],
    hanye: ['#bcb3ff', '#191a38', '空間構造・唯一解'],
    gordon: ['#f3cf78', '#242019', '市場收束・全盤掌握'],
    mark: ['#83dbff', '#112e42', '水行有道・盈科後進'],
    miller: ['#c7b9f0', '#22192d', '雨中送行・銘記不忘'],
    otg: ['#f48a9e', '#230f24', '苦難解封・滿月無神'],
  };
  const line = (x1,y1,x2,y2,cls='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
  const path = (d,cls='') => `<path d="${d}" class="${cls}"/>`;
  const circle = (x,y,r,cls='') => `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`;
  const text = (x,y,s,cls='') => `<text x="${x}" y="${y}" class="${cls}">${s}</text>`;
  function paper(x,y,n,rot) {
    const clue = n % 2 ? '<path class="cs-photo" d="M-45 3v-33h17v-17h30v30h20v-39h20V3ZM-19-32h8m-8 10h8m39-15h8"/>'
      : '<path class="cs-print" d="M-32-8q-8-46 28-47T32-8M-22-5q-9-40 19-40T22-5M-12-2q-8-34 9-34T12-2M-2 2q-7-32 0-29T4-3"/>';
    return `<g transform="translate(${x} ${y}) rotate(${rot})" class="cs-evidence">
      <rect x="-64" y="-82" width="128" height="164" rx="2"/>
      <path d="M-46-58h92v66h-92zM-46 29h92M-46 43h68M-46 57h84"/>
      ${clue}${text(25,69,'0'+n,'cs-ink')}${circle(0,-76,7,'cs-pin')}</g>`;
  }
  function scene(key, o) {
    switch (key) {
      case 'kane': return `<g data-motif="evidence-web">
        <g class="cs-board">${Array.from({length:9},(_,i)=>line(70+i*180,80,70+i*180,850)).join('')}</g>
        ${[[170,180,-12],[650,126,9],[1120,190,-7],[1440,400,8],[1150,755,-10],[280,730,5]].map((p,i)=>paper(p[0],p[1],i+1,p[2])).join('')}
        <g class="cs-redthread cs-draw">${path('M170 104 1120 114 280 654 1440 324 650 50 1150 679 170 104M280 654 1120 114M650 50 1440 324')}</g>
        <g class="cs-stamp" transform="translate(1220 340) rotate(-9)"><rect x="-155" y="-55" width="310" height="110"/>${text(0,22,'結 案','cs-center')}</g></g>`;
      case 'longzhao': return `<g data-motif="mechanical-claw">
        <g class="cs-armor">${path('M0 250 340 120 740 260 1070 70 1600 260V670L1250 790 850 660 480 840 0 650Z')}
        ${path('M70 360 330 220 730 370M1030 170 1490 350M120 630 440 740 850 560M1100 630 1450 740')}</g>
        <g class="cs-gear" transform="translate(1190 375)">${circle(0,0,160)}${circle(0,0,120)}${Array.from({length:12},(_,i)=>`<path transform="rotate(${i*30})" d="M0-180v48"/>`).join('')}</g>
        <g class="cs-claw cs-draw">${[0,1,2].map(i=>path(`M${350+i*130} 60Q${430+i*110} 330 ${1090+i*120} 820`)).join('')}</g>
        <g class="cs-shards">${[0,1,2,3,4,5].map(i=>path(`M${930+i*65} ${180+i*65}l60-25-22 60z`)).join('')}</g></g>`;
      case 'mocha': return `<g data-motif="dual-contract">
        <g transform="translate(1100 360) rotate(-8)" class="cs-contract"><rect x="-240" y="-250" width="480" height="570" rx="8"/>
          ${text(-180,-165,'代理執行','cs-contract-title')}${Array.from({length:6},(_,i)=>line(-175,-100+i*46,170,-100+i*46)).join('')}
          ${path('M-165 220q60-70 75-20t75-15q40-50 85-5','cs-signature')}
        </g><g class="cs-twin-seals">${[['兄',810,640],['弟',1310,590]].map(([s,x,y])=>`<g transform="translate(${x} ${y})">${circle(0,0,88)}${circle(0,0,76)}${text(0,24,s,'cs-center')}</g>`).join('')}</g>
        <g class="cs-ice">${[100,360,670,1430,1570].map((x,i)=>path(`M${x} 810l-42-170 42-120 45 120z`)).join('')}</g>
        ${path('M0 820Q800 620 1600 820','cs-draw')}</g>`;
      case 'alan': return `<g data-motif="sniper-solution">
        <g class="cs-reticle" transform="translate(1140 340)">${circle(0,0,210)}${circle(0,0,176)}${circle(0,0,48)}
          ${line(-285,0,285,0)}${line(0,-275,0,275)}${Array.from({length:12},(_,i)=>`<path transform="rotate(${i*30})" d="M0-199v23"/>`).join('')}
          ${text(65,-55,'LOCKED','cs-mono')}${text(65,-20,'RANGE 0900','cs-mono')}
        </g><g class="cs-trajectory cs-draw">${path('M-100 740Q700 680 1140 340M-100 756Q700 696 1140 340')}</g>
        <g class="cs-shieldmesh">${[0,1,2,3,4].map(i=>path(`M${100+i*220} 770l70-120h140l70 120-70 120h-140z`)).join('')}</g>
        <g class="cs-rounds">${[0,1,2].map(i=>`<g transform="translate(${1340+i*65} 715) rotate(23)"><path d="M-14 70V-45L0-85 14-45V70Z"/>${line(-14,45,14,45)}</g>`).join('')}</g></g>`;
      case 'alexandra': return `<g data-motif="police-drift">
        <path d="M0 50 1600 300V580L0 250Z" class="cs-redlight"/><path d="M1600 50 0 340V620L1600 230Z" class="cs-bluelight"/>
        <g class="cs-road">${[0,1,2,3,4].map(i=>path(`M${i*400-200} 790l210-85`)).join('')}${path('M0 860Q700 680 1600 720M0 885Q700 700 1600 740')}</g>
        <g class="cs-police-car">${o.carUrl ? `<image href="${o.carUrl}" x="800" y="465" width="600" height="300" preserveAspectRatio="xMidYMid meet"/>` : '<path d="M820 695l45-100h350l100 95 110 25v65H800v-55z"/>'}</g>
        <g class="cs-police-code">${text(1030,145,'NYPD / 09','cs-mono')}${text(1070,200,'PURSUIT','cs-mono')}${line(1000,220,1510,220)}</g></g>`;
      case 'hanye': return `<g data-motif="spatial-coordinates">
        <g class="cs-grid">${Array.from({length:12},(_,i)=>path(`M${i*160-100} 60V870M0 ${i*80}H1600`)).join('')}
          ${Array.from({length:10},(_,i)=>line(800,370,i*200-100,900)).join('')}</g>
        <g class="cs-axes">${path('M830 760H1530m-35-12 35 12-35 12M1080 850V110m-12 35 12-35 12 35M800 870 1400 280m-36 18 36-18-18 36')}
          ${text(1520,805,'x')}${text(1115,140,'y')}${text(1415,280,'z')}
        </g><g class="cs-functions cs-draw">${path('M810 670Q1000 120 1180 650T1580 480M850 520C1030 780 1210 130 1490 380')}
          ${circle(1180,650,12)}${line(1180,650,1180,760)}${line(1180,650,1080,650)}</g>
        <g class="cs-formula">${text(820,180,'∀ x ∈ ℝ³')}${text(1220,290,'∃!  f(x)')}${text(1000,835,'(x₀, y₀, z₀)')}${text(1260,100,'lim Δ → 0')}${text(70,730,'f : V → V')}</g></g>`;
      case 'gordon': return `<g data-motif="market-control">
        <g class="cs-market-grid">${Array.from({length:7},(_,i)=>line(0,150+i*100,1600,150+i*100)).join('')}</g>
        <g class="cs-candles">${Array.from({length:14},(_,i)=>{const x=120+i*105,y=700-i*32,h=70+(i%3)*24;return `<g class="${i%3===1?'cs-bear':'cs-bull'}">${line(x,y-h,x,y+h)}<rect x="${x-17}" y="${y-h*.5}" width="34" height="${h}"/></g>`;}).join('')}</g>
        <g class="cs-trend cs-draw">${path('M0 810 260 705 420 755 630 530 820 580 1080 350 1210 410 1530 145M1440 160 1530 145 1505 235')}</g>
        <g class="cs-coins">${[0,1,2,3,4].map(i=>`<g transform="translate(${1000+i*115} ${730-(i%2)*85}) rotate(${i*23})">${circle(0,0,42)}${circle(0,0,34)}${text(0,16,'＋','cs-center')}</g>`).join('')}</g>
        ${text(1120,110,'GDN  ↑  +99.9','cs-mono')}</g>`;
      case 'mark': return `<g data-motif="tide-and-dragon">
        <g class="cs-tide">${[0,1,2,3].map(i=>path(`M-100 ${660+i*70}Q200 ${350+i*75} 500 ${660+i*65}T1100 ${620+i*60}T1750 ${600+i*65}`)).join('')}</g>
        <g class="cs-water-dragon cs-draw">${path('M830 790C1300 890 1500 650 1270 540S1010 260 1340 235l90-55-35 100 80 32-86 30-80-24M1340 235l-35-95-50-35m50 35 32-55M1380 215l50-95 40-25m-40 25-10-45')}
          ${circle(1358,270,8)}${path('M1310 305q-95 20-120 110M1350 335q-85 80-35 140')}</g>
        <g class="cs-foam">${[0,1,2,3,4,5,6,7].map(i=>circle(800+i*95,580+Math.sin(i)*120,8+i%3*4)).join('')}</g>
        ${circle(1200,340,245,'cs-water-ring')}</g>`;
      case 'miller': return `<g data-motif="umbrella-farewell">
        <g class="cs-rain">${Array.from({length:28},(_,i)=>line(30+i*60,80+(i%4)*80,-40+i*60,380+(i%4)*80)).join('')}</g>
        <g class="cs-umbrella" transform="translate(1140 310)">${path('M-300 0Q0-335 300 0Q225-50 150 0Q75-50 0 0Q-75-50-150 0Q-225-50-300 0Z')}
          ${path('M0-170V355q0 80 70 40M0-170Q-140-110-150 0M0-170Q140-110 150 0')}</g>
        <g class="cs-petals">${Array.from({length:14},(_,i)=>`<path class="${i%2?'cs-white':'cs-poppy'}" transform="translate(${70+i*115} ${500+(i%4)*82}) rotate(${i*37})" d="M0-24Q32-30 19 3Q0 30-15 5Q-32-20 0-24Z"/>`).join('')}</g>
        <g class="cs-flower" transform="translate(1370 720)">${Array.from({length:12},(_,i)=>`<ellipse transform="rotate(${i*30})" cx="0" cy="-37" rx="9" ry="34"/>`).join('')}${circle(0,0,15)}</g>
        ${path('M650 840Q1100 740 1550 830','cs-memorial')}</g>`;
      case 'otg': return `<g data-motif="godless-moon">
        <g class="cs-moon">${circle(1190,285,205)}<g class="cs-craters">${[[1110,195,35],[1255,215,51],[1135,340,47],[1300,330,29],[1220,415,20],[1055,280,13],[1190,150,18],[1160,260,25],[1280,385,14]].map(p=>circle(...p)).join('')}</g>${path('M1110 90 1170 205 1110 290 1220 360 1160 475M1300 115 1240 240 1340 350')}</g>
        <g class="cs-inverted-cross">${path('M1190 360V735M1090 610H1290')}</g>
        <g class="cs-chains">${[0,1].map(j=>Array.from({length:18},(_,i)=>`<rect transform="translate(${i*100-30} ${j?870-i*38:30+i*38}) rotate(${j?-22:22})" x="-60" y="-${i%2?16:23}" width="120" height="${i%2?32:46}" rx="${i%2?16:23}"/>`).join('')).join('')}</g>
        <g class="cs-blood-orbit">${circle(1190,285,235)}${path('M985 400 960 600M1390 410 1420 670M1180 735l-10 80')}</g></g>`;
      default: return '';
    }
  }
  return {
    evidence: paper,
    theme: key => THEMES[key] || ['#dce5ff','#161b30','終結技'],
    has: key => !!THEMES[key],
    markup(key, options) {
      const body = scene(key, options || {});
      return body ? `<svg class="ci-scene" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true" focusable="false">${body}</svg>` : '';
    },
  };
})();
