'use strict';
/* =========================================================
 * 時序之戰 — 存檔頁（欄位管理、匯出匯入、動作紀錄）與啟動流程
 * ========================================================= */

let actFilter = 'all';
let importTarget = null;
const ACT_TYPES = [['all', '全部'], ['gacha', '抽卡'], ['dungeon', '副本'], ['upgrade', '強化'], ['salvage', '分解'], ['equip', '裝備'],
  ['quote', '金句'], ['trace', '經緯'], ['battle', '戰鬥'], ['system', '系統']];
const ACT_NAME = Object.fromEntries(ACT_TYPES);

function tfmt(t, withDate) {
  if (!t) return '—';
  const d = new Date(t), p = n => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return withDate ? `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${time}` : time;
}
function showSaveStatus(ok, t, err) {
  const el = $('#saveStatus');
  if (!el) return;
  el.classList.toggle('bad', !ok);
  el.classList.toggle('ok', ok);
  el.dataset.tip = ok ? `存檔 ${SaveSys.active} · 已自動存檔 ${tfmt(t)}` : '存檔失敗：' + (err && err.message ? err.message : '瀏覽器儲存空間不足') + '，建議先匯出備份';
}

/** 套用剛載入的存檔（戰鬥設定、進行中的戰鬥） */
function applyLoaded(d) {
  CFG = mergeCfg(d && d.cfg);
  syncUiControls();
  if (!resumeBattle(d && d.battle)) startBattle({ dungeon: null, silent: true });
}

function renderSave() {
  const slots = SaveSys.list();
  const cur = SaveSys.active;
  let h = `<div class="dtop"><span>使用中：<b>存檔 ${cur}</b>${slots[cur - 1] ? `「${esc(slots[cur - 1].name)}」` : ''}</span>
    <span class="hint">上次存檔 ${tfmt(SaveSys.lastSaved, true)}　所有動作都會自動存檔</span>
    <button data-sv="now">立即存檔</button><button data-sv="export" data-n="${cur}">匯出目前進度</button></div>`;
  h += '<div class="slots">';
  slots.forEach((d, i) => {
    const n = i + 1, on = n === cur;
    if (d) {
      const s = SaveSys.summary(d);
      h += `<div class="slotcard ${on ? 'on' : ''}">
        <div class="slot-top"><input type="text" value="${esc(d.name)}" data-svname="${n}" maxlength="30">${on ? '<span class="inteam">使用中</span>' : ''}</div>
        <div class="hint">建立 ${tfmt(d.createdAt, true)}<br>存檔 ${tfmt(d.savedAt, true)}</div>
        <div class="slotstats">
          <div><small>隊伍</small>${esc(s.team.join('、') || '—')}</div>
          <div><small>抽卡次數</small>${s.pulls}</div><div><small>妙具</small>${s.items} 件</div>
          <div><small>時序碎片</small>${fmt(s.shards)}</div><div><small>妙具經驗</small>${fmt(s.crystals)}</div>
          <div><small>體力</small>${s.stamina}</div><div><small>動作紀錄</small>${s.actions} 筆</div>
          <div><small>戰鬥</small>${s.battle === 'input' ? '進行中' : s.battle ? '已結束' : '—'}</div><div><small>大小</small>${(s.size / 1024).toFixed(0)} KB</div>
        </div>
        <div class="slotbtns">
          ${on ? '' : `<button class="primary" data-sv="load" data-n="${n}">讀取</button>`}
          ${on ? '' : `<button data-sv="saveas" data-n="${n}">以目前進度覆蓋</button>`}
          <button data-sv="export" data-n="${n}">匯出檔案</button>
          <button data-sv="import" data-n="${n}">從檔案匯入</button>
          <button data-sv="newgame" data-n="${n}">重新開始</button>
          ${on ? '' : `<button class="danger" data-sv="delete" data-n="${n}">刪除</button>`}
        </div></div>`;
    } else {
      h += `<div class="slotcard empty"><div class="slot-top"><b>存檔 ${n}</b><span class="hint">空欄位</span></div>
        <div class="slotbtns"><button class="primary" data-sv="saveas" data-n="${n}">儲存目前進度到這裡</button>
        <button data-sv="newgame" data-n="${n}">在這裡開新遊戲</button><button data-sv="import" data-n="${n}">從檔案匯入</button></div></div>`;
    }
  });
  h += '</div>';
  h += `<p class="hint">存檔放在這個瀏覽器的本機儲存空間裡；清除瀏覽器資料、或換一台電腦／瀏覽器就看不到。重要進度請用「匯出檔案」備份成 .json，之後可以「從檔案匯入」還原。</p>`;

  const acts = Meta.get().activity || [];
  const counts = {};
  acts.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
  const list = acts.filter(a => actFilter === 'all' || a.type === actFilter);
  h += `<h2>動作紀錄 <small class="hint">（${acts.length} 筆，最多保留 3000 筆）</small></h2>
    <div class="actf">${ACT_TYPES.map(([k, n]) => `<button class="${k === actFilter ? 'on' : ''}" data-actf="${k}">${n}${k === 'all' ? '' : ` ${counts[k] || 0}`}</button>`).join('')}
    <button class="danger" data-sv="clearlog">清除紀錄</button></div>
    <div class="actlist">${list.slice(0, 400).map(a => `<div class="act"><span class="at">${tfmt(a.t, true)}</span><span class="atype ${a.type}">${ACT_NAME[a.type] || a.type}</span><span class="atext">${esc(a.text)}</span></div>`).join('') || '<p class="hint">沒有紀錄。</p>'}
    ${list.length > 400 ? `<p class="hint">只顯示最新 400 筆，完整紀錄可用「匯出檔案」取得。</p>` : ''}</div>
    <input type="file" id="importFile" accept=".json,application/json" class="hidden">`;
  $('#savepage').innerHTML = h;
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-sv],[data-actf],#saveStatus');
  if (!t) return;
  if (t.id === 'saveStatus') return setView('save');
  if (t.dataset.actf) { actFilter = t.dataset.actf; return renderSave(); }
  const act = t.dataset.sv, n = +t.dataset.n;
  switch (act) {
    case 'now': SaveSys.saveNow(); return renderSave();
    case 'export':
      if (!SaveSys.exportSlot(n)) openModal('<h2>無法匯出</h2><p>這個欄位沒有存檔。</p>');
      return;
    case 'import': importTarget = n; $('#importFile').click(); return;
    case 'load': {
      if (!confirm(`讀取存檔 ${n}？目前的進度已自動存在存檔 ${SaveSys.active}。`)) return;
      SaveSys.saveNow();
      const d = SaveSys.load(n);
      if (!d) { openModal('<h2>讀取失敗</h2><p>存檔損毀或不存在。</p>'); return; }
      applyLoaded(d);
      Meta.record('system', `讀取存檔 ${n}「${d.name}」`);
      return setView('save');
    }
    case 'saveas': {
      const existing = SaveSys.read(n);
      if (existing && !confirm(`用目前進度覆蓋存檔 ${n}「${existing.name}」？原本的內容會消失。`)) return;
      SaveSys.saveNow();
      const from = SaveSys.active;
      SaveSys.saveAs(n, existing ? existing.name : `存檔 ${n}`);
      Meta.record('system', `把存檔 ${from} 的進度複製到存檔 ${n}，並改用存檔 ${n}`);
      return renderSave();
    }
    case 'newgame': {
      if (!confirm(`在存檔 ${n} 開始新遊戲？${SaveSys.read(n) ? '這個欄位原本的進度會被清空（抽卡、妙具、動作紀錄全部重置）。' : ''}`)) return;
      if (SaveSys.active !== n) SaveSys.saveNow();
      SaveSys.newGame(n);
      CFG = mergeCfg(null);
      syncUiControls();
      startBattle({ dungeon: null, silent: true });
      SaveSys.saveAs(n, `存檔 ${n}`);
      return setView('save');
    }
    case 'delete':
      if (!confirm(`刪除存檔 ${n}「${(SaveSys.read(n) || {}).name}」？無法復原，建議先匯出。`)) return;
      SaveSys.remove(n);
      return renderSave();
    case 'clearlog':
      if (!confirm('清除這個存檔的所有動作紀錄？')) return;
      Meta.get().activity = [];
      Meta.record('system', '清除動作紀錄');
      return renderSave();
  }
});

document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.svname) {
    SaveSys.rename(+el.dataset.svname, el.value);
    return renderSave();
  }
  if (el.id === 'importFile' && el.files && el.files[0]) {
    const n = importTarget;
    const file = el.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const existing = SaveSys.read(n);
      if (existing && !confirm(`用檔案「${file.name}」覆蓋存檔 ${n}「${existing.name}」？`)) return;
      const err = SaveSys.importText(reader.result, n);
      if (err) { openModal(`<h2>匯入失敗</h2><p>${esc(err)}</p>`); return; }
      if (n === SaveSys.active) {
        const d = SaveSys.load(n);
        applyLoaded(d);
        Meta.record('system', `從檔案「${file.name}」匯入並讀取`);
        setView('save');
      } else renderSave();
      openModal(`<h2>匯入完成</h2><p>已把「${esc(file.name)}」匯入存檔 ${n}。${n === SaveSys.active ? '' : '按「讀取」即可切換過去。'}</p>`);
    };
    reader.readAsText(file);
    el.value = '';
  }
});

/* ================= 啟動 ================= */
(function start() {
  Engine.setInterrupts(true);   // 敵人回合之間留空檔，讓預約的終結技插入
  Stage.mount(document.querySelector('.st-canvas'));
  const d = SaveSys.boot({ cfg: () => CFG, battle: battleSnapshot, status: showSaveStatus });
  applyLoaded(d);
  showSaveStatus(true, SaveSys.lastSaved);
  // 立繪去背完成後重畫目前畫面
  Art.onReady(() => {
    if (view === 'battle') { if (!playing) renderBattle(); }
    else ({ chars: renderChars, bag: renderBag, gacha: renderGacha, dungeon: renderDungeon })[view]?.();
  });
  SaveSys.saveNow();
  setInterval(() => { Meta.tickStamina(); }, 60000);
})();
