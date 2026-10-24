'use strict';
/* =========================================================
 * 時序之戰 — 角色立繪（來源：人類使用處/，經 tools/embed-art.js 內嵌）
 * 透明 PNG 直接保留 alpha；舊白底素材才自動去背，
 * 並記錄臉部與上半身的位置，供角色卡、行動軸頭像、立繪與終結技演出使用。
 * ========================================================= */

const Art = (() => {
  // 莫卡兄弟有兩種素材：一張雙人圖（莫卡兄弟），或兄、弟分開的兩張圖。
  // 分開時兩人各自可用（mocha_elder / mocha_younger，短片裡使用），另外合成一張雙人圖給角色卡等地方當 mocha 使用。
  const FILE = { longzhao: '龍爪', kane: '凱恩', mocha: '莫卡兄弟', mocha_elder: '莫卡兄弟-兄-代理執行', mocha_younger: '莫卡兄弟-弟-代理執行', alan: '阿蘭', gordon: '戈登', alexandra: '亞力山卓', alexandra_car: '亞力山卓與警車', police_car: '警車', otg: 'O.T.G.', raiden: '自律處刑官・「雷霆-09型」', raiden_phase2: '自律處刑官・「雷霆-09型」-第二階段', raiden_kane: '自律處刑官・「雷霆-09型」-異相凱恩', hanye: '寒夜', mark: '馬克', miller: '米勒' };
  // face = 臉部中心、bust = 上半身中心：大於 1 的數字是原圖像素座標，小於等於 1 是比例
  // bg：'white' 白底（預設）、'smooth' 平滑漸層的深色背景（以顏色連續性判斷背景）、
  //     'fade' 邊緣淡出、'whiteFade' 先去白邊再淡出、'alpha' 原圖已是透明背景（不處理）
  const FOCUS = {
    kane:          { face: [0.50, 0.115], bust: [0.50, 0.28], bg: 'alpha' },      // 永滅故事集、證物與交錯紅線
    mocha: { face: [0.53, 0.15], bust: [0.53, 0.38], faces: [[0.425,0.22],[0.635,0.09]], bg: 'alpha' },      // 已確認的多視角立繪
    mocha_elder:   { face: [0.55, 0.145], bust: [0.53, 0.34], bg: 'alpha' },
    mocha_younger: { face: [0.50, 0.115], bust: [0.51, 0.31], bg: 'alpha' },       // 透明背景（換新圖）
    alan: { face: [0.39, 0.28], bust: [0.40, 0.43], bg: 'alpha' },      // 已確認的多視角立繪
    longzhao: { face: [0.62, 0.155], bust: [0.59, 0.34], bg: 'alpha' },      // 已確認的多視角立繪
    gordon: { face: [0.445, 0.21], bust: [0.47, 0.39], bg: 'alpha' },      // 已確認的多視角立繪
    alexandra: { face: [0.53, 0.12], bust: [0.53, 0.30], bg: 'alpha' },      // 已確認的多視角立繪
    alexandra_car: { face: [0.53, 0.12], bust: [0.53, 0.30], bg: 'alpha' },      // 已確認的多視角立繪
    police_car:    { face: [0.5, 0.45], bust: [0.5, 0.5], bg: 'alpha' },        // 警車本身（秘技、終結技演出用）
    raiden:        { face: [0.53, 0.075], bust: [0.5, 0.28], bg: 'alpha' },     // 首領：自律處刑官・「雷霆-09型」（透明背景，敵人卡與演出用）
    raiden_kane:   { face: [0.50, 0.105], bust: [0.50, 0.29], bg: 'alpha' },    // 彩蛋：異相凱恩，兩階段沿用此造型
    raiden_phase2: { face: [0.53, 0.075], bust: [0.55, 0.25], bg: 'alpha' },     // 第二階段：盾甲展開、電容核心外露
    otg: { face: [0.51, 0.22], bust: [0.51, 0.43], bg: 'alpha' },      // 已確認的多視角立繪
    hanye: { face: [0.65, 0.17], bust: [0.60, 0.34], bg: 'alpha' },      // 已確認的多視角立繪
    mark: { face: [0.66, 0.30], bust: [0.58, 0.48], bg: 'alpha' },      // 已確認的多視角立繪
    miller: { face: [0.32, 0.19], bust: [0.47, 0.38], bg: 'alpha' },      // 已確認的多視角立繪
  };
  const data = {};
  const waiting = [];
  let ready = false;

  /**
   * 從四邊往內填滿「接近白色、低彩度」的像素並設為透明，邊緣做柔化。
   * holes：另外清掉被人物圍住、面積夠大且接近純白的區塊（手臂與身體之間的白底），小塊的亮部（皮膚反光、白髮）保留。
   */
  function removeWhite(img, holes) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, W, H); } catch (e) { return c; }
    const p = d.data;
    const bgLike = i => { const r = p[i], gg = p[i + 1], b = p[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); return mx > 222 && mx - mn < 28; };
    const mark = new Uint8Array(W * H);   // 1 = 背景
    const stack = new Int32Array(W * H);
    let sp = 0;
    const push = k => { if (!mark[k] && bgLike(k * 4)) { mark[k] = 1; stack[sp++] = k; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (sp) {
      const k = stack[--sp], x = k % W;
      if (x > 0) push(k - 1);
      if (x < W - 1) push(k + 1);
      if (k >= W) push(k - W);
      if (k < W * (H - 1)) push(k + W);
    }
    if (holes) {
      const pure = i => { const r = p[i], gg = p[i + 1], b = p[i + 2], mn = Math.min(r, gg, b); return mn > 236 && Math.max(r, gg, b) - mn < 14; };
      const seen = new Uint8Array(W * H), comp = new Int32Array(W * H), minArea = W * H * 0.00015;
      for (let s0 = 0; s0 < W * H; s0++) {
        if (mark[s0] || seen[s0] || !pure(s0 * 4)) continue;
        let n = 0; sp = 0; stack[sp++] = s0; seen[s0] = 1;
        while (sp) {
          const k = stack[--sp], x = k % W;
          comp[n++] = k;
          const nb = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k >= W ? k - W : -1, k < W * (H - 1) ? k + W : -1];
          for (const q of nb) if (q >= 0 && !seen[q] && !mark[q] && pure(q * 4)) { seen[q] = 1; stack[sp++] = q; }
        }
        if (n >= minArea) for (let i = 0; i < n; i++) mark[comp[i]] = 1;
      }
    }
    for (let k = 0; k < W * H; k++) {
      const i = k * 4;
      if (mark[k]) { p[i + 3] = 0; continue; }
      const x = k % W;
      const edge = (x > 0 && mark[k - 1]) || (x < W - 1 && mark[k + 1]) || (k >= W && mark[k - W]) || (k < W * (H - 1) && mark[k + W]);
      if (edge) {
        const lum = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
        p[i + 3] = Math.min(255, Math.max(60, (255 - lum) * 3.2));
      }
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  /* ---------- 敵人：水墨剪影素材 → 依敵人類型重新上色 ----------
   * 素材是白底黑墨的剪影。去掉外圍白底後，依亮度上色：墨色部分為深色本體，
   * 內部的亮部（眼睛、臉、外框的灰邊）變成該類型的發光色。face = 原圖中臉部位置（比例）。 */
  const ENEMY_SRC = {
    shade: { file: '敵人素材1', face: [0.34, 0.085] },   // 細長的影子人
    stag:  { file: '敵人素材2', face: [0.5, 0.56] },     // 滴墨的鹿首
    angel: { file: '敵人素材3', face: [0.3, 0.275] },    // 墮天使
  };
  const ENEMY_LOOK = {
    thug:   { src: 'shade', light: [255, 86, 66],   ink: [10, 8, 12] },
    guard:  { src: 'shade', light: [140, 182, 255], ink: [8, 10, 20], flip: true },
    binder: { src: 'stag',  light: [196, 138, 255], ink: [12, 8, 20] },
    medic:  { src: 'stag',  light: [110, 250, 196], ink: [6, 14, 12], flip: true },
    boss:   { src: 'angel', light: [255, 224, 166], ink: [14, 9, 6] },
    raiden: { src: 'angel', light: [150, 200, 255], ink: [6, 8, 18], flip: true },   // 雷霆-09型：電光藍
  };
  const enemy = {};
  function buildEnemies(srcKey, img) {
    const cut = removeWhite(img), W = cut.width, H = cut.height, jobs = [];
    let d;
    try { d = cut.getContext('2d').getImageData(0, 0, W, H).data; } catch (e) { return Promise.resolve(); }
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0 || y1 <= y0) return Promise.resolve();
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = Math.min(1, 480 / bh);
    const tw = Math.round(bw * sc), th = Math.round(bh * sc);
    const f = ENEMY_SRC[srcKey].face;
    const face = [(f[0] * W - x0) / bw, (f[1] * H - y0) / bh];
    Object.entries(ENEMY_LOOK).filter(([, L]) => L.src === srcKey).forEach(([type, L]) => {
      const c = document.createElement('canvas'); c.width = tw; c.height = th;
      const g = c.getContext('2d');
      if (L.flip) { g.translate(tw, 0); g.scale(-1, 1); }
      g.drawImage(cut, x0, y0, bw, bh, 0, 0, tw, th);
      const id = g.getImageData(0, 0, tw, th), p = id.data;
      for (let i = 0; i < p.length; i += 4) {
        if (!p[i + 3]) continue;
        const l = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) / 255;
        const t = Math.min(1, Math.max(0, (l - 0.28) / 0.6)), k = t * t * (3 - 2 * t);
        for (let j = 0; j < 3; j++) p[i + j] = L.ink[j] + (L.light[j] - L.ink[j]) * k;
      }
      g.putImageData(id, 0, 0);
      const info = { w: tw, h: th, face: L.flip ? [1 - face[0], face[1]] : face, light: L.light, url: null, canvas: c };
      jobs.push(new Promise(res => c.toBlob(b => { info.url = b ? URL.createObjectURL(b) : c.toDataURL('image/png'); enemy[type] = info; res(); }, 'image/png')));
    });
    return Promise.all(jobs);
  }

  function load() {
    if (typeof ART_IMAGES === 'undefined') { ready = true; return; }
    const keys = Object.keys(FILE).filter(k => ART_IMAGES[FILE[k]]);
    const ekeys = Object.keys(ENEMY_SRC).filter(k => ART_IMAGES[ENEMY_SRC[k].file]);
    let left = keys.length + ekeys.length;
    if (!left) { ready = true; return; }
    const done = () => { if (--left === 0) { ready = true; waiting.splice(0).forEach(f => f()); } };
    ekeys.forEach((k, n) => {
      const img = new Image();
      img.onload = () => setTimeout(() => { buildEnemies(k, img).then(done, done); }, 300 + n * 60);
      img.onerror = done;
      img.src = ART_IMAGES[ENEMY_SRC[k].file];
    });
    const finish = () => { composeMocha().then(done, done); };   // 最後一步：兄弟分開的素材合成雙人圖
    left += 1;
    keys.forEach((k, n) => {
      const img = new Image();
      img.onload = () => setTimeout(() => {   // 分散處理，避免啟動時卡頓
        const f = FOCUS[k], W = img.naturalWidth, H = img.naturalHeight;
        const cut = f.bg === 'smooth' ? removeSmooth(img, f.th, f.bottom) : f.bg === 'fade' ? fadeEdges(img)
          : f.bg === 'whiteFade' ? fadeEdges(removeWhite(img)) : f.bg === 'alpha' ? asCanvas(img) : removeWhite(img, f.holes);
        const px = (v, d) => (v <= 1 ? v * d : v);
        const facePx = [px(f.face[0], W), px(f.face[1], H)], bustPx = [px(f.bust[0], W), px(f.bust[1], H)];
        const info = { w: W, h: H, raw: ART_IMAGES[FILE[k]],
          face: [facePx[0] / W, facePx[1] / H], bust: [bustPx[0] / W, bustPx[1] / H],
          facePx, url: null, canvas: cut };   // canvas：終結技演出直接繪製用
        info.top = figureTop(cut, info.face[0], info.face[1]);
        const ready = () => { data[k] = info; if (--pending === 0) finish(); done(); };
        cut.toBlob(b => {
          info.url = b ? URL.createObjectURL(b) : info.raw;
          if (!f.faces) return ready();
          // 新雙人原圖也建立雙臉頭像，避免行動條／終結技按鈕只裁到其中一人。
          const portrait = document.createElement('canvas'); portrait.width = portrait.height = 512;
          const g = portrait.getContext('2d'), scale = 180 / (H * .14);
          f.faces.forEach(([x,y], i) => {
            g.save(); g.beginPath(); g.rect(i * 256, 0, 256, 512); g.clip();
            g.drawImage(cut, i * 256 + 128 - x * W * scale, 180 - y * H * scale, W * scale, H * scale);
            g.restore();
          });
          info.duo = true; info.faceCanvas = portrait;
          portrait.toBlob(b => { info.faceUrl = b ? URL.createObjectURL(b) : portrait.toDataURL('image/png'); ready(); }, 'image/png');
        }, 'image/png');
      }, n * 60);
      img.onerror = () => { if (--pending === 0) finish(); done(); };
      img.src = ART_IMAGES[FILE[k]];
    });
    let pending = keys.length;
    if (!pending) finish();
  }
  /**
   * 人物頭頂的位置（比例）：在臉部左右 ±12% 寬的範圍內，找臉部以上最高的一列不透明像素。
   * 角色卡的破格立繪用它確保不會削到頭頂（頭上有傘、帽子等也會一起算進去）。
   */
  function figureTop(cv, fx, fy) {
    const W = cv.width, H = cv.height;
    let d;
    try { d = cv.getContext('2d').getImageData(0, 0, W, Math.max(1, Math.round(fy * H))).data; } catch (e) { return null; }
    const x0 = Math.max(0, Math.round((fx - 0.12) * W)), x1 = Math.min(W - 1, Math.round((fx + 0.12) * W)), rows = Math.round(fy * H);
    for (let y = 0; y < rows; y++) {
      let n = 0;
      for (let x = x0; x <= x1; x++) if (d[(y * W + x) * 4 + 3] > 40 && ++n > 3) return y / H;
    }
    return fy;
  }
  /** 雙人立繪先對齊兩人的臉；小頭像另合成雙人近景，避免高倍率只截到一人。 */
  function composeMocha() {
    const A = data.mocha_elder, B = data.mocha_younger;
    if (data.mocha || !A || !B) return Promise.resolve();
    const h = Math.max(A.h, B.h), sa = h / A.h, sb = h / B.h;
    const wa = A.w * sa, wb = B.w * sb, off = wa * 0.46, W = Math.round(off + wb);
    const fy = Math.max(A.facePx[1] * sa, B.facePx[1] * sb);
    const ay = fy - A.facePx[1] * sa, by = fy - B.facePx[1] * sb, H = Math.ceil(h + Math.max(ay, by));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(B.canvas, off, by, wb, h);
    g.drawImage(A.canvas, 0, ay, wa, h);
    const facePx = [(A.facePx[0] * sa + off + B.facePx[0] * sb) / 2, fy];
    const bust = [(A.bust[0] * wa + off + B.bust[0] * wb) / 2 / W,
      (ay + A.bust[1] * h + by + B.bust[1] * h) / 2 / H];
    const info = { w: W, h: H, face: [facePx[0] / W, fy / H], bust, facePx, url: null, canvas: c, duo: true };
    info.top = Math.min(ay + (A.top || 0) * h, by + (B.top || 0) * h) / H;
    const portrait = document.createElement('canvas'); portrait.width = portrait.height = 512;
    const pg = portrait.getContext('2d');
    [A, B].forEach((a, i) => {
      const sc = 152 / Math.max(40, (a.bust[1] - a.face[1]) * a.h);
      pg.save(); pg.beginPath(); pg.rect(i * 256, 0, 256, 512); pg.clip();
      pg.drawImage(a.canvas, i * 256 + 128 - a.facePx[0] * sc, 200 - a.facePx[1] * sc, a.w * sc, a.h * sc);
      pg.restore();
    });
    info.faceCanvas = portrait;
    const url = (cv, prop) => new Promise(res => cv.toBlob(b => {
      info[prop] = b ? URL.createObjectURL(b) : cv.toDataURL('image/png'); res();
    }, 'image/png'));
    return Promise.all([url(c, 'url'), url(portrait, 'faceUrl')]).then(() => { data.mocha = info; });
  }
  /**
   * 深色漸層背景的去背：從上、左、右三邊與底邊兩側往內擴張，
   * 只要相鄰像素的顏色變化很小（背景是平滑的漸層與光暈），就視為背景。
   * 人物輪廓的顏色會突然改變，擴張就停在那裡。底邊中段（人物的腳）不當作起點。
   */
  function removeSmooth(img, th, wholeBottom) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, W, H); } catch (e) { return c; }
    const p = d.data, mark = new Uint8Array(W * H), stack = new Int32Array(W * H);
    let sp = 0;
    const TH = th || 20;
    const near = (a, b) => Math.abs(p[a] - p[b]) + Math.abs(p[a + 1] - p[b + 1]) + Math.abs(p[a + 2] - p[b + 2]) < TH;
    const seed = k => { if (!mark[k]) { mark[k] = 1; stack[sp++] = k; } };
    for (let x = 0; x < W; x++) { seed(x); if (wholeBottom || x < W * 0.28 || x > W * 0.82) seed((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
    while (sp) {
      const k = stack[--sp], x = k % W, i = k * 4;
      const tryN = n => { if (!mark[n] && near(i, n * 4)) { mark[n] = 1; stack[sp++] = n; } };
      if (x > 0) tryN(k - 1);
      if (x < W - 1) tryN(k + 1);
      if (k >= W) tryN(k - W);
      if (k < W * (H - 1)) tryN(k + W);
    }
    for (let k = 0; k < W * H; k++) {
      if (mark[k]) { p[k * 4 + 3] = 0; continue; }
      const x = k % W;
      const n = (x > 0 && mark[k - 1]) + (x < W - 1 && mark[k + 1]) + (k >= W && mark[k - W]) + (k < W * (H - 1) && mark[k + W]);
      if (n) p[k * 4 + 3] = 255 - n * 45;   // 輪廓柔化
    }
    g.putImageData(d, 0, 0);
    return c;
  }
  function asCanvas(img) {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }
  /** 無法去背的近景圖：保留整張，四邊漸漸透明（底部與兩側淡出較長），融入場景（img 可以是圖片或畫布） */
  function fadeEdges(img) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    const ramp = (x0, y0, x1, y1, len) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(len, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    };
    ramp(0, 0, 0, H, 0.06);   // 上
    ramp(0, H, 0, 0, 0.22);   // 下
    ramp(0, 0, W, 0, 0.16);   // 左
    ramp(W, 0, 0, 0, 0.16);   // 右
    g.globalCompositeOperation = 'source-over';
    return c;
  }
  load();

  // Use the unit's displayed snapshot, never the engine's already-resolved state.
  // Missing phase artwork falls back to the base form while assets are loading.
  let raidenSkin = 'raiden';
  function enemyKey(unit) {
    const type = typeof unit === 'string' ? unit : unit && unit.type;
    if (type === 'raiden' && raidenSkin === 'kane' && data.raiden_kane) return 'raiden_kane';
    return type === 'raiden' && unit.phase2 && data.raiden_phase2 ? 'raiden_phase2' : type;
  }
  return {
    get: k => data[k] || null,
    enemyKey,
    setRaidenSkin(value) { raidenSkin = value === 'kane' ? 'kane' : 'raiden'; },
    /** 專屬首領立繪依階段選擇，其餘保留依類型上色的剪影。 */
    enemy(unit) {
      const key = enemyKey(unit), portrait = data[key];
      return portrait ? Object.assign({ light: key === 'raiden_kane' ? [190, 65, 90] : key === 'raiden_phase2' ? [110, 200, 255] : [255, 210, 80] }, portrait)
        : enemy[typeof unit === 'string' ? unit : unit && unit.type] || null;
    },
    /** CSS：以敵人臉部為中心的背景（行動軸、波次小頭像用），底下墊一層該類型的發光色 */
    enemyBg(t, size) {
      const a = enemy[t];
      if (!a) return '';
      const [r, g, b] = a.light;
      return `background-image:url(${a.url}),radial-gradient(circle at 50% 42%,rgba(${r},${g},${b},.38),rgba(${r},${g},${b},0) 68%);` +
        `background-size:${size || 300}% auto,100% 100%;background-repeat:no-repeat;` +
        `background-position:${(a.face[0] * 100).toFixed(1)}% ${(a.face[1] * 100).toFixed(1)}%,center`;
    },
    onReady(fn) { if (ready) fn(); else waiting.push(fn); },
    /** CSS：以臉部或上半身為中心的背景定位 */
    bg(k, focus, size) {
      const a = data[k];
      if (!a) return '';
      const f = a[focus || 'bust'];
      if (focus === 'face' && a.duo && a.faceUrl) return `background-image:url(${a.faceUrl});background-size:100% 100%;background-position:center`;
      // Face portraits are square (the action-strip portrait is nearly square).
      // CSS percentages position the free space around the scaled image, not
      // the point inside it; convert the anchor so full-body art stays centered.
      if (focus === 'face') {
        const sx = (size || 170) / 100, sy = sx * a.h / a.w;
        const pos = (v, scale) => Math.abs(scale - 1) < 1e-6 ? 50 : (v * scale - 0.5) / (scale - 1) * 100;
        return `background-image:url(${a.url});background-size:${size || 170}% auto;background-position:${pos(f[0], sx).toFixed(2)}% ${pos(f[1], sy).toFixed(2)}%`;
      }
      return `background-image:url(${a.url});background-size:${size || 170}% auto;background-position:${(f[0] * 100).toFixed(1)}% ${(f[1] * 100).toFixed(1)}%`;
    },
  };
})();
