'use strict';
/* =========================================================
 * 時序之戰 — 線條圖示（24×24，以 currentColor 描邊）
 * 用法：Icon('battle')、Icon('pause', 'big')
 * ========================================================= */

const ICONS = {
  logo: '<circle cx="12" cy="12" r="10"/><path d="M8.5 6.5h7M8.5 17.5h7M9.5 6.5c0 3 5 4 5 5.5s-5 2.5-5 5.5M14.5 6.5c0 3-5 4-5 5.5s5 2.5 5 5.5"/><path d="M12 2v1.5M12 20.5V22M2 12h1.5M20.5 12H22"/>',
  battle: '<path d="M14.5 17.5 4 7V4h3l10.5 10.5M13 19l6-6M16.5 16.5 20 20M9.5 17.5 20 7V4h-3L6.5 14.5M11 19l-6-6M7.5 16.5 4 20"/>',
  chars: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5"/>',
  dungeon: '<path d="M4 21V10a8 8 0 0 1 16 0v11M2.5 21h19M9 21v-5a3 3 0 0 1 6 0v5M12 3v2M7 6.5 8.2 8M17 6.5 15.8 8"/>',
  gacha: '<path d="M12 2.5l2.3 6.2 6.6.4-5.1 4.2 1.7 6.4L12 16.1l-5.5 3.6 1.7-6.4-5.1-4.2 6.6-.4z"/>',
  bag: '<path d="M6 9a6 6 0 0 1 12 0v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="M9 9V7a3 3 0 0 1 6 0v2M8.5 14h7M11 14v3h2v-3"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4.5 19.5 12 7 19.5z"/>',
  speed: '<path d="M3.5 6.5 11 12l-7.5 5.5zM12.5 6.5 20 12l-7.5 5.5z"/>',
  auto: '<path d="M4.5 12a7.5 7.5 0 0 1 13.2-4.9M19.5 12a7.5 7.5 0 0 1-13.2 4.9"/><path d="M18 3.5v4h-4M6 20.5v-4h4"/>',
  log: '<path d="M8 3h11v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2h13v2"/><path d="M8 3a2 2 0 0 0-2 2v11M11 8h5M11 12h5"/>',
  restart: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3"/><path d="M3.5 3.5v4.8h4.8"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  exit: '<path d="M10 17l-5-5 5-5M5 12h11M14 4h5v16h-5"/>',
  step: '<path d="M6 5l9 7-9 7zM18 5v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  quote: '<path d="M6.5 7h4.5v4.5c0 3-2 5.2-4.5 6M13.5 7H18v4.5c0 3-2 5.2-4.5 6"/>',
  power: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M12 7.5 16 10v4l-4 2.5L8 14v-4z"/><path d="M12 2.5v5M20.5 7 16 10M20.5 17 16 14M12 21.5v-5M3.5 17 8 14M3.5 7 8 10"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 14v3M7 9v2M11 8v8M15 11v4M15 5v3M19 7v6"/><path d="M6 12h2M10 10h2M14 9h2M18 9h2" stroke-width="3"/>',
  trace: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="2"/>',
  relic: '<path d="M6 3.5h12l3.5 5.5L12 20.5 2.5 9z"/><path d="M2.5 9h19M9 3.5l3 17 3-17"/>',
  eidolon: '<circle cx="5" cy="6" r="1.6"/><circle cx="12" cy="3.8" r="1.6"/><circle cx="19" cy="9" r="1.6"/><circle cx="15.5" cy="17.5" r="1.6"/><circle cx="7" cy="18.5" r="1.6"/><path d="M6.5 5.5 10.5 4.3M13.5 4.7l4 3.4M18.4 10.5l-2.3 5.4M13.9 17.7l-5.3.6M6.5 17 5.3 7.6"/>',
  material: '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/><path d="M12 21.5V12M20 7l-8 5-8-5"/>',
  crystal: '<path d="M12 2.5 17.5 9 12 21.5 6.5 9z"/><path d="M6.5 9h11M12 2.5 10 9l2 12.5L14 9z"/>',
  shard: '<path d="M12 2.5 19 12l-7 9.5L5 12z"/><path d="M12 6.5v11M8.5 12h7"/>',
  stamina: '<path d="M13 2.5 4.5 14H11l-1 7.5L19.5 10H13z"/>',
  head: '<path d="M5 15a7 7 0 0 1 14 0v2.5H5z"/><path d="M12 8V5.5M9 17.5V20M15 17.5V20"/>',
  hands: '<path d="M8 21v-5.5l-2.8-3.8a1.5 1.5 0 0 1 2.3-1.9L9 11.5V5a1.5 1.5 0 0 1 3 0v5V3.8a1.5 1.5 0 0 1 3 0V10V5.3a1.5 1.5 0 0 1 3 0V15c0 3.5-2 6-5 6z"/>',
  body: '<path d="M8 3.5 12 5.5l4-2 5 3.8-2.8 3.2-2.2-1.2V21H8V9.3L5.8 10.5 3 7.3z"/>',
  feet: '<path d="M7 3.5h6v9.5l6 3.2V20H5v-3.5l2-3.5z"/><path d="M5 17.5h14"/>',
  sphere: '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-20 12 12)"/>',
  rope: '<path d="M9 15l6-6M10.2 6.2l1-1a4 4 0 0 1 5.7 5.6l-1 1M13.8 17.8l-1 1a4 4 0 0 1-5.7-5.6l1-1"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  filter: '<path d="M3.5 5h17l-6.5 8v6l-4-2v-4z"/>',
  sort: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
  up: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  equip: '<path d="M12 3 20 7v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  music: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};
const FILLED = new Set(['pause', 'play', 'speed', 'gacha', 'stamina']);

function Icon(name, cls) {
  const d = ICONS[name] || ICONS.info;
  return `<svg class="ic ${FILLED.has(name) ? 'fill' : ''} ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
}
