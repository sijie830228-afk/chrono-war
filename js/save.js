'use strict';
/* =========================================================
 * 時序之戰 — 存檔系統
 * 3 個存檔欄位，每個欄位包含：玩家資料（背包、抽卡、體力、動作紀錄…）、戰鬥設定、進行中的戰鬥。
 * 任何變動都會自動寫入「使用中」的欄位；也可以匯出成 .json 檔案備份，或從檔案匯入。
 * ========================================================= */

const SaveSys = (() => {
  const SLOT_COUNT = 3;
  const PREFIX = 'shixu_slot_';
  const ACTIVE_KEY = 'shixu_active_slot';
  const FORMAT = 'shixu-save';
  const VERSION = 2;

  let active = 1;
  let timer = null;
  let hooks = { cfg: () => null, battle: () => null, status: () => {} };
  let lastSaved = null, lastError = null;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { lastError = e; return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } }

  function read(n) {
    try { const d = JSON.parse(lsGet(PREFIX + n) || 'null'); return valid(d) ? d : null; } catch (e) { return null; }
  }
  function valid(d) { return !!d && d.format === FORMAT && d.meta && d.meta.v === 1; }
  function write(n, d) { return lsSet(PREFIX + n, JSON.stringify(d)); }

  function snapshot(name) {
    const old = read(active);
    return {
      format: FORMAT, version: VERSION,
      name: name || (old && old.name) || `存檔 ${active}`,
      createdAt: (old && old.createdAt) || Date.now(),
      savedAt: Date.now(),
      meta: Meta.get(),
      cfg: hooks.cfg(),
      battle: hooks.battle(),
    };
  }

  /** 立即寫入使用中的欄位 */
  function saveNow() {
    clearTimeout(timer); timer = null;
    const d = snapshot();
    let ok = write(active, d);
    if (!ok && d.battle) {           // 空間不足時先放棄保存戰鬥紀錄
      d.battle.state.log = d.battle.state.log.slice(-100);
      ok = write(active, d);
      if (!ok) { d.battle = null; ok = write(active, d); }
    }
    if (ok) { lastSaved = d.savedAt; lastError = null; }
    hooks.status(ok, lastSaved, lastError);
    return ok;
  }
  /** 排程自動存檔（短時間內多次變動只寫一次） */
  function touch() {
    clearTimeout(timer);
    timer = setTimeout(saveNow, 400);
  }

  /** 啟動：讀取使用中的欄位；第一次使用時把舊版資料轉移進來 */
  function boot(h) {
    hooks = Object.assign(hooks, h);
    Meta.onSave = touch;
    active = Math.min(SLOT_COUNT, Math.max(1, parseInt(lsGet(ACTIVE_KEY), 10) || 1));
    let d = read(active);
    if (!d && !list().some(Boolean)) {
      let oldCfg = null;
      try { oldCfg = JSON.parse(lsGet('shixu_sandbox_cfg_v4') || 'null'); } catch (e) { /* 忽略 */ }
      const oldMeta = Meta.legacy();
      if (oldMeta || oldCfg) {
        Meta.init(oldMeta);
        Meta.record('system', '已從舊版自動存檔轉移進度');
        d = { format: FORMAT, version: VERSION, name: '存檔 1', createdAt: Date.now(), savedAt: Date.now(), meta: Meta.get(), cfg: oldCfg, battle: null };
        write(active, d);
      }
    }
    Meta.init(d ? d.meta : null);
    if (!d) Meta.record('system', '開始新遊戲');
    lsSet(ACTIVE_KEY, String(active));
    lastSaved = d ? d.savedAt : null;
    return d || { cfg: null, battle: null };
  }

  function list() { return Array.from({ length: SLOT_COUNT }, (_, i) => read(i + 1)); }

  /** 切換到另一個欄位並載入它 */
  function load(n) {
    if (timer) saveNow();
    const d = read(n);
    if (!d) return null;
    active = n;
    lsSet(ACTIVE_KEY, String(n));
    Meta.init(d.meta);
    lastSaved = d.savedAt;
    return d;
  }
  /** 把目前進度複製到欄位 n，並改用該欄位 */
  function saveAs(n, name) {
    active = n;
    lsSet(ACTIVE_KEY, String(n));
    const d = snapshot(name || `存檔 ${n}`);
    d.createdAt = Date.now();
    const ok = write(n, d);
    if (ok) lastSaved = d.savedAt;
    hooks.status(ok, lastSaved, lastError);
    return ok;
  }
  function remove(n) { lsDel(PREFIX + n); }
  function rename(n, name) {
    const d = read(n); if (!d) return;
    d.name = String(name || '').slice(0, 30) || `存檔 ${n}`;
    write(n, d);
  }
  /** 在欄位 n 開始新遊戲（玩家資料重置；戰鬥設定由呼叫端決定） */
  function newGame(n) {
    active = n;
    lsSet(ACTIVE_KEY, String(n));
    Meta.init(null);
    Meta.record('system', '開始新遊戲');
  }

  /* ---------- 匯出 / 匯入 ---------- */
  function exportSlot(n) {
    if (n === active) saveNow();
    const d = read(n);
    if (!d) return false;
    const t = new Date();
    const stamp = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}-${String(t.getHours()).padStart(2, '0')}${String(t.getMinutes()).padStart(2, '0')}`;
    const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `時序之戰存檔_${(d.name || '存檔').replace(/[\\/:*?"<>|]/g, '_')}_${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  }
  /** 驗證並寫入欄位 n；回傳錯誤訊息或 null */
  function importText(text, n) {
    let d;
    try { d = JSON.parse(text); } catch (e) { return '檔案不是有效的 JSON。'; }
    if (!valid(d)) return '這不是「時序之戰」的存檔檔案，或版本不相容。';
    d.savedAt = Date.now();
    if (!write(n, d)) return '瀏覽器儲存空間不足，無法匯入。';
    return null;
  }

  /** 欄位摘要（給存檔頁使用） */
  function summary(d) {
    const m = d.meta;
    const own = Object.values(m.owned.chars).reduce((a, b) => a + b, 0) + Object.values(m.owned.lcs).reduce((a, b) => a + b, 0);
    return {
      pulls: m.gacha.history.length, items: m.inv.length, own, shards: m.shards, crystals: m.crystals, stamina: m.stamina,
      actions: (m.activity || []).length, battle: d.battle && d.battle.state ? d.battle.state.phase : null,
      team: d.cfg && d.cfg.team ? d.cfg.team.filter(Boolean).map(k => CHARS[k] ? CHARS[k].name : k) : [],
      size: new Blob([JSON.stringify(d)]).size,
    };
  }

  window.addEventListener('beforeunload', () => { if (timer) saveNow(); });

  return {
    SLOT_COUNT, boot, touch, saveNow, list, read, load, saveAs, remove, rename, newGame, exportSlot, importText, summary,
    get active() { return active; }, get lastSaved() { return lastSaved; }, get lastError() { return lastError; },
  };
})();
