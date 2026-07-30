// ==UserScript==
// @name         JJWXC Reader — LXGW WenKai + Solarized Light
// @namespace    https://www.jjwxc.net/
// @version      0.1.1
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/jjwxc-reader-theme.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/jjwxc-reader-theme.user.js
// @description  Formats JJWXC chapter prose at 20px with LXGW WenKai Screen and themes desktop chapter pages with Solarized Light.
// @author       CaoCao
// @match        https://www.jjwxc.net/onebook.php*
// @tag          jjwxc
// @tag          font
// @tag          solarized
// @tag          reading
// @run-at       document-start
// @sandbox      DOM
// @grant        GM.addStyle
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const css = `
    :root {
      --solarized-base03: #002b36 !important;
      --solarized-base02: #073642 !important;
      --solarized-base01: #586e75 !important;
      --solarized-base00: #657b83 !important;
      --solarized-base0: #839496 !important;
      --solarized-base1: #93a1a1 !important;
      --solarized-base2: #eee8d5 !important;
      --solarized-base3: #fdf6e3 !important;
      --solarized-yellow: #b58900 !important;
      --solarized-orange: #cb4b16 !important;
      --solarized-red: #dc322f !important;
      --solarized-magenta: #d33682 !important;
      --solarized-violet: #6c71c4 !important;
      --solarized-blue: #268bd2 !important;
      --solarized-cyan: #2aa198 !important;
      --solarized-green: #859900 !important;

      --default-color: var(--solarized-base00) !important;
      --default-background-color: var(--solarized-base3) !important;
      --theme-color-1: var(--solarized-base3) !important;
      --theme-color-2: var(--solarized-base2) !important;
      --theme-color-3: var(--solarized-green) !important;
      --theme-color-4: var(--solarized-base2) !important;
      --default-border-color: var(--solarized-base1) !important;
      --highlight-text-color: var(--solarized-green) !important;
      --input-background-color: var(--solarized-base3) !important;
      --input-border-color: var(--solarized-base1) !important;
      --cancel-button-background-color: var(--solarized-base2) !important;
      --theme-light-background: var(--solarized-base3) !important;
      --theme-light-border: var(--solarized-base1) !important;
      --grey-color-1: var(--solarized-base01) !important;
      --dark-grey: var(--solarized-base01) !important;
      --highlight-color-1: var(--solarized-red) !important;
      --hightlight-color-1: var(--solarized-red) !important;
      --highlight-color-2: var(--solarized-blue) !important;
      --danmu-background: var(--solarized-base3) !important;
      --danmu-main-text-color: var(--solarized-base00) !important;

      color-scheme: light;
    }

    html,
    body,
    #footer {
      color: var(--solarized-base00) !important;
      background-color: var(--solarized-base3) !important;
    }

    body {
      background-image: none !important;
    }

    #paragraph_comment_content {
      color: var(--solarized-base00) !important;
      font-size: 20px !important;
      font-family:
        "LXGW WenKai Screen",
        "Microsoft YaHei",
        PingFangSC-Regular,
        HelveticaNeue-Light,
        "Helvetica Neue Light",
        sans-serif !important;
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6,
    .note_chapter_title,
    .rec_novel_info {
      color: var(--solarized-base01) !important;
    }

    a:link {
      color: var(--solarized-blue) !important;
    }

    a:visited {
      color: var(--solarized-violet) !important;
    }

    a:hover,
    a:focus-visible {
      color: var(--solarized-cyan) !important;
    }

    .graytext,
    .display_zuohua,
    .recommend_novel_tip,
    .rec_novel_info .rec_novel_novelintro,
    .onebook_paragraph_comment_item_date,
    .onebook_paragraph_comment_ip {
      color: var(--solarized-base1) !important;
    }

    .redtext,
    font[color="red"] {
      color: var(--solarized-red) !important;
    }

    .bluetext,
    font[color="blue"] {
      color: var(--solarized-blue) !important;
    }

    .noveltitle {
      background-color: var(--solarized-base2) !important;
      border-color: var(--solarized-base1) !important;
    }

    .novelbody,
    .readtd,
    .controlbar,
    .author_bulletin,
    #note_danmu_wrapper {
      background-color: var(--solarized-base3) !important;
      border-color: var(--solarized-base1) !important;
    }

    input,
    textarea,
    select,
    :where(button:not(.reader_setting_theme_btn)),
    .reader_setting_panel,
    #report_box,
    .float_favorite {
      color: var(--solarized-base00) !important;
      background-color: var(--solarized-base3) !important;
      border-color: var(--solarized-base1) !important;
    }

    :where(button:not(.reader_setting_theme_btn)):hover,
    :where(button:not(.reader_setting_theme_btn)):focus-visible {
      color: var(--solarized-base01) !important;
      background-color: var(--solarized-base2) !important;
    }

    .chapter_comment_button {
      color: var(--solarized-green) !important;
      background-color: var(--solarized-base2) !important;
    }

    .chapter_comment_button_cancel {
      color: var(--solarized-base1) !important;
      background-color: var(--solarized-base2) !important;
    }

    input::placeholder,
    textarea::placeholder {
      color: var(--solarized-base1) !important;
    }

    .warning,
    #loginUserDiv,
    #examine_num {
      color: var(--solarized-orange) !important;
      background-color: var(--solarized-base2) !important;
      border-color: var(--solarized-orange) !important;
    }

    .danmu_king,
    .danmu_nutrition {
      color: var(--solarized-base00) !important;
      background-color: var(--solarized-base2) !important;
    }

    .danmu_king_sp {
      color: var(--solarized-red) !important;
      background-color: var(--solarized-base2) !important;
      border-color: var(--solarized-red) !important;
    }

    .link2,
    .nav2,
    .nav3,
    .left1,
    .left2,
    .right1,
    .right2,
    .mainnav,
    .mainnav a:hover,
    .mainnav .hover {
      background-image: none !important;
    }

    .link2,
    .nav2,
    .nav3 {
      background-color: var(--solarized-base3) !important;
    }

    .mainnav {
      background-color: var(--solarized-base2) !important;
      box-shadow: inset 0 0 0 1px var(--solarized-base1);
    }

    .mainnav a:hover,
    .mainnav .hover {
      color: var(--solarized-cyan) !important;
      background-color: var(--solarized-base3) !important;
      border-color: var(--solarized-base1) !important;
    }

    #dymenu .root a,
    #dymenu .root .title {
      color: var(--solarized-base00) !important;
    }

    #dymenu .root ul a,
    #dymenu .root a:hover ul,
    #dymenu .root li:hover ul {
      color: var(--solarized-base00) !important;
      background: var(--solarized-base3) !important;
      border-color: var(--solarized-base1) !important;
    }

    #dymenu .root ul a:hover,
    #dymenu .root a:hover {
      color: var(--solarized-base01) !important;
      background: var(--solarized-base2) !important;
    }

    .input1,
    .input2,
    .input3 {
      color: var(--solarized-base00) !important;
      background-color: var(--solarized-base3) !important;
      background-image: none !important;
      border-color: var(--solarized-base1) !important;
    }

    ul.cssMenu,
    ul.cssMenu ul {
      color: var(--solarized-base00) !important;
      background-color: var(--solarized-base3) !important;
    }

    ul.cssMenu li:hover > a,
    ul.cssMenu li a:hover {
      color: var(--solarized-base01) !important;
      background-color: var(--solarized-base2) !important;
    }

    ::selection {
      color: var(--solarized-base01);
      background: var(--solarized-base2);
    }
  `;

  GM.addStyle(css);
})();
