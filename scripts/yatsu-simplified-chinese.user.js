// ==UserScript==
// @name         Yatsu Reader — Traditional to Simplified Chinese
// @namespace    https://app.yatsu.moe/
// @version      1.2.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @description  Converts Traditional Chinese text on app.yatsu.moe to Simplified characters using OpenCC (characters only, no vocabulary localization).
// @author       claude.ai.prjr7@passmail.net
// @match        https://app.yatsu.moe/*
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.4.1/dist/umd/t2cn.js#sha256-cnj6Y5j1mnkHXndo208qeMqyKFQXA6HVkAIsGeIzQZ8=
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @run-at       document-idle
// @sandbox      DOM
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const ENABLED_KEY = 'yatsu-t2s-enabled';
  const LOG_PREFIX = '[Yatsu Reader T2S]';

  async function main() {
    const enabled = await GM.getValue(ENABLED_KEY, true);
    const menuAction = enabled ? 'Disable' : 'Enable';

    await GM.registerMenuCommand(
      `${menuAction} Simplified conversion (reloads page)`,
      async () => {
        try {
          await GM.setValue(ENABLED_KEY, !enabled);
          location.reload();
        } catch (error) {
          console.error(`${LOG_PREFIX} Could not save the conversion setting.`, error);
        }
      },
      {
        title: `${menuAction} conversion and reload this page.`,
      }
    );

    if (!enabled) return;

    const openCC = globalThis.OpenCC;
    if (typeof openCC?.Converter !== 'function' || typeof openCC?.CustomConverter !== 'function') {
      throw new Error('OpenCC did not expose the required Converter and CustomConverter APIs.');
    }

    // Characters-only conversion: 裡→里, 說→说, but keeps original vocabulary.
    const convert = openCC.Converter({ from: 't', to: 'cn' });

    // OpenCC leaves 著 alone unless a phrase-dict entry matches, because 著 is
    // also valid simplified (著名, 著作). That misses common aspect-particle
    // uses (趁著, 看著, 接著…). Post-process: identity-protect the zhù words
    // (longest match wins in CustomConverter), convert every other 著 → 着.
    const fixZhe = openCC.CustomConverter([
      ['著作', '著作'], ['著名', '著名'], ['著称', '著称'], ['著述', '著述'],
      ['著者', '著者'], ['著书', '著书'], ['著录', '著录'], ['著有', '著有'],
      ['名著', '名著'], ['原著', '原著'], ['巨著', '巨著'], ['专著', '专著'],
      ['论著', '论著'], ['编著', '编著'], ['译著', '译著'], ['合著', '合著'],
      ['拙著', '拙著'], ['遗著', '遗著'], ['显著', '显著'], ['昭著', '昭著'],
      ['卓著', '卓著'], ['土著', '土著'],
      ['著', '着'],
    ]);

    const convertText = (text) => fixZhe(convert(text));

    const HAN_RE = /\p{Script=Han}/u;
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE']);

    function convertTextNode(node) {
      const text = node.nodeValue;
      if (!text || !HAN_RE.test(text)) return;
      const converted = convertText(text);
      // Compare-before-write: simplified text converts to itself, so this also
      // prevents the MutationObserver from looping on our own writes.
      if (converted !== text) node.nodeValue = converted;
    }

    function shouldSkip(element) {
      return SKIP_TAGS.has(element.tagName) || element.isContentEditable;
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
      if (root.shadowRoot) convertTree(root.shadowRoot);
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) convertTree(element.shadowRoot);
      }
    }

    function convertTitle() {
      const title = document.title;
      if (title && HAN_RE.test(title)) {
        const converted = convertText(title);
        if (converted !== title) document.title = converted;
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          if (!parent || !shouldSkip(parent)) convertTextNode(mutation.target);
        } else if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) convertTree(node);
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
  }

  void main().catch((error) => {
    console.error(`${LOG_PREFIX} Initialization failed.`, error);
  });
})();
