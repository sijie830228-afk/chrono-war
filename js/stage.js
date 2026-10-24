'use strict';
/* =========================================================
 * 時序之戰 — 戰場背景（程式繪製的第九街夜景）
 * 夜空、月亮、星星、雲霧、三層城市剪影（隨機窗燈）、直立霓虹招牌、
 * 兩側近景建築、路燈、濕潤街道上的霓虹倒影、地平線霧氣。
 * 使用固定亂數種子，每次畫面一致；尺寸改變時自動重畫。
 * 彩蛋：O.T.G. 處於「瀆神之軀」時，滿月被月蝕的陰影掃過、轉為血月（.stage.blood-moon，樣式在 style.css）。
 * ========================================================= */

const Stage = (() => {
  let cv = null, lastW = 0, lastH = 0;
  const SIGNS = ['酒', '當舖', '藥', '旅館', '電玩', '占卜', '麻雀', '夜市', '偵探社', '拉麵'];
  const NEON = ['#ff3d8b', '#35e0ff', '#ffb13d', '#9b6bff', '#4dffb0'];

  function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  function neonSign(g, x, y, w, h, col, text, R) {
    g.save();
    g.shadowColor = col; g.shadowBlur = 16;
    g.fillStyle = 'rgba(8,8,16,.9)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = col; g.lineWidth = 1.6;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = col;
    const n = text.length, fs = Math.min(w * 0.72, (h - 6) / n * 0.9);
    g.font = `bold ${fs}px "Microsoft JhengHei", "PingFang TC", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) g.fillText(text[i], x + w / 2, y + 3 + (h - 6) * (i + 0.5) / n);
    g.restore();
    return { x: x + w / 2, w, col, bottom: y + h };
  }

  function skyline(g, R, W, base, hMin, hMax, wMin, wMax, color, winP, winStep, detail) {
    const signs = [];
    let x = -20;
    while (x < W + 20) {
      const w = wMin + R() * (wMax - wMin), h = hMin + R() * (hMax - hMin), top = base - h;
      g.fillStyle = color;
      g.fillRect(x, top, w, h + 2);
      if (detail) {
        if (R() < 0.35) { g.fillRect(x + w * 0.2, top - 8, w * 0.25, 8); g.beginPath(); g.moveTo(x + w * 0.18, top - 8); g.lineTo(x + w * 0.325, top - 14); g.lineTo(x + w * 0.47, top - 8); g.fill(); }
        if (R() < 0.3) {
          const ax = x + w * (0.6 + R() * 0.3);
          g.strokeStyle = color; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(ax, top); g.lineTo(ax, top - 18 - R() * 16); g.stroke();
          g.fillStyle = 'rgba(255,60,60,.9)'; g.beginPath(); g.arc(ax, top - 18 - 2, 1.4, 0, Math.PI * 2); g.fill();
        }
      }
      for (let wy = top + 6; wy < base - 4; wy += winStep) {
        for (let wx = x + 4; wx < x + w - 4; wx += winStep * 0.8) {
          if (R() < winP) {
            g.fillStyle = R() < 0.72 ? `rgba(255,${190 + R() * 40 | 0},${120 + R() * 40 | 0},${0.25 + R() * 0.45})` : `rgba(140,${190 + R() * 50 | 0},255,${0.2 + R() * 0.35})`;
            g.fillRect(wx, wy, Math.max(1.5, winStep * 0.32), Math.max(2, winStep * 0.45));
          }
        }
      }
      if (detail && R() < 0.3 && h > (hMax - hMin) * 0.4 + hMin) {
        const sw = 12 + R() * 6, sh = 44 + R() * 44;
        signs.push(neonSign(g, x + w - sw - 3, top + 14 + R() * 20, sw, sh, NEON[(R() * NEON.length) | 0], SIGNS[(R() * SIGNS.length) | 0], R));
      }
      x += w + (R() < 0.3 ? 4 + R() * 10 : 0);
    }
    return signs;
  }

  function draw() {
    if (!cv) return;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H || (W === lastW && H === lastH)) return;
    lastW = W; lastH = H;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = rng(2026);
    const hz = H * 0.5, m = Math.min(W, H);

    // 夜空
    const sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#02040b'); sky.addColorStop(0.5, '#0a1230'); sky.addColorStop(0.85, '#1c1438'); sky.addColorStop(1, '#2d1538');
    g.fillStyle = sky; g.fillRect(0, 0, W, hz + 2);
    for (let i = 0; i < 220; i++) {
      const y = R() * hz * 0.75, a = 0.15 + R() * 0.75 * (1 - y / hz);
      g.fillStyle = `rgba(230,236,255,${a})`;
      g.fillRect(R() * W, y, R() < 0.9 ? 1 : 1.8, R() < 0.9 ? 1 : 1.8);
    }
    // 月亮
    const mx = W * 0.8, my = H * 0.13, mr = m * 0.035;
    const halo = g.createRadialGradient(mx, my, mr, mx, my, mr * 7);
    halo.addColorStop(0, 'rgba(200,215,255,.28)'); halo.addColorStop(1, 'rgba(200,215,255,0)');
    g.fillStyle = halo; g.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
    const disc = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    disc.addColorStop(0, '#fbfcff'); disc.addColorStop(1, '#c9d3ee');
    g.fillStyle = disc; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    // 血月彩蛋（O.T.G. 的瀆神之軀）疊在同一個位置：把月亮的座標交給 CSS
    const host = cv.parentElement;
    if (host) { host.style.setProperty('--mx', mx + 'px'); host.style.setProperty('--my', my + 'px'); host.style.setProperty('--mr', mr + 'px'); }
    g.fillStyle = 'rgba(120,130,170,.18)';
    [[0.3, -0.2, 0.22], [-0.35, 0.25, 0.16], [0.1, 0.4, 0.12]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, Math.PI * 2); g.fill(); });
    // 雲霧
    for (let i = 0; i < 7; i++) {
      const cx = R() * W, cy = H * (0.18 + R() * 0.22), rx = W * (0.15 + R() * 0.2), ry = H * (0.03 + R() * 0.04);
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
      cg.addColorStop(0, `rgba(${R() < 0.5 ? '130,90,190' : '70,120,190'},.13)`); cg.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy);
      g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, rx, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // 遠景、地平線霧、中景
    skyline(g, R, W, hz, H * 0.06, H * 0.2, 16, 40, '#0f1529', 0.08, 5, false);
    const haze = g.createLinearGradient(0, hz - H * 0.14, 0, hz + H * 0.03);
    haze.addColorStop(0, 'rgba(180,70,160,0)'); haze.addColorStop(0.7, 'rgba(180,70,160,.2)'); haze.addColorStop(1, 'rgba(180,70,160,0)');
    g.fillStyle = haze; g.fillRect(0, hz - H * 0.14, W, H * 0.17);
    const signs = skyline(g, R, W, hz + 2, H * 0.1, H * 0.32, 30, 76, '#080b19', 0.2, 8, true);

    // 街道
    const ground = g.createLinearGradient(0, hz, 0, H);
    ground.addColorStop(0, '#0b0a16'); ground.addColorStop(1, '#040408');
    g.fillStyle = ground; g.fillRect(0, hz, W, H - hz);
    const vp = W / 2;
    const road = g.createLinearGradient(0, hz, 0, H);
    road.addColorStop(0, 'rgba(60,60,90,.25)'); road.addColorStop(1, 'rgba(30,30,48,.5)');
    g.fillStyle = road;
    g.beginPath(); g.moveTo(vp - W * 0.08, hz); g.lineTo(vp + W * 0.08, hz); g.lineTo(W * 1.25, H); g.lineTo(-W * 0.25, H); g.fill();
    g.strokeStyle = 'rgba(160,170,210,.18)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(vp - W * 0.08, hz); g.lineTo(-W * 0.25, H); g.moveTo(vp + W * 0.08, hz); g.lineTo(W * 1.25, H); g.stroke();
    for (let t = 0.04; t < 1; t *= 1.45) {   // 中央虛線（透視）
      const y1 = hz + (H - hz) * t, y2 = hz + (H - hz) * Math.min(1, t * 1.22);
      g.strokeStyle = `rgba(255,220,150,${0.12 + t * 0.2})`; g.lineWidth = 1 + t * 4;
      g.beginPath(); g.moveTo(vp, y1); g.lineTo(vp, y2); g.stroke();
    }
    // 霓虹倒影（濕潤路面）
    g.save(); g.globalCompositeOperation = 'lighter';
    signs.forEach(s => {
      const top = hz + (hz - s.bottom) * 0.15, len = (H - hz) * (0.35 + R() * 0.3);
      const rg = g.createLinearGradient(0, top, 0, top + len);
      rg.addColorStop(0, s.col + '55'); rg.addColorStop(1, s.col + '00');
      g.fillStyle = rg; g.fillRect(s.x - s.w * 0.7, top, s.w * 1.4, len);
    });
    g.restore();

    // 近景建築（兩側）
    const near = (x0, w, flip) => {
      g.fillStyle = '#04050b';
      g.fillRect(x0, 0, w, H * 0.92);
      g.strokeStyle = '#141828'; g.lineWidth = 1.5;
      for (let y = H * 0.12; y < H * 0.8; y += H * 0.12) {   // 逃生梯
        const ex = flip ? x0 : x0 + w;
        g.beginPath(); g.moveTo(ex, y); g.lineTo(ex + (flip ? 1 : -1) * w * 0.4, y); g.stroke();
        g.beginPath(); g.moveTo(ex + (flip ? 1 : -1) * w * 0.05, y); g.lineTo(ex + (flip ? 1 : -1) * w * 0.35, y + H * 0.12); g.stroke();
      }
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(255,200,130,${0.15 + R() * 0.3})`;
        g.fillRect(x0 + w * (0.15 + R() * 0.6), H * (0.1 + R() * 0.6), 6, 9);
      }
    };
    near(0, W * 0.11, false);
    near(W * 0.89, W * 0.11, true);
    neonSign(g, W * 0.11 - 26, H * 0.12, 22, H * 0.26, '#ff3d8b', '第九街', R);
    neonSign(g, W * 0.89 + 4, H * 0.2, 20, H * 0.16, '#35e0ff', '當舖', R);
    // 路燈
    const lx = W * 0.84, ly = H * 0.36;
    g.strokeStyle = '#161a28'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(lx + 24, H); g.lineTo(lx + 24, ly); g.quadraticCurveTo(lx + 24, ly - 12, lx + 6, ly - 10); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter';
    const lamp = g.createRadialGradient(lx, ly, 0, lx, ly, m * 0.28);
    lamp.addColorStop(0, 'rgba(255,210,140,.45)'); lamp.addColorStop(1, 'rgba(255,210,140,0)');
    g.fillStyle = lamp; g.fillRect(lx - m * 0.28, ly - m * 0.28, m * 0.56, m * 0.56);
    const pool = g.createRadialGradient(lx, H * 0.86, 0, lx, H * 0.86, m * 0.3);
    pool.addColorStop(0, 'rgba(255,200,120,.16)'); pool.addColorStop(1, 'rgba(255,200,120,0)');
    g.save(); g.translate(lx, H * 0.86); g.scale(1.8, 0.35); g.translate(-lx, -H * 0.86);
    g.fillStyle = pool; g.beginPath(); g.arc(lx, H * 0.86, m * 0.3, 0, Math.PI * 2); g.fill(); g.restore();
    g.restore();
    // 地面霧與暗角
    const fog = g.createLinearGradient(0, hz, 0, H);
    fog.addColorStop(0, 'rgba(90,60,140,.18)'); fog.addColorStop(0.4, 'rgba(90,60,140,0)');
    g.fillStyle = fog; g.fillRect(0, hz, W, H - hz);
    const vig = g.createRadialGradient(W / 2, H * 0.45, m * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = vig; g.fillRect(0, 0, W, H);
  }

  function mount(canvas) {
    cv = canvas;
    if (!cv) return;
    if (window.ResizeObserver) new ResizeObserver(() => draw()).observe(cv);
    else window.addEventListener('resize', draw);
    draw();
  }
  return { mount, redraw: () => { lastW = 0; draw(); } };
})();
