// ==UserScript==
// @name         Missevan — Yomitan Compatibility
// @namespace    https://www.missevan.com/
// @version      0.1.1
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/missevan-yomitan.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/missevan-yomitan.user.js
// @description  Makes Missevan drama subtitle lines selectable and scannable by Yomitan.
// @author       CaoCao
// @match        https://www.missevan.com/*
// @match        https://missevan.com/*
// @run-at       document-start
// @sandbox      DOM
// @grant        GM.addStyle
// @noframes
// ==/UserScript==

// Drama subtitles are posted as fixed (top/bottom) danmaku lines; some sounds
// also use the native subtitle layer. Scrolling danmaku stay click-through.
(async () => {
  "use strict";

  const STYLE_ID = "missevan-yomitan-style";
  if (document.getElementById(STYLE_ID)) return;

  // Lift the danmaku layer above the empty, click-swallowing subtitle layer
  // while leaving it click-through, so only visible fixed lines take the pointer.
  const style = await GM.addStyle(`
    #commentCanvas {
      z-index: 21 !important;
      pointer-events: none !important;
    }

    #commentCanvas > .b-danmaku-center:not(.b-danmaku-hide),
    #commentCanvas > .b-danmaku-center:not(.b-danmaku-hide) *,
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
