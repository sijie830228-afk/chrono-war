'use strict';
/* =========================================================
 * 時序之戰 — 終結技演出（全螢幕畫布動畫，約 2.8 秒，隨倍速縮短）
 *   凱恩「結案」                     證據板與紅線 → 放大鏡鎖定 → 蓋章 → 玻璃碎裂與十字斬
 *   龍爪「贏家奠定規則，輸家失去所有」 地下賭場的輪盤與撲克牌 → 三道巨大爪痕 → 血花
 *   莫卡兄弟「我們能處理好這一切⋯⋯嗎？」文件翻飛與簽約 → 水管噴出的水柱 → 結冰 → 碎冰
 *   阿蘭「炎彈：勇氣判決」           狙擊鏡瞄準與心跳 → 槍響 → 炎彈爆炸與掩護的六角護盾
 *   亞歷山卓「速度與執勤」           紅藍警燈與公路光條 → 押送鎖定 → 頭燈衝來、封鎖線 → 橫掃的風刃與罰單
 *   寒夜「構造·唯一證明」            座標網格與證明過程 → 尺規作圖交於唯一的點 → 四道刻度 → 帶刻度的劍光與空間裂縫 → Q.E.D.
 *   戈登「股票排山倒海」             跑馬燈與 K 線一路漲停 → 對沖反轉崩盤 → K 線巨浪壓過敵人 → 對沖印章
 *   馬克「盈科後進」                 一排逐級下降的石窪 → 水把每一窪注滿才溢向下一窪（盈）→ 最後一窪滿溢、分流衝向敵人 → 浪花 → 實戰演練印章
 *   O.T.G.「神不在的滿月」          仰望血色滿月 → 身上的裂口撕下、飛向敵人刻成「原罪」→ 月蝕 → 全部引爆 → 倒置十字「瀆神之軀」
 *   米勒「願你安息，願我銘記」       雨中撐傘走來 → 黑傘在敵人上方張開、花瓣盤旋 → 收傘、罌粟與白菊落下 → 葬禮法陣與悲悼階段 → 訃告印
 * 英文台詞以字幕呈現（不發聲）。
 * UltFx.play(key, { targets:[{x,y}], src:{x,y}, k, onSkip }) → 回傳演出長度（毫秒）
 * 點擊畫面、Esc 或空白鍵可跳過。
 * ========================================================= */

const UltFx = (() => {
  const BASE = 2800;
  let st = null;

  const clamp = (x, a, b) => Math.max(a == null ? 0 : a, Math.min(b == null ? 1 : b, x));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;
  const eo = p => 1 - Math.pow(1 - p, 3);
  const ei = p => p * p * p;
  const eio = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const eback = p => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const bump = (t, a, w) => Math.max(0, 1 - Math.abs(t - a) / w);
  const TAU = Math.PI * 2;
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
  const SERIF = '"Noto Serif TC","Source Han Serif TC","Songti TC","PMingLiU","MingLiU",serif';
  const SANS = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';

  /* ================= 共用繪圖 ================= */
  /** 預先把立繪縮放、加上外光與底部淡出，存成離屏畫布（每幀只要貼圖） */
  function prepArt(s, h, glow, filter, art) {
    const a = art || s.art;
    if (!a || !a.canvas) return null;
    const d = Math.min(1.5, s.dpr), sc = h / a.h, pad = 60, w = a.w * sc;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((w + pad * 2) * d); cv.height = Math.ceil((h + pad * 2) * d);
    const g = cv.getContext('2d');
    g.scale(d, d);
    if (filter) g.filter = filter;
    if (glow) { g.shadowColor = glow; g.shadowBlur = 40; }
    g.drawImage(a.canvas, pad, pad, w, h);
    g.filter = 'none'; g.shadowBlur = 0;
    g.globalCompositeOperation = 'destination-in';
    const gr = g.createLinearGradient(0, pad + h * 0.62, 0, pad + h * 0.95);
    gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w + pad * 2, h + pad * 2);
    return { cv, w: w + pad * 2, h: h + pad * 2, fx: pad + a.facePx[0] * sc, fy: pad + a.facePx[1] * sc };
  }
  function drawArt(c, A, fx, fy, alpha) {
    if (!A || alpha <= 0.001) return;
    c.save(); c.globalAlpha = Math.min(1, alpha);
    c.drawImage(A.cv, fx - A.fx, fy - A.fy, A.w, A.h);
    c.restore();
  }
  /** 逐字浮現的標題 */
  function title(c, text, x, y, size, o) {
    c.save();
    c.font = `${o.weight || 900} ${size}px ${o.font || SERIF}`;
    c.textBaseline = 'middle'; c.textAlign = 'center';
    const chars = [...text], sp = o.spacing || 0;
    const ws = chars.map(ch => c.measureText(ch).width + sp);
    const total = ws.reduce((a, b) => a + b, 0) - sp;
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    chars.forEach((ch, i) => {
      const s0 = o.start + i * (o.per || 50);
      const p = eo(prog(o.t, s0, s0 + (o.dur || 280)));
      if (p > 0) {
        c.save();
        c.globalAlpha = p * (o.alpha == null ? 1 : o.alpha);
        c.translate(cx + (ws[i] - sp) / 2, y + (1 - p) * size * 0.3);
        const k = 1 + (1 - p) * 0.7; c.scale(k, k);
        if (o.rot) c.rotate(o.rot(i));
        if (o.glow) { c.shadowColor = o.glow; c.shadowBlur = size * 0.4; }
        if (o.fill && o.fill.grad) {
          const g = c.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
          o.fill.grad.forEach(([at, col]) => g.addColorStop(at, col));
          c.fillStyle = g;
        } else c.fillStyle = o.fill || '#fff';
        c.fillText(ch, 0, 0);
        if (o.stroke) { c.shadowBlur = 0; c.lineWidth = o.strokeW || 1.5; c.strokeStyle = o.stroke; c.strokeText(ch, 0, 0); }
        c.restore();
      }
      cx += ws[i];
    });
    c.restore();
    return total;
  }
  function label(c, text, x, y, size, col, alpha, align, font, spacing) {
    if (alpha <= 0) return;
    c.save(); c.globalAlpha = alpha; c.fillStyle = col;
    c.font = `600 ${size}px ${font || SANS}`; c.textAlign = align || 'left'; c.textBaseline = 'middle';
    if (spacing && 'letterSpacing' in c) c.letterSpacing = spacing + 'px';
    c.fillText(text, x, y); c.restore();
  }
  /** 水平速度線 */
  function speedLines(c, s, t, col, alpha, dir) {
    if (alpha <= 0) return;
    c.save(); c.globalAlpha = alpha; c.strokeStyle = col;
    s.lines.forEach(l => {
      const span = s.vw + l.len;
      let x = ((t * l.v + l.o) % span) - l.len;
      if (dir < 0) x = s.vw - x - l.len;
      c.lineWidth = l.w;
      c.beginPath(); c.moveTo(x, l.y); c.lineTo(x + l.len, l.y); c.stroke();
    });
    c.restore();
  }
  /** 兩端尖細的刀光 */
  function blade(c, x1, y1, x2, y2, w, fill, glow) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const mx = x1 + dx * 0.55, my = y1 + dy * 0.55;
    c.save();
    if (glow) { c.shadowColor = glow; c.shadowBlur = w * 2.2; }
    c.fillStyle = fill;
    c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx + nx * w, my + ny * w, x2, y2); c.quadraticCurveTo(mx - nx * w * 0.35, my - ny * w * 0.35, x1, y1);
    c.fill(); c.restore();
  }
  function vignette(c, s, col, a) {
    const g = c.createRadialGradient(s.vw / 2, s.vh / 2, Math.min(s.vw, s.vh) * 0.3, s.vw / 2, s.vh / 2, Math.max(s.vw, s.vh) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
    c.save(); c.globalAlpha = a; c.fillStyle = g; c.fillRect(0, 0, s.vw, s.vh); c.restore();
  }
  function glowDot(c, x, y, r, col, a) {
    if (a <= 0 || r <= 0) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.globalAlpha = a; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }
  function flash(c, s, col, a) { if (a <= 0) return; c.save(); c.globalAlpha = a; c.fillStyle = col; c.fillRect(0, 0, s.vw, s.vh); c.restore(); }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  /** 畫面震動：events = [[開始, 長度, 幅度]] */
  function shakeOf(t, events) {
    let a = 0;
    events.forEach(([t0, d, amp]) => { if (t >= t0 && t < t0 + d) a = Math.max(a, amp * (1 - (t - t0) / d)); });
    return a ? [(Math.random() - 0.5) * 2 * a, (Math.random() - 0.5) * 2 * a] : [0, 0];
  }
  function commonSetup(s) {
    const R = s.R;
    s.lines = Array.from({ length: 34 }, () => ({ y: R() * s.vh, v: 1.2 + R() * 2.4, o: R() * 3000, len: 80 + R() * 260, w: 0.6 + R() * 1.6 }));
  }
  const mid = s => s.tg.reduce((a, p) => ({ x: a.x + p.x / s.tg.length, y: a.y + p.y / s.tg.length }), { x: 0, y: 0 });

  /* ================= 凱恩「結案」 ================= */
  const KANE = {
    setup(s) {
      const R = s.R, m = s.main;
      s.A = prepArt(s, s.vh * 1.45, 'rgba(150,190,255,.5)', 'grayscale(.3) contrast(1.08)');
      const pts = s.tg.slice(0, 4).map(p => ({ x: p.x + (R() - 0.5) * 50, y: p.y - 70 - R() * 40 }));
      while (pts.length < 5) pts.push({ x: s.vw * (0.42 + R() * 0.52), y: s.vh * (0.1 + R() * 0.42) });
      s.photos = pts.map((p, i) => ({ x: p.x, y: p.y, rot: (R() - 0.5) * 0.45, t: 900 + i * 85, kind: i % 3 }));
      s.cracks = Array.from({ length: 18 }, (_, i) => {
        const a = i / 18 * TAU + R() * 0.3, len = 90 + R() * Math.max(s.vw, s.vh) * 0.55, seg = [];
        let x = 0, y = 0;
        for (let j = 0; j < 7; j++) { const aa = a + (R() - 0.5) * 0.55; x += Math.cos(aa) * len / 7; y += Math.sin(aa) * len / 7; seg.push([x, y]); }
        return seg;
      });
      s.rings = [50, 110, 190].map(r => Array.from({ length: 18 }, (_, i) => r * (0.85 + R() * 0.3)));
      s.shards = Array.from({ length: 46 }, () => ({ a: R() * TAU, v: 350 + R() * 1100, r: (R() - 0.5) * 12, s: 8 + R() * 26, d: R() * 90 }));
      s.ink = Array.from({ length: 20 }, () => ({ a: R() * TAU, d: 60 + R() * 110, r: 2 + R() * 8 }));
      s.lens0 = { x: s.vw * 0.2, y: s.vh * 0.82 };
      s.m = m;
    },
    draw(c, t, s) {
      const { vw, vh, m } = s, out = 1 - prog(t, 2450, 2800);
      c.fillStyle = `rgba(5,9,20,${0.86 * eo(prog(t, 0, 220)) * out})`; c.fillRect(0, 0, vw, vh);
      glowDot(c, vw * 0.24, vh * 0.4, vh * 0.8, 'rgba(90,130,210,.35)', out * (1 - prog(t, 1400, 1800)));
      // 開場：橫向白線裂開
      if (t < 480) {
        const p = prog(t, 0, 160), q = prog(t, 140, 480);
        c.save(); c.globalAlpha = 1 - q; c.fillStyle = '#eaf2ff';
        const h = 2 + eo(q) * vh * 0.35; c.fillRect(vw * (0.5 - p / 2), vh * 0.5 - h / 2, vw * p, h); c.restore();
      }
      speedLines(c, s, t, 'rgba(190,215,255,.7)', 0.35 * prog(t, 80, 300) * (1 - prog(t, 1200, 1500)), 1);
      // 立繪
      const ap = eo(prog(t, 60, 620)), aout = eio(prog(t, 1350, 1750));
      drawArt(c, s.A, lerp(-vw * 0.12, vw * 0.25, ap) - aout * vw * 0.3, vh * 0.36, ap * (1 - aout) * out);
      // 標題
      const ta = (1 - prog(t, 1400, 1700)) * out;
      if (ta > 0) {
        label(c, '凱恩', vw * 0.69, vh * 0.43, vh * 0.028, '#9fb6e0', ta * prog(t, 150, 400), 'center', SANS, 12);
        title(c, '結案', vw * 0.69, vh * 0.6, vh * 0.2, { t, start: 260, per: 140, align: 'center', alpha: ta, glow: 'rgba(160,200,255,.8)', fill: { grad: [[0, '#ffffff'], [1, '#b8cdf5']] }, spacing: vh * 0.02 });
        const lp = eo(prog(t, 520, 760));
        c.save(); c.globalAlpha = ta; c.fillStyle = '#d8313d'; c.fillRect(vw * 0.69 - vh * 0.22 * lp, vh * 0.72, vh * 0.44 * lp, 4); c.restore();
        label(c, 'C A S E   C L O S E D', vw * 0.69, vh * 0.765, vh * 0.024, '#dfe8ff', ta * prog(t, 600, 850), 'center', SANS);
      }
      // 證據照片與紅線
      const pa = out * (t < 2000 ? 1 : 1 - prog(t, 2000, 2250));
      s.photos.forEach((p, i) => {
        const sp = prog(t, p.t, p.t + 200);
        if (sp <= 0 || pa <= 0) return;
        const lp = eo(prog(t, 1080 + i * 60, 1380 + i * 60));
        if (lp > 0) {
          c.save(); c.globalAlpha = pa; c.strokeStyle = '#e02a36'; c.lineWidth = 2.2; c.shadowColor = 'rgba(255,40,50,.8)'; c.shadowBlur = 8;
          const ex = lerp(p.x, m.x, lp), ey = lerp(p.y, m.y, lp);
          c.beginPath(); c.moveTo(p.x, p.y - 44); c.quadraticCurveTo((p.x + ex) / 2, Math.max(p.y, ey) + 30 * lp, ex, ey); c.stroke(); c.restore();
        }
        c.save(); c.globalAlpha = pa; c.translate(p.x, p.y); c.rotate(p.rot); const k = eback(sp); c.scale(k, k);
        c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 14;
        c.fillStyle = '#f2efe6'; c.fillRect(-44, -52, 88, 104); c.shadowBlur = 0;
        const g = c.createLinearGradient(0, -44, 0, 30); g.addColorStop(0, '#39455e'); g.addColorStop(1, '#141a28');
        c.fillStyle = g; c.fillRect(-37, -44, 74, 72);
        c.fillStyle = 'rgba(10,12,20,.9)';
        c.beginPath(); c.arc(0, -16, 11, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(-24, 28); c.quadraticCurveTo(0, -6, 24, 28); c.fill();
        c.fillStyle = '#e02a36'; c.font = `900 22px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(['?', '!', '✕'][p.kind], 22, -30);
        c.fillStyle = '#556'; c.fillRect(-30, 36, 40, 3); c.fillRect(-30, 42, 26, 3);
        c.fillStyle = '#c21d2a'; c.beginPath(); c.arc(0, -46, 5, 0, TAU); c.fill();
        c.restore();
      });
      // 放大鏡
      const lp = eio(prog(t, 1150, 1600)), la = prog(t, 1150, 1260) * (1 - prog(t, 1720, 1820)) * out;
      if (la > 0) {
        const x = lerp(s.lens0.x, m.x, lp), y = lerp(s.lens0.y, m.y, lp) - Math.sin(lp * Math.PI) * vh * 0.12, r = 66;
        c.save(); c.globalAlpha = la;
        c.strokeStyle = '#3a3f4c'; c.lineWidth = 14; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x + r * 0.72, y + r * 0.72); c.lineTo(x + r * 1.75, y + r * 1.75); c.stroke();
        const lg = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 4, x, y, r);
        lg.addColorStop(0, 'rgba(230,242,255,.35)'); lg.addColorStop(1, 'rgba(120,170,255,.08)');
        c.fillStyle = lg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
        c.strokeStyle = '#c9a45a'; c.lineWidth = 7; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * 0.72, -2.4, -1.6); c.stroke();
        c.restore();
      }
      // 鎖定準星
      const rp = prog(t, 1560, 1760);
      if (rp > 0 && t < 2000) {
        const r = lerp(120, 42, eo(rp));
        c.save(); c.globalAlpha = (1 - prog(t, 1850, 2000)) * out; c.strokeStyle = '#ff3440'; c.lineWidth = 3; c.shadowColor = '#ff3440'; c.shadowBlur = 12;
        c.beginPath(); c.arc(m.x, m.y, r, 0, TAU); c.stroke();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + rp; c.beginPath(); c.moveTo(m.x + Math.cos(a) * (r + 6), m.y + Math.sin(a) * (r + 6)); c.lineTo(m.x + Math.cos(a) * (r + 24), m.y + Math.sin(a) * (r + 24)); c.stroke(); }
        c.restore();
      }
      // 玻璃裂痕
      const cp = eo(prog(t, 1980, 2120)), ca = out;
      if (cp > 0) {
        c.save(); c.globalAlpha = ca; c.strokeStyle = 'rgba(235,245,255,.9)'; c.lineWidth = 1.6; c.shadowColor = '#9cc4ff'; c.shadowBlur = 6;
        c.translate(m.x, m.y);
        s.cracks.forEach(seg => { const n = seg.length * cp; c.beginPath(); c.moveTo(0, 0); for (let j = 0; j < n; j++) c.lineTo(seg[j][0], seg[j][1]); c.stroke(); });
        s.rings.forEach((rr, k) => {
          if (cp < 0.3 + k * 0.2) return;
          c.beginPath(); rr.forEach((r, i) => { const a = i / rr.length * TAU; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }); c.closePath(); c.stroke();
        });
        c.restore();
      }
      // 蓋章「結案」
      if (t >= 1750) {
        const p = prog(t, 1750, 1840), k = lerp(2.8, 1, eo(p)), a = Math.min(1, p * 3) * out * (1 - prog(t, 2250, 2450));
        c.save(); c.globalAlpha = a; c.translate(m.x, m.y); c.rotate(-0.2); c.scale(k, k);
        c.strokeStyle = '#d4202e'; c.fillStyle = '#d4202e'; c.shadowColor = 'rgba(255,40,50,.6)'; c.shadowBlur = 10;
        c.lineWidth = 6; roundRect(c, -95, -48, 190, 96, 10); c.stroke();
        c.lineWidth = 2; roundRect(c, -84, -38, 168, 76, 6); c.stroke();
        c.font = `900 58px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('結案', 0, 2);
        c.restore();
        if (p >= 1) s.ink.forEach(d => {
          const q = eo(prog(t, 1840, 1950));
          c.save(); c.globalAlpha = a; c.fillStyle = '#c01826';
          c.beginPath(); c.arc(m.x + Math.cos(d.a) * d.d * q, m.y + Math.sin(d.a) * d.d * q * 0.8, d.r, 0, TAU); c.fill(); c.restore();
        });
      }
      // 十字斬
      const L = Math.max(vw, vh) * 0.9;
      [[2150, -0.62], [2250, 0.62]].forEach(([t0, ang]) => {
        const p = eo(prog(t, t0, t0 + 90)), w = 30 * (1 - prog(t, t0 + 90, t0 + 450));
        if (p <= 0 || w <= 0) return;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const x1 = m.x - dx * L, y1 = m.y - dy * L;
        blade(c, x1, y1, x1 + dx * 2 * L * p, y1 + dy * 2 * L * p, w, '#ffffff', '#8fb8ff');
      });
      // 碎片
      if (t > 2240) s.shards.forEach(sh => {
        const dt = (t - 2240 - sh.d) / 1000;
        if (dt <= 0) return;
        const x = m.x + Math.cos(sh.a) * sh.v * dt, y = m.y + Math.sin(sh.a) * sh.v * dt + 500 * dt * dt;
        c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.6) * out; c.translate(x, y); c.rotate(sh.r * dt);
        c.fillStyle = 'rgba(210,230,255,.85)'; c.strokeStyle = '#fff'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -sh.s); c.lineTo(sh.s * 0.6, sh.s * 0.5); c.lineTo(-sh.s * 0.5, sh.s * 0.3); c.closePath(); c.fill(); c.stroke();
        c.restore();
      });
      flash(c, s, '#ffffff', 0.6 * bump(t, 2160, 260) + 0.3 * bump(t, 1760, 120));
      vignette(c, s, 'rgba(0,0,10,.9)', 0.7 * out);
    },
    shake: [[1750, 170, 14], [2150, 320, 18]],
  };

  /* ================= 龍爪「贏家奠定規則，輸家失去所有」 ================= */
  const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', 'K', 'Q', 'J', '10', '7'];
  const LONGZHAO = {
    setup(s) {
      const R = s.R, c0 = mid(s);
      s.A = prepArt(s, s.vh * 1.5, 'rgba(255,50,60,.5)');
      s.cards = Array.from({ length: 20 }, () => ({ x: R() * s.vw, y: -120 - R() * 300, vx: (R() - 0.5) * 260, vy: 380 + R() * 520, rot: R() * TAU, vr: (R() - 0.5) * 7, suit: Math.floor(R() * 4), rank: RANKS[Math.floor(R() * RANKS.length)], t: R() * 700, k: 0.75 + R() * 0.5 }));
      s.chips = Array.from({ length: 16 }, () => ({ x: R() * s.vw, y: -60 - R() * 300, vx: (R() - 0.5) * 200, vy: 450 + R() * 500, t: 100 + R() * 800, col: ['#c41e2c', '#1b1b22', '#d8b34a', '#e8e4da'][Math.floor(R() * 4)], k: 0.7 + R() * 0.6, sq: R() }));
      s.c0 = c0;
      s.claws = [[-0.44, -75], [-0.3, 5], [-0.56, 80]].map(([ang, off], i) => {
        const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, L = Math.max(s.vw, s.vh) * 0.75;
        const cx = c0.x + nx * off, cy = c0.y + 30 + ny * off;
        return { t0: 1520 + i * 100, fingers: [-30, 0, 30].map(o => ({ x1: cx + nx * o - dx * L, y1: cy + ny * o - dy * L, x2: cx + nx * o + dx * L, y2: cy + ny * o + dy * L })) };
      });
      s.blood = s.tg.map(p => ({ p, drops: Array.from({ length: 34 }, () => { const a = -Math.PI / 2 + (R() - 0.5) * 2.6; return { a, v: 200 + R() * 650, r: 2 + R() * 6, d: R() * 120 }; }) }));
    },
    draw(c, t, s) {
      const { vw, vh } = s, out = 1 - prog(t, 2450, 2800);
      c.fillStyle = `rgba(16,2,6,${0.87 * eo(prog(t, 0, 220)) * out})`; c.fillRect(0, 0, vw, vh);
      glowDot(c, vw * 0.5, vh * 0.48, Math.max(vw, vh) * 0.6, 'rgba(160,10,30,.45)', out * (0.7 + 0.3 * Math.sin(t * 0.012)));
      // 輪盤
      const wa = eo(prog(t, 0, 300)) * (1 - prog(t, 1500, 1850)) * out;
      if (wa > 0) {
        const x = vw * 0.5, y = vh * 0.47, R = Math.min(vw, vh) * 0.42, rot = 12 * eo(prog(t, 0, 1400));
        c.save(); c.globalAlpha = wa * 0.6; c.translate(x, y); c.rotate(rot);
        for (let i = 0; i < 37; i++) {
          const a0 = i / 37 * TAU, a1 = (i + 1) / 37 * TAU;
          c.fillStyle = i === 0 ? '#0d5b30' : i % 2 ? '#8a0d1a' : '#111116';
          c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a0, a1); c.closePath(); c.fill();
        }
        c.strokeStyle = '#d8b04a'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
        c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R * 0.62, 0, TAU); c.stroke();
        c.fillStyle = '#1a0a0c'; c.beginPath(); c.arc(0, 0, R * 0.6, 0, TAU); c.fill();
        c.strokeStyle = '#b8903a'; c.lineWidth = 4;
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.beginPath(); c.moveTo(Math.cos(a) * R * 0.1, Math.sin(a) * R * 0.1); c.lineTo(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55); c.stroke(); }
        const hg = c.createRadialGradient(-6, -6, 2, 0, 0, R * 0.12); hg.addColorStop(0, '#fff2c0'); hg.addColorStop(1, '#8a6414');
        c.fillStyle = hg; c.beginPath(); c.arc(0, 0, R * 0.12, 0, TAU); c.fill();
        c.restore();
        // 滾珠
        const bp = prog(t, 0, 1380), ba = -18 * eo(bp), br = R * lerp(0.9, 0.75, eo(prog(t, 900, 1380)));
        const bx = x + Math.cos(ba + (bp >= 1 ? rot : 0)) * br, by = y + Math.sin(ba + (bp >= 1 ? rot : 0)) * br;
        glowDot(c, bx, by, 26, 'rgba(255,255,255,.8)', wa);
        c.save(); c.globalAlpha = wa; c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by, 7, 0, TAU); c.fill(); c.restore();
        if (t > 1380) glowDot(c, bx, by, R * 0.5, 'rgba(255,40,50,.6)', bump(t, 1420, 200) * wa);
      }
      // 撲克牌與籌碼
      const fa = out * (1 - prog(t, 1600, 2100));
      s.cards.forEach(cd => {
        const dt = (t - cd.t) / 1000; if (dt <= 0 || fa <= 0) return;
        const x = cd.x + cd.vx * dt, y = cd.y + cd.vy * dt + 160 * dt * dt;
        c.save(); c.globalAlpha = fa; c.translate(x, y); c.rotate(cd.rot + cd.vr * dt); c.scale(cd.k, cd.k * Math.cos(dt * 3 + cd.rot));
        c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 8;
        c.fillStyle = '#f5f1e8'; roundRect(c, -28, -40, 56, 80, 6); c.fill(); c.shadowBlur = 0;
        c.strokeStyle = '#c9a44e'; c.lineWidth = 1.5; roundRect(c, -24, -36, 48, 72, 4); c.stroke();
        c.fillStyle = cd.suit % 3 ? '#c21a28' : '#16161c';
        c.font = `700 30px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(SUITS[cd.suit], 0, 4);
        c.font = `800 13px ${SANS}`; c.fillText(cd.rank, -15, -26);
        c.restore();
      });
      s.chips.forEach(ch => {
        const dt = (t - ch.t) / 1000; if (dt <= 0 || fa <= 0) return;
        const x = ch.x + ch.vx * dt, y = ch.y + ch.vy * dt + 200 * dt * dt;
        c.save(); c.globalAlpha = fa; c.translate(x, y); c.scale(ch.k, ch.k * (0.35 + 0.65 * Math.abs(Math.cos(dt * 5 + ch.sq * 6))));
        c.fillStyle = ch.col; c.beginPath(); c.arc(0, 0, 16, 0, TAU); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 4; c.setLineDash([5, 5]); c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.stroke();
        c.setLineDash([]); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.stroke();
        c.restore();
      });
      // 立繪（右側滑入）與標題（左側）
      const ap = eo(prog(t, 80, 600)), aout = eio(prog(t, 1350, 1650));
      drawArt(c, s.A, lerp(vw * 1.15, vw * 0.72, ap) + aout * vw * 0.35, vh * 0.32, ap * (1 - aout) * out);
      const ta = (1 - prog(t, 1350, 1600)) * out;
      if (ta > 0) {
        label(c, '龍爪 ─ 第九街', vw * 0.07, vh * 0.25, vh * 0.026, '#e0a0a0', ta * prog(t, 150, 400), 'left', SANS, 6);
        title(c, '贏家奠定規則，', vw * 0.07, vh * 0.35, vh * 0.075, { t, start: 250, per: 45, alpha: ta, glow: 'rgba(255,200,90,.6)', fill: { grad: [[0, '#fff4c8'], [0.5, '#f0c050'], [1, '#a8721a']] } });
        title(c, '輸家失去所有', vw * 0.07 + vh * 0.075, vh * 0.46, vh * 0.085, { t, start: 620, per: 55, alpha: ta, glow: 'rgba(255,40,50,.8)', fill: { grad: [[0, '#ffd0c8'], [0.5, '#ff3a3a'], [1, '#8a0a14']] } });
      }
      speedLines(c, s, t, 'rgba(255,120,120,.6)', 0.3 * prog(t, 80, 300) * (1 - prog(t, 1200, 1500)), -1);
      // 出手前的一瞬暗場
      flash(c, s, '#000', 0.5 * prog(t, 1420, 1500) * (1 - prog(t, 1520, 1700)));
      // 三道巨大爪痕
      s.claws.forEach(cl => {
        const p = eo(prog(t, cl.t0, cl.t0 + 80));
        if (p <= 0) return;
        const life = 1 - prog(t, cl.t0 + 120, 2700);
        cl.fingers.forEach((f, j) => {
          const x2 = lerp(f.x1, f.x2, p), y2 = lerp(f.y1, f.y2, p);
          const w = (t < cl.t0 + 160 ? 16 : lerp(16, 7, prog(t, cl.t0 + 160, cl.t0 + 500))) * (j === 1 ? 1.15 : 0.9);
          c.save(); c.globalAlpha = Math.max(0, life) * out;
          blade(c, f.x1, f.y1, x2, y2, w * 1.8, 'rgba(120,0,12,.9)', null);
          blade(c, f.x1, f.y1, x2, y2, w, t < cl.t0 + 200 ? '#fff0f0' : '#ff3044', '#ff1a30');
          c.restore();
        });
        flash(c, s, '#ff2030', 0.28 * bump(t, cl.t0 + 40, 160));
      });
      // 血花
      if (t > 1800) s.blood.forEach(b => {
        const sp = eo(prog(t, 1800, 2000));
        glowDot(c, b.p.x, b.p.y, 90 * sp, 'rgba(180,0,20,.8)', (1 - prog(t, 2000, 2600)) * out);
        b.drops.forEach(d => {
          const dt = (t - 1800 - d.d) / 1000; if (dt <= 0) return;
          const x = b.p.x + Math.cos(d.a) * d.v * dt, y = b.p.y + Math.sin(d.a) * d.v * dt + 1400 * dt * dt;
          c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.4) * out; c.fillStyle = d.r > 5 ? '#7a0010' : '#c0101f';
          c.beginPath(); c.ellipse(x, y, d.r, d.r * 1.4, Math.atan2(Math.sin(d.a) * d.v + 2800 * dt, Math.cos(d.a) * d.v) + Math.PI / 2, 0, TAU); c.fill(); c.restore();
        });
      });
      vignette(c, s, 'rgba(20,0,4,.95)', 0.8 * out);
    },
    shake: [[1520, 150, 12], [1620, 150, 14], [1720, 240, 22], [1850, 250, 10]],
  };

  /* ================= 莫卡兄弟「我們能處理好這一切⋯⋯嗎？」 ================= */
  const MOCHA = {
    setup(s) {
      const R = s.R, cx = s.vw * 0.5, cy = s.vh * 0.46;
      s.A = prepArt(s, s.vh * 1.4, 'rgba(140,220,255,.5)');
      s.cc = { x: cx, y: cy };
      s.papers = Array.from({ length: 26 }, () => ({ a: R() * TAU, r0: Math.max(s.vw, s.vh) * (0.55 + R() * 0.3), t: R() * 350, spin: (R() - 0.5) * 6, k: 0.6 + R() * 0.6, lines: 3 + Math.floor(R() * 4), vr: 1.8 + R() * 1.4 }));
      s.sig = Array.from({ length: 70 }, (_, i) => { const u = i / 69; return [u * 150 - 75, Math.sin(u * 19) * 9 + Math.sin(u * 6.5) * 7 - u * 6 + (i > 55 ? (i - 55) * 1.5 : 0)]; });
      s.src = { x: s.vw * 0.1, y: s.vh * 1.02 };
      s.jets = s.tg.map((p, i) => {
        const ctrl = { x: (s.src.x + p.x) / 2 + (i - (s.tg.length - 1) / 2) * 40, y: Math.max(s.vh * 0.02 - p.y * 0.3, Math.min(s.src.y, p.y) - s.vh * 0.3) };
        const pts = Array.from({ length: 44 }, (_, j) => { const u = j / 43, v = 1 - u; return { x: v * v * s.src.x + 2 * v * u * ctrl.x + u * u * p.x, y: v * v * s.src.y + 2 * v * u * ctrl.y + u * u * p.y, u }; });
        return { p, pts, delay: i * 50 };
      });
      s.drops = Array.from({ length: 70 }, () => ({ j: Math.floor(R() * s.jets.length), u: 0.2 + R() * 0.8, a: R() * TAU, v: 80 + R() * 260, r: 1.5 + R() * 3.5, d: R() * 300 }));
      s.crystals = s.tg.map(() => Array.from({ length: 8 }, (_, i) => ({ a: -Math.PI / 2 + (i - 3.5) * 0.36 + (R() - 0.5) * 0.2, l: 40 + R() * 70, w: 7 + R() * 9 })));
      s.shards = Array.from({ length: 90 }, () => {
        const jet = s.jets[Math.floor(R() * s.jets.length)], q = jet.pts[Math.floor(R() * jet.pts.length)];
        return { x: q.x, y: q.y, a: R() * TAU, v: 200 + R() * 700, s: 5 + R() * 16, r: (R() - 0.5) * 14 };
      });
    },
    draw(c, t, s) {
      const { vw, vh } = s, out = 1 - prog(t, 2450, 2800), cc = s.cc;
      c.fillStyle = `rgba(6,14,26,${0.85 * eo(prog(t, 0, 220)) * out})`; c.fillRect(0, 0, vw, vh);
      glowDot(c, vw * 0.5, vh * 0.45, Math.max(vw, vh) * 0.6, 'rgba(90,170,230,.3)', out);
      // 文件翻飛
      const frozen = prog(t, 1500, 1800), burst = t > 2100;
      s.papers.forEach(pp => {
        const p = prog(t, pp.t, pp.t + 1300);
        if (p <= 0) return;
        let x, y, rot;
        const a = pp.a + pp.vr * eio(p) * 2.2, r = pp.r0 * (1 - 0.72 * eo(p));
        x = cc.x + Math.cos(a) * r; y = cc.y + Math.sin(a) * r * 0.62;
        rot = pp.spin * (t < 1500 ? t : 1500) / 1000;
        if (burst) { const dt = (t - 2100) / 1000; x += Math.cos(a) * 900 * dt; y += Math.sin(a) * 600 * dt + 500 * dt * dt; rot += dt * pp.spin; }
        const al = out * (burst ? Math.max(0, 1 - (t - 2100) / 450) : 1);
        if (al <= 0) return;
        c.save(); c.globalAlpha = al; c.translate(x, y); c.rotate(rot); c.scale(pp.k, pp.k);
        c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 6;
        c.fillStyle = frozen > 0 ? `rgb(${lerp(244, 205, frozen)},${lerp(242, 236, frozen)},${lerp(236, 255, frozen)})` : '#f4f2ec';
        c.fillRect(-26, -34, 52, 68); c.shadowBlur = 0;
        c.fillStyle = frozen > 0.5 ? 'rgba(90,150,200,.6)' : 'rgba(60,64,80,.55)';
        for (let i = 0; i < pp.lines; i++) c.fillRect(-19, -24 + i * 9, i === pp.lines - 1 ? 22 : 38, 2.5);
        if (frozen > 0) { c.strokeStyle = `rgba(200,240,255,${frozen})`; c.lineWidth = 1.5; c.strokeRect(-26, -34, 52, 68); }
        c.restore();
      });
      // 立繪（左）
      const ap = eo(prog(t, 60, 620)), aout = eio(prog(t, 1350, 1700));
      drawArt(c, s.A, lerp(-vw * 0.12, vw * 0.24, ap) - aout * vw * 0.3, vh * 0.36, ap * (1 - aout) * out);
      // 標題
      const ta = (1 - prog(t, 1400, 1650)) * out;
      if (ta > 0) {
        label(c, '莫卡兄弟 ─ 代理執行', vw * 0.66, vh * 0.22, vh * 0.026, '#a8d8f0', ta * prog(t, 150, 400), 'center', SANS, 6);
        title(c, '我們能處理好這一切', vw * 0.66, vh * 0.32, vh * 0.062, { t, start: 220, per: 45, align: 'center', alpha: ta, glow: 'rgba(140,220,255,.7)', fill: { grad: [[0, '#ffffff'], [1, '#a6dcff']] } });
        const w = title(c, '⋯⋯嗎？', vw * 0.66, vh * 0.43, vh * 0.075, { t, start: 950, per: 90, align: 'center', alpha: ta, glow: 'rgba(140,220,255,.5)', fill: '#dff3ff', rot: i => Math.sin(t * 0.018 + i) * 0.09 });
        // 冷汗
        const sw = prog(t, 1150, 1300);
        if (sw > 0) {
          const x = vw * 0.66 + w / 2 + 18, y = vh * 0.38 + eo(prog(t, 1150, 1600)) * 16;
          c.save(); c.globalAlpha = ta * sw; c.fillStyle = '#8fd8ff'; c.strokeStyle = '#fff'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(x, y - 14); c.quadraticCurveTo(x + 11, y + 2, x, y + 7); c.quadraticCurveTo(x - 11, y + 2, x, y - 14); c.fill(); c.stroke(); c.restore();
        }
      }
      // 合約與簽名
      const kp = eback(prog(t, 600, 760)), kout = prog(t, 1050, 1250);
      if (kp > 0 && kout < 1) {
        c.save(); c.globalAlpha = (1 - kout) * out;
        c.translate(cc.x, cc.y + vh * 0.1 - eo(kout) * vh * 0.5); c.rotate(-0.06 + kout * 0.5); c.scale(kp * (1 - kout * 0.5), kp * (1 - kout * 0.5));
        c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 20; c.fillStyle = '#f7f4ea'; c.fillRect(-110, -140, 220, 280); c.shadowBlur = 0;
        c.fillStyle = '#1c2436'; c.font = `900 22px ${SERIF}`; c.textAlign = 'center'; c.fillText('委 任 契 約', 0, -104);
        c.fillStyle = 'rgba(40,44,60,.5)'; for (let i = 0; i < 7; i++) c.fillRect(-86, -78 + i * 16, i % 3 === 2 ? 110 : 172, 3);
        c.fillStyle = '#1c2436'; c.font = `700 13px ${SANS}`; c.textAlign = 'left'; c.fillText('甲方', -86, 60); c.fillText('乙方　莫卡兄弟', -86, 98);
        c.fillStyle = 'rgba(40,44,60,.4)'; c.fillRect(-50, 66, 136, 1.5);
        const sp = prog(t, 750, 1050), n = Math.floor(s.sig.length * sp);
        if (n > 1) { c.strokeStyle = '#1a4ca8'; c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); for (let i = 0; i < n; i++) { const [x, y] = s.sig[i]; i ? c.lineTo(x + 20, y + 52) : c.moveTo(x + 20, y + 52); } c.stroke(); }
        c.restore();
      }
      // 水柱 → 結冰
      if (!burst) s.jets.forEach(j => {
        const hp = eo(prog(t, 1050 + j.delay, 1380 + j.delay));
        if (hp <= 0) return;
        const tt = Math.min(t, 1500), n = Math.max(2, Math.floor(j.pts.length * hp));
        const pts = j.pts.slice(0, n).map((q, i) => ({ x: q.x + Math.sin(tt * 0.03 + i * 0.6) * 5 * (1 - frozen), y: q.y + Math.cos(tt * 0.025 + i * 0.5) * 5 * (1 - frozen) }));
        const path = () => { c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)); };
        c.save(); c.globalAlpha = out; c.lineCap = 'round'; c.lineJoin = 'round';
        c.shadowColor = frozen > 0.5 ? '#dff6ff' : '#3aa8ff'; c.shadowBlur = 18;
        c.strokeStyle = frozen > 0 ? `rgba(${lerp(60, 200, frozen)},${lerp(160, 235, frozen)},255,.9)` : 'rgba(60,160,255,.85)';
        c.lineWidth = lerp(22, 26, frozen); path(); c.stroke();
        c.shadowBlur = 0; c.strokeStyle = frozen > 0 ? `rgba(255,255,255,${0.6 + 0.4 * frozen})` : 'rgba(210,240,255,.9)'; c.lineWidth = 6; path(); c.stroke();
        // 冰晶稜面
        if (frozen > 0) {
          c.fillStyle = 'rgba(230,248,255,.85)'; c.strokeStyle = 'rgba(120,200,255,.9)'; c.lineWidth = 1;
          pts.forEach((q, i) => {
            if (i % 3 || i < 2) return;
            const g = eo(prog(t, 1500 + i * 8, 1700 + i * 8)); if (g <= 0) return;
            const nx = -(q.y - pts[i - 1].y), ny = q.x - pts[i - 1].x, L = Math.hypot(nx, ny) || 1, side = i % 2 ? 1 : -1, l = (14 + (i * 37 % 13)) * g;
            c.beginPath(); c.moveTo(q.x - ny / L * 6, q.y + nx / L * 6); c.lineTo(q.x + nx / L * l * side, q.y + ny / L * l * side); c.lineTo(q.x + ny / L * 6, q.y - nx / L * 6); c.closePath(); c.fill(); c.stroke();
          });
        }
        c.restore();
        // 目標上的冰晶與雪花
        const fp = eo(prog(t, 1550, 1950));
        if (fp > 0) {
          const i = s.jets.indexOf(j);
          c.save(); c.globalAlpha = out; c.translate(j.p.x, j.p.y);
          c.fillStyle = 'rgba(215,245,255,.9)'; c.strokeStyle = '#8fd4ff'; c.lineWidth = 1.2; c.shadowColor = '#bfeaff'; c.shadowBlur = 10;
          s.crystals[i].forEach(cr => {
            const l = cr.l * fp, dx = Math.cos(cr.a), dy = Math.sin(cr.a);
            c.beginPath(); c.moveTo(-dy * cr.w / 2, dx * cr.w / 2); c.lineTo(dx * l, dy * l); c.lineTo(dy * cr.w / 2, -dx * cr.w / 2); c.closePath(); c.fill(); c.stroke();
          });
          c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; const r = 58 * fp;
          c.rotate(t * 0.001);
          for (let k = 0; k < 6; k++) {
            c.rotate(TAU / 6); c.beginPath(); c.moveTo(0, 0); c.lineTo(r, 0);
            c.moveTo(r * 0.5, 0); c.lineTo(r * 0.68, r * 0.16); c.moveTo(r * 0.5, 0); c.lineTo(r * 0.68, -r * 0.16);
            c.moveTo(r * 0.75, 0); c.lineTo(r * 0.88, r * 0.11); c.moveTo(r * 0.75, 0); c.lineTo(r * 0.88, -r * 0.11); c.stroke();
          }
          c.restore();
        }
      });
      // 水花（結冰後停在空中）
      s.drops.forEach(d => {
        const j = s.jets[d.j], q = j.pts[Math.floor(d.u * (j.pts.length - 1))];
        const t0 = 1100 + d.u * 300 + j.delay; if (t < t0 || burst) return;
        const dt = (Math.min(t, 1550) - t0) / 1000; if (dt < 0) return;
        const x = q.x + Math.cos(d.a) * d.v * dt, y = q.y + Math.sin(d.a) * d.v * dt + 500 * dt * dt;
        c.save(); c.globalAlpha = out * 0.9; c.fillStyle = frozen > 0.3 ? '#eafaff' : '#6cc4ff';
        c.beginPath(); c.arc(x, y, d.r, 0, TAU); c.fill(); c.restore();
      });
      // 碎冰
      if (burst) s.shards.forEach(sh => {
        const dt = (t - 2100) / 1000;
        const x = sh.x + Math.cos(sh.a) * sh.v * dt, y = sh.y + Math.sin(sh.a) * sh.v * dt + 700 * dt * dt;
        c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.7) * out; c.translate(x, y); c.rotate(sh.r * dt);
        c.fillStyle = 'rgba(220,245,255,.9)'; c.strokeStyle = '#9adcff'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -sh.s); c.lineTo(sh.s * 0.45, 0); c.lineTo(0, sh.s * 0.8); c.lineTo(-sh.s * 0.4, 0); c.closePath(); c.fill(); c.stroke();
        c.restore();
      });
      flash(c, s, '#e8f8ff', 0.55 * bump(t, 2110, 240) + 0.15 * bump(t, 1520, 200));
      // 收尾的小吐槽
      const ea = prog(t, 2250, 2450) * out;
      label(c, '⋯⋯（應該）處理好了。', vw * 0.94, vh * 0.1, vh * 0.03, '#cfeeff', ea, 'right', SANS);
      vignette(c, s, 'rgba(0,6,14,.9)', 0.7 * out);
    },
    shake: [[1050, 450, 4], [2100, 300, 16]],
  };

  /* ================= 阿蘭「炎彈：勇氣判決」 ================= */
  const ALAN = {
    setup(s) {
      const R = s.R;
      s.A = prepArt(s, s.vh * 1.45, 'rgba(255,150,60,.5)');
      s.embers = Array.from({ length: 70 }, () => ({ x: R() * s.vw, y: s.vh * (0.6 + R() * 0.6), vy: 50 + R() * 170, sw: R() * TAU, r: 0.8 + R() * 2.4, t: R() * 900 }));
      s.fire = Array.from({ length: 100 }, () => ({ a: R() * TAU, v: 150 + R() * 800, r: 1.5 + R() * 4, life: 400 + R() * 800 }));
      s.smoke = Array.from({ length: 14 }, () => ({ a: R() * TAU, d: 30 + R() * 110, r: 50 + R() * 80 }));
      s.gun = { x: s.vw * 0.06, y: s.vh * 1.04 };
    },
    draw(c, t, s) {
      const { vw, vh, main: m } = s, out = 1 - prog(t, 2450, 2800);
      c.fillStyle = `rgba(14,7,3,${0.86 * eo(prog(t, 0, 220)) * out})`; c.fillRect(0, 0, vw, vh);
      glowDot(c, vw * 0.5, vh * 0.7, Math.max(vw, vh) * 0.7, 'rgba(200,90,20,.35)', out);
      // 上升的火星
      s.embers.forEach(e => {
        const dt = (t - e.t) / 1000; if (dt <= 0) return;
        const y = e.y - e.vy * dt, x = e.x + Math.sin(e.sw + dt * 3) * 14;
        c.save(); c.globalAlpha = Math.max(0, 1 - dt * 0.6) * out; c.fillStyle = e.r > 2 ? '#ffb45a' : '#ff7a2a';
        c.beginPath(); c.arc(x, y, e.r, 0, TAU); c.fill(); c.restore();
      });
      // 立繪與標題
      const ap = eo(prog(t, 60, 560)), aout = eio(prog(t, 620, 860));
      drawArt(c, s.A, lerp(vw * 1.12, vw * 0.7, ap) + aout * vw * 0.1, vh * 0.34, ap * (1 - aout) * out);
      const ta = (1 - prog(t, 640, 860)) * out;
      if (ta > 0) {
        label(c, '安珀莉亞・阿蘭 ─ 第九街', vw * 0.07, vh * 0.3, vh * 0.026, '#f0b88a', ta * prog(t, 100, 350), 'left', SANS, 6);
        const w1 = title(c, '炎彈：', vw * 0.07, vh * 0.41, vh * 0.07, { t, start: 150, per: 50, alpha: ta, glow: 'rgba(255,140,40,.7)', fill: { grad: [[0, '#fff0c8'], [1, '#ff9a3c']] } });
        title(c, '勇氣判決', vw * 0.07 + w1 + vh * 0.01, vh * 0.41, vh * 0.1, { t, start: 300, per: 70, alpha: ta, glow: 'rgba(255,90,20,.8)', fill: { grad: [[0, '#fff6d8'], [0.5, '#ffb04a'], [1, '#d0480e']] } });
      }
      speedLines(c, s, t, 'rgba(255,170,90,.6)', 0.3 * prog(t, 60, 250) * (1 - prog(t, 500, 700)), -1);
      // 狙擊鏡
      const sa = prog(t, 640, 800) * (1 - prog(t, 1620, 1780)) * out;
      if (sa > 0) {
        const cp = eo(prog(t, 650, 950)), sway = (1 - prog(t, 900, 1450)) * 18;
        const recoil = t > 1600 ? 46 * (1 - eo(prog(t, 1600, 1760))) : 0;
        const x = lerp(vw / 2, m.x, cp) + Math.sin(t * 0.006) * sway, y = lerp(vh / 2, m.y, cp) + Math.cos(t * 0.0047) * sway - recoil;
        const beat = 1 + 0.025 * (bump(t, 860, 70) + bump(t, 1030, 70));
        const R = Math.min(vw, vh) * 0.36 * lerp(1.9, 1, eo(prog(t, 650, 900))) * beat;
        c.save(); c.globalAlpha = sa;
        c.fillStyle = '#050403'; c.beginPath(); c.rect(0, 0, vw, vh); c.arc(x, y, R, 0, TAU, true); c.fill();
        const vg = c.createRadialGradient(x, y, R * 0.55, x, y, R);
        vg.addColorStop(0, 'rgba(255,140,40,.04)'); vg.addColorStop(1, 'rgba(0,0,0,.85)');
        c.fillStyle = vg; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
        c.strokeStyle = '#1c140e'; c.lineWidth = 16; c.stroke();
        c.strokeStyle = 'rgba(255,150,70,.55)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, R - 9, 0, TAU); c.stroke();
        // 十字線與密位點
        c.strokeStyle = 'rgba(20,14,8,.95)'; c.lineWidth = 7;
        [[-1, 0], [1, 0], [0, 1]].forEach(([dx, dy]) => { c.beginPath(); c.moveTo(x + dx * R, y + dy * R); c.lineTo(x + dx * R * 0.35, y + dy * R * 0.35); c.stroke(); });
        c.strokeStyle = 'rgba(30,20,10,.95)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x - R * 0.35, y); c.lineTo(x + R * 0.35, y); c.moveTo(x, y - R); c.lineTo(x, y + R * 0.35); c.stroke();
        c.fillStyle = 'rgba(30,20,10,.95)';
        for (let i = -4; i <= 4; i++) { if (!i) continue; c.beginPath(); c.arc(x + i * R * 0.075, y, 2.4, 0, TAU); c.fill(); c.beginPath(); c.arc(x, y + i * R * 0.075, 2.4, 0, TAU); c.fill(); }
        const lock = prog(t, 1330, 1400);
        if (lock > 0) { c.fillStyle = '#ff3a1a'; c.shadowColor = '#ff3a1a'; c.shadowBlur = 12; c.beginPath(); c.arc(x, y, 3.5 * lock, 0, TAU); c.fill(); c.shadowBlur = 0; }
        // 數據
        c.font = `600 ${Math.round(vh * 0.02)}px Consolas, monospace`; c.fillStyle = 'rgba(255,170,90,.9)'; c.textAlign = 'left';
        const rng = Math.round(lerp(880, 412, eo(prog(t, 700, 1300))));
        c.fillText(`RNG ${String(rng).padStart(4, '0')} m`, x + R * 0.42, y + R * 0.45);
        c.fillText(`WIND ← ${(2.3 + Math.sin(t * 0.01) * 0.2).toFixed(1)}`, x + R * 0.42, y + R * 0.45 + vh * 0.028);
        c.fillText(lock > 0 ? '■ 鎖定' : `BREATH ${'■'.repeat(1 + Math.floor(prog(t, 700, 1300) * 4))}`, x + R * 0.42, y + R * 0.45 + vh * 0.056);
        c.restore();
      }
      // 槍響、曳光彈
      flash(c, s, '#fff4dc', 0.85 * bump(t, 1605, 110));
      const tp = eo(prog(t, 1600, 1700)), tf = 1 - prog(t, 1700, 1850);
      if (tp > 0 && tf > 0) {
        const hx = lerp(s.gun.x, m.x, tp), hy = lerp(s.gun.y, m.y, tp), tx = lerp(s.gun.x, m.x, Math.max(0, tp - 0.35)), ty = lerp(s.gun.y, m.y, Math.max(0, tp - 0.35));
        c.save(); c.globalAlpha = tf * out; c.lineCap = 'round';
        c.strokeStyle = '#ff8a2a'; c.lineWidth = 7; c.shadowColor = '#ff6a10'; c.shadowBlur = 20; c.beginPath(); c.moveTo(tx, ty); c.lineTo(hx, hy); c.stroke();
        c.strokeStyle = '#fff6e0'; c.lineWidth = 2.5; c.shadowBlur = 0; c.beginPath(); c.moveTo(tx, ty); c.lineTo(hx, hy); c.stroke();
        c.restore();
      }
      // 炎彈爆炸
      if (t >= 1770) {
        const others = s.tg.filter(p => p !== m);
        [[m, 1780, 1], ...others.map(p => [p, 1870, 0.55])].forEach(([p, t0, k]) => {
          if (t < t0) return;
          const fp = eo(prog(t, t0, t0 + 280)), fa = (1 - prog(t, t0 + 250, t0 + 850)) * out, R = Math.min(vw, vh) * 0.22 * k * fp;
          s.smoke.forEach(sm => {
            const q = eo(prog(t, t0 + 150, t0 + 900));
            glowDot(c, p.x + Math.cos(sm.a) * sm.d * q * k, p.y + Math.sin(sm.a) * sm.d * q * k - q * 40, sm.r * k * (0.5 + q), 'rgba(40,24,18,.55)', q * (1 - prog(t, t0 + 600, t0 + 1100)) * out);
          });
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = fa;
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, R));
          g.addColorStop(0, '#fffbe8'); g.addColorStop(0.25, '#ffd66a'); g.addColorStop(0.55, '#ff7a1c'); g.addColorStop(0.85, 'rgba(180,30,10,.6)'); g.addColorStop(1, 'rgba(80,0,0,0)');
          c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, Math.max(1, R), 0, TAU); c.fill();
          c.restore();
          const wp = eo(prog(t, t0, t0 + 480));
          if (wp < 1) { c.save(); c.globalAlpha = (1 - wp) * out; c.strokeStyle = '#ffd9a0'; c.lineWidth = 14 * (1 - wp) * k + 1; c.beginPath(); c.arc(p.x, p.y, Math.max(vw, vh) * 0.6 * wp * k, 0, TAU); c.stroke(); c.restore(); }
          if (k === 1) s.fire.forEach(f => {
            const dt = (t - t0) / 1000; if (dt * 1000 > f.life) return;
            const x = p.x + Math.cos(f.a) * f.v * dt, y = p.y + Math.sin(f.a) * f.v * dt - 120 * dt * dt;
            c.save(); c.globalAlpha = (1 - dt * 1000 / f.life) * out; c.fillStyle = f.r > 3 ? '#ffe08a' : '#ff8a2a';
            c.beginPath(); c.arc(x, y, f.r, 0, TAU); c.fill(); c.restore();
          });
        });
      }
      // 掩護：我方前方的六角護盾
      const hp = prog(t, 2000, 2200) * (1 - prog(t, 2450, 2750));
      if (hp > 0) {
        const size = 30, h = size * Math.sqrt(3), y0 = vh * 0.66;
        c.save(); c.lineWidth = 1.5;
        for (let row = 0; y0 + row * h < vh + h; row++) {
          for (let col = 0; col * size * 1.5 < vw + size; col++) {
            const x = col * size * 1.5, y = y0 + row * h + (col % 2 ? h / 2 : 0);
            const wave = Math.max(0, 1 - Math.abs((x / vw) - prog(t, 2000, 2500)) * 4);
            c.globalAlpha = hp * (0.18 + 0.6 * wave) * Math.min(1, (y - y0) / 60 + 0.2);
            c.strokeStyle = '#ffc070'; c.beginPath();
            for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const px = x + Math.cos(a) * size * 0.95, py = y + Math.sin(a) * size * 0.95; i ? c.lineTo(px, py) : c.moveTo(px, py); }
            c.closePath(); c.stroke();
          }
        }
        c.restore();
      }
      vignette(c, s, 'rgba(10,4,0,.95)', 0.75 * out);
    },
    shake: [[1600, 130, 10], [1780, 420, 24], [1870, 200, 8]],
  };

  /** 英文台詞字幕（斜體、細描邊，淡入淡出） */
  function quote(c, s, text, x, y, t, a, b, o) {
    o = o || {};
    const al = prog(t, a, a + 180) * (1 - prog(t, b - 220, b));
    if (al <= 0) return;
    const size = s.vh * (o.size || 0.034);
    c.save(); c.globalAlpha = al; c.textAlign = o.align || 'left'; c.textBaseline = 'middle';
    c.font = `italic 600 ${size}px Georgia, "Times New Roman", serif`;
    if ('letterSpacing' in c) c.letterSpacing = '1px';
    c.translate(x + (1 - eo(prog(t, a, a + 260))) * (o.dx == null ? 30 : o.dx), y);
    c.shadowColor = o.glow || 'rgba(0,0,0,.8)'; c.shadowBlur = 12;
    c.fillStyle = o.fill || '#fff'; c.fillText(`“${text}”`, 0, 0);
    c.restore();
  }

  /* ================= 亞歷山卓「速度與執勤」 ================= */
  const ALEX = {
    setup(s) {
      const R = s.R;
      const withCar = Art.get('alexandra_car');
      s.A = prepArt(s, s.vh * (withCar ? 1.15 : 1.25), 'rgba(110,230,180,.45)', null, withCar);   // 開場：倚著警車
      s.A2 = withCar ? prepArt(s, s.vh * 1.2, 'rgba(255,90,110,.4)') : null;                          // 收尾：手持墨鏡的全身立繪
      s.car = Art.get('police_car');
      s.road = Array.from({ length: 46 }, () => ({ a: R() * TAU, o: R(), v: 0.9 + R() * 1.5, w: 1 + R() * 3, col: R() < 0.55 ? '#e8fff6' : R() < 0.5 ? '#ff4a5a' : '#4a8aff' }));
      s.gusts = s.tg.map(p => ({ p, arcs: Array.from({ length: 6 }, (_, j) => ({ r: 36 + j * 20 + R() * 14, a0: R() * TAU, len: 1.2 + R() * 1.6, sp: (R() < 0.5 ? -1 : 1) * (4 + R() * 4) })) }));
      s.debris = Array.from({ length: 64 }, () => ({ a: R() * TAU, v: 300 + R() * 900, r: 2 + R() * 4, d: R() * 140, col: R() < 0.6 ? '#dcfff1' : '#5fe3a8' }));
      s.tickets = Array.from({ length: 11 }, () => ({ x: R() * s.vw, y: -60 - R() * 120, vx: (R() - 0.5) * 320, vy: 520 + R() * 420, rot: R() * TAU, vr: (R() - 0.5) * 7, t: 1900 + R() * 260 }));
    },
    draw(c, t, s) {
      const { vw, vh, main: m } = s, out = 1 - prog(t, 2450, 2800);
      c.fillStyle = `rgba(4,8,20,${0.88 * eo(prog(t, 0, 220)) * out})`; c.fillRect(0, 0, vw, vh);
      // 警燈：左紅右藍交替閃爍
      const sr = 0.5 + 0.5 * Math.sin(t * 0.032), siren = out * (0.55 + 0.45 * (1 - prog(t, 1500, 2000)));
      glowDot(c, vw * 0.08, vh * 0.12, Math.max(vw, vh) * 0.6, 'rgba(255,40,60,.55)', siren * sr);
      glowDot(c, vw * 0.92, vh * 0.12, Math.max(vw, vh) * 0.6, 'rgba(40,110,255,.55)', siren * (1 - sr));
      // 公路：從主目標（消失點）向外衝的光條
      const ra = out * prog(t, 450, 700) * (1 - prog(t, 1650, 1850)), maxR = Math.hypot(vw, vh);
      if (ra > 0) {
        c.save(); c.lineCap = 'round';
        s.road.forEach(l => {
          const u = ((t / 1000) * l.v + l.o) % 1, r0 = u * u * maxR, len = 30 + u * u * 520;
          const dx = Math.cos(l.a), dy = Math.sin(l.a);
          c.globalAlpha = ra * Math.min(1, u * 3); c.strokeStyle = l.col; c.lineWidth = l.w * (0.4 + u * 1.6);
          c.beginPath(); c.moveTo(m.x + dx * r0, m.y + dy * r0); c.lineTo(m.x + dx * (r0 + len), m.y + dy * (r0 + len)); c.stroke();
        });
        c.restore();
      }
      // 立繪（左）：倚著警車滑入，車頂燈條跟著閃
      const ap = eo(prog(t, 60, 560)), aout = eio(prog(t, 1300, 1650));
      const ax = lerp(-vw * 0.15, vw * 0.3, ap) - aout * vw * 0.4, ay = vh * 0.24;
      drawArt(c, s.A, ax, ay, ap * (1 - aout) * out);
      if (s.A && s.A2 && ap * (1 - aout) > 0.05) {
        const lx = ax - (s.A.fx - (60 + 0.36 * (s.A.w - 120))), ly = ay - (s.A.fy - (60 + 0.39 * (s.A.h - 120)));   // 燈條在原圖約 (36%, 39%)
        glowDot(c, lx - vh * 0.05, ly, vh * 0.12, 'rgba(255,50,70,.9)', ap * (1 - aout) * out * sr);
        glowDot(c, lx + vh * 0.06, ly, vh * 0.12, 'rgba(60,120,255,.9)', ap * (1 - aout) * out * (1 - sr));
      }
      // 標題（右）
      const ta = (1 - prog(t, 1350, 1600)) * out;
      if (ta > 0) {
        label(c, '亞歷山卓 ─ 布魯克林警署', vw * 0.7, vh * 0.3, vh * 0.026, '#9fe8c8', ta * prog(t, 150, 400), 'center', SANS, 6);
        title(c, '速度與執勤', vw * 0.7, vh * 0.42, vh * 0.13, { t, start: 230, per: 75, align: 'center', alpha: ta, glow: 'rgba(95,227,168,.8)', fill: { grad: [[0, '#ffffff'], [0.55, '#bff7df'], [1, '#3fc48a']] } });
        const lp = eo(prog(t, 560, 800));
        c.save(); c.globalAlpha = ta; c.fillStyle = '#ff3a4a'; c.fillRect(vw * 0.7 - vh * 0.2 * lp, vh * 0.51, vh * 0.2 * lp, 4);
        c.fillStyle = '#3a7aff'; c.fillRect(vw * 0.7, vh * 0.51, vh * 0.2 * lp, 4); c.restore();
        label(c, 'S P E E D   &   D U T Y', vw * 0.7, vh * 0.55, vh * 0.022, '#dff8ee', ta * prog(t, 650, 900), 'center', SANS);
      }
      quote(c, s, 'Buckle up.', vw * 0.06, vh * 0.86, t, 300, 1350, { fill: '#eafff6', glow: 'rgba(95,227,168,.6)' });
      speedLines(c, s, t, 'rgba(200,255,230,.6)', 0.35 * prog(t, 60, 260) * (1 - prog(t, 1300, 1600)), 1);
      // 押送：主目標身上紅藍交替的鎖定環
      const ka = prog(t, 950, 1100) * (1 - prog(t, 1700, 1850)) * out;
      if (ka > 0) {
        const r = lerp(130, 58, eo(prog(t, 950, 1200))), rot = t * 0.006;
        c.save(); c.globalAlpha = ka; c.lineWidth = 6; c.lineCap = 'round';
        c.shadowBlur = 16; c.shadowColor = '#ff3a4a'; c.strokeStyle = '#ff3a4a'; c.beginPath(); c.arc(m.x, m.y, r, rot, rot + Math.PI * 0.85); c.stroke();
        c.shadowColor = '#3a7aff'; c.strokeStyle = '#3a7aff'; c.beginPath(); c.arc(m.x, m.y, r, rot + Math.PI, rot + Math.PI * 1.85); c.stroke();
        c.shadowBlur = 0; c.restore();
        label(c, 'IN CUSTODY ─ 押送', m.x, m.y + r + vh * 0.03, vh * 0.02, '#ffe0e4', ka * prog(t, 1100, 1250), 'center', SANS, 3);
      }
      // 警車從遠處（主目標）一路衝向鏡頭：車身放大、頭燈與燈條越來越亮
      const hp = prog(t, 1380, 1730);
      if (hp > 0 && t < 1800) {
        const k = ei(hp);
        if (s.car && s.car.canvas) {
          const w = lerp(vw * 0.05, vw * 2.4, k), h = w * s.car.h / s.car.w, cx = lerp(m.x, vw * 0.5, k), cy = lerp(m.y + 20, vh * 0.66, k);
          c.save(); c.globalAlpha = out * Math.min(1, hp * 4); c.drawImage(s.car.canvas, cx - w * 0.38, cy - h * 0.55, w, h); c.restore();
          const at = (fx, fy) => [cx - w * 0.38 + w * fx, cy - h * 0.55 + h * fy];
          [[0.09, 0.55], [0.58, 0.55]].forEach(([fx, fy]) => { const [x, y] = at(fx, fy); glowDot(c, x, y, lerp(14, vh * 0.8, k), 'rgba(255,250,225,.95)', out * (0.5 + 0.5 * k)); });
          const [bx, by] = at(0.62, 0.15);
          glowDot(c, bx - w * 0.12, by, lerp(10, vh * 0.6, k), 'rgba(255,50,70,.9)', out * sr);
          glowDot(c, bx + w * 0.12, by, lerp(10, vh * 0.6, k), 'rgba(60,120,255,.9)', out * (1 - sr));
        } else {
          const gap = lerp(18, vw * 0.7, k), y = lerp(m.y + 30, vh * 0.75, k);
          [-1, 1].forEach(sd => glowDot(c, m.x + sd * gap / 2, y, lerp(20, vh * 0.9, k), 'rgba(255,250,225,.95)', out * (0.4 + 0.6 * k)));
        }
      }
      flash(c, s, '#ffffff', 0.85 * bump(t, 1730, 200));
      // 封鎖線（兩條斜向的黃色膠帶）
      [[-0.12, 0.24, 1], [0.1, 0.7, -1]].forEach(([rot, yy, dir], i) => {
        const p = eo(prog(t, 1250 + i * 90, 1500 + i * 90)), al = out * (1 - prog(t, 2150, 2400));
        if (p <= 0 || al <= 0) return;
        c.save(); c.globalAlpha = al; c.translate(vw / 2 + dir * (1 - p) * vw * 1.3, vh * yy); c.rotate(rot);
        const w = vw * 1.6, h = vh * 0.055;
        c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 14; c.fillStyle = '#f5cf1e'; c.fillRect(-w / 2, -h / 2, w, h); c.shadowBlur = 0;
        c.fillStyle = '#16140c'; c.font = `900 ${h * 0.55}px ${SANS}`; c.textBaseline = 'middle'; c.textAlign = 'left';
        const seg = 'POLICE LINE ─ DO NOT CROSS ─ 警戒線 ─ ', sw = c.measureText(seg).width, off = ((t * 0.12 * dir) % sw + sw) % sw;
        for (let x = -w / 2 - off; x < w / 2; x += sw) c.fillText(seg, x, 1);
        c.restore();
      });
      // 衝擊：橫掃全場的風刃與環狀衝擊波
      if (t > 1700) {
        const p = eo(prog(t, 1700, 1820)), w = 44 * (1 - prog(t, 1820, 2250));
        if (w > 0) blade(c, -vw * 0.1, m.y + 10, lerp(-vw * 0.1, vw * 1.1, p), m.y - 30, w, '#f2fff9', '#5fe3a8');
        s.gusts.forEach(g => {
          const gp = prog(t, 1760, 2450), ga = (1 - prog(t, 2100, 2450)) * out;
          const wp = eo(prog(t, 1740, 2100));
          if (wp < 1) { c.save(); c.globalAlpha = (1 - wp) * out; c.strokeStyle = '#bff7df'; c.lineWidth = 10 * (1 - wp) + 1; c.beginPath(); c.arc(g.p.x, g.p.y, 30 + wp * vh * 0.35, 0, TAU); c.stroke(); c.restore(); }
          if (ga <= 0) return;
          c.save(); c.globalAlpha = ga; c.lineCap = 'round'; c.strokeStyle = '#7ff0bf'; c.shadowColor = '#5fe3a8'; c.shadowBlur = 10;
          g.arcs.forEach(a => { const st = a.a0 + gp * a.sp; c.lineWidth = 2.5; c.beginPath(); c.arc(g.p.x, g.p.y, a.r * (0.7 + gp * 0.6), st, st + a.len); c.stroke(); });
          c.restore();
        });
        s.debris.forEach(d => {
          const dt = (t - 1740 - d.d) / 1000; if (dt <= 0) return;
          const x = m.x + Math.cos(d.a) * d.v * dt, y = m.y + Math.sin(d.a) * d.v * dt * 0.7;
          c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.5) * out; c.fillStyle = d.col; c.beginPath(); c.arc(x, y, d.r, 0, TAU); c.fill(); c.restore();
        });
      }
      // 罰單飄落
      s.tickets.forEach(k => {
        const dt = (t - k.t) / 1000; if (dt <= 0) return;
        const x = k.x + k.vx * dt, y = k.y + k.vy * dt;
        c.save(); c.globalAlpha = out; c.translate(x, y); c.rotate(k.rot + k.vr * dt); c.scale(1, Math.cos(dt * 4 + k.rot));
        c.fillStyle = '#f6f3ea'; c.fillRect(-22, -30, 44, 60); c.fillStyle = '#d32a3a'; c.fillRect(-22, -30, 44, 11);
        c.fillStyle = 'rgba(40,44,60,.5)'; for (let i = 0; i < 4; i++) c.fillRect(-16, -12 + i * 9, i === 3 ? 18 : 32, 2.5);
        c.restore();
      });
      // 收尾：亞歷山卓從右側登場，拿下墨鏡
      if (s.A2) { const bp = eo(prog(t, 1880, 2200)); drawArt(c, s.A2, lerp(vw * 1.15, vw * 0.8, bp), vh * 0.17, bp * out); }
      quote(c, s, 'License revoked.', vw * (s.A2 ? 0.62 : 0.94), vh * 0.9, t, 1950, 2600, { align: 'right', fill: '#ffffff', glow: 'rgba(255,60,80,.6)', dx: -30 });
      vignette(c, s, 'rgba(0,4,14,.92)', 0.7 * out);
    },
    shake: [[1450, 260, 5], [1730, 380, 22], [1820, 200, 8]],
  };

  /* ================= 寒夜「構造·唯一證明」 ================= */
  const HANYE = {
    setup(s) {
      const R = s.R, m = s.main;
      s.A = prepArt(s, s.vh * 1.7, 'rgba(140,180,255,.55)');
      s.proof = ['Let  x ∈ Ω.', 'Suppose  x′ ≠ x.', '⇒  d(x, x′) > 0', '∴  contradiction.'];
      s.circles = [[-150, 30, 170], [160, -10, 175], [10, 170, 160]].map(([dx, dy, r], i) => ({ x: m.x + dx, y: m.y + dy, r, a0: R() * TAU, t0: 720 + i * 120 }));
      s.cons = [-0.35, 0.4, 1.35].map((a, i) => ({ a, t0: 1080 + i * 80 }));
      s.ang = -0.5 + (R() - 0.5) * 0.15;                       // 斬擊方向
      s.stars = Array.from({ length: 70 }, () => ({ u: R() * 2 - 1, v: R() * 2 - 1, r: 0.5 + R() * 1.6 }));
      s.frag = Array.from({ length: 40 }, () => ({ a: R() * TAU, v: 200 + R() * 700, s: 6 + R() * 16, r: (R() - 0.5) * 10, d: R() * 100 }));
      // 彈射路線：主目標 → 其他目標 → 回到主目標
      const others = s.tg.filter(p => p !== m);
      s.chain = [m].concat(others.length ? others : [{ x: m.x + 160, y: m.y - 60 }, { x: m.x - 140, y: m.y - 30 }], [m]);
    },
    draw(c, t, s) {
      const { vw, vh, main: m } = s, out = 1 - prog(t, 2450, 2800);
      c.fillStyle = `rgba(3,5,16,${0.9 * eo(prog(t, 0, 220)) * out})`; c.fillRect(0, 0, vw, vh);
      glowDot(c, m.x, m.y, Math.max(vw, vh) * 0.55, 'rgba(70,110,220,.28)', out);
      // 座標網格與邊緣的尺規刻度
      const ga = out * eo(prog(t, 0, 400)) * (1 - 0.6 * prog(t, 1850, 2300));
      if (ga > 0) {
        c.save(); c.globalAlpha = ga; c.translate(m.x, m.y); c.rotate(-0.04 + t * 0.00002);
        const G = 56, span = Math.max(vw, vh) * 1.3, drift = (t * 0.012) % G;
        for (let x = -span; x <= span; x += G) {
          const major = Math.round(x / G) % 5 === 0;
          c.strokeStyle = major ? 'rgba(143,180,255,.22)' : 'rgba(143,180,255,.08)'; c.lineWidth = major ? 1.2 : 1;
          c.beginPath(); c.moveTo(x - drift, -span); c.lineTo(x - drift, span); c.stroke();
          c.beginPath(); c.moveTo(-span, x + drift); c.lineTo(span, x + drift); c.stroke();
        }
        c.strokeStyle = 'rgba(200,220,255,.4)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(-span, 0); c.lineTo(span, 0); c.moveTo(0, -span); c.lineTo(0, span); c.stroke();
        c.restore();
        c.save(); c.globalAlpha = ga * 0.9; c.fillStyle = 'rgba(190,210,255,.8)';
        const off = (t * 0.08) % 20;
        for (let x = -off; x < vw; x += 20) { const big = Math.round((x + off) / 20) % 5 === 0; c.fillRect(x, vh - (big ? 18 : 9), 1.5, big ? 18 : 9); }
        for (let y = -off; y < vh; y += 20) { const big = Math.round((y + off) / 20) % 5 === 0; c.fillRect(0, y, big ? 18 : 9, 1.5); }
        c.restore();
      }
      // 立繪（右，全身）
      const ap = eo(prog(t, 60, 600)), aout = eio(prog(t, 1300, 1650));
      drawArt(c, s.A, lerp(vw * 1.15, vw * 0.78, ap) + aout * vw * 0.35, vh * 0.17, ap * (1 - aout) * out);
      // 標題（左）
      const ta = (1 - prog(t, 1350, 1600)) * out;
      if (ta > 0) {
        label(c, '寒夜 ─ 時間總局．收錄部', vw * 0.07, vh * 0.24, vh * 0.026, '#a8bff0', ta * prog(t, 150, 400), 'left', SANS, 6);
        const w = title(c, '構造', vw * 0.07, vh * 0.35, vh * 0.075, { t, start: 230, per: 70, alpha: ta, glow: 'rgba(143,180,255,.7)', fill: { grad: [[0, '#ffffff'], [1, '#9db8ee']] } });
        title(c, '·唯一證明', vw * 0.07 + w, vh * 0.35, vh * 0.075, { t, start: 380, per: 70, alpha: ta, glow: 'rgba(143,180,255,.9)', fill: { grad: [[0, '#ffffff'], [0.5, '#cfe0ff'], [1, '#6f8fe0']] } });
        // 證明過程（打字機）
        c.save(); c.globalAlpha = ta; c.font = `500 ${Math.round(vh * 0.024)}px Consolas, "Cambria Math", monospace`; c.fillStyle = '#c9d8ff'; c.textBaseline = 'middle';
        s.proof.forEach((ln, i) => {
          const n = Math.floor([...ln].length * prog(t, 520 + i * 220, 720 + i * 220));
          if (n > 0) c.fillText([...ln].slice(0, n).join('') + (n < [...ln].length && Math.floor(t / 80) % 2 ? '▍' : ''), vw * 0.075, vh * (0.46 + i * 0.045));
        });
        c.restore();
      }
      quote(c, s, 'Let x be your end.', vw * 0.07, vh * 0.86, t, 280, 1350, { fill: '#e6eeff', glow: 'rgba(143,180,255,.7)' });
      // 尺規作圖：三個圓與三條直線交於唯一的點
      const ca = out * (1 - prog(t, 1750, 1950));
      if (ca > 0) {
        c.save(); c.globalAlpha = ca; c.strokeStyle = 'rgba(190,212,255,.8)'; c.lineWidth = 1.4; c.setLineDash([6, 5]);
        s.circles.forEach(ci => { const p = eio(prog(t, ci.t0, ci.t0 + 380)); if (p > 0) { c.beginPath(); c.arc(ci.x, ci.y, ci.r, ci.a0, ci.a0 + TAU * p); c.stroke(); } });
        c.setLineDash([]); c.strokeStyle = 'rgba(230,240,255,.9)';
        s.cons.forEach(l => {
          const p = eo(prog(t, l.t0, l.t0 + 260)), L = Math.max(vw, vh) * p, dx = Math.cos(l.a), dy = Math.sin(l.a);
          if (p > 0) { c.beginPath(); c.moveTo(m.x - dx * L, m.y - dy * L); c.lineTo(m.x + dx * L, m.y + dy * L); c.stroke(); }
        });
        c.restore();
        const pp = prog(t, 1330, 1450);
        if (pp > 0) {
          glowDot(c, m.x, m.y, 60 * eo(pp), 'rgba(200,220,255,.9)', ca);
          c.save(); c.globalAlpha = ca; c.fillStyle = '#fff'; c.beginPath(); c.arc(m.x, m.y, 5, 0, TAU); c.fill();
          c.font = `italic 700 ${Math.round(vh * 0.03)}px Georgia, serif`; c.fillText('x₀', m.x + 14, m.y - 16);
          c.font = `600 ${Math.round(vh * 0.02)}px Consolas, monospace`; c.fillStyle = '#9db8ee'; c.fillText('∃!', m.x + 14, m.y + 14); c.restore();
        }
      }
      // 四道刻度
      [0, 1, 2, 3].forEach(i => {
        const p = eback(prog(t, 1450 + i * 45, 1580 + i * 45)), a = (1 - prog(t, 1800, 1950)) * out;
        if (p <= 0 || a <= 0) return;
        const ang = i * Math.PI / 2 - Math.PI / 4, r = 56;
        c.save(); c.globalAlpha = a; c.translate(m.x + Math.cos(ang) * r, m.y + Math.sin(ang) * r); c.rotate(ang); c.scale(p, p);
        c.fillStyle = '#eef3ff'; c.shadowColor = '#8fb4ff'; c.shadowBlur = 12; c.fillRect(-2, -14, 4, 28); c.fillRect(-9, -2, 18, 4); c.restore();
      });
      // 斬擊：帶刻度的直線劍光 → 空間裂開
      const L = Math.max(vw, vh) * 1.2, dx = Math.cos(s.ang), dy = Math.sin(s.ang), nx = -dy, ny = dx;
      const sp = eo(prog(t, 1760, 1860));
      if (sp > 0) {
        const rw = 34 * eo(prog(t, 1850, 2050)) * (1 - prog(t, 2250, 2600));
        if (rw > 0.5) {   // 裂縫：一條深色帶，裡面有星空
          c.save(); c.globalAlpha = out;
          c.beginPath(); c.moveTo(m.x - dx * L + nx * rw, m.y - dy * L + ny * rw); c.lineTo(m.x + dx * L + nx * rw, m.y + dy * L + ny * rw);
          c.lineTo(m.x + dx * L - nx * rw, m.y + dy * L - ny * rw); c.lineTo(m.x - dx * L - nx * rw, m.y - dy * L - ny * rw); c.closePath();
          c.fillStyle = '#010208'; c.shadowColor = '#8fb4ff'; c.shadowBlur = 30; c.fill(); c.shadowBlur = 0; c.clip();
          c.fillStyle = '#dfe8ff'; s.stars.forEach(st => { c.beginPath(); c.arc(m.x + dx * L * st.u + nx * rw * st.v, m.y + dy * L * st.u + ny * rw * st.v, st.r, 0, TAU); c.fill(); });
          c.restore();
        }
        const bw = 10 * (1 - prog(t, 1860, 2300));
        if (bw > 0) {
          const x1 = m.x - dx * L, y1 = m.y - dy * L;
          blade(c, x1, y1, x1 + dx * 2 * L * sp, y1 + dy * 2 * L * sp, bw * 2.4, '#ffffff', '#8fb4ff');
          c.save(); c.globalAlpha = out * (1 - prog(t, 1900, 2300)); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
          for (let k = -12; k <= 12; k++) { if (Math.abs(k) / 12 > sp) continue; const px = m.x + dx * k * 40, py = m.y + dy * k * 40, h = k % 4 ? 8 : 16; c.beginPath(); c.moveTo(px + nx * h, py + ny * h); c.lineTo(px - nx * h, py - ny * h); c.stroke(); }
          c.restore();
        }
      }
      flash(c, s, '#e8f0ff', 0.65 * bump(t, 1800, 200));
      // 彈射
      const bp = prog(t, 1900, 2250) * (s.chain.length - 1);
      if (bp > 0 && t < 2450) {
        c.save(); c.globalAlpha = out * (1 - prog(t, 2250, 2450)); c.strokeStyle = '#cfe0ff'; c.lineWidth = 2.5; c.shadowColor = '#8fb4ff'; c.shadowBlur = 12; c.lineCap = 'round';
        c.beginPath(); c.moveTo(s.chain[0].x, s.chain[0].y);
        for (let i = 1; i < s.chain.length; i++) {
          const q = Math.min(1, bp - (i - 1)); if (q <= 0) break;
          c.lineTo(lerp(s.chain[i - 1].x, s.chain[i].x, q), lerp(s.chain[i - 1].y, s.chain[i].y, q));
        }
        c.stroke(); c.restore();
        for (let i = 1; i < s.chain.length; i++) if (bp >= i) glowDot(c, s.chain[i].x, s.chain[i].y, 50, 'rgba(180,205,255,.9)', out * (1 - Math.min(1, (bp - i) * 1.5)));
      }
      // 網格碎片
      if (t > 1820) s.frag.forEach(f => {
        const dt = (t - 1820 - f.d) / 1000; if (dt <= 0) return;
        const x = m.x + Math.cos(f.a) * f.v * dt, y = m.y + Math.sin(f.a) * f.v * dt;
        c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.6) * out; c.translate(x, y); c.rotate(f.r * dt);
        c.strokeStyle = 'rgba(200,220,255,.9)'; c.lineWidth = 1; c.strokeRect(-f.s / 2, -f.s / 2, f.s, f.s); c.restore();
      });
      // Q.E.D. ∎ 與樣本標記
      const qa = prog(t, 2050, 2150) * out;
      if (qa > 0) {
        const k = lerp(1.8, 1, eo(prog(t, 2050, 2160)));
        c.save(); c.globalAlpha = qa; c.translate(m.x + vh * 0.06, m.y < vh * 0.32 ? m.y + vh * 0.19 : m.y - vh * 0.13); c.scale(k, k);
        c.font = `italic 800 ${Math.round(vh * 0.05)}px Georgia, serif`; c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.shadowColor = '#8fb4ff'; c.shadowBlur = 16; c.fillText('Q.E.D.', 0, 0);
        const w = c.measureText('Q.E.D.').width; c.fillRect(w + 10, -vh * 0.016, vh * 0.032, vh * 0.032); c.restore();
        label(c, '［樣本］', m.x, m.y + vh * 0.09, vh * 0.022, '#cfe0ff', qa * prog(t, 2150, 2300), 'center', SANS, 4);
      }
      vignette(c, s, 'rgba(0,2,10,.92)', 0.72 * out);
    },
    shake: [[1780, 300, 16], [1900, 220, 6]],
  };

  /* ================= 戈登「股票排山倒海」 ================= */
  const GORDON = {
    setup(s) {
      const R = s.R, N = 30, peak = 21;
      s.A = prepArt(s, s.vh * 1.1, 'rgba(255,215,120,.45)');
      let p = 100;
      s.candles = Array.from({ length: N }, (_, i) => {
        const o = p, drift = i < peak ? 2.2 + R() * 2.4 : -(6 + R() * 7);
        p = Math.max(40, o + drift + (R() - 0.5) * 3.2);
        return { o, c: p, h: Math.max(o, p) + R() * 2.5, l: Math.min(o, p) - R() * 2.5 };
      });
      s.peak = peak;
      const all = s.candles.flatMap(k => [k.h, k.l]);
      s.pmin = Math.min(...all) - 5; s.pmax = Math.max(...all) + 5;
      s.chart = { x0: s.vw * 0.08, x1: s.vw * 0.92, y0: s.vh * 0.18, y1: s.vh * 0.78 };
      const syms = ['GDN', '9TH', 'MOCA', 'KANE', 'ALN', 'BKPD', 'LOOM', 'TIME'];
      s.tape = Array.from({ length: 16 }, (_, i) => { const up = R() < 0.6, v = (R() * 9).toFixed(2); return { txt: `${syms[i % syms.length]} ${(40 + R() * 160).toFixed(2)} ${up ? '▲' : '▼'}${v}%`, up }; });
      s.wall = Array.from({ length: 60 }, (_, i) => ({ u: i / 59, h: 0.3 + R() * 0.7, up: R() < 0.45, w: 10 + R() * 14 }));
      s.digits = Array.from({ length: 50 }, () => ({ x: R() * s.vw, y: -R() * s.vh * 0.5, v: 300 + R() * 600, txt: (R() < 0.5 ? '-' : '+') + (R() * 99).toFixed(2), d: R() * 300 }));
    },
    draw(c, t, s) {
      const { vw, vh, main: m } = s, out = 1 - prog(t, 2450, 2800), C = s.chart;
      c.fillStyle = `rgba(3,9,8,${0.9 * eo(prog(t, 0, 220)) * out})`; c.fillRect(0, 0, vw, vh);
      // 終端機網格與掃描線
      c.save(); c.globalAlpha = out * 0.5 * eo(prog(t, 0, 300));
      c.strokeStyle = 'rgba(90,255,170,.08)'; c.lineWidth = 1;
      for (let x = C.x0; x <= C.x1 + 1; x += (C.x1 - C.x0) / 12) { c.beginPath(); c.moveTo(x, C.y0); c.lineTo(x, C.y1); c.stroke(); }
      for (let y = C.y0; y <= C.y1 + 1; y += (C.y1 - C.y0) / 8) { c.beginPath(); c.moveTo(C.x0, y); c.lineTo(C.x1, y); c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,.25)'; for (let y = (t * 0.05) % 4; y < vh; y += 4) c.fillRect(0, y, vw, 1);
      c.restore();
      // 跑馬燈（上下）
      const tapeA = out * prog(t, 0, 250);
      [[vh * 0.05, 1], [vh * 0.95, -1]].forEach(([y, dir]) => {
        c.save(); c.globalAlpha = tapeA; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, y - vh * 0.025, vw, vh * 0.05);
        c.font = `700 ${Math.round(vh * 0.022)}px Consolas, monospace`; c.textBaseline = 'middle';
        let x = ((dir * t * 0.25) % (vw * 2)) - (dir > 0 ? vw * 2 : 0);
        for (let rep = 0; rep < 3; rep++) s.tape.forEach(k => { c.fillStyle = k.up ? '#ff5a64' : '#3fd884'; c.fillText(k.txt + '    ', x, y); x += c.measureText(k.txt + '    ').width; });
        c.restore();
      });
      const py = v => lerp(C.y1, C.y0, (v - s.pmin) / (s.pmax - s.pmin));
      const n = s.candles.length, cw = (C.x1 - C.x0) / n;
      // K 線：逐根長出，上漲（紅）一路衝到漲停
      const shown = Math.min(s.peak + 1, Math.floor(prog(t, 150, 1150) * (s.peak + 1)) + (t > 150 ? 1 : 0));
      const crash = prog(t, 1350, 1650), shownAll = shown + Math.floor(crash * (n - s.peak - 1));
      const ka = out * (1 - prog(t, 1750, 2000));
      if (ka > 0) {
        c.save(); c.globalAlpha = ka;
        for (let i = 0; i < Math.min(n, shownAll); i++) {
          const k = s.candles[i], x = C.x0 + cw * (i + 0.5), up = k.c >= k.o, col = up ? '#ff4a58' : '#2fe07a';
          c.strokeStyle = col; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = i === shownAll - 1 ? 18 : 6; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(x, py(k.h)); c.lineTo(x, py(k.l)); c.stroke();
          const yt = py(Math.max(k.o, k.c)), yb = py(Math.min(k.o, k.c));
          c.fillRect(x - cw * 0.32, yt, cw * 0.64, Math.max(2, yb - yt));
        }
        c.shadowBlur = 0;
        // 收盤價折線
        c.strokeStyle = 'rgba(255,230,150,.75)'; c.lineWidth = 2; c.beginPath();
        for (let i = 0; i < Math.min(n, shownAll); i++) { const x = C.x0 + cw * (i + 0.5), y = py(s.candles[i].c); i ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke(); c.restore();
        // 現價
        const last = s.candles[Math.max(0, Math.min(n, shownAll) - 1)], chg = (last.c - 100) / 100 * 100, upNow = chg >= 0;
        c.save(); c.globalAlpha = ka; c.font = `800 ${Math.round(vh * 0.05)}px Consolas, monospace`; c.textAlign = 'right'; c.textBaseline = 'middle';
        c.fillStyle = upNow ? '#ff5a64' : '#3fd884'; c.shadowColor = c.fillStyle; c.shadowBlur = 14;
        c.fillText(`${last.c.toFixed(2)} ${upNow ? '▲' : '▼'}${Math.abs(chg).toFixed(1)}%`, C.x1, C.y0 - vh * 0.03); c.restore();
      }
      // 漲停 → 對沖
      const lu = prog(t, 1100, 1180) * (1 - prog(t, 1380, 1480)) * out;
      if (lu > 0) {
        const x = C.x0 + cw * (s.peak + 0.5), y = py(s.candles[s.peak].h);
        c.save(); c.globalAlpha = lu; c.translate(x - vh * 0.06, y + vh * 0.09); c.scale(lerp(1.6, 1, eo(prog(t, 1100, 1200))), lerp(1.6, 1, eo(prog(t, 1100, 1200))));
        c.fillStyle = '#e8323f'; roundRect(c, -vh * 0.11, -vh * 0.03, vh * 0.22, vh * 0.06, 6); c.fill();
        c.fillStyle = '#fff'; c.font = `900 ${Math.round(vh * 0.032)}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('漲停 LIMIT UP', 0, 1); c.restore();
      }
      flash(c, s, '#3fd884', 0.25 * bump(t, 1380, 160));
      // 立繪（左）與標題（右）
      const ap = eo(prog(t, 60, 560)), aout = eio(prog(t, 1300, 1650));
      drawArt(c, s.A, lerp(-vw * 0.12, vw * 0.22, ap) - aout * vw * 0.35, vh * 0.4, ap * (1 - aout) * out * 0.95);
      const ta = (1 - prog(t, 1350, 1600)) * out;
      if (ta > 0) {
        label(c, '戈登 ─ 平衡・時間織機', vw * 0.68, vh * 0.62, vh * 0.026, '#f0d898', ta * prog(t, 150, 400), 'center', SANS, 6);
        title(c, '股票排山倒海', vw * 0.68, vh * 0.72, vh * 0.1, { t, start: 230, per: 60, align: 'center', alpha: ta, glow: 'rgba(255,200,90,.7)', fill: { grad: [[0, '#fff6d0'], [0.5, '#f0c050'], [1, '#9a6a10']] } });
      }
      quote(c, s, "Market's open.", vw * 0.06, vh * 0.88, t, 280, 1350, { fill: '#fff4d0', glow: 'rgba(255,200,90,.6)' });
      // 排山倒海：K 線組成的巨浪由左向右壓過敵人
      const wp = eio(prog(t, 1500, 2000)), wa = out * prog(t, 1500, 1560) * (1 - prog(t, 2050, 2350));
      if (wa > 0) {
        const front = lerp(-vw * 0.3, vw * 1.3, wp);
        c.save(); c.globalAlpha = wa;
        s.wall.forEach(b => {
          const x = front - b.u * vw * 0.7; if (x < -40 || x > vw + 40) return;
          const env = Math.sin(Math.min(1, b.u * 1.6) * Math.PI) * 0.9 + 0.1, h = vh * 0.85 * env * b.h;
          const col = b.up ? '#ff4a58' : '#2fe07a';
          c.fillStyle = col; c.shadowColor = '#ffd36a'; c.shadowBlur = 16; c.fillRect(x - b.w / 2, vh - h, b.w, h);
          c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x - 1, vh - h - 18, 2, 18);
        });
        c.restore();
        s.tg.forEach(p => { if (front > p.x) glowDot(c, p.x, p.y, vh * 0.22, 'rgba(255,215,110,.9)', wa * (1 - prog(front - p.x, 0, vw * 0.4))); });
      }
      // 數字雨
      if (t > 1700) s.digits.forEach(d => {
        const dt = (t - 1700 - d.d) / 1000; if (dt <= 0) return;
        c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.2) * out; c.fillStyle = d.txt[0] === '-' ? '#3fd884' : '#ff5a64';
        c.font = `700 ${Math.round(vh * 0.022)}px Consolas, monospace`; c.fillText(d.txt, d.x, d.y + d.v * dt); c.restore();
      });
      // 對沖印章
      if (t >= 1950) {
        const p = prog(t, 1950, 2040), k = lerp(2.6, 1, eo(p)), a = Math.min(1, p * 3) * out;
        c.save(); c.globalAlpha = a; c.translate(m.x, m.y); c.rotate(0.14); c.scale(k, k);
        c.strokeStyle = '#ffd36a'; c.fillStyle = '#ffd36a'; c.shadowColor = 'rgba(255,211,106,.8)'; c.shadowBlur = 12; c.lineWidth = 5;
        roundRect(c, -100, -44, 200, 88, 10); c.stroke();
        c.font = `900 46px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('對沖', 0, -4);
        c.font = `800 14px ${SANS}`; c.fillText('H E D G E D', 0, 30); c.restore();
      }
      quote(c, s, 'Margin call.', vw * 0.94, vh * 0.14, t, 2000, 2600, { align: 'right', fill: '#ffffff', glow: 'rgba(255,211,106,.7)', dx: -30 });
      vignette(c, s, 'rgba(0,6,4,.92)', 0.7 * out);
    },
    shake: [[1380, 160, 8], [1600, 420, 14], [1960, 260, 18]],
  };

  /* ================= 馬克「盈科後進」 =================
   * 實習筆記翻頁（觀察、學習、實戰）→ 鋼筆在畫面上畫出一道分岔的水渠，通往每一個敵人 → 水沿著渠道奔流 → 在敵人身上湧起浪花 → 「實戰演練」印章 */
  const MARK = {
    setup(s) {
      const R = s.R, vw = s.vw, vh = s.vh;
      s.A = prepArt(s, vh * 1.3, 'rgba(120,190,255,.45)');
      // 四個逐級下降的石窪（科）：水要先把每一窪填滿，才會往下一窪流
      const n = 4, x0 = vw * 0.1, x1 = vw * 0.62, bw = (x1 - x0) / n * 0.78;
      s.pits = Array.from({ length: n }, (_, i) => {
        const cx = x0 + (x1 - x0) * (i + 0.5) / n, top = vh * (0.64 + i * 0.045);
        return { cx, top, w: bw, d: vh * 0.07, t0: 820 + i * 200, t1: 1000 + i * 200 };
      });
      const lastP = s.pits[n - 1], hub = { x: lastP.cx + lastP.w * 0.55, y: lastP.top + 4 };
      const curve = (a, b, bend) => Array.from({ length: 30 }, (_, i) => { const u = i / 29, v = 1 - u, cx = (a.x + b.x) / 2 + bend, cy = Math.max(a.y, b.y) + vh * 0.04; return { x: v * v * a.x + 2 * v * u * cx + u * u * b.x, y: v * v * a.y + 2 * v * u * cy + u * u * b.y }; });
      s.branches = s.tg.map((p, i) => curve(hub, { x: p.x, y: p.y + 20 }, (i - (s.tg.length - 1) / 2) * 40));
      s.drops = Array.from({ length: 60 }, () => ({ b: Math.floor(R() * s.tg.length), a: -Math.PI / 2 + (R() - 0.5) * 2.2, v: 220 + R() * 520, r: 2 + R() * 4, d: R() * 160 }));
      s.foam = s.tg.map(() => Array.from({ length: 7 }, () => ({ dx: (R() - 0.5) * 120, h: 60 + R() * 90, w: 30 + R() * 40 })));
    },
    draw(c, t, s) {
      const { vw, vh } = s, out = 1 - prog(t, 2450, 2800);
      c.fillStyle = `rgba(4,12,24,${0.9 * eo(prog(t, 0, 220)) * out})`; c.fillRect(0, 0, vw, vh);
      glowDot(c, vw * 0.5, vh * 0.55, Math.max(vw, vh) * 0.6, 'rgba(60,140,230,.28)', out);
      // 立繪（左）
      const ap = eo(prog(t, 60, 600)), aout = eio(prog(t, 1300, 1650));
      drawArt(c, s.A, lerp(-vw * 0.12, vw * 0.16, ap) - aout * vw * 0.3, vh * 0.3, ap * (1 - aout) * out * 0.9);
      // 標題（右）
      const ta = (1 - prog(t, 1350, 1600)) * out;
      if (ta > 0) {
        label(c, '馬克 ─ 布魯克林警署第七分局', vw * 0.73, vh * 0.26, vh * 0.024, '#9fd0ff', ta * prog(t, 150, 400), 'center', SANS, 5);
        title(c, '盈科後進', vw * 0.73, vh * 0.38, vh * 0.13, { t, start: 230, per: 85, align: 'center', alpha: ta, glow: 'rgba(79,168,255,.8)', fill: { grad: [[0, '#ffffff'], [0.55, '#bfe6ff'], [1, '#3f8fe0']] } });
        label(c, 'F I L L   E V E R Y   H O L L O W ,   T H E N   M O V E   O N', vw * 0.73, vh * 0.48, vh * 0.017, '#d9efff', ta * prog(t, 650, 900), 'center', SANS);
      }
      quote(c, s, 'One step at a time.', vw * 0.06, vh * 0.16, t, 300, 1400, { fill: '#e6f4ff', glow: 'rgba(79,168,255,.6)' });
      // 石窪：逐一注滿 → 溢出流向下一窪
      const pa = out * prog(t, 500, 750) * (1 - prog(t, 2250, 2550));
      if (pa > 0) {
        c.save(); c.globalAlpha = pa;
        s.pits.forEach((p, i) => {
          const L = p.cx - p.w / 2, Rr = p.cx + p.w / 2, B = p.top + p.d;
          const hollow = () => { c.beginPath(); c.moveTo(L, p.top); c.quadraticCurveTo(L + p.w * 0.08, B, p.cx, B); c.quadraticCurveTo(Rr - p.w * 0.08, B, Rr, p.top); c.closePath(); };
          // 石頭邊緣
          c.lineWidth = 8; c.strokeStyle = '#2b3f5c'; hollow(); c.stroke();
          c.lineWidth = 2; c.strokeStyle = 'rgba(190,220,255,.5)'; hollow(); c.stroke();
          c.fillStyle = 'rgba(10,22,40,.9)'; hollow(); c.fill();
          // 水位
          const f = eio(prog(t, p.t0, p.t1));
          if (f > 0) {
            c.save(); hollow(); c.clip();
            const lv = B - (B - p.top) * f, wv = Math.sin(t * 0.012 + i) * 3 * (1 - f * 0.5);
            c.fillStyle = '#3f8fe0'; c.shadowColor = '#7fc4ff'; c.shadowBlur = 14;
            c.beginPath(); c.moveTo(L - 4, lv + wv); c.quadraticCurveTo(p.cx, lv - wv * 2, Rr + 4, lv + wv); c.lineTo(Rr + 4, B + 4); c.lineTo(L - 4, B + 4); c.closePath(); c.fill();
            c.shadowBlur = 0; c.strokeStyle = 'rgba(230,248,255,.85)'; c.lineWidth = 2; c.beginPath(); c.moveTo(L, lv + wv); c.quadraticCurveTo(p.cx, lv - wv * 2, Rr, lv + wv); c.stroke();
            c.restore();
          }
          // 注水的水柱：第一窪來自上方，其餘來自上一窪溢出的水
          const pourA = prog(t, p.t0 - 60, p.t0) * (1 - prog(t, p.t1 + 60, p.t1 + 180));
          if (pourA > 0) {
            const from = i === 0 ? { x: p.cx - p.w * 0.35, y: vh * 0.5 } : { x: s.pits[i - 1].cx + s.pits[i - 1].w / 2, y: s.pits[i - 1].top };
            c.save(); c.globalAlpha = pa * pourA; c.strokeStyle = '#7fc4ff'; c.lineWidth = 7; c.lineCap = 'round'; c.shadowColor = '#bfe6ff'; c.shadowBlur = 10;
            c.beginPath(); c.moveTo(from.x, from.y); c.quadraticCurveTo(from.x + 30, from.y + 10, p.cx - p.w * 0.25, p.top + p.d * 0.5); c.stroke();
            c.setLineDash([10, 14]); c.lineDashOffset = -t * 0.5; c.strokeStyle = 'rgba(235,248,255,.9)'; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
            c.restore();
          }
          // 注滿：浮出「盈」字與漣漪
          const done = prog(t, p.t1, p.t1 + 260);
          if (done > 0) {
            c.save(); c.globalAlpha = pa * (1 - prog(t, p.t1 + 500, p.t1 + 800)); c.strokeStyle = '#bfe6ff'; c.lineWidth = 3 * (1 - done) + 1;
            c.beginPath(); c.ellipse(p.cx, p.top, p.w * (0.5 + done * 0.5), 10 + done * 14, 0, 0, TAU); c.stroke(); c.restore();
            title(c, '盈', p.cx, p.top - vh * 0.06 - done * vh * 0.02, vh * 0.05, { t, start: p.t1, per: 0, align: 'center', alpha: pa * (1 - prog(t, 2000, 2300)), glow: 'rgba(79,168,255,.9)', fill: '#e6f4ff' });
          }
        });
        c.restore();
      }
      // 最後一窪滿溢：沿渠道分流，衝向每個敵人
      const pathTo = (pts, p) => { const n = Math.max(2, Math.floor(pts.length * p)); c.beginPath(); for (let i = 0; i < n; i++) i ? c.lineTo(pts[i].x, pts[i].y) : c.moveTo(pts[i].x, pts[i].y); };
      const fb = prog(t, 1640, 1850), ca = out * (1 - prog(t, 2250, 2500));
      if (fb > 0 && ca > 0) {
        c.save(); c.globalAlpha = ca; c.lineCap = 'round'; c.lineJoin = 'round';
        s.branches.forEach(b => {
          c.strokeStyle = '#4fa8ff'; c.lineWidth = 16; c.shadowColor = '#7fc4ff'; c.shadowBlur = 18; pathTo(b, eo(fb)); c.stroke(); c.shadowBlur = 0;
          c.strokeStyle = 'rgba(225,245,255,.9)'; c.lineWidth = 4; c.setLineDash([18, 22]); c.lineDashOffset = -t * 0.5; pathTo(b, eo(fb)); c.stroke(); c.setLineDash([]);
        });
        c.restore();
      }
      // 浪花：水抵達每個敵人時湧起
      if (t > 1850) s.tg.forEach((p, i) => {
        const wp = eo(prog(t, 1850 + i * 40, 2150 + i * 40)), fa = (1 - prog(t, 2250, 2600)) * out;
        if (fa <= 0) return;
        s.foam[i].forEach(f => {
          const h = f.h * wp * (1 - 0.4 * prog(t, 2250, 2600));
          c.save(); c.globalAlpha = fa; c.fillStyle = 'rgba(120,195,255,.75)'; c.beginPath(); c.moveTo(p.x + f.dx - f.w / 2, p.y + 40); c.quadraticCurveTo(p.x + f.dx, p.y + 40 - h * 2, p.x + f.dx + f.w / 2, p.y + 40); c.closePath(); c.fill();
          c.fillStyle = 'rgba(235,248,255,.9)'; c.beginPath(); c.arc(p.x + f.dx, p.y + 40 - h, 5 + f.w * 0.1, 0, TAU); c.fill(); c.restore();
        });
        const rp = eo(prog(t, 1900 + i * 40, 2400 + i * 40));
        c.save(); c.globalAlpha = (1 - rp) * out; c.strokeStyle = '#bfe6ff'; c.lineWidth = 6 * (1 - rp) + 1; c.beginPath(); c.ellipse(p.x, p.y + 40, 40 + rp * 180, 14 + rp * 60, 0, 0, TAU); c.stroke(); c.restore();
      });
      if (t > 1850) s.drops.forEach(d => {
        const p = s.tg[d.b], dt = (t - 1850 - d.d) / 1000; if (!p || dt <= 0) return;
        const x = p.x + Math.cos(d.a) * d.v * dt, y = p.y + 30 + Math.sin(d.a) * d.v * dt + 900 * dt * dt;
        c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.4) * out; c.fillStyle = '#cfeeff'; c.beginPath(); c.arc(x, y, d.r, 0, TAU); c.fill(); c.restore();
      });
      flash(c, s, '#dff2ff', 0.55 * bump(t, 1870, 220));
      // 實戰演練印章
      if (t >= 2120) {
        const p = prog(t, 2120, 2200), k = lerp(2.4, 1, eo(p)), a = Math.min(1, p * 3) * out;
        c.save(); c.globalAlpha = a; c.translate(vw * 0.78, vh * 0.72); c.rotate(-0.16); c.scale(k, k);
        c.strokeStyle = '#3f8fe0'; c.fillStyle = '#3f8fe0'; c.shadowColor = 'rgba(79,168,255,.7)'; c.shadowBlur = 10; c.lineWidth = 5;
        roundRect(c, -110, -40, 220, 80, 10); c.stroke(); c.font = `900 40px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('實戰演練', 0, 2); c.restore();
      }
      quote(c, s, 'Fill, then flow on.', vw * 0.94, vh * 0.12, t, 2000, 2650, { align: 'right', fill: '#ffffff', glow: 'rgba(79,168,255,.7)', dx: -30 });
      vignette(c, s, 'rgba(0,6,16,.92)', 0.7 * out);
    },
    shake: [[1000, 100, 3], [1200, 100, 3], [1400, 100, 4], [1600, 120, 5], [1870, 320, 16], [1950, 200, 8]],
  };

  /* ================= 米勒「願你安息，願我銘記」 ================= */
  /** 黑傘：open 0（收起）→ 1（張開），從上方俯視略帶透視 */
  function umbrella(c, x, y, r, open, rot, alpha) {
    if (alpha <= 0 || open <= 0) return;
    const n = 8, rr = r * (0.18 + 0.82 * open), sq = 0.42;
    c.save(); c.globalAlpha = alpha; c.translate(x, y);
    // 傘柄
    c.strokeStyle = '#a7a9c0'; c.lineWidth = Math.max(2, r * 0.025);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, r * 0.95); c.arc(-r * 0.06, r * 0.95, r * 0.06, 0, Math.PI); c.stroke();
    // 傘面
    const pts = Array.from({ length: n }, (_, i) => { const a = rot + i / n * TAU; return [Math.cos(a) * rr, Math.sin(a) * rr * sq - r * 0.12]; });
    c.shadowColor = 'rgba(150,140,220,.55)'; c.shadowBlur = r * 0.25;
    c.fillStyle = '#121219'; c.beginPath();
    pts.forEach((p, i) => { const q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; i ? 0 : c.moveTo(p[0], p[1]); c.quadraticCurveTo(mx * 0.86, my * 0.86 - r * 0.02, q[0], q[1]); });
    c.closePath(); c.fill(); c.shadowBlur = 0;
    // 骨架與蛛網般的銀線
    c.strokeStyle = 'rgba(200,200,225,.75)'; c.lineWidth = 1.4;
    pts.forEach(p => { c.beginPath(); c.moveTo(0, -r * 0.14); c.lineTo(p[0], p[1]); c.stroke(); });
    [0.45, 0.75].forEach(k => { c.beginPath(); pts.forEach((p, i) => { const q = pts[(i + 1) % n]; const a = [p[0] * k, p[1] * k + (1 - k) * -r * 0.14], b = [q[0] * k, q[1] * k + (1 - k) * -r * 0.14]; i ? c.lineTo(a[0], a[1]) : c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }); c.stroke(); });
    // 破碎的傘緣垂墜
    c.fillStyle = 'rgba(40,38,58,.9)';
    pts.forEach((p, i) => { const q = pts[(i + 1) % n]; for (let j = 0; j < 3; j++) { const u = (j + 0.5) / 3, px = lerp(p[0], q[0], u) * 0.95, py = lerp(p[1], q[1], u) * 0.95, h = r * (0.06 + ((i * 7 + j * 3) % 5) * 0.025) * open; c.beginPath(); c.moveTo(px - r * 0.04, py); c.lineTo(px, py + h); c.lineTo(px + r * 0.04, py); c.fill(); } });
    c.restore();
  }
  /** 花：kind 0 = 罌粟（紅）、1 = 白菊 */
  function flower(c, x, y, r, kind, rot, alpha) {
    if (alpha <= 0 || r <= 0.5) return;
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.rotate(rot);
    if (kind === 0) {
      c.fillStyle = '#c8203c'; if (r >= 7) { c.shadowColor = 'rgba(255,40,70,.6)'; c.shadowBlur = r * 0.6; }
      for (let i = 0; i < 5; i++) { c.save(); c.rotate(i / 5 * TAU); c.beginPath(); c.ellipse(0, -r * 0.55, r * 0.5, r * 0.6, 0, 0, TAU); c.fill(); c.restore(); }
      c.shadowBlur = 0; c.fillStyle = '#16121a'; c.beginPath(); c.arc(0, 0, r * 0.26, 0, TAU); c.fill();
    } else {
      c.fillStyle = '#f4f2f8'; if (r >= 7) { c.shadowColor = 'rgba(220,220,255,.7)'; c.shadowBlur = r * 0.5; }
      [[16, 1, 0], [12, 0.7, 0.2]].forEach(([n, k, o]) => { for (let i = 0; i < n; i++) { c.save(); c.rotate((i + o) / n * TAU); c.beginPath(); c.ellipse(0, -r * 0.55 * k, r * 0.12, r * 0.48 * k, 0, 0, TAU); c.fill(); c.restore(); } });
      c.shadowBlur = 0; c.fillStyle = '#d9d6a0'; c.beginPath(); c.arc(0, 0, r * 0.16, 0, TAU); c.fill();
    }
    c.restore();
  }
  /** 花的小圖（介面特效與葬禮花圈共用，和終結技動畫同一款罌粟與白菊）：kind 0 = 罌粟、1 = 白菊 */
  const flowerUrls = [];
  function flowerSprite(kind) {
    if (!flowerUrls[kind]) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 96;
      flower(cv.getContext('2d'), 48, 48, 36, kind, kind ? 0.12 : 0.3, 1);
      flowerUrls[kind] = cv.toDataURL();
    }
    return flowerUrls[kind];
  }
  const MILLER = {
    setup(s) {
      const R = s.R, vw = s.vw, vh = s.vh;
      s.A = prepArt(s, vh * 1.25, 'rgba(160,150,230,.4)', 'contrast(1.05)');
      s.rain = Array.from({ length: 140 }, () => ({ x: R() * vw * 1.3, o: R() * 2000, v: 1.6 + R() * 1.2, len: 30 + R() * 70, w: 0.6 + R() * 1.2 }));
      s.c0 = mid(s);
      s.uy = Math.max(vh * 0.24, s.c0.y - vh * 0.22);
      s.swirl = Array.from({ length: 46 }, (_, i) => ({ a: R() * TAU, r: 0.25 + R() * 0.75, v: 0.8 + R() * 1.6, k: i % 3 === 0 ? 1 : 0, s: 5 + R() * 9, ph: R() * TAU }));
      s.fall = s.tg.map(p => Array.from({ length: 9 }, () => ({ dx: (R() - 0.5) * 140, dy: -(40 + R() * 80), k: R() < 0.5 ? 0 : 1, s: 6 + R() * 10, rot: R() * TAU, d: R() * 220 })));
      const xs = s.tg.map(p => p.x).sort((a, b) => a - b), gap = xs.slice(1).reduce((m, x, i) => Math.min(m, x - xs[i]), Infinity);
      s.wr = Math.max(40, Math.min(90, gap * 0.44));   // 花環半徑：不和隔壁的敵人重疊
      s.wreath = s.tg.map(() => Array.from({ length: 12 }, (_, i) => ({ a: i / 12 * TAU, k: i % 2, s: 8 + R() * 5 })));
    },
    draw(c, t, s) {
      const { vw, vh, c0 } = s, out = 1 - prog(t, 2450, 2800);
      c.fillStyle = `rgba(8,8,16,${0.94 * eo(prog(t, 0, 240)) * out})`; c.fillRect(0, 0, vw, vh);
      glowDot(c, vw * 0.5, vh * 0.15, Math.max(vw, vh) * 0.7, 'rgba(110,100,180,.22)', out);
      // 雨：斜斜落下，越到後面越密
      const ra = out * (0.25 + 0.45 * prog(t, 100, 900) + 0.3 * bump(t, 1850, 500));
      c.save(); c.strokeStyle = 'rgba(190,195,235,.55)';
      s.rain.forEach(d => {
        const span = vh + d.len, y = ((t * d.v + d.o) % span) - d.len, x = d.x - y * 0.22;
        c.globalAlpha = ra; c.lineWidth = d.w; c.beginPath(); c.moveTo(x, y); c.lineTo(x - d.len * 0.22, y + d.len); c.stroke();
      });
      c.restore();
      // 立繪：撐傘走入雨中
      const ap = eo(prog(t, 60, 650)), aout = eio(prog(t, 1350, 1700));
      drawArt(c, s.A, lerp(-vw * 0.1, vw * 0.2, ap) - aout * vw * 0.3, vh * 0.3, ap * (1 - aout) * out * 0.95);
      // 標題（右）
      const ta = (1 - prog(t, 1400, 1650)) * out;
      if (ta > 0) {
        label(c, '米勒 ─ 第九街', vw * 0.72, vh * 0.3, vh * 0.024, '#b9bde8', ta * prog(t, 150, 400), 'center', SANS, 8);
        title(c, '願你安息', vw * 0.72, vh * 0.41, vh * 0.1, { t, start: 230, per: 75, align: 'center', alpha: ta, glow: 'rgba(160,150,240,.7)', fill: { grad: [[0, '#ffffff'], [0.6, '#d4d6f6'], [1, '#8e93c8']] }, spacing: vh * 0.01 });
        title(c, '願我銘記', vw * 0.72, vh * 0.53, vh * 0.1, { t, start: 560, per: 75, align: 'center', alpha: ta, glow: 'rgba(200,40,70,.6)', fill: { grad: [[0, '#ffffff'], [0.6, '#f1d4dc'], [1, '#b8324e']] }, spacing: vh * 0.01 });
        label(c, 'R E S T   I N   P E A C E', vw * 0.72, vh * 0.62, vh * 0.02, '#dcdcf2', ta * prog(t, 850, 1100), 'center', SANS);
      }
      quote(c, s, 'Poppies, or chrysanthemums?', vw * 0.05, vh * 0.88, t, 300, 1450, { fill: '#e8e6f6', glow: 'rgba(150,140,230,.6)' });
      // 黑傘：在敵人上方張開、旋轉，花瓣在傘下盤旋；1550 起收傘
      const uo = eback(prog(t, 900, 1250)) * (1 - eio(prog(t, 1550, 1760)));
      const ur = Math.min(vw * 0.27, vh * 0.34), rot = t * 0.0011;
      const ua = out * prog(t, 900, 1000) * (1 - prog(t, 1700, 1800));
      if (ua > 0) {
        glowDot(c, c0.x, s.uy, ur * 1.3, 'rgba(120,110,200,.35)', ua);
        s.swirl.forEach(p => {
          const a = p.a + t * 0.002 * p.v, rr = ur * p.r * (0.4 + 0.6 * uo);
          const x = c0.x + Math.cos(a) * rr, y = s.uy + ur * 0.15 + Math.sin(a) * rr * 0.42 + Math.sin(t * 0.004 + p.ph) * 10;
          flower(c, x, y, p.s * 1.1, p.k, a * 2, ua * 0.9);
        });
        umbrella(c, c0.x, s.uy, ur, uo, rot, ua);
      }
      // 收傘的瞬間：花雨落向每個敵人
      const fa = out * (1 - prog(t, 2350, 2600));
      if (t > 1600 && fa > 0) s.tg.forEach((p, i) => s.fall[i].forEach(f => {
        const q = eo(prog(t, 1600 + f.d, 1900 + f.d));
        if (q <= 0) return;
        const x = lerp(c0.x + f.dx * 0.3, p.x + f.dx * 0.6, q), y = lerp(s.uy, p.y + f.dy * 0.3, q);
        flower(c, x, y, f.s, f.k, f.rot + t * 0.004, fa * (q < 1 ? 1 : 1 - prog(t, 2100 + f.d * 0.5, 2400)));
      }));
      flash(c, s, '#e6e2ff', 0.5 * bump(t, 1800, 200));
      // 葬禮：地上的法陣與花環，頭上浮出悲悼的階段
      if (t > 1780) s.tg.forEach((p, i) => {
        const g = eo(prog(t, 1780 + i * 50, 2150 + i * 50)), a = fa;
        if (a <= 0) return;
        c.save(); c.globalAlpha = a * 0.9; c.translate(p.x, p.y + 50);
        c.strokeStyle = '#9fa8e0'; c.shadowColor = 'rgba(159,168,224,.9)'; c.shadowBlur = 14; c.lineWidth = 2.5;
        c.beginPath(); c.ellipse(0, 0, s.wr * g, s.wr * 0.31 * g, 0, 0, TAU); c.stroke();
        c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, 0, s.wr * 0.78 * g, s.wr * 0.23 * g, 0, 0, TAU); c.stroke();
        c.shadowBlur = 0; c.restore();
        s.wreath[i].forEach(w => flower(c, p.x + Math.cos(w.a + t * 0.0006) * s.wr * 0.89 * g, p.y + 50 + Math.sin(w.a + t * 0.0006) * s.wr * 0.28 * g, w.s * g * Math.min(1, s.wr / 70), w.k, w.a, a * g));
        // 悲悼：Ⅰ → Ⅱ → Ⅲ
        const st = t < 1980 ? 'Ⅰ' : t < 2140 ? 'Ⅱ' : 'Ⅲ', ma = a * prog(t, 1820 + i * 50, 1950 + i * 50);
        if (ma > 0) { c.save(); c.globalAlpha = ma; c.font = `900 ${vh * 0.045}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = 'rgba(160,150,240,.9)'; c.shadowBlur = 14; c.fillStyle = '#eceaff'; c.fillText(st, p.x, p.y - 90 - prog(t, 1820, 2400) * 20); c.restore(); }
      });
      // 訃告印章：黑框白底的「葬禮」
      if (t >= 2080) {
        const p = prog(t, 2080, 2170), k = lerp(2.4, 1, eo(p)), a = Math.min(1, p * 3) * out;
        c.save(); c.globalAlpha = a; c.translate(vw * 0.78, vh * 0.66); c.rotate(-0.08); c.scale(k, k);
        c.fillStyle = 'rgba(240,238,248,.94)'; c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 18; roundRect(c, -120, -56, 240, 112, 4); c.fill(); c.shadowBlur = 0;
        c.strokeStyle = '#14141c'; c.lineWidth = 7; roundRect(c, -108, -44, 216, 88, 2); c.stroke();
        c.fillStyle = '#14141c'; c.font = `900 46px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('葬　禮', 0, -4);
        c.font = `600 12px ${SANS}`; c.fillStyle = '#5a5a70'; c.fillText('I N   M E M O R I A M', 0, 30);
        c.restore();
      }
      quote(c, s, 'And I shall remember.', vw * 0.94, vh * 0.86, t, 2000, 2650, { align: 'right', fill: '#ffffff', glow: 'rgba(200,40,70,.6)', dx: -30 });
      vignette(c, s, 'rgba(4,4,10,.94)', 0.75 * out);
    },
    shake: [[1800, 300, 12], [2080, 160, 6]],
  };

  /* ================= O.T.G.「神不在的滿月」 ================= */
  function godlessMoon(c, x, y, r, red, eclipse, alpha) {
    if (r <= 0 || alpha <= 0) return;
    c.save(); c.globalAlpha = Math.min(1, alpha);
    glowDot(c, x, y, r * 2.2, red > 0.4 ? 'rgba(180,16,43,.3)' : 'rgba(207,208,236,.18)', 1);
    const g = c.createRadialGradient(x - r * .3, y - r * .4, r * .06, x, y, r);
    g.addColorStop(0, `rgb(245,${Math.round(235 - red * 120)},${Math.round(227 - red * 118)})`);
    g.addColorStop(.7, `rgb(${Math.round(180 + red * 30)},${Math.round(179 - red * 137)},${Math.round(192 - red * 133)})`);
    g.addColorStop(1, red > .5 ? '#6e1027' : '#73788e');
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill();
    c.save(); c.clip();
    // Irregular lunar maria and small rim-lit craters, rather than a dotted disc.
    for (const [dx, dy, rr] of [[-.33, -.23, .28], [.17, -.43, .21], [.22, .13, .24], [-.23, .36, .18], [.55, -.19, .12]]) {
      c.fillStyle = red > .5 ? '#4b0f2a30' : '#33364b2c'; c.beginPath();
      for (let j = 0; j < 13; j++) { const a = j / 13 * TAU, d = rr * r * (.8 + .22 * Math.sin(j * 5.1 + dx * 40)); c.lineTo(x + dx * r + Math.cos(a) * d, y + dy * r + Math.sin(a) * d); }
      c.closePath(); c.fill();
    }
    for (let i = 0; i < 38; i++) {
      const a = i * 7.137, rr = Math.sqrt(((i * 17 + 11) % 41) / 41) * r * .98, cr = r * (.01 + (i % 5) * .007);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      c.fillStyle = red > .5 ? '#43122922' : '#33364c25'; c.beginPath(); c.ellipse(px, py, cr * 1.4, cr, a, 0, TAU); c.fill();
      c.strokeStyle = '#fff0d33b'; c.lineWidth = Math.max(1, r * .004); c.beginPath(); c.ellipse(px - cr * .1, py - cr * .12, cr * 1.4, cr, a, Math.PI, TAU); c.stroke();
    }
    if (eclipse > 0) {
      c.fillStyle = '#07040af5'; c.beginPath(); c.arc(x + r * (2.05 - 1.88 * eclipse), y - r * .08, r * 1.01, 0, TAU); c.fill();
    }
    c.restore();
    c.strokeStyle = red > .5 ? '#ff536b99' : '#e3ddfc77'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    c.restore();
  }
  function godlessChain(c, ax, ay, bx, by, sag, time, alpha, fracture) {
    if (alpha <= 0) return;
    const n = Math.min(62, Math.max(5, Math.ceil(Math.hypot(bx - ax, by - ay) / 21)));
    c.save(); c.globalAlpha = Math.min(1, alpha);
    for (let i = 0; i <= n; i++) {
      const u = i / n, broken = fracture * Math.max(0, 1 - Math.abs(u - .5) * 3);
      const x = lerp(ax, bx, u) + (u < .5 ? -1 : 1) * broken * 65;
      const y = lerp(ay, by, u) + Math.sin(u * Math.PI) * sag + Math.sin(i + time * .008) * 2 + broken * broken * 160;
      const ang = Math.atan2(by - ay + Math.cos(u * Math.PI) * sag * Math.PI, bx - ax);
      c.save(); c.globalAlpha = alpha * (1 - broken * .6); c.translate(x, y); c.rotate(ang + broken * (i % 2 ? 2 : -2));
      c.strokeStyle = '#09080d'; c.lineWidth = 6; c.beginPath(); c.ellipse(0, 0, 10, i % 2 ? 3 : 6, 0, 0, TAU); c.stroke();
      c.strokeStyle = i % 2 ? '#746571' : '#beb1bb'; c.lineWidth = 3; c.stroke();
      c.strokeStyle = '#fff0e16e'; c.lineWidth = 1; c.beginPath(); c.ellipse(-1, -1, 9, i % 2 ? 2 : 5, 0, Math.PI, TAU); c.stroke();
      c.restore();
    }
    c.restore();
  }
  function godlessSigil(c, x, y, r, time, alpha) {
    if (alpha <= 0 || r <= 0) return;
    c.save(); c.translate(x, y); c.globalAlpha = alpha; c.strokeStyle = '#e6385e'; c.lineWidth = 2;
    c.rotate(time * .00013);
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, r * (1 - i * .12), i * .9, i * .9 + Math.PI * 1.8); c.stroke(); }
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * r * .91, Math.sin(a) * r * .91); c.lineTo(Math.cos(a) * r * (i % 3 ? 1.02 : 1.12), Math.sin(a) * r * (i % 3 ? 1.02 : 1.12)); c.stroke(); }
    c.rotate(-time * .00013); c.strokeStyle = '#ffc2ca'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(0, -r * .62); c.lineTo(0, r * .65); c.moveTo(-r * .34, r * .3); c.lineTo(r * .34, r * .3); c.stroke(); c.restore();
  }
  const OTG = {
    impact: 1790,
    setup(s) {
      const R = s.R, vw = s.vw, vh = s.vh;
      s.A = prepArt(s, vh * 1.35, 'rgba(208,20,44,.5)', 'contrast(1.08)');
      s.moon = { x: vw * 0.68, y: vh * 0.3, r: Math.min(vw, vh) * 0.2 };
      // 從 O.T.G. 身上剝離的裂傷：血色的裂口飛向每個敵人
      s.src = { x: vw * 0.24, y: vh * 0.5 };
      s.rips = s.tg.flatMap((p, i) => Array.from({ length: 4 }, (_, j) => ({ p, i, d: 820 + j * 70 + i * 40, ox: (R() - 0.5) * 160, oy: (R() - 0.5) * 220, bend: (R() - 0.5) * 260 })));
      s.cross = s.tg.map(() => ({ r: (R() - 0.5) * 0.3 }));
      const xs = s.tg.map(p => p.x).sort((a, b) => a - b), gap = xs.slice(1).reduce((m, x, i) => Math.min(m, x - xs[i]), Infinity);
      s.xr = Math.max(28, Math.min(70, gap * 0.38));   // 原罪血痕的大小：不和隔壁的敵人重疊
      s.blood = Array.from({ length: 90 }, () => ({ b: Math.floor(R() * s.tg.length), a: R() * TAU, v: 200 + R() * 700, r: 2 + R() * 5, d: R() * 120 }));
      s.links = Array.from({ length: 26 }, () => ({ a: R() * TAU, v: 300 + R() * 600, rot: R() * TAU, vr: (R() - 0.5) * 14 }));
      s.stars = Array.from({ length: 70 }, () => ({ x: R() * vw, y: R() * vh * 0.6, r: 0.5 + R() * 1.4, tw: R() * TAU }));
      s.debris = Array.from({ length: 28 }, (_, i) => ({ x: R() * vw, y: vh * (.55 + R() * .45), r: 3 + R() * 12, a: R() * TAU, speed: 25 + R() * 60 }));
    },
    draw(c, t, s) {
      const { vw, vh, moon } = s, out = 1 - prog(t, 2450, 2800);
      c.fillStyle = `rgba(6,2,6,${0.93 * eo(prog(t, 0, 220)) * out})`; c.fillRect(0, 0, vw, vh);
      // Wet foundations, broken pillars, and the moon's reflection anchor the scene.
      c.save(); c.globalAlpha = out * prog(t, 0, 200);
      c.fillStyle = '#120a13';
      for (let i = 0; i < 9; i++) { const x = i * vw / 8; c.fillRect(x - 16, vh * (.5 + (i % 3) * .06), 30, vh * .5); }
      c.strokeStyle = '#76445733'; c.lineWidth = 1;
      for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(0, vh * (.72 + i * i * .009)); c.lineTo(vw, vh * (.72 + i * i * .009)); c.stroke(); }
      c.restore();
      for (let i = 0; i < 3; i++) godlessChain(c, -vw * .1, vh * (.2 + i * .26), vw * 1.1, vh * (.32 + i * .22), 80 * (1 - prog(t, 1000, 1500)), t, out * .55, prog(t, 1770, 2180));
      // 夜空與滿月：月亮從白轉為血色，1500 起被蝕
      s.stars.forEach(p => { c.save(); c.globalAlpha = out * (0.3 + 0.4 * Math.sin(t * 0.004 + p.tw)) * (1 - prog(t, 1500, 1800)); c.fillStyle = '#fff'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); c.restore(); });
      const mr = eo(prog(t, 40, 700)), red = prog(t, 1300, 1700), mo = out * mr;
      if (mo > 0) {
        const my = lerp(vh * 0.55, moon.y, mr);
        glowDot(c, moon.x, my, moon.r * 3.2, red > 0.5 ? 'rgba(200,20,40,.45)' : 'rgba(230,230,255,.35)', mo);
        c.save(); c.globalAlpha = mo;
        const g = c.createRadialGradient(moon.x - moon.r * 0.3, my - moon.r * 0.3, moon.r * 0.1, moon.x, my, moon.r);
        g.addColorStop(0, `rgb(${Math.round(lerp(250, 255, red))},${Math.round(lerp(248, 90, red))},${Math.round(lerp(240, 90, red))})`);
        g.addColorStop(1, `rgb(${Math.round(lerp(190, 150, red))},${Math.round(lerp(190, 20, red))},${Math.round(lerp(210, 35, red))})`);
        c.fillStyle = g; c.beginPath(); c.arc(moon.x, my, moon.r, 0, TAU); c.fill();
        c.save(); c.clip();   // 月面的陰影（月海）
        [[-0.35, -0.2, 0.32], [0.25, 0.1, 0.24], [-0.05, 0.45, 0.2], [0.45, -0.4, 0.14], [-0.6, 0.3, 0.12]].forEach(([dx, dy, rr]) => {
          const cx = moon.x + dx * moon.r, cy = my + dy * moon.r, g2 = c.createRadialGradient(cx, cy, 0, cx, cy, rr * moon.r);
          const col = `${Math.round(lerp(120, 90, red))},${Math.round(lerp(120, 10, red))},${Math.round(lerp(150, 20, red))}`;
          g2.addColorStop(0, `rgba(${col},.16)`); g2.addColorStop(0.7, `rgba(${col},.1)`); g2.addColorStop(1, `rgba(${col},0)`);
          c.fillStyle = g2; c.beginPath(); c.arc(cx, cy, rr * moon.r, 0, TAU); c.fill();
        });
        c.restore();
        // 月蝕：黑影掠過
        const ec = eio(prog(t, 1500, 1800));
        if (ec > 0) { c.save(); c.beginPath(); c.arc(moon.x, my, moon.r + 1, 0, TAU); c.clip(); c.fillStyle = 'rgba(8,0,4,.93)'; c.beginPath(); c.arc(moon.x + lerp(moon.r * 2.1, moon.r * 0.18, ec), my - moon.r * 0.05, moon.r * 1.02, 0, TAU); c.fill(); c.restore(); }
        // 月面的裂痕（神不在）
        const ck = prog(t, 1100, 1350);
        if (ck > 0) { c.strokeStyle = 'rgba(40,0,6,.85)'; c.lineWidth = 3; c.beginPath(); const pts = [[-0.8, -0.3], [-0.3, -0.1], [-0.1, 0.25], [0.35, 0.15], [0.7, 0.55]]; pts.slice(0, 1 + Math.ceil(ck * 4)).forEach(([x, y], i) => (i ? c.lineTo : c.moveTo).call(c, moon.x + x * moon.r, my + y * moon.r)); c.stroke(); }
        c.restore();
      }
      // A second, textured lunar disc keeps the close view detailed throughout the eclipse.
      godlessMoon(c, moon.x, lerp(vh * .55, moon.y, mr), moon.r * mr, red, eio(prog(t, 1500, 1800)), out * .85);
      // 立繪：從左下方仰角登場，身上纏著鎖鏈
      const ap = eo(prog(t, 60, 620)), aout = eio(prog(t, 1350, 1700));
      drawArt(c, s.A, lerp(-vw * 0.1, vw * 0.22, ap) - aout * vw * 0.3, lerp(vh * 0.32, vh * 0.2, ap), ap * (1 - aout) * out);
      // Pressure lifts rubble before the scars leave the body.
      s.debris.forEach((d, i) => {
        const lift = prog(t, 450, 1700), fall = prog(t, 1790, 2600);
        c.save(); c.globalAlpha = out * lift * .65; c.translate(d.x + Math.sin(i + t * .002) * 8 + fall * (d.x - vw / 2) * .2, d.y - lift * d.speed + fall * fall * vh * .3); c.rotate(d.a + t * .0006);
        c.fillStyle = i % 3 ? '#44313f' : '#a37b87'; c.beginPath(); c.moveTo(-d.r, d.r); c.lineTo(-d.r * .5, -d.r); c.lineTo(d.r, -d.r * .3); c.closePath(); c.fill(); c.restore();
      });
      godlessSigil(c, s.src.x, s.src.y, Math.min(vw, vh) * .13, t, prog(t, 500, 900) * (1 - prog(t, 1200, 1450)) * out * .7);
      // 標題（右）
      const ta = (1 - prog(t, 1300, 1550)) * out;
      if (ta > 0) {
        label(c, 'O.T.G. ─ 第九街', vw * 0.7, vh * 0.56, vh * 0.024, '#ff9a9a', ta * prog(t, 150, 400), 'center', SANS, 8);
        title(c, '神不在的滿月', vw * 0.7, vh * 0.66, vh * 0.1, { t, start: 230, per: 65, align: 'center', alpha: ta, glow: 'rgba(208,20,44,.8)', fill: { grad: [[0, '#ffffff'], [0.55, '#f2c8cc'], [1, '#b0142a']] } });
        label(c, 'O N L Y   T H E   G O D L E S S', vw * 0.7, vh * 0.75, vh * 0.02, '#f0d8da', ta * prog(t, 650, 900), 'center', SANS);
      }
      quote(c, s, 'No god is coming.', vw * 0.05, vh * 0.9, t, 300, 1400, { fill: '#ffe6e8', glow: 'rgba(208,20,44,.6)' });
      // 剝離：O.T.G. 身上的裂口一條條撕下，飛向敵人
      const tearA = prog(t, 700, 820) * (1 - prog(t, 1250, 1400)) * out;
      if (tearA > 0) for (let i = 0; i < 6; i++) blade(c, s.src.x - 60 + i * 22, s.src.y - 120 + i * 40, s.src.x + 40 + i * 18, s.src.y - 150 + i * 44, 7, `rgba(255,60,70,${tearA})`, '#ff2a3a');
      s.rips.forEach(r => {
        const p = eio(prog(t, r.d, r.d + 380)), a = out * (1 - prog(t, 1800, 1900));
        if (p <= 0 || a <= 0) return;
        const x0 = s.src.x + r.ox, y0 = s.src.y + r.oy, x1 = r.p.x, y1 = r.p.y;
        const x = lerp(x0, x1, p), y = lerp(y0, y1, p) - Math.sin(p * Math.PI) * r.bend * 0.6;
        const px = lerp(x0, x1, Math.max(0, p - 0.12)), py = lerp(y0, y1, Math.max(0, p - 0.12)) - Math.sin(Math.max(0, p - 0.12) * Math.PI) * r.bend * 0.6;
        blade(c, px, py, x, y, 6, '#ff3a48', '#d0142c');
      });
      // 原罪：每個敵人身上刻下交叉的血痕（逐漸加深）
      if (t > 1150) s.tg.forEach((p, i) => {
        const g = eo(prog(t, 1150 + i * 60, 1450 + i * 60)), a = out * (1 - prog(t, 1790, 1850));
        if (g <= 0 || a <= 0) return;
        godlessChain(c, moon.x, moon.y + moon.r * .7, p.x, p.y, 45 * (1 - g), t, a * g * .8, 0);
        godlessSigil(c, p.x, p.y, s.xr * 1.15 * g, t + i * 300, a * .6);
        c.save(); c.globalAlpha = a; c.translate(p.x, p.y); c.rotate(s.cross[i].r);
        const L = s.xr * g, pulse = 0.7 + 0.3 * Math.sin(t * 0.03);
        c.shadowColor = '#ff1a2a'; c.shadowBlur = 18 * pulse; c.strokeStyle = '#ff3040'; c.lineCap = 'round'; c.lineWidth = 7;
        c.beginPath(); c.moveTo(-L, -L); c.lineTo(L, L); c.moveTo(L, -L); c.lineTo(-L, L); c.stroke();
        c.shadowBlur = 0; c.strokeStyle = '#ffe0e0'; c.lineWidth = 2; c.stroke();
        c.restore();
        label(c, '原罪', p.x, p.y - 95, vh * 0.026, '#ff6a72', a * g, 'center', SERIF, 6);
      });
      // 引爆：所有裂口同時炸開
      flash(c, s, '#ff2a3a', 0.45 * bump(t, 1800, 160));
      flash(c, s, '#ffffff', 0.35 * bump(t, 1790, 90));
      if (t > 1790) s.tg.forEach((p, i) => {
        const e = eo(prog(t, 1790, 2150)), a = out * (1 - prog(t, 2150, 2500));
        if (a <= 0) return;
        glowDot(c, p.x, p.y, 60 + e * 200, 'rgba(255,40,50,.85)', a * (1 - e * 0.6));
        c.save(); c.globalAlpha = a * (1 - e); c.strokeStyle = '#ffd0d0'; c.lineWidth = 8 * (1 - e) + 1; c.beginPath(); c.arc(p.x, p.y, 30 + e * 190, 0, TAU); c.stroke(); c.restore();
        const X = s.xr * 2;
        [-1, 1].forEach(sx => { if (e < 0.6) blade(c, p.x - X * sx, p.y - X, p.x + X * sx, p.y + X, 22 * (1 - e / 0.6), '#fff2f2', '#ff1a2a'); });
      });
      if (t > 1790) {
        s.blood.forEach(d => {
          const p = s.tg[d.b], dt = (t - 1790 - d.d) / 1000; if (!p || dt <= 0) return;
          const x = p.x + Math.cos(d.a) * d.v * dt, y = p.y + Math.sin(d.a) * d.v * dt + 700 * dt * dt;
          c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.3) * out; c.fillStyle = d.r > 4 ? '#8a0a1c' : '#d0142c'; c.beginPath(); c.arc(x, y, d.r, 0, TAU); c.fill(); c.restore();
        });
        const m = s.main;
        s.links.forEach(l => {
          const dt = (t - 1790) / 1000; if (dt > 1) return;
          const x = m.x + Math.cos(l.a) * l.v * dt, y = m.y + Math.sin(l.a) * l.v * dt + 500 * dt * dt;
          c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.2) * out; c.translate(x, y); c.rotate(l.rot + l.vr * dt);
          c.strokeStyle = '#9a9aa8'; c.lineWidth = 3; roundRect(c, -9, -5, 18, 10, 5); c.stroke(); c.restore();
        });
      }
      // 瀆神之軀：倒置的十字裂開
      if (t >= 2050) {
        const p = prog(t, 2050, 2140), k = lerp(2.2, 1, eo(p)), a = Math.min(1, p * 3) * out;
        c.save(); c.globalAlpha = a; c.translate(vw * 0.24, vh * 0.42); c.scale(k, k);
        c.shadowColor = 'rgba(255,30,45,.9)'; c.shadowBlur = 24; c.fillStyle = '#d0142c';
        c.fillRect(-7, -70, 14, 150); c.fillRect(-40, 30, 80, 14);   // 倒置的十字
        c.shadowBlur = 0; c.fillStyle = '#ffffff'; c.font = `900 ${vh * 0.06}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('瀆神之軀', 0, 130);
        c.restore();
        drawArt(c, s.A, vw * .24, vh * .2, prog(t, 2050, 2250) * out * .75);
      }
      quote(c, s, 'Suffer with me.', vw * 0.94, vh * 0.9, t, 2000, 2650, { align: 'right', fill: '#ffffff', glow: 'rgba(208,20,44,.7)', dx: -30 });
      vignette(c, s, 'rgba(10,0,4,.95)', 0.75 * out);
    },
    shake: [[820, 120, 4], [1500, 200, 4], [1790, 420, 26], [1880, 220, 10]],
  };

  /* ================= 自律處刑官・「雷霆-09型」「全面通緝」（敵方終結技） ================= */
  const RAIDEN = {
    setup(s) {
      const R = s.R, vw = s.vw, vh = s.vh;
      s.A = prepArt(s, vh * 1.15, s.artKey === 'raiden_phase2' ? 'rgba(100,200,255,.55)' : 'rgba(255,205,60,.45)', 'contrast(1.06)');
      s.grid = Array.from({ length: 16 }, (_, i) => i / 15);
      s.posters = s.tg.map((p, i) => ({ p, rot: (R() - 0.5) * 0.18, d: 760 + i * 110, n: i === 0 ? 5 : 3 }));
      s.arcs = Array.from({ length: 8 }, () => ({ a: R() * TAU, r: 30 + R() * 60, sp: (R() - 0.5) * 0.02 }));
      s.bolts = s.tg.map(p => {   // 每道雷：從畫面上緣折線劈到目標
        const pts = [], n = 9;
        for (let i = 0; i <= n; i++) { const u = i / n; pts.push([lerp(p.x + (R() - 0.5) * 120, p.x, u) + (i && i < n ? (R() - 0.5) * 60 : 0), lerp(-20, p.y, u)]); }
        return pts;
      });
      s.sparks = Array.from({ length: 70 }, () => ({ b: Math.floor(R() * s.tg.length), a: R() * TAU, v: 250 + R() * 650, r: 1.5 + R() * 3, d: R() * 100 }));
    },
    draw(c, t, s) {
      const { vw, vh } = s, out = 1 - prog(t, 2450, 2800);
      c.fillStyle = `rgba(6,6,10,${0.9 * eo(prog(t, 0, 200)) * out})`; c.fillRect(0, 0, vw, vh);
      // 監視網格：黃色掃描線由上往下掃過
      const ga = out * prog(t, 80, 300) * (1 - prog(t, 1700, 1900));
      if (ga > 0) {
        c.save(); c.globalAlpha = ga * 0.35; c.strokeStyle = '#f5c518'; c.lineWidth = 1;
        s.grid.forEach(u => { c.beginPath(); c.moveTo(u * vw, 0); c.lineTo(u * vw, vh); c.stroke(); c.beginPath(); c.moveTo(0, u * vh); c.lineTo(vw, u * vh); c.stroke(); });
        const sy = ((t * 0.6) % (vh * 1.2)) - vh * 0.1;
        c.globalAlpha = ga; const g = c.createLinearGradient(0, sy - 60, 0, sy); g.addColorStop(0, 'rgba(245,197,24,0)'); g.addColorStop(1, 'rgba(245,197,24,.5)');
        c.fillStyle = g; c.fillRect(0, sy - 60, vw, 60); c.fillStyle = '#ffe27a'; c.fillRect(0, sy, vw, 2);
        c.restore();
        label(c, 'MUNICIPAL ENFORCEMENT UNIT 09  ─  STATUS: ACTIVE  ─  CASES OPEN: ∞', vw * 0.03, vh * 0.05, vh * 0.016, '#f5c518', ga, 'left', '"Courier New", monospace');
      }
      // 立繪（右）：從右側壓入，面罩亮起
      const ap = eo(prog(t, 60, 600)), aout = eio(prog(t, 1450, 1750));
      const ax = lerp(vw * 1.1, vw * 0.72, ap) + aout * vw * 0.3;
      drawArt(c, s.A, ax, vh * 0.2, ap * (1 - aout) * out);
      if (s.A && s.artKey !== 'raiden_kane') glowDot(c, ax, vh * 0.2, vh * 0.08, 'rgba(255,220,90,.9)', ap * (1 - aout) * out * (0.6 + 0.4 * Math.sin(t * 0.02)));
      // 標題（左）
      const ta = (1 - prog(t, 1350, 1600)) * out;
      if (ta > 0) {
        label(c, '自律處刑官・「雷霆-09型」', vw * 0.3, vh * 0.3, vh * 0.024, '#f5c518', ta * prog(t, 150, 400), 'center', SANS, 4);
        title(c, '全面通緝', vw * 0.3, vh * 0.42, vh * 0.14, { t, start: 220, per: 80, align: 'center', alpha: ta, glow: 'rgba(180,140,255,.8)', fill: { grad: [[0, '#ffffff'], [0.55, '#ffe9a0'], [1, '#f5c518']] } });
        label(c, 'F U L L - S C A L E   W A R R A N T', vw * 0.3, vh * 0.52, vh * 0.02, '#e8e0ff', ta * prog(t, 600, 850), 'center', SANS);
      }
      quote(c, s, 'All of you. Under arrest.', vw * 0.05, vh * 0.9, t, 300, 1400, { fill: '#fff4cc', glow: 'rgba(245,197,24,.6)' });
      // 鎖定：每個我方目標出現準星與「WANTED」懸賞單
      s.posters.forEach(o => {
        const p = o.p, lk = eo(prog(t, o.d, o.d + 260)), a = out * (1 - prog(t, 2250, 2500));
        if (lk <= 0 || a <= 0) return;
        const r = lerp(120, 46, lk), rot = t * 0.004;
        c.save(); c.globalAlpha = a; c.strokeStyle = '#ff3a4a'; c.lineWidth = 3; c.shadowColor = '#ff3a4a'; c.shadowBlur = 10;
        c.beginPath(); c.arc(p.x, p.y, r, rot, rot + Math.PI * 0.4); c.stroke(); c.beginPath(); c.arc(p.x, p.y, r, rot + Math.PI, rot + Math.PI * 1.4); c.stroke();
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => { c.beginPath(); c.moveTo(p.x + dx * (r + 6), p.y + dy * (r + 6)); c.lineTo(p.x + dx * (r + 22), p.y + dy * (r + 22)); c.stroke(); });
        c.shadowBlur = 0; c.restore();
        // 懸賞單（目標上方）
        const pp = eo(prog(t, o.d + 120, o.d + 380));
        if (pp <= 0) return;
        c.save(); c.globalAlpha = a * pp; c.translate(p.x, p.y - 110 + (1 - pp) * -30); c.rotate(o.rot); c.scale(lerp(1.6, 1, pp), lerp(1.6, 1, pp));
        c.fillStyle = '#efe0b8'; c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 10; c.fillRect(-44, -30, 88, 60); c.shadowBlur = 0;
        c.strokeStyle = '#4a2a0a'; c.lineWidth = 3; c.strokeRect(-40, -26, 80, 52);
        c.fillStyle = '#2a1a08'; c.font = `900 15px "Arial Black", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('WANTED', 0, -10);
        c.fillStyle = '#c8102a'; c.font = `900 18px ${SANS}`; c.fillText(`通緝 +${o.n}`, 0, 12);
        c.restore();
      });
      // 蓄電：電棍高舉，電弧纏繞
      const ch = prog(t, 1350, 1780) * out * (1 - prog(t, 1800, 1900));
      if (ch > 0) {
        const cx = vw * 0.5, cy = vh * 0.12;
        glowDot(c, cx, cy, vh * 0.25 * ch, 'rgba(200,170,255,.9)', ch);
        c.save(); c.strokeStyle = '#f2ecff'; c.lineWidth = 2; c.shadowColor = '#b48cff'; c.shadowBlur = 14; c.globalAlpha = ch;
        s.arcs.forEach(a => { const an = a.a + t * a.sp * 10, r = a.r * (0.5 + ch); c.beginPath(); c.moveTo(cx, cy); for (let i = 1; i <= 5; i++) c.lineTo(cx + Math.cos(an) * r * i / 5 + (Math.random() - 0.5) * 12, cy + Math.sin(an) * r * i / 5 + (Math.random() - 0.5) * 12); c.stroke(); });
        c.restore();
      }
      // 落雷：每個目標同時被劈中
      if (t > 1770 && t < 2150) {
        const fl = 1 - prog(t, 1770, 2150);
        s.bolts.forEach(pts => {
          [[14, 'rgba(180,140,255,.55)'], [5, '#f2ecff']].forEach(([w, col]) => {
            c.save(); c.globalAlpha = out * fl * (Math.random() < 0.85 ? 1 : 0.3); c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.shadowColor = '#b48cff'; c.shadowBlur = 20;
            c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); c.restore();
          });
        });
      }
      flash(c, s, '#f2ecff', 0.75 * bump(t, 1780, 140));
      if (t > 1780) s.tg.forEach((p, i) => {
        const e = eo(prog(t, 1780, 2200)), a = out * (1 - prog(t, 2200, 2500));
        glowDot(c, p.x, p.y, 40 + e * 150, 'rgba(200,170,255,.85)', a * (1 - e * 0.5));
        c.save(); c.globalAlpha = a * (1 - e); c.strokeStyle = '#f5c518'; c.lineWidth = 6 * (1 - e) + 1; c.beginPath(); c.arc(p.x, p.y, 20 + e * 140, 0, TAU); c.stroke(); c.restore();
      });
      if (t > 1780) s.sparks.forEach(d => {
        const p = s.tg[d.b], dt = (t - 1780 - d.d) / 1000; if (!p || dt <= 0) return;
        const x = p.x + Math.cos(d.a) * d.v * dt, y = p.y + Math.sin(d.a) * d.v * dt + 600 * dt * dt;
        c.save(); c.globalAlpha = Math.max(0, 1 - dt * 1.6) * out; c.fillStyle = d.r > 3 ? '#f5c518' : '#f2ecff'; c.beginPath(); c.arc(x, y, d.r, 0, TAU); c.fill(); c.restore();
      });
      quote(c, s, 'This case never closes.', vw * 0.94, vh * 0.1, t, 2000, 2650, { align: 'right', fill: '#ffffff', glow: 'rgba(180,140,255,.7)', dx: -30 });
      vignette(c, s, 'rgba(4,2,10,.95)', 0.7 * out);
    },
    shake: [[1380, 400, 3], [1780, 420, 24], [1880, 200, 8]],
  };

  const SCENES = { kane: KANE, longzhao: LONGZHAO, mocha: MOCHA, alan: ALAN, alexandra: ALEX, hanye: HANYE, gordon: GORDON, mark: MARK, miller: MILLER, otg: OTG, raiden: RAIDEN };

  /* ================= 播放控制 ================= */
  function play(key, o) {
    const sc = SCENES[key];
    if (!sc) return 0;
    stop();
    o = o || {};
    const vw = innerWidth, vh = innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    const root = document.createElement('div');
    root.className = 'ultcine';
    root.innerHTML = '<canvas></canvas><div class="uc-skip">點擊畫面跳過</div>';
    const cv = root.querySelector('canvas');
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    document.body.appendChild(root);
    const k = o.k || 1;
    const tg = (o.targets && o.targets.length) ? o.targets : [{ x: vw * 0.5, y: vh * 0.36 }];
    st = { key, artKey: o.artKey || key, sc, root, ctx: cv.getContext('2d'), vw, vh, dpr, k, tg, main: tg[0], art: Art.get(o.artKey || key) || Art.get(key), t0: performance.now(), onSkip: o.onSkip, R: rng(Date.now() & 0xffff) };
    commonSetup(st);
    sc.setup(st);
    root.addEventListener('click', ev => { ev.stopPropagation(); skip(); });
    st.keyH = ev => { if (ev.key === 'Escape' || ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); skip(); } };
    window.addEventListener('keydown', st.keyH, true);
    if (typeof Sound !== 'undefined') Sound.ult(key, k);
    st.raf = requestAnimationFrame(frame);
    const mine = st;   // 保險：分頁在背景時 requestAnimationFrame 會暫停，時間到就直接收掉
    st.guard = setTimeout(() => { if (st === mine) stop(); }, BASE * k + 600);
    return BASE * k;
  }
  function frame(now) {
    if (!st) return;
    const t = (now - st.t0) / st.k;
    if (t >= BASE) { stop(); return; }
    const c = st.ctx;
    c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
    c.clearRect(0, 0, st.vw, st.vh);
    const [sx, sy] = shakeOf(t, st.sc.shake || []);
    if (sx || sy) { c.translate(sx, sy); document.querySelector('.field')?.style.setProperty('transform', `translate(${sx * 0.5}px,${sy * 0.5}px)`); }
    else document.querySelector('.field')?.style.removeProperty('transform');
    st.sc.draw(c, t, st);
    st.raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    clearTimeout(st.guard);
    window.removeEventListener('keydown', st.keyH, true);
    st.root.remove();
    document.querySelector('.field')?.style.removeProperty('transform');
    st = null;
  }
  function skip() {
    const cb = st && st.onSkip;
    stop();
    if (cb) cb();
  }
  /** 除錯用：跳到指定時間點（毫秒，未縮放）並停住 */
  function seek(t) {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    clearTimeout(st.guard);   // 停住的畫面不要被保險計時器收掉
    st.t0 = performance.now() - t * st.k;
    const c = st.ctx;
    c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0); c.clearRect(0, 0, st.vw, st.vh);
    st.sc.draw(c, t, st);
  }

  const peak = sh => (sh && sh.length ? sh.reduce((a, b) => (b[2] > a[2] ? b : a))[0] : 0);   // 最強的一次震動 = 命中瞬間
  /** 命中瞬間（毫秒，未縮放）：場景可用 impact 指定，否則取最強的震動 */
  const impact = key => { const sc = SCENES[key]; return sc ? (sc.impact != null ? sc.impact : peak(sc.shake)) : 0; };
  return { play, stop, skip, seek, impact, flowerSprite, has: key => !!SCENES[key], get active() { return !!st; }, BASE,
    /** 共用繪圖工具（完整版演出 UltCine 也使用） */
    draw: { title, label, blade, glowDot, flash, vignette, roundRect, rng, SERIF, SANS, godlessMoon, godlessChain, godlessSigil } };
})();
