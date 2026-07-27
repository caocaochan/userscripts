// ==UserScript==
// @name         Yatsu Reader — Traditional to Simplified Chinese
// @namespace    https://app.yatsu.moe/
// @version      1.1.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @description  Converts Traditional Chinese text on app.yatsu.moe to Simplified characters using OpenCC (characters only, no vocabulary localization).
// @author       claude.ai.prjr7@passmail.net
// @match        https://app.yatsu.moe/*
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/t2cn.js
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async function () {
  'use strict';

  const ENABLED_KEY = 'yatsu-t2s-enabled';
  const enabled = await GM.getValue(ENABLED_KEY, true);

  GM.registerMenuCommand(
    enabled ? 'Disable Simplified conversion (reloads page)' : 'Enable Simplified conversion (reloads page)',
    async () => {
      await GM.setValue(ENABLED_KEY, !enabled);
      location.reload();
    }
  );

  if (!enabled) return;

  // Characters-only conversion: 裡→里, 說→说, but keeps original vocabulary.
  const convert = OpenCC.Converter({ from: 't', to: 'cn' });

  // OpenCC leaves 著 alone unless a phrase-dict entry matches, because 著 is
  // also valid simplified (著名, 著作). That misses common aspect-particle
  // uses (趁著, 看著, 接著…). Post-process: identity-protect the zhù words
  // (longest match wins in CustomConverter), convert every other 著 → 着.
  const fixZhe = OpenCC.CustomConverter([
    ['著作', '著作'], ['著名', '著名'], ['著称', '著称'], ['著述', '著述'],
    ['著者', '著者'], ['著书', '著书'], ['著录', '著录'], ['著有', '著有'],
    ['名著', '名著'], ['原著', '原著'], ['巨著', '巨著'], ['专著', '专著'],
    ['论著', '论著'], ['编著', '编著'], ['译著', '译著'], ['合著', '合著'],
    ['拙著', '拙著'], ['遗著', '遗著'], ['显著', '显著'], ['昭著', '昭著'],
    ['卓著', '卓著'], ['土著', '土著'],
    ['著', '着'],
  ]);

  const convertText = (s) => fixZhe(convert(s));

  // Quick pre-filter: CJK Unified Ideographs (+ Ext A) and compatibility ideographs.
  const CJK_RE = /[㐀-鿿豈-﫿]/;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE']);

  function convertTextNode(node) {
    const text = node.nodeValue;
    if (!text || !CJK_RE.test(text)) return;
    const converted = convertText(text);
    // Compare-before-write: simplified text converts to itself, so this also
    // prevents the MutationObserver from looping on our own writes.
    if (converted !== text) node.nodeValue = converted;
  }

  function shouldSkip(el) {
    return SKIP_TAGS.has(el.tagName) || el.isContentEditable;
  }

  function convertTree(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      const parent = root.parentElement;
      if (!parent || !shouldSkip(parent)) convertTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return shouldSkip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      convertTextNode(node);
    }

    // Cover any open shadow roots (walker doesn't descend into them).
    const scope = root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? root : null;
    if (scope && scope.querySelectorAll) {
      if (root.shadowRoot) convertTree(root.shadowRoot);
      for (const el of scope.querySelectorAll('*')) {
        if (el.shadowRoot) convertTree(el.shadowRoot);
      }
    }
  }

  function convertTitle() {
    const t = document.title;
    if (t && CJK_RE.test(t)) {
      const converted = convertText(t);
      if (converted !== t) document.title = converted;
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') {
        const parent = m.target.parentElement;
        if (!parent || !shouldSkip(parent)) convertTextNode(m.target);
      } else if (m.type === 'childList') {
        for (const node of m.addedNodes) convertTree(node);
      }
    }
    convertTitle();
  });

  function start() {
    convertTree(document.body);
    convertTitle();
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (document.body) {
    start();
  } else {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
