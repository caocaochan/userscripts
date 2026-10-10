// ==UserScript==
// @name         Missevan — Yomitan Compatibility
// @namespace    https://www.missevan.com/
// @version      0.1.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/missevan-yomitan.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/missevan-yomitan.user.js
// @description  Makes native Missevan subtitle text selectable and scannable by Yomitan.
// @author       CaoCao
// @match        https://www.missevan.com/*
// @match        https://missevan.com/*
// @run-at       document-start
// @sandbox      DOM
// @grant        GM.addStyle
// @noframes
// ==/UserScript==

// Targets the native subtitle layer only; danmaku are left unchanged.
(async () => {
  "use strict";

  const STYLE_ID = "missevan-yomitan-style";
  if (document.getElementById(STYLE_ID)) return;

  const style = await GM.addStyle(`
    .subtitle-container > span,
    .subtitle-container > span * {
      pointer-events: auto !important;
      user-select: text !important;
      -webkit-user-select: text !important;
      cursor: text !important;
    }
  `);
  style.id = STYLE_ID;
})();
