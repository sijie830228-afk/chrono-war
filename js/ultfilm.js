'use strict';
/* =========================================================
 * 時序之戰 — 終結技短片（電影運鏡、場景插畫、英文配音）
 * 凱恩「結案」（12.5 秒，藍色調）
 *   第一幕 小巷監視（深夜雨巷）：敵人鬼鬼祟祟穿過巷口 → 陰影中的凱恩，車燈掃過雙眼 → 相機觀景窗、快門定格
 *   第二幕 警局查案（日光燈）：照片落在辦公桌上 → 時間飛逝的縮時：卷宗、咖啡、時鐘、紅線 → 最後一張照片釘上，線索匯聚 → 關燈出發
 *   第三幕 封鎖現場（艷陽）：封鎖線、警車警燈、整排警員 → 凱恩亮出警徽 → 敵人想逃，被壓制在引擎蓋上 → 手銬扣上 → 結案
 * 所有畫面在 1600×900 的設計座標中繪製，再等比放大到螢幕（以填滿為準）。
 * 亞歷山卓「速度與執勤」、寒夜「構造·唯一證明」、戈登「股票排山倒海」（各 11.5 秒，見下方各自的說明）
 * UltFilm.play(key, { enemies:[{type,name,main}], k, onSkip }) → 演出長度（毫秒）
 * ========================================================= */

const UltFilm = (() => {
  const W = 1600, H = 900, LW = 1800, LH = 1000;   // 設計尺寸；背景圖層多留邊，方便運鏡
  const TAU = Math.PI * 2;
  const D = () => UltFx.draw;
  const clamp = (x, a, b) => Math.max(a == null ? 0 : a, Math.min(b == null ? 1 : b, x));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;
  const eo = p => 1 - Math.pow(1 - p, 3);
  const eio = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const eback = p => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const bump = (t, a, w) => Math.max(0, 1 - Math.abs(t - a) / w);
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  let st = null;

  /* ================= 共用工具 ================= */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  /** 在來源圖上疊一層顏色（只影響不透明的部分） */
  function tint(src, fill, alpha) {
    const c = canvas(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = alpha == null ? 1 : alpha;
    g.fillStyle = typeof fill === 'function' ? fill(g, c.width, c.height) : fill; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function blurred(src, px) { const c = canvas(src.width, src.height), g = c.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); return c; }
  /** 鏡頭：以畫面中心縮放、旋轉、平移；p = 視差係數（遠景 < 1） */
  function cam(c, k, p) {
    p = p == null ? 1 : p;
    const z = 1 + (k.z - 1) * p;
    c.translate(W / 2, H / 2); c.rotate((k.r || 0) * p); c.scale(z, z); c.translate(-W / 2 - k.x * p, -H / 2 - k.y * p);
  }
  function keysAt(keys, t) {
    if (t <= keys[0].t) return keys[0];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t < b.t) { const p = (b.ease || eio)((t - a.t) / (b.t - a.t)); return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z: lerp(a.z, b.z, p), r: lerp(a.r || 0, b.r || 0, p) }; }
    }
    return keys[keys.length - 1];
  }
  const layer = (c, img) => c.drawImage(img, -(LW - W) / 2, -(LH - H) / 2);
  function glow(c, x, y, r, col, a) { if (a <= 0 || r <= 0) return; D().glowDot(c, x, y, r, col, a); }
  function full(c, col, a) { if (a <= 0) return; c.save(); c.globalAlpha = Math.min(1, a); c.fillStyle = col; c.fillRect(-W, -H, W * 3, H * 3); c.restore(); }
  function vignette(c, a, col) {
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col || 'rgba(0,4,14,1)');
    c.save(); c.globalAlpha = a; c.fillStyle = g; c.fillRect(-W, -H, W * 3, H * 3); c.restore();
  }
  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function poly(c, pts, col) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); if (col) { c.fillStyle = col; c.fill(); } }
  function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
  function rain(c, t, a, slant) {
    if (a <= 0) return;
    c.save(); c.globalAlpha = a; c.strokeStyle = 'rgba(170,200,240,.55)'; c.lineWidth = 1.4;
    for (let i = 0; i < 170; i++) {
      const sp = 1.4 + hash(i) * 1.2, len = 18 + hash(i + 9) * 34;
      const y = ((t * sp + hash(i + 3) * 1200) % (H + 120)) - 60, x = (hash(i + 5) * (W + 200) + y * (slant || 0.12)) % (W + 200) - 100;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - len * (slant || 0.12), y - len); c.stroke();
    }
    c.restore();
  }

  /* ---------- 凱恩立繪的打光版本 ---------- */
  /**
   * 角色立繪的各種打光版本（預先算好，每格直接貼圖）
   *   dark 陰影中、lit 被光照亮、rim 角色色的輪廓光、rimW 白色輪廓光、lamp 檯燈側光、day 日光、warm 逆光（暖色）
   * o：shadow 陰影色、light 受光色、rim 輪廓光色、lampRGB 燈光顏色、shade 暗部顏色
   */
  function prepHero(key, o) {
    const a = Art.get(key);
    if (!a || !a.canvas) return null;
    const src = a.canvas;
    return {
      a,
      dark: tint(src, o.shadow || '#040a1a', 0.86),
      lit: tint(src, o.light || '#bfe2ff', 0.18),
      rim: tint(src, o.rim || '#63b3ff', 1),
      rimW: tint(src, '#f6fbff', 1),
      lamp: tint(src, (g, w, h) => { const gr = g.createRadialGradient(w * 0.85, h * 0.05, 10, w * 0.85, h * 0.05, h * 0.95); gr.addColorStop(0, `rgba(${o.lampRGB || '255,244,222'},.1)`); gr.addColorStop(0.45, `rgba(${o.shade || '12,22,48'},.18)`); gr.addColorStop(1, `rgba(${o.shade || '3,8,22'},.82)`); return gr; }),
      day: tint(src, (g, w) => lin(g, 0, 0, w, 0, [[0, 'rgba(255,255,255,.1)'], [1, `rgba(${o.dayShade || o.shade || '24,58,120'},.3)`]])),
      warm: tint(src, (g, w, h) => lin(g, w, 0, 0, h, [[0, `rgba(${o.lampRGB || '255,190,120'},.28)`], [0.5, 'rgba(0,0,0,0)'], [1, `rgba(${o.shade || '40,10,30'},.55)`]])),
    };
  }
  const prepKane = () => prepHero('kane', { shadow: '#040a1a', light: '#bfe2ff', rim: '#63b3ff', lampRGB: '255,244,222', shade: '8,16,40', dayShade: '24,58,120' });
  /** 以臉部為錨點畫出凱恩 */
  const kane = (c, s, variant, fx, fy, h, o) => heroDraw(c, s.K, variant, fx, fy, h, o);
  /** 以臉部為錨點畫出角色；variant 為打光版本；rim = 描邊光的版本與偏移；band = 掃過的光帶 */
  function heroDraw(c, K, variant, fx, fy, h, o) {
    if (!K) return;
    o = o || {};
    const a = K.a, sc = h / a.h, w = a.w * sc;
    c.save();
    c.translate(fx, fy);
    if (o.rot) c.rotate(o.rot);
    if (o.flip) c.scale(-1, 1);
    const x = -a.facePx[0] * sc, y = -a.facePx[1] * sc;
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.rim) c.drawImage(K[o.rim], x + (o.rimDx || -5), y + (o.rimDy || -2), w, h);
    c.drawImage(K[variant], x, y, w, h);
    if (o.band) { // 掃過的光帶（例如車燈）：把受光版本分成多條細帶，中間亮、兩側漸暗，做出柔和的邊緣
      const n = 15, bw = o.band[1] / n, x0 = o.band[0] - fx - o.band[1] / 2;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n * 2 - 1;
        c.save(); c.globalAlpha = (o.alpha == null ? 1 : o.alpha) * Math.pow(Math.cos(u * Math.PI / 2), 1.6) * 0.85;
        c.beginPath(); c.rect(x0 + i * bw, -3000, bw + 1, 6000); c.clip();
        c.drawImage(K.lit, x, y, w, h); c.restore();
      }
    }
    c.restore();
  }

  /* =========================================================
   * 第一幕：小巷
   * ========================================================= */
  const MOUTH = { l: 760, r: 1040, t: 260, b: 720 };   // 巷口（背景圖層座標）
  function prepAlley(s) {
    // 遠景：巷口外的街道
    const far = canvas(LW, LH), f = far.getContext('2d');
    f.fillStyle = lin(f, 0, 0, 0, LH, [[0, '#050913'], [0.45, '#141e3a'], [0.72, '#1d2b52'], [1, '#0a1022']]); f.fillRect(0, 0, LW, LH);
    for (let i = 0; i < 9; i++) {   // 對街的建築與窗戶
      const bx = 640 + i * 70, bh = 180 + hash(i) * 220;
      rect(f, bx, 560 - bh, 66, bh + 160, i % 2 ? '#0e1630' : '#111b38');
      for (let y = 560 - bh + 14; y < 690; y += 22) for (let x = bx + 8; x < bx + 60; x += 16) if (hash(x * 3 + y) > 0.55) rect(f, x, y, 8, 11, hash(x + y) > 0.5 ? 'rgba(255,214,150,.55)' : 'rgba(140,200,255,.45)');
    }
    D().glowDot(f, 830, 420, 220, 'rgba(255,60,180,.35)', 1);
    D().glowDot(f, 980, 470, 260, 'rgba(60,200,255,.3)', 1);
    f.fillStyle = lin(f, 0, 690, 0, 740, [[0, '#2a3a66'], [1, '#101a34']]); f.fillRect(600, 690, 600, 60);   // 對街人行道
    rect(f, 700, 718, 400, 4, 'rgba(160,210,255,.35)');
    // 巷子：左右牆、地面、上方天空，巷口是透明的洞
    const wl = canvas(LW, LH), g = wl.getContext('2d');
    const M = MOUTH;
    g.fillStyle = lin(g, 0, 0, 0, M.t, [[0, '#070b18'], [1, '#0f1730']]); poly(g, [[0, 0], [LW, 0], [M.r, M.t], [M.l, M.t]]); g.fill();
    for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(200 + i * 60, 0); g.quadraticCurveTo(900, 120 + i * 30, 1600 - i * 70, 0); g.stroke(); }   // 電線
    g.fillStyle = lin(g, 0, 0, M.l, 0, [[0, '#0a1224'], [1, '#18244a']]); poly(g, [[0, 0], [M.l, M.t], [M.l, M.b], [0, LH]]); g.fill();
    g.fillStyle = lin(g, LW, 0, M.r, 0, [[0, '#0a1224'], [1, '#18244a']]); poly(g, [[LW, 0], [M.r, M.t], [M.r, M.b], [LW, LH]]); g.fill();
    g.fillStyle = lin(g, 0, LH, 0, M.b, [[0, '#0b1222'], [1, '#1a2748']]); poly(g, [[0, LH], [M.l, M.b], [M.r, M.b], [LW, LH]]); g.fill();
    // 磚縫（沿透視收斂）
    const wallRows = (x0, x1, top0, top1, bot0, bot1, side) => {
      g.strokeStyle = 'rgba(160,190,255,.05)'; g.lineWidth = 1.5;
      for (let i = 0; i <= 34; i++) { const v = i / 34; g.beginPath(); g.moveTo(x0, lerp(top0, bot0, v)); g.lineTo(x1, lerp(top1, bot1, v)); g.stroke(); }
      for (let i = 0; i < 34; i++) for (let j = 0; j < 22; j++) {
        const u = 1 - Math.pow(1 - (j + (i % 2) * 0.5) / 22, 1.8), x = lerp(x0, x1, u), v0 = i / 34, v1 = (i + 1) / 34;
        g.beginPath(); g.moveTo(x, lerp(lerp(top0, top1, u), lerp(bot0, bot1, u), v0)); g.lineTo(x, lerp(lerp(top0, top1, u), lerp(bot0, bot1, u), v1)); g.stroke();
      }
    };
    wallRows(0, M.l, 0, M.t, LH, M.b);
    wallRows(LW, M.r, 0, M.t, LH, M.b);
    const onWall = (x, side) => (side < 0 ? [lerp(0, M.t, x / M.l), lerp(LH, M.b, x / M.l)] : [lerp(0, M.t, (LW - x) / (LW - M.r)), lerp(LH, M.b, (LW - x) / (LW - M.r))]);
    [180, 430, 600].forEach(x => { const [a, b] = onWall(x, -1); g.strokeStyle = '#05080f'; g.lineWidth = 16 * (1 - x / 1100); g.beginPath(); g.moveTo(x, a); g.lineTo(x, b); g.stroke(); g.strokeStyle = 'rgba(120,170,255,.18)'; g.lineWidth = 2; g.stroke(); });   // 水管
    // 右牆的逃生梯
    g.strokeStyle = '#04070e'; g.lineWidth = 6;
    [0.28, 0.5].forEach(v => {
      const xs = [1200, 1650];
      g.beginPath(); xs.forEach((x, i) => { const [a, b] = onWall(x, 1); const y = lerp(a, b, v); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      xs.forEach(x => { const [a, b] = onWall(x, 1); g.beginPath(); g.moveTo(x, lerp(a, b, v)); g.lineTo(x, lerp(a, b, v) + 60 * (x / 1650)); g.stroke(); });
      for (let k = 0; k < 7; k++) { const x = lerp(1250, 1600, k / 6), [a, b] = onWall(x, 1); g.beginPath(); g.moveTo(x, lerp(a, b, v)); g.lineTo(x - 30, lerp(a, b, v) + 70); g.stroke(); }
    });
    // 地面的積水反光
    [[900, 780, 260, 26], [620, 880, 340, 34], [1200, 900, 300, 30]].forEach(([x, y, rx, ry]) => {
      g.save(); g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.clip();
      g.fillStyle = lin(g, 0, y - ry, 0, y + ry, [[0, 'rgba(120,180,255,.18)'], [1, 'rgba(255,80,200,.08)']]); g.fillRect(x - rx, y - ry, rx * 2, ry * 2);
      g.restore();
    });
    // 洞：巷口
    g.clearRect(M.l, M.t, M.r - M.l, M.b - M.t);
    s.alleyFar = far; s.alleyWall = wl;
    const both = canvas(LW, LH), b = both.getContext('2d'); b.drawImage(far, 0, 0); b.drawImage(wl, 0, 0);
    s.alleyBlur = blurred(both, 10);
  }
  /** 巷口走過的敵人（腳在巷口底部） */
  function sneakers(c, t, s) {
    const E = s.enShade;
    if (!E) return;
    const base = MOUTH.b - (LH - H) / 2 - 18, h = 250;
    [[560, 0], [470, 1], [380, 2]].forEach(([x0, i]) => {
      let dt = t;
      if (i === 1 && dt > 1500) dt = dt < 2100 ? 1500 : dt - 600;   // 第二個人停下來回頭張望
      const x = x0 + dt * 0.12, bob = Math.abs(Math.sin(dt * 0.012 + i)) * 6;
      const look = i === 1 && t > 1500 && t < 2100;
      const w = h * E.width / E.height;
      c.save(); c.translate(x, base - bob);
      if (look) c.scale(-1, 1);
      c.globalAlpha = 0.95; c.drawImage(E, -w / 2, -h, w, h);
      c.fillStyle = '#05070d'; c.fillRect(w * 0.12, -h * 0.42, 28, 22);   // 手提箱
      c.restore();
    });
  }
  function alleyScene(c, t, s, k) {
    c.save(); cam(c, k, 0.85); layer(c, s.alleyFar); c.restore();
    c.save(); cam(c, k, 0.9); sneakers(c, t, s); c.restore();
    c.save(); cam(c, k, 1); layer(c, s.alleyWall);
    // 霓虹招牌（閃爍）
    const fl = hash(Math.floor(t / 70)) > 0.08 ? 1 : 0.25;
    const nx = 470 - 100, ny = 300 - 50;
    c.save(); c.globalAlpha = fl;
    glow(c, nx + 20, ny + 90, 170, 'rgba(80,220,255,.45)', 1);
    c.fillStyle = '#0b1830'; c.fillRect(nx, ny, 44, 180);
    c.strokeStyle = '#7fe8ff'; c.lineWidth = 3; c.strokeRect(nx + 4, ny + 4, 36, 172);
    c.fillStyle = '#b8f4ff'; c.font = `900 30px ${D().SERIF}`; c.textAlign = 'center'; c.fillText('當', nx + 22, ny + 60); c.fillText('舖', nx + 22, ny + 120);
    c.restore();
    // 地面的雨滴漣漪
    c.strokeStyle = 'rgba(170,210,255,.35)'; c.lineWidth = 1.2;
    for (let i = 0; i < 18; i++) {
      const cyc = (t + hash(i) * 900) % 900 / 900, x = 200 + hash(i + 7) * 1200, y = 720 + hash(i + 3) * 160;
      c.globalAlpha = 1 - cyc; c.beginPath(); c.ellipse(x, y, 6 + cyc * 26, (6 + cyc * 26) * 0.25, 0, 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;
    c.restore();
    // 前景：右側的大垃圾箱、左側的垃圾袋（帶藍色輪廓光）
    c.save(); cam(c, k, 1.25);
    c.fillStyle = '#050912'; c.fillRect(1180, 610, 520, 330);
    c.fillStyle = '#070d1a'; poly(c, [[1160, 600], [1720, 600], [1700, 560], [1190, 570]]); c.fill();
    c.strokeStyle = 'rgba(110,180,255,.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(1190, 570); c.lineTo(1700, 560); c.stroke();
    c.fillStyle = '#04070e'; [[-40, 820, 170, 110], [90, 860, 150, 95]].forEach(([x, y, rx, ry]) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); });
    c.strokeStyle = 'rgba(110,180,255,.4)'; c.beginPath(); c.ellipse(90, 860, 150, 95, 0, -2.6, -1.2); c.stroke();
    c.restore();
    rain(c, t, 0.85, 0.14);
    full(c, '#0a1a3a', 0.12);
  }
  /** 觀景窗 POV（也用來拍下定格照片） */
  function viewfinder(c, t, s, still) {
    const k = { x: -10 + Math.sin(t * 0.004) * 4, y: 90 + Math.cos(t * 0.005) * 3, z: 2.0, r: 0 };
    alleyScene(c, t, s, k);
    // 觀景窗介面
    c.save();
    c.strokeStyle = 'rgba(235,245,255,.9)'; c.lineWidth = 4;
    const m = 70, L = 60;
    [[m, m, 1, 1], [W - m, m, -1, 1], [W - m, H - m, -1, -1], [m, H - m, 1, -1]].forEach(([x, y, sx, sy]) => { c.beginPath(); c.moveTo(x, y + sy * L); c.lineTo(x, y); c.lineTo(x + sx * L, y); c.stroke(); });
    c.lineWidth = 2; c.beginPath(); c.moveTo(W / 2 - 20, H / 2); c.lineTo(W / 2 + 20, H / 2); c.moveTo(W / 2, H / 2 - 20); c.lineTo(W / 2, H / 2 + 20); c.stroke();
    // 對焦框：鎖住回頭張望的人
    const fx = W / 2, fy = H / 2 + 10, fs = lerp(200, 140, eo(prog(t, 2950, 3200)));
    c.strokeStyle = t > 3150 ? '#6dffb0' : '#ffffff'; c.lineWidth = 3; c.strokeRect(fx - fs / 2, fy - fs * 0.75, fs, fs * 1.5);
    c.font = `700 26px "Courier New", monospace`; c.fillStyle = '#ff4a4a'; c.textAlign = 'left';
    if (still || Math.floor(t / 400) % 2) c.fillText('● REC', m + 20, m + 50);
    c.fillStyle = 'rgba(235,245,255,.9)'; c.fillText('ISO 6400   1/60   F1.8', m + 20, H - m - 24);
    c.textAlign = 'right'; c.fillText('02:47 AM', W - m - 20, m + 50);
    c.restore();
  }

  /* =========================================================
   * 第二幕：警局
   * ========================================================= */
  const BOARD = { x: 140, y: 90, w: 560, h: 380 }, CLOCK = { x: 870, y: 160, r: 70 }, LAMP = { x: 1130, y: 330 };
  const PINS = [[210, 170], [360, 150], [520, 190], [640, 140], [250, 330], [420, 290], [600, 360], [300, 430]];
  function prepOffice(s) {
    const bg = canvas(LW, LH), g = bg.getContext('2d');
    g.fillStyle = lin(g, 0, 0, 0, LH, [[0, '#101a2e'], [0.6, '#16223c'], [1, '#0c1426']]); g.fillRect(0, 0, LW, LH);
    for (let x = 0; x < LW; x += 120) rect(g, x, 0, 2, LH, 'rgba(255,255,255,.025)');
    // 軟木板與釘著的照片
    const B = { x: BOARD.x + 100, y: BOARD.y + 50, w: BOARD.w, h: BOARD.h };
    rect(g, B.x - 12, B.y - 12, B.w + 24, B.h + 24, '#2a2014'); rect(g, B.x, B.y, B.w, B.h, '#6a5238');
    for (let i = 0; i < 400; i++) rect(g, B.x + hash(i) * B.w, B.y + hash(i + 1) * B.h, 2, 2, 'rgba(0,0,0,.18)');
    PINS.forEach(([x, y], i) => {
      g.save(); g.translate(x + 100, y + 50); g.rotate((hash(i + 20) - 0.5) * 0.3);
      rect(g, -34, -28, 68, 56, i % 3 === 2 ? '#f2e8c8' : '#eef1f6');
      if (i % 3 === 2) { g.fillStyle = 'rgba(40,40,60,.6)'; for (let k = 0; k < 4; k++) g.fillRect(-26, -18 + k * 10, 44, 2); }
      else { rect(g, -28, -22, 56, 36, '#26314a'); g.fillStyle = '#05070d'; g.beginPath(); g.arc(0, -8, 8, 0, TAU); g.fill(); g.fillRect(-12, 0, 24, 14); }
      g.restore();
    });
    // 百葉窗外框（窗內顏色每格動態）
    const Wn = { x: 1250, y: 130, w: 520, h: 420 };
    rect(g, Wn.x - 14, Wn.y - 14, Wn.w + 28, Wn.h + 28, '#0a0f1c');
    g.clearRect(Wn.x, Wn.y, Wn.w, Wn.h);
    // 檔案櫃與盆栽
    rect(g, 1500, 560, 260, 300, '#0e1628'); for (let i = 0; i < 3; i++) { rect(g, 1510, 575 + i * 95, 240, 85, '#131d33'); rect(g, 1605, 610 + i * 95, 50, 8, '#2a3a5a'); }
    g.fillStyle = '#0a1320'; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(1440 + Math.sin(i) * 40, 480 + i * 12, 16, 60, Math.sin(i * 1.7) * 0.8, 0, TAU); g.fill(); }
    s.officeBG = bg; s.win = Wn;
    // 桌面（前景，擋住凱恩的下半身）
    const dk = canvas(LW, LH), d = dk.getContext('2d');
    d.fillStyle = lin(d, 0, 690, 0, LH, [[0, '#2b3955'], [0.08, '#1d2940'], [1, '#0d1424']]); d.fillRect(0, 690, LW, LH - 690);
    rect(d, 0, 686, LW, 8, '#3f5480');
    // 螢幕
    d.fillStyle = '#0a0f1a'; d.fillRect(170, 470, 330, 220); d.fillStyle = lin(d, 0, 480, 0, 680, [[0, '#1d3a6e'], [1, '#0e1d3a']]); d.fillRect(182, 482, 306, 196);
    d.fillStyle = 'rgba(160,210,255,.35)'; for (let i = 0; i < 9; i++) d.fillRect(200, 500 + i * 18, 120 + hash(i) * 140, 5);
    rect(d, 310, 690, 50, 20, '#0a0f1a');
    // 檯燈
    d.strokeStyle = '#0b111e'; d.lineWidth = 12; d.lineCap = 'round';
    d.beginPath(); d.moveTo(LAMP.x + 170, 700); d.lineTo(LAMP.x + 240, 520); d.lineTo(LAMP.x + 130, LAMP.y + 70); d.stroke();
    d.fillStyle = '#0b111e'; d.beginPath(); d.ellipse(LAMP.x + 170, 705, 70, 16, 0, 0, TAU); d.fill();
    d.fillStyle = '#18233a'; poly(d, [[LAMP.x + 60, LAMP.y + 40], [LAMP.x + 190, LAMP.y + 40], [LAMP.x + 160, LAMP.y + 110], [LAMP.x + 30, LAMP.y + 150]]); d.fill();
    s.deskFront = dk;
    // 俯視桌面（第一幕照片落下的地方）
    const tp = canvas(LW, LH), q = tp.getContext('2d');
    q.fillStyle = lin(q, 0, 0, LW, LH, [[0, '#1c2638'], [1, '#101826']]); q.fillRect(0, 0, LW, LH);
    for (let i = 0; i < 60; i++) { q.strokeStyle = `rgba(255,255,255,${0.01 + hash(i) * 0.02})`; q.lineWidth = 2; q.beginPath(); q.moveTo(0, i * 17 + hash(i) * 10); q.lineTo(LW, i * 17 + hash(i + 2) * 30); q.stroke(); }
    [[300, 260, 0.3], [1350, 640, -0.25], [520, 760, 0.12], [1280, 240, -0.08], [900, 850, 0.2]].forEach(([x, y, r], i) => {
      q.save(); q.translate(x, y); q.rotate(r); q.shadowColor = 'rgba(0,0,0,.5)'; q.shadowBlur = 14;
      rect(q, -150, -200, 300, 400, i % 2 ? '#e8ecf2' : '#dfe4ec'); q.shadowBlur = 0;
      q.fillStyle = 'rgba(40,50,70,.45)'; for (let k = 0; k < 14; k++) q.fillRect(-120, -160 + k * 24, 180 + hash(i * 9 + k) * 60, 5);
      q.restore();
    });
    q.strokeStyle = 'rgba(120,80,40,.35)'; q.lineWidth = 6; [[700, 320], [1050, 520]].forEach(([x, y]) => { q.beginPath(); q.arc(x, y, 58, 0.3, TAU - 0.5); q.stroke(); });   // 咖啡杯印
    q.fillStyle = '#0b111e'; q.save(); q.translate(1100, 360); q.rotate(0.6); q.fillRect(-150, -8, 300, 16); q.fillStyle = '#c9a44e'; q.fillRect(130, -8, 24, 16); q.restore();   // 鋼筆
    s.deskTop = tp;
  }
  /** 警局主場景：縮時攝影（t 決定時間流逝的進度） */
  function office(c, t, s, k, o) {
    o = o || {};
    const tl = prog(t, 4550, 6600);          // 縮時進度
    const lampOn = t < 7400 ? (hash(Math.floor(t / 90)) > 0.04 ? 1 : 0.5) : 0;
    c.save(); cam(c, k, 1);
    layer(c, s.officeBG);
    const ox = -(LW - W) / 2, oy = -(LH - H) / 2;
    // 窗外：白天與夜晚快速交替
    const cyc = 0.5 + 0.5 * Math.cos(tl * TAU * 3);
    const Wn = s.win;
    c.fillStyle = lin(c, 0, Wn.y + oy, 0, Wn.y + Wn.h + oy, [[0, `rgb(${lerp(10, 140, cyc)},${lerp(20, 190, cyc)},${lerp(45, 235, cyc)})`], [1, `rgb(${lerp(20, 190, cyc)},${lerp(30, 215, cyc)},${lerp(60, 245, cyc)})`]]);
    c.fillRect(Wn.x + ox, Wn.y + oy, Wn.w, Wn.h);
    for (let y = Wn.y + oy; y < Wn.y + oy + Wn.h; y += 24) rect(c, Wn.x + ox, y, Wn.w, 14, 'rgba(10,16,30,.88)');
    // 時鐘（指針飛轉）
    const cx = CLOCK.x + ox + 100, cy = CLOCK.y + oy + 50;
    c.fillStyle = '#dfe6f0'; c.beginPath(); c.arc(cx, cy, CLOCK.r, 0, TAU); c.fill();
    c.strokeStyle = '#0b111e'; c.lineWidth = 6; c.stroke();
    const spin = t < 4550 ? 0 : (t - 4550) / 1000 * (tl < 1 ? 18 : 0);
    c.lineCap = 'round';
    c.strokeStyle = '#0b111e'; c.lineWidth = 6; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(spin * 0.08 - 1.2) * 40, cy + Math.sin(spin * 0.08 - 1.2) * 40); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(spin - 0.4) * 58, cy + Math.sin(spin - 0.4) * 58); c.stroke();
    // 紅線：一條條拉上；最後一張照片釘上後全部匯聚
    const bx = ox + 100, by = oy + 50;
    const strings = [[0, 1], [1, 2], [4, 5], [2, 6], [5, 6], [0, 4], [3, 6], [7, 5]];
    c.strokeStyle = '#e02a36'; c.lineWidth = 3;
    strings.forEach(([a, b], i) => {
      const p = prog(t, 4700 + i * 230, 4900 + i * 230);
      if (p <= 0) return;
      const A = PINS[a], B = PINS[b];
      c.beginPath(); c.moveTo(A[0] + bx, A[1] + by); c.lineTo(lerp(A[0], B[0], p) + bx, lerp(A[1], B[1], p) + by); c.stroke();
    });
    const FIN = [470, 250];
    if (t > 6420) {
      const q = eo(prog(t, 6420, 6520));
      c.save(); c.translate(FIN[0] + bx, FIN[1] + by - (1 - q) * 300); c.rotate(-0.1 + (1 - q) * 0.6);
      rect(c, -44, -36, 88, 72, '#ffffff'); rect(c, -38, -30, 76, 48, '#26314a');
      if (s.enShade) { const h = 44, w = h * s.enShade.width / s.enShade.height; c.drawImage(s.enShade, -w / 2, -28, w, h); }
      c.restore();
      const cp = eo(prog(t, 6520, 6800));
      c.save(); c.strokeStyle = '#ff3a46'; c.lineWidth = 4; c.shadowColor = '#ff2030'; c.shadowBlur = 16 * (1 - prog(t, 6800, 7400));
      PINS.forEach(([x, y]) => { c.beginPath(); c.moveTo(x + bx, y + by); c.lineTo(lerp(x, FIN[0], cp) + bx, lerp(y, FIN[1], cp) + by); c.stroke(); });
      c.restore();
      if (t > 6600) {   // 地址便條
        const a = prog(t, 6600, 6700);
        c.save(); c.globalAlpha = a; c.translate(FIN[0] + bx - 150, FIN[1] + by + 120); c.rotate(-0.05);
        rect(c, -80, -34, 180, 68, '#ffe88a');
        c.fillStyle = '#1a1f33'; c.font = `italic 700 24px Georgia, ${D().SERIF}`; c.textAlign = 'center'; c.fillText('Warehouse 17', 10, -2);
        c.font = `700 18px ${D().SANS}`; c.fillText('第九街 17 號倉庫', 10, 24);
        c.restore();
      }
    }
    PINS.forEach(([x, y]) => { c.fillStyle = '#c21a28'; c.beginPath(); c.arc(x + bx, y + by - 20, 5, 0, TAU); c.fill(); });
    // 凱恩（桌子後方，檯燈打光）
    const dark = t > 7400;
    kane(c, s, dark ? 'dark' : 'lamp', 720, 330, 1180, { rim: dark ? 'rim' : null, rimDx: 6, rot: -0.03 * tl });
    c.drawImage(s.deskFront, ox, oy);
    // 桌上的卷宗越疊越高、咖啡杯越來越多
    const piles = [[560, 3], [840, 5], [980, 2], [1320, 4]];
    piles.forEach(([x, n], i) => {
      const m = Math.floor(n * clamp(tl * 1.4 - i * 0.12) * 3);
      for (let j = 0; j < m; j++) { const y = 700 - j * 12; rect(c, x - 90 + hash(i * 7 + j) * 14, y - 10, 170, 12, j % 3 ? '#d9dfe8' : '#c9a44e'); rect(c, x - 90, y, 170, 2, 'rgba(0,0,0,.35)'); }
    });
    const cups = Math.floor(tl * 5.5);
    for (let i = 0; i < cups; i++) {
      const x = 640 + i * 95 + hash(i) * 20, y = 760 + hash(i + 3) * 40;
      c.fillStyle = '#e8ecf2'; poly(c, [[x - 24, y - 50], [x + 24, y - 50], [x + 18, y], [x - 18, y]]); c.fill();
      c.strokeStyle = '#e8ecf2'; c.lineWidth = 6; c.beginPath(); c.arc(x + 26, y - 30, 12, -1.2, 1.2); c.stroke();
      if (i === cups - 1) { c.strokeStyle = 'rgba(220,235,255,.3)'; c.lineWidth = 3; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x - 10 + k * 10, y - 56); c.bezierCurveTo(x - 20 + k * 10, y - 90 - Math.sin(t * 0.01 + k) * 10, x + k * 10, y - 110, x - 8 + k * 10, y - 140); c.stroke(); } }
    }
    // 電話（響）
    const ring = t > 5200 && t < 5900;
    const phx = 1360 + (ring ? Math.sin(t * 0.25) * 3 : 0);
    c.fillStyle = '#0b111e'; c.fillRect(phx - 70, 730, 140, 60); c.fillStyle = '#1a2640'; c.fillRect(phx - 80, 712, 160, 24);
    if (ring) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; [-1, 1].forEach(sd => { for (let k = 1; k <= 2; k++) { c.beginPath(); c.arc(phx + sd * 60, 712, 30 + k * 16, sd < 0 ? Math.PI + 0.5 : -0.5 - 0.6, sd < 0 ? Math.PI + 1.1 : -0.5 + 0.1); c.stroke(); } }); }
    // 檯燈光
    if (lampOn > 0) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * lampOn;
      const gx = LAMP.x + ox + 110, gy = LAMP.y + oy + 120;
      const gr = c.createRadialGradient(gx, gy + 120, 20, gx, gy + 260, 520);
      gr.addColorStop(0, 'rgba(220,235,255,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; poly(c, [[gx - 70, gy - 20], [gx + 70, gy - 40], [gx + 380, 900], [gx - 700, 900]]); c.fill();
      c.restore();
      glow(c, LAMP.x + ox + 110, LAMP.y + oy + 115, 90, 'rgba(230,240,255,.9)', lampOn);
    }
    c.restore();
    full(c, '#0a2a4a', 0.12);
    vignette(c, lerp(0.6, 0.85, tl) + (dark ? 0.1 : 0));
  }
  function clockClose(c, t, s) {
    full(c, '#121c30', 1);
    const cx = W / 2, cy = H / 2, R = 330;
    c.save(); c.translate(cx, cy); c.rotate(Math.sin(t * 0.004) * 0.02);
    c.fillStyle = '#dfe6f0'; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    c.strokeStyle = '#0b111e'; c.lineWidth = 22; c.stroke();
    c.fillStyle = '#0b111e'; c.font = `700 48px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = i / 12 * TAU - Math.PI / 2; c.fillText(String(i), Math.cos(a) * (R - 64), Math.sin(a) * (R - 64)); }
    const spin = (t - 5100) / 1000 * 24;
    c.lineCap = 'round';
    for (let k = 5; k >= 0; k--) {   // 動態模糊：分針留下殘影
      const a = spin - k * 0.09 - Math.PI / 2;
      c.globalAlpha = k ? 0.12 : 1; c.strokeStyle = '#0b111e'; c.lineWidth = 10;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * (R - 70), Math.sin(a) * (R - 70)); c.stroke();
    }
    c.globalAlpha = 1; c.lineWidth = 16; const ha = spin / 12 - Math.PI / 2 + 1;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(ha) * (R - 150), Math.sin(ha) * (R - 150)); c.stroke();
    c.fillStyle = '#c21a28'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill();
    c.restore();
    full(c, '#0a2a4a', 0.15); vignette(c, 0.8);
  }

  /* =========================================================
   * 第三幕：封鎖現場
   * ========================================================= */
  const CAR = { w: 560, h: 220, bar: [[276, 30], [322, 30]] };
  function prepDay(s) {
    const bg = canvas(LW, LH), g = bg.getContext('2d');
    g.fillStyle = lin(g, 0, 0, 0, 560, [[0, '#2a7de0'], [0.6, '#6fb3f2'], [1, '#c9e6ff']]); g.fillRect(0, 0, LW, 600);
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,.55)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(1150 + i * 150 + k * 40, 120 + i * 30 + Math.sin(k) * 10, 70, 22, 0, 0, TAU); g.fill(); } }
    // 建築群
    for (let i = 0; i < 16; i++) {
      const x = i * 118 - 20, h = 180 + hash(i + 40) * 260, col = i % 3 === 0 ? '#9dbadd' : i % 3 === 1 ? '#b7cde8' : '#86a6cc';
      g.fillStyle = lin(g, x, 0, x + 116, 0, [[0, col], [1, 'rgba(60,90,140,1)']]); g.fillRect(x, 560 - h, 116, h);
      g.fillStyle = 'rgba(40,70,120,.35)';
      for (let y = 560 - h + 18; y < 540; y += 30) for (let xx = x + 12; xx < x + 104; xx += 22) g.fillRect(xx, y, 12, 16);
    }
    g.fillStyle = lin(g, 0, 380, 0, 580, [[0, 'rgba(200,230,255,0)'], [1, 'rgba(200,230,255,.65)']]); g.fillRect(0, 380, LW, 200);
    // 人行道與街道
    g.fillStyle = '#c4d2e2'; g.fillRect(0, 560, LW, 50);
    g.fillStyle = lin(g, 0, 610, 0, LH, [[0, '#8595ad'], [1, '#56647c']]); g.fillRect(0, 610, LW, LH - 610);
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 9; i++) { const y = 700 + i * i * 6; g.fillRect(820 - i * 40, y, 60 + i * 12, 6 + i); }
    s.dayBG = bg;
    s.dayBlur = blurred(bg, 12);
    // 警車（側面，車頭朝右）
    const car = canvas(CAR.w, CAR.h), q = car.getContext('2d');
    q.fillStyle = 'rgba(0,0,0,.35)'; q.beginPath(); q.ellipse(280, 206, 270, 14, 0, 0, TAU); q.fill();
    q.beginPath(); q.moveTo(20, 170); q.lineTo(20, 122); q.quadraticCurveTo(30, 96, 92, 92); q.lineTo(170, 88); q.lineTo(222, 42); q.lineTo(372, 40); q.lineTo(432, 88); q.lineTo(520, 96); q.quadraticCurveTo(546, 102, 546, 132); q.lineTo(546, 170); q.closePath();
    q.fillStyle = lin(q, 0, 40, 0, 180, [[0, '#ffffff'], [0.55, '#e6edf6'], [1, '#aeb9c9']]); q.fill();
    q.strokeStyle = '#6d7b92'; q.lineWidth = 2; q.stroke();
    q.save(); q.clip(); q.fillStyle = '#1f4fbf'; q.fillRect(0, 126, CAR.w, 26); q.fillStyle = '#0f2a70'; q.fillRect(0, 150, CAR.w, 5); q.restore();
    q.fillStyle = '#ffffff'; q.font = '900 22px "Arial Black", Arial, sans-serif'; q.textAlign = 'center'; q.fillText('POLICE', 300, 147);
    [[[232, 50], [292, 50], [292, 88], [186, 88]], [[302, 50], [364, 50], [418, 88], [302, 88]]].forEach(pts => {
      poly(q, pts); q.fillStyle = lin(q, 0, 50, 0, 88, [[0, '#8fc3f5'], [1, '#1c2c48']]); q.fill();
      q.fillStyle = 'rgba(255,255,255,.35)'; poly(q, [[pts[0][0] + 10, 52], [pts[0][0] + 26, 52], [pts[0][0] + 6, 86], [pts[0][0] - 10, 86]]); q.fill();
    });
    q.strokeStyle = '#8a97ab'; q.lineWidth = 2; q.beginPath(); q.moveTo(296, 92); q.lineTo(296, 168); q.moveTo(186, 92); q.lineTo(180, 168); q.stroke();
    [[122, 170], [452, 170]].forEach(([x, y]) => {
      q.fillStyle = '#20252e'; q.beginPath(); q.arc(x, y - 4, 46, Math.PI, 0); q.fill();
      q.fillStyle = '#0b0d12'; q.beginPath(); q.arc(x, y, 38, 0, TAU); q.fill();
      q.fillStyle = '#9aa6b8'; q.beginPath(); q.arc(x, y, 19, 0, TAU); q.fill();
    });
    q.fillStyle = '#1a1f2a'; q.fillRect(262, 24, 76, 14);
    q.fillStyle = '#ffe9a0'; q.fillRect(536, 112, 10, 16);
    s.car = car;
  }
  function policeCar(c, t, x, y, k, flip, phase, bounce) {
    c.save(); c.translate(x, y + (bounce || 0)); c.scale(flip ? -k : k, k);
    c.drawImage(st.car, -CAR.w / 2, -CAR.h);
    // 警燈：紅藍交替
    const on = Math.floor((t + phase) / 140) % 2;
    CAR.bar.forEach(([bx, by], i) => {
      const col = i === 0 ? '255,40,60' : '40,120,255', lit = (i === on);
      c.fillStyle = lit ? `rgb(${col})` : `rgba(${col},.45)`; c.fillRect(bx - CAR.w / 2 - 14, by - CAR.h - 2, 28, 12);
      if (lit) glow(c, bx - CAR.w / 2, by - CAR.h + 4, 120, `rgba(${col},.6)`, 1);
    });
    c.restore();
  }
  /** 警員（程式繪製的平面插畫人形）；pose：hips 叉腰 / radio 對講機 / cross 抱胸 / cheer 歡呼 */
  function officer(c, t, x, y, k, pose, flip, seed) {
    c.save(); c.translate(x, y); c.scale(flip ? -k : k, k);
    const sway = Math.sin(t * 0.002 + seed) * 1.5;
    const cloth = lin(c, -40, 0, 40, 0, [[0, '#3a5690'], [1, '#132040']]);
    c.fillStyle = '#0c1220'; c.fillRect(-22, -150, 18, 150); c.fillRect(4, -150, 18, 150);
    c.fillStyle = '#05070c'; c.beginPath(); c.ellipse(-12, -2, 16, 7, 0, 0, TAU); c.ellipse(14, -2, 16, 7, 0, 0, TAU); c.fill();
    c.fillStyle = cloth; poly(c, [[-36, -272 + sway], [36, -272 + sway], [30, -146], [-30, -146]]); c.fill();
    c.fillStyle = '#05070c'; c.fillRect(-31, -162, 62, 12);
    c.fillStyle = '#e8c56a'; c.beginPath(); c.arc(-15, -240 + sway, 5, 0, TAU); c.fill();
    c.strokeStyle = cloth; c.lineWidth = 17; c.lineCap = 'round'; c.lineJoin = 'round';
    const arm = pts => { c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); };
    if (pose === 'cheer') { arm([[-30, -262], [-52, -310], [-46, -360]]); arm([[30, -262], [54, -312], [50, -362]]); }
    else if (pose === 'radio') { arm([[-30, -262], [-46, -205], [-30, -165]]); arm([[30, -262], [44, -240], [12, -290]]); c.fillStyle = '#05070c'; c.fillRect(4, -312, 12, 26); }
    else if (pose === 'cross') { arm([[-30, -262], [-36, -214], [22, -214]]); arm([[30, -262], [36, -206], [-20, -206]]); }
    else { arm([[-30, -262], [-58, -210], [-30, -168]]); arm([[30, -262], [58, -210], [30, -168]]); }
    c.fillStyle = '#c9ab94'; c.beginPath(); c.arc(0, -292 + sway, 19, 0, TAU); c.fill();
    c.fillStyle = '#10192e'; poly(c, [[-22, -302 + sway], [22, -302 + sway], [26, -322 + sway], [-24, -324 + sway]]); c.fill();
    c.fillStyle = '#05070c'; c.fillRect(-4, -304 + sway, 34, 6);
    c.fillStyle = '#e8c56a'; c.beginPath(); c.arc(0, -314 + sway, 4, 0, TAU); c.fill();
    c.restore();
  }
  /** 黃色封鎖線（隨風擺動，文字沿著帶子走） */
  function tape(c, t, y0, y1, amp) {
    const seg = 16, pts = [];
    for (let i = 0; i <= seg; i++) { const x = -120 + i / seg * (W + 240); pts.push([x, lerp(y0, y1, i / seg) + Math.sin(x * 0.008 + t * 0.004) * amp]); }
    const th = 46;
    c.save();
    c.fillStyle = '#ffd21a'; c.strokeStyle = '#b89400'; c.lineWidth = 2;
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y - th / 2) : c.moveTo(x, y - th / 2))); for (let i = seg; i >= 0; i--) c.lineTo(pts[i][0], pts[i][1] + th / 2); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#0b0b0b'; c.font = '900 19px "Arial Black", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < seg; i += 2) {
      const [xa, ya] = pts[i], [xb, yb] = pts[i + 2] || pts[i + 1];
      c.save(); c.translate((xa + xb) / 2, (ya + yb) / 2); c.rotate(Math.atan2(yb - ya, xb - xa));
      c.fillText(i % 4 ? 'DO NOT CROSS' : 'POLICE LINE', 0, 2); c.restore();
    }
    c.restore();
  }
  function sunFlare(c, k, a) {
    const sx = 300 - 100 - k.x * 0.3, sy = 110 - 50;
    glow(c, sx, sy, 420, 'rgba(255,250,225,.95)', a);
    glow(c, sx, sy, 90, 'rgba(255,255,255,1)', a);
    const dx = W / 2 - sx, dy = H / 2 - sy;   // 鏡頭光暈：沿著太陽到畫面中心的直線
    [[0.5, 60, 'rgba(140,200,255,.25)'], [0.9, 110, 'rgba(120,255,220,.14)'], [1.35, 40, 'rgba(255,200,140,.3)'], [1.7, 150, 'rgba(160,190,255,.12)']].forEach(([u, r, col]) => glow(c, sx + dx * u, sy + dy * u, r, col, a));
  }
  const OFFICERS = [[180, 560, 0.5, 'radio'], [300, 566, 0.52, 'hips'], [420, 560, 0.5, 'cross'], [640, 566, 0.52, 'hips'], [760, 558, 0.5, 'radio'], [1280, 562, 0.5, 'cross'], [1400, 566, 0.52, 'hips'], [1520, 560, 0.5, 'radio'],
    [90, 640, 0.66, 'hips'], [250, 648, 0.68, 'cross'], [1460, 646, 0.68, 'hips']];
  /** 封鎖現場主場景；o.pin = 敵人已被壓在引擎蓋上；o.cheer = 警員歡呼 */
  function dayScene(c, t, s, k, o) {
    o = o || {};
    c.save(); cam(c, k, 0.6); layer(c, s.dayBG); c.restore();
    c.save(); cam(c, k, 0.85);
    policeCar(c, t, 480, 600, 0.72, true, 70);
    policeCar(c, t, 1560, 590, 0.66, false, 210);
    OFFICERS.slice(0, 8).forEach(([x, y, sc, pose], i) => officer(c, t, x, y, sc, o.cheer && i % 2 ? 'cheer' : pose, i > 4, i));
    c.restore();
    c.save(); cam(c, k, 1);
    OFFICERS.slice(8).forEach(([x, y, sc, pose], i) => officer(c, t, x, y, sc, o.cheer && i === 1 ? 'cheer' : pose, i === 2, i + 10));
    const bounce = o.impact ? Math.sin((t - o.impact) * 0.05) * 14 * Math.max(0, 1 - (t - o.impact) / 500) : 0;
    policeCar(c, t, 1150, 760, 1.05, false, 0, bounce);
    // 擋風玻璃裂痕
    if (o.impact && t > o.impact) {
      c.save(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.translate(1150 + 1.05 * 60, 760 - 1.05 * 160 + bounce);
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.3; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 28, Math.sin(a) * 20); c.lineTo(Math.cos(a + 0.2) * 50, Math.sin(a + 0.2) * 34); c.stroke(); }
      c.restore();
    }
    // 嫌疑人
    if (s.enMain) {
      const E = s.enMain, h = 360, w = h * E.width / E.height;
      c.save();
      if (o.pin) { c.translate(1150 - 40, 760 - 205 + bounce); c.rotate(-1.35); c.drawImage(E, -w / 2, -h * 0.5, w, h); }
      else { const ex = o.flee ? lerp(1180, 1380, eo(o.flee)) : 1180; c.translate(ex, 760 - 30); if (o.flee) c.rotate(0.15 * o.flee); c.drawImage(E, -w / 2, -h, w, h); }
      c.restore();
    }
    c.restore();
    tape(c, t, 820, 780, 8);
  }

  /* =========================================================
   * 凱恩「結案」— 分鏡
   * ========================================================= */
  const KANE = {
    dur: 12500,
    voice: { pitch: 0.8, rate: 0.9 },
    vo: [[2300, 'Not yet.', '……還不是時候。', 2900], [2960, 'Lead me home.', '帶我找到你們的老巢。', 3500],
      [4700, 'Where are you hiding…', '你們躲到哪裡去了……', 6300], [6720, '…there.', '……找到了。', 7300],
      [8750, 'Hands where I can see them.', '雙手放在我看得到的地方。', 9700], [11150, 'Case closed.', '結案。', 12300]],
    setup(s) {
      s.K = prepKane(s);
      const shade = Art.enemy('thug');
      s.enShade = shade ? tint(shade.canvas, '#05070d', 0.55) : null;
      const main = s.enemies.find(e => e.main) || s.enemies[0];
      const em = main && Art.enemy(main);
      s.enMain = em ? em.canvas : s.enShade;
      prepAlley(s); prepOffice(s); prepDay(s);
      s.snap = canvas(W, H); viewfinder(s.snap.getContext('2d'), 3250, s, true);   // 快門定格的那張照片
    },
    score() {
      return {
        cues: [[0, 'rain', { dur: 3.9, vol: 0.14 }], [250, 'footsteps', { n: 12, gap: 0.26, vol: 0.6 }], [2280, 'whoosh', { dur: 0.7, vol: 0.18 }], [2300, 'rumble', { dur: 0.7, vol: 0.1 }],
          [3250, 'shutter'], [3260, 'impact', { vol: 0.3 }], [3700, 'whooshDown', { dur: 0.3 }], [4120, 'paper', { n: 6 }],
          [4550, 'ticks', { dur: 2, gap: 0.06, slow: 1 }], [5100, 'ticks', { dur: 0.35, gap: 0.018, slow: 1 }], [5200, 'ring', { n: 1 }], [5900, 'paper', { n: 6 }],
          [6420, 'stamp'], [6520, 'chime', { notes: [76, 81, 84] }], [6800, 'riser', { dur: 1.1, vol: 0.14 }], [7400, 'click'], [7700, 'door'],
          [7950, 'impact', { vol: 0.5 }], [7950, 'siren', { dur: 4.3 }], [8050, 'radio', { n: 5 }], [8500, 'footsteps', { n: 3, gap: 0.3 }], [8950, 'chime', { notes: [88, 91, 95] }],
          [9550, 'whoosh', { dur: 0.35 }], [10050, 'impact', { vol: 1 }], [10060, 'glass', { vol: 0.35, n: 12 }], [10520, 'cuffs'],
          [10950, 'sting', { notes: [40, 52, 56, 59, 64], dur: 2.6 }], [11000, 'shutter']],
        bed: [[0, [28, 35, 40]], [3950, [33, 40, 45, 48]], [6600, [35, 42, 47]], [7950, [40, 47, 52, 56]], [10950, [40, 52, 56, 59, 64]]],
      };
    },
    shake: [[3250, 120, 6], [7950, 200, 10], [10050, 450, 26]],
    draw(c, t, s) {
      /* ---------- 第一幕 ---------- */
      if (t < 2200) { alleyScene(c, t, s, { x: -20 + t * 0.02, y: 10, z: 1 + eio(prog(t, 0, 2200)) * 0.12, r: 0 }); vignette(c, 0.75); return; }
      if (t < 2900) {   // 陰影中的凱恩，車燈掃過
        c.save(); cam(c, { x: 40, y: 0, z: 1.05 + prog(t, 2200, 2900) * 0.05, r: 0 }, 0.5); layer(c, s.alleyBlur); c.restore();
        full(c, '#020612', 0.55);
        const band = lerp(-500, 2000, prog(t, 2350, 2850));
        kane(c, s, 'dark', 980, 360, 1750, { rim: 'rim', rimDx: -6, band: [band, 520] });
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.18 * bump(t, 2600, 300);
        c.fillStyle = lin(c, band - 400, 0, band + 400, 0, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(200,225,255,1)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(0, 0, W, H); c.restore();
        c.fillStyle = '#01040b'; poly(c, [[0, 0], [360, 0], [300, H], [0, H]]); c.fill();   // 他躲著的牆角
        c.strokeStyle = 'rgba(110,180,255,.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(360, 0); c.lineTo(300, H); c.stroke();
        rain(c, t, 0.5, 0.1);
        vignette(c, 0.8);
        return;
      }
      if (t < 3350) {   // 觀景窗、快門
        viewfinder(c, t, s);
        full(c, '#ffffff', 0.9 * bump(t, 3260, 120));
        return;
      }
      if (t < 3950) {   // 定格成照片，飛出畫面
        if (!s.snap) { s.snap = canvas(W, H); viewfinder(s.snap.getContext('2d'), 3250, s, true); }
        full(c, '#02050c', 1);
        const p = eo(prog(t, 3350, 3650)), q = eio(prog(t, 3700, 3950));
        const pw = lerp(W, 560, p), ph = pw * H / W;
        c.save(); c.translate(W / 2 + q * 200, H / 2 + q * 700); c.rotate(-0.06 * p + q * 0.5);
        c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 30 * p;
        c.fillStyle = '#f4f2ec'; c.globalAlpha = p; c.fillRect(-pw / 2 - 26 * p, -ph / 2 - 26 * p, pw + 52 * p, ph + 110 * p); c.globalAlpha = 1; c.shadowBlur = 0;
        c.drawImage(s.snap, -pw / 2, -ph / 2, pw, ph);
        c.fillStyle = `rgba(20,30,50,${p * 0.8})`; c.font = `italic 700 ${Math.round(34 * p + 1)}px Georgia, serif`; c.textAlign = 'center'; c.fillText('02:47 — Alley, 9th St.', 0, ph / 2 + 58 * p);
        c.restore();
        full(c, '#ffffff', 0.7 * bump(t, 3350, 150));
        return;
      }
      /* ---------- 第二幕 ---------- */
      if (t < 4550) {   // 俯視桌面：照片落下
        c.save(); cam(c, { x: 0, y: 0, z: 1.05 + prog(t, 3950, 4550) * 0.05, r: lerp(0.04, -0.01, prog(t, 3950, 4550)) }, 1); layer(c, s.deskTop);
        const p = eo(prog(t, 3950, 4150));
        c.save(); c.translate(W / 2 + 40, lerp(-300, H / 2, p)); c.rotate(lerp(0.9, 0.12, p)); const z = lerp(1.6, 1, p); c.scale(z, z);
        c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 24; c.shadowOffsetX = 14 * z; c.shadowOffsetY = 18 * z;
        c.fillStyle = '#f4f2ec'; c.fillRect(-306, -196, 612, 450); c.shadowColor = 'transparent';
        if (s.snap) c.drawImage(s.snap, -280, -170, 560, 315);
        c.fillStyle = 'rgba(20,30,50,.8)'; c.font = 'italic 700 30px Georgia, serif'; c.textAlign = 'center'; c.fillText('02:47 — Alley, 9th St.', 0, 205);
        c.restore(); c.restore();
        glow(c, W * 0.7, H * 0.2, 700, 'rgba(210,230,255,.25)', 1);
        full(c, '#0a2a4a', 0.15); vignette(c, 0.7);
        return;
      }
      if (t < 5100) { office(c, t, s, { x: 0, y: 0, z: 1.02, r: 0 }); return; }
      if (t < 5450) { clockClose(c, t, s); return; }
      if (t < 5900) { office(c, t, s, { x: -120, y: -120, z: 1.75 + prog(t, 5450, 5900) * 0.1, r: 0 }); return; }
      if (t < 6600) { office(c, t, s, { x: -330, y: -170, z: 1.85 + prog(t, 5900, 6600) * 0.12, r: -0.01 }); return; }
      if (t < 7950) {   // 推近凱恩，關燈
        const p = eio(prog(t, 6600, 7350));
        office(c, t, s, { x: lerp(-100, -80, p), y: lerp(-120, -140, p), z: lerp(1.6, 2.3, p), r: 0 });
        if (t > 7400) full(c, '#01030a', 0.35);
        full(c, '#ffffff', prog(t, 7820, 7950));
        return;
      }
      /* ---------- 第三幕 ---------- */
      if (t < 9500) {   // 艷陽、封鎖線、凱恩走進畫面亮出警徽
        const k = { x: lerp(40, -30, eio(prog(t, 7950, 9500))), y: 0, z: lerp(1.12, 1.03, eo(prog(t, 7950, 8700))), r: 0 };
        dayScene(c, t, s, k);
        sunFlare(c, k, 0.9);
        const ex = lerp(-420, 330, eo(prog(t, 8450, 8950)));
        kane(c, s, 'day', ex, 300, 1300, { rim: 'rimW', rimDx: -7 });
        if (t > 8900) {   // 警徽
          const p = eo(prog(t, 8900, 9020));
          c.save(); c.translate(ex + 330, 560); c.rotate(-0.12); c.scale(p, p);
          c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 16;
          c.fillStyle = lin(c, -60, -70, 60, 70, [[0, '#fff6d0'], [0.5, '#d9b24a'], [1, '#8a6a1a']]);
          c.beginPath(); c.moveTo(0, -78); c.lineTo(58, -48); c.lineTo(52, 30); c.quadraticCurveTo(30, 70, 0, 82); c.quadraticCurveTo(-30, 70, -52, 30); c.lineTo(-58, -48); c.closePath(); c.fill();
          c.shadowBlur = 0; c.fillStyle = '#1d3f8f'; c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.fill();
          c.fillStyle = '#f5e7b0'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 10 : 24; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill();
          c.restore();
          D().glowDot(c, ex + 360, 520, 160 * bump(t, 9050, 200), 'rgba(255,255,255,.95)', 1);
        }
        full(c, '#ffffff', 1 - prog(t, 7950, 8250));
        vignette(c, 0.35, 'rgba(10,30,70,1)');
        return;
      }
      if (t < 10300) {  // 嫌疑人想逃 → 疾衝壓制
        const hit = t >= 10050;
        const k = { x: lerp(-30, 150, eio(prog(t, 9500, 10000))), y: 10, z: lerp(1.03, 1.12, eio(prog(t, 9500, 10000))), r: hit ? 0.02 : 0 };
        dayScene(c, t, s, k, { flee: hit ? 0 : prog(t, 9500, 10000), pin: hit, impact: hit ? 10050 : 0 });
        sunFlare(c, k, 0.7);
        c.save(); cam(c, k, 1);
        if (!hit) {
          for (let i = 4; i >= 0; i--) {
            const u = clamp(prog(t, 9650, 10050) - i * 0.06);
            kane(c, s, 'day', lerp(300, 820, eio(u)), lerp(300, 400, u), 820, { alpha: i ? 0.2 : 1, rim: i ? null : 'rimW' });
          }
        } else kane(c, s, 'day', 820, 400, 820, { rim: 'rimW', rot: 0.1 });
        if (hit) {   // 引擎蓋上揚起的塵土
          c.fillStyle = 'rgba(235,238,245,.55)';
          for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, d = eo(prog(t, 10050, 10300)) * (60 + hash(i) * 70); c.beginPath(); c.arc(1110 + Math.cos(a) * d, 590 + Math.sin(a) * d * 0.35, 12 + hash(i + 3) * 14, 0, TAU); c.fill(); }
        }
        c.restore();
        if (hit) {
          full(c, '#ffffff', 0.85 * (1 - prog(t, 10050, 10200)));
        }
        vignette(c, 0.35, 'rgba(10,30,70,1)');
        return;
      }
      if (t < 10900) {  // 手銬特寫
        c.save(); cam(c, { x: 0, y: 0, z: 1.4, r: 0.03 }, 1); layer(c, s.dayBlur); c.restore();
        c.fillStyle = lin(c, 0, 520, 0, H, [[0, '#f4f8fd'], [1, '#aebbd0']]); poly(c, [[0, 560], [W, 500], [W, H], [0, H]]); c.fill();   // 引擎蓋
        c.fillStyle = '#0a0d15'; c.save(); c.translate(W / 2, 600); c.rotate(-0.3); c.fillRect(-420, -46, 520, 92); c.rotate(0.6); c.fillRect(-100, -46, 520, 92); c.restore();   // 手腕
        const close = eo(prog(t, 10300, 10520));
        [[-150, -0.3], [150, 0.3]].forEach(([dx, rr], i) => {
          c.save(); c.translate(W / 2 + dx, 600); c.rotate(rr);
          c.strokeStyle = '#d7dfeb'; c.lineWidth = 24; c.beginPath(); c.arc(0, 0, 70, -Math.PI / 2, -Math.PI / 2 + TAU * (0.55 + 0.45 * close)); c.stroke();
          c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, 76, -2.6, -1.8); c.stroke();
          c.strokeStyle = '#6d7a90'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 58, 0, TAU); c.stroke();
          c.restore();
        });
        c.strokeStyle = '#b8c3d4'; c.lineWidth = 10; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(W / 2 - 60 + i * 60, 540, 26, 14, 0, 0, TAU); c.stroke(); }
        if (t > 10520) D().glowDot(c, W / 2 + 150, 540, 180 * bump(t, 10560, 180), 'rgba(255,255,255,.95)', 1);
        vignette(c, 0.45, 'rgba(10,30,70,1)');
        return;
      }
      // 收尾：拉遠、定格、片名
      const k = { x: 60, y: -10, z: lerp(1.1, 0.98, eo(prog(t, 10900, 12400))), r: 0 };
      dayScene(c, t, s, k, { pin: true, cheer: t > 11100 });
      sunFlare(c, k, 0.6);
      c.save(); cam(c, k, 1); kane(c, s, 'day', 760, 360, 1080, { rim: 'rimW', flip: true }); c.restore();
      const fr = prog(t, 10950, 11050);
      if (t > 10950) {   // 定格：畫面微微褪色，白色相框閃一下
        c.save(); c.globalCompositeOperation = 'saturation'; c.globalAlpha = 0.35 * fr; c.fillStyle = '#808080'; c.fillRect(-W, -H, W * 3, H * 3); c.restore();
        c.save(); c.strokeStyle = `rgba(255,255,255,${0.9 * (1 - prog(t, 11000, 11400))})`; c.lineWidth = 26; c.strokeRect(13, 13, W - 26, H - 26); c.restore();
        full(c, '#ffffff', 0.6 * bump(t, 11000, 150));
      }
      vignette(c, 0.4, 'rgba(10,30,70,1)');
      if (t > 11050) titleCard(c, t, s);
    },
  };
  /** 片名卡：乾淨的藍色排版 */
  function titleCard(c, t, s) {
    const a = eo(prog(t, 11050, 11450));
    c.save();
    c.globalAlpha = a;
    c.translate(-40 * (1 - a), 0);
    c.fillStyle = lin(c, 0, 0, 900, 0, [[0, 'rgba(8,28,72,.92)'], [0.75, 'rgba(8,28,72,.7)'], [1, 'rgba(8,28,72,0)']]);
    poly(c, [[0, 450], [900, 450], [860, 670], [0, 670]]); c.fill();
    c.fillStyle = '#7fb8ff'; c.fillRect(0, 446, 760 * a, 4);
    c.fillStyle = '#ffffff'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.font = `300 92px "Segoe UI Light", "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    if ('letterSpacing' in c) c.letterSpacing = '14px';
    c.fillText('CASE CLOSED', 70, 570);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    c.font = `900 56px ${D().SERIF}`; c.fillStyle = '#bfe0ff'; c.fillText('結案', 74, 642);
    c.font = `600 22px ${D().SANS}`; c.fillStyle = 'rgba(220,235,255,.85)'; c.fillText('KANE ／ 第九街分局 刑事組', 220, 635);
    c.restore();
  }

  /* =========================================================
   * 其他短片共用的道具與工具
   * ========================================================= */
  const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', 'K', 'Q', 'J', '10', '9', '7'];
  function prepEnemies(s) {
    const shade = Art.enemy('thug');
    s.enShade = shade ? tint(shade.canvas, '#05070d', 0.5) : null;
    const main = s.enemies.find(e => e.main) || s.enemies[0];
    const em = main && Art.enemy(main);
    s.enMain = em ? em.canvas : s.enShade;
  }
  /** 畫一個敵人剪影（腳底為錨點） */
  function foe(c, img, x, y, h, o) {
    if (!img) return;
    o = o || {};
    const w = h * img.width / img.height;
    c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot); if (o.flip) c.scale(-1, 1);
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.filter) c.filter = o.filter;
    c.drawImage(img, -w / 2, -h, w, h);
    c.restore();
  }
  function playingCard(c, x, y, sz, rot, suit, rank, o) {
    o = o || {};
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(sz * (o.sx == null ? 1 : o.sx), sz);
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 10;
    c.fillStyle = o.back ? '#7a0c16' : '#f7f3ea'; D().roundRect(c, -30, -42, 60, 84, 6); c.fill(); c.shadowBlur = 0;
    if (o.back) { c.strokeStyle = '#d8b04a'; c.lineWidth = 2; D().roundRect(c, -24, -36, 48, 72, 4); c.stroke(); c.beginPath(); c.moveTo(0, -30); c.lineTo(18, 0); c.lineTo(0, 30); c.lineTo(-18, 0); c.closePath(); c.stroke(); }
    else {
      c.fillStyle = suit % 3 ? '#c21a28' : '#16161c';
      c.font = `700 34px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(SUITS[suit], 0, 4);
      c.font = '800 15px Georgia, serif'; c.fillText(rank, -18, -28); c.save(); c.rotate(Math.PI); c.fillText(rank, -18, -28); c.restore();
    }
    if (o.cut) { c.strokeStyle = '#ff2a3a'; c.lineWidth = 4; c.beginPath(); c.moveTo(-34, 24); c.lineTo(34, -24); c.stroke(); }
    c.restore();
  }
  function chip(c, x, y, r, col, sq) {
    c.save(); c.translate(x, y); c.scale(1, sq == null ? 0.42 : sq);
    c.fillStyle = col; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = r * 0.22; c.setLineDash([r * 0.35, r * 0.35]); c.beginPath(); c.arc(0, 0, r * 0.8, 0, TAU); c.stroke();
    c.restore();
  }
  function chipStack(c, x, y, r, n, col) { for (let i = 0; i < n; i++) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x - r, y - i * r * 0.3, r * 2, r * 0.12); chip(c, x, y - i * r * 0.3, r, col); } }
  /** 平躺的輪盤（sq = 透視壓扁的比例） */
  function wheel(c, x, y, R, rot, ballA, ballR, sq, hi) {
    c.save(); c.translate(x, y); c.scale(1, sq);
    c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 40;
    c.fillStyle = '#2a1206'; c.beginPath(); c.arc(0, 0, R * 1.08, 0, TAU); c.fill(); c.shadowBlur = 0;
    c.save(); c.rotate(rot);
    for (let i = 0; i < 37; i++) {
      c.fillStyle = i === 0 ? '#0d5b30' : i % 2 ? '#8a0d1a' : '#111116';
      if (hi != null && i === hi) c.fillStyle = '#ff2a3a';
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, i / 37 * TAU, (i + 1) / 37 * TAU); c.closePath(); c.fill();
    }
    c.strokeStyle = '#d8b04a'; c.lineWidth = R * 0.03; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
    c.fillStyle = '#1a0a0c'; c.beginPath(); c.arc(0, 0, R * 0.6, 0, TAU); c.fill();
    c.strokeStyle = '#b8903a'; c.lineWidth = R * 0.025;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.beginPath(); c.moveTo(Math.cos(a) * R * 0.1, Math.sin(a) * R * 0.1); c.lineTo(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55); c.stroke(); }
    c.fillStyle = lin(c, -R * 0.1, -R * 0.1, R * 0.1, R * 0.1, [[0, '#fff2c0'], [1, '#8a6414']]); c.beginPath(); c.arc(0, 0, R * 0.12, 0, TAU); c.fill();
    c.restore();
    c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 20;
    c.beginPath(); c.arc(Math.cos(ballA) * R * ballR, Math.sin(ballA) * R * ballR, R * 0.025, 0, TAU); c.fill();
    c.restore();
  }
  /** 六角護盾（橢圓形的罩子） */
  function hexDome(c, cx, cy, rx, ry, t, a, rgb, hits) {
    if (a <= 0) return;
    c.save();
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU); c.closePath(); c.clip();
    c.fillStyle = `rgba(${rgb},${0.08 * a})`; c.fillRect(cx - rx, cy - ry, rx * 2, ry);
    const size = 34, hh = size * Math.sqrt(3);
    for (let col = -Math.ceil(rx / (size * 1.5)); col <= Math.ceil(rx / (size * 1.5)); col++) for (let row = -Math.ceil(ry / hh) - 1; row <= 1; row++) {
      const x = cx + col * size * 1.5, y = cy + row * hh + (col % 2 ? hh / 2 : 0);
      const wave = 0.5 + 0.5 * Math.sin((x + y) * 0.02 - t * 0.006);
      let hit = 0; (hits || []).forEach(h => { const d = Math.hypot(x - h[0], y - h[1]); hit = Math.max(hit, Math.max(0, 1 - d / 140) * Math.max(0, 1 - (t - h[2]) / 400) * (t >= h[2] ? 1 : 0)); });
      c.globalAlpha = a * (0.2 + 0.35 * wave + hit);
      c.strokeStyle = `rgb(${rgb})`; c.lineWidth = 2 + hit * 3;
      c.beginPath(); for (let i = 0; i < 6; i++) { const q = i * Math.PI / 3; c.lineTo(x + Math.cos(q) * size * 0.95, y + Math.sin(q) * size * 0.95); } c.closePath(); c.stroke();
    }
    c.restore();
    c.save(); c.globalAlpha = a * 0.8; c.strokeStyle = `rgb(${rgb})`; c.lineWidth = 4; c.shadowColor = `rgb(${rgb})`; c.shadowBlur = 20;
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU); c.stroke(); c.restore();
  }
  function fireball(c, x, y, R, a) {
    if (a <= 0 || R <= 0) return;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a;
    const g = c.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, '#fffbe8'); g.addColorStop(0.25, '#ffd66a'); g.addColorStop(0.55, '#ff7a1c'); g.addColorStop(0.85, 'rgba(180,30,10,.6)'); g.addColorStop(1, 'rgba(80,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill(); c.restore();
  }
  function iceBlock(c, x, y, w, h, a) {
    if (a <= 0) return;
    const pts = [[-w * 0.5, 0], [-w * 0.56, -h * 0.6], [-w * 0.34, -h * 1.02], [w * 0.2, -h * 1.08], [w * 0.55, -h * 0.72], [w * 0.5, 0]].map(([dx, dy]) => [x + dx * a, y + dy * a]);
    c.save();
    c.globalAlpha = 0.62;
    c.fillStyle = lin(c, x - w / 2, y - h, x + w / 2, y, [[0, 'rgba(235,250,255,.95)'], [0.5, 'rgba(110,200,255,.35)'], [1, 'rgba(200,240,255,.85)']]);
    poly(c, pts); c.fill();
    c.globalAlpha = 0.9; c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.moveTo(pts[1][0], pts[1][1]); c.lineTo(pts[3][0], pts[3][1]); c.moveTo(pts[2][0], pts[2][1]); c.lineTo(pts[4][0], pts[4][1]); c.stroke();
    c.restore();
  }
  function sweat(c, x, y, sz) {
    c.save(); c.translate(x, y); c.scale(sz, sz);
    c.fillStyle = '#8fd8ff'; c.strokeStyle = '#fff'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -30); c.quadraticCurveTo(22, 4, 0, 16); c.quadraticCurveTo(-22, 4, 0, -30); c.fill(); c.stroke();
    c.restore();
  }
  /** 片名卡（顏色可換） */
  function heroTitle(c, t, t0, o) {
    const a = eo(prog(t, t0, t0 + 400));
    if (a <= 0) return;
    c.save(); c.globalAlpha = a; c.translate(-40 * (1 - a), 0);
    c.fillStyle = lin(c, 0, 0, 980, 0, [[0, `rgba(${o.band},.92)`], [0.75, `rgba(${o.band},.7)`], [1, `rgba(${o.band},0)`]]);
    poly(c, [[0, 450], [980, 450], [940, 680], [0, 680]]); c.fill();
    c.fillStyle = o.accent; c.fillRect(0, 446, 840 * a, 4);
    c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = `300 ${o.enSize || 76}px "Segoe UI Light", "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    if ('letterSpacing' in c) c.letterSpacing = '10px';
    c.fillText(o.en, 70, 560);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    c.font = `900 ${o.zhSize || 52}px ${D().SERIF}`; c.fillStyle = o.zhCol || '#ffffff'; c.fillText(o.zh, 74, 636);
    if (o.sub) { c.font = `600 22px ${D().SANS}`; c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText(o.sub, 74 + (o.subX || 0), 668); }
    c.restore();
  }

  /* =========================================================
   * 龍爪「贏家奠定規則，輸家失去所有」（12 秒，血紅）
   *   第一幕 地下賭場：吊燈下的綠色賭桌、發牌；袖口藏牌的特寫；龍爪瞇眼一笑
   *   第二幕 ALL IN：輪盤旋轉、籌碼全推、滾珠落在紅 9；龍爪起身，義肢蓄力
   *   第三幕 掀桌：籌碼與撲克牌在慢動作中飛散 → 三道巨爪 → 牌雨中定格
   * ========================================================= */
  const SEATS = [560, 780, 1000];
  const DEAL = [[520, 700], [680, 722], [840, 730], [1000, 722], [1160, 700]];
  const STACKS = [[430, 640, '#c41e2c', 6], [470, 668, '#d8b34a', 8], [1180, 640, '#1b1b22', 7], [1225, 668, '#c41e2c', 5], [820, 612, '#e8e4da', 4]];
  function prepCasino(s) {
    const bg = canvas(LW, LH), g = bg.getContext('2d');
    g.fillStyle = lin(g, 0, 0, 0, LH, [[0, '#1c0307'], [0.65, '#120206'], [1, '#070103']]); g.fillRect(0, 0, LW, LH);
    g.strokeStyle = 'rgba(210,160,70,.06)'; g.lineWidth = 2;
    for (let y = -60; y < 380; y += 120) for (let x = -60; x < LW; x += 90) { g.beginPath(); g.moveTo(x, y + 60); g.lineTo(x + 45, y); g.lineTo(x + 90, y + 60); g.lineTo(x + 45, y + 120); g.closePath(); g.stroke(); }
    rect(g, 380, 110, 1040, 250, '#0c0204');
    for (let row = 0; row < 3; row++) {
      rect(g, 380, 190 + row * 70, 1040, 5, '#3a2410');
      for (let i = 0; i < 26; i++) {
        const x = 400 + i * 39 + hash(i * 3 + row) * 10, h = 34 + hash(i + row * 7) * 18;
        g.fillStyle = ['rgba(255,170,60,.55)', 'rgba(120,200,120,.4)', 'rgba(200,60,60,.5)', 'rgba(255,220,150,.45)'][Math.floor(hash(i * 5 + row) * 4)];
        g.fillRect(x, 190 + row * 70 - h, 14, h); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 2, 190 + row * 70 - h + 4, 2, h - 8);
      }
    }
    rect(g, 0, 380, LW, 8, '#8a6420'); rect(g, 0, 388, LW, 2, 'rgba(255,220,140,.5)');
    g.fillStyle = lin(g, 0, 390, 0, 720, [[0, '#2a0a0c'], [1, '#12030a']]); g.fillRect(0, 390, LW, 330);
    g.strokeStyle = 'rgba(210,160,70,.12)'; for (let x = 40; x < LW; x += 160) g.strokeRect(x, 420, 120, 250);
    g.fillStyle = lin(g, 0, 700, 0, LH, [[0, '#1a0806'], [1, '#080202']]); g.fillRect(0, 700, LW, LH - 700);
    s.casino = bg;
    const tb = canvas(LW, LH), q = tb.getContext('2d');
    poly(q, [[500, 555], [1300, 555], [1600, 905], [200, 905]], '#3a1a0a');
    q.fillStyle = lin(q, 0, 560, 0, 900, [[0, '#0d4a2c'], [1, '#063522']]); poly(q, [[520, 565], [1280, 565], [1570, 890], [230, 890]]); q.fill();
    q.strokeStyle = 'rgba(255,230,160,.5)'; q.lineWidth = 3; q.beginPath(); q.moveTo(500, 555); q.lineTo(1300, 555); q.stroke();
    q.strokeStyle = 'rgba(255,255,255,.14)'; q.beginPath(); q.ellipse(900, 760, 420, 110, 0, Math.PI * 1.05, Math.PI * 1.95); q.stroke(); q.beginPath(); q.ellipse(900, 800, 560, 150, 0, Math.PI * 1.05, Math.PI * 1.95); q.stroke();
    for (let i = 0; i < 5; i++) q.strokeRect(460 + i * 190, 690 + Math.abs(i - 2) * 14, 120, 60);
    rect(q, 200, 890, 1400, 30, '#240e05');
    s.table = tb;
    s.bits = Array.from({ length: 80 }, (_, i) => ({ x: 380 + hash(i) * 840, y: 560 + hash(i + 1) * 260, vx: (hash(i + 2) - 0.5) * 900, vy: -700 - hash(i + 3) * 1000, rot: hash(i + 4) * 6, vr: (hash(i + 5) - 0.5) * 10,
      card: i % 3 !== 0, suit: Math.floor(hash(i + 6) * 4), rank: RANKS[Math.floor(hash(i + 7) * 7)], col: ['#c41e2c', '#1b1b22', '#d8b34a', '#e8e4da'][i % 4], sz: 0.9 + hash(i + 8) * 0.8 }));
  }
  /** 賭場主場景；o.flip = 掀桌進度，o.knock(i) = 敵人被震退的程度，o.fallen = 敵人倒地 */
  function casino(c, t, s, k, o) {
    o = o || {};
    c.save(); cam(c, k, 0.8); layer(c, s.casino); c.restore();
    const sw = Math.sin(t * 0.0025) * 50;
    c.save(); cam(c, k, 1);
    if (!o.noEnemies) SEATS.forEach((x, i) => {
      const kb = o.knock ? o.knock(i) : 0;
      if (o.fallen) foe(c, s.enShade, x + (i - 1) * 120, 640, 300, { rot: (i % 2 ? 1.35 : -1.35), alpha: 0.9 });
      else foe(c, i === 1 ? s.enMain : s.enShade, x + kb * 160, 620, 330, { rot: kb * 0.35 });
    });
    if (o.flip != null) {
      const p = o.flip;
      c.save(); c.translate(800, 855); c.scale(1, 1 - p * 0.8); c.translate(0, -p * 520); c.translate(-800, -855);
      c.globalAlpha = 1 - prog(p, 0.7, 1); layer(c, s.table); c.restore();
    } else {
      layer(c, s.table);
      STACKS.forEach(([x, y, col, n]) => chipStack(c, x - 100, y - 50, 22, n, col));
      DEAL.forEach(([x, y], i) => {
        const p = eo(prog(t, 250 + i * 160, 600 + i * 160)); if (p <= 0) return;
        playingCard(c, lerp(800, x - 100, p), lerp(520, y - 50, p), 0.95, lerp(2, (i - 2) * 0.12, p), 0, 'A', { back: true, sx: 1 });
      });
    }
    // 吊燈
    c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.moveTo(800, -80); c.lineTo(800 + sw, 120); c.stroke();
    c.fillStyle = '#1a0a06'; poly(c, [[800 + sw - 30, 118], [800 + sw + 30, 118], [800 + sw + 90, 176], [800 + sw - 90, 176]]); c.fill();
    glow(c, 800 + sw, 180, 70, 'rgba(255,230,180,.95)', 1);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.4;
    const gr = c.createRadialGradient(800 + sw * 1.8, 660, 30, 800 + sw * 1.8, 660, 520); gr.addColorStop(0, 'rgba(255,220,160,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; poly(c, [[800 + sw - 90, 176], [800 + sw + 90, 176], [1450 + sw * 2, 900], [150 + sw * 2, 900]]); c.fill(); c.restore();
    c.restore();
    for (let i = 0; i < 5; i++) glow(c, (hash(i) * W + t * 0.02 * (i % 2 ? 1 : -1)) % W, 200 + hash(i + 4) * 400, 300, 'rgba(120,60,60,.08)', 1);   // 煙霧
    full(c, '#3a0008', 0.1);
  }
  const LONGZHAO = {
    dur: 12000,
    voice: { pitch: 0.95, rate: 0.95 },
    vo: [[300, 'My table.', '我的賭桌，', 1000], [1050, 'My rules.', '我的規矩。', 1750], [2600, 'Cheating?', '出老千？', 3150], [3350, "Then let's raise the stakes.", '那就……加大賭注吧。', 4600],
      [5400, 'Winner makes the rules.', '贏家，奠定規則。', 6300], [9900, 'And the loser—', '而輸家——', 10600], [10700, 'loses everything.', '失去一切。', 11800]],
    setup(s) {
      s.H = prepHero('longzhao', { shadow: '#12030a', light: '#ffd0c8', rim: '#ff4a4a', lampRGB: '255,210,150', shade: '40,4,12', dayShade: '90,20,30' });
      prepEnemies(s);
      prepCasino(s);
    },
    score() {
      return {
        cues: [[0, 'rumble', { dur: 3, vol: 0.08 }], [0, 'groove', { dur: 5, bpm: 96, riff: [38, 38, 45, 38, 43, 38, 41, 42], chords: [[50, 53, 57, 60], [48, 52, 55, 58]] }], [250, 'cards', { n: 6 }],
          [1850, 'swish', { vol: 0.15 }], [2300, 'chime', { notes: [88, 91] }], [2550, 'heartbeat'], [3200, 'ticks', { dur: 1.5, gap: 0.03, slow: 1.07 }], [3550, 'chips', { n: 22 }],
          [3700, 'stamp'], [4700, 'sting', { notes: [38, 45, 50, 53] }], [5200, 'rumble', { dur: 1.2, vol: 0.18 }], [5500, 'riser', { dur: 0.9, vol: 0.2 }],
          [6400, 'impact', { vol: 1 }], [6450, 'chips', { n: 30 }], [6450, 'cards', { n: 20 }], [6700, 'whooshDown', { dur: 1.3, vol: 0.2 }],
          [8300, 'claw', { pan: -0.4 }], [8550, 'claw', { pan: 0.1 }], [8800, 'claw', { pan: 0.5 }], [8820, 'impact', { vol: 0.8 }], [9000, 'blood'],
          [9600, 'chips', { n: 26 }], [9700, 'sting', { notes: [38, 50, 53, 57, 62], dur: 2.4 }]],
        bed: [[0, [26, 38, 45]], [3200, [26, 38, 45, 50]], [5200, [25, 37, 44]], [6400, [26, 38, 45, 53]], [9600, [26, 38, 45, 50, 57]]],
      };
    },
    shake: [[3700, 150, 6], [6400, 300, 22], [8300, 180, 20], [8550, 180, 22], [8800, 320, 28]],
    draw(c, t, s) {
      const H0 = s.H;
      if (t < 1800) {
        const k = { x: lerp(-40, 30, t / 1800), y: 0, z: 1.02 + eio(prog(t, 0, 1800)) * 0.08, r: 0 };
        casino(c, t, s, k);
        c.save(); cam(c, k, 1.15); heroDraw(c, H0, 'lamp', 1290, 330, 1250, { rim: 'rim', rimDx: -6 }); c.restore();
        vignette(c, 0.75, 'rgba(12,0,4,1)');
        return;
      }
      if (t < 2500) {   // 袖口藏牌
        c.save(); cam(c, { x: 60, y: 250, z: 2.5, r: 0.05 }, 1); layer(c, s.table); c.restore();
        full(c, '#000', 0.4);
        c.fillStyle = '#07060a'; poly(c, [[W + 60, 280], [760, 360], [700, 560], [W + 60, 660]]); c.fill();
        c.strokeStyle = 'rgba(255,90,90,.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(W + 60, 280); c.lineTo(760, 360); c.stroke();
        const p = eo(prog(t, 1900, 2300));
        playingCard(c, lerp(780, 580, p), lerp(460, 430, p), 2.4, -0.25, 0, 'A');
        c.fillStyle = '#0b0a10'; [[700, 420], [690, 470], [700, 520]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 46, 18, -0.2, 0, TAU); c.fill(); });
        if (t > 2250) { glow(c, 560, 360, 160 * bump(t, 2330, 160), 'rgba(255,255,255,.95)', 1); }
        vignette(c, 0.8, 'rgba(12,0,4,1)');
        return;
      }
      if (t < 3200) {   // 龍爪的特寫
        casino(c, t, s, { x: 0, y: -60, z: 1.35, r: 0 }, { noEnemies: true });
        full(c, '#050002', 0.55);
        heroDraw(c, H0, 'lamp', 780, 390, 2500, { rim: 'rim', rimDx: -8 });
        const sw = Math.sin(t * 0.004);
        c.save(); c.globalAlpha = 0.55; c.fillStyle = lin(c, 0, 0, W, 0, [[0, 'rgba(0,0,0,.9)'], [clamp(0.42 + sw * 0.2, 0.05, 0.95), 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.7)']]); c.fillRect(0, 0, W, H); c.restore();
        vignette(c, 0.85, 'rgba(12,0,4,1)');
        return;
      }
      if (t < 5200) {   // 輪盤、ALL IN、紅 9
        full(c, '#0a0204', 1);
        glow(c, W / 2, H / 2, 900, 'rgba(120,10,20,.5)', 1);
        const land = prog(t, 3200, 4700);
        wheel(c, W / 2, H * 0.6, 640, 14 * eo(land), -24 * eo(land) - 14 * eo(land), lerp(0.9, 0.74, eo(prog(t, 4200, 4700))), 0.42, t > 4700 ? 9 : null);
        const pp = eo(prog(t, 3500, 4000));
        [[520, '#c41e2c'], [800, '#d8b34a'], [1080, '#1b1b22']].forEach(([x, col], i) => chipStack(c, x, lerp(H + 160, H * 0.86, pp) + i * 6, 34, 9, col));
        if (t > 3700) { const z = eo(prog(t, 3700, 3850)); c.save(); c.translate(W / 2, H * 0.17); c.scale(0.6 + z * 0.4, 0.6 + z * 0.4); c.fillStyle = lin(c, 0, -60, 0, 60, [[0, '#fff4c8'], [0.5, '#f0c050'], [1, '#a8721a']]); c.font = `900 120px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 20; c.globalAlpha = 1 - prog(t, 4500, 4700); c.fillText('ALL  IN', 0, 0); c.restore(); }
        if (t > 4700) {
          glow(c, W / 2, H * 0.6, 900, 'rgba(255,30,40,.55)', bump(t, 4850, 500));
          c.save(); c.globalAlpha = eo(prog(t, 4720, 4850)); c.fillStyle = '#ffd97a'; c.font = `900 260px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ff2030'; c.shadowBlur = 40; c.fillText('9', W / 2, H * 0.28); c.restore();
        }
        vignette(c, 0.8, 'rgba(12,0,4,1)');
        return;
      }
      if (t < 6400) {   // 起身蓄力
        const p = eio(prog(t, 5200, 5800));
        const k = { x: 180, y: -30, z: 1.22, r: -0.02 };
        casino(c, t, s, k, { knock: () => -0.35 * prog(t, 5700, 6300) });
        c.save(); cam(c, k, 1.15);
        const fx = 1180, fy = lerp(440, 300, p), hh = 1300;
        heroDraw(c, H0, 'lamp', fx, fy, hh, { rim: 'rim', rimDx: -6 });
        const gx = fx + 0.19 * hh, gy = fy + 0.16 * hh, ch = prog(t, 5500, 6350);   // 握著球棒的機械義肢
        glow(c, gx, gy, 180 + 260 * ch, 'rgba(255,40,40,.85)', ch);
        c.fillStyle = '#ffb0a0';
        for (let i = 0; i < 30; i++) { const a = hash(i) * TAU, u = ((t - 5500) / 700 + hash(i + 9)) % 1, d = (200 + hash(i + 3) * 400) * (1 - u); if (t > 5500) { c.globalAlpha = ch * u; c.beginPath(); c.arc(gx + Math.cos(a) * d, gy + Math.sin(a) * d, 4, 0, TAU); c.fill(); } }
        c.globalAlpha = 1;
        c.restore();
        vignette(c, 0.8, 'rgba(12,0,4,1)');
        return;
      }
      // 第三幕：掀桌（子彈時間）→ 三道巨爪 → 牌雨中定格
      const flipP = eo(prog(t, 6400, 6750));
      const tt = (t < 6700 ? t - 6400 : 300 + (t - 6700) * 0.22) / 1000;
      const hits = [8300, 8550, 8800].filter(x => t > x).length;
      const after = t > 9600;
      const k = after ? { x: -40, y: 0, z: 1.08 - prog(t, 9600, 12000) * 0.06, r: 0 } : { x: lerp(0, 60, prog(t, 6400, 9600)), y: -20, z: lerp(1.05, 1.16, prog(t, 6400, 9600)), r: hits % 2 ? 0.02 : -0.01 };
      casino(c, t, s, k, { flip: flipP, knock: i => 0.25 + hits * 0.3 * (i % 2 ? 1 : -1), fallen: after });
      c.save(); cam(c, k, 1.05);
      s.bits.forEach((b, i) => {
        if (t < 6450) return;
        const x = b.x - 100 + b.vx * tt;
        let y = b.y - 50 + b.vy * tt + 700 * tt * tt;
        if (y > 860) y = 860;
        const cut = i % 2 === 0 && t > [8300, 8550, 8800][i % 3];
        if (b.card) playingCard(c, x, y, b.sz, b.rot + b.vr * tt, b.suit, b.rank, { cut, back: i % 4 === 0, sx: Math.cos(b.rot + tt * 3) });
        else chip(c, x, y, 18 * b.sz, b.col, 0.3 + 0.7 * Math.abs(Math.cos(b.rot + b.vr * tt)));
      });
      c.restore();
      if (after) { c.save(); cam(c, k, 1.1); heroDraw(c, H0, 'lamp', 560, 330, 1200, { rim: 'rim', rimDx: -6 }); c.restore(); }
      [8300, 8550, 8800].forEach((t0, j) => {
        const p = eo(prog(t, t0, t0 + 90)); if (p <= 0) return;
        const life = 1 - prog(t, t0 + 150, 10200);
        if (life <= 0) return;
        const ang = [-0.5, -0.35, -0.65][j], off = [-140, 0, 140][j];
        const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, L = 1100, cx = W / 2 + nx * off, cy = H * 0.48 + ny * off;
        c.save(); c.globalAlpha = life;
        [-42, 0, 42].forEach(o2 => {
          const x1 = cx + nx * o2 - dx * L, y1 = cy + ny * o2 - dy * L, x2 = x1 + dx * 2 * L * p, y2 = y1 + dy * 2 * L * p;
          D().blade(c, x1, y1, x2, y2, 30, 'rgba(110,0,12,.9)', null);
          D().blade(c, x1, y1, x2, y2, 16, t < t0 + 200 ? '#fff0f0' : '#ff3044', '#ff1a30');
        });
        c.restore();
        full(c, '#ff2030', 0.3 * bump(t, t0 + 40, 180));
      });
      full(c, '#ffffff', 0.5 * bump(t, 6420, 150));
      full(c, '#5a0010', after ? 0.18 : 0.08);
      vignette(c, 0.8, 'rgba(12,0,4,1)');
      if (after) heroTitle(c, t, 10000, { band: '70,6,16', accent: '#ff5a5a', en: 'WINNER TAKES ALL', zh: '贏家奠定規則，輸家失去所有', zhSize: 42, sub: 'LONG ZHAO ／ 第九街', subX: 0, zhCol: '#ffd0c8' });
    },
  };

  /* =========================================================
   * 莫卡兄弟「我們能處理好這一切⋯⋯嗎？」（12.5 秒，青藍）
   *   第一幕 事務所：電話響不停、蓋章蓋到手軟；兩人互看冒冷汗
   *   第二幕 倉庫區（黃昏）：遞上契約 → 被撕掉 → 「B 計畫」
   *   第三幕 強制執行：消防栓水柱 → 結冰 → 在冰塊上蓋「核准」→ 碎裂 → 紙張紛飛
   * ========================================================= */
  function prepDocks(s) {
    const bg = canvas(LW, LH), g = bg.getContext('2d');
    g.fillStyle = lin(g, 0, 0, 0, 640, [[0, '#16304f'], [0.5, '#3f5f86'], [0.8, '#e98a5a'], [1, '#ffc58f']]); g.fillRect(0, 0, LW, 660);
    g.strokeStyle = '#1a2b40'; g.lineWidth = 8;   // 遠方的港口吊車
    [[520, 170], [1350, 140]].forEach(([x, y]) => { g.beginPath(); g.moveTo(x, 620); g.lineTo(x, y); g.lineTo(x + 260, y); g.moveTo(x, y + 40); g.lineTo(x + 180, y); g.moveTo(x + 240, y); g.lineTo(x + 240, y + 90); g.stroke(); });
    const house = (x0, x1, y0, doorX, doorW, lit) => {
      g.fillStyle = lin(g, x0, 0, x1, 0, [[0, '#22344e'], [1, '#18263a']]); g.fillRect(x0, y0, x1 - x0, 780 - y0);
      g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2; for (let x = x0; x < x1; x += 16) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, 780); g.stroke(); }
      rect(g, doorX, 500, doorW, 280, '#2c3e58'); g.strokeStyle = 'rgba(0,0,0,.35)'; for (let y = 510; y < 780; y += 14) { g.beginPath(); g.moveTo(doorX, y); g.lineTo(doorX + doorW, y); g.stroke(); }
      if (lit) g.fillStyle = 'rgba(255,190,110,.65)', g.fillRect(doorX, 764, doorW, 16);
      rect(g, doorX + doorW / 2 - 50, 440, 100, 44, '#e8ecf2'); g.fillStyle = '#16304f'; g.font = '900 30px "Arial Black", Arial'; g.textAlign = 'center'; g.fillText(lit ? 'B-17' : 'B-16', doorX + doorW / 2, 474);
      rect(g, x0, y0 - 14, x1 - x0, 14, '#101c2c');
    };
    house(0, 720, 280, 200, 320, false); house(1120, LW, 320, 1330, 300, true);
    g.fillStyle = lin(g, 0, 770, 0, LH, [[0, '#35465e'], [1, '#1a2436']]); g.fillRect(0, 770, LW, LH - 770);
    [[800, 870, 240, 20], [1300, 930, 260, 22]].forEach(([x, y, rx, ry]) => { g.fillStyle = 'rgba(255,170,110,.25)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); });
    for (let i = 0; i < 6; i++) {   // 木箱
      const x = 1380 + (i % 3) * 110, y = 780 - Math.floor(i / 3) * 100 - 100;
      rect(g, x, y, 104, 96, '#6a4a2a'); g.strokeStyle = '#3a2412'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, 100, 92); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 104, y + 96); g.stroke();
    }
    rect(g, 960, 300, 10, 480, '#101824'); rect(g, 930, 296, 70, 10, '#101824');
    D().glowDot(g, 990, 310, 120, 'rgba(255,220,160,.55)', 1);
    s.docks = bg;
  }
  const HYD = [760, 800];   // 消防栓（設計座標，在兄弟與敵人之間）
  function docks(c, t, s, k, o) {
    o = o || {};
    c.save(); cam(c, k, 0.85); layer(c, s.docks); c.restore();
    c.save(); cam(c, k, 1);
    [[1080, 0], [1240, 1], [1400, 2]].forEach(([x, i]) => {
      const e = i === 1 ? s.enMain : s.enShade;
      if (o.fallen) { foe(c, s.enShade, x + 40, 790, 280, { rot: i % 2 ? 1.4 : -1.4 }); return; }
      const push = (o.push || 0) * 70, y = 780;
      foe(c, e, x + push, y, 300, { rot: i === 2 ? 0.08 : 0, filter: o.wet ? `saturate(${1 - o.wet * 0.6}) brightness(${1 + o.wet * 0.25})` : null });
      if (o.ice) iceBlock(c, x + push, y + 6, 200, 320, o.ice);
    });
    // 消防栓
    c.fillStyle = '#c41e2c'; c.fillRect(HYD[0] - 26, HYD[1] - 90, 52, 90); c.fillRect(HYD[0] - 40, HYD[1] - 70, 80, 16);
    c.fillStyle = '#e8414f'; c.beginPath(); c.arc(HYD[0], HYD[1] - 92, 26, Math.PI, 0); c.fill();
    if (!o.capOff) { c.fillStyle = '#8a0f1a'; c.fillRect(HYD[0] + 38, HYD[1] - 74, 16, 24); }
    c.restore();
    full(c, '#0a3a4a', 0.1);
  }
  function jetPts(from, to, lift) {
    const mid = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - lift];
    return Array.from({ length: 36 }, (_, i) => { const u = i / 35, v = 1 - u; return [v * v * from[0] + 2 * v * u * mid[0] + u * u * to[0], v * v * from[1] + 2 * v * u * mid[1] + u * u * to[1]]; });
  }
  function jet(c, pts, t, head, frz, width) {
    const n = Math.max(2, Math.floor(pts.length * head));
    const P = pts.slice(0, n).map(([x, y], i) => [x + Math.sin(t * 0.03 + i * 0.6) * 6 * (1 - frz), y + Math.cos(t * 0.025 + i * 0.5) * 6 * (1 - frz)]);
    const path = () => { c.beginPath(); P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.shadowColor = frz > 0.5 ? '#e8faff' : '#3aa8ff'; c.shadowBlur = 20;
    c.strokeStyle = `rgba(${lerp(60, 210, frz)},${lerp(160, 240, frz)},255,.9)`; c.lineWidth = width; path(); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = `rgba(255,255,255,${0.7 + 0.3 * frz})`; c.lineWidth = width * 0.3; path(); c.stroke();
    if (frz > 0) {
      c.fillStyle = 'rgba(235,250,255,.9)'; c.strokeStyle = 'rgba(120,200,255,.9)'; c.lineWidth = 1;
      P.forEach(([x, y], i) => {
        if (i % 3 || i < 2) return;
        const [px, py] = P[i - 1], nx = -(y - py), ny = x - px, L = Math.hypot(nx, ny) || 1, side = i % 2 ? 1 : -1, l = (22 + (i * 37 % 20)) * frz;
        c.beginPath(); c.moveTo(x - ny / L * 7, y + nx / L * 7); c.lineTo(x + nx / L * l * side, y + ny / L * l * side); c.lineTo(x + ny / L * 7, y - nx / L * 7); c.closePath(); c.fill(); c.stroke();
      });
    }
    c.restore();
  }
  function mochaOffice(c, t, s, k) {
    c.save(); cam(c, k, 1);
    layer(c, s.officeBG);
    const ox = -(LW - W) / 2, oy = -(LH - H) / 2;
    const Wn = s.win;
    c.fillStyle = lin(c, 0, Wn.y + oy, 0, Wn.y + Wn.h + oy, [[0, '#ffb487'], [1, '#e97a5a']]); c.fillRect(Wn.x + ox, Wn.y + oy, Wn.w, Wn.h);
    for (let y = Wn.y + oy; y < Wn.y + oy + Wn.h; y += 24) rect(c, Wn.x + ox, y, Wn.w, 14, 'rgba(10,20,34,.85)');
    // 門牌
    c.save(); c.translate(430, 46); c.fillStyle = '#e8ecf2'; c.fillRect(-150, -40, 300, 80); c.strokeStyle = '#1a3a5a'; c.lineWidth = 4; c.strokeRect(-146, -36, 292, 72);
    c.fillStyle = '#16304f'; c.font = `900 30px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('莫卡兄弟代理事務所', 0, -8);
    c.font = '700 14px Georgia, serif'; c.fillText('MOCHA BROTHERS AGENCY', 0, 22); c.restore();
    brothers(c, s, 'lamp', [560, 350, 1150], [1010, 320, 1130]);
    c.drawImage(s.deskFront, ox, oy);
    // 兩台響個不停的電話、堆積如山的文件
    [[520, 5000], [1360, 0]].forEach(([x, ph]) => {
      const r = Math.floor((t + ph) / 600) % 2 === 0, jx = r ? Math.sin(t * 0.3) * 3 : 0;
      c.fillStyle = '#0b111e'; c.fillRect(x - 70 + jx, 730, 140, 60); c.fillStyle = '#1a3a5a'; c.fillRect(x - 80 + jx, 712, 160, 24);
      if (r) { c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3; [-1, 1].forEach(sd => { for (let q = 1; q <= 2; q++) { c.beginPath(); c.arc(x + sd * 62, 712, 26 + q * 14, sd < 0 ? Math.PI + 0.5 : -1.1, sd < 0 ? Math.PI + 1.1 : -0.4); c.stroke(); } }); }
    });
    for (let j = 0; j < 14; j++) { rect(c, 900 + hash(j) * 10, 700 - j * 12, 190, 12, j % 3 ? '#d9dfe8' : '#6fb7d8'); }
    c.restore();
    full(c, '#0a3a4a', 0.14);
    vignette(c, 0.6);
  }
  /**
   * 兄弟分開站：兄（深髮、眼鏡、抱著文件夾，沉穩）與弟（銀髮、虎牙，愛耍嘴皮）。
   * 沒有分開的素材時，改用雙人圖畫在兩人中間的位置。
   */
  function brothers(c, s, variant, elder, younger, o) {
    o = o || {};
    if (s.HE && s.HY) {
      heroDraw(c, s.HY, variant, younger[0], younger[1], younger[2], { rim: o.rim, rimDx: -6, alpha: o.ya });
      heroDraw(c, s.HE, variant, elder[0], elder[1], elder[2], { rim: o.rim, rimDx: -6, alpha: o.ea });
    } else heroDraw(c, s.H, variant, (elder[0] + younger[0]) / 2, elder[1], elder[2], { rim: o.rim, rimDx: -6 });
  }
  const BRO = { e: { pitch: 0.78, rate: 0.95 }, y: { pitch: 1.3, rate: 1.08 } };   // 兄：低沉；弟：輕快
  const MOCHA = {
    dur: 12500,
    voice: { pitch: 1, rate: 1 },
    vo: [[200, 'Mocha Brothers Agency—', '兄：莫卡兄弟代理事務所——', 1200, BRO.e], [1150, "we'll handle it!", '弟：——交給我們處理！', 1800, BRO.y], [2650, '…Can we, though?', '兄：……我們真的處理得了嗎？', 3550, BRO.e],
      [3900, 'Please sign here.', '兄：請在這裡簽名。', 5000, BRO.e], [5500, 'Plan B!', '弟：B 計畫！', 6200, BRO.y],
      [9700, 'See? Handled.', '弟：看吧，處理好了。', 10700, BRO.y], [10900, '…Probably.', '兄：……大概。', 12000, BRO.e]],
    setup(s) {
      const look = { shadow: '#04121a', light: '#d0f4ff', rim: '#6fe0ff', lampRGB: '220,250,255', shade: '4,24,34', dayShade: '20,70,90' };
      s.H = prepHero('mocha', look);
      s.HE = prepHero('mocha_elder', look);
      s.HY = prepHero('mocha_younger', Object.assign({}, look, { rim: '#a8ecff' }));
      prepEnemies(s);
      if (!s.officeBG) prepOffice(s);
      prepDocks(s);
      s.papers = Array.from({ length: 40 }, (_, i) => ({ x: hash(i) * W, v: 80 + hash(i + 1) * 120, r: hash(i + 2) * 6, vr: (hash(i + 3) - 0.5) * 3, s: 0.7 + hash(i + 4) * 0.6, d: hash(i + 5) * 900 }));
    },
    score() {
      return {
        cues: [[0, 'ring', { n: 2 }], [600, 'ring', { n: 2 }], [200, 'blip', { n: 10, pitch: 1.1 }], [1450, 'stamp'], [1800, 'stamp'], [2150, 'stamp'], [1500, 'paper', { n: 12 }],
          [2650, 'blip', { n: 3, pitch: 0.7 }], [3600, 'whoosh', { dur: 0.4 }], [3700, 'footsteps', { n: 4, gap: 0.25 }], [3900, 'paper', { n: 8 }], [5200, 'tear'], [5550, 'blip', { n: 2, pitch: 0.6 }],
          [6200, 'pop'], [6350, 'water', { dur: 1.3 }], [7200, 'freeze', { dur: 1.2 }], [8600, 'stamp'], [8700, 'crack'], [9200, 'glass', { vol: 0.75, n: 34 }], [9210, 'impact', { vol: 0.8 }],
          [9400, 'paper', { n: 20 }], [9600, 'chime', { notes: [81, 84, 88] }], [10900, 'blip', { n: 3, pitch: 0.6 }]],
        bed: [[0, [33, 45, 52, 57]], [3600, [35, 47, 54, 59]], [6000, [33, 45, 52, 56]], [7200, [33, 45, 52, 59]], [9400, [33, 45, 52, 57, 64]]],
      };
    },
    shake: [[1450, 90, 5], [1800, 90, 5], [2150, 90, 5], [6200, 150, 8], [8600, 150, 14], [9200, 450, 26]],
    draw(c, t, s) {
      const H0 = s.H;
      if (t < 1400) { mochaOffice(c, t, s, { x: 0, y: 0, z: 1.02 + prog(t, 0, 1400) * 0.06, r: 0 }); return; }
      if (t < 2600) {   // 蓋章蓋到手軟
        c.save(); cam(c, { x: 0, y: 0, z: 1.1, r: 0.02 }, 1); layer(c, s.deskTop); c.restore();
        [1450, 1800, 2150].forEach((t0, i) => {
          const inP = eo(prog(t, t0 - 250, t0 - 50)), outP = eio(prog(t, t0 + 150, t0 + 330));
          if (inP <= 0 || outP >= 1) return;
          c.save(); c.translate(lerp(W + 400, W / 2, inP) - outP * 1400, H / 2 + (i - 1) * 20); c.rotate(-0.06 + i * 0.04);
          c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 20; rect(c, -230, -300, 460, 600, '#f4f2ec'); c.shadowBlur = 0;
          c.fillStyle = 'rgba(40,50,70,.45)'; for (let q = 0; q < 16; q++) c.fillRect(-190, -250 + q * 28, 280 + hash(q + i) * 90, 6);
          if (t > t0) { c.save(); c.translate(80, 150); c.rotate(-0.2); c.strokeStyle = '#c21a28'; c.lineWidth = 8; c.strokeRect(-90, -50, 180, 100); c.fillStyle = '#c21a28'; c.font = `900 60px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('核准', 0, 4); c.restore(); }
          c.restore();
          const sp = t < t0 ? eio(prog(t, t0 - 200, t0)) : 1 - eio(prog(t, t0 + 40, t0 + 200));   // 印章起落
          c.save(); c.translate(W / 2 + 80, lerp(-200, H / 2 + 60, sp)); c.fillStyle = '#6a2a1a'; c.fillRect(-40, -260, 80, 200); c.fillStyle = '#3a1a10'; c.fillRect(-100, -70, 200, 60); c.fillStyle = '#c21a28'; c.fillRect(-96, -14, 192, 14); c.restore();
        });
        full(c, '#0a3a4a', 0.12); vignette(c, 0.6);
        return;
      }
      if (t < 3600) {   // 兩人互看，冷汗
        mochaOffice(c, t, s, { x: -30, y: -120, z: 1.75, r: 0 });   // 兩人之間：兄冒冷汗、弟還在笑
        const d = eo(prog(t, 2700, 2900));
        sweat(c, 480, 110 + prog(t, 2700, 3500) * 40, 1.6 * d);
        return;
      }
      if (t < 6000) {   // 倉庫區：遞上契約 → 被撕掉
        const k = { x: lerp(-40, 40, prog(t, 3600, 6000)), y: 0, z: 1.03, r: 0 };
        docks(c, t, s, k);
        c.save(); cam(c, k, 1.1);
        const ex = lerp(-380, 340, eo(prog(t, 3600, 4100)));
        const ey = lerp(-420, 560, eo(prog(t, 3750, 4300)));   // 弟晚一步跟上
        brothers(c, s, 'day', [ex - 60, 360, 1050], [ey, 330, 1000], { rim: 'rim' });
        // 契約卷軸在地面展開
        const L = 480 * eo(prog(t, 3900, 4500)), tear = prog(t, 5200, 5700);
        if (L > 2) {
          const drawStrip = (x0, x1, dy, rot) => {
            c.save(); c.translate(0, dy); c.rotate(rot);
            c.fillStyle = '#f4f2ec'; poly(c, [[x0, 700], [x1, 690], [x1 + 20, 760], [x0 + 10, 770]]); c.fill();
            c.fillStyle = 'rgba(40,50,70,.4)'; for (let x = x0 + 20; x < x1 - 20; x += 40) c.fillRect(x, 718, 26, 4), c.fillRect(x, 738, 20, 4);
            c.restore();
          };
          if (tear <= 0) drawStrip(560, 560 + L, 0, 0);
          else { drawStrip(560, 560 + L / 2 - 6, eo(tear) * 40, -0.05 * tear); drawStrip(560 + L / 2 + 6, 560 + L, eo(tear) * 80, 0.12 * tear); }
        }
        if (t > 4900 && t < 5500) {   // 敵人：拒絕
          const a = prog(t, 4900, 5000) * (1 - prog(t, 5400, 5500));
          c.save(); c.globalAlpha = a; c.translate(1240, 360); c.fillStyle = '#ffffff'; D().roundRect(c, -60, -44, 120, 88, 14); c.fill();
          c.strokeStyle = '#c21a28'; c.lineWidth = 10; c.beginPath(); c.moveTo(-26, -24); c.lineTo(26, 24); c.moveTo(26, -24); c.lineTo(-26, 24); c.stroke(); c.restore();
        }
        c.restore();
        vignette(c, 0.5, 'rgba(4,20,34,1)');
        return;
      }
      // 第三幕：強制執行
      const shatter = t > 9200;
      const frz = eo(prog(t, 7200, 7900));
      const k = t < 8000 ? { x: lerp(0, 80, prog(t, 6000, 8000)), y: 0, z: 1.03, r: 0 }
        : t < 9400 ? { x: 440, y: 140, z: lerp(1.9, 2.1, prog(t, 8000, 9400)), r: 0.02 }
          : { x: -20, y: 0, z: 1.06 - prog(t, 9400, 12500) * 0.05, r: 0 };
      docks(c, t, s, k, { capOff: t > 6200, wet: shatter ? 0 : prog(t, 6500, 6800), push: shatter ? 0 : eo(prog(t, 6500, 7100)), ice: shatter ? 0 : frz, fallen: shatter });
      c.save(); cam(c, k, 1);
      if (t > 6200 && t < 6700) { const p = prog(t, 6200, 6700); c.fillStyle = '#8a0f1a'; c.save(); c.translate(HYD[0] + 46 + p * 120, HYD[1] - 62 - p * 260 + p * p * 300); c.rotate(p * 8); c.fillRect(-8, -12, 16, 24); c.restore(); }
      if (t > 6250 && !shatter) {
        const hose = [[HYD[0] - 40, HYD[1] - 60], [640, 860], [570, 650]];
        c.strokeStyle = '#1a3a5a'; c.lineWidth = 20; c.lineCap = 'round'; c.beginPath(); c.moveTo(...hose[0]); c.quadraticCurveTo(...hose[1], ...hose[2]); c.stroke();
        [1080, 1240, 1400].forEach((x, i) => jet(c, jetPts([580, 630], [x + eo(prog(t, 6500, 7100)) * 70, 600], 260), t, eo(prog(t, 6350 + i * 60, 6700 + i * 60)), frz, 40));
      }
      if (t > 7300 && !shatter) { c.fillStyle = `rgba(230,248,255,${0.35 * frz})`; c.beginPath(); c.ellipse(1200, 800, 520 * frz, 60 * frz, 0, 0, TAU); c.fill(); }
      // 冰上蓋章
      if (t > 8300 && !shatter) {
        const sp = eio(prog(t, 8350, 8600)) * (1 - eio(prog(t, 8700, 8900)));
        c.save(); c.translate(1310, lerp(100, 560, sp)); c.fillStyle = '#6a2a1a'; c.fillRect(-26, -170, 52, 130); c.fillStyle = '#3a1a10'; c.fillRect(-64, -46, 128, 40); c.restore();
        if (t > 8600) {
          c.save(); c.translate(1310, 600); c.rotate(-0.15); c.globalAlpha = 0.9; c.strokeStyle = '#d4202e'; c.lineWidth = 6; c.strokeRect(-62, -34, 124, 68);
          c.fillStyle = '#d4202e'; c.font = `900 40px ${D().SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('核准', 0, 3); c.restore();
          const cp = eo(prog(t, 8700, 9150));
          c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 2;
          for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; c.beginPath(); c.moveTo(1310, 600); c.lineTo(1310 + Math.cos(a) * 60 * cp, 600 + Math.sin(a) * 50 * cp); c.lineTo(1310 + Math.cos(a + 0.2) * 150 * cp, 600 + Math.sin(a + 0.2) * 130 * cp); c.stroke(); }
        }
      }
      if (shatter) {   // 碎冰
        const dt = (t - 9200) / 1000;
        c.fillStyle = 'rgba(220,245,255,.9)'; c.strokeStyle = '#9adcff';
        for (let i = 0; i < 60; i++) {
          const a = hash(i) * TAU, v = 300 + hash(i + 1) * 900, x = 1240 + Math.cos(a) * v * dt, y = 600 + Math.sin(a) * v * dt + 900 * dt * dt, z = 8 + hash(i + 2) * 20;
          c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.2); c.translate(x, y); c.rotate(dt * 8 * (hash(i + 3) - 0.5));
          c.beginPath(); c.moveTo(0, -z); c.lineTo(z * 0.5, 0); c.lineTo(0, z * 0.8); c.lineTo(-z * 0.4, 0); c.closePath(); c.fill(); c.stroke(); c.restore();
        }
      }
      if (t < 8000) brothers(c, s, 'day', [150, 380, 1000], [430, 320, 1100], { rim: 'rim' });   // 弟拿著水管
      else if (t > 9400) brothers(c, s, 'day', [360, 350, 1080], [700, 320, 1080], { rim: 'rim' });
      c.restore();
      // 雪、紙張雨
      if (frz > 0 && !shatter) { c.fillStyle = '#fff'; for (let i = 0; i < 80; i++) { c.globalAlpha = 0.7 * frz; c.beginPath(); c.arc((hash(i) * W + Math.sin(t * 0.001 + i) * 20), (hash(i + 1) * H + t * 0.06) % H, 1.5 + hash(i + 2) * 2, 0, TAU); c.fill(); } c.globalAlpha = 1; }
      if (t > 9300) s.papers.forEach(p => {
        const dt = (t - 9300 - p.d) / 1000; if (dt < 0) return;
        const y = -80 + p.v * dt * 2.2, x = p.x + Math.sin(dt * 2 + p.r) * 40;
        if (y > H + 80) return;
        c.save(); c.translate(x, y); c.rotate(p.r + p.vr * dt); c.scale(p.s, p.s * Math.cos(dt * 3 + p.r));
        c.fillStyle = '#f4f2ec'; c.fillRect(-26, -34, 52, 68); c.fillStyle = 'rgba(40,50,70,.4)'; for (let q = 0; q < 4; q++) c.fillRect(-18, -22 + q * 10, 34, 3);
        c.restore();
      });
      full(c, '#e8f8ff', 0.6 * bump(t, 9210, 250));
      vignette(c, 0.5, 'rgba(4,20,34,1)');
      if (t > 10000) {
        heroTitle(c, t, 10000, { band: '8,52,72', accent: '#6fe0ff', en: 'WE CAN HANDLE THIS… RIGHT?', enSize: 58, zh: '我們能處理好這一切⋯⋯嗎？', zhSize: 44, sub: '（應該）', subX: 560, zhCol: '#d8f6ff' });
        sweat(c, 900, 590 + prog(t, 10400, 12000) * 20, eo(prog(t, 10400, 10600)) * 0.9);
      }
    },
  };

  /* =========================================================
   * 阿蘭「炎彈：勇氣判決」（12 秒，琥珀）
   *   第一幕 黎明頂樓：架著狙擊槍，風聲；眼部特寫，無線電傳來隊友被壓制的呼救
   *   第二幕 掩護：街上的六角護盾擋下子彈；燃燒彈上膛
   *   第三幕 判決：狙擊鏡、屏息 → 開槍，子彈時間飛越城市 → 命中爆炸 → 日出下定格
   * ========================================================= */
  function prepRoof(s) {
    const bg = canvas(LW, LH), g = bg.getContext('2d');
    g.fillStyle = lin(g, 0, 0, 0, 640, [[0, '#140c2e'], [0.4, '#4a2150'], [0.72, '#c8504a'], [0.9, '#ff9a4a'], [1, '#ffd08a']]); g.fillRect(0, 0, LW, 660);
    D().glowDot(g, 1250, 620, 420, 'rgba(255,200,120,.75)', 1);
    g.fillStyle = '#fff1c8'; g.beginPath(); g.arc(1250, 628, 64, Math.PI, 0); g.fill();
    const row = (col, base, hMin, hMax, seed, lit) => {
      for (let x = -20, i = 0; x < LW; i++) {
        const w = 60 + hash(seed + i) * 90, h = hMin + hash(seed + i + 50) * (hMax - hMin);
        g.fillStyle = col; g.fillRect(x, base - h, w, h + 400);
        if (lit) { g.fillStyle = 'rgba(255,190,110,.55)'; for (let y = base - h + 12; y < base - 10; y += 18) for (let xx = x + 8; xx < x + w - 8; xx += 14) if (hash(xx * 7 + y) > 0.72) g.fillRect(xx, y, 6, 8); }
        x += w + 4;
      }
    };
    row('#3a1d40', 640, 120, 260, 3, false); row('#261230', 680, 160, 360, 11, true); row('#170b1f', 730, 80, 200, 23, true);
    s.skyline = canvas(LW, LH); s.skyline.getContext('2d').drawImage(bg, 0, 0);
    g.fillStyle = lin(g, 0, 740, 0, LH, [[0, '#24141c'], [1, '#0e070b']]); g.fillRect(0, 740, LW, LH - 740);
    rect(g, 0, 736, LW, 6, 'rgba(255,150,90,.6)');
    g.strokeStyle = '#0e070b'; g.lineWidth = 10;   // 水塔
    [[160, 740], [300, 740]].forEach(([x, y]) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20, 520); g.stroke(); });
    g.fillStyle = '#120a10'; g.fillRect(130, 330, 220, 200); g.beginPath(); g.moveTo(120, 330); g.lineTo(240, 260); g.lineTo(360, 330); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,150,90,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(350, 330); g.lineTo(350, 530); g.stroke();
    g.strokeStyle = '#0e070b'; g.lineWidth = 5; g.beginPath(); g.moveTo(1680, 740); g.lineTo(1680, 360); g.moveTo(1640, 420); g.lineTo(1720, 420); g.moveTo(1650, 480); g.lineTo(1710, 480); g.stroke();
    s.roof = bg;
  }
  function rifle(c, x, y, sc, rot) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(sc, sc);
    c.fillStyle = '#0c080a';
    c.fillRect(-60, -10, 700, 16); c.fillRect(-260, -20, 220, 44); poly(c, [[-260, -20], [-360, 10], [-360, 50], [-240, 24]]); c.fill();
    c.fillRect(-40, 6, 30, 60); c.fillRect(60, 6, 24, 40);
    c.fillStyle = '#1a1014'; c.fillRect(-120, -52, 200, 26); c.beginPath(); c.arc(80, -39, 17, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,190,120,.8)'; c.beginPath(); c.arc(86, -40, 6, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,150,90,.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-60, -10); c.lineTo(640, -10); c.stroke();
    c.restore();
  }
  function streetDusk(c, t, s, k, o) {
    o = o || {};
    c.save(); cam(c, k, 0.6); layer(c, s.dayBG); c.restore();
    c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = lin(c, 0, 0, 0, H, [[0, '#6a3a7a'], [0.6, '#e08a6a'], [1, '#7a4a5a']]); c.fillRect(-W, -H, W * 3, H * 3); c.restore();
    c.save(); cam(c, k, 1);
    // 我方隊友躲在警車後
    (s.allies || []).forEach((A, i) => heroDraw(c, A, 'dark', 330 + i * 220, 470 + i * 20, 560, { rim: 'rim', rimDx: -4 }));
    policeCar(c, t, 420, 820, 1.05, true, 0);
    // 敵人開火
    [[1160, 0], [1320, 1], [1470, 2]].forEach(([x, i]) => {
      const kb = o.blast ? o.blast * (i === 1 ? 0 : (i > 1 ? 1 : -1)) : 0;
      if (o.blast && i === 1 && o.blast > 0.3) return;
      foe(c, i === 1 ? s.enMain : s.enShade, x + kb * 160, 780 + (o.blast ? o.blast * 30 : 0), 320, { rot: kb * 0.4 });
      if (o.firing) { const f = Math.floor((t + i * 70) / 90) % 3 === 0; if (f) { glow(c, x - 70, 610, 60, 'rgba(255,230,140,.95)', 1); c.strokeStyle = 'rgba(255,220,140,.8)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 70, 610); c.lineTo(620 + hash(Math.floor(t / 90) + i) * 200, 560 + hash(Math.floor(t / 90) + i + 5) * 120); c.stroke(); } }
    });
    if (o.dome) hexDome(c, 440, 820, 400, 360, t, o.dome, '255,170,80', o.hits);
    c.restore();
  }
  const ALAN = {
    dur: 12000,
    voice: { pitch: 1.2, rate: 0.95 },
    vo: [[400, 'Wind, two left.', '風向，偏左二。', 1250], [1300, 'Holding.', '穩住。', 1750], [2200, "Alan — we're pinned down!", '阿蘭——我們被壓制了！', 2950, { pitch: 0.8, rate: 1.15 }], [3000, "I've got you.", '交給我。', 3550],
      [4300, 'Cover is up.', '掩護，展開。', 5200], [5800, 'One round…', '一發……', 6600], [7000, "…that's all I need.", '……就夠了。', 8100], [10100, 'Verdict—', '判決——', 10800], [10850, 'delivered.', '執行完畢。', 11800]],
    setup(s) {
      s.H = prepHero('alan', { shadow: '#140810', light: '#ffe0c0', rim: '#ffa04a', lampRGB: '255,190,120', shade: '40,10,30', dayShade: '90,40,40' });
      prepEnemies(s);
      prepRoof(s);
      if (!s.dayBG) prepDay(s);
      s.allies = (s.team || []).filter(k => k !== 'alan').slice(0, 2).map(k => prepHero(k, { shadow: '#140a10', rim: '#ffa04a' })).filter(Boolean);
      s.hits = Array.from({ length: 16 }, (_, i) => [440 + (hash(i) - 0.3) * 600, 520 + hash(i + 1) * 200, 4300 + i * 80]);
    },
    score() {
      return {
        cues: [[0, 'wind', { dur: 3.2, vol: 0.12 }], [1800, 'radio', { n: 3 }], [2150, 'gunfire', { n: 6 }], [3200, 'gunfire', { n: 14 }], [4250, 'shieldUp'], [4350, 'ricochet', { n: 10 }],
          [5600, 'whoosh', { dur: 0.4 }], [6250, 'reload'], [6800, 'scope'], [7200, 'heartbeat'], [7700, 'heartbeat'], [7400, 'scope'], [8000, 'laser'],
          [8400, 'gun'], [8500, 'whooshDown', { dur: 0.9, vol: 0.22 }], [9300, 'boom', { vol: 1 }], [9310, 'impact', { vol: 0.9 }],
          [9800, 'wind', { dur: 2.2, vol: 0.1 }], [9900, 'sting', { notes: [41, 48, 53, 57, 60], dur: 2.4 }]],
        bed: [[0, [29, 41, 48]], [3200, [29, 41, 48, 53]], [5600, [28, 40, 47]], [6800, [29, 41, 48]], [9300, [29, 41, 48, 53, 57]]],
      };
    },
    shake: [[3200, 1000, 3], [8400, 150, 16], [9300, 500, 30]],
    draw(c, t, s) {
      const H0 = s.H;
      const dust = (a) => { c.save(); c.fillStyle = 'rgba(255,200,150,.6)'; for (let i = 0; i < 60; i++) { c.globalAlpha = a * (0.3 + hash(i) * 0.5); const x = (hash(i) * W * 1.2 - t * (0.3 + hash(i + 1) * 0.5)) % (W * 1.2); c.beginPath(); c.arc(x < 0 ? x + W * 1.2 : x, hash(i + 2) * H, 1 + hash(i + 3) * 2, 0, TAU); c.fill(); } c.restore(); };
      if (t < 1800) {   // 頂樓
        const k = { x: lerp(-40, 20, t / 1800), y: 0, z: 1.03 + eio(prog(t, 0, 1800)) * 0.06, r: 0 };
        c.save(); cam(c, k, 0.7); layer(c, s.roof); c.restore();
        c.save(); cam(c, k, 1.1); heroDraw(c, H0, 'warm', 520, 360, 1150, { rim: 'rim', rimDx: 6 }); rifle(c, 820, 700, 0.9, -0.05); c.restore();
        dust(1); vignette(c, 0.6, 'rgba(20,6,16,1)');
        return;
      }
      if (t < 3200) {   // 眼部特寫；無線電
        c.save(); cam(c, { x: 0, y: 0, z: 1.3, r: 0 }, 0.4); layer(c, s.roof); c.restore();
        full(c, '#0a0408', 0.45);
        heroDraw(c, H0, 'warm', 760, 430, 3000, { rim: 'rim', rimDx: 10 });
        glow(c, 610 + Math.sin(t * 0.003) * 20, 280, 34, 'rgba(255,230,180,.9)', 0.5);   // 瞳孔裡的瞄準鏡反光
        if (t > 2100) { c.save(); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(60, 60, 300, 70); c.fillStyle = '#ffb06a'; c.font = '700 24px "Courier New", monospace'; c.fillText('◉ RADIO  CH-9', 80, 104); c.restore(); }
        vignette(c, 0.75, 'rgba(20,6,16,1)');
        return;
      }
      if (t < 5600) {   // 街上：護盾擋下子彈
        const k = { x: lerp(60, -20, prog(t, 3200, 5600)), y: 0, z: 1.05, r: 0 };
        streetDusk(c, t, s, k, { firing: true, dome: eo(prog(t, 4200, 4500)), hits: s.hits });
        glow(c, 440 - k.x, 700, 500, 'rgba(255,150,60,.35)', bump(t, 4300, 400));
        vignette(c, 0.55, 'rgba(20,6,16,1)');
        return;
      }
      if (t < 6800) {   // 燃燒彈上膛
        full(c, '#0b0507', 1);
        glow(c, W / 2, H / 2, 700, 'rgba(255,110,40,.3)', 1);
        const p = eo(prog(t, 5600, 6100)), ins = eio(prog(t, 6150, 6400));
        c.save(); c.translate(lerp(W / 2 - 300, W / 2 + 120 * ins, p), H / 2); c.rotate(lerp(-0.6, 0, p) + Math.sin(t * 0.003) * 0.02 * (1 - ins));
        c.scale(2.2, 2.2);
        c.fillStyle = lin(c, 0, -30, 0, 30, [[0, '#ffe7a8'], [0.5, '#c9962e'], [1, '#6a4a14']]); c.fillRect(-140, -26, 170, 52);
        c.fillStyle = lin(c, 30, 0, 150, 0, [[0, '#c9502a'], [1, '#ffb070']]); c.beginPath(); c.moveTo(30, -24); c.lineTo(110, -18); c.quadraticCurveTo(160, 0, 110, 18); c.lineTo(30, 24); c.closePath(); c.fill();
        glow(c, 120, 0, 60, 'rgba(255,140,60,.8)', 0.8);
        c.fillStyle = 'rgba(80,40,10,.8)'; c.font = '900 20px Georgia, serif'; c.textAlign = 'center'; c.fillText('INCENDIARY', -55, 8);
        c.restore();
        if (t > 6150) { c.fillStyle = '#050304'; c.fillRect(W / 2 + 420, H / 2 - 110, 900, 220); c.fillStyle = 'rgba(255,150,90,.3)'; c.fillRect(W / 2 + 420, H / 2 - 110, 900, 4); }
        full(c, '#ffffff', 0.3 * bump(t, 6400, 120));
        vignette(c, 0.8, 'rgba(20,6,16,1)');
        return;
      }
      if (t < 8400) {   // 狙擊鏡
        const sway = (1 - prog(t, 6900, 7900)) * 14;
        const zoom = t < 7400 ? 2.0 : 2.6;
        streetDusk(c, t, s, { x: 520 + Math.sin(t * 0.006) * sway, y: 170 + Math.cos(t * 0.005) * sway, z: zoom, r: 0 }, { firing: true, dome: 1, hits: s.hits });
        c.save(); c.globalCompositeOperation = 'saturation'; c.globalAlpha = 0.7 * prog(t, 7500, 8200); c.fillStyle = '#808080'; c.fillRect(-W, -H, W * 3, H * 3); c.restore();
        const R = H * 0.44, x = W / 2, y = H / 2;
        c.save(); c.fillStyle = '#050304'; c.beginPath(); c.rect(-W, -H, W * 3, H * 3); c.arc(x, y, R, 0, TAU, true); c.fill();
        c.strokeStyle = '#1c140e'; c.lineWidth = 22; c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke();
        c.strokeStyle = 'rgba(20,14,8,.95)'; c.lineWidth = 6; [[-1, 0], [1, 0], [0, 1]].forEach(([dx, dy]) => { c.beginPath(); c.moveTo(x + dx * R, y + dy * R); c.lineTo(x + dx * R * 0.3, y + dy * R * 0.3); c.stroke(); });
        c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - R * 0.3, y); c.lineTo(x + R * 0.3, y); c.moveTo(x, y - R); c.lineTo(x, y + R * 0.3); c.stroke();
        if (t > 8000) { c.fillStyle = '#ff3a1a'; c.shadowColor = '#ff3a1a'; c.shadowBlur = 14; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill(); c.shadowBlur = 0; }
        c.fillStyle = 'rgba(255,170,90,.9)'; c.font = '600 22px "Courier New", monospace';
        c.fillText(`×${t < 7400 ? 8 : 12}  RNG 612 m`, x + R * 0.4, y + R * 0.5); c.fillText(t > 8000 ? '■ LOCK' : 'BREATH ■■■□', x + R * 0.4, y + R * 0.5 + 30);
        c.restore();
        return;
      }
      if (t < 9300) {   // 子彈時間：飛越城市
        const sp = (t - 8400) * 1.6;
        c.save(); c.translate(-(sp % (LW - 200)), 0); layer(c, s.skyline); c.drawImage(s.skyline, LW - 200 - (LW - W) / 2, -(LH - H) / 2); c.restore();
        full(c, '#1a0810', 0.25);
        c.strokeStyle = 'rgba(255,220,180,.5)'; c.lineWidth = 2;
        for (let i = 0; i < 40; i++) { const y = hash(i) * H, x = (W - ((t * (1.5 + hash(i + 1) * 2) + hash(i + 2) * 3000) % (W + 400))); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 200, y); c.stroke(); }
        const bx = W * 0.58, by = H * 0.48 + Math.sin(t * 0.01) * 6;
        c.save(); c.fillStyle = lin(c, bx - 700, 0, bx, 0, [[0, 'rgba(255,90,20,0)'], [0.7, 'rgba(255,140,40,.6)'], [1, 'rgba(255,240,200,.95)']]); poly(c, [[bx - 700, by - 4], [bx, by - 20], [bx, by + 20], [bx - 700, by + 4]]); c.fill(); c.restore();
        for (let k2 = 1; k2 <= 4; k2++) { const x = bx - ((t * 0.9 + k2 * 160) % 640); c.strokeStyle = `rgba(255,220,180,${0.5 * (1 - (bx - x) / 640)})`; c.lineWidth = 3; c.beginPath(); c.ellipse(x, by, 20, 50, 0, 0, TAU); c.stroke(); }
        glow(c, bx, by, 160, 'rgba(255,200,120,.95)', 1);
        c.fillStyle = '#fff4d8'; c.beginPath(); c.ellipse(bx, by, 30, 14, 0, 0, TAU); c.fill();
        full(c, '#fff4dc', 0.9 * bump(t, 8410, 120));
        vignette(c, 0.6, 'rgba(20,6,16,1)');
        return;
      }
      if (t < 9800) {   // 命中爆炸
        const blast = eo(prog(t, 9300, 9700));
        streetDusk(c, t, s, { x: 250, y: -60, z: 1.35, r: 0.02 }, { blast, dome: 1 - prog(t, 9300, 9600), hits: [] });
        fireball(c, W / 2 + (1320 - 800 - 250) * 1.35, H / 2 + (600 - 450 + 60) * 1.35, 520 * eo(prog(t, 9300, 9550)), 1 - prog(t, 9500, 9800));
        c.save(); c.strokeStyle = '#ffd9a0'; c.globalAlpha = 1 - prog(t, 9300, 9750); c.lineWidth = 20 * (1 - prog(t, 9300, 9750)); c.beginPath(); c.ellipse(W / 2 + 365, H / 2 + 283, 1300 * eo(prog(t, 9300, 9750)), 260 * eo(prog(t, 9300, 9750)), 0, 0, TAU); c.stroke(); c.restore();
        full(c, '#ffffff', 0.7 * bump(t, 9310, 180));
        vignette(c, 0.5, 'rgba(20,6,16,1)');
        return;
      }
      // 日出下定格
      const k = { x: 0, y: 0, z: 1.08 - prog(t, 9800, 12000) * 0.05, r: 0 };
      c.save(); cam(c, k, 0.7); layer(c, s.roof); c.restore();
      glow(c, 1150 - 100, 580, 520, 'rgba(255,210,140,.6)', 1);
      c.save(); cam(c, k, 1.1); heroDraw(c, H0, 'warm', 1000, 300, 1250, { rim: 'rimW', rimDx: 7, flip: true }); c.restore();
      dust(1);
      const sx = 1150, sy = 600, dx = W / 2 - sx, dy = H / 2 - sy;
      [[0.6, 60, 'rgba(255,200,140,.3)'], [1.2, 110, 'rgba(255,150,100,.15)'], [1.7, 40, 'rgba(255,230,180,.35)']].forEach(([u, r, col]) => glow(c, sx + dx * u, sy + dy * u, r, col, 1));
      vignette(c, 0.5, 'rgba(20,6,16,1)');
      heroTitle(c, t, 10000, { band: '90,34,10', accent: '#ffb06a', en: 'VERDICT: COURAGE', zh: '炎彈：勇氣判決', sub: 'AMBERIA ALAN ／ 第九街', subX: 330, zhCol: '#ffe0c0' });
    },
  };

  /* =========================================================
   * 亞歷山卓「速度與執勤」（11.5 秒，夜間紅藍）
   *   第一幕 夜間追緝：無線電通報，警車在高架道路上疾馳
   *   第二幕 車內特寫：紅藍警燈掃過她的臉 ——「Buckle up.」
   *   第三幕 甩尾攔截：嫌犯在前方逃竄，警車甩尾橫停，她下車
   *   第四幕 執勤：風刃橫掃、押送的手銬扣上 → 警燈下定格
   * ========================================================= */
  function prepNightCity(s) {
    if (s.nightCity) return;
    const bg = canvas(LW, LH), g = bg.getContext('2d');
    g.fillStyle = lin(g, 0, 0, 0, LH, [[0, '#03050d'], [0.5, '#0b1230'], [0.68, '#1c1838'], [1, '#05060c']]); g.fillRect(0, 0, LW, LH);
    const mg = g.createRadialGradient(1380, 170, 10, 1380, 170, 260); mg.addColorStop(0, 'rgba(220,230,255,.5)'); mg.addColorStop(1, 'rgba(220,230,255,0)');
    g.fillStyle = mg; g.fillRect(1100, 0, 560, 440); g.fillStyle = '#e8eeff'; g.beginPath(); g.arc(1380, 170, 34, 0, TAU); g.fill();
    [[0, 600, 160, 220, '#0e1430', 'rgba(140,170,255,.28)'], [1, 650, 260, 330, '#070a18', 'rgba(255,214,140,.6)']].forEach(([li, base, h0, hv, body, win]) => {
      for (let i = 0; i < 28; i++) {
        const w = 50 + hash(i * 3 + li) * 90, x = i * 68 + hash(i + 7 + li * 30) * 40 - 40, h = h0 + hash(i + 11 + li * 50) * hv;
        g.fillStyle = body; g.fillRect(x, base - h, w, h);
        g.fillStyle = win;
        for (let y = base - h + 12; y < base - 10; y += 16) for (let xx = x + 6; xx < x + w - 6; xx += 12) if (hash(xx * 0.37 + y * 0.11 + li) > 0.64) g.fillRect(xx, y, 5, 7);
      }
    });
    s.nightCity = bg;
  }
  /** 夜間道路：柏油、移動的車道線與路燈；off = 已經跑過的距離 */
  function nightRoad(c, t, off, o) {
    o = o || {};
    c.fillStyle = lin(c, 0, 640, 0, 900, [[0, '#15182a'], [1, '#07080f']]); c.fillRect(-W, 640, W * 3, 400);
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(-W, 640, W * 3, 4);
    c.fillStyle = 'rgba(255,235,170,.75)';
    for (let x = -(off % 220) - 220; x < W + 220; x += 220) c.fillRect(x, 770, 120, 7);
    for (let i = -1; i < 6; i++) {   // 路燈
      const x = i * 420 - (off * 0.6 % 420);
      c.fillStyle = '#0a0c16'; c.fillRect(x, 330, 8, 312); c.fillRect(x, 330, 70, 6);
      glow(c, x + 66, 340, 120, 'rgba(255,214,150,.55)', o.lamp == null ? 1 : o.lamp);
    }
  }
  function sirenWash(c, t, a) {
    const r = 0.5 + 0.5 * Math.sin(t * 0.03);
    glow(c, 150, 200, 900, 'rgba(255,40,60,.5)', a * r);
    glow(c, 1450, 200, 900, 'rgba(40,110,255,.5)', a * (1 - r));
  }
  function smokePuffs(c, t, t0, x, y, n, a) {
    for (let i = 0; i < n; i++) {
      const dt = (t - t0 - i * 40) / 1000; if (dt <= 0) continue;
      glow(c, x - i * 26 - dt * 160, y - dt * 60 - hash(i) * 30, 50 + dt * 220, 'rgba(170,180,200,.55)', a * Math.max(0, 1 - dt * 0.9));
    }
  }
  const ALEXANDRA = {
    dur: 11500,
    voice: { pitch: 1.15, rate: 1.0 },
    vo: [[300, 'All units — suspect heading east on Ninth.', '全體單位注意——嫌犯正沿第九街往東逃逸。', 2000, { pitch: 0.75, rate: 1.15 }], [2100, 'Copy. Unit seven, on it.', '收到。七號車，我來處理。', 2900],
      [3300, 'Buckle up.', '繫好安全帶。', 4100], [4900, 'Pull over!', '靠邊停車！', 5800], [7700, 'License and registration—', '駕照、行照——', 8700], [8900, '—revoked.', '——一律吊銷。', 9700]],
    setup(s) {
      s.H = prepHero('alexandra', { shadow: '#060a18', light: '#e6f6ff', rim: '#5fe3a8', lampRGB: '255,230,200', shade: '6,12,34' });
      if (s.H) { const src = s.H.a.canvas; s.H.red = tint(src, '#ff3a4a', 0.38); s.H.blue = tint(src, '#3a7aff', 0.38); }
      s.H2 = prepHero('alexandra_car', { shadow: '#060a18', light: '#e6f6ff', rim: '#5fe3a8', lampRGB: '255,230,200', shade: '6,12,34' });   // 定格：倚著警車
      prepEnemies(s);
      if (!s.car) prepDay(s);
      prepNightCity(s);
      s.cites = Array.from({ length: 16 }, (_, i) => ({ x: hash(i + 3) * W, y: -100 - hash(i + 5) * 500, vy: 0.18 + hash(i + 7) * 0.2, vx: (hash(i + 9) - 0.5) * 0.1, r: hash(i) * TAU, vr: (hash(i + 2) - 0.5) * 0.006 }));
    },
    score() {
      return {
        cues: [[0, 'siren', { dur: 3.2, vol: 0.03 }], [0, 'engine', { dur: 2.6, vol: 0.14, up: true }], [250, 'radio', { n: 3 }], [2600, 'whoosh', { dur: 0.4 }], [3200, 'click'],
          [4200, 'engine', { dur: 2.0, vol: 0.18, up: true }], [4300, 'siren', { dur: 2.2, vol: 0.04 }], [4800, 'footsteps', { n: 6, gap: 0.18 }], [6100, 'screech', { dur: 1.0 }], [6900, 'door'],
          [7300, 'riser', { dur: 1.2, vol: 0.18 }], [8550, 'whoosh', { dur: 0.35, vol: 0.4 }], [8650, 'impact', { vol: 1 }], [8700, 'boom', { vol: 0.6 }], [9000, 'cuffs'], [9200, 'paper', { n: 10 }],
          [9400, 'siren', { dur: 2.0, vol: 0.025 }], [9500, 'sting', { notes: [43, 50, 55, 59, 62], dur: 2.2 }]],
        bed: [[0, [31, 43, 50]], [2600, [31, 43, 50, 55]], [4200, [33, 45, 52]], [6100, [31, 43, 50]], [8650, [31, 43, 50, 55, 59]]],
      };
    },
    shake: [[6100, 700, 6], [8650, 500, 26], [9000, 200, 6]],
    draw(c, t, s) {
      const H0 = s.H;
      if (t < 2600) {   // 夜間高架：警車疾馳（側面）
        const k = { x: lerp(-30, 30, t / 2600), y: 0, z: 1.04, r: 0 }, off = t * 1.6;
        c.save(); cam(c, k, 0.2); layer(c, s.nightCity); c.restore();
        c.save(); cam(c, k, 1); nightRoad(c, t, off);
        const cx = 700 + Math.sin(t * 0.002) * 30;
        c.save(); c.globalAlpha = 0.55; c.fillStyle = lin(c, cx + 270, 0, cx + 1000, 0, [[0, 'rgba(255,250,220,.7)'], [1, 'rgba(255,250,220,0)']]); poly(c, [[cx + 270, 735], [cx + 1000, 660], [cx + 1000, 860], [cx + 270, 760]]); c.fill(); c.restore();
        policeCar(c, t, cx, 830, 1.05, false, 0, Math.sin(t * 0.04) * 2);
        c.restore();
        c.strokeStyle = 'rgba(200,220,255,.35)'; c.lineWidth = 2;   // 速度線
        for (let i = 0; i < 30; i++) { const y = 80 + hash(i) * 760, x = W - ((t * (2 + hash(i + 1) * 2) + hash(i + 2) * 2000) % (W + 400)); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 180, y); c.stroke(); }
        if (t > 250 && t < 2000) { c.save(); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(60, 60, 360, 70); c.fillStyle = '#7ff0bf'; c.font = '700 24px "Courier New", monospace'; c.fillText('◉ DISPATCH  CH-7', 80, 104); c.restore(); }
        vignette(c, 0.6, 'rgba(2,4,14,1)');
        return;
      }
      if (t < 4200) {   // 車內特寫：紅藍警燈掃過臉
        full(c, '#04060e', 1);
        const k = { x: 0, y: 0, z: 1 + prog(t, 2600, 4200) * 0.05, r: 0 };
        c.save(); cam(c, k, 1);
        heroDraw(c, H0, 'dark', 820, 360, 1900, { band: [lerp(200, 1400, prog(t, 3000, 3900)), 260] });   // 路燈的光帶掃過
        const r = 0.5 + 0.5 * Math.sin(t * 0.03);
        heroDraw(c, H0, 'red', 820, 360, 1900, { alpha: r * 0.7 });
        heroDraw(c, H0, 'blue', 820, 360, 1900, { alpha: (1 - r) * 0.7 });
        c.restore();
        c.fillStyle = lin(c, 0, 760, 0, 900, [[0, 'rgba(10,14,26,0)'], [0.4, '#0a0e1a'], [1, '#05070c']]); c.fillRect(0, 760, W, 140);   // 儀表板
        c.fillStyle = 'rgba(95,227,168,.8)'; c.font = '700 28px "Courier New", monospace'; c.fillText(`${Math.round(lerp(88, 164, prog(t, 2600, 4200)))} km/h`, 120, 850);
        sirenWash(c, t, 0.6);
        full(c, '#ffffff', 0.4 * bump(t, 2620, 120));
        vignette(c, 0.7, 'rgba(2,4,14,1)');
        return;
      }
      if (t < 7600) {   // 追逐 → 甩尾橫停 → 下車
        const drift = eo(prog(t, 6100, 6900)), stop = prog(t, 6100, 6900);
        const k = { x: lerp(0, 120, prog(t, 4200, 6100)) + drift * 60, y: 0, z: 1.02 + drift * 0.08, r: 0 };
        const off = 4200 * 1.6 + (Math.min(t, 6100) - 4200) * 1.9 + (t > 6100 ? (1 - Math.pow(1 - stop, 2)) * 400 : 0);
        c.save(); cam(c, k, 0.2); layer(c, s.nightCity); c.restore();
        c.save(); cam(c, k, 1); nightRoad(c, t, off);
        // 嫌犯在前方逃跑（車停下後被擋住）
        const fx = t < 6100 ? lerp(1500, 1180, prog(t, 4200, 6100)) : 1180 - drift * 60;
        foe(c, s.enMain, fx, 800 + (t < 6100 ? Math.abs(Math.sin(t * 0.02)) * -14 : 0), 360, { rot: t < 6100 ? 0.08 : -0.05 * drift });
        const cx = t < 6100 ? lerp(200, 640, prog(t, 4200, 6100)) : 640 + drift * 180;
        c.save(); c.translate(cx, 830); c.rotate(-drift * 0.32); policeCar(c, t, 0, 0, 1.05, false, 0, t < 6100 ? Math.sin(t * 0.05) * 2 : 0); c.restore();
        smokePuffs(c, t, 6100, cx - 200, 820, 10, prog(t, 6100, 6300) * (1 - prog(t, 7200, 7600)));
        c.restore();
        sirenWash(c, t, 0.45 + drift * 0.35);
        // 她下車：立繪從右側滑入
        const ap = eo(prog(t, 6900, 7400));
        if (ap > 0) heroDraw(c, H0, 'lit', lerp(1750, 1250, ap), 300, 1200, { alpha: ap });
        vignette(c, 0.55, 'rgba(2,4,14,1)');
        return;
      }
      if (t < 9300) {   // 執勤：風刃橫掃 → 押送
        const k = { x: 0, y: 0, z: 1.06 + prog(t, 7600, 8600) * 0.06, r: -0.01 };
        c.save(); cam(c, k, 0.25); layer(c, s.nightCity); c.restore();
        c.save(); cam(c, k, 1); nightRoad(c, t, 9000, { lamp: 0.6 }); policeCar(c, t, 260, 830, 1.0, false, 0, 0); c.restore();
        const hit = t > 8650, kb = eo(prog(t, 8650, 9100));
        [[1020, 0, 330], [1220, 1, 380], [1420, 2, 330]].forEach(([x, i, h]) => foe(c, i === 1 ? s.enMain : s.enShade, x + kb * (i - 1) * 120 + kb * 160, 820 - kb * 40 * (i === 1 ? 0 : 1), h, { rot: kb * (i - 1 || 0.3) * 0.5, alpha: 1 }));
        // 蓄力：立繪左側特寫、風捲起
        const ap = eo(prog(t, 7600, 8000)) * (1 - prog(t, 8500, 8700));
        if (ap > 0) heroDraw(c, H0, 'lit', lerp(250, 420, ap), 280, 1500, { alpha: ap });
        c.save(); c.strokeStyle = 'rgba(160,255,215,.7)'; c.lineWidth = 3; c.lineCap = 'round';
        for (let i = 0; i < 14; i++) { const a0 = t * 0.006 + i, r = 120 + i * 26; c.globalAlpha = 0.6 * prog(t, 7700, 8200) * (1 - prog(t, 8600, 8900)); c.beginPath(); c.arc(420, 520, r, a0, a0 + 0.9); c.stroke(); }
        c.restore();
        // 風刃
        if (t > 8500) {
          const p = eo(prog(t, 8500, 8680)), w = 70 * (1 - prog(t, 8700, 9200));
          if (w > 0) D().blade(c, -100, 600, lerp(-100, W + 200, p), 520, w, '#f2fff9', '#5fe3a8');
          const wp = eo(prog(t, 8650, 9200));
          c.save(); c.globalAlpha = 1 - wp; c.strokeStyle = '#bff7df'; c.lineWidth = 16 * (1 - wp) + 1; c.beginPath(); c.ellipse(1220, 640, 900 * wp, 260 * wp, 0, 0, TAU); c.stroke(); c.restore();
        }
        // 押送：手銬的紅藍雙環扣上
        const cp = eo(prog(t, 8950, 9150));
        if (cp > 0) {
          [[-1, '#ff3a4a'], [1, '#3a7aff']].forEach(([sd, col]) => { c.save(); c.strokeStyle = col; c.lineWidth = 10; c.shadowColor = col; c.shadowBlur = 24; c.beginPath(); c.arc(1220 + kb * 160 + sd * lerp(220, 34, cp), 640, 60, 0, TAU); c.stroke(); c.restore(); });
          c.save(); c.globalAlpha = cp; c.fillStyle = '#ffffff'; c.font = '900 30px "Arial Black", Arial, sans-serif'; c.textAlign = 'center'; c.fillText('IN CUSTODY', 1220 + kb * 160, 760); c.restore();
        }
        full(c, '#ffffff', 0.8 * bump(t, 8660, 180));
        sirenWash(c, t, 0.4);
        vignette(c, 0.55, 'rgba(2,4,14,1)');
        return;
      }
      // 定格：警燈下的她、飄落的罰單
      const k = { x: 0, y: 0, z: 1.08 - prog(t, 9300, 11500) * 0.05, r: 0 };
      c.save(); cam(c, k, 0.25); layer(c, s.nightCity); c.restore();
      c.save(); cam(c, k, 1); nightRoad(c, t, 9000, { lamp: 0.7 }); if (!s.H2) policeCar(c, t, 360, 840, 1.1, false, 0, 0); tape(c, t, 700, 760, 6); c.restore();
      sirenWash(c, t, 0.7);
      c.save(); cam(c, k, 1.08);
      if (s.H2) {   // 倚著警車的立繪：車頂燈條跟著紅藍交替
        const fx = 1170, fy = 250, h = 1250, a = s.H2.a, sc = h / a.h;
        heroDraw(c, s.H2, 'lit', fx, fy, h);
        const bx = fx + (0.36 * a.w - a.facePx[0]) * sc, by = fy + (0.39 * a.h - a.facePx[1]) * sc, r = 0.5 + 0.5 * Math.sin(t * 0.03);
        c.save(); c.globalCompositeOperation = 'lighter';
        [[-60, `rgba(255,60,70,${0.55 * r})`], [70, `rgba(70,120,255,${0.55 * (1 - r)})`]].forEach(([dx, col]) => { const g = c.createRadialGradient(bx + dx, by, 0, bx + dx, by, 160); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(bx + dx - 160, by - 160, 320, 320); });
        c.restore();
      } else heroDraw(c, H0, 'lit', 1180, 300, 1250);
      c.restore();
      s.cites.forEach((p, i) => {
        const dt = t - 9300, x = p.x + p.vx * dt, y = p.y + p.vy * dt;
        if (y > H + 60) return;
        c.save(); c.translate(x, y); c.rotate(p.r + p.vr * dt); c.scale(1, Math.cos(dt * 0.004 + i));
        c.fillStyle = '#f6f3ea'; c.fillRect(-26, -36, 52, 72); c.fillStyle = '#d32a3a'; c.fillRect(-26, -36, 52, 13);
        c.fillStyle = 'rgba(40,44,60,.5)'; for (let j = 0; j < 4; j++) c.fillRect(-18, -14 + j * 11, j === 3 ? 20 : 36, 3);
        c.restore();
      });
      vignette(c, 0.5, 'rgba(2,4,14,1)');
      heroTitle(c, t, 9600, { band: '10,40,32', accent: '#5fe3a8', en: 'SPEED & DUTY', zh: '速度與執勤', sub: 'ALEXANDRA ／ 布魯克林警署', subX: 290, zhCol: '#d9fff0' });
    },
  };

  /* =========================================================
   * 寒夜「構造·唯一證明」（11.5 秒，銀藍）
   *   第一幕 收錄部：無盡的檔案架與停止的時鐘，寒夜翻閱卷宗 ——「異常個體，待分類。」
   *   第二幕 定義：世界褪成座標平面，敵人被放上網格；刻度沿著劍身亮起
   *   第三幕 證明：尺規作圖交於唯一的點；黎曼和的長條收斂成積分
   *   第四幕 Q.E.D.：帶刻度的一刀把空間切開 → 全身像定格
   * ========================================================= */
  function prepArchive(s) {
    if (s.archive) return;
    const bg = canvas(LW, LH), g = bg.getContext('2d');
    g.fillStyle = lin(g, 0, 0, 0, LH, [[0, '#02040c'], [0.6, '#08112a'], [1, '#02030a']]); g.fillRect(0, 0, LW, LH);
    const vx = LW / 2, vy = 470;   // 一點透視的消失點
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 9; i++) {   // 兩側往消失點延伸的檔案架
        const u0 = i / 9, u1 = (i + 0.85) / 9, f = u => 1 - Math.pow(u, 0.6);
        const x0 = vx + side * (LW * 0.55) * f(u0), x1 = vx + side * (LW * 0.55) * f(u1);
        const top0 = vy - 520 * f(u0), bot0 = vy + 520 * f(u0), top1 = vy - 520 * f(u1), bot1 = vy + 520 * f(u1);
        g.fillStyle = `rgba(${20 + i * 3},${30 + i * 4},${60 + i * 6},1)`; poly(g, [[x0, top0], [x1, top1], [x1, bot1], [x0, bot0]]); g.fill();
        g.strokeStyle = 'rgba(143,180,255,.18)'; g.lineWidth = 1;
        for (let r = 1; r < 8; r++) { g.beginPath(); g.moveTo(x0, lerp(top0, bot0, r / 8)); g.lineTo(x1, lerp(top1, bot1, r / 8)); g.stroke(); }
        // 架上的時鐘
        const cx = (x0 + x1) / 2, cy = lerp((top0 + top1) / 2, (bot0 + bot1) / 2, 0.3 + hash(i + side) * 0.3), cr = 30 * f(u0);
        g.strokeStyle = 'rgba(200,215,255,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + cr * 0.7 * Math.cos(hash(i) * TAU), cy + cr * 0.7 * Math.sin(hash(i) * TAU)); g.stroke();
      }
    }
    const fg = g.createRadialGradient(vx, vy, 10, vx, vy, 400); fg.addColorStop(0, 'rgba(160,190,255,.35)'); fg.addColorStop(1, 'rgba(160,190,255,0)');
    g.fillStyle = fg; g.fillRect(0, 0, LW, LH);
    s.archive = bg;
  }
  /** 一點透視的網格地板（座標平面） */
  function gridFloor(c, t, a, drift) {
    if (a <= 0) return;
    c.save(); c.globalAlpha = a; c.strokeStyle = 'rgba(143,180,255,.35)'; c.lineWidth = 1.2;
    const vx = W / 2, vy = 380;
    for (let i = -14; i <= 14; i++) { c.beginPath(); c.moveTo(vx + i * 12, vy); c.lineTo(vx + i * 230, H + 40); c.stroke(); }
    for (let j = 0; j < 14; j++) { const u = ((j + (drift || 0)) % 14) / 14, y = vy + Math.pow(u, 2.2) * (H + 40 - vy); c.globalAlpha = a * (0.25 + u); c.beginPath(); c.moveTo(-W, y); c.lineTo(W * 2, y); c.stroke(); }
    c.restore();
  }
  const HANYE = {
    dur: 11500,
    voice: { pitch: 0.85, rate: 0.9 },
    vo: [[500, 'Case file: anomaly. Classification pending.', '卷宗：異常個體。分類待定。', 2300], [2700, 'Let x be your end.', '設 x 為你的終點。', 3800],
      [4500, 'Assume another exists.', '假設存在另一個解。', 5600], [5800, 'Contradiction.', '矛盾。', 6500], [6900, 'As n approaches infinity—', '當 n 趨近無限——', 8200], [10000, 'Q.E.D.', '證明完畢。', 11000]],
    setup(s) {
      s.H = prepHero('hanye', { shadow: '#050816', light: '#e8f0ff', rim: '#8fb4ff', lampRGB: '200,220,255', shade: '6,10,30' });
      prepEnemies(s);
      prepArchive(s);
      s.pages = Array.from({ length: 22 }, (_, i) => ({ x: hash(i) * W, y: hash(i + 1) * H, r: hash(i + 2) * TAU, v: 0.02 + hash(i + 3) * 0.04 }));
      s.stars = Array.from({ length: 140 }, (_, i) => [hash(i * 2.1), hash(i * 3.7), 0.6 + hash(i) * 1.8]);
    },
    score() {
      return {
        cues: [[0, 'clock', { n: 8, gap: 0.4 }], [400, 'page', { n: 5 }], [2500, 'whooshDown', { dur: 0.6 }], [2600, 'chime', { notes: [86, 81, 88] }],
          [4300, 'sign', { dur: 0.6 }], [4800, 'sign', { dur: 0.6 }], [5300, 'sign', { dur: 0.5 }], [5800, 'stamp'], [6600, 'ticks', { dur: 1.6, gap: 0.1, slow: 0.96 }],
          [7900, 'riser', { dur: 1.0, vol: 0.2 }], [8550, 'swish', { vol: 0.6 }], [8600, 'glass', { vol: 0.5, n: 30 }], [8650, 'impact', { vol: 1 }],
          [9600, 'chime', { notes: [74, 81, 86, 93] }], [10000, 'sting', { notes: [50, 57, 62, 66, 69], dur: 2.0 }]],
        bed: [[0, [38, 50, 57]], [2600, [38, 50, 57, 62]], [4300, [36, 48, 55]], [6600, [38, 50, 57, 64]], [8600, [38, 50, 57, 62, 66]]],
      };
    },
    shake: [[5800, 160, 6], [8600, 500, 22]],
    draw(c, t, s) {
      const H0 = s.H, m = { x: 1080, y: 560 };   // 主目標站的位置
      const pages = a => { c.save(); c.fillStyle = 'rgba(230,236,255,.75)'; s.pages.forEach((p, i) => { c.globalAlpha = a * 0.6; c.save(); c.translate(p.x, (p.y - t * p.v * 6) % (H + 80) + (p.y - t * p.v * 6 < 0 ? H + 80 : 0)); c.rotate(p.r + t * 0.0006 * (i % 2 ? 1 : -1)); c.fillRect(-14, -18, 28, 36); c.restore(); }); c.restore(); };
      if (t < 2600) {   // 收錄部
        const k = { x: 0, y: lerp(20, -10, t / 2600), z: 1.02 + t / 2600 * 0.08, r: 0 };
        c.save(); cam(c, k, 0.8); layer(c, s.archive); c.restore();
        c.save(); cam(c, k, 1.05); heroDraw(c, H0, 'dark', 800, 330, 980, { rim: 'rim', rimDx: 0, rimDy: -4 }); c.restore();
        glow(c, 800, 420, 260, 'rgba(160,190,255,.25)', 1);
        pages(1);
        if (t > 500) { c.save(); c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(60, 60, 420, 74); c.fillStyle = '#a8c0ff'; c.font = '700 22px "Courier New", monospace'; c.fillText('TIME BUREAU / ARCHIVE', 80, 92); c.fillText(`FILE #${String(Math.floor(t / 37) % 10000).padStart(4, '0')}`, 80, 120); c.restore(); }
        vignette(c, 0.7, 'rgba(0,2,10,1)');
        return;
      }
      if (t < 4300) {   // 定義：座標平面，劍身上的刻度亮起
        full(c, '#03050f', 1);
        gridFloor(c, t, eo(prog(t, 2600, 3100)), t * 0.001);
        glow(c, m.x + 200, 640, 260, 'rgba(143,180,255,.3)', prog(t, 2800, 3200)); foe(c, s.enMain, m.x + 200, 760, 300, { alpha: prog(t, 2800, 3200), filter: 'brightness(1.5)' });
        const k = { x: 0, y: 0, z: 1 + prog(t, 2600, 4300) * 0.06, r: 0 };
        const sc = 1000 / 1280, hx = 620, hy = 40;   // 立繪以臉為錨點；劍從護手 (575,640) 延伸到劍尖 (775,1180)（原圖座標），整把劍都要在畫面內
        heroDraw(c, H0, 'lit', hx, hy, 1000, { rim: 'rim', rimDx: -6 });
        for (let i = 0; i < 12; i++) {   // 劍身上一格一格亮起的刻度
          const p = prog(t, 3100 + i * 70, 3200 + i * 70); if (p <= 0) continue;
          const u = 0.08 + i * 0.075, x = hx + (575 + 200 * u - 401) * sc, y = hy + (640 + 540 * u - 70) * sc;
          const w = i % 4 ? 30 : 52;
          c.save(); c.globalAlpha = p; c.fillStyle = '#7fa8ff'; c.shadowColor = '#cfe0ff'; c.shadowBlur = 18; c.fillRect(x - w / 2, y - 3, w, 6);
          if (i % 4 === 0) { c.font = '700 22px "Courier New", monospace'; c.fillStyle = '#cfe0ff'; c.fillText(String(i / 4 + 1), x + w / 2 + 8, y + 8); }
          c.restore();
        }
        full(c, '#dfe8ff', 0.5 * bump(t, 2620, 160));
        vignette(c, 0.6, 'rgba(0,2,10,1)');
        return;
      }
      if (t < 6600) {   // 證明：尺規作圖交於唯一的點
        full(c, '#03050f', 1);
        gridFloor(c, t, 0.8, t * 0.0012);
        glow(c, m.x, 640, 260, 'rgba(143,180,255,.3)', 1); foe(c, s.enMain, m.x, 760, 300, { filter: 'brightness(1.5)' });
        c.save(); c.setLineDash([8, 6]); c.strokeStyle = 'rgba(200,220,255,.85)'; c.lineWidth = 2;
        [[-180, 40, 220, 4300], [190, -20, 230, 4550], [0, 210, 200, 4800]].forEach(([dx, dy, r, t0]) => { const p = eio(prog(t, t0, t0 + 500)); if (p > 0) { c.beginPath(); c.arc(m.x + dx, m.y + dy, r, -1.2, -1.2 + TAU * p); c.stroke(); } });
        c.setLineDash([]); c.strokeStyle = '#ffffff';
        [-0.35, 0.4, 1.35].forEach((a, i) => { const p = eo(prog(t, 5200 + i * 100, 5500 + i * 100)), L = 900 * p; if (p > 0) { c.beginPath(); c.moveTo(m.x - Math.cos(a) * L, m.y - Math.sin(a) * L); c.lineTo(m.x + Math.cos(a) * L, m.y + Math.sin(a) * L); c.stroke(); } });
        c.restore();
        const pp = prog(t, 5700, 5850);
        if (pp > 0) { glow(c, m.x, m.y, 140 * eo(pp), 'rgba(210,225,255,.95)', 1); c.fillStyle = '#fff'; c.beginPath(); c.arc(m.x, m.y, 8, 0, TAU); c.fill(); c.font = 'italic 700 40px Georgia, serif'; c.fillText('x₀', m.x + 20, m.y - 24); c.font = '600 26px "Courier New", monospace'; c.fillStyle = '#9db8ee'; c.fillText('∃!', m.x + 20, m.y + 30); }
        // 左側的證明過程
        c.save(); c.font = '500 30px "Cambria Math", Consolas, monospace'; c.fillStyle = '#c9d8ff';
        ['Let  x ∈ Ω.', 'Suppose  x′ ≠ x.', '⇒  d(x, x′) > 0', '∴  contradiction.'].forEach((ln, i) => {
          const chars = [...ln], n = Math.floor(chars.length * prog(t, 4400 + i * 380, 4750 + i * 380));
          if (n > 0) c.fillText(chars.slice(0, n).join(''), 90, 200 + i * 56);
        });
        c.restore();
        heroDraw(c, H0, 'dark', 260, 520, 900, { rim: 'rim', rimDx: 4, alpha: 0.85 });
        if (t > 5800) { c.save(); c.globalAlpha = 1 - prog(t, 6300, 6600); c.translate(m.x - 40, m.y + 170); c.rotate(-0.12); c.strokeStyle = '#ff5a6a'; c.lineWidth = 6; D().roundRect(c, -150, -46, 300, 92, 10); c.stroke(); c.fillStyle = '#ff5a6a'; c.font = '900 40px Georgia, serif'; c.textAlign = 'center'; c.fillText('⊥  CONTRA.', 0, 14); c.restore(); }
        vignette(c, 0.6, 'rgba(0,2,10,1)');
        return;
      }
      if (t < 8500) {   // 黎曼和 → 積分
        full(c, '#03050f', 1);
        const x0 = 140, x1 = 1460, base = 780, top = 160;
        const f = x => 0.3 + 0.5 * Math.pow(Math.sin(Math.PI * x), 1.3) + 0.12 * Math.sin(3 * Math.PI * x + 0.6);
        const X = u => x0 + (x1 - x0) * u, Y = v => base - (base - top) * v;
        c.strokeStyle = 'rgba(190,210,255,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, top - 20); c.lineTo(x0, base); c.lineTo(x1 + 20, base); c.stroke();
        const n = Math.round(lerp(4, 64, eio(prog(t, 6700, 8000)))), merge = eo(prog(t, 7900, 8300));
        for (let i = 0; i < n; i++) {
          const a = i / n, b = (i + 1) / n, h = f((a + b) / 2);
          c.fillStyle = `rgba(143,180,255,${0.45 * (1 - merge)})`; c.fillRect(X(a) + 1, Y(h), X(b) - X(a) - 2, base - Y(h));
          if (n < 20) { c.strokeStyle = 'rgba(235,242,255,.9)'; c.strokeRect(X(a) + 1, Y(h), X(b) - X(a) - 2, base - Y(h));
            c.beginPath(); c.moveTo(X(a), Y(h)); for (let q = 0; q <= 8; q++) { const u = a + (b - a) * q / 8; c.lineTo(X(u), Y(f(u))); } c.lineTo(X(b), Y(h)); c.closePath(); c.fillStyle = 'rgba(255,150,90,.45)'; c.fill(); }
        }
        if (merge > 0) { c.save(); c.globalAlpha = merge; c.fillStyle = lin(c, 0, top, 0, base, [[0, 'rgba(225,235,255,.9)'], [1, 'rgba(110,150,255,.3)']]); c.shadowColor = '#8fb4ff'; c.shadowBlur = 40; c.beginPath(); c.moveTo(X(0), base); for (let q = 0; q <= 100; q++) c.lineTo(X(q / 100), Y(f(q / 100))); c.lineTo(X(1), base); c.closePath(); c.fill(); c.restore(); }
        c.strokeStyle = '#ffffff'; c.lineWidth = 3.5; c.shadowColor = '#8fb4ff'; c.shadowBlur = 16; c.beginPath(); for (let q = 0; q <= 100 * eo(prog(t, 6600, 7000)); q++) { const u = q / 100; q ? c.lineTo(X(u), Y(f(u))) : c.moveTo(X(u), Y(f(u))); } c.stroke(); c.shadowBlur = 0;
        c.fillStyle = '#e6eeff'; c.font = 'italic 600 40px Georgia, serif';
        c.fillText(merge > 0.3 ? 'lim  Σ f(xᵢ)Δx  =  ∫ f(x) dx' : `Σ f(xᵢ)Δx      n = ${n}`, 200, 120);
        if (merge > 0.3) { c.save(); c.globalAlpha = merge; c.font = 'italic 700 240px Georgia, serif'; c.fillStyle = 'rgba(230,238,255,.9)'; c.shadowColor = '#8fb4ff'; c.shadowBlur = 50; c.fillText('∫', 150, 640); c.restore(); }
        full(c, '#e8f0ff', 0.5 * bump(t, 8250, 200));
        vignette(c, 0.55, 'rgba(0,2,10,1)');
        return;
      }
      if (t < 9600) {   // 一刀：帶刻度的直線把空間切開
        const sp = eo(prog(t, 8500, 8620)), open = eo(prog(t, 8650, 9200)), ang = -0.42;
        const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, cx = W / 2, cy = H / 2;
        const drawWorld = () => { full(c, '#03050f', 1); gridFloor(c, t, 0.8, 2); [[m.x - 250, 0, 280], [m.x, 1, 320], [m.x + 250, 2, 280]].forEach(([x, i, h]) => (glow(c, x, 640, 220, 'rgba(143,180,255,.25)', 1), foe(c, i === 1 ? s.enMain : s.enShade, x, 760, h, { filter: 'brightness(1.5)' }))); };
        // 裂開的兩半：分別往法線兩側錯開，中間露出星空
        c.save(); c.fillStyle = '#000006'; c.fillRect(-W, -H, W * 3, H * 3);
        s.stars.forEach(([u, v, r]) => { c.fillStyle = `rgba(220,232,255,${0.4 + v * 0.6})`; c.beginPath(); c.arc(u * W, v * H, r, 0, TAU); c.fill(); });
        glow(c, cx, cy, 500, 'rgba(120,150,255,.35)', open);
        c.restore();
        [1, -1].forEach(sd => {
          c.save();
          c.beginPath(); const L = 2000; c.moveTo(cx - dx * L, cy - dy * L); c.lineTo(cx + dx * L, cy + dy * L); c.lineTo(cx + dx * L + nx * L * sd, cy + dy * L + ny * L * sd); c.lineTo(cx - dx * L + nx * L * sd, cy - dy * L + ny * L * sd); c.closePath(); c.clip();
          c.translate(nx * sd * 60 * open, ny * sd * 60 * open + sd * 10 * open);
          drawWorld();
          c.restore();
        });
        const bw = 18 * (1 - prog(t, 8650, 9300));
        if (bw > 0) { const L = 1800, x1 = cx - dx * L, y1 = cy - dy * L; D().blade(c, x1, y1, x1 + dx * 2 * L * sp, y1 + dy * 2 * L * sp, bw * 2.4, '#ffffff', '#8fb4ff');
          c.strokeStyle = '#fff'; c.lineWidth = 2; for (let q = -20; q <= 20; q++) { if (Math.abs(q) / 20 > sp) continue; const px = cx + dx * q * 50, py = cy + dy * q * 50, h = q % 4 ? 10 : 22; c.beginPath(); c.moveTo(px + nx * h, py + ny * h); c.lineTo(px - nx * h, py - ny * h); c.stroke(); } }
        full(c, '#ffffff', 0.85 * bump(t, 8560, 160));
        vignette(c, 0.5, 'rgba(0,2,10,1)');
        return;
      }
      // Q.E.D.：全身像定格
      const k = { x: 0, y: 0, z: 1.06 - prog(t, 9600, 11500) * 0.05, r: 0 };
      c.save(); cam(c, k, 0.7); layer(c, s.archive); c.restore();
      full(c, '#02040c', 0.35);
      glow(c, 1150, 420, 600, 'rgba(140,175,255,.4)', 1);
      c.save(); cam(c, k, 1.08); heroDraw(c, H0, 'lit', 1150, 120, 1700, { rim: 'rimW', rimDx: -6 }); c.restore();
      pages(0.6);
      const qa = eo(prog(t, 9900, 10200));
      if (qa > 0) { c.save(); c.globalAlpha = qa; c.font = 'italic 800 96px Georgia, serif'; c.fillStyle = '#ffffff'; c.shadowColor = '#8fb4ff'; c.shadowBlur = 30; c.fillText('Q.E.D.', 90, 300); c.fillRect(470, 230, 64, 64); c.restore(); }
      vignette(c, 0.5, 'rgba(0,2,10,1)');
      heroTitle(c, t, 9800, { band: '14,22,56', accent: '#8fb4ff', en: 'UNIQUE PROOF', zh: '構造·唯一證明', sub: 'HANYE ／ 時間總局·收錄部', subX: 340, zhCol: '#e6eeff' });
    },
  };

  /* =========================================================
   * 戈登「股票排山倒海」（11.5 秒，金與紅綠）
   *   第一幕 交易所頂樓：整面牆的螢幕在開盤前倒數，戈登背對城市夜景
   *   第二幕 開盤：鐘聲，K 線一路衝上漲停，金幣如雨
   *   第三幕 對沖：一彈指，整面螢幕翻轉成綠色崩盤
   *   第四幕 排山倒海：K 線組成的巨浪壓垮街上的敵人 → 「MARGIN CALL」定格
   * ========================================================= */
  function prepTrading(s) {
    if (s.trading) return;
    const bg = canvas(LW, LH), g = bg.getContext('2d');
    g.fillStyle = lin(g, 0, 0, 0, LH, [[0, '#020605'], [1, '#050b0a']]); g.fillRect(0, 0, LW, LH);
    for (let i = 0; i < 30; i++) {   // 窗外的城市剪影
      const x = i * 62, h = 120 + hash(i + 70) * 260;
      g.fillStyle = '#0a1412'; g.fillRect(x, 1000 - h, 56, h);
      g.fillStyle = 'rgba(255,214,120,.35)'; for (let y = 1000 - h + 10; y < 990; y += 14) for (let xx = x + 5; xx < x + 50; xx += 10) if (hash(xx + y * 0.3) > 0.7) g.fillRect(xx, y, 4, 6);
    }
    s.trading = bg;
    s.screens = [];   // 螢幕牆：6 × 3
    for (let r = 0; r < 3; r++) for (let q = 0; q < 6; q++) s.screens.push({ x: 120 + q * 230, y: 70 + r * 150, w: 210, h: 130, seed: r * 6 + q });
  }
  /** 一面螢幕：小型 K 線圖；trend > 0 漲（紅）、< 0 跌（綠）；p = 走到哪裡 */
  function screen(c, sc, t, trend, p, label) {
    c.save(); c.translate(sc.x, sc.y);
    c.fillStyle = '#030807'; c.fillRect(0, 0, sc.w, sc.h); c.strokeStyle = 'rgba(90,255,170,.25)'; c.lineWidth = 2; c.strokeRect(0, 0, sc.w, sc.h);
    const n = 16, cw = (sc.w - 20) / n; let v = 0.5;
    for (let i = 0; i < n * p; i++) {
      const o = v; v = Math.max(0.05, Math.min(0.95, v + trend * 0.045 + (hash(sc.seed * 31 + i) - 0.5) * 0.08));
      const up = v >= o, col = up ? '#ff4a58' : '#2fe07a', y0 = sc.h - 14 - o * (sc.h - 30), y1 = sc.h - 14 - v * (sc.h - 30);
      c.fillStyle = col; c.fillRect(10 + i * cw + 2, Math.min(y0, y1), cw - 4, Math.max(2, Math.abs(y1 - y0)));
    }
    c.fillStyle = 'rgba(255,214,120,.9)'; c.font = '700 14px "Courier New", monospace'; c.fillText(label || ['GDN', '9TH', 'MOCA', 'KANE', 'BKPD', 'TIME'][sc.seed % 6], 8, 18);
    c.restore();
  }
  function coinRain(c, t, t0, n, a) {
    for (let i = 0; i < n; i++) {
      const dt = (t - t0 - hash(i) * 600) / 1000; if (dt <= 0) continue;
      const x = hash(i + 3) * W, y = -40 + dt * (500 + hash(i + 5) * 500) + dt * dt * 200; if (y > H + 40) continue;
      c.save(); c.globalAlpha = a; c.translate(x, y); c.scale(Math.cos(dt * 8 + i), 1);
      c.fillStyle = lin(c, -14, 0, 14, 0, [[0, '#fff2b0'], [0.5, '#f0c050'], [1, '#9a6a10']]); c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill();
      c.strokeStyle = '#7a5208'; c.lineWidth = 2; c.stroke(); c.restore();
    }
  }
  const GORDON = {
    dur: 11500,
    voice: { pitch: 0.85, rate: 0.95 },
    vo: [[400, 'Markets open in three… two…', '三……二……開盤。', 2300], [2700, 'Buy.', '買進。', 3200], [3500, 'Buy everything.', '全部買進。', 4300],
      [4700, 'Limit up.', '漲停。', 5400], [6000, 'Now— hedge.', '現在——對沖。', 7000], [9900, 'Margin call.', '追繳保證金。', 10900]],
    setup(s) {
      s.H = prepHero('gordon', { shadow: '#0a0804', light: '#fff0c8', rim: '#ffd36a', lampRGB: '255,214,140', shade: '20,14,4' });
      prepEnemies(s);
      prepTrading(s);
      if (!s.dayBG) prepDay(s);
    },
    score() {
      return {
        cues: [[0, 'ticks', { dur: 2.3, gap: 0.5, slow: 1 }], [300, 'blip', { n: 6 }], [2400, 'bell', { n: 3 }], [2700, 'register'], [3000, 'ticks', { dur: 1.6, gap: 0.05, slow: 0.97 }], [3500, 'chips', { n: 24 }],
          [4600, 'chime', { notes: [84, 88, 91] }], [4700, 'chips', { n: 30 }], [5900, 'click'], [6050, 'whooshDown', { dur: 0.8 }], [6100, 'crack'], [6200, 'rumble', { dur: 1.2, vol: 0.25 }],
          [7300, 'riser', { dur: 1.2, vol: 0.2 }], [7600, 'rumble', { dur: 1.6, vol: 0.35 }], [8500, 'boom', { vol: 1 }], [8520, 'impact', { vol: 0.9 }], [8600, 'chips', { n: 40 }],
          [9600, 'stamp'], [9700, 'sting', { notes: [41, 48, 53, 56, 60], dur: 2.2 }]],
        bed: [[0, [33, 45, 52]], [2400, [33, 45, 52, 57]], [4600, [35, 47, 54, 59]], [6000, [32, 44, 51]], [8500, [33, 45, 52, 57, 60]]],
      };
    },
    shake: [[2400, 300, 4], [6100, 400, 10], [7600, 900, 6], [8500, 600, 28], [9600, 180, 8]],
    draw(c, t, s) {
      const H0 = s.H;
      if (t < 2400) {   // 開盤前：背對夜景，螢幕牆倒數
        const k = { x: lerp(-30, 10, t / 2400), y: 0, z: 1.03 + t / 2400 * 0.05, r: 0 };
        c.save(); cam(c, k, 0.5); layer(c, s.trading); c.restore();
        c.save(); cam(c, k, 0.8); s.screens.forEach(sc => screen(c, sc, t, 0, 0.3 + 0.1 * Math.sin(t * 0.002 + sc.seed))); c.restore();
        full(c, '#020403', 0.35);
        c.save(); cam(c, k, 1.1); heroDraw(c, H0, 'dark', 980, 420, 1300); c.restore();
        const cd = 3 - Math.floor(t / 800);
        c.save(); c.fillStyle = '#ffd36a'; c.font = '800 120px "Courier New", monospace'; c.textAlign = 'center'; c.globalAlpha = 0.85 - (t % 800) / 1600; c.shadowColor = '#ffd36a'; c.shadowBlur = 30; c.fillText(cd > 0 ? String(cd) : 'OPEN', 330, 520); c.restore();
        vignette(c, 0.65, 'rgba(0,4,2,1)');
        return;
      }
      if (t < 5800) {   // 開盤：K 線衝上漲停
        const k = { x: 0, y: 0, z: 1.02 + prog(t, 2400, 5800) * 0.08, r: 0 };
        c.save(); cam(c, k, 0.5); layer(c, s.trading); c.restore();
        const p = prog(t, 2400, 4600);
        c.save(); cam(c, k, 0.8); s.screens.forEach(sc => screen(c, sc, t, 1, Math.min(1, p * 1.2 + (sc.seed % 3) * 0.05))); c.restore();
        // 中央的大 K 線
        const N = 26, cx0 = 260, cx1 = 1340, base = 820, top = 140, shown = Math.floor(N * eo(p));
        let v = 0.12;
        c.save();
        for (let i = 0; i < shown; i++) {
          const o = v; v = Math.min(0.98, v + 0.03 + hash(i + 40) * 0.02); const x = lerp(cx0, cx1, i / N), y0 = lerp(base, top, o), y1 = lerp(base, top, v);
          c.fillStyle = '#ff4a58'; c.shadowColor = '#ff4a58'; c.shadowBlur = i === shown - 1 ? 30 : 10; c.fillRect(x, y1, 30, Math.max(3, y0 - y1));
          c.fillRect(x + 14, y1 - 14, 3, y0 - y1 + 28);
        }
        c.restore();
        const price = 100 * (1 + 0.6 * eo(p));
        c.save(); c.font = '800 70px "Courier New", monospace'; c.fillStyle = '#ff5a64'; c.shadowColor = '#ff5a64'; c.shadowBlur = 24; c.textAlign = 'center'; c.fillText(`${price.toFixed(2)} ▲${((price - 100)).toFixed(1)}%`, 760, 120); c.restore();
        if (t > 4600) {   // 漲停
          const lp = eback(prog(t, 4600, 4800));
          c.save(); c.translate(620, 470); c.scale(lp * 0.85, lp * 0.85); c.rotate(-0.06); c.fillStyle = '#e8323f'; D().roundRect(c, -330, -80, 660, 160, 18); c.fill();
          c.fillStyle = '#fff'; c.font = '900 92px ' + D().SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('漲停 LIMIT UP', 0, 6); c.restore();
          coinRain(c, t, 4650, 60, 1);
          heroDraw(c, H0, 'warm', lerp(1800, 1380, eo(prog(t, 4900, 5300))), 380, 1100, { alpha: prog(t, 4900, 5100) });
        }
        full(c, '#fff4d0', 0.5 * bump(t, 2420, 140) + 0.4 * bump(t, 4610, 160));
        vignette(c, 0.6, 'rgba(0,4,2,1)');
        return;
      }
      if (t < 7400) {   // 對沖：一彈指，螢幕翻轉成綠色崩盤
        const k = { x: 0, y: 0, z: 1.1, r: 0 };
        c.save(); cam(c, k, 0.5); layer(c, s.trading); c.restore();
        const flip = eio(prog(t, 6050, 6500));
        c.save(); cam(c, k, 0.8);
        s.screens.forEach(sc => {
          const f = prog(t, 6050 + (sc.seed % 6) * 50, 6300 + (sc.seed % 6) * 50), sx = Math.abs(Math.cos(f * Math.PI));
          c.save(); c.translate(sc.x + sc.w / 2, 0); c.scale(Math.max(0.02, sx), 1); c.translate(-sc.x - sc.w / 2, 0);
          screen(c, sc, t, f > 0.5 ? -1.4 : 1, 1, f > 0.5 ? 'HEDGE' : null); c.restore();
        });
        c.restore();
        // 裂開的玻璃
        if (t > 6100) { c.save(); c.strokeStyle = 'rgba(230,255,240,.7)'; c.lineWidth = 2; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + hash(i) * 0.3, L = 200 + hash(i + 4) * 600 * eo(prog(t, 6100, 6400)); c.beginPath(); c.moveTo(800, 450); c.lineTo(800 + Math.cos(a) * L, 450 + Math.sin(a) * L); c.stroke(); } c.restore(); }
        // 彈指的特寫：戈登的立繪近景
        const ap = eo(prog(t, 5800, 6050)) * (1 - prog(t, 6900, 7400));
        heroDraw(c, H0, 'warm', 520, 260, 1500, { alpha: ap });
        glow(c, 700, 640, 160, 'rgba(255,230,150,.9)', bump(t, 6000, 160));
        c.save(); c.globalAlpha = flip; c.font = '800 70px "Courier New", monospace'; c.fillStyle = '#3fd884'; c.shadowColor = '#3fd884'; c.shadowBlur = 24; c.textAlign = 'center'; c.fillText('▼ −61.8%', 1060, 120); c.restore();
        full(c, '#3fd884', 0.3 * bump(t, 6100, 200));
        vignette(c, 0.6, 'rgba(0,4,2,1)');
        return;
      }
      if (t < 9500) {   // 排山倒海：K 線巨浪壓垮街上的敵人
        const k = { x: 0, y: 0, z: 1.05, r: 0 };
        c.save(); cam(c, k, 0.6); layer(c, s.dayBG); c.restore();
        c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = lin(c, 0, 0, 0, H, [[0, '#2a3a2a'], [1, '#3a2a1a']]); c.fillRect(-W, -H, W * 3, H * 3); c.restore();
        const hit = eo(prog(t, 8500, 8900));
        [[980, 0, 320], [1180, 1, 380], [1380, 2, 320]].forEach(([x, i, h]) => foe(c, i === 1 ? s.enMain : s.enShade, x + hit * 120, 800 + hit * 40, h, { rot: hit * 0.5 * (i - 0.5) }));
        const front = lerp(-400, W + 600, eio(prog(t, 7500, 8900)));
        for (let i = 0; i < 70; i++) {   // 巨浪：前緣最高
          const u = i / 69, x = front - u * 1400; if (x < -60 || x > W + 60) continue;
          const env = Math.sin(Math.min(1, u * 1.5) * Math.PI) * 0.9 + 0.1, hh = H * 0.95 * env * (0.4 + hash(i) * 0.6), up = hash(i + 9) > 0.5;
          c.fillStyle = up ? '#ff4a58' : '#2fe07a'; c.shadowColor = '#ffd36a'; c.shadowBlur = 18; c.fillRect(x - 12, H - hh, 24, hh); c.shadowBlur = 0;
          c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(x - 1.5, H - hh - 26, 3, 26);
        }
        coinRain(c, t, 7600, 70, 1 - prog(t, 9200, 9500));
        if (t > 8600) {   // 債務糾紛：鎖鏈纏上敵人
          const cp = eo(prog(t, 8600, 9000));
          c.save(); c.strokeStyle = '#ffd36a'; c.lineWidth = 6; c.setLineDash([18, 10]); c.globalAlpha = cp;
          [1100, 1300, 1500].forEach((x, i) => { c.beginPath(); c.ellipse(x, 640 + i * 10, 120 * cp, 40, 0.2 * (i - 1), 0, TAU); c.stroke(); });
          c.restore();
        }
        full(c, '#fff4d0', 0.85 * bump(t, 8510, 200));
        vignette(c, 0.5, 'rgba(0,4,2,1)');
        return;
      }
      // 定格：螢幕牆全部顯示 HEDGED，戈登在金光中
      const k = { x: 0, y: 0, z: 1.08 - prog(t, 9500, 11500) * 0.05, r: 0 };
      c.save(); cam(c, k, 0.5); layer(c, s.trading); c.restore();
      c.save(); cam(c, k, 0.8); s.screens.forEach(sc => { screen(c, sc, t, sc.seed % 2 ? 1 : -1, 1, 'HEDGED'); }); c.restore();
      full(c, '#050302', 0.35);
      glow(c, 1100, 400, 640, 'rgba(255,211,106,.45)', 1);
      c.save(); cam(c, k, 1.08); heroDraw(c, H0, 'warm', 1120, 380, 1200); c.restore();
      coinRain(c, t, 9500, 30, 0.8);
      const sp = prog(t, 9600, 9700), sk = lerp(2.4, 1, eo(sp));
      if (sp > 0) { c.save(); c.globalAlpha = Math.min(1, sp * 3); c.translate(420, 250); c.rotate(-0.1); c.scale(sk, sk); c.strokeStyle = '#ffd36a'; c.fillStyle = '#ffd36a'; c.lineWidth = 8; c.shadowColor = 'rgba(255,211,106,.8)'; c.shadowBlur = 16; D().roundRect(c, -170, -70, 340, 140, 14); c.stroke(); c.font = '900 72px ' + D().SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('對沖', 0, -8); c.font = '800 22px sans-serif'; c.fillText('H E D G E D', 0, 46); c.restore(); }
      vignette(c, 0.5, 'rgba(0,4,2,1)');
      heroTitle(c, t, 9800, { band: '52,38,8', accent: '#ffd36a', en: 'MARGIN CALL', zh: '股票排山倒海', sub: 'GORDON ／ 平衡・時間織機', subX: 330, zhCol: '#fff0c8' });
    },
  };

  /* =========================================================
   * 馬克「盈科後進」：筆記本蓄滿四坑／溶進戰場、浪拍過坑打向邊緣敵人／敵人近景、遠浪漸大後拍下（13 秒）
   * 米勒「願你安息，願我銘記」：雨／獻花／悼鐘／安魂（12.5 秒）
   * 兩片使用相同鏡頭與播放生命週期，道具、場景與配樂各自編排。
   * ========================================================= */
  function inkLabel(c, text, x, y, size, col) {
    c.save(); c.font = `600 ${size}px ${D().SERIF}`; c.fillStyle = col;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(text, x, y); c.restore();
  }
  function stillRipple(c, x, y, r, a, col) {
    if (a <= 0 || r <= 0) return;
    c.save(); c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); c.ellipse(x, y, r, r * 0.22, 0, 0, TAU); c.stroke(); c.restore();
  }
  // Film targets follow the actual battle's lineup; no fixed three-enemy tableau.
  function filmTargets(s) {
    return s.enemies.map(e => ({ ...e, img: (Art.enemy(e) || {}).canvas || s.enShade }));
  }
  function fallbackHero(c, x, y, h, col) {
    // Asset loading must never turn a film into an empty scene.
    c.save(); c.translate(x, y); c.scale(h / 700, h / 700); c.fillStyle = col;
    c.beginPath(); c.arc(0, 15, 35, 0, TAU); c.fill();
    poly(c, [[-35, 54], [35, 54], [90, 335], [35, 360], [24, 620], [-8, 620], [-16, 360], [-38, 620], [-68, 620], [-60, 330], [-90, 315]], col);
    c.restore();
  }
  function filmHero(c, s, variant, x, y, h, o) {
    if (s.H) heroDraw(c, s.H, variant, x, y, h, o);
    else fallbackHero(c, x, y, h, s.key === 'mark' ? '#327b99' : '#343143');
  }
  function prepWaterCourt(s) {
    const bg = canvas(LW, LH), c = bg.getContext('2d');
    c.fillStyle = lin(c, 0, 0, 0, LH, [[0, '#061929'], [0.55, '#163b4c'], [0.56, '#0c293b'], [1, '#020e1a']]); c.fillRect(0, 0, LW, LH);
    glow(c, 1240, 350, 490, 'rgba(147,216,218,.22)', 1);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 18; i++) {
      const x = i * 115 + j * 36, h = 50 + hash(i + j * 23) * 150;
      rect(c, x, 510 - h, 82, h, ['#102b3d', '#0c2536', '#081d2c'][j]);
      for (let k = 0; k < 4; k++) rect(c, x + 12 + k * 16, 530 - h, 3, h - 24, 'rgba(152,205,209,.06)');
    }
    // Wet stone, converging joints, and a low waterfront railing.
    c.strokeStyle = 'rgba(139,207,219,.15)'; c.lineWidth = 2;
    for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(900 + i * 52, 560); c.lineTo(900 + i * 250, LH); c.stroke(); }
    for (let i = 0; i < 9; i++) { const y = 565 + i * i * 7; c.beginPath(); c.moveTo(0, y); c.lineTo(LW, y); c.stroke(); }
    rect(c, 0, 528, LW, 6, '#233e4b');
    for (let x = 50; x < LW; x += 120) rect(c, x, 530, 8, 70, '#1b3342');
    s.waterCourt = bg;
  }
  function notebook(c, t, x, y, scale, opened) {
    c.save(); c.translate(x, y); c.rotate(-0.065); c.scale(scale, scale);
    c.shadowColor = '#000a'; c.shadowBlur = 40;
    c.fillStyle = '#17314c'; D().roundRect(c, -370, -235, 740, 470, 14); c.fill(); c.shadowBlur = 0;
    for (const side of [-1, 1]) {
      c.fillStyle = side < 0 ? '#e8e4d8' : '#f6f0df';
      c.fillRect(side < 0 ? -350 : 6, -217, 344, 432);
      c.strokeStyle = '#5f829826'; c.lineWidth = 1;
      for (let i = 0; i < 10; i++) { c.beginPath(); c.moveTo(side < 0 ? -326 : 26, -160 + i * 36); c.lineTo(side < 0 ? -25 : 325, -160 + i * 36); c.stroke(); }
    }
    rect(c, -6, -217, 12, 432, '#b9ad93');
    inkLabel(c, '實戰筆記', -315, -174, 29, '#18394b');
    const lines = ['先看清，水往哪裡走。', '蓄滿眼前的每一道凹陷。', '然後，再向前一步。'];
    lines.forEach((line, i) => {
      const n = Math.floor(line.length * prog(t, 350 + i * 370, 950 + i * 370));
      inkLabel(c, line.slice(0, n), -316, -92 + i * 63, 22, '#305b70');
    });
    c.save(); c.translate(175, 0); c.strokeStyle = '#41677a'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-128, -95);
    for (let i = 0; i < 4; i++) { const x0 = -128 + i * 64; c.lineTo(x0, 60 - i * 28); c.lineTo(x0 + 46, 60 - i * 28); c.lineTo(x0 + 46, -95); c.lineTo(x0 + 64, -95); } c.stroke();
    const p = prog(t, 1350, 2250);
    for (let i = 0; i < 4; i++) { const fill = clamp(p * 4 - i); c.fillStyle = '#58a8c688'; c.fillRect(-126 + i * 64, 60 - i * 28 - (153 - i * 28) * fill, 42, (153 - i * 28) * fill); }
    c.restore();
    // A real hinged leaf, rather than swapping the whole book for a static card.
    if (opened > 0 && opened < 1) {
      c.save(); c.scale(Math.cos(opened * Math.PI), 1); c.fillStyle = '#f4ead5'; c.fillRect(6, -217, 344, 432); c.restore();
    }
    c.restore();
  }
  function waterRibbon(c, t, front, strength) {
    // A curling crest with layered translucent bodies and foam following its contour.
    c.save();
    for (let layer = 0; layer < 5; layer++) {
      const x = front - layer * 40, y = 610 + layer * 27, h = strength * (390 - layer * 34);
      c.fillStyle = lin(c, x, y - h, x - 320, H, [[0, layer ? '#69c8dc88' : '#b9faffdc'], [0.24, '#178bbbc9'], [1, '#062c69e8']]);
      c.beginPath(); c.moveTo(-400, H + 100); c.lineTo(-400, y + 80);
      c.bezierCurveTo(x - 510, y + 110, x - 360, y - h - 30, x - 120, y - h);
      c.bezierCurveTo(x + 95, y - h - 20, x + 120, y - h + 185, x - 35, y - h + 195);
      c.bezierCurveTo(x + 20, y - h + 110, x - 75, y - h + 68, x - 115, y - h + 115);
      c.bezierCurveTo(x - 90, y + 30, x + 105, y + 150, x + 155, H + 100); c.closePath(); c.fill();
      c.strokeStyle = layer ? '#94edff66' : '#ddffff'; c.lineWidth = layer ? 2 : 5; c.stroke();
    }
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 100; i++) {
      const u = hash(i + 72), a = u * Math.PI * 1.4 - Math.PI;
      const x = front - 120 + Math.cos(a) * (95 + hash(i + 4) * 180) - hash(i) * 160;
      const y = 610 - strength * 390 + 90 + Math.sin(a) * (70 + hash(i + 6) * 100) + Math.sin(t * 0.006 + i) * 15;
      c.globalAlpha = 0.3 + hash(i + 7) * 0.6; c.fillStyle = '#c7faff';
      c.beginPath(); c.ellipse(x, y, 2 + hash(i + 9) * 7, 1 + hash(i + 1) * 3, -0.5, 0, TAU); c.fill();
    }
    c.restore();
  }
  // 戰場地面上的四個坑：由近（左下）到遠（右上），對應筆記本上的「觀察・模仿・理解・實踐」
  const MARK_PITS = [[400, 780, 130], [660, 706, 104], [905, 656, 84], [1110, 620, 66]];
  const MARK_STEPS = ['觀察', '模仿', '理解', '實踐'];
  function markPage(c, t) {
    // The page becomes a cross-section of four communicating pools.
    const p = Math.min(1.4, (t - 2400) / 2400);
    full(c, '#e9e8dc', 1);
    inkLabel(c, '盈 科', 115, 175, 70, '#174152'); inkLabel(c, '水不盈科，不行。', 120, 230, 26, '#507581');
    c.save(); cam(c, { x: p * 40, y: 0, z: 1 + p * 0.07, r: -0.015 }, 1);
    c.strokeStyle = '#183c50'; c.lineWidth = 8; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-50, 415);
    for (let i = 0; i < 4; i++) { const x = 160 + i * 320; c.lineTo(x, 415); c.lineTo(x, 730 - i * 54); c.lineTo(x + 225, 730 - i * 54); c.lineTo(x + 225, 415); } c.lineTo(1700, 415); c.stroke();
    for (let i = 0; i < 4; i++) {
      const x = 160 + i * 320, base = 730 - i * 54, q = eo(prog(t, 2550 + i * 500, 3040 + i * 500));
      c.fillStyle = lin(c, 0, 415, 0, 740, [[0, '#65c7d4bb'], [1, '#2e729dcc']]);
      c.fillRect(x + 5, base - (base - 420) * q, 215, (base - 420) * q);
      if (q > 0) stillRipple(c, x + 112, base - (base - 420) * q, 90 + Math.sin(t * 0.003 + i) * 8, 0.8, '#eaffff');
      inkLabel(c, MARK_STEPS[i], x + 65, 805 - i * 12, 29, q === 1 ? '#11667d' : '#96a6a8');
      if (i < 3 && q > 0.9) {
        c.strokeStyle = '#8ceaf1'; c.lineWidth = 8; c.beginPath(); c.moveTo(x + 225, 420); c.quadraticCurveTo(x + 275, 400, x + 325, 480); c.stroke();
      }
    }
    c.restore();
  }
  function markPit(c, t, i, a) {
    if (a <= 0) return;
    const [x, y, r] = MARK_PITS[i];
    c.save(); c.globalAlpha = a;
    c.fillStyle = '#03101a'; c.beginPath(); c.ellipse(x, y, r * 1.14, r * 0.31, 0, 0, TAU); c.fill();
    c.fillStyle = lin(c, 0, y - r * 0.25, 0, y + r * 0.25, [[0, '#a6eef3'], [0.45, '#3f9fc4'], [1, '#0f4a73']]);
    c.beginPath(); c.ellipse(x, y + 2, r, r * 0.25, 0, 0, TAU); c.fill();
    c.globalAlpha = a * 0.75; inkLabel(c, MARK_STEPS[i], x - r * 0.35, y + r * 0.3 + 30, 18 + r * 0.07, '#c4f3f7');
    c.restore();
    stillRipple(c, x, y + 2, r * (0.35 + ((t * 0.0005 + i * 0.27) % 1) * 0.6), a * 0.55, '#e4ffff');
  }
  /** 遠方的浪牆：從地平線升起，高度 wh；crest 回傳每個 x 的浪頂 */
  function markWall(c, t, hz, wh) {
    const crest = x => hz - wh * (0.84 + 0.09 * Math.sin(x * 0.006 + t * 0.0016) + 0.07 * Math.sin(x * 0.017 - t * 0.003));
    c.save();
    c.fillStyle = lin(c, 0, hz - wh, 0, hz, [[0, '#c9f8ff'], [0.12, '#5fc3dc'], [0.5, '#1a6a98'], [1, '#062a4a']]);
    c.beginPath(); c.moveTo(-120, hz + 6);
    for (let x = -120; x <= W + 120; x += 40) c.lineTo(x, crest(x));
    c.lineTo(W + 120, hz + 6); c.closePath(); c.fill();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = '#e8ffff'; c.lineWidth = 3 + wh * 0.012;
    c.beginPath(); for (let x = -120; x <= W + 120; x += 40) x === -120 ? c.moveTo(x, crest(x)) : c.lineTo(x, crest(x)); c.stroke();
    for (let i = 0; i < 70; i++) { // 浪頂飛沫
      const x = hash(i) * (W + 200) - 100, y = crest(x) - hash(i + 3) * (12 + wh * 0.12) - ((t * 0.05 + i * 13) % 30);
      glow(c, x, y, 2 + hash(i + 7) * (2 + wh * 0.012), '#e6ffff', 0.35 + hash(i + 1) * 0.4);
    }
    c.restore();
    return crest;
  }
  const MARK = {
    dur: 13000, voice: { pitch: 1.08, rate: 0.96 }, subtitlePanel: true,
    vo: [[350, 'First, observe.', '先看清楚。', 1700], [2600, 'A little more. One step at a time.', '再蓄一點，一步一步來。', 4400],
      [5000, 'I have learned from every one of you.', '從你們身上學到的——', 6450], [6650, 'Now, let me put it into practice!', '現在，換我付諸實踐！', 8000], [8700, 'Fill the hollow. Then move forward.', '盈科，而後進。', 10800]],
    setup(s) {
      s.H = prepHero('mark', { shadow: '#061627', light: '#e0fbff', rim: '#71dbf2', lampRGB: '160,225,255', shade: '4,20,40' });
      prepEnemies(s); s.targets = filmTargets(s); prepWaterCourt(s);
      s.page = canvas(W, H);
    },
    score() { return {
      bed: [[0, [38, 50, 57, 64]], [2400, [43, 55, 62, 69]], [4800, [45, 57, 64, 71]], [6650, [38, 50, 57, 62, 66]], [7600, [36, 48, 55, 62]], [11400, [38, 54, 57, 62, 69]]],
      cues: [[0, 'wind', { dur: 2.4, vol: 0.04 }], [250, 'page', { n: 2 }], [1300, 'chime', { notes: [74, 81] }], [2400, 'whooshDown', { dur: 0.45 }],
        [2700, 'chime', { notes: [62] }], [3200, 'chime', { notes: [66] }], [3700, 'chime', { notes: [69] }], [4200, 'chime', { notes: [74] }],
        [4800, 'whooshDown', { dur: 0.8, vol: 0.18 }], [5000, 'water', { dur: 1.4 }], [5300, 'footsteps', { n: 3, gap: 0.45 }], [5700, 'riser', { dur: 1.0, vol: 0.14 }],
        [6650, 'swish', { vol: 0.55 }], [6700, 'water', { dur: 1.6 }],
        [7065, 'chime', { notes: [62] }], [7180, 'chime', { notes: [66] }], [7280, 'chime', { notes: [69] }], [7365, 'chime', { notes: [74] }],
        [7420, 'impact', { vol: 0.45 }], [7600, 'whooshDown', { dur: 0.4 }],
        [7700, 'rumble', { dur: 3.0, vol: 0.2 }], [8200, 'riser', { dur: 2.5, vol: 0.16 }], [9200, 'rain', { dur: 1.6, vol: 0.2 }], [9900, 'rumble', { dur: 0.9, vol: 0.32 }],
        [10450, 'whoosh', { dur: 0.35 }], [10800, 'impact', { vol: 1 }], [10810, 'boom', { vol: 0.7 }], [10820, 'water', { dur: 1.4 }],
        [11500, 'chime', { notes: [74, 78, 81, 86] }], [11700, 'sting', { notes: [50, 57, 62, 66, 69], dur: 1.8 }]],
    }; },
    shake: [[7420, 260, 6], [9900, 900, 3], [10800, 650, 18]],
    draw(c, t, s) {
      if (t < 2400) { // Notebook macro: the drawn reservoirs fill before the cut.
        layer(c, s.waterCourt); full(c, '#020c18', 0.6);
        filmHero(c, s, 'dark', 1210, 210, 1100, { rim: 'rim', rimDx: -4 });
        glow(c, 620, 470, 500, 'rgba(93,190,222,.2)', 1);
        notebook(c, t, 650, 455, 1.05 + t * 0.000035, prog(t, 100, 650));
        inkLabel(c, 'MARK / FIELD NOTES', 92, 110, 24, '#a1cad8');
        vignette(c, 0.5); full(c, '#020b15', 1 - prog(t, 0, 250)); return;
      }
      if (t < 4800) { markPage(c, t); return; }
      if (t < 7600) { // 紙面溶進戰場；浪從馬克身後湧出，拍過蓄滿的坑，打向最邊緣的敵人們
        const w = prog(t, 6650, 7600), front = lerp(-420, 1700, Math.pow(w, 1.15)), dis = eo(prog(t, 4800, 5700));
        c.save(); cam(c, { x: lerp(-30, 0, prog(t, 4800, 6650)) + eio(w) * 230, y: -10, z: 1.03 + eio(w) * 0.06, r: 0 }, 1);
        layer(c, s.waterCourt); full(c, '#03111f', 0.25);
        MARK_PITS.forEach((_, i) => markPit(c, t, i, eo(prog(t, 4900 + i * 140, 5600 + i * 140))));
        const n = s.targets.length, gap = Math.min(60, 200 / Math.max(1, n));
        s.targets.forEach((e, i) => {
          const x = 1230 + i * gap, hit = eo(clamp((front - x) / 160));
          foe(c, e.img, x + hit * 70, 604 + i * 3, 230, { rot: hit * 0.24, alpha: 1 - hit * 0.45, filter: 'brightness(.72)' });
        });
        // 馬克與匯流的水環
        const hp = prog(t, 5000, 6650);
        filmHero(c, s, 'lit', 300 + hp * 30, 235, 800, { rim: 'rim', rimDx: -5, alpha: eo(prog(t, 5000, 5600)) });
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 8; i++) {
          c.strokeStyle = i % 2 ? '#93f4ff88' : '#327edcaa'; c.lineWidth = 3 + i % 3; c.globalAlpha = prog(t, 5200, 5800) * (1 - prog(t, 6700, 7000));
          const r = hp * 160 + 60 + i * 16;
          c.beginPath(); c.ellipse(315, 640 - i * 34, r, 45 + hp * 70, hp * 0.2, -Math.PI * 0.7 + i * 0.2, Math.PI * 1.2 + hp * 1.8); c.stroke();
        } c.restore();
        if (w > 0) {
          const passed = MARK_PITS.reduce((a, [px]) => a + eo(clamp((front - px) / 180)), 0);
          waterRibbon(c, t, front, eo(prog(t, 6650, 6900)) * (0.3 + passed * 0.075));
          c.save(); c.globalCompositeOperation = 'lighter';
          MARK_PITS.forEach(([px, py, r], i) => { // 浪拍過坑時濺起的水花
            const sp = clamp((front - px) / 300);
            if (sp <= 0 || sp >= 1) return;
            for (let j = 0; j < 16; j++) { const a = -Math.PI * (0.15 + hash(j + i * 31) * 0.7), d = sp * (60 + hash(j + 2) * r * 1.6); glow(c, px + Math.cos(a) * d, py - 60 + Math.sin(a) * d * 1.4 + sp * sp * 90, 3 + hash(j) * 5, '#dfffff', (1 - sp) * 0.8); }
          });
          const eh = bump(front, 1300, 260); // 打到邊緣敵人的白浪
          glow(c, 1300, 560, 260, 'rgba(210,252,255,.6)', eh);
          c.restore();
        }
        c.restore();
        c.save(); c.globalAlpha = prog(t, 5600, 5900) * (1 - prog(t, 6550, 6750));
        inkLabel(c, '所學的每一步，都在此刻匯流。', 760, 300, 31, '#cef4f7'); c.restore();
        vignette(c, 0.45);
        if (dis < 1) { // 筆記本的紙面漸漸溶進戰場
          const g = s.page.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); markPage(g, t);
          c.save(); c.globalAlpha = 1 - dis; c.drawImage(s.page, 0, 0); c.restore();
        }
        full(c, '#d6faff', prog(t, 7440, 7600) * 0.85); return;
      }
      if (t < 11400) { // 敵人排排站的近景：遠方的浪越來越大，最後一句話說完的瞬間拍下
        const p = prog(t, 7600, 10500), g = p * p, crash = 10800, lip = eio(prog(t, 10540, crash)), hz = 540;
        if (t < crash) {
          c.save(); cam(c, { x: 0, y: -g * 18, z: 1.02 + p * 0.07 + lip * 0.06, r: 0 }, 1);
          c.fillStyle = lin(c, 0, -80, 0, hz, [[0, '#04101c'], [1, '#1c4659']]); c.fillRect(-120, -120, W + 240, hz + 130);
          markWall(c, t, hz, lerp(22, 640, g));
          c.fillStyle = lin(c, 0, hz, 0, H + 60, [[0, '#123447'], [0.4, '#0a2232'], [1, '#020c15']]); c.fillRect(-120, hz, W + 240, H - hz + 160);
          c.save(); c.globalAlpha = 0.18 + g * 0.3; // 濕地面映著浪光
          c.fillStyle = lin(c, 0, hz, 0, hz + 220, [[0, '#7fd8ec'], [1, 'rgba(127,216,236,0)']]); c.fillRect(-120, hz, W + 240, 220); c.restore();
          const n = s.targets.length, gap = Math.min(330, 1250 / Math.max(1, n));
          s.targets.forEach((e, i) => {
            const off = i - (n - 1) / 2, x = 800 + off * gap, shiver = Math.sin(t * 0.045 + i * 2) * p * 2.5;
            for (let k = 0; k < 3; k++) stillRipple(c, x, 885, 60 + ((t * 0.08 + k * 40 + i * 17) % 120) * (0.6 + p), 0.25 + p * 0.25, '#9fe6f2');
            foe(c, e.img, x + shiver, 890, 610 - Math.abs(off) * 30, { filter: `brightness(${(0.9 - g * 0.55).toFixed(2)})` });
          });
          full(c, '#01070f', g * 0.22);
          c.save(); c.globalCompositeOperation = 'lighter'; // 被風捲來的水霧
          for (let i = 0; i < 40; i++) { const x = (hash(i) * W * 1.2 + (t - 7600) * (0.08 + hash(i + 2) * 0.25)) % (W + 100) - 50, y = 120 + hash(i + 4) * 700; glow(c, x, y, 2 + hash(i + 6) * 4, '#bdf4ff', (0.15 + p * 0.45) * hash(i + 9)); }
          c.restore();
          if (lip > 0) { // 浪舌翻過頭頂，朝鏡頭砸下
            const edge = lerp(-160, H + 140, lip), ey = x => edge + Math.sin(x * 0.011 + t * 0.01) * 26 + Math.sin(x * 0.031) * 12;
            c.fillStyle = lin(c, 0, edge - 520, 0, edge, [[0, '#082f55'], [0.55, '#14699c'], [0.88, '#5cc6e2'], [1, '#e6ffff']]);
            c.beginPath(); c.moveTo(-140, -260);
            for (let x = -140; x <= W + 140; x += 30) c.lineTo(x, ey(x));
            c.lineTo(W + 140, -260); c.closePath(); c.fill();
            c.save(); c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 46; i++) { // 往下墜的水絲
              const x = hash(i + 80) * (W + 200) - 100, len = 160 + hash(i + 81) * 380;
              c.strokeStyle = `rgba(170,240,255,${(0.12 + hash(i + 82) * 0.22).toFixed(2)})`; c.lineWidth = 2 + hash(i + 83) * 6;
              c.beginPath(); c.moveTo(x, ey(x) - len); c.lineTo(x + 8, ey(x) - 10); c.stroke();
            }
            c.strokeStyle = '#f2ffffdd'; c.lineWidth = 16; c.lineJoin = 'round';
            c.beginPath(); for (let x = -140; x <= W + 140; x += 30) x === -140 ? c.moveTo(x, ey(x)) : c.lineTo(x, ey(x)); c.stroke();
            for (let i = 0; i < 80; i++) { const x = hash(i + 50) * (W + 200) - 100; glow(c, x, ey(x) + hash(i) * 40 - 10, 5 + hash(i + 2) * 12, '#eaffff', 0.75); }
            c.restore();
          }
          c.restore(); vignette(c, 0.5 + g * 0.2); return;
        }
        // 拍下之後：滿畫面翻騰的水，敵人被捲走
        const q = prog(t, crash, 11400);
        full(c, '#0b4f7c', 1);
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) { const y = hash(i) * H, x = -300 + ((t - crash) * (0.9 + hash(i + 1) * 1.2) + hash(i + 3) * W) % (W + 600); c.strokeStyle = '#a9eeff55'; c.lineWidth = 2 + hash(i + 5) * 5; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 180, y - 40, x + 380, y + 10); c.stroke(); }
        for (let i = 0; i < 60; i++) glow(c, hash(i + 20) * W, H - ((t - crash) * (0.3 + hash(i) * 0.6) + hash(i + 8) * H) % (H + 40), 2 + hash(i + 4) * 6, '#dcffff', 0.55);
        c.restore();
        const n = s.targets.length, gap = Math.min(330, 1250 / Math.max(1, n));
        s.targets.forEach((e, i) => { const off = i - (n - 1) / 2; foe(c, e.img, 800 + off * gap + q * (200 + i * 60), 890 - q * 120, 610 - Math.abs(off) * 30, { rot: q * (0.6 + i * 0.15), alpha: 0.55 * (1 - q), filter: 'brightness(.5)' }); });
        full(c, '#f2ffff', bump(t, crash, 200)); full(c, '#bbf2ed', prog(t, 11150, 11400)); return;
      }
      // Dawn. The surge returns to a single ripple beneath the young officer.
      layer(c, s.waterCourt); full(c, '#acd7cd', 0.18);
      glow(c, 1170, 290, 550, 'rgba(255,224,158,.45)', 1);
      for (let i = 0; i < 7; i++) stillRipple(c, 1160, 790, 80 + ((t - 11400 + i * 230) % 2000) * 0.3, 0.25, '#bdf6ee');
      filmHero(c, s, 'day', 1205, 160, 730, { rim: 'rimW', rimDx: -3 });
      for (let i = 0; i < 22; i++) { const x = hash(i) * W, y = (hash(i + 5) * H - (t - 11400) * (0.02 + hash(i) * 0.04) + H) % H; glow(c, x, y, 3 + hash(i + 8) * 4, '#a5faff', 0.5); }
      heroTitle(c, t, 11650, { band: '5,38,58', accent: '#8ce4ed', en: 'ONWARD, LIKE WATER', enSize: 51, zh: '盈科後進', zhSize: 57, sub: 'MARK ／ 觀察・理解・實踐', subX: 330, zhCol: '#dcffff' });
      full(c, '#bbf2ed', 1 - prog(t, 11400, 11760));
    },
  };

  function prepMemorial(s) {
    const bg = canvas(LW, LH), c = bg.getContext('2d');
    c.fillStyle = lin(c, 0, 0, 0, LH, [[0, '#090a14'], [0.55, '#272238'], [1, '#070910']]); c.fillRect(0, 0, LW, LH);
    glow(c, 900, 400, 620, 'rgba(154,135,191,.15)', 1);
    for (let i = -3; i <= 3; i++) {
      const x = 900 + i * 275;
      c.fillStyle = '#0c0d18'; c.beginPath(); c.moveTo(x - 110, 730); c.lineTo(x - 110, 290); c.quadraticCurveTo(x, 30, x + 110, 290); c.lineTo(x + 110, 730); c.fill();
      c.strokeStyle = '#57506466'; c.lineWidth = 4; c.stroke();
      c.beginPath(); c.moveTo(x, 170); c.lineTo(x, 720); c.moveTo(x - 90, 330); c.lineTo(x + 90, 330); c.stroke();
      rect(c, x - 128, 170, 18, 590, '#12121f'); rect(c, x + 110, 170, 18, 590, '#12121f');
    }
    c.fillStyle = lin(c, 0, 710, 0, LH, [[0, '#1c1b2e'], [1, '#080a12']]); c.fillRect(0, 710, LW, 290);
    c.strokeStyle = '#786c8930'; c.lineWidth = 2;
    for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(900 + i * 30, 710); c.lineTo(900 + i * 240, LH); c.stroke(); }
    for (let i = 0; i < 8; i++) { const y = 710 + i * i * 6; c.beginPath(); c.moveTo(0, y); c.lineTo(LW, y); c.stroke(); }
    s.memorial = bg;
    // Flower sprites are cached once per film, not rebuilt for every petal each frame.
    s.flowers = [false, true].map(red => {
      const cv = canvas(100, 100), g = cv.getContext('2d'); g.translate(50, 50);
      const n = red ? 6 : 22;
      for (let i = 0; i < n; i++) {
        g.save(); g.rotate(i * TAU / n); g.fillStyle = red ? (i % 2 ? '#b4315b' : '#e25770') : (i % 2 ? '#aaa5bd' : '#eeedf4');
        g.beginPath(); g.ellipse(0, -20, red ? 21 : 5, red ? 25 : 23, red ? 0.3 : -0.16, 0, TAU); g.fill(); g.restore();
      }
      for (let i = 0; i < (red ? 9 : 14); i++) { const a = i * 2.4; g.fillStyle = red ? '#161222' : '#d4c9a0'; g.beginPath(); g.arc(Math.cos(a) * 7, Math.sin(a) * 7, 3, 0, TAU); g.fill(); }
      return cv;
    });
  }
  function memorialFlower(c, s, x, y, size, rot, red, alpha) {
    if (alpha <= 0 || size <= 0) return;
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.rotate(rot); c.drawImage(s.flowers[red ? 1 : 0], -size, -size, size * 2, size * 2); c.restore();
  }
  function funeralUmbrella(c, x, y, r, open, tilt) {
    c.save(); c.translate(x, y); c.rotate(tilt); c.scale(Math.max(0.025, open), 1);
    c.fillStyle = lin(c, 0, -r * 0.5, 0, r * 0.25, [[0, '#555161'], [0.25, '#181824'], [1, '#05060c']]);
    c.beginPath(); c.moveTo(-r, r * 0.17); c.quadraticCurveTo(-r * 0.55, -r * 0.66, 0, -r * 0.62); c.quadraticCurveTo(r * 0.65, -r * 0.58, r, r * 0.17);
    for (let i = 4; i > 0; i--) { const q = -r + (i - 1) * r / 2; c.quadraticCurveTo(q + r / 4, -r * 0.05, q, r * 0.17); } c.closePath(); c.fill();
    c.strokeStyle = '#948baf'; c.lineWidth = 2; c.stroke();
    for (let i = 0; i < 5; i++) { const ex = -r + i * r / 2; c.beginPath(); c.moveTo(0, -r * 0.62); c.quadraticCurveTo(ex * 0.7, -r * 0.3, ex, r * 0.17); c.stroke(); }
    c.restore(); c.save(); c.translate(x, y); c.rotate(tilt); c.strokeStyle = '#a79caf'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(0, -r * 0.67); c.lineTo(0, r * 0.75); c.bezierCurveTo(0, r * 0.99, -r * 0.18, r * 0.97, -r * 0.16, r * 0.78); c.stroke(); c.restore();
  }
  function memorialPetals(c, s, t, amount, outward) {
    for (let i = 0; i < 90; i++) {
      const a = hash(i + 4) * TAU + t * 0.00013 * (i % 2 ? 1 : -1);
      const r = 80 + hash(i + 6) * 620 + outward * (250 + hash(i + 9) * 550);
      const x = 800 + Math.cos(a) * r, y = 410 + Math.sin(a) * r * 0.65 + Math.sin(t * 0.001 + i) * 24;
      memorialFlower(c, s, x, y, 7 + hash(i + 7) * 15, a + t * 0.0004, i % 5 === 0, amount * (0.25 + hash(i) * 0.65));
    }
  }
  const MILLER = {
    dur: 12500, voice: { pitch: 0.78, rate: 0.84 }, subtitlePanel: true,
    vo: [[500, 'We gather here today.', '今日，我們共聚一堂。', 2300], [3000, 'No farewell shall go unanswered.', '每一次告別，都應當有所回響。', 5000],
      [5650, 'May you rest in peace.', '願你安息。', 6950], [7850, 'And may I remember.', '願我銘記。', 9250], [10500, 'The rain will remember your name.', '這場雨，會記得你的名字。', 12000]],
    setup(s) {
      s.H = prepHero('miller', { shadow: '#070711', light: '#e8e1f6', rim: '#c4b2ec', lampRGB: '210,190,245', shade: '12,8,26' });
      prepEnemies(s); s.targets = filmTargets(s); prepMemorial(s);
    },
    score() { return {
      bed: [[0, [36, 48, 55, 63]], [2400, [32, 44, 51, 60]], [5100, [29, 41, 48, 56]], [7200, [36, 48, 55, 62]], [9500, [36, 51, 55, 60, 67]]],
      cues: [[0, 'rain', { dur: 6.8, vol: 0.12 }], [700, 'click'], [1000, 'whooshDown', { dur: 0.7 }], [1500, 'chime', { notes: [72, 67] }],
        [2450, 'footsteps', { n: 5, gap: 0.55, vol: 0.5 }], [2800, 'chime', { notes: [72] }], [3650, 'chime', { notes: [70] }], [4500, 'chime', { notes: [67] }],
        [5200, 'wind', { dur: 1.8, vol: 0.06 }], [6100, 'riser', { dur: 1.1, vol: 0.1 }], [7200, 'bell', { n: 1 }], [7300, 'rumble', { dur: 1.6, vol: 0.16 }],
        [7850, 'swish', { vol: 0.5 }], [8050, 'impact', { vol: 0.5 }], [8200, 'wind', { dur: 2.4, vol: 0.16 }], [9550, 'chime', { notes: [72, 79, 84] }],
        [10400, 'chime', { notes: [67, 72, 79] }]],
    }; },
    shake: [[7200, 280, 4], [8050, 500, 12]],
    draw(c, t, s) {
      if (t < 2400) { // Macro on black silk, opening ribs, and a single flower below it.
        layer(c, s.memorial); full(c, '#04040b', 0.4);
        rain(c, t, 0.85, 0.18);
        const p = eback(prog(t, 700, 1500));
        glow(c, 820, 260, 380, 'rgba(175,160,216,.2)', 1);
        funeralUmbrella(c, 810, 330, 450 + t * 0.018, p, -0.08 + t * 0.000018);
        memorialFlower(c, s, 805, 740, 46, t * 0.00008, false, prog(t, 1300, 1800));
        stillRipple(c, 805, 755, 60 + ((t + 300) % 1000) * 0.2, 0.5, '#bbb6d0');
        inkLabel(c, 'MILLER / A MOMENT OF SILENCE', 92, 108, 23, '#b8abc9');
        vignette(c, 0.65); full(c, '#030309', 1 - prog(t, 0, 350)); return;
      }
      if (t < 5100) { // A procession of actual enemies, each offered a three-ring wreath.
        const p = prog(t, 2400, 5100);
        c.save(); cam(c, { x: lerp(-45, 45, p), y: 0, z: 1.02 + p * 0.06, r: 0 }, 0.6); layer(c, s.memorial); c.restore();
        filmHero(c, s, 'dark', 255, 280, 620, { rim: 'rim', rimDx: 3 });
        s.targets.forEach((e, i) => {
          const x = 880 + (i - (s.targets.length - 1) / 2) * Math.min(270, 650 / Math.max(1, s.targets.length));
          const q = eo(prog(t, 2600 + i * 260, 3550 + i * 260));
          glow(c, x, 600, 170, 'rgba(149,117,195,.2)', q);
          foe(c, e.img, x, 760, 320, { alpha: 0.8 });
          for (let j = 0; j < 3; j++) {
            c.save(); c.globalAlpha = q * 0.5; c.strokeStyle = '#c5b5df'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, 620, 80 + j * 16, 130 + j * 14, 0, -Math.PI / 2, -Math.PI / 2 + TAU * q); c.stroke(); c.restore();
          }
          for (let j = 0; j < 12; j++) {
            const a = j / 12 * TAU - Math.PI / 2, fa = eo(clamp(q * 1.5 - j / 12));
            memorialFlower(c, s, x + Math.cos(a) * 100, 620 + Math.sin(a) * 145, 17 * fa, a, j % 4 === 0, fa);
          }
          inkLabel(c, e.name || '無名之人', x - 68, 817, 21, '#c6b8d4');
        });
        rain(c, t, 0.55, 0.18); vignette(c, 0.55); return;
      }
      if (t < 7200) { // The umbrella portrait is framed by a tightening floral clock.
        const p = prog(t, 5100, 7200);
        layer(c, s.memorial); full(c, '#05040f', 0.25);
        glow(c, 920, 350, 540, 'rgba(143,115,190,.2)', 1);
        memorialPetals(c, s, t, 0.55, 0);
        filmHero(c, s, 'lit', 930, 330 - p * 30, 1200 + p * 110, { rim: 'rim', rimDx: -4 });
        for (let i = 0; i < 36; i++) {
          const a = i / 36 * TAU + p * 0.65;
          memorialFlower(c, s, 900 + Math.cos(a) * (430 - p * 50), 445 + Math.sin(a) * (370 - p * 40), 16 + (i % 3) * 4, a, i % 6 === 0, 0.6);
        }
        inkLabel(c, '願 你', 140, 300, 56, '#dfd8ee'); inkLabel(c, '安 息', 140, 380, 56, '#dfd8ee');
        rain(c, t, (1 - p) * 0.4, 0.18); vignette(c, 0.6); return;
      }
      if (t < 9500) { // Bell: the wreath unfurls into a field-wide wave, then rain hangs still.
        const p = eio(prog(t, 7200, 9100)), radius = 70 + p * 1040;
        layer(c, s.memorial); full(c, '#120d25', 0.25);
        glow(c, 800, 530, radius * 0.7, 'rgba(147,121,195,.24)', 1);
        // The offered wreath becomes the funeral domain: a huge ghosted bloom
        // behind the targets and flowers opening across the wet stone below them.
        const bloom = Math.sin(Math.PI * prog(t, 7200, 9500));
        memorialFlower(c, s, 800, 440, 150 + p * 480, -p * 0.5, false, bloom * 0.16);
        for (let i = 0; i < 60; i++) {
          const q = eo(prog(t, 7550 + hash(i) * 450, 8250 + hash(i) * 450));
          const x = 60 + hash(i + 201) * 1480, y = 690 + hash(i + 231) * 210;
          memorialFlower(c, s, x, y, (12 + hash(i + 251) * 24) * q, hash(i) * TAU, i % 7 === 0, q * 0.75);
        }
        s.targets.forEach((e, i) => {
          const x = 800 + (i - (s.targets.length - 1) / 2) * Math.min(300, 860 / Math.max(1, s.targets.length));
          const hit = eo(prog(t, 7900 + Math.abs(x - 800) * 0.35, 8450 + Math.abs(x - 800) * 0.35));
          foe(c, e.img, x + (x - 800) * hit * 0.14, 740 + hit * 45, 355, { rot: (x > 800 ? 1 : -1) * hit * 0.16, alpha: 0.85 - hit * 0.6 });
          for (let j = 0; j < 3; j++) {
            const a = t * 0.001 + j * TAU / 3;
            memorialFlower(c, s, x + Math.cos(a) * (60 + hit * 150), 590 + Math.sin(a) * (110 + hit * 100), 27, a, false, hit);
          }
        });
        for (let k = 0; k < 3; k++) {
          const r = Math.max(10, radius - k * 90);
          stillRipple(c, 800, 720, r, (1 - p * 0.5) * 0.8, k ? '#9782b9' : '#f3e9ff');
          for (let i = 0; i < 32; i++) { const a = i / 32 * TAU + t * 0.00015; memorialFlower(c, s, 800 + Math.cos(a) * r, 650 + Math.sin(a) * r * 0.42, 15 + k * 4, a, i % 8 === 0, 0.85 * (1 - p * 0.5)); }
        }
        memorialPetals(c, s, t, 0.9, p * 0.9);
        // Rain slows to a stop without moving backward at the scene boundary.
        const freezeTime = 7200 + 700 * (1 - Math.exp(-(t - 7200) / 700));
        rain(c, freezeTime, 0.5 * (1 - prog(t, 8600, 9500)), 0.18);
        full(c, '#e9defa', bump(t, 8050, 160) * 0.4); full(c, '#181523', prog(t, 9200, 9500)); return;
      }
      // A sheltered memorial: the funeral domain remains, with white flowers reflected below.
      layer(c, s.memorial); glow(c, 1160, 300, 560, 'rgba(188,172,218,.2)', 1);
      filmHero(c, s, 'lit', 1180, 230, 850, { rim: 'rim', rimDx: -4 });
      for (let i = 0; i < 28; i++) {
        const x = hash(i + 33) * W, y = 775 + hash(i + 51) * 120;
        memorialFlower(c, s, x, y, 15 + hash(i + 17) * 20, hash(i) * TAU, i % 9 === 0, 0.7);
        stillRipple(c, x, y + 8, 20 + ((t + i * 90) % 1700) * 0.04, 0.2, '#bab0ce');
      }
      memorialPetals(c, s, 9500 + (t - 9500) * 0.3, 0.3, 0.3);
      heroTitle(c, t, 9900, { band: '24,17,39', accent: '#c3afd9', en: 'REST. I WILL REMEMBER.', enSize: 48, zh: '願你安息，願我銘記', zhSize: 45, sub: 'MILLER ／ 葬禮・回響', subX: 420, zhCol: '#eee5f9' });
      full(c, '#181523', 1 - prog(t, 9500, 9850));
    },
  };

  /* O.T.G. — an abandoned foundry becomes a court with no judge above it.
   * Scars are stylized luminous rifts. The same moon, ironwork, and seal are
   * shared with the short film so the two cuts have a consistent identity. */
  function prepGodlessCourt(s) {
    const bg = canvas(LW, LH), c = bg.getContext('2d');
    c.fillStyle = lin(c, 0, 0, 0, LH, [[0, '#06050d'], [.55, '#21121e'], [.56, '#100911'], [1, '#04040a']]); c.fillRect(0, 0, LW, LH);
    for (let i = 0; i < 28; i++) {
      const x = hash(i + 71) * LW, y = hash(i + 72) * 470;
      rect(c, x, y, 1 + hash(i + 10) * 2, 1 + hash(i + 10) * 2, '#b2a5c4');
    }
    for (let i = -1; i < 9; i++) {
      const x = 100 + i * 235, h = 290 + hash(i + 32) * 230;
      c.fillStyle = i % 2 ? '#100e18' : '#19101b';
      poly(c, [[x - 30, 720], [x - 30, 720 - h], [x - 8, 705 - h], [x + 2, 732 - h], [x + 25, 710 - h], [x + 36, 720 - h], [x + 36, 720]], c.fillStyle);
      c.strokeStyle = '#79627336'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.moveTo(x + 33, 720 - h + 65); c.quadraticCurveTo(x + 105, 400 - h * .3, x + 200, 590); c.stroke();
    }
    c.strokeStyle = '#57405166'; c.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const y = 685 + i * i * 7; c.beginPath(); c.moveTo(0, y); c.lineTo(LW, y); c.stroke();
    }
    for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(900 + i * 55, 675); c.lineTo(900 + i * 260, LH); c.stroke(); }
    for (let i = 0; i < 55; i++) {
      const x = hash(i + 44) * LW, y = 695 + hash(i + 88) * 290;
      c.fillStyle = i % 3 ? '#271720' : '#46303a';
      poly(c, [[x - 7, y + 4], [x - 3, y - 7], [x + 9, y - 2], [x + 5, y + 5]], c.fillStyle);
    }
    s.godlessCourt = bg;
  }
  function godlessAsh(c, t, a, outward) {
    c.save();
    for (let i = 0; i < 65; i++) {
      const x = hash(i + 311) * W + (hash(i + 12) - .5) * outward * 650;
      const y = ((hash(i + 407) * H - t * (.012 + hash(i + 21) * .028)) % H + H) % H;
      c.globalAlpha = a * (.2 + hash(i + 41) * .55); c.fillStyle = i % 5 ? '#a193a2' : '#ff6577';
      c.save(); c.translate(x, y); c.rotate(t * .0003 + i); c.fillRect(-2, -3, 2 + hash(i) * 3, 3 + hash(i + 5) * 5); c.restore();
    } c.restore();
  }
  function godlessRift(c, x, y, size, alpha, angle) {
    if (alpha <= 0 || size <= 0) return;
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.rotate(angle);
    c.shadowColor = '#ff2a55'; c.shadowBlur = 20;
    c.strokeStyle = '#b41642'; c.lineWidth = 13; c.beginPath();
    c.moveTo(-size, -size * .85); c.lineTo(-size * .1, -size * .1); c.lineTo(size * .2, size * .1); c.lineTo(size, size * .85);
    c.moveTo(size * .8, -size); c.lineTo(-size, size); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = '#ffe4e7'; c.lineWidth = 2; c.stroke(); c.restore();
  }
  const OTG = {
    dur: 12800, impact: 9000, subtitlePanel: true, fit: 'contain',
    voice: { pitch: .68, rate: .86 },
    vo: [[450, 'No god is coming.', '不會有神前來。', 2250], [2750, 'These scars are mine.', '這些傷痕，屬於我。', 4450],
      [5050, 'Now carry their weight.', '現在，承受它們的重量。', 6650], [7150, 'Look up. No one is there.', '抬頭看吧。上面，空無一人。', 8550],
      [9050, 'No absolution.', '苦難，無需赦免。', 10250], [11000, 'Only the godless.', '唯有，無神之人。', 12300]],
    setup(s) {
      s.H = prepHero('otg', { shadow: '#0b060e', light: '#f8dbe4', rim: '#e74a70', lampRGB: '255,100,135', shade: '26,4,18' });
      prepEnemies(s); s.targets = filmTargets(s); prepGodlessCourt(s);
    },
    score() { return {
      bed: [[0, [29, 41, 48]], [2400, [29, 41, 44, 51]], [4700, [27, 39, 46, 53]], [6800, [26, 38, 45, 50]], [9000, [29, 41, 48, 56]], [10600, [29, 41, 48]]],
      cues: [[0, 'wind', { dur: 2.5, vol: .06 }], [300, 'footsteps', { n: 4, gap: .46, vol: .5 }], [700, 'clock', { n: 4, gap: .22 }],
        [2400, 'rumble', { dur: 2.2, vol: .12 }], [2750, 'crack'], [3300, 'tear'], [3950, 'tear'], [4700, 'swish', { vol: .4 }],
        [5000, 'clock', { n: 6, gap: .16 }], [5700, 'tear'], [6400, 'whooshDown', { dur: .5 }], [6800, 'rumble', { dur: 1.8, vol: .17 }],
        [7700, 'riser', { dur: 1.2, vol: .15 }], [8700, 'crack'], [9000, 'boom', { vol: .8 }], [9020, 'impact', { vol: .9 }],
        [9300, 'glass', { n: 22, vol: .22 }], [10550, 'whooshDown', { dur: .6 }], [10800, 'sting', { notes: [41, 48, 53, 56], dur: 2 }]],
    }; },
    shake: [[2750, 180, 4], [5700, 160, 5], [8400, 350, 5], [9000, 500, 23], [10800, 180, 5]],
    draw(c, t, s) {
      const moon = (x, y, r, red, ec, a = 1) => D().godlessMoon(c, x, y, r, red, ec, a);
      const chain = (ax, ay, bx, by, sag, a, fracture = 0) => D().godlessChain(c, ax, ay, bx, by, sag, t, a, fracture);
      const seal = (x, y, r, a) => D().godlessSigil(c, x, y, r, t, a);
      if (t < 2400) { // Moonlit iron yard; a slow push through foreground shackles.
        const p = prog(t, 0, 2400);
        c.save(); cam(c, { x: -40 + p * 55, y: -10, z: 1.02 + p * .06, r: 0 }, .6); layer(c, s.godlessCourt); moon(1190, 230, 190, .12, 0); c.restore();
        filmHero(c, s, 'dark', 720, 300, 1080, { rim: 'rim', rimDx: 4 });
        chain(-160, 650, 1900, 610, 110, .8); chain(-150, 785, 1900, 700, -30, .55);
        godlessAsh(c, t, .5, 0);
        inkLabel(c, 'O.T.G. / ONLY THE GODLESS', 92, 110, 25, '#c9a8bb');
        inkLabel(c, '神的目光，從未抵達這裡。', 95, 530, 32, '#d6b9c5');
        vignette(c, .65, 'rgba(5,0,9,1)'); full(c, '#04030a', 1 - prog(t, 0, 350)); return;
      }
      if (t < 4700) { // Rifts awaken across the chained silhouette and gather at its heart.
        const p = prog(t, 2400, 4700);
        layer(c, s.godlessCourt); moon(1240, 240, 220 + p * 20, p * .75, 0);
        glow(c, 650, 540, 340, 'rgba(153,16,53,.2)', 1);
        chain(160, 180, 1050, 720, 80 * (1 - p), .65); chain(120, 760, 1080, 280, -80 * (1 - p), .65);
        filmHero(c, s, 'lit', 650 + p * 28, 255 - p * 18, 1050 + p * 100, { rim: 'rim', rimDx: -4 });
        for (let i = 0; i < 6; i++) {
          const a = eo(prog(t, 2650 + i * 230, 3000 + i * 230));
          godlessRift(c, 555 + i * 38, 460 + i * 38, 32 + i % 3 * 8, a * .72, i % 2 ? -.3 : .35);
        }
        seal(670, 570, 190 + p * 55, .3 + p * .4);
        inkLabel(c, '苦 難', 1120, 590, 62, '#f4bccb');
        inkLabel(c, '不祈求。不遺忘。', 1100, 650, 28, '#c89aaa');
        godlessAsh(c, t, .8, 0); vignette(c, .55); return;
      }
      if (t < 6800) { // Scars peel off as luminous ribbons, sealing every present enemy.
        const p = prog(t, 4700, 6800);
        layer(c, s.godlessCourt); moon(1110, 200, 200, .8, .1);
        filmHero(c, s, 'dark', 265, 330, 620, { rim: 'rim', rimDx: 4 });
        seal(270, 565, 150, (1 - p) * .7);
        s.targets.forEach((e, i) => {
          const x = 1030 + (i - (s.targets.length - 1) / 2) * Math.min(260, 750 / Math.max(1, s.targets.length));
          const q = eo(prog(t, 4850 + i * 80, 6050 + i * 80));
          foe(c, e.img, x, 790, 330, { alpha: .9 });
          chain(290, 550, lerp(290, x, q), lerp(550, 600, q), (1 - q) * 150, .75 * q);
          for (let j = 0; j < 4; j++) {
            const u = eio(prog(t, 4800 + j * 210 + i * 60, 5500 + j * 210 + i * 60));
            if (u <= 0) continue;
            const px = lerp(275, x, u), py = lerp(470 + j * 45, 530 + j * 38, u) - Math.sin(u * Math.PI) * (150 + j * 40);
            godlessRift(c, px, py, 16 + u * 16, 1 - prog(t, 6520, 6800), j * .3);
          }
          seal(x, 585, 95 * q, q * .85); godlessRift(c, x, 585, 56 * q, q, 0);
          inkLabel(c, '原罪', x - 32, 440, 28, '#f2a4b7');
        });
        godlessAsh(c, t, .8, .2); vignette(c, .5); return;
      }
      if (t < 8600) { // All chains pull taut; the luminous moon becomes an empty dark eye.
        const p = eio(prog(t, 6800, 8600));
        layer(c, s.godlessCourt); full(c, '#09020e', p * .5);
        moon(800, 300, 235 + p * 45, 1, p);
        s.targets.forEach((e, i) => {
          const x = 800 + (i - (s.targets.length - 1) / 2) * Math.min(350, 1000 / Math.max(1, s.targets.length));
          foe(c, e.img, x, 800, 280, { alpha: .7 });
          chain(800, 330, x, 650, 140 * (1 - p), .7 + p * .3);
          seal(x, 640, 82 + p * 16, .6 + p * .4);
        });
        for (let i = 0; i < 3; i++) {
          c.save(); c.globalAlpha = .2 + p * .4; c.strokeStyle = '#cf294e'; c.lineWidth = 1;
          c.beginPath(); c.ellipse(800, 300, 300 + i * 30, 310 + i * 28, p * .2, -Math.PI * .8, Math.PI * .9); c.stroke(); c.restore();
        }
        godlessAsh(c, 6800 + (t - 6800) * (1 - p), .5, 0);
        inkLabel(c, '上 面，空 無 一 人。', 564, 106, 34, '#d5b9c9');
        vignette(c, .65); return;
      }
      if (t < 10400) { // The seal fractures on the exact combat impact frame: 9000 ms.
        const charge = prog(t, 8600, 9000), p = eo(prog(t, 9000, 10300));
        layer(c, s.godlessCourt); moon(800, 300, 280, 1, 1);
        glow(c, 800, 500, 280 + p * 650, 'rgba(230,20,67,.25)', 1);
        seal(800, 410, 220 + charge * 130 + p * 250, (1 - p * .6) * .8);
        s.targets.forEach((e, i) => {
          const x = 800 + (i - (s.targets.length - 1) / 2) * Math.min(350, 1000 / Math.max(1, s.targets.length));
          const h = eo(prog(t, 9000, 9350));
          foe(c, e.img, x + (x - 800) * h * .13, 800 + h * 40, 300, { alpha: .8 - h * .45, rot: (i % 2 ? -.13 : .13) * h });
          chain(800, 330, x, 650, 0, 1 - p, p);
          godlessRift(c, x, 610, 85 + p * 90, 1 - p, .1 * i);
          if (t >= 9000) {
            c.save(); c.globalAlpha = (1 - p) * .8; c.strokeStyle = '#ff6186'; c.lineWidth = 3 + (1 - p) * 12;
            c.beginPath(); c.ellipse(x, 680, 40 + p * 430, 30 + p * 100, 0, 0, TAU); c.stroke(); c.restore();
          }
        });
        if (t >= 9000) for (let i = 0; i < 30; i++) {
          const a = i * 2.399, r = 80 + p * (180 + hash(i) * 700);
          const x = 800 + Math.cos(a) * r, y = 410 + Math.sin(a) * r * .6 + p * p * 180;
          c.save(); c.globalAlpha = (1 - p) * .9; c.translate(x, y); c.rotate(a + p * 4);
          c.strokeStyle = i % 3 ? '#c3a9b5' : '#ff526e'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, 10, 5, 0, 0, TAU); c.stroke(); c.restore();
        }
        full(c, '#f4dce5', bump(t, 9000, 110) * .75); full(c, '#9b1237', bump(t, 9120, 170) * .28);
        godlessAsh(c, t, .8, p); vignette(c, .6); return;
      }
      // Broken iron falls while the figure stands beneath the eclipsed moon.
      const p = prog(t, 10400, 12800);
      layer(c, s.godlessCourt); moon(1190, 265, 245, 1, .96, .85);
      glow(c, 1130, 490, 390, 'rgba(180,25,63,.18)', 1);
      filmHero(c, s, 'lit', 1190, 250 - p * 15, 840, { rim: 'rim', rimDx: -5 });
      chain(870, 740, 1540, 720, 30, .7, .85 + p * .15);
      godlessAsh(c, t, .65, .5);
      heroTitle(c, t, 10750, { band: '45,5,22', accent: '#e64b71', en: 'NO GOD. NO REDEMPTION.', enSize: 44, zh: '神不在的滿月', zhSize: 54, sub: 'O.T.G. ／ ONLY THE GODLESS', subX: 320, zhCol: '#ffd3e1' });
      vignette(c, .5); full(c, '#09030a', 1 - prog(t, 10400, 10700));
    },
  };

  const FILMS = { kane: KANE, longzhao: LONGZHAO, mocha: MOCHA, alan: ALAN, alexandra: ALEXANDRA, hanye: HANYE, gordon: GORDON, mark: MARK, miller: MILLER, otg: OTG };

  /* ================= 播放控制 ================= */
  function subtitle(c, t, s) {
    const cur = s.film.vo.find(([t0, , , t1]) => t >= t0 && t <= t1);
    if (!cur) return;
    const [t0, en, zh, t1] = cur, a = prog(t, t0, t0 + 150) * (1 - prog(t, t1 - 200, t1));
    const fs = Math.round(Math.min(s.vh * 0.03, s.vw * 0.022));
    c.save(); c.globalAlpha = a; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (s.film.subtitlePanel) {
      c.font = `italic 600 ${Math.round(fs * 0.8)}px Georgia, serif`; const ew = c.measureText(en).width;
      c.font = `600 ${fs}px ${D().SANS}`;
      const bw = Math.min(s.vw - 24, Math.max(ew, c.measureText(zh).width) + fs * 2);
      c.fillStyle = 'rgba(3,7,18,.68)'; D().roundRect(c, (s.vw - bw) / 2, s.vh * 0.9 - fs * 2, bw, fs * 3.1, fs * 0.3); c.fill();
    }
    c.shadowColor = 'rgba(0,0,0,.9)'; c.shadowBlur = 8;
    c.font = `italic 600 ${Math.round(fs * 0.8)}px Georgia, serif`; c.fillStyle = 'rgba(200,225,255,.9)'; c.fillText(en, s.vw / 2, s.vh * 0.9 - fs * 1.2);
    c.font = `600 ${fs}px ${D().SANS}`; c.fillStyle = '#ffffff'; c.fillText(zh, s.vw / 2, s.vh * 0.9);
    c.restore();
  }
  function shakeAt(t, ev) { let a = 0; ev.forEach(([t0, d, amp]) => { if (t >= t0 && t < t0 + d) a = Math.max(a, amp * (1 - (t - t0) / d)); }); return a; }
  function play(key, o) {
    const film = FILMS[key];
    if (!film) return 0;
    stop();
    o = o || {};
    const vw = innerWidth, vh = innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    const root = document.createElement('div');
    root.className = 'ultcine film';
    root.innerHTML = '<canvas></canvas><div class="uc-skip">點擊畫面跳過</div>';
    const cv = root.querySelector('canvas');
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    document.body.appendChild(root);
    const k = o.k || 1, sc = film.fit === 'contain' ? Math.min(vw / W, vh / H) : Math.max(vw / W, vh / H);
    st = { key, film, root, ctx: cv.getContext('2d'), vw, vh, dpr, k, sc, ox: (vw - W * sc) / 2, oy: (vh - H * sc) / 2, dur: film.dur, t0: performance.now(), onSkip: o.onSkip, enemies: o.enemies || [], team: o.team || [] };
    film.setup(st);
    root.addEventListener('click', ev => { ev.stopPropagation(); skip(); });
    st.keyH = ev => { if (ev.key === 'Escape' || ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); skip(); } };
    window.addEventListener('keydown', st.keyH, true);
    if (typeof Sound !== 'undefined') {
      st.audio = Sound.score(Object.assign({ dur: film.dur }, film.score(st)), k);
      st.voice = Sound.say(film.vo.map(v => [v[0], v[1], v[4]]), k, film.voice);
    }
    const mine = st;
    st.guard = setTimeout(() => { if (st === mine) stop(true); }, film.dur * k + 600);
    st.t0 = performance.now();
    st.raf = requestAnimationFrame(frame);
    return film.dur * k;
  }
  function render(t) {
    const c = st.ctx;
    c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
    c.fillStyle = '#000'; c.fillRect(0, 0, st.vw, st.vh);
    const sh = shakeAt(t, st.film.shake || []);
    c.save();
    c.translate(st.ox + (sh ? (Math.random() - 0.5) * 2 * sh * st.sc : 0), st.oy + (sh ? (Math.random() - 0.5) * 2 * sh * st.sc : 0));
    c.scale(st.sc, st.sc);
    st.film.draw(c, t, st);
    c.restore();
    subtitle(c, t, st);
    st.root.style.opacity = String(1 - prog(t, st.dur - 450, st.dur));
  }
  function frame(now) {
    if (!st) return;
    const t = (now - st.t0) / st.k;
    if (t >= st.dur) { stop(true); return; }
    render(t);
    st.raf = requestAnimationFrame(frame);
  }
  function stop(natural) {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    clearTimeout(st.guard);
    if (st.voice) st.voice.cancel(!natural);
    window.removeEventListener('keydown', st.keyH, true);
    if (st.audio) st.audio.stop(!!natural);
    st.root.remove();
    st = null;
  }
  function skip() { const cb = st && st.onSkip; stop(false); if (cb) cb(); }
  /** 除錯用：跳到指定時間（毫秒）並停住畫面 */
  function seek(t) {
    if (!st) return;
    cancelAnimationFrame(st.raf); clearTimeout(st.guard);
    if (st.audio) { st.audio.stop(false); st.audio = null; }
    if (st.voice) { st.voice.cancel(true); st.voice = null; }
    st.t0 = performance.now() - t * st.k;
    render(t);
  }

  const peak = sh => (sh && sh.length ? sh.reduce((a, b) => (b[2] > a[2] ? b : a))[0] : 0);   // 最強的一次震動 = 命中瞬間
  const impact = key => { const f = FILMS[key]; return f ? (f.impact != null ? f.impact : peak(f.shake)) : 0; };
  return { play, stop, skip, seek, impact, has: key => !!FILMS[key], get active() { return !!st; } };
})();
