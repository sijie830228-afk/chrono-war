'use strict';
/* =========================================================
 * 時序之戰 — 抽卡演出
 * 1. 畫面上的文字四散、轉為金色發光（伴隨金色微塵）
 * 2. 文字匯聚成一本書（皮革封面、燙金、書頁厚度）
 * 3. 書本放大，書頁內是星空；視角墜入書中，直到書的邊緣消失
 * 4. 穿越後減速成緩慢旋轉的夜空，1000 顆星星留下真實的長曝光星軌
 *    每一抽在天幕的弧線上「凝聚」出一顆星球（程序生成表面、光照、大氣、光環）
 *    藍 3★／紫 4★／金 5★；全部出現後以金線連成星座
 * 5. 星塵凝聚成人類上半身的虛影，臉隱沒在陰影中只看得到帶笑的嘴角；
 *    書本的光照亮他的下巴，他將書舉過頭頂，視角與虛影重合 → 統整頁
 * ========================================================= */

const GachaAnim = (() => {
  const STAR_COUNT = 1000;
  const MAX_CHARS = 700;
  const GOLD = [255, 205, 110];
  const LIGHT = norm3([-0.78, -0.42, 0.42]);  // 星球的光源方向（左上側方，形成明暗交界線）
  const PAL = {
    3: { atm: [110, 170, 255], glow: [90, 150, 255], ring: null },
    4: { atm: [205, 150, 255], glow: [170, 110, 255], ring: [215, 190, 245] },
    5: { atm: [255, 212, 140], glow: [255, 190, 90], ring: [240, 218, 165] },
  };

  let st = null;

  /* ================= 工具 ================= */
  function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const easeInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const bell = (k, a, b) => { const x = prog(k, a, b); return Math.sin(x * Math.PI); };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  function parseColor(s) { const m = s.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [230, 232, 239]; }

  /* ---------- 程序雜訊（3D value noise + fBm） ---------- */
  function hash(ix, iy, iz, seed) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1440662683) ^ Math.imul(seed, 1597334677);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, z, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iy, iz, seed), b = hash(ix + 1, iy, iz, seed), c = hash(ix, iy + 1, iz, seed), d = hash(ix + 1, iy + 1, iz, seed);
    const e = hash(ix, iy, iz + 1, seed), f = hash(ix + 1, iy, iz + 1, seed), g = hash(ix, iy + 1, iz + 1, seed), h = hash(ix + 1, iy + 1, iz + 1, seed);
    return lerp(lerp(lerp(a, b, ux), lerp(c, d, ux), uy), lerp(lerp(e, f, ux), lerp(g, h, ux), uy), uz);
  }
  function fbm(x, y, z, seed, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f, seed + i * 31); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }

  /* ================= 1. 收集畫面上的文字 ================= */
  function collectChars() {
    const out = [];
    const vw = innerWidth, vh = innerHeight;
    const range = document.createRange();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT,
      { acceptNode: n => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest('#gcine, script, style')) continue;
      const er = el.getBoundingClientRect();
      if (!er.width || er.bottom < 0 || er.top > vh) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const color = parseColor(cs.color);
      const size = parseFloat(cs.fontSize);
      const text = n.nodeValue;
      for (let i = 0; i < text.length; i++) {
        if (!text[i].trim()) continue;
        range.setStart(n, i); range.setEnd(n, i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
        out.push({ ch: text[i], x: r.left + r.width / 2, y: r.top + r.height / 2, font, size, color });
      }
    }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out.slice(0, MAX_CHARS);
  }

  /* ================= 書本 ================= */
  function bookGeom(s) {
    const base = Math.min(st.vw, st.vh) * 0.2;
    return { W: base * s, H: base * s * 1.25 };   // W = 單頁寬
  }
  function pagePath(p, cx, cy, W, H, side, grow) {
    const dip = H * 0.05, bow = H * 0.06, g = grow || 0;
    p.moveTo(cx, cy - H / 2 + dip - g);
    p.quadraticCurveTo(cx + side * W * 0.5, cy - H / 2 - bow - g, cx + side * (W + g), cy - H / 2 - g * 0.3);
    p.lineTo(cx + side * (W + g), cy + H / 2 + g);
    p.quadraticCurveTo(cx + side * W * 0.5, cy + H / 2 - bow + g, cx, cy + H / 2 + dip + g);
    p.closePath();
  }
  function bookPath(cx, cy, s, grow) {
    const { W, H } = bookGeom(s);
    const p = new Path2D();
    pagePath(p, cx, cy, W, H, -1, grow);
    pagePath(p, cx, cy, W, H, 1, grow);
    return p;
  }
  function drawBook(ctx, cx, cy, s, alpha, inner, glow) {
    const { W, H } = bookGeom(s);
    const lw = Math.max(0.8, 1.6 * Math.sqrt(s));
    ctx.save();
    ctx.globalAlpha = alpha;
    // 皮革封面
    const cover = new Path2D();
    const cw = W * 2.16, ch = H * 1.18, rr = W * 0.05;
    if (cover.roundRect) cover.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, rr); else cover.rect(cx - cw / 2, cy - ch / 2, cw, ch);
    const leather = ctx.createLinearGradient(0, cy - ch / 2, 0, cy + ch / 2);
    leather.addColorStop(0, '#46290f'); leather.addColorStop(0.5, '#2c180a'); leather.addColorStop(1, '#1a0e05');
    ctx.fillStyle = leather;
    ctx.shadowColor = 'rgba(255,196,90,.85)'; ctx.shadowBlur = glow == null ? 38 : glow;
    ctx.fill(cover);
    ctx.shadowBlur = 0;
    // 燙金邊框與四角紋飾
    ctx.strokeStyle = 'rgba(232,182,92,.75)'; ctx.lineWidth = lw * 0.7;
    const ins = W * 0.035;
    ctx.strokeRect(cx - cw / 2 + ins, cy - ch / 2 + ins, cw - ins * 2, ch - ins * 2);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx * (cw / 2 - ins * 2.2), y = cy + sy * (ch / 2 - ins * 2.2);
      ctx.beginPath(); ctx.arc(x, y, ins * 0.9, 0, Math.PI * 2); ctx.stroke();
    }
    // 書頁厚度（外緣的多層紙張）
    for (let k = 5; k >= 1; k--) {
      ctx.fillStyle = `rgba(${230 - k * 12},${214 - k * 14},${180 - k * 16},1)`;
      ctx.fill(bookPath(cx, cy + k * H * 0.004, s, k * W * 0.006));
    }
    // 書頁內容：星空
    const pages = bookPath(cx, cy, s, 0);
    ctx.fillStyle = '#060918';
    ctx.fill(pages);
    ctx.save();
    ctx.clip(pages);
    if (inner) inner();
    // 書脊的陰影
    const gut = ctx.createLinearGradient(cx - W * 0.22, 0, cx + W * 0.22, 0);
    gut.addColorStop(0, 'rgba(0,0,0,0)'); gut.addColorStop(0.5, 'rgba(0,0,0,.55)'); gut.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gut; ctx.fillRect(cx - W * 0.22, cy - H, W * 0.44, H * 2);
    ctx.restore();
    // 書頁金邊
    ctx.strokeStyle = 'rgba(255,226,160,.9)';
    ctx.lineWidth = lw;
    ctx.shadowColor = 'rgba(255,200,100,.9)'; ctx.shadowBlur = 10;
    ctx.stroke(pages);
    ctx.restore();
  }
  function bookTargets(n, s) {
    const { W, H } = bookGeom(s);
    const cx = st.vw / 2, cy = st.vh / 2;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const r = Math.random();
      let u, v;
      if (r < 0.5) {
        const e = Math.random() * 4;
        if (e < 1) { u = e; v = 0; } else if (e < 2) { u = 1; v = e - 1; } else if (e < 3) { u = 3 - e; v = 1; } else { u = 0; v = 4 - e; }
      } else if (r < 0.8) { u = 0.14 + Math.random() * 0.72; v = 0.14 + Math.floor(Math.random() * 8) / 10; }
      else { u = Math.random(); v = Math.random(); }
      const bow = (v === 0 || v === 1) ? -H * 0.03 * Math.sin(u * Math.PI) : 0;
      pts.push({ x: cx + side * u * W, y: cy - H / 2 + v * H + bow });
    }
    return pts;
  }

  /* ================= 星空 ================= */
  function newStar(fresh) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.03 + Math.pow(Math.random(), 0.7) * 1.9;
    const tint = Math.random();
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, z: fresh ? 0.05 + Math.random() * 0.95 : 1,
      tint: tint < 0.7 ? 0 : tint < 0.87 ? 1 : 2, px: null, py: null };
  }
  const TINT = [[236, 240, 255], [160, 196, 255], [255, 218, 150]];
  function stepStars(dt, speed, rot) {
    const ca = Math.cos(rot * dt), sa = Math.sin(rot * dt);
    for (const s of st.stars) {
      s.z -= speed * dt;
      const x = s.x * ca - s.y * sa, y = s.x * sa + s.y * ca;
      s.x = x; s.y = y;
      if (s.z < 0.02) Object.assign(s, newStar(false));
    }
  }
  const proj = (x, y, z, f) => ({ x: st.vw / 2 + (x / z) * (f || st.f), y: st.vh / 2 + (y / z) * (f || st.f) });
  /** 穿越時的光速拖尾（累積在底層畫布） */
  function drawWarp(ctx) {
    for (const s of st.stars) {
      const p = proj(s.x, s.y, s.z);
      const k = 1 - s.z;
      if (s.px != null && Math.abs(p.x - s.px) < st.vw && Math.abs(p.y - s.py) < st.vh) {
        ctx.strokeStyle = rgba(TINT[s.tint], 0.25 + 0.75 * k);
        ctx.lineWidth = 0.4 + 2 * k * k;
        ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      s.px = p.x; s.py = p.y;
    }
  }
  /** 書頁內的星空 */
  function drawDots(ctx, f) {
    for (const s of st.stars) {
      const p = proj(s.x, s.y, s.z, f);
      const k = 1 - s.z;
      const r = 0.6 + 2 * k;
      ctx.fillStyle = rgba(TINT[s.tint], 0.4 + 0.6 * k);
      ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
      s.px = p.x; s.py = p.y;
    }
    const g = ctx.createRadialGradient(st.vw / 2, st.vh / 2, 0, st.vw / 2, st.vh / 2, f * 0.9);
    g.addColorStop(0, 'rgba(120,110,220,.2)'); g.addColorStop(1, 'rgba(120,110,220,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, st.vw, st.vh);
  }
  /** 定格星空：記錄每顆星的極座標，之後以旋轉角繪製長曝光星軌 */
  function freezeSky() {
    const cx = st.vw / 2, cy = st.vh / 2;
    for (const s of st.stars) {
      const p = proj(s.x, s.y, Math.max(s.z, 0.25));
      s.r = Math.hypot(p.x - cx, p.y - cy);
      s.phi = Math.atan2(p.y - cy, p.x - cx);
      s.b = Math.pow(1 - s.z, 1.5) * 0.85 + Math.random() * 0.15;
    }
  }
  /** 長曝光星軌：每顆星畫三段漸淡的弧，依色調與亮度分桶一次描繪 */
  function drawStarTrails(ctx, A, len) {
    const cx = st.vw / 2, cy = st.vh / 2;
    const buckets = {};
    for (const s of st.stars) {
      const cls = s.b > 0.55 ? 1 : 0;
      const phi = s.phi + A;
      for (let j = 0; j < 3; j++) {
        const key = s.tint * 6 + cls * 3 + j;
        const p = buckets[key] || (buckets[key] = new Path2D());
        const a0 = phi - len * (j + 1) / 3, a1 = phi - len * j / 3;
        p.moveTo(cx + Math.cos(a0) * s.r, cy + Math.sin(a0) * s.r);
        p.arc(cx, cy, s.r, a0, a1);
      }
    }
    ctx.lineCap = 'round';
    for (const key in buckets) {
      const k = +key, tint = Math.floor(k / 6), cls = Math.floor((k % 6) / 3), j = k % 3;
      ctx.strokeStyle = rgba(TINT[tint], [0.95, 0.45, 0.14][j] * (cls ? 0.95 : 0.5));
      ctx.lineWidth = cls ? 1.5 : 0.7;
      ctx.stroke(buckets[key]);
    }
    // 亮星的星點
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (const s of st.stars) {
      if (s.b < 0.8) continue;
      const phi = s.phi + A;
      ctx.beginPath(); ctx.arc(cx + Math.cos(phi) * s.r, cy + Math.sin(phi) * s.r, 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ================= 星球（程序生成） ================= */
  const TEX_W = 192, TEX_H = 96;
  function surfaceColor(rarity, p, lat, seed) {
    const [x, y, z] = p;
    if (rarity === 3) {           // 海洋冰雪行星
      const c = fbm(x * 1.7 + 11, y * 1.7, z * 1.7, seed, 5);
      const det = fbm(x * 6, y * 6 + 3, z * 6, seed + 7, 3);
      let col = mix3([10, 32, 84], [34, 96, 158], smooth(0.3, 0.56, c));
      let spec = 1;
      if (c > 0.585) { col = mix3([62, 104, 110], [150, 158, 150], det); spec = 0; }
      if (Math.abs(lat) > 1.2 - det * 0.25) { col = [226, 236, 246]; spec = 0.2; }
      const w = fbm(x * 2, y * 2, z * 2, seed + 50, 3);
      const cl = fbm(x * 3.2 + w * 1.6, y * 3.2, z * 3.2 + w * 1.6, seed + 90, 5);
      const cloud = smooth(0.5, 0.72, cl);
      col = mix3(col, [242, 246, 255], cloud * 0.92);
      return [col, spec * (1 - cloud)];
    }
    const turb = fbm(x * 2.4, y * 2.4, z * 2.4, seed, 4);
    const fine = fbm(x * 9, y * 9, z * 9, seed + 13, 3);
    const t = lat * 7.5 + turb * 2.6 + fine * 0.35;
    const b1 = 0.5 + 0.5 * Math.sin(t), b2 = 0.5 + 0.5 * Math.sin(t * 2.3 + 1.3);
    let col;
    if (rarity === 4) {           // 紫色氣態巨行星
      col = mix3([46, 20, 84], [132, 74, 186], b1);
      col = mix3(col, [216, 182, 240], b2 * 0.45);
      col = mix3(col, [250, 226, 255], smooth(0.62, 0.8, fine) * 0.25);
    } else {                      // 金色氣態巨行星＋大風暴
      col = mix3([118, 66, 22], [216, 152, 64], b1);
      col = mix3(col, [250, 230, 178], b2 * 0.5);
      const lon = Math.atan2(x, z);
      const dx = (lon - 1.9) * 1.4, dy = (lat - 0.36) * 3.4;
      const d = Math.hypot(dx, dy);
      if (d < 1) {
        const sw = 0.5 + 0.5 * Math.sin(d * 11 - Math.atan2(dy, dx) * 2 + turb * 4);
        col = mix3(col, mix3([214, 96, 44], [252, 196, 132], sw), (1 - d) * 0.9);
      }
    }
    return [col, 0];
  }
  /** 分段生成貼圖（每一幀只做一部分，避免卡頓） */
  function texJob(pl) {
    const data = new Uint8ClampedArray(TEX_W * TEX_H * 4);
    let y = 0;
    return {
      done: false,
      step(deadline) {
        while (y < TEX_H && performance.now() < deadline) {
          const lat = (0.5 - (y + 0.5) / TEX_H) * Math.PI;
          for (let x = 0; x < TEX_W; x++) {
            const lon = (x / TEX_W) * Math.PI * 2;
            const p = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
            const [c, spec] = surfaceColor(pl.rarity, p, lat, pl.seed);
            const i = (y * TEX_W + x) * 4;
            data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = spec * 255;
          }
          y++;
        }
        if (y >= TEX_H) { this.done = true; pl.tex = data; buildSphere(pl); }
      },
    };
  }
  function buildSphere(pl) {
    const D = Math.max(8, Math.ceil(pl.R * 2 * st.sdpr));
    const c = document.createElement('canvas'); c.width = c.height = D;
    const g = c.getContext('2d');
    const img = g.createImageData(D, D);
    const r = D / 2, ca = Math.cos(pl.tilt), sa = Math.sin(pl.tilt);
    const idx = [], nx = [], ny = [], nz = [], ty = [], lon = [], edge = [];
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const px = (x + 0.5 - r) / r, py = (y + 0.5 - r) / r, d2 = px * px + py * py;
      if (d2 > 1) continue;
      const pz = Math.sqrt(1 - d2);
      const tx = px * ca - py * sa, tyy = px * sa + py * ca;
      const lat = Math.asin(clamp(-tyy, -1, 1));
      idx.push((y * D + x) * 4); nx.push(px); ny.push(py); nz.push(pz);
      ty.push(clamp(Math.floor((0.5 - lat / Math.PI) * TEX_H), 0, TEX_H - 1));
      lon.push(Math.atan2(tx, pz));
      edge.push(clamp((1 - Math.sqrt(d2)) * r * 1.2, 0, 1));
    }
    pl.sph = { c, g, img, idx: Int32Array.from(idx), nx: Float32Array.from(nx), ny: Float32Array.from(ny), nz: Float32Array.from(nz),
      ty: Int32Array.from(ty), lon: Float32Array.from(lon), edge: Float32Array.from(edge) };
  }
  /** 依自轉角與光照重新著色 */
  function paintSphere(pl, rot, L, light) {
    const S = pl.sph, tex = pl.tex, out = S.img.data, atm = PAL[pl.rarity].atm;
    const hv = norm3([L[0], L[1], L[2] + 1]);
    const TW = TEX_W, TWO_PI = Math.PI * 2;
    for (let k = 0; k < S.idx.length; k++) {
      let u = (S.lon[k] + rot) / TWO_PI; u -= Math.floor(u);
      const ti = (S.ty[k] * TW + ((u * TW) | 0)) * 4;
      const nx = S.nx[k], ny = S.ny[k], nz = S.nz[k];
      const d = nx * L[0] + ny * L[1] + nz * L[2];
      const lit = smooth(-0.16, 0.42, d) * light;
      const rim = Math.pow(1 - nz, 3);
      const atmK = rim * (0.12 + 0.88 * smooth(-0.35, 0.45, d)) * light * 1.25;
      let spec = 0;
      if (tex[ti + 3]) { const hd = Math.max(0, nx * hv[0] + ny * hv[1] + nz * hv[2]); spec = Math.pow(hd, 42) * tex[ti + 3] / 255 * light * 200; }
      const amb = 0.03;
      const i = S.idx[k];
      out[i] = tex[ti] * (amb + lit) + atm[0] * atmK + spec;
      out[i + 1] = tex[ti + 1] * (amb + lit) + atm[1] * atmK + spec;
      out[i + 2] = tex[ti + 2] * (amb + lit) + atm[2] * atmK + spec;
      out[i + 3] = 255 * S.edge[k];
    }
    S.g.putImageData(S.img, 0, 0);
  }
  function drawRings(ctx, x, y, R, pl, front, alpha, light) {
    const col = PAL[pl.rarity].ring;
    const inner = R * 1.38, outer = R * 2.3, N = pl.ringDen.length;
    for (let j = 0; j < N; j++) {
      const r = inner + (outer - inner) * (j + 0.5) / N;
      ctx.strokeStyle = rgba(col, pl.ringDen[j] * alpha * (0.25 + 0.55 * light));
      ctx.lineWidth = (outer - inner) / N + 0.4;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.27, pl.tilt, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.stroke();
    }
  }
  /** 星芒（凝聚時的光點） */
  function drawSpark(ctx, x, y, size, col, a) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, rgba(col, a * 0.6)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    for (const [dx, dy, l] of [[1, 0, 4], [0, 1, 4], [0.7, 0.7, 1.8], [0.7, -0.7, 1.8]]) {
      const lg = ctx.createLinearGradient(x - dx * size * l, y - dy * size * l, x + dx * size * l, y + dy * size * l);
      lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(0.5, `rgba(255,255,255,${a * 0.9})`); lg.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = lg; ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.beginPath(); ctx.moveTo(x - dx * size * l, y - dy * size * l); ctx.lineTo(x + dx * size * l, y + dy * size * l); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPlanet(ctx, pl, t, x, y, k, dim, sm) {
    const col = PAL[pl.rarity];
    const R = pl.R * (sm == null ? 1 : sm);
    // 凝聚：星芒 → 星雲收攏 → 球體由夜轉晝
    const spark = bell(k, 0, 0.62) * (pl.rarity === 5 ? 1 : 0.8);
    const neb = bell(k, 0.08, 0.85);
    const appear = smooth(0.3, 0.75, k) * dim;
    const light = smooth(0.35, 1, k);
    const sc = 0.86 + 0.14 * easeOut(prog(k, 0.3, 1));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (neb > 0.01) {
      for (let j = 0; j < 6; j++) {
        const a = j * 1.047 + t * 0.0011 + pl.seed;
        const rr = R * (0.6 + 1.9 * (1 - k));
        const bx = x + Math.cos(a) * rr, by = y + Math.sin(a) * rr * 0.7;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, R * 1.3);
        g.addColorStop(0, rgba(col.glow, 0.16 * neb * dim)); g.addColorStop(1, rgba(col.glow, 0));
        ctx.fillStyle = g; ctx.fillRect(bx - R * 1.3, by - R * 1.3, R * 2.6, R * 2.6);
      }
    }
    // 大氣光暈
    const halo = ctx.createRadialGradient(x, y, R * 0.9, x, y, R * (pl.rarity === 5 ? 3 : 2.3));
    halo.addColorStop(0, rgba(col.glow, 0.3 * appear * light)); halo.addColorStop(1, rgba(col.glow, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, R * 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (pl.sph && appear > 0.01) {
      const rot = t * 0.00012 * pl.spin + pl.seed;
      const L = norm3(mix3([0.25, -0.05, -1], LIGHT, light));
      paintSphere(pl, rot, L, 0.25 + 0.75 * light);
      ctx.save();
      ctx.globalAlpha = appear;
      if (col.ring) drawRings(ctx, x, y, R * sc, pl, false, 1, light);
      ctx.drawImage(pl.sph.c, x - R * sc, y - R * sc, R * 2 * sc, R * 2 * sc);
      if (col.ring) drawRings(ctx, x, y, R * sc, pl, true, 1, light);
      ctx.restore();
    }
    drawSpark(ctx, x, y, R * (0.5 + 0.6 * spark), col.glow, spark * 0.95 * dim);
    // 5★ 出現時的光環衝擊波
    if (pl.rarity === 5) {
      const w = prog(k, 0.45, 1);
      if (w > 0 && w < 1) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const rr = R * (1.3 + 3.2 * easeOut(w)), th = R * 0.5 * (1 - w) + 2;
        const ripple = ctx.createRadialGradient(x, y, Math.max(0, rr - th), x, y, rr + th);
        ripple.addColorStop(0, rgba(col.glow, 0)); ripple.addColorStop(0.5, rgba(col.glow, 0.22 * (1 - w))); ripple.addColorStop(1, rgba(col.glow, 0));
        ctx.fillStyle = ripple;
        ctx.beginPath(); ctx.arc(x, y, rr + th, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }
  function layoutPlanets(results) {
    const n = results.length, vw = st.vw, vh = st.vh, m = Math.min(vw, vh);
    return results.map((g, i) => {
      let x, y, depth;
      if (n === 1) { x = vw / 2; y = vh * 0.36; depth = 1.6; }
      else {
        const a = lerp(Math.PI * 1.1, Math.PI * 1.9, i / (n - 1));
        x = vw / 2 + Math.cos(a) * vw * 0.4;
        y = vh * 0.7 + Math.sin(a) * vh * 0.46;
        depth = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(i * 2.3 + 1));
      }
      const R = m * 0.04 * depth * (g.rarity === 5 ? 1.6 : g.rarity === 4 ? 1.25 : 1);
      const seed = (Math.random() * 1e6) | 0;
      const ringDen = Array.from({ length: 34 }, (_, j) => {
        const r = j / 34;
        const gap = Math.abs(r - 0.62) < 0.05 ? 0.08 : 1;
        return clamp(0.25 + 0.75 * fbm(r * 9, seed % 97, 0.5, seed, 3), 0, 1) * gap * (r < 0.08 ? 0.4 : 1);
      });
      return { rarity: g.rarity, x0: x, y0: y, R, seed, spin: 0.7 + Math.random() * 0.8,
        tilt: -0.28 + (Math.random() - 0.5) * 0.3, ringDen, tex: null, sph: null };
    });
  }

  /* ================= 人類虛影（上半身・偵探） ================= */
  // 單位 u，原點為頭部中心；頭部朝畫面左前方轉 3/4，逆光下輪廓光勾出眉骨、鼻樑、嘴唇、下巴與下顎線
  const FIG = {
    coat: [
      ['M', -3.05, 6.6],
      ['C', -3.1, 5.2, -3.0, 3.9, -2.78, 3.05],      // 身側 → 肩
      ['C', -2.62, 2.45, -2.2, 2.2, -1.52, 2.06],    // 肩頭
      ['C', -1.2, 1.99, -1.02, 1.86, -0.98, 1.62],   // 到立領底部
      ['C', -1.1, 1.34, -1.04, 1.04, -0.92, 0.84],   // 立起的領子外緣
      ['Q', -0.74, 0.9, -0.54, 1.08],                 // 圓潤的領尖
      ['C', -0.48, 1.36, -0.4, 1.72, -0.28, 1.96],   // 領子內緣
      ['L', 0, 2.58],                                 // V 領開口
      ['L', 0.28, 1.96],
      ['C', 0.4, 1.72, 0.48, 1.36, 0.54, 1.08],
      ['Q', 0.74, 0.9, 0.92, 0.84],
      ['C', 1.04, 1.04, 1.1, 1.34, 0.98, 1.62],
      ['C', 1.02, 1.86, 1.2, 1.99, 1.52, 2.06],
      ['C', 2.2, 2.2, 2.62, 2.45, 2.78, 3.05],
      ['C', 3.0, 3.9, 3.1, 5.2, 3.05, 6.6],
      ['Z'],
    ],
    shirt: [['M', -0.56, 0.9], ['L', 0.56, 0.9], ['L', 0.14, 2.75], ['L', -0.14, 2.75], ['Z']],
    tie: [['M', -0.09, 1.3], ['L', 0.09, 1.3], ['L', 0.14, 2.2], ['L', 0, 2.5], ['L', -0.14, 2.2], ['Z'],
      ['M', -0.13, 1.12], ['L', 0.13, 1.12], ['L', 0.09, 1.32], ['L', -0.09, 1.32], ['Z']],
    neck: [['M', -0.4, 0.66], ['C', -0.42, 0.98, -0.45, 1.2, -0.5, 1.42], ['L', 0.42, 1.42], ['C', 0.37, 1.15, 0.35, 0.9, 0.37, 0.6], ['Z']],
    head: [
      ['M', -0.6, -0.46],
      ['C', -0.7, -0.26, -0.72, -0.12, -0.68, 0.0],    // 眉骨
      ['C', -0.72, 0.06, -0.8, 0.2, -0.86, 0.3],       // 鼻樑 → 鼻尖
      ['C', -0.8, 0.36, -0.75, 0.36, -0.72, 0.38],     // 鼻下
      ['C', -0.76, 0.44, -0.75, 0.49, -0.7, 0.52],     // 上唇
      ['C', -0.73, 0.56, -0.72, 0.6, -0.66, 0.63],     // 下唇
      ['C', -0.67, 0.73, -0.62, 0.85, -0.5, 0.91],     // 下巴
      ['C', -0.24, 0.97, 0.14, 0.86, 0.38, 0.62],      // 下顎線
      ['C', 0.5, 0.5, 0.57, 0.36, 0.6, 0.2],
      ['C', 0.72, 0.2, 0.78, 0.0, 0.66, -0.13],        // 耳
      ['C', 0.8, -0.22, 0.82, -0.55, 0.7, -0.8],       // 後腦
      ['C', 0.5, -1.15, -0.2, -1.2, -0.5, -0.86],
      ['C', -0.6, -0.72, -0.62, -0.58, -0.6, -0.46],
      ['Z'],
    ],
    hair: [
      ['M', -0.64, -0.5],
      ['C', -0.92, -0.62, -0.88, -0.98, -0.62, -1.12],  // 垂落的瀏海
      ['C', -0.5, -1.38, -0.08, -1.46, 0.22, -1.34],    // 蓬起的頂部
      ['C', 0.38, -1.44, 0.62, -1.34, 0.74, -1.16],
      ['C', 0.98, -1.0, 0.97, -0.6, 0.86, -0.36],       // 往後梳
      ['C', 0.9, -0.16, 0.8, 0.0, 0.72, 0.04],
      ['L', 0.66, -0.13],
      ['C', 0.6, -0.5, 0.3, -0.74, 0.0, -0.76],         // 髮際線
      ['C', -0.24, -0.76, -0.42, -0.64, -0.48, -0.42],
      ['C', -0.54, -0.3, -0.6, -0.34, -0.64, -0.5],
      ['Z'],
    ],
  };
  // 內部細節線 [起點x, 起點y, 控制x, 控制y, 終點x, 終點y, 亮度]
  const DETAIL = [
    [-0.7, -0.92, -0.2, -1.32, 0.36, -1.24, 0.5],     // 髮絲
    [-0.56, -0.72, 0.0, -1.06, 0.6, -1.0, 0.4],
    [-0.2, -0.8, 0.32, -0.96, 0.82, -0.6, 0.35],
    [-0.76, -0.66, -0.62, -0.5, -0.56, -0.4, 0.4],
    [-0.62, 0.12, -0.36, 0.2, -0.12, 0.15, 0.22],     // 顴骨
    [0.62, 0.08, 0.71, -0.02, 0.64, -0.08, 0.3],      // 耳廓
    [-0.98, 1.62, -0.96, 2.3, -0.34, 2.96, 0.3],      // 翻領
    [0.98, 1.62, 0.96, 2.3, 0.34, 2.96, 0.3],
    [-1.9, 3.2, -1.7, 4.4, -1.8, 5.6, 0.12],          // 大衣摺痕
    [1.9, 3.2, 1.7, 4.4, 1.8, 5.6, 0.12],
  ];
  // 手臂：兩段骨架 + 反向運動學（肩固定、上臂與前臂長度固定、手肘朝外彎）
  // 3D：x 向右、y 向下、z 朝向鏡頭。手先稍微下沉，再從身體正前方把書往上抬，最後舉過頭頂
  const ARM = { S: [2.3, 2.72, 0], L1: 2.3, L2: 2.2, W: [1.0, 0.76, 0.54], pole: [1, 0.9, -0.2],
    hold: [1.05, 3.5, 1.2], c1: [1.15, 3.95, 1.35], c2: [1.1, 0.6, 1.7], up: [1.03, -1.5, 0.3] };

  function figGeom() {
    const u = Math.min(st.vw, st.vh) / 10.2;
    const hx = st.vw / 2, hy = st.vh - 5.25 * u;
    return { u, hx, hy, P: (x, y) => [hx + x * u, hy + y * u] };
  }
  function mk(G, cmds) {
    const p = new Path2D();
    for (const c of cmds) {
      const op = c[0], q = [];
      for (let i = 1; i < c.length; i += 2) q.push(...G.P(c[i], c[i + 1]));
      if (op === 'M') p.moveTo(...q); else if (op === 'L') p.lineTo(...q);
      else if (op === 'C') p.bezierCurveTo(...q); else if (op === 'Q') p.quadraticCurveTo(...q); else p.closePath();
    }
    return p;
  }
  const bez3 = (a, b, c, d, k) => { const m = 1 - k; return [0, 1, 2].map(i => m * m * m * a[i] + 3 * m * m * k * b[i] + 3 * m * k * k * c[i] + k * k * k * d[i]); };
  /** 3D 兩段式 IK：肩固定、骨長固定，手肘朝「外下後方」彎；回傳投影到畫面的 [肩, 肘, 腕] */
  function armIK(sd, r) {
    const S = [sd * ARM.S[0], ARM.S[1], ARM.S[2]];
    const hp = bez3(ARM.hold, ARM.c1, ARM.c2, ARM.up, r);
    let H = [sd * hp[0], hp[1], hp[2]];
    const v = [H[0] - S[0], H[1] - S[1], H[2] - S[2]], d = Math.hypot(...v) || 1;
    const dc = clamp(d, Math.abs(ARM.L1 - ARM.L2) + 0.05, ARM.L1 + ARM.L2 - 0.01);
    const u = v.map(x => x / d);
    if (dc !== d) H = S.map((s, i) => s + u[i] * dc);
    const a = (ARM.L1 * ARM.L1 - ARM.L2 * ARM.L2 + dc * dc) / (2 * dc);
    const h = Math.sqrt(Math.max(0, ARM.L1 * ARM.L1 - a * a));
    const pv = [sd * ARM.pole[0], ARM.pole[1], ARM.pole[2]];
    const pu = pv[0] * u[0] + pv[1] * u[1] + pv[2] * u[2];
    const p = norm3([pv[0] - pu * u[0], pv[1] - pu * u[1], pv[2] - pu * u[2]]);
    const E = S.map((s, i) => s + u[i] * a + p[i] * h);
    return [[S[0], S[1]], [E[0], E[1]], [H[0], H[1]]];
  }
  function limbOutline(G, pts, widths) {
    const P = pts.map(q => G.P(q[0], q[1]));
    const W = widths.map(w => w * G.u);
    const nrm = P.map((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [-dy / l, dx / l];
    });
    const A = P.map((p, i) => [p[0] + nrm[i][0] * W[i] / 2, p[1] + nrm[i][1] * W[i] / 2]);
    const B = P.map((p, i) => [p[0] - nrm[i][0] * W[i] / 2, p[1] - nrm[i][1] * W[i] / 2]);
    const fill = new Path2D();
    fill.moveTo(...A[0]); fill.lineTo(...A[1]); fill.lineTo(...A[2]); fill.lineTo(...B[2]); fill.lineTo(...B[1]); fill.lineTo(...B[0]); fill.closePath();
    fill.moveTo(P[1][0] + W[1] / 2, P[1][1]); fill.arc(P[1][0], P[1][1], W[1] / 2, 0, Math.PI * 2);
    const rim = new Path2D();
    rim.moveTo(...A[0]); rim.lineTo(...A[1]); rim.lineTo(...A[2]);
    rim.moveTo(...B[0]); rim.lineTo(...B[1]); rim.lineTo(...B[2]);
    return { fill, rim, P, W };
  }
  const figBookScale = G => (0.98 * G.u) / (Math.min(st.vw, st.vh) * 0.2);
  function bookCenter(G, r) {
    const hl = armIK(-1, r)[2], hr = armIK(1, r)[2];
    return G.P((hl[0] + hr[0]) / 2, (hl[1] + hr[1]) / 2);
  }
  function sampleFigure() {
    const G = figGeom();
    const parts = ['coat', 'head', 'hair', 'neck'].map(k => mk(G, FIG[k]));
    const c = document.createElement('canvas').getContext('2d');
    const pts = [];
    let guard = 0;
    while (pts.length < 1000 && guard++ < 30000) {
      const x = G.hx + (Math.random() * 6.4 - 3.2) * G.u, y = G.hy + (Math.random() * 7.2 - 1.5) * G.u;
      if (y > st.vh) continue;
      if (parts.some(p => c.isPointInPath(p, x, y))) pts.push({ tx: x, ty: y });
    }
    for (let i = 0; i < 300; i++) pts.push({ arm: i % 2 ? 1 : -1, along: Math.random(), across: Math.random() - 0.5 });
    return pts.map(p => Object.assign(p, {
      sx: Math.random() * st.vw, sy: Math.random() * st.vh * 0.8, delay: Math.random() * 600, ph: Math.random() * 6.28,
    }));
  }
  /** 書本（在手中）：傾斜角、光芒強度、書頁內吸收的星球光點 */
  function drawHeldBook(F, G, t, bc, alpha, sy, glow, reveal) {
    const bs = figBookScale(G);
    // 書本周圍的光暈（畫在書的後方，避免把書頁洗白）
    if (glow > 0.01) {
      const g = bookGeom(bs);
      F.save(); F.globalCompositeOperation = 'lighter';
      const hg = F.createRadialGradient(bc[0], bc[1], g.W * 0.8, bc[0], bc[1], g.W * (2.2 + glow * 1.5));
      hg.addColorStop(0, `rgba(255,214,140,${0.35 * glow * alpha})`); hg.addColorStop(1, 'rgba(255,214,140,0)');
      F.fillStyle = hg; F.beginPath(); F.arc(bc[0], bc[1], g.W * (2.2 + glow * 1.5), 0, Math.PI * 2); F.fill();
      F.restore();
    }
    F.save();
    F.translate(bc[0], bc[1]); F.scale(1, sy); F.translate(-bc[0], -bc[1]);
    drawBook(F, bc[0], bc[1], bs, alpha, () => {
      const g = bookGeom(bs);
      const hsh = v => { const s = Math.sin(v * 12.9898) * 43758.5453; return s - Math.floor(s); };
      for (let i = 0; i < 110; i++) {
        F.fillStyle = `rgba(255,240,210,${0.3 + 0.6 * Math.abs(Math.sin(t * 0.003 + i))})`;
        F.beginPath(); F.arc(bc[0] + (hsh(i + 1) * 2 - 1) * g.W, bc[1] + (hsh(i + 301) - 0.5) * g.H, 0.45 + hsh(i + 77) * 0.5, 0, Math.PI * 2); F.fill();
      }
      // 吸收進來的星球化為書頁中的彩色星點
      st.planets.forEach((pl, i) => {
        if (!pl.absorbed) return;
        const x = bc[0] + (hsh(i * 7 + 3) * 1.7 - 0.85) * g.W, y = bc[1] + (hsh(i * 7 + 9) - 0.5) * g.H * 0.8;
        drawSpark(F, x, y, g.W * (pl.rarity === 5 ? 0.075 : pl.rarity === 4 ? 0.055 : 0.04), PAL[pl.rarity].glow, 0.85);
      });
      if (glow > 0 || reveal > 0) {
        F.save(); F.globalCompositeOperation = 'lighter';
        const lg = F.createRadialGradient(bc[0], bc[1], 0, bc[0], bc[1], g.W * 1.2);
        lg.addColorStop(0, `rgba(255,220,150,${0.1 * glow + 0.22 * reveal})`); lg.addColorStop(1, 'rgba(255,220,150,0)');
        F.fillStyle = lg; F.fillRect(bc[0] - g.W * 1.2, bc[1] - g.H, g.W * 2.4, g.H * 2);
        F.restore();
      }
    }, 22 + glow * 45);
    F.restore();
  }
  function drawFigure(F, t, form, raise, alpha, book) {
    const G = figGeom(), u = G.u;
    const r = easeInOut(raise);
    const P = {}; for (const k in FIG) P[k] = mk(G, FIG[k]);
    const arms = [-1, 1].map(sd => limbOutline(G, armIK(sd, r), ARM.W));
    const flick = 0.94 + 0.06 * Math.sin(t * 0.011) * Math.sin(t * 0.0067);
    const body = form * form * alpha;
    const bc = bookCenter(G, r);
    const vfade = (a0, a1) => { const g = F.createLinearGradient(0, G.hy - u * 1.5, 0, st.vh); g.addColorStop(0, a0); g.addColorStop(0.6, a1); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; };
    F.save();
    // 背光光暈
    F.globalCompositeOperation = 'lighter';
    const halo = F.createRadialGradient(G.hx - u * 0.2, G.hy - u * 0.2, u * 0.4, G.hx, G.hy, u * 5);
    halo.addColorStop(0, `rgba(110,140,255,${0.22 * body})`); halo.addColorStop(1, 'rgba(110,140,255,0)');
    F.fillStyle = halo; F.fillRect(G.hx - u * 5, G.hy - u * 5, u * 10, u * 10);
    F.globalCompositeOperation = 'source-over';
    // 形體（由後往前）
    F.fillStyle = `rgba(16,20,40,${0.92 * body})`; F.fill(P.neck);
    F.fillStyle = vfade(`rgba(44,54,86,${0.88 * body})`, `rgba(44,54,86,${0.6 * body})`); F.fill(P.shirt);
    F.fillStyle = `rgba(14,16,32,${0.95 * body})`; F.fill(P.tie);
    F.fillStyle = vfade(`rgba(10,13,28,${0.94 * body})`, `rgba(10,13,28,${0.75 * body})`); F.fill(P.coat);
    F.fillStyle = `rgba(16,20,40,${0.94 * body})`; F.fill(P.head);
    F.fillStyle = `rgba(7,9,20,${0.97 * body})`; F.fill(P.hair);
    arms.forEach(a => {
      const ag = F.createLinearGradient(a.P[2][0], a.P[2][1], a.P[0][0], a.P[0][1]);
      ag.addColorStop(0, `rgba(12,15,32,${0.95 * body})`); ag.addColorStop(1, `rgba(10,13,28,${0.85 * body})`);
      F.fillStyle = ag; F.fill(a.fill, 'nonzero');
    });
    // 書本的光：局部照亮（捧在胸前時照亮下巴與襯衫，舉起時照亮頭髮與手臂）
    const all = new Path2D();
    ['coat', 'shirt', 'neck', 'head', 'hair'].forEach(k => all.addPath(P[k]));
    arms.forEach(a => all.addPath(a.fill));
    F.save(); F.clip(all);
    F.globalCompositeOperation = 'lighter';
    const bl = F.createRadialGradient(bc[0], bc[1], 0, bc[0], bc[1], u * 3.4);
    bl.addColorStop(0, `rgba(255,188,100,${(0.38 + 0.3 * book.glow) * body})`); bl.addColorStop(1, 'rgba(255,188,100,0)');
    F.fillStyle = bl; F.fillRect(0, 0, st.vw, st.vh);
    F.restore();
    // 輪廓光
    F.lineJoin = 'round'; F.lineCap = 'round';
    F.shadowColor = `rgba(150,185,255,${0.9 * body})`; F.shadowBlur = 14;
    F.strokeStyle = vfade(`rgba(196,218,255,${0.85 * body * flick})`, `rgba(170,200,255,${0.4 * body})`); F.lineWidth = 1.5;
    F.stroke(P.coat);
    arms.forEach(a => F.stroke(a.rim));
    F.strokeStyle = `rgba(214,230,255,${0.95 * body * flick})`; F.lineWidth = 1.6;
    F.stroke(P.head);
    F.strokeStyle = `rgba(190,212,255,${0.9 * body * flick})`; F.lineWidth = 1.3;
    F.stroke(P.hair);
    F.shadowBlur = 0;
    F.strokeStyle = `rgba(170,200,255,${0.35 * body})`; F.lineWidth = 1;
    F.stroke(P.shirt); F.stroke(P.tie);
    for (const d of DETAIL) {
      F.strokeStyle = `rgba(180,206,255,${d[6] * body})`;
      F.lineWidth = 1;
      F.beginPath(); F.moveTo(...G.P(d[0], d[1])); F.quadraticCurveTo(...G.P(d[2], d[3]), ...G.P(d[4], d[5])); F.stroke();
    }
    // 嘴角的笑（臉的其他部分都在陰影中）
    const sm = alpha * smooth(0.5, 1, form) * (0.8 + 0.2 * Math.sin(t * 0.004) ** 2);
    F.strokeStyle = `rgba(255,232,196,${0.95 * sm})`;
    F.shadowColor = `rgba(255,205,140,${sm})`; F.shadowBlur = 9;
    F.lineWidth = Math.max(1.1, u * 0.03);
    F.beginPath(); F.moveTo(...G.P(-0.69, 0.5)); F.quadraticCurveTo(...G.P(-0.56, 0.555), ...G.P(-0.44, 0.505)); F.quadraticCurveTo(...G.P(-0.39, 0.485), ...G.P(-0.35, 0.43)); F.stroke();
    F.lineWidth = Math.max(0.8, u * 0.016);
    F.strokeStyle = `rgba(255,220,180,${0.4 * sm})`;
    F.beginPath(); F.moveTo(...G.P(-0.64, 0.6)); F.quadraticCurveTo(...G.P(-0.58, 0.625), ...G.P(-0.52, 0.598)); F.stroke();
    F.shadowBlur = 0;
    F.restore();
    // 書本（透明度獨立於人物，最後由鏡頭接手）
    drawHeldBook(F, G, t, bc, book.alpha, book.sy, book.glow, book.reveal);
    // 手：戴手套、抓住封面邊緣
    F.save();
    arms.forEach((a, i) => {
      const [wx, wy] = a.P[2], [ex, ey] = a.P[1];
      const ang = Math.atan2(wy - ey, wx - ex);
      F.save(); F.translate(wx, wy); F.rotate(ang);
      F.fillStyle = `rgba(12,15,30,${0.95 * body})`;
      F.beginPath(); F.ellipse(u * 0.14, 0, u * 0.32, u * 0.22, 0, 0, Math.PI * 2); F.fill();
      F.beginPath(); F.ellipse(u * 0.02, (i ? -1 : 1) * u * 0.2, u * 0.15, u * 0.08, (i ? -1 : 1) * 0.6, 0, Math.PI * 2); F.fill();
      F.strokeStyle = `rgba(205,224,255,${0.75 * body})`; F.lineWidth = 1.2;
      F.beginPath(); F.ellipse(u * 0.14, 0, u * 0.32, u * 0.22, 0, 0, Math.PI * 2); F.stroke();
      F.strokeStyle = `rgba(205,224,255,${0.3 * body})`; F.lineWidth = 0.9;
      for (let j = -1; j <= 1; j++) { F.beginPath(); F.moveTo(u * 0.24, j * u * 0.075); F.lineTo(u * 0.44, j * u * 0.085); F.stroke(); }
      F.strokeStyle = `rgba(205,224,255,${0.45 * body})`; F.lineWidth = 1;   // 袖口
      F.beginPath(); F.moveTo(-u * 0.12, -u * 0.3); F.lineTo(-u * 0.12, u * 0.3); F.stroke();
      F.restore();
    });
    F.restore();
    return { G, arms, bc };
  }
  function drawDust(F, t, a, fig) {
    const k0 = st.T.ghost;
    if (a <= 0.01) return;
    F.save();
    F.globalCompositeOperation = 'lighter';
    for (const d of st.dust) {
      let tx = d.tx, ty = d.ty;
      if (d.arm) {
        const arm = fig.arms[d.arm < 0 ? 0 : 1];
        const seg = d.along < 0.5 ? 0 : 1, lk = seg ? (d.along - 0.5) * 2 : d.along * 2;
        const p0 = arm.P[seg], p1 = arm.P[seg + 1], w = lerp(arm.W[seg], arm.W[seg + 1], lk);
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
        tx = p0[0] + dx * lk - dy / l * d.across * w; ty = p0[1] + dy * lk + dx / l * d.across * w;
      }
      const k = easeInOut(prog(t, k0 + d.delay, k0 + 1300 + d.delay));
      if (k <= 0) continue;
      const x = lerp(d.sx, tx, k) + Math.sin(t * 0.0012 + d.ph) * 0.8;
      const y = lerp(d.sy, ty, k) + Math.cos(t * 0.001 + d.ph) * 0.8;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.0025 + d.ph));
      F.fillStyle = `rgba(185,210,255,${(0.2 + 0.55 * (1 - k)) * tw * a})`;
      F.beginPath(); F.arc(x, y, 0.75, 0, Math.PI * 2); F.fill();
    }
    F.restore();
  }

  /* ================= 照片虛影（人類使用處/虛影.jpg，經 tools/embed-ghost.js 內嵌） ================= */
  // 原圖座標（以 736×1104 為基準；換成同構圖、不同解析度的圖片也能對上）
  const GHOST = {
    img: null, ready: false,
    smile: false,   // 改成 true 會在臉上畫出發光的嘴角笑意
    head: [385, 285], mouth: [385, 340], chest: [345, 600], hand: [222, 940], shoulder: [300, 500], up: [385, 140],
  };
  (function preloadGhost() {
    if (typeof GHOST_IMAGE === 'undefined') return;
    const im = new Image();
    im.onload = () => { GHOST.img = im; GHOST.ready = true; };
    im.src = GHOST_IMAGE;
  })();
  /** 把黑白照片轉成：遮罩（黑 = 不透明）、暗色身體、模糊輪廓光、淡藍光澤，並取樣星塵位置 */
  function prepGhost() {
    if (!GHOST.ready) return null;
    const im = GHOST.img, vw = st.vw, vh = st.vh;
    const kx = im.naturalWidth / 736, ky = im.naturalHeight / 1104;
    const s = (vh * 1.3) / im.naturalHeight;
    const W = Math.round(im.naturalWidth * s), H = Math.round(im.naturalHeight * s);
    const ox = vw / 2 - GHOST.head[0] * kx * s, oy = vh * 0.3 - GHOST.head[1] * ky * s;
    const P = (x, y) => [ox + x * kx * s, oy + y * ky * s];
    const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
    const mg = mask.getContext('2d');
    mg.drawImage(im, 0, 0, W, H);
    let data;
    try { data = mg.getImageData(0, 0, W, H); } catch (e) { return null; }
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255;
      const a = smooth(0.06, 0.6, 1 - lum);
      px[i] = px[i + 1] = px[i + 2] = 255; px[i + 3] = a * 255;
    }
    mg.putImageData(data, 0, 0);
    const dust = [];
    let guard = 0;
    while (dust.length < 1300 && guard++ < 80000) {
      const x = (Math.random() * W) | 0, y = (Math.random() * H) | 0;
      if (oy + y > vh || px[(y * W + x) * 4 + 3] < 140) continue;
      dust.push({ tx: ox + x, ty: oy + y });
    }
    const tint = col => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, W, H);
      return c;
    };
    const pad = 48;
    const glow = document.createElement('canvas'); glow.width = W + pad * 2; glow.height = H + pad * 2;
    const gg = glow.getContext('2d');
    gg.filter = 'blur(12px)'; gg.drawImage(tint('rgb(120,160,255)'), pad, pad);
    gg.filter = 'blur(2px)'; gg.globalAlpha = 0.45; gg.drawImage(tint('rgb(200,222,255)'), pad, pad);
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    return { W, H, ox, oy, P, s: s * kx, mask, dark: tint('rgb(8,10,24)'), sheen: tint('rgb(70,96,175)'), glow, pad, tmp, dust };
  }
  /** 書本從胸前浮起、升到頭頂（照片中的人物手臂下垂，改以光絲牽引書本） */
  function photoBookPos(pg, t, r) {
    const a = pg.P(...GHOST.chest), b = pg.P(270, 470), c = pg.P(480, 250), d = pg.P(...GHOST.up);
    const e = easeInOut(r);
    const p = bez3([...a, 0], [...b, 0], [...c, 0], [...d, 0], e);
    const bob = Math.sin(t * 0.0021) * pg.s * 6 * (1 - e * 0.6);
    return [p[0], p[1] + bob];
  }
  function drawPhotoGhost(F, t, form, raise, alpha, book) {
    const pg = st.pg;
    const body = form * form * alpha;
    const flick = 0.93 + 0.07 * Math.sin(t * 0.011) * Math.sin(t * 0.0067);
    const head = pg.P(...GHOST.head);
    const bc = photoBookPos(pg, t, raise);
    F.save();
    // 背光光暈
    F.globalCompositeOperation = 'lighter';
    const R = pg.W * 0.75;
    const halo = F.createRadialGradient(head[0], head[1], R * 0.05, head[0], head[1] + R * 0.3, R);
    halo.addColorStop(0, `rgba(110,140,255,${0.2 * body})`); halo.addColorStop(1, 'rgba(110,140,255,0)');
    F.fillStyle = halo; F.fillRect(head[0] - R, head[1] - R, R * 2, R * 2.3);
    // 輪廓光（模糊後的人形，暗色身體蓋在上面後只留下邊緣）
    F.globalAlpha = 0.9 * body * flick;
    F.drawImage(pg.glow, pg.ox - pg.pad, pg.oy - pg.pad);
    // 身體：半透明的暗影，遮住後方星軌
    F.globalCompositeOperation = 'source-over';
    F.globalAlpha = body;
    F.drawImage(pg.dark, pg.ox, pg.oy);
    F.globalCompositeOperation = 'lighter';
    F.globalAlpha = 0.06 * body * flick;
    F.drawImage(pg.sheen, pg.ox, pg.oy);
    // 書本的光：只照亮人物本身（以遮罩裁切）
    const tg = pg.tmp.getContext('2d');
    tg.globalCompositeOperation = 'source-over';
    tg.clearRect(0, 0, pg.W, pg.H);
    const lx = bc[0] - pg.ox, ly = bc[1] - pg.oy;
    const lg = tg.createRadialGradient(lx, ly, 0, lx, ly, pg.W * 0.3);
    lg.addColorStop(0, `rgba(255,185,100,${0.28 + 0.22 * book.glow})`); lg.addColorStop(1, 'rgba(255,185,100,0)');
    tg.fillStyle = lg; tg.fillRect(0, 0, pg.W, pg.H);
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(pg.mask, 0, 0);
    F.globalAlpha = body;
    F.drawImage(pg.tmp, pg.ox, pg.oy);
    F.restore();
    // 嘴角的笑（GHOST.smile = true 時才畫；目前關閉，臉完全沒有五官）
    const m = pg.P(...GHOST.mouth), k = pg.s;
    const sm = GHOST.smile ? alpha * smooth(0.5, 1, form) * (0.8 + 0.2 * Math.sin(t * 0.004) ** 2) : 0;
    if (sm > 0) {
      F.save();
      F.lineCap = 'round';
      F.strokeStyle = `rgba(255,232,196,${0.95 * sm})`;
      F.shadowColor = `rgba(255,205,140,${sm})`; F.shadowBlur = 10;
      F.lineWidth = Math.max(1.2, 3 * k);
      F.beginPath(); F.moveTo(m[0] - 17 * k, m[1] + 2 * k); F.quadraticCurveTo(m[0] - 2 * k, m[1] + 8 * k, m[0] + 12 * k, m[1]); F.quadraticCurveTo(m[0] + 16 * k, m[1] - 2 * k, m[0] + 19 * k, m[1] - 8 * k); F.stroke();
      F.restore();
    }
    // 光絲：從垂下的手與胸口牽引書本
    const thr = smooth(0, 0.25, raise) * (1 - prog(t, st.T.turn, st.T.turn + 500)) * body;
    if (thr > 0.01) {
      F.save(); F.globalCompositeOperation = 'lighter'; F.lineCap = 'round';
      const srcs = [pg.P(...GHOST.hand), pg.P(...GHOST.chest), pg.P(...GHOST.shoulder)];
      srcs.forEach((s0, i) => {
        const wob = Math.sin(t * 0.003 + i * 2) * pg.W * 0.06;
        const cxp = (s0[0] + bc[0]) / 2 + wob - pg.W * 0.12, cyp = (s0[1] + bc[1]) / 2;
        F.strokeStyle = `rgba(255,214,140,${0.45 * thr})`; F.lineWidth = 1.2;
        F.setLineDash([2, 7]); F.lineDashOffset = -t * 0.04;
        F.beginPath(); F.moveTo(...s0); F.quadraticCurveTo(cxp, cyp, bc[0], bc[1]); F.stroke();
      });
      F.restore();
    }
    drawHeldBook(F, figGeom(), t, bc, book.alpha, book.sy, book.glow, book.reveal);
    return { bc, arms: null };
  }

  /* ================= 主流程 ================= */
  function timeline(n) {
    const T = { converge: 1300, form: 2600, grow: 3200, fall: 5000, space: 6400, settle: 7300, planet0: 7500, gap: 430, appear: 1500 };
    T.planetsDone = T.planet0 + (n - 1) * T.gap + T.appear;
    T.linkEnd = n > 1 ? T.planetsDone + 800 : T.planetsDone;
    T.ghost = T.linkEnd + 300;
    T.formed = T.ghost + 1600;
    T.raise = T.formed + 150;
    T.raised = T.raise + 1700;
    T.absorb = T.raised + 150; T.agap = 120; T.adur = 1050;
    T.absorbEnd = T.absorb + (n - 1) * T.agap + T.adur;
    T.turn = T.absorbEnd + 250;
    T.turned = T.turn + 1800;
    T.end = T.turned + 650;
    return T;
  }

  function play(results, onDone) {
    if (st) finish(true);
    const vw = innerWidth, vh = innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    const root = document.createElement('div');
    root.id = 'gcine';
    root.innerHTML = `<canvas class="gc-back"></canvas><canvas class="gc-front"></canvas><button class="gc-skip">跳過 ›</button>`;
    const chars = collectChars();
    document.body.appendChild(root);
    document.body.classList.add('gacha-cine');
    const [back, front] = root.querySelectorAll('canvas');
    [back, front].forEach(c => { c.width = vw * dpr; c.height = vh * dpr; c.style.width = vw + 'px'; c.style.height = vh + 'px'; });

    st = {
      root, back: back.getContext('2d'), front: front.getContext('2d'), vw, vh, dpr, f: Math.min(vw, vh) * 0.55, sdpr: Math.min(1.5, dpr),
      results, onDone, T: timeline(results.length), t0: performance.now(), last: performance.now(),
      stars: Array.from({ length: STAR_COUNT }, () => newStar(true)), raf: 0, s0: 0.55, rotAcc: 0, frozen: false,
    };
    const tg = bookTargets(chars.length, st.s0);
    st.parts = chars.map((c, i) => {
      const a = Math.atan2(c.y - vh / 2, c.x - vw / 2) + (Math.random() - 0.5) * 1.2;
      const d = 120 + Math.random() * 380;
      return Object.assign(c, { vx: Math.cos(a) * d, vy: Math.sin(a) * d - 40, vr: (Math.random() - 0.5) * 6, tx: tg[i].x, ty: tg[i].y, delay: Math.random() * 250 });
    });
    st.motes = Array.from({ length: Math.min(500, chars.length * 2) }, () => {
      const c = chars[Math.floor(Math.random() * chars.length)] || { x: vw / 2, y: vh / 2 };
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 260;
      return { x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 900 + Math.random() * 1300, delay: Math.random() * 900 };
    });
    const { W, H } = bookGeom(1);
    st.sEnd = Math.max(vw / 2 / W, vh / 2 / (H / 2)) * 1.25;
    st.planets = layoutPlanets(results);
    st.jobs = st.planets.map(texJob);
    const G = figGeom();
    st.pg = prepGhost();   // 有照片就用照片虛影，否則使用程式繪製的人物
    if (st.pg) {
      st.dust = st.pg.dust.map(p => Object.assign(p, {
        sx: Math.random() * vw, sy: Math.random() * vh * 0.8, delay: Math.random() * 600, ph: Math.random() * 6.28,
      }));
      st.bookUp = st.pg.P(...GHOST.up);
    } else {
      st.dust = sampleFigure();
      st.bookUp = bookCenter(G, 1);
    }
    // 最後書本放大到與統整頁的書本同樣大小
    st.zoomEnd = Math.min(vw * 0.92, 1040) / (bookGeom(figBookScale(G)).W * 2.16);
    root.querySelector('.gc-skip').addEventListener('click', () => finish(false));
    st.key = e => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
    window.addEventListener('keydown', st.key, true);
    st.score = typeof Sound !== 'undefined' ? Sound.gacha(st.T, results) : null;
    st.raf = requestAnimationFrame(frame);
  }

  /** 鏡頭：轉向書本（平移 + 放大），parallax 為星空的跟隨比例 */
  function camera(ctx, t, parallax) {
    const T = st.T, e = easeInOut(prog(t, T.turn, T.turned));
    const d = st.dpr;
    if (e <= 0) { ctx.setTransform(d, 0, 0, d, 0, 0); return 0; }
    const cx = st.vw / 2, cy = st.vh / 2;
    const Z = Math.exp(Math.log(st.zoomEnd) * e * parallax);
    const fx = lerp(cx, st.bookUp[0], e * parallax), fy = lerp(cy, st.bookUp[1], e * parallax);
    const tx = cx, ty = lerp(cy, cy - 34, e);
    ctx.setTransform(d * Z, 0, 0, d * Z, d * (tx - fx * Z), d * (ty - fy * Z));
    return e;
  }

  function frame(now) {
    if (!st) return;
    const t = now - st.t0, dt = Math.min(0.05, (now - st.last) / 1000);
    st.last = now;
    const T = st.T, B = st.back, F = st.front, vw = st.vw, vh = st.vh, cx = vw / 2, cy = vh / 2, d = st.dpr;
    // 每一幀重設狀態（瀏覽器回收畫布記憶體時會重置）
    B.setTransform(d, 0, 0, d, 0, 0); F.setTransform(d, 0, 0, d, 0, 0);
    B.globalCompositeOperation = F.globalCompositeOperation = 'source-over';
    B.globalAlpha = F.globalAlpha = 1;
    F.clearRect(0, 0, vw, vh);

    const job = st.jobs.find(j => !j.done);
    if (job) job.step(t >= T.planet0 ? Infinity : performance.now() + 6);

    // ---- 底層：背景／星空 ----
    if (t < T.space) {
      B.clearRect(0, 0, vw, vh);
      B.fillStyle = `rgba(3,4,10,${prog(t, 0, 1100)})`;
      B.fillRect(0, 0, vw, vh);
    } else if (t < T.settle) {
      const k = prog(t, T.space, T.settle);
      B.fillStyle = `rgba(3,4,10,${lerp(0.16, 0.3, k)})`;
      B.fillRect(0, 0, vw, vh);
      stepStars(dt, lerp(0.75, 0.02, easeOut(k)), lerp(0.3, 0.09, k));
      drawWarp(B);
    } else {
      if (!st.frozen) { st.frozen = true; freezeSky(); }
      B.fillStyle = 'rgba(3,4,10,0.35)';
      B.fillRect(0, 0, vw, vh);
      st.rotAcc += 0.085 * dt;
      camera(B, t, 0.3);
      drawStarTrails(B, st.rotAcc, Math.min(0.62, st.rotAcc * 0.9 + 0.02));
      B.setTransform(d, 0, 0, d, 0, 0);
    }

    // ---- 1 & 2：文字四散、匯聚 ----
    if (t < T.grow) {
      const glow = prog(t, 200, 1300) * (1 - prog(t, T.form, T.grow));
      if (glow > 0) {
        const g = F.createRadialGradient(cx, cy, 0, cx, cy, Math.max(vw, vh) * 0.6);
        g.addColorStop(0, `rgba(255,205,110,${0.32 * glow})`); g.addColorStop(1, 'rgba(255,205,110,0)');
        F.fillStyle = g; F.fillRect(0, 0, vw, vh);
      }
      F.save(); F.globalCompositeOperation = 'lighter';
      for (const m of st.motes) {
        const k = (t - m.delay) / m.life;
        if (k <= 0 || k >= 1) continue;
        const e = easeOut(k);
        F.fillStyle = `rgba(255,214,140,${0.8 * Math.sin(k * Math.PI)})`;
        F.fillRect(m.x + m.vx * e, m.y + m.vy * e + 30 * k * k, 1.6, 1.6);
      }
      F.restore();
      const fade = 1 - prog(t, T.form, T.form + 500);
      F.textAlign = 'center'; F.textBaseline = 'middle';
      for (const p of st.parts) {
        const k1 = easeOut(prog(t, p.delay, T.converge));
        const k2 = easeInOut(prog(t, T.converge + p.delay * 0.5, T.form));
        const sx = p.x + p.vx * k1, sy = p.y + p.vy * k1;
        const x = lerp(sx, p.tx, k2), y = lerp(sy, p.ty, k2);
        const rot = p.vr * k1 * (1 - k2);
        const col = mix3(p.color, GOLD, prog(t, 0, 900));
        F.save();
        F.translate(x, y); F.rotate(rot);
        F.globalAlpha = fade;
        F.font = p.font.replace(/[\d.]+px/, Math.max(6, lerp(p.size, 9, k2)).toFixed(1) + 'px');
        F.shadowColor = 'rgba(255,200,90,.9)';
        F.shadowBlur = 12 * prog(t, 100, 900);
        F.fillStyle = rgba(col, 1);
        F.fillText(p.ch, 0, 0);
        F.restore();
      }
    }

    // ---- 3：書本出現、放大、墜入 ----
    if (t >= T.form && t < T.space) {
      let s, speed;
      if (t < T.grow) { s = st.s0; speed = 0.04; }
      else if (t < T.fall) { s = lerp(st.s0, 1, easeInOut(prog(t, T.grow, T.fall))); speed = 0.06; }
      else { const k = prog(t, T.fall, T.space); s = Math.pow(st.sEnd, k * k); speed = lerp(0.06, 0.75, k); }
      stepStars(dt, speed, 0.15);
      const a = prog(t, T.form, T.form + 500);
      if (t < T.form + 700) {
        const fl = bell(t, T.form, T.form + 700);
        F.fillStyle = `rgba(255,220,150,${0.3 * fl})`; F.fillRect(0, 0, vw, vh);
      }
      drawBook(F, cx, cy, s, a, () => drawDots(F, st.f * s / st.sEnd));
    }

    // ---- 4：星球凝聚、星座連線、被書本吸收 ----
    const turnE = camera(F, t, 1);
    if (t >= T.planet0 - 200 && t < T.turned) {
      const dim = clamp(1 - 0.45 * prog(t, T.ghost, T.formed) + 0.45 * prog(t, T.raised, T.absorb + 300), 0, 1);
      if (turnE === 0) {
        const sun = F.createRadialGradient(vw * 0.06, vh * 0.05, 0, vw * 0.06, vh * 0.05, Math.min(vw, vh) * 0.7);
        sun.addColorStop(0, `rgba(255,236,200,${0.16 * prog(t, T.planet0 - 200, T.planet0 + 1200) * (1 - prog(t, T.absorb, T.absorbEnd))})`); sun.addColorStop(1, 'rgba(255,236,200,0)');
        F.save(); F.globalCompositeOperation = 'lighter'; F.fillStyle = sun; F.fillRect(0, 0, vw, vh); F.restore();
      }
      const orbit = st.rotAcc * 0.18;
      const pos = st.planets.map(pl => {
        const dx = pl.x0 - cx, dy = pl.y0 - cy, c = Math.cos(orbit), s = Math.sin(orbit);
        return [cx + dx * c - dy * s, cy + dx * s + dy * c + Math.sin(t * 0.0008 + pl.seed) * 3];
      });
      if (st.planets.length > 1) {
        const lk = prog(t, T.planetsDone, T.linkEnd), la = lk * (1 - prog(t, T.ghost, T.formed));
        if (la > 0) {
          F.save(); F.globalCompositeOperation = 'lighter';
          F.strokeStyle = `rgba(255,222,160,${0.4 * la})`; F.lineWidth = 1;
          F.setLineDash([4, 6]);
          const total = pos.length - 1, drawn = lk * total;
          F.beginPath(); F.moveTo(pos[0][0], pos[0][1]);
          for (let i = 1; i <= total; i++) {
            const seg = clamp(drawn - (i - 1), 0, 1);
            if (seg <= 0) break;
            F.lineTo(lerp(pos[i - 1][0], pos[i][0], seg), lerp(pos[i - 1][1], pos[i][1], seg));
          }
          F.stroke(); F.restore();
        }
      }
      const Bc = st.bookUp;
      st.planets.forEach((pl, i) => {
        const k = prog(t, T.planet0 + i * T.gap, T.planet0 + i * T.gap + T.appear);
        if (k <= 0) return;
        const ar = (t - (T.absorb + i * T.agap)) / T.adur;   // 吸收進度
        pl.absorbed = ar >= 1;
        if (ar <= 0) { drawPlanet(F, pl, t, pos[i][0], pos[i][1], k, dim); return; }
        if (ar >= 1) {
          // 進入書本的瞬間：以星球顏色綻放
          const b = prog(ar, 1, 1.45);
          if (b < 1) {
            F.save(); F.globalCompositeOperation = 'lighter';
            const rr = pl.R * (0.6 + 2.4 * easeOut(b));
            const g = F.createRadialGradient(Bc[0], Bc[1], 0, Bc[0], Bc[1], rr);
            g.addColorStop(0, rgba(PAL[pl.rarity].glow, 0.55 * (1 - b))); g.addColorStop(1, rgba(PAL[pl.rarity].glow, 0));
            F.fillStyle = g; F.beginPath(); F.arc(Bc[0], Bc[1], rr, 0, Math.PI * 2); F.fill();
            F.restore();
          }
          return;
        }
        // 沿弧線被拉進書本：加速、縮小、留下光跡
        const P0 = pos[i], dx = Bc[0] - P0[0], dy = Bc[1] - P0[1], L = Math.hypot(dx, dy) || 1, side = i % 2 ? 1 : -1;
        const C = [(P0[0] + Bc[0]) / 2 - dy / L * L * 0.38 * side, (P0[1] + Bc[1]) / 2 + dx / L * L * 0.38 * side];
        const at = kk => { const m = 1 - kk; return [m * m * P0[0] + 2 * m * kk * C[0] + kk * kk * Bc[0], m * m * P0[1] + 2 * m * kk * C[1] + kk * kk * Bc[1]]; };
        const ke = Math.pow(ar, 1.7);
        F.save(); F.globalCompositeOperation = 'lighter';
        for (let j = 14; j >= 1; j--) {
          const kj = Math.max(0, ke - j * 0.028), q = at(kj);
          F.fillStyle = rgba(PAL[pl.rarity].glow, 0.22 * (1 - j / 15) * (1 - ke * 0.5));
          F.beginPath(); F.arc(q[0], q[1], pl.R * (1 - 0.85 * kj) * (0.55 - j * 0.03), 0, Math.PI * 2); F.fill();
        }
        F.restore();
        const q = at(ke);
        F.save(); F.globalAlpha = 1 - smooth(0.8, 1, ar);
        drawPlanet(F, pl, t, q[0], q[1], 1, 1, 1 - 0.88 * ke);
        F.restore();
      });
    }

    // ---- 5：人類虛影、舉書、鏡頭轉向書本 ----
    if (t >= T.ghost) {
      const form = prog(t, T.ghost + 300, T.formed);
      const raise = prog(t, T.raise, T.raised);
      const figA = 1 - prog(t, T.turn, T.turn + 800);
      let flash = 0, absorbed = 0;
      st.planets.forEach((pl, i) => {
        const arrive = T.absorb + i * T.agap + T.adur;
        if (t >= arrive) absorbed++;
        flash += bell(t, arrive, arrive + 450) * (pl.rarity === 5 ? 1 : pl.rarity === 4 ? 0.6 : 0.35);
      });
      const book = {
        alpha: form * form,
        sy: lerp(lerp(1, 0.78, smooth(0.4, 1, raise)), 1, turnE),
        glow: clamp(absorbed / st.planets.length * 0.7 + flash * 0.6, 0, 1.4),
        reveal: prog(t, T.turned - 300, T.end),
      };
      if (figA > 0.01) {
        const fig = st.pg ? drawPhotoGhost(F, t, form, raise, figA, book) : drawFigure(F, t, form, raise, figA, book);
        drawDust(F, t, figA * (1 - 0.6 * form), fig);
      } else {
        const bc = st.pg ? photoBookPos(st.pg, t, 1) : st.bookUp;
        drawHeldBook(F, figGeom(), t, bc, book.alpha, book.sy, book.glow, book.reveal);
      }
    }

    // ---- 暗角 ----
    F.setTransform(d, 0, 0, d, 0, 0);
    if (t >= T.fall) {
      const v = F.createRadialGradient(cx, cy, Math.min(vw, vh) * 0.35, cx, cy, Math.max(vw, vh) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${0.55 * prog(t, T.fall, T.space)})`);
      F.fillStyle = v; F.fillRect(0, 0, vw, vh);
    }

    if (t >= T.end) return finish(false);
    st.raf = requestAnimationFrame(frame);
  }

  function finish(silent) {
    if (!st) return;
    const s = st;
    st = null;
    cancelAnimationFrame(s.raf);
    window.removeEventListener('keydown', s.key, true);
    document.body.classList.remove('gacha-cine');
    s.root.classList.add('out');
    setTimeout(() => s.root.remove(), 600);
    if (s.score) s.score.stop(!silent && performance.now() - s.t0 >= s.T.end - 50);   // 自然播完讓尾音延續，跳過則快速淡出
    if (!silent && s.onDone) s.onDone(s.results);
  }

  return {
    play, get playing() { return !!st; },
    /** 除錯用：跳到演出的第 ms 毫秒；pause = true 時停在該畫面 */
    seek(ms, pause) {
      if (!st) return;
      st.t0 = performance.now() - ms;
      if (pause) { cancelAnimationFrame(st.raf); st.paused = true; const now = performance.now(); st.last = now - 16; frame(now); if (st) cancelAnimationFrame(st.raf); }
    },
    pause() { if (st) { cancelAnimationFrame(st.raf); st.paused = true; } },
    resume() { if (st && st.paused) { st.paused = false; st.last = performance.now(); st.raf = requestAnimationFrame(frame); } },
  };
})();
