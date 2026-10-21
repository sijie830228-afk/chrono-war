'use strict';
/* =========================================================
 * 時序之戰 — 金句（類似光錐）
 * 基礎數值（生命／攻擊／防禦）永遠生效；技能分為兩層，各自判定：
 *   性相層（skill／stat／desc）：裝備者「性相」相符時生效，效果較通用。
 *   權能層（pskill／pstat／pdesc）：裝備者「權能」相符時生效，呼應權能機制（兌現匣／時間織機／星流）或另一個通用效果。
 * 疊影 1～5 階，數值在 1 階與 5 階之間線性成長。sig = 專屬角色（只用於顯示）。
 * ========================================================= */

const Quotes = (() => {
  const L = (a, b, r) => a + (b - a) * ((r || 1) - 1) / 4;
  const n = v => (Math.round(v * 10) / 10).toString();

  const LIST = {
    irrefutable: {
      name: '不可反駁的推演', rarity: 5, path: '啟', power: '本質', sig: 'kane', hp: 1058, atk: 582, def: 463,
      skill: '罪證確鑿', pskill: '當庭對質',
      stat: r => ({ cr: L(18, 30, r) }),
      val: r => ({ cr: L(18, 30, r), lockDmg: L(20, 32, r), lockDef: L(12, 20, r), cd: L(36, 60, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的暴擊率提高 ${n(v.cr)}%。當裝備者發動追加攻擊或獲得額外回合時，獲得 1 層【鎖定】（最多疊加 2 層）。每層【鎖定】使裝備者造成的傷害提高 ${n(v.lockDmg)}%，且造成傷害時無視目標 ${n(v.lockDef)}% 的防禦力，持續 2 回合。`; },
      pdesc(r) { const v = this.val(r); return `當裝備者因自身技能使行動提前 100% 時，立即恢復 1 個戰技點，並使下一次攻擊的暴擊傷害額外提高 ${n(v.cd)}%；該恢復戰技點效果每 2 回合最多觸發 1 次。`; },
    },
    leverage: {
      name: '千百倍槓桿', rarity: 5, path: '穩', power: '平衡', sig: 'gordon', hp: 1058, atk: 635, def: 396,
      skill: '風險溢價', pskill: '槓桿操作',
      stat: r => ({ cr: L(18, 30, r) }),
      val: r => ({ cr: L(18, 30, r), atk: L(12, 20, r), imag: L(10, 18, r), def: L(20, 36, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的暴擊率提高 ${n(v.cr)}%。裝備者施放戰技時，獲得 1 層【流動資本】，最多疊加 3 層。每層【流動資本】使裝備者攻擊力提高 ${n(v.atk)}%、造成的運屬性傷害提高 ${n(v.imag)}%。`; },
      pdesc(r) { const v = this.val(r); return `裝備者向「時間織機」投入［校準任務］時，額外獲得 1 層【流動資本】。當「時間織機」啟動結算時，若股市處於［漲停］或［跌停］狀態，裝備者立即恢復 1 點戰技點，且該次時間織機所執行的所有任務傷害忽視目標 ${n(v.def)}% 的防禦力。`; },
    },
    ninthRule: {
      name: '第九街的規矩', rarity: 4, path: '沌', power: '本質', hp: 953, atk: 476, def: 331,
      skill: '欠債還錢', pskill: '利滾利',
      stat: r => ({ atkPct: L(16, 32, r) }),
      val: r => ({ atk: L(16, 32, r), dot: L(16, 32, r), roll: L(8, 16, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的攻擊力提高 ${n(v.atk)}%。裝備者造成的持續傷害提高 ${n(v.dot)}%。`; },
      pdesc(r) { const v = this.val(r); return `「兌現匣」每進行一次兌現，裝備者獲得 1 層【利滾利】，造成的持續傷害提高 ${n(v.roll)}%，最多疊加 2 層，持續 2 回合。`; },
    },
    clause7: {
      name: '合約第七條', rarity: 4, path: '意', power: '本質', hp: 1058, atk: 423, def: 397,
      skill: '附加條款', pskill: '履約保證',
      stat: r => ({ err: L(8, 16, r) }),
      val: r => ({ err: L(8, 16, r), atk: L(16, 32, r), team: L(8, 16, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的能量恢復效率提高 ${n(v.err)}%。裝備者施放戰技後，使戰技指定的我方目標（無指定時為自身）攻擊力提高 ${n(v.atk)}%，持續 2 回合。`; },
      pdesc(r) { const v = this.val(r); return `裝備者投入的餘料參與「兌現匣」的兌現後，我方全體攻擊力提高 ${n(v.team)}%，持續 1 回合。`; },
    },
    lastCover: {
      name: '掩護到最後一刻', rarity: 4, path: '穩', power: '本質', hp: 953, atk: 423, def: 463,
      skill: '撐住', pskill: '不退讓',
      stat: r => ({ be: L(28, 56, r) }),
      val: r => ({ be: L(28, 56, r), sh: L(10, 20, r), red: L(10, 20, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的擊破特攻提高 ${n(v.be)}%。裝備者提供的護盾量提高 ${n(v.sh)}%。`; },
      pdesc(r) { const v = this.val(r); return `裝備者投入的餘料參與「兌現匣」的兌現後，我方全體受到的傷害降低 ${n(v.red)}%，持續 2 回合。`; },
    },
    noAnswer: {
      name: '無人應答的禱告', rarity: 5, path: '秘', power: '本質', sig: 'otg', hp: 1164, atk: 582, def: 397,
      skill: '受難', pskill: '迴響的空堂',
      stat: r => ({ atkPct: L(24, 40, r) }),
      val: r => ({ atk: L(24, 40, r), pain: L(8, 14, r), cd: L(24, 40, r), echo: L(40, 60, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的攻擊力提高 ${n(v.atk)}%。裝備者每承受一次持續傷害，獲得 1 層【受難】，每層使造成的傷害提高 ${n(v.pain)}%，最多疊加 4 層，持續 2 回合。裝備者生命值低於 50% 時，暴擊傷害提高 ${n(v.cd)}%。`; },
      pdesc(r) { const v = this.val(r); return `裝備者投入的餘料參與「兌現匣」的兌現後，受到該次兌現傷害的敵人身上所有「裂傷」立即產生相當於原傷害 ${n(v.echo)}% 的傷害。`; },
    },
    // ---------- 專屬金句（亞歷山卓、馬克、寒夜、米勒） ----------
    greenWave: {
      name: '一路綠燈', rarity: 5, path: '境', power: '本質', sig: 'alexandra', hp: 1058, atk: 529, def: 463,
      skill: '開道', pskill: '封鎖線',
      stat: r => ({ spd: L(12, 20, r) }),
      val: r => ({ spd: L(12, 20, r), dmg: L(16, 28, r), vuln: L(10, 18, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的速度提高 ${n(v.spd)} 點。裝備者施放戰技後，使戰技指定的我方目標（無指定時為自身）造成的傷害提高 ${n(v.dmg)}%，持續 2 回合。`; },
      pdesc(r) { const v = this.val(r); return `裝備者投入的餘料參與「兌現匣」的兌現後，使敵方全體陷入【封鎖】，受到的傷害提高 ${n(v.vuln)}%，持續 2 回合。`; },
    },
    internNotes: {
      name: '實習筆記', rarity: 4, path: '穩', power: '本質', sig: 'mark', hp: 953, atk: 476, def: 331,
      skill: '溫故知新', pskill: '整理筆記',
      stat: r => ({ atkPct: L(16, 32, r) }),
      val: r => ({ atk: L(16, 32, r), cd: L(3, 5, r), fu: L(12, 24, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的攻擊力提高 ${n(v.atk)}%。裝備者每持有 1 點「經驗」，暴擊傷害提高 ${n(v.cd)}%（最多計算 12 點）。`; },
      pdesc(r) { const v = this.val(r); return `裝備者追加攻擊造成的傷害提高 ${n(v.fu)}%。裝備者投入的餘料參與「兌現匣」的兌現後，該效果提高為 2 倍，持續 2 回合。`; },
    },
    uniqueSolution: {
      name: '唯一解', rarity: 4, path: '型', power: '平衡', sig: 'hanye', hp: 953, atk: 476, def: 331,
      skill: 'Q.E.D.', pskill: '收斂',
      stat: r => ({ cd: L(24, 40, r) }),
      val: r => ({ cd: L(24, 40, r), skill: L(12, 20, r), def: L(12, 20, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的暴擊傷害提高 ${n(v.cd)}%。裝備者戰技造成的傷害提高 ${n(v.skill)}%。`; },
      pdesc(r) { const v = this.val(r); return `「時間織機」啟動後，裝備者下一次施放戰技時無視目標 ${n(v.def)}% 的防禦力；若該次戰技攻擊段數大於等於 12（收斂），無視防禦效果提高為 2 倍。`; },
    },
    bouquetForYou: {
      name: '獻給你的花', rarity: 4, path: '秘', power: '情感', sig: 'miller', hp: 1058, atk: 370, def: 397,
      skill: '獻花', pskill: '花語',
      stat: r => ({ hpPct: L(16, 32, r) }),
      val: r => ({ hp: L(16, 32, r), dot: L(5, 9, r), en: L(8, 16, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的生命值上限提高 ${n(v.hp)}%。目標身上每有 1 個持續傷害效果（悲悼、每層裂傷、每層血破），裝備者對其造成的持續傷害提高 ${n(v.dot)}%（最多計算 4 個）。`; },
      pdesc(r) { const v = this.val(r); return `星流到達極長或極消時，裝備者恢復 ${n(v.en)} 點能量。`; },
    },
    // ---------- 各性相的其他金句 ----------
    fieldExam: {
      name: '現場勘驗', rarity: 4, path: '啟', power: '本質', hp: 953, atk: 476, def: 331,
      skill: '採證', pskill: '證物袋',
      stat: r => ({ atkPct: L(16, 32, r) }),
      val: r => ({ atk: L(16, 32, r), fu: L(20, 40, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的攻擊力提高 ${n(v.atk)}%。裝備者追加攻擊造成的傷害提高 ${n(v.fu)}%。`; },
      pdesc() { return '裝備者發動追加攻擊時，額外逸散 1 份與自身屬性相同的「本質餘料」，每回合最多觸發 1 次。'; },
    },
    trafficControl: {
      name: '交通管制', rarity: 4, path: '境', power: '本質', hp: 1058, atk: 423, def: 397,
      skill: '讓路', pskill: '綠波',
      stat: r => ({ err: L(8, 16, r) }),
      val: r => ({ err: L(8, 16, r), spd: L(8, 16, r), adv: L(6, 12, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的能量恢復效率提高 ${n(v.err)}%。裝備者施放戰技後，使戰技指定的我方目標（無指定時為自身）速度提高 ${n(v.spd)}%，持續 2 回合。`; },
      pdesc(r) { const v = this.val(r); return `裝備者投入的餘料參與「兌現匣」的兌現後，我方全體行動提前 ${n(v.adv)}%。`; },
    },
    scratchPaper: {
      name: '演算草稿', rarity: 4, path: '型', power: '平衡', hp: 953, atk: 476, def: 331,
      skill: '草稿', pskill: '演算',
      stat: r => ({ atkPct: L(16, 32, r) }),
      val: r => ({ atk: L(16, 32, r), basic: L(8, 16, r), cr: L(3, 5, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的攻擊力提高 ${n(v.atk)}%。裝備者施放普攻後，下一次戰技的暴擊率提高 ${n(v.basic)}%。`; },
      pdesc(r) { const v = this.val(r); return `「時間織機」每執行一份校準任務，裝備者獲得 1 層【演算】，每層使暴擊率提高 ${n(v.cr)}%，最多 5 層；裝備者施放戰技後移除。`; },
    },
    rainyRequiem: {
      name: '雨中的告別式', rarity: 4, path: '秘', power: '情感', hp: 1058, atk: 423, def: 331,
      skill: '送行', pskill: '雨聲',
      stat: r => ({ ehr: L(16, 32, r) }),
      val: r => ({ ehr: L(16, 32, r), dot: L(16, 32, r), push: L(6, 10, r) }),
      desc(r) { const v = this.val(r); return `使裝備者的效果命中提高 ${n(v.ehr)}%。裝備者對帶有 2 個或以上負面效果的敵人造成的持續傷害提高 ${n(v.dot)}%。`; },
      pdesc(r) { const v = this.val(r); return `裝備者每次推動星流，獲得 1 層【雨聲】，造成的持續傷害提高 ${n(v.push)}%，最多疊加 3 層，持續 2 回合。`; },
    },
    // ---------- 三星：兩層都是簡單的數值 ----------
    firstClue: {
      name: '第一條線索', rarity: 3, path: '啟', power: '本質', hp: 846, atk: 370, def: 264, skill: '靈光一閃', pskill: '順藤摸瓜',
      stat: r => ({ cr: L(8, 16, r) }), pstat: r => ({ atkPct: L(8, 16, r) }), val: r => ({ cr: L(8, 16, r), atk: L(8, 16, r) }),
      desc(r) { return `使裝備者的暴擊率提高 ${n(this.val(r).cr)}%。`; },
      pdesc(r) { return `使裝備者的攻擊力提高 ${n(this.val(r).atk)}%。`; },
    },
    blankCheck: {
      name: '空頭支票', rarity: 3, path: '沌', power: '本質', hp: 846, atk: 370, def: 264, skill: '先欠著', pskill: '跳票',
      stat: r => ({ atkPct: L(16, 32, r) }), pstat: r => ({ ehr: L(8, 16, r) }), val: r => ({ atk: L(16, 32, r), ehr: L(8, 16, r) }),
      desc(r) { return `使裝備者的攻擊力提高 ${n(this.val(r).atk)}%。`; },
      pdesc(r) { return `使裝備者的效果命中提高 ${n(this.val(r).ehr)}%。`; },
    },
    smallTalk: {
      name: '街角閒聊', rarity: 3, path: '意', power: '本質', hp: 952, atk: 318, def: 264, skill: '聽說了嗎', pskill: '傳話',
      stat: r => ({ hpPct: L(16, 32, r) }), pstat: r => ({ err: L(4, 8, r) }), val: r => ({ hp: L(16, 32, r), err: L(4, 8, r) }),
      desc(r) { return `使裝備者的生命上限提高 ${n(this.val(r).hp)}%。`; },
      pdesc(r) { return `使裝備者的能量恢復效率提高 ${n(this.val(r).err)}%。`; },
    },
    silentGold: {
      name: '沉默是金', rarity: 3, path: '穩', power: '平衡', hp: 952, atk: 318, def: 330, skill: '不說話', pskill: '靜觀其變',
      stat: r => ({ defPct: L(16, 32, r) }), pstat: r => ({ atkPct: L(8, 16, r) }), val: r => ({ def: L(16, 32, r), atk: L(8, 16, r) }),
      desc(r) { return `使裝備者的防禦力提高 ${n(this.val(r).def)}%。`; },
      pdesc(r) { return `使裝備者的攻擊力提高 ${n(this.val(r).atk)}%。`; },
    },
    trafficLight: {
      name: '紅綠燈', rarity: 3, path: '境', power: '本質', hp: 952, atk: 318, def: 330, skill: '綠燈請通行', pskill: '黃燈',
      stat: r => ({ spdPct: L(4, 8, r) }), pstat: r => ({ err: L(4, 8, r) }), val: r => ({ spd: L(4, 8, r), err: L(4, 8, r) }),
      desc(r) { return `使裝備者的速度提高 ${n(this.val(r).spd)}%。`; },
      pdesc(r) { return `使裝備者的能量恢復效率提高 ${n(this.val(r).err)}%。`; },
    },
    domain: {
      name: '定義域', rarity: 3, path: '型', power: '平衡', hp: 846, atk: 370, def: 264, skill: '設 x 屬於', pskill: '值域',
      stat: r => ({ cd: L(16, 32, r) }), pstat: r => ({ cr: L(4, 8, r) }), val: r => ({ cd: L(16, 32, r), cr: L(4, 8, r) }),
      desc(r) { return `使裝備者的暴擊傷害提高 ${n(this.val(r).cd)}%。`; },
      pdesc(r) { return `使裝備者的暴擊率提高 ${n(this.val(r).cr)}%。`; },
    },
    obituary: {
      name: '訃聞', rarity: 3, path: '秘', power: '情感', hp: 952, atk: 318, def: 264, skill: '謹此訃告', pskill: '追思',
      stat: r => ({ ehr: L(10, 20, r) }), pstat: r => ({ hpPct: L(8, 16, r) }), val: r => ({ ehr: L(10, 20, r), hp: L(8, 16, r) }),
      desc(r) { return `使裝備者的效果命中提高 ${n(this.val(r).ehr)}%。`; },
      pdesc(r) { return `使裝備者的生命值上限提高 ${n(this.val(r).hp)}%。`; },
    },
  };

  return { LIST, L };
})();
