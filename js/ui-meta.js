'use strict';
/* =========================================================
 * 時序之戰 — 養成介面：角色（詳情／金句／經緯／妙具／可能性）、副本、抽卡、長按即時數值
 * ========================================================= */

let charSel = 'kane', charTab = 'detail', slotSel = 'head', itemSel = null, sandboxEdit = false;
let bannerSel = 'char';
let gachaTimers = [];
const CTABS = [['detail', '詳情'], ['quote', '金句'], ['trace', '經緯'], ['relic', '妙具'], ['eidolon', '可能性']];
const SL = s => Relics.STAT_LABEL[s] || s;
const stars = n => '★'.repeat(n);

/* ================= 共用：妙具卡片 ================= */
function itemCard(it, opts) {
  opts = opts || {};
  const set = Relics.SETS[it.set];
  const own = Meta.owner(it.id);
  const kind = Relics.SLOTS.find(s => s.key === it.slot).kind;
  return `<div class="item ${opts.sel ? 'sel' : ''} ${opts.compact ? 'compact' : ''}" ${opts.click ? `data-isel="${it.id}"` : ''}>
    <div class="ih"><b>${esc(set ? set.name : '（無套裝）')}</b><span class="lv">+${it.level}</span></div>
    <div class="is">${Relics.SLOT_NAME[it.slot]} · ${Relics.KIND_NAME[kind]}</div>
    <div class="im">${SL(it.main)} <b>${Relics.fmtStat(it.main, Relics.mainValue(it.main, it.level))}</b></div>
    <ul>${it.subs.map(s => `<li><span>${SL(s.stat)}</span><span>+${Relics.fmtStat(s.stat, Relics.SUB[s.stat] * s.rolls)}<small>${'•'.repeat(s.rolls)}</small></span></li>`).join('')}</ul>
    ${opts.owner !== false && own ? `<div class="own">${esc(CHARS[own].name)} 裝備中</div>` : ''}
  </div>`;
}
function showRewards(r) {
  openModal(`<h2>🎁 副本獎勵</h2>
    <p>妙具經驗 +${r.crystals}</p>
    <div class="reward-grid">${r.items.map(it => itemCard(it, { owner: false })).join('')}</div>
    <p class="hint">獲得的妙具已放入背包，可在「角色 → 妙具」裝備與強化。</p>`, 'wide');
}

/* ================= 敵人資訊卡 ================= */
const ENEMY_ELEM_KEY = n => (typeof ELEM_KEY !== 'undefined' && ELEM_KEY[n]) || 'phys';
/** 敵人的技能與基本資料（圖鑑與長按共用）；compact = 不含頭部（長按時接在即時數值後面） */
function enemyInfoHtml(type, compact) {
  const t = Engine.ENEMY_TYPES[type], I = (typeof ENEMY_INFO !== 'undefined' && ENEMY_INFO[type]) || null;
  if (!t) return '';
  const col = I ? ELEM_COLOR[ENEMY_ELEM_KEY(I.elem)] : '#aaa';
  let h = '';
  if (!compact) {
    h += `<div class="einfo-head" style="--c:${col}"><span class="einfo-fig">${enemySvg(type)}</span><div>
      ${I && I.rank ? `<span class="einfo-rank r-${I.rank === '首領' ? 'boss' : I.rank === '精英' ? 'elite' : 'mob'}">${esc(I.rank)}</span>` : ''}
      <h2>${esc(t.name)}</h2>${I && I.title ? `<div class="einfo-title">${esc(I.title)}</div>` : ''}
      <div class="tags">${I ? `<span class="badge" style="border-color:${col};color:${col}">${esc(I.elem)}</span><span class="badge">性相・${esc(I.path)}</span><span class="badge">權能・${esc(I.power)}</span><span class="badge">${esc(I.faction)}</span>` : ''}</div>
    </div></div>`;
  }
  if (!I) return h + `<p class="hint">${esc(t.desc)}</p>`;
  h += `<div class="skilllist einfo-skills">${I.skills.map(([k, n, d]) => `<div class="skill"><div class="sk-kind">${esc(k)}</div><div><b>${esc(n)}</b><p>${esc(d).replace(/\n/g, '<br>')}</p></div></div>`).join('')}</div>`;
  if (I.notes && !compact) h += `<h3>沙盒註記</h3><ul class="notes">${I.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return h;
}
function openEnemyInfo(type) { openModal(`<div class="einfo">${enemyInfoHtml(type)}</div>`, 'wide'); }

/* ================= 長按：即時數值 ================= */
function openLive(uid) {
  const L = Engine.liveStats(uid);
  const S = Engine.state();
  const u = S && S.units.find(x => x.id === uid);
  if (!L || !u) return;
  const row = (n, v) => `<div><small>${n}</small>${v}</div>`;
  let h = '';
  if (L.side === 'ally') {
    const c = CHARS[u.key];
    h += `<h2>${esc(c.fullName || c.name)} <small class="hint">即時數值（第 ${Engine.cycle()} 輪）</small></h2>
      <div class="statgrid">${[
      row('生命', `${fmt(L.hp)} / ${fmt(L.maxHp)}`), row('攻擊力', fmt(L.atk)), row('防禦力', fmt(L.def)), row('速度', L.spd.toFixed(1)),
      row('暴擊率', P1(L.cr)), row('暴擊傷害', P1(L.cd)), row('造成傷害', '+' + P1(L.dmgBonus)),
      row('效果命中', P1(L.ehr)), row('效果抵抗', P1(L.effRes)), row('能量恢復效率', P1(L.err)),
      row('受到傷害', '−' + P1(L.dmgTakenRed)), row('無視防禦', P1(L.defIgnore)), row('能量', `${L.energy.toFixed(1)} / ${L.maxEnergy}`),
      row('行動值', L.av.toFixed(1)), row('護盾', L.shield > 0 ? `${fmt(L.shield)}（${L.shieldDur} 回合）` : '—'),
    ].join('')}</div>`;
    h += '<h3>狀態效果</h3>' + (u.buffs.length ? `<ul class="blist">${u.buffs.map(b => `<li><b>${esc(b.name)}${b.stacks ? '×' + b.stacks : ''}</b>
      <span>${Object.entries(b.stats).map(([k, v]) => statLine(k, v)).join('、') || esc((BUFF_INFO[b.name] || ['', ''])[1])}</span>
      <small>${b.consume ? '下次攻擊後移除' : b.dur < 900 ? `剩餘 ${b.dur} 回合` : '直到觸發'}</small></li>`).join('')}</ul>` : '<p class="hint">無</p>');
    if (L.lc) {
      const q = Quotes.LIST[L.lc.id];
      h += `<h3>金句</h3><div class="lcline"><b>《${esc(q.name)}》</b> ${stars(q.rarity)} · 疊影 ${L.lc.rank} 階
        <div class="hint">性相·${esc(q.path)}【${esc(q.skill)}】${L.lc.active ? '生效' : '<span class="warn">未生效</span>'}：${esc(q.desc(L.lc.rank))}</div>
        <div class="hint">權能·${esc(q.power || '—')}【${esc(q.pskill || '—')}】${L.lc.pactive ? '生效' : '<span class="warn">未生效</span>'}：${q.pdesc ? esc(q.pdesc(L.lc.rank)) : ''}</div></div>`;
    } else h += '<h3>金句</h3><p class="hint">未裝備</p>';
    h += `<h3>妙具</h3><div class="hint">套裝：${L.sets.length ? L.sets.map(s => Relics.SETS[s.slice(0, -1)].name + ' ' + s.slice(-1) + ' 件').join('、') : '無'}${S.rules.useRelics === false ? '（本場未套用妙具）' : ''}</div>
      <div class="reward-grid">${Object.values(Meta.loadout(u.key)).filter(Boolean).map(it => itemCard(it, { owner: false, compact: true })).join('')}</div>`;
    const off = ['a1', 'a2', 'a3'].filter(a => L.traces[a] === false);
    if (off.length) h += `<p class="warn">經緯：${off.map(a => '額外能力' + '一二三'[+a[1] - 1]).join('、')} 已關閉</p>`;
  } else {
    const t = Engine.ENEMY_TYPES[L.type];
    h += `<h2>${esc(u.name)} <small class="hint">${esc(t.name)} · Lv.${L.lvl}</small></h2><p class="hint">${esc(t.desc)}</p>
      <div class="statgrid">${[
      row('生命', `${fmt(L.hp)} / ${fmt(L.maxHp)}`), row('攻擊力', fmt(L.atk)), row('速度', L.spd.toFixed(1)), row('防禦力', fmt(L.def) + (L.defRed ? `（−${P1(L.defRed)}）` : '')),
      row('韌性', `${Math.ceil(L.tough)} / ${L.maxTough}${L.broken ? '（已擊破）' : ''}`), row('弱點', L.weak.map(w => ELEM_NAME[w]).join('、') || '無'),
      row('非弱點抗性', P1(L.resNonWeak)), row('效果抵抗', P1(L.effRes)), row('造成傷害', L.dmgDealtRed ? '−' + P1(L.dmgDealtRed) : '—'),
      row('行動值', L.av.toFixed(1)), row('護盾', L.shield > 0 ? fmt(L.shield) : '—'),
    ].join('')}</div>`;
    const st = [];
    if (u.lacer.length) st.push(`裂傷 ×${u.lacer.length}（剩餘 ${u.lacer.map(s => s.dur).join('、')}）`);
    if (u.bloodBreak) st.push(`血破 ×${u.bloodBreak}`);
    if (u.peek) st.push('管中窺豹');
    if (u.flagrant) st.push('現行犯');
    u.buffs.forEach(b => st.push(`${b.name}（${Object.entries(b.stats).map(([k, v]) => statLine(k, v)).join('、')}，剩餘 ${b.dur} 回合）`));
    h += '<h3>狀態效果</h3>' + (st.length ? `<ul class="blist">${st.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="hint">無</p>');
    if (typeof ENEMY_INFO !== 'undefined' && ENEMY_INFO[L.type]) {
      const I = ENEMY_INFO[L.type];
      h += `<h3>技能 <small class="hint">${esc(I.title || '')}${I.faction ? ' · ' + esc(I.faction) : ''}</small></h3>${enemyInfoHtml(L.type, true)}`;
    }
  }
  openModal(h, 'wide');
}

/* ================= 角色頁 ================= */
const CTAB_ICON = { detail: 'info', quote: 'quote', trace: 'trace', relic: 'relic', eidolon: 'eidolon' };
const ELEM_HEX2 = ELEM_COLOR;
/** 角色頁：最左圓形頭像欄 → 直列分頁（附圖示）→ 內容（背景為角色立繪） */
function renderChars() {
  const SV = Meta.get();
  const keys = Object.keys(CHARS);
  const k = charSel, c = CHARS[k], art = Art.get(k);
  let h = `<div class="cpage3" style="--elem:${ELEM_HEX2[c.elem]}"><nav class="crail">`;
  keys.forEach(x => {
    const cx = CHARS[x];
    h += `<button class="rav ${x === k ? 'on' : ''} el-${cx.elem}" data-csel="${x}" data-tip="${esc(cx.name)}${CFG.team.includes(x) ? '（隊伍中）' : ''}">
      ${Art.get(x) ? `<span class="rav-img" style="${Art.bg(x, 'face', 400)}"></span>` : `<span class="rav-img txt">${esc(cx.name[0])}</span>`}
      ${CFG.team.includes(x) ? '<i class="rav-team"></i>' : ''}</button>`;
  });
  h += `</nav><nav class="cvtabs">${CTABS.map(([t, n]) => `<button class="${t === charTab ? 'on' : ''}" data-ctab="${t}">${Icon(CTAB_ICON[t])}<span>${n}</span></button>`).join('')}</nav>`;
  h += `<section class="cstage">${art ? `<img class="cstage-art" src="${art.url}" alt="">` : ''}<div class="cstage-glow"></div>
    <div class="cpanel">
      <div class="chero">
        <div class="chero-name">${esc(c.fullName || c.name)}</div>
        <div class="chero-sub"><span class="stars">${stars(c.rarity)}</span>
          <span class="badge el">${ELEM_NAME[c.elem]}</span><span class="badge">性相・${c.path}</span><span class="badge">${esc(c.faction)}</span>
          <span class="badge">${esc(c.role)}</span><span class="badge ghost">持有 ${SV.owned.chars[k] || 0}</span></div>
      </div>
      <div class="cbody">${({ detail: tabDetail, quote: tabQuote, trace: tabTrace, relic: tabRelic, eidolon: tabEidolon })[charTab](k, SV)}</div>
    </div></section></div>`;
  $('#chars').innerHTML = h;
}
function panelGrid(k, override) {
  const p = Meta.panel(k, CFG, override);
  return [['攻擊力', fmt(p.atk)], ['生命', fmt(p.hp)], ['防禦', fmt(p.def)], ['速度', p.spd.toFixed(1)], ['暴擊率', P1(p.cr)],
    ['暴擊傷害', P1(p.cd)], [ELEM_NAME[CHARS[k].elem] + '屬性增傷', P1(p.dmgBonus)], ['效果命中', P1(p.ehr)], ['效果抵抗', P1(p.effRes)],
    ['能量恢復效率', P1(p.err)]];
}
function tabDetail(k, SV) {
  const info = CHAR_INFO[k], base = CFG.chars[k];
  const lc = SV.lc[k] && Quotes.LIST[SV.lc[k].id];
  let h = `<div class="hint">面板數值（本體 + 金句 + 經緯${CFG.rules.useRelics !== false ? ' + 妙具' : '，未套用妙具'}；不含戰鬥中的條件效果，戰鬥中可長按角色卡看即時數值）</div>
    <div class="statgrid">${panelGrid(k).map(([n, v]) => `<div><small>${n}</small>${v}</div>`).join('')}<div><small>能量上限</small>${base.maxEnergy}</div></div>
    <div class="hint">基礎攻擊 = 本體 ${base.baseAtk} + 金句 ${lc ? lc.atk : 0}；基礎生命 = 本體 ${base.hp} + 金句 ${lc ? lc.hp : 0}；基礎防禦 = 本體 ${base.def} + 金句 ${lc ? lc.def : 0}</div>`;
  h += info.skills.map(([kind, name, text]) => `<div class="skill"><div class="kind">${esc(kind)}</div><div>${name ? `<div class="sname">${esc(name)}</div>` : ''}<div class="stext">${esc(text)}</div></div></div>`).join('');
  h += `<div class="cnotes"><b>沙盒實作註記</b><ul>${info.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
  return h;
}
/**
 * 金句的兩層技能：性相層（性相相符時生效）與權能層（權能相符時生效）。
 * k = 用來判斷是否生效的角色（省略時只列出條件）；short = 精簡版（一覽列表用）。
 */
function quoteTiers(q, rank, k, short) {
  const ch = k && CHARS[k];
  const row = (cls, tag, need, ok, name, text) => `<div class="qtier ${cls} ${ch ? (ok ? 'on' : 'off') : ''}">
    <span class="qt-tag">${tag}·${esc(need)}${ch ? (ok ? ' ✓' : ' ✗') : ''}</span><b>【${esc(name)}】</b>${short ? '' : esc(text)}</div>`;
  return row('path', '性相', q.path, ch && ch.path === q.path, q.skill, q.desc(rank)) +
    row('power', '權能', q.power || '—', ch && ch.power === q.power, q.pskill || '—', q.pdesc ? q.pdesc(rank) : '');
}
function quoteCard(id, rank, k, big) {
  const q = Quotes.LIST[id];
  return `<div class="qcard r${q.rarity} ${big ? 'big' : ''}">
    <div class="qh"><b>《${esc(q.name)}》</b><span class="stars">${stars(q.rarity)}</span></div>
    <div class="qs">性相 ${q.path} · 權能 ${q.power || '—'}${q.sig ? ` · <span class="qsig">${esc(CHARS[q.sig].name)}專屬</span>` : ''}</div>
    <div class="qstats"><span>生命 ${q.hp}</span><span>攻擊 ${q.atk}</span><span>防禦 ${q.def}</span></div>
    <div class="qskill">${quoteTiers(q, rank, k)}</div>
  </div>`;
}
function tabQuote(k, SV) {
  const cur = SV.lc[k];
  let h = '<h3>目前裝備</h3>';
  if (cur) {
    h += quoteCard(cur.id, cur.rank, k, true);
    h += `<div class="row-inline">疊影 <select data-lcrank="${k}">${[1, 2, 3, 4, 5].map(r => `<option value="${r}" ${r === cur.rank ? 'selected' : ''}>${r} 階</option>`).join('')}</select>
      <button data-lcun="${k}">卸下</button><span class="hint">持有 ${SV.owned.lcs[cur.id] || 0} 把（抽卡取得，目前不影響疊影）</span></div>`;
  } else h += '<p class="hint">未裝備金句。</p>';
  h += '<h3>金句一覽</h3><div class="qlist">';
  const rankQ = q => (q.sig === k ? 0 : (q.path === CHARS[k].path ? 1 : 3) + (q.power === CHARS[k].power ? 0 : 1));   // 專屬 → 性相＋權能都符合 → 只符合其中一層 → 其他
  Object.entries(Quotes.LIST).sort((a, b) => rankQ(a[1]) - rankQ(b[1]) || b[1].rarity - a[1].rarity).forEach(([id, q]) => {
    const by = Object.keys(SV.lc).find(x => SV.lc[x] && SV.lc[x].id === id);
    h += `<div class="qmini r${q.rarity} ${q.path === CHARS[k].path || q.power === CHARS[k].power ? 'match' : ''}">
      <div><b>《${esc(q.name)}》</b> <span class="stars">${stars(q.rarity)}</span>${q.sig ? ` <span class="qsig">${esc(CHARS[q.sig].name)}專屬</span>` : ''}</div>
      <div class="hint">性相 ${q.path} · 權能 ${q.power || '—'} · 攻擊 ${q.atk} · 持有 ${SV.owned.lcs[id] || 0}${by ? ` · ${esc(CHARS[by].name)} 裝備中` : ''}</div>
      <div class="qdesc">${quoteTiers(q, 1, k)}</div>
      <button data-lcequip="${id}" ${cur && cur.id === id ? 'disabled' : ''}>${cur && cur.id === id ? '已裝備' : '裝備'}</button></div>`;
  });
  h += '</div><p class="hint">同一把金句只能裝備在一名角色身上，裝備時會從原本的角色身上移除。</p>';
  return h;
}
function tabTrace(k, SV) {
  const T = Meta.TRACES[k], st = SV.traces[k];
  const as = CHAR_INFO[k].skills.filter(s => s[0].startsWith('額外能力'));
  let h = `<h3>技能等級</h3><p>${esc(T.skills)}</p><p class="hint">沙盒中的技能倍率即為上列等級的數值。</p>`;
  h += '<h3>屬性節點</h3><div class="tnodes">';
  T.nodes.forEach((n, i) => {
    h += `<label class="tnode ${st.nodes[i] !== false ? 'on' : ''}"><input type="checkbox" data-trnode="${i}" ${st.nodes[i] !== false ? 'checked' : ''}>
      ${SL(n.stat)} +${n.v}${Relics.FLAT.has(n.stat) ? '' : '%'}</label>`;
  });
  h += '</div><h3>額外能力</h3>';
  as.forEach(([kind, name, text], i) => {
    const a = 'a' + (i + 1);
    h += `<label class="trace ${st[a] !== false ? 'on' : ''}"><input type="checkbox" data-tra="${a}" ${st[a] !== false ? 'checked' : ''}>
      <div><b>${esc(kind)}${name ? '：' + esc(name) : ''}</b><div class="stext">${esc(text)}</div></div></label>`;
  });
  h += '<p class="hint">取消勾選可以關閉該項經緯，變更會在下一場戰鬥生效。</p>';
  return h;
}
function tabRelic(k, SV) {
  const lo = Meta.loadout(k);
  let h = `<div class="rtop"><span>妙具經驗 <b>${fmt(SV.crystals)}</b></span>
    <label class="chk"><input type="checkbox" data-path="rules.useRelics" ${CFG.rules.useRelics !== false ? 'checked' : ''}> 戰鬥中套用妙具</label>
    <label class="chk"><input type="checkbox" data-sbedit ${sandboxEdit ? 'checked' : ''}> 沙盒編輯（直接修改詞條）</label></div>`;
  h += '<div class="rgrid"><div class="rslots">';
  Relics.SLOTS.forEach(s => {
    const it = lo[s.key];
    h += `<button class="rslot ${s.key === slotSel ? 'on' : ''}" data-slot="${s.key}"><small>${s.name}</small>
      ${it ? `<b>${esc(Relics.SETS[it.set] ? Relics.SETS[it.set].name : '無套裝')}</b><span>+${it.level} · ${SL(it.main)}</span>` : '<span class="hint">未裝備</span>'}</button>`;
  });
  h += '</div>';
  // 背包
  const list = SV.inv.filter(i => i.slot === slotSel).sort((a, b) => ((lo[slotSel] && lo[slotSel].id === b.id) - (lo[slotSel] && lo[slotSel].id === a.id)) || b.level - a.level || b.id - a.id);
  if (!itemSel || !list.some(i => i.id === itemSel)) itemSel = lo[slotSel] ? lo[slotSel].id : (list[0] && list[0].id);
  h += `<div class="rinv"><h3>背包 · ${Relics.SLOT_NAME[slotSel]}（${list.length}）</h3><div class="ilist">${list.map(it => itemCard(it, { click: true, sel: it.id === itemSel, compact: true })).join('') || '<p class="hint">沒有這個欄位的妙具，可以去副本刷取。</p>'}</div></div>`;
  // 詳細
  const it = itemSel && Meta.item(itemSel);
  h += '<div class="rdetail">';
  if (it) {
    const mine = lo[slotSel] && lo[slotSel].id === it.id;
    const cost = it.level < 15 ? Relics.upgradeCost(it.level) : 0;
    h += itemCard(it, {});
    h += `<div class="ibtns">${mine ? `<button data-iunequip="${slotSel}">卸下</button>` : `<button class="primary" data-iequip="${it.id}">裝備</button>`}
      <button data-iup="1" ${it.level >= 15 ? 'disabled' : ''}>強化 +1（${cost}）</button>
      <button data-iup="3" ${it.level >= 15 ? 'disabled' : ''}>強化 +3</button>
      <button data-iup="15" ${it.level >= 15 ? 'disabled' : ''}>強化至 +15</button>
      <button class="danger" data-isalv="${it.id}">分解（+${Relics.salvageValue(it)}）</button></div>`;
    if (sandboxEdit) {
      const opt = (v, sel, l) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
      const kind = Relics.SLOTS.find(s => s.key === it.slot).kind;
      while (it.subs.length < 4) it.subs.push({ stat: '', rolls: 0 });
      h += `<div class="iedit"><h3>沙盒編輯</h3>
        <label>套裝 <select data-ipath="set">${Object.entries(Relics.SETS).filter(([, v]) => v.kind === kind).map(([sk, v]) => opt(sk, it.set, v.name)).join('')}</select></label>
        <label>主詞條 <select data-ipath="main">${Relics.SLOT_MAIN[it.slot].map(m => opt(m, it.main, SL(m))).join('')}</select></label>
        <label>等級 <input type="number" min="0" max="15" data-ipath="level" value="${it.level}"></label>
        ${it.subs.map((sb, i) => `<label>副詞條 ${i + 1} <select data-ipath="subs.${i}.stat">${opt('', sb.stat, '—')}${Object.keys(Relics.SUB).filter(x => x !== it.main).map(x => opt(x, sb.stat, SL(x))).join('')}</select>
          <input type="number" min="0" max="6" data-ipath="subs.${i}.rolls" value="${sb.rolls}" title="強化次數"></label>`).join('')}</div>`;
      it.subs = it.subs.filter(s => s.stat);
    }
  }
  h += '</div></div>';
  // 面板與套裝
  const { sets, counts } = Relics.sum(lo);
  const raw = panelGrid(k, { useRelics: false }), full = panelGrid(k, { useRelics: true });
  h += `<div class="rbottom"><div><h3>面板比較</h3><table class="ptable"><tr><th></th><th>不含妙具</th><th>含妙具</th></tr>
    ${raw.map((r, i) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="${r[1] !== full[i][1] ? 'up' : ''}">${full[i][1]}</td></tr>`).join('')}</table></div><div><h3>套裝效果</h3>`;
  const ents = Object.entries(counts || {});
  if (!ents.length) h += '<p class="hint">未裝備套裝。</p>';
  ents.forEach(([sk, n]) => {
    const S = Relics.SETS[sk];
    h += `<div class="setbox"><b>${esc(S.name)}</b> <small>${n} 件 · ${Relics.KIND_NAME[S.kind]}</small>
      <div class="${sets.includes(sk + '2') ? 'on' : 'off'}">2 件：${esc(S.p2txt)}</div>
      ${S.kind === 'relic' ? `<div class="${sets.includes(sk + '4') ? 'on' : 'off'}">4 件：${esc(S.p4txt)}</div>` : ''}</div>`;
  });
  h += '</div></div>';
  return h;
}
function tabEidolon(k, SV) {
  const n = SV.owned.chars[k] || 0;
  return `<div class="eido">${[1, 2, 3, 4, 5, 6].map(i => `<div class="enode"><div class="lock">🔒</div><b>可能性 ${i}</b><small>目前不開放</small></div>`).join('')}</div>
    <p class="hint">已持有 ${n} 名（重複抽到的角色之後會用於解鎖可能性，此功能目前不開放）。</p>`;
}

/* ================= 共用：頁首與資源 ================= */
function pageHead(icon, title, sub, right) {
  return `<div class="pg-head"><div class="pg-title">${Icon(icon)}<div><b>${title}</b><small>${sub || ''}</small></div></div><div class="pg-res">${right || ''}</div></div>`;
}
function resChip(icon, label, val, extra) {
  return `<div class="rchip">${Icon(icon)}<div><small>${label}</small><b>${val}</b>${extra || ''}</div></div>`;
}
const SLOT_ICON = { head: 'head', hands: 'hands', body: 'body', feet: 'feet', sphere: 'sphere', rope: 'rope' };

/* ================= 副本頁 ================= */
const DUNGEON_HUE = { casino: '#c2325f', agency: '#2c98b8', range: '#d8662c', neon: '#8150e8', site: '#5f9a6a', tomorrow: '#7a6aff' };
function staminaText() {
  const SV = Meta.get();
  const eta = Meta.staminaEta();
  return `${SV.stamina}<small> / ${Meta.STAMINA_MAX}</small>${eta ? `<em>${Math.floor(eta / 60000)}:${String(Math.floor(eta / 1000) % 60).padStart(2, '0')} 後 +1</em>` : '<em>已滿</em>'}`;
}
function renderDungeon() {
  Meta.tickStamina();
  const SV = Meta.get();
  let h = pageHead('dungeon', '副本', '挑戰或掃蕩以取得妙具',
    `<div class="rchip wide">${Icon('stamina')}<div><small>體力</small><b id="stamina">${staminaText()}</b>
      <div class="rbar"><i style="width:${SV.stamina / Meta.STAMINA_MAX * 100}%"></i></div></div></div>
     ${resChip('crystal', '妙具經驗', fmt(SV.crystals))}
     <button class="ghost-btn" data-refill>${Icon('stamina')}補充體力（沙盒）</button>`);
  h += '<div class="dgrid">';
  Meta.DUNGEONS.forEach(d => {
    const waves = {};
    d.enemies.forEach(e => { (waves[e.wave] = waves[e.wave] || []).push(e); });
    const types = [...new Set(d.enemies.map(e => e.type))];
    const lead = d.enemies.find(e => Engine.ENEMY_TYPES[e.type] && (e.type === 'boss' || Engine.ENEMY_TYPES[e.type].boss)) || d.enemies[0];
    h += `<article class="dcard2 ${d.kind}" style="--hue:${DUNGEON_HUE[d.id] || '#6a6aff'}">
      <div class="dban">
        <div class="dban-city"></div>
        <div class="dban-figs">${types.filter(x => x !== lead.type).slice(0, 2).map(x => `<span class="dfig">${enemySvg(x)}</span>`).join('')}<span class="dfig lead">${enemySvg(lead.type)}</span></div>
        <span class="dkind">${Icon(d.kind === 'relic' ? 'relic' : 'sphere')}${Relics.KIND_NAME[d.kind]}</span>
        <h3>${esc(d.name)}</h3>
      </div>
      <div class="dinfo">
        <p>${esc(d.desc)}</p>
        <div class="dlabel">可能掉落</div>
        <div class="dsets">${d.sets.map(s => `<span class="settile">${Icon(d.kind === 'relic' ? 'relic' : 'sphere')}<b>${esc(Relics.SETS[s].name)}</b><small>${esc((Relics.SETS[s].p2txt || '').slice(0, 12))}…</small></span>`).join('')}</div>
        <div class="dlabel">敵人配置</div>
        <div class="dwaves2">${Object.entries(waves).map(([w, es]) => `<div class="wv"><i>${'ⅠⅡⅢⅣ'[w - 1] || w}</i>${es.map(e => `<span class="wfig ${e.type}" title="${esc(e.name)}">${enemySvg(e.type, '32 0 56 56')}</span>`).join('')}</div>`).join('')}</div>
        <div class="dact">
          <button class="primary" data-dgo="${d.id}">${Icon('battle')}挑戰<small>通關 −${d.cost}</small></button>
          <button data-dsweep="${d.id}">${Icon('step')}掃蕩<small>−${d.cost}</small></button>
        </div>
      </div>
    </article>`;
  });
  h += '</div>';
  const recent = SV.drops.map(id => Meta.item(id)).filter(Boolean).slice(0, 12);
  h += `<h2 class="sec">${Icon('relic')}最近掉落</h2><div class="reward-grid">${recent.map(it => itemCard(it, { compact: true })).join('') || '<p class="hint">還沒有掉落紀錄。</p>'}</div>`;
  h += `<h2 class="sec">${Icon('info')}敵人圖鑑 <small class="hint">點擊查看資訊卡</small></h2><div class="etypes2">${Object.entries(Engine.ENEMY_TYPES).map(([k, t]) => {
    const I = typeof ENEMY_INFO !== 'undefined' && ENEMY_INFO[k];
    return `<button class="etile ${t.boss ? 'boss' : ''}" data-einfo="${k}"><span class="efig-s">${enemySvg(k)}</span><div>${I && I.rank ? `<span class="einfo-rank r-${I.rank === '首領' ? 'boss' : I.rank === '精英' ? 'elite' : 'mob'}">${esc(I.rank)}</span>` : ''}<b>${esc(t.name)}</b>${I && I.title ? `<small>${esc(I.title)}</small>` : ''}<p>${esc(t.desc)}</p></div></button>`;
  }).join('')}</div>`;
  $('#dungeon').innerHTML = h;
}
setInterval(() => { if (view === 'dungeon') { Meta.tickStamina(); const el = $('#stamina'); if (el) el.innerHTML = staminaText(); } }, 1000);

/* ================= 抽卡頁 ================= */
function renderGacha() {
  const SV = Meta.get();
  const b = Meta.BANNERS[bannerSel], st = SV.gacha[bannerSel];
  const [kindName, title] = b.name.split('「');
  const up5 = b.up5;
  const face = g => g.kind === 'char' && Art.get(g.id)
    ? `<span class="gface r${CHARS[g.id].rarity}" style="${Art.bg(g.id, 'face', 400)}" title="${esc(Meta.nameOf(g))}"></span>`
    : `<span class="gquote r${Quotes.LIST[g.id] ? Quotes.LIST[g.id].rarity : 4}" title="${esc(Meta.nameOf(g))}">${Icon('quote')}<b>${esc(Meta.nameOf(g))}</b></span>`;
  let h = pageHead('gacha', '躍遷', '抽卡結果只會加入收藏，目前不影響戰鬥',
    `${resChip('shard', '時序碎片', fmt(SV.shards))}<button class="ghost-btn" data-shards>${Icon('shard')}領取 1600（沙盒）</button>`);
  h += `<div class="gtabs">${Object.entries(Meta.BANNERS).map(([bk, x]) => {
    const art = x.up5.kind === 'char' && Art.get(x.up5.id);
    return `<button class="gtab ${bk === bannerSel ? 'on' : ''} ${bk}" data-bsel="${bk}">
      ${art ? `<span class="gtab-art" style="${Art.bg(x.up5.id, 'face', 260)}"></span>` : `<span class="gtab-art book">${Icon('quote')}</span>`}
      <span><small>${esc(x.name.split('「')[0])}</small><b>「${esc(x.name.split('「')[1] || '')}</b></span></button>`;
  }).join('')}</div>`;
  const art = up5.kind === 'char' && Art.get(up5.id);
  const lc = up5.kind === 'lc' && Quotes.LIST[up5.id];
  h += `<section class="gban2 ${bannerSel}">
    <div class="gban-bg"></div>
    ${art ? `<img class="gban-art" src="${art.url}" alt="">` : `<div class="gban-book"><div class="gbook-cover">${Icon('quote')}<b>${esc(lc.name)}</b><small>${stars(lc.rarity)}</small></div></div>`}
    <div class="gban-info">
      <div class="gban-kind">${esc(kindName)}</div>
      <h2>「${esc(title || '')}</h2>
      <div class="gban-up5"><span class="lbl">限定 5★ UP</span><b>${esc(Meta.nameOf(up5))}</b><span class="stars">★★★★★</span></div>
      <div class="gban-up4"><span class="lbl">4★ UP</span>${b.up4.map(face).join('')}</div>
      <div class="pitybox">
        <div class="pity-row"><span>5★ 保底</span><div class="pbar p5"><i style="width:${st.pity5 / b.hard * 100}%"></i><em style="left:${b.soft / b.hard * 100}%"></em></div><b>${st.pity5}/${b.hard}</b></div>
        <div class="pity-row"><span>4★ 保底</span><div class="pbar p4"><i style="width:${st.pity4 / 10 * 100}%"></i></div><b>${st.pity4}/10</b></div>
        ${st.guar ? '<div class="guar">下次 5★ 必為 UP</div>' : ''}
      </div>
      <p class="rates">5★ 基礎 ${(b.rate5 * 100).toFixed(1)}%，${b.soft} 抽起提升，${b.hard} 抽必出${b.std5.length ? `；歪卡為 ${b.std5.map(Meta.nameOf).join('、')}` : ''}。4★ 5.1%，每 10 抽必出。</p>
    </div>
    <div class="gban-btns">
      <button class="pullbtn" data-pull="1"><b>躍遷 ×1</b><span class="cost">${Icon('shard')}${Meta.PULL_COST}</span></button>
      <button class="pullbtn primary" data-pull="10"><b>躍遷 ×10</b><span class="cost">${Icon('shard')}${Meta.PULL_COST * 10}</span></button>
    </div>
  </section>`;
  h += `<h2 class="sec">${Icon('chars')}收藏</h2><div class="coll2">`;
  Object.keys(CHARS).forEach(k => {
    const n = SV.owned.chars[k] || 0;
    h += `<div class="ctile ${n ? '' : 'none'} r${CHARS[k].rarity}">${Art.get(k) ? `<span class="ctile-av" style="${Art.bg(k, 'face', 380)}"></span>` : `<span class="ctile-av txt">${esc(CHARS[k].name[0])}</span>`}<b>${esc(CHARS[k].name)}</b><small>×${n}</small></div>`;
  });
  Object.entries(Quotes.LIST).forEach(([id, q]) => {
    const n = SV.owned.lcs[id] || 0;
    h += `<div class="ctile q ${n ? '' : 'none'} r${q.rarity}"><span class="ctile-av">${Icon('quote')}</span><b>《${esc(q.name)}》</b><small>×${n}</small></div>`;
  });
  h += `</div><h2 class="sec">${Icon('log')}躍遷紀錄</h2><div class="hist2">`;
  SV.gacha.history.slice(0, 40).forEach(x => {
    h += `<div class="hrow r${x.rarity}"><span class="hdot"></span><b>${esc(Meta.nameOf(x))}</b><small>${x.kind === 'char' ? '角色' : '金句'} · ${x.banner === 'char' ? '角色池' : '金句池'}</small><time>${new Date(x.t).toLocaleString('zh-TW', { hour12: false })}</time></div>`;
  });
  if (!SV.gacha.history.length) h += '<p class="hint">還沒有躍遷紀錄。</p>';
  h += '</div>';
  $('#gacha').innerHTML = h;
}

/* ================= 背包 ================= */
let bagTab = 'relic', bagSlot = 'all', bagSet = 'all', bagSort = 'level', bagFree = false, bagSel = null, bagQuote = null;
const BAG_TABS = [['relic', '妙具', 'relic'], ['quote', '金句', 'quote'], ['material', '材料', 'material']];
function renderBag() {
  const SV = Meta.get();
  let h = pageHead('bag', '背包', `妙具 ${SV.inv.length} 件`,
    `${resChip('crystal', '妙具經驗', fmt(SV.crystals))}${resChip('shard', '時序碎片', fmt(SV.shards))}${resChip('stamina', '體力', `${SV.stamina}/${Meta.STAMINA_MAX}`)}`);
  h += `<div class="bagwrap"><nav class="bagtabs">${BAG_TABS.map(([k, n, ic]) => `<button class="${k === bagTab ? 'on' : ''}" data-bagtab="${k}">${Icon(ic)}<span>${n}</span></button>`).join('')}</nav><div class="bagmain">`;
  h += ({ relic: bagRelics, quote: bagQuotes, material: bagMaterials })[bagTab](SV);
  h += '</div></div>';
  $('#bag').innerHTML = h;
}
function bagRelics(SV) {
  const opt = (v, sel, l) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
  let list = SV.inv.filter(i => (bagSlot === 'all' || i.slot === bagSlot) && (bagSet === 'all' || i.set === bagSet) && (!bagFree || !Meta.owner(i.id)));
  list.sort(bagSort === 'new' ? (a, b) => b.id - a.id : bagSort === 'set' ? (a, b) => a.set.localeCompare(b.set) || b.level - a.level : (a, b) => b.level - a.level || b.id - a.id);
  if (!bagSel || !SV.inv.some(i => i.id === bagSel)) bagSel = list[0] ? list[0].id : null;
  let h = `<div class="bagbar">
    <div class="slotchips"><button class="${bagSlot === 'all' ? 'on' : ''}" data-bslot="all">全部</button>${Relics.SLOTS.map(s => `<button class="${bagSlot === s.key ? 'on' : ''}" data-bslot="${s.key}" title="${s.name}">${Icon(SLOT_ICON[s.key])}</button>`).join('')}</div>
    <label>${Icon('filter')}<select data-bset>${opt('all', bagSet, '全部套裝')}${Object.entries(Relics.SETS).map(([k, v]) => opt(k, bagSet, v.name)).join('')}</select></label>
    <label>${Icon('sort')}<select data-bsort>${opt('level', bagSort, '依等級')}${opt('new', bagSort, '依取得時間')}${opt('set', bagSort, '依套裝')}</select></label>
    <label class="chk"><input type="checkbox" data-bfree ${bagFree ? 'checked' : ''}> 只看未裝備</label>
    <span class="hint">${list.length} 件</span></div>`;
  h += '<div class="baggrid"><div class="btiles">';
  list.forEach(it => {
    const own = Meta.owner(it.id), set = Relics.SETS[it.set];
    h += `<button class="btile ${it.id === bagSel ? 'sel' : ''}" data-bpick="${it.id}" title="${esc(Meta.itemName(it))}">
      <span class="bt-ic">${Icon(SLOT_ICON[it.slot])}</span><span class="bt-lv">+${it.level}</span>
      <span class="bt-set">${esc(set ? set.name : '')}</span><span class="bt-main">${Relics.STAT_LABEL[it.main]}</span>
      ${own && Art.get(own) ? `<span class="bt-own" style="${Art.bg(own, 'face', 400)}"></span>` : own ? '<span class="bt-own txt">裝</span>' : ''}</button>`;
  });
  if (!list.length) h += '<p class="hint">沒有符合條件的妙具，可以到副本刷取。</p>';
  h += '</div><aside class="bdetail">';
  const it = bagSel && Meta.item(bagSel);
  if (it) {
    const own = Meta.owner(it.id);
    h += itemCard(it, {});
    h += `<div class="bd-sec">${Icon('equip')}裝備給
      <select id="bagEquipTo">${Object.keys(CHARS).map(k => `<option value="${k}" ${k === (own || charSel) ? 'selected' : ''}>${esc(CHARS[k].name)}${own === k ? '（裝備中）' : ''}</option>`).join('')}</select>
      <button class="primary" data-bequip="${it.id}">裝備</button></div>
      <div class="bd-sec">${Icon('up')}強化
      <button data-bup="1" ${it.level >= 15 ? 'disabled' : ''}>+1<small>${it.level < 15 ? Relics.upgradeCost(it.level) : '—'}</small></button>
      <button data-bup="3" ${it.level >= 15 ? 'disabled' : ''}>+3</button>
      <button data-bup="15" ${it.level >= 15 ? 'disabled' : ''}>至 +15</button></div>
      <div class="bd-sec">${Icon('trash')}<button class="danger" data-bsalv="${it.id}">分解（+${Relics.salvageValue(it)} 妙具經驗）</button></div>`;
  } else h += '<p class="hint">選擇左側的妙具查看詳細。</p>';
  h += '</aside></div>';
  return h;
}
function bagQuotes(SV) {
  const ids = Object.keys(Quotes.LIST).sort((a, b) => Quotes.LIST[b].rarity - Quotes.LIST[a].rarity);
  if (!bagQuote) bagQuote = ids[0];
  const by = id => Object.keys(SV.lc).find(k => SV.lc[k] && SV.lc[k].id === id);
  let h = '<div class="baggrid"><div class="qtiles">';
  ids.forEach(id => {
    const q = Quotes.LIST[id], n = SV.owned.lcs[id] || 0, who = by(id);
    h += `<button class="qtile r${q.rarity} ${id === bagQuote ? 'sel' : ''} ${n ? '' : 'none'}" data-bq="${id}">
      <span class="qt-ic">${Icon('quote')}</span><b>《${esc(q.name)}》</b><small>${'★'.repeat(q.rarity)} · ${q.path}／${q.power || '—'}</small><em>×${n}</em>
      ${who && Art.get(who) ? `<span class="bt-own" style="${Art.bg(who, 'face', 400)}"></span>` : ''}</button>`;
  });
  h += '</div><aside class="bdetail">';
  const q = Quotes.LIST[bagQuote], who = by(bagQuote);
  h += `<div class="qcard r${q.rarity} big"><div class="qh"><b>《${esc(q.name)}》</b><span class="stars">${stars(q.rarity)}</span></div>
    <div class="qs">性相 ${q.path} · 權能 ${q.power || '—'}${q.sig ? ` · <span class="qsig">${esc(CHARS[q.sig].name)}專屬</span>` : ''} · 持有 ${SV.owned.lcs[bagQuote] || 0}${who ? ` · ${esc(CHARS[who].name)} 裝備中` : ''}</div>
    <div class="qstats"><span>生命 ${q.hp}</span><span>攻擊 ${q.atk}</span><span>防禦 ${q.def}</span></div>
    <div class="qskill">${quoteTiers(q, who ? SV.lc[who].rank : 1, who)}</div></div>
    <div class="bd-sec">${Icon('equip')}裝備給
      <select id="bagQuoteTo">${Object.keys(CHARS).map(k => `<option value="${k}" ${k === (who || charSel) ? 'selected' : ''}>${esc(CHARS[k].name)}（${CHARS[k].path}／${CHARS[k].power}）${CHARS[k].path === q.path ? ' 性相✓' : ''}${CHARS[k].power === q.power ? ' 權能✓' : ''}</option>`).join('')}</select>
      <button class="primary" data-bqequip="${bagQuote}">裝備</button></div>
    <p class="hint">金句技能分兩層：性相相符時性相層生效，權能相符時權能層生效，兩層各自判定；同一把金句只能給一名角色。</p>`;
  h += '</aside></div>';
  return h;
}
function bagMaterials(SV) {
  const eta = Meta.staminaEta();
  const tile = (icon, name, val, desc, btn) => `<div class="mtile">${Icon(icon, 'big')}<div><b>${name}</b><em>${val}</em><p>${desc}</p>${btn || ''}</div></div>`;
  return `<div class="mtiles">
    ${tile('crystal', '妙具經驗', fmt(SV.crystals), '用來強化妙具。每次強化消耗 60 + 20 × 目前等級。可從副本獎勵或分解妙具取得。', `<button data-view="dungeon">${Icon('dungeon')}前往副本</button>`)}
    ${tile('shard', '時序碎片', fmt(SV.shards), '用來躍遷抽卡，每抽 160。', `<button data-view="gacha">${Icon('gacha')}前往躍遷</button>`)}
    ${tile('stamina', '體力', `${SV.stamina} / ${Meta.STAMINA_MAX}`, `挑戰或掃蕩副本時消耗，每 6 分鐘回復 1 點。${eta ? '' : '目前已滿。'}`, `<button data-refill>${Icon('stamina')}補充（沙盒）</button>`)}
  </div>`;
}
function gachaCard(g) {
  return `<div class="gcard r${g.rarity}"><div class="gk">${g.kind === 'char' ? '角色' : '金句'}</div>
    <div class="gn">${esc(Meta.nameOf(g))}</div><div class="stars">${stars(g.rarity)}</div>
    ${g.isNew ? '<span class="gnew">NEW</span>' : ''}${g.rarity >= 4 && g.featured ? '<span class="gup">UP</span>' : ''}</div>`;
}
/** 抽卡：先播放演出（gacha-anim.js），結束或跳過後顯示統整頁 */
function playGacha(res) {
  closeModal(); closePop();
  GachaAnim.play(res, showGachaSummary);
}
/** 統整頁：演出最後放大的那本書，結果寫在左右兩頁上 */
function showGachaSummary(res) {
  const b = Meta.BANNERS[bannerSel];
  const cnt = r => res.filter(g => g.rarity === r).length;
  const top = Math.max(...res.map(g => g.rarity));
  const row = (g, i) => `<div class="brow r${g.rarity}" style="animation-delay:${250 + i * 120}ms">
    <span class="orb r${g.rarity}"></span>
    <div class="bn"><b>${esc(Meta.nameOf(g))}</b><small>${g.kind === 'char' ? '角色' : '金句'} · <span class="stars">${stars(g.rarity)}</span></small></div>
    ${g.isNew ? '<span class="tag-new">NEW</span>' : ''}${g.rarity >= 4 && g.featured ? '<span class="tag-up">UP</span>' : ''}</div>`;
  const half = Math.ceil(res.length / 2);
  const left = res.length === 1 ? res : res.slice(0, half);
  const right = res.length === 1 ? [] : res.slice(half);
  const stat = `<div class="bstat"><div class="bh">本次躍遷</div>
    <p>${esc(b.name)}</p>
    <div class="bcount"><span class="r5">5★ × ${cnt(5)}</span><span class="r4">4★ × ${cnt(4)}</span><span class="r3">3★ × ${cnt(3)}</span></div>
    <p class="hint">剩餘時序碎片 ${fmt(Meta.get().shards)}</p></div>`;
  openModal(`<div class="bsum t${top}">
    <div class="bcover">
      <div class="bpage l"><div class="bh">躍遷紀錄 <small>×${res.length}</small></div>${left.map(row).join('')}</div>
      <div class="bpage r">${right.length ? right.map((g, i) => row(g, i + left.length)).join('') : stat}</div>
    </div>
    <div class="bfoot"><span class="r5">5★ ×${cnt(5)}</span><span class="r4">4★ ×${cnt(4)}</span><span class="r3">3★ ×${cnt(3)}</span>
      <button data-pull="${res.length}">再來 ×${res.length}</button><button class="primary" data-cmd="closemodal">確定</button></div>
  </div>`, 'gbook');
}
function skipGacha() { /* 舊版揭曉動畫已移除，保留空函式相容 */ }

/* ================= 事件 ================= */
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-einfo],[data-csel],[data-ctab],[data-lcequip],[data-lcun],[data-slot],[data-isel],[data-iequip],[data-iunequip],[data-iup],[data-isalv],[data-dgo],[data-dsweep],[data-refill],[data-bsel],[data-pull],[data-shards],[data-gskip],[data-bagtab],[data-bslot],[data-bpick],[data-bequip],[data-bup],[data-bsalv],[data-bq],[data-bqequip]');
  if (!t) return;
  const d = t.dataset;
  const SV = Meta.get();
  // 背包
  if (d.bagtab) { bagTab = d.bagtab; return renderBag(); }
  if (d.bslot) { bagSlot = d.bslot; return renderBag(); }
  if (d.bpick) { bagSel = +d.bpick; return renderBag(); }
  if (d.bequip) { Meta.equipItem($('#bagEquipTo').value, +d.bequip); return renderBag(); }
  if (d.bup) {
    const notes = Meta.upgrade(bagSel, +d.bup);
    renderBag();
    if (notes.some(n => n.includes('：') || n.includes('不足'))) openPop(document.querySelector('.bdetail .item') || document.body, `<div class="pop-h"><b>強化結果</b></div><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`);
    return;
  }
  if (d.bsalv) {
    const it = Meta.item(+d.bsalv), own = Meta.owner(+d.bsalv);
    if (!confirm(`分解這件 +${it.level} 妙具？${own ? `（目前由 ${CHARS[own].name} 裝備）` : ''}`)) return;
    Meta.salvage(+d.bsalv); bagSel = null; return renderBag();
  }
  if (d.bq) { bagQuote = d.bq; return renderBag(); }
  if (d.bqequip) {
    const to = $('#bagQuoteTo').value;
    const from = Object.keys(SV.lc).find(x => SV.lc[x] && SV.lc[x].id === d.bqequip);
    if (from) SV.lc[from] = null;
    SV.lc[to] = { id: d.bqequip, rank: 1 };
    Meta.record('quote', `${CHARS[to].name} 裝備金句《${Quotes.LIST[d.bqequip].name}》${from && from !== to ? `（從 ${CHARS[from].name} 身上取下）` : ''}`);
    return renderBag();
  }
  if (d.csel) { charSel = d.csel; itemSel = null; return renderChars(); }
  if (d.ctab) { charTab = d.ctab; return renderChars(); }
  if (d.lcequip) {
    const from = Object.keys(SV.lc).find(x => SV.lc[x] && SV.lc[x].id === d.lcequip);
    if (from) SV.lc[from] = null;
    SV.lc[charSel] = { id: d.lcequip, rank: 1 };
    Meta.record('quote', `${CHARS[charSel].name} 裝備金句《${Quotes.LIST[d.lcequip].name}》${from && from !== charSel ? `（從 ${CHARS[from].name} 身上取下）` : ''}`);
    return renderChars();
  }
  if (d.lcun) {
    const q = SV.lc[d.lcun] && Quotes.LIST[SV.lc[d.lcun].id];
    SV.lc[d.lcun] = null;
    Meta.record('quote', `${CHARS[d.lcun].name} 卸下金句${q ? '《' + q.name + '》' : ''}`);
    return renderChars();
  }
  if (d.slot) { slotSel = d.slot; itemSel = null; return renderChars(); }
  if (d.isel) { itemSel = +d.isel; return renderChars(); }
  if (d.iequip) { Meta.equipItem(charSel, +d.iequip); return renderChars(); }
  if (d.iunequip) { Meta.unequip(charSel, d.iunequip); return renderChars(); }
  if (d.iup) {
    const notes = Meta.upgrade(itemSel, +d.iup);
    renderChars();
    const msg = notes.filter(n => n.includes('：') || n.includes('不足'));
    if (msg.length) openPop(document.querySelector('.rdetail .item') || t, `<div class="pop-h"><b>強化結果</b></div><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`);
    return;
  }
  if (d.isalv) {
    const it = Meta.item(+d.isalv);
    const own = Meta.owner(+d.isalv);
    if (!confirm(`分解這件 +${it.level} 妙具？${own ? `（目前由 ${CHARS[own].name} 裝備）` : ''}`)) return;
    Meta.salvage(+d.isalv); itemSel = null; return renderChars();
  }
  if (d.einfo) return openEnemyInfo(d.einfo);
  if (d.dgo) {
    const dg = Meta.DUNGEONS.find(x => x.id === d.dgo);
    Meta.tickStamina();
    if (SV.stamina < dg.cost) { openModal(`<h2>體力不足</h2><p>挑戰「${esc(dg.name)}」需要 ${dg.cost} 體力，目前 ${SV.stamina}。</p>`); return; }
    return startBattle({ dungeon: d.dgo });
  }
  if (d.dsweep) {
    const r = Meta.runDungeon(d.dsweep);
    if (r.error) { openModal(`<h2>無法掃蕩</h2><p>${esc(r.error)}</p>`); return; }
    showRewards(r); return renderDungeon();
  }
  if (d.refill != null) { const was = SV.stamina; SV.stamina = Meta.STAMINA_MAX; SV.staminaTs = Date.now(); Meta.record('system', `補充體力 ${was} → ${Meta.STAMINA_MAX}`); return view === 'bag' ? renderBag() : renderDungeon(); }
  if (d.bsel) { bannerSel = d.bsel; return renderGacha(); }
  if (d.shards != null) { SV.shards += 1600; Meta.record('system', `領取時序碎片 +1600（共 ${SV.shards}）`); return renderGacha(); }
  if (d.pull) {
    const r = Meta.pull(bannerSel, +d.pull);
    if (r.error) { openModal(`<h2>無法躍遷</h2><p>${esc(r.error)}</p>`); return; }
    renderGacha(); playGacha(r.res); return;
  }
  if (d.gskip != null) return skipGacha();
});

document.addEventListener('change', ev => {
  const el = ev.target, d = el.dataset;
  const SV = Meta.get();
  if (d.lcrank) {
    SV.lc[d.lcrank].rank = +el.value;
    Meta.record('quote', `${CHARS[d.lcrank].name} 的金句《${Quotes.LIST[SV.lc[d.lcrank].id].name}》疊影改為 ${el.value} 階`);
    return renderChars();
  }
  if (d.trnode != null) {
    SV.traces[charSel].nodes[+d.trnode] = el.checked;
    const n = Meta.TRACES[charSel].nodes[+d.trnode];
    Meta.record('trace', `${CHARS[charSel].name} 經緯節點「${SL(n.stat)} +${n.v}」${el.checked ? '開啟' : '關閉'}`);
    return renderChars();
  }
  if (d.tra) {
    SV.traces[charSel][d.tra] = el.checked;
    Meta.record('trace', `${CHARS[charSel].name} 額外能力${'一二三'[+d.tra[1] - 1]}${el.checked ? '開啟' : '關閉'}`);
    return renderChars();
  }
  if (d.sbedit != null) { sandboxEdit = el.checked; return renderChars(); }
  if (d.bset != null) { bagSet = el.value; return renderBag(); }
  if (d.bsort != null) { bagSort = el.value; return renderBag(); }
  if (d.bfree != null) { bagFree = el.checked; return renderBag(); }
  if (d.ipath) {
    const it = Meta.item(itemSel); if (!it) return;
    let v = el.type === 'number' ? Math.max(0, parseFloat(el.value) || 0) : el.value;
    if (d.ipath === 'level') v = Math.min(15, Math.round(v));
    if (d.ipath.startsWith('subs.')) { while (it.subs.length < 4) it.subs.push({ stat: '', rolls: 0 }); if (d.ipath.endsWith('rolls')) v = Math.min(6, Math.round(v)); }
    setPath(it, d.ipath, v);
    it.subs = it.subs.filter(s => s.stat).map(s => ({ stat: s.stat, rolls: s.rolls || 1 }));
    Meta.record('upgrade', `沙盒編輯 ${Meta.itemName(it)}：${d.ipath} → ${el.options ? el.options[el.selectedIndex].text : v}`);
    return renderChars();
  }
});
