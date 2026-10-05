// ==UserScript==
// @name         iQIYI — Yomitan Compatibility
// @namespace    https://www.iqiyi.com/
// @version      0.1.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/iqiyi-yomitan.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/iqiyi-yomitan.user.js
// @description  Makes native iQIYI subtitle text selectable and scannable by Yomitan.
// @author       CaoCao
// @match        https://www.iqiyi.com/*
// @match        https://iqiyi.com/*
// @run-at       document-start
// @sandbox      DOM
// @grant        GM.addStyle
// @noframes
// ==/UserScript==

// Assumes iQIYI's native HTML caption renderer; no subtitle downloader is required.
(async () => {
  "use strict";

  const STYLE_ID = "iqiyi-yomitan-style";
  if (document.getElementById(STYLE_ID)) return;

  // Enable only the text boxes, leaving the full-player overlays click-through.
  const style = await GM.addStyle(`
    #pcaSubtitleContainer .caption,
    #pcaSubtitleContainer .caption *,
    .iqp-subtitle-cont .caption,
    .iqp-subtitle-cont .caption * {
      pointer-events: auto !important;
      user-select: text !important;
      -webkit-user-select: text !important;
      cursor: text !important;
    }
  `);
  style.id = STYLE_ID;
})();
