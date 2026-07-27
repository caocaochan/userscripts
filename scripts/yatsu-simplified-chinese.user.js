// ==UserScript==
// @name         Yatsu Reader — Traditional to Simplified Chinese
// @namespace    https://app.yatsu.moe/
// @version      1.2.2
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @description  Converts Traditional Chinese text on app.yatsu.moe to Simplified orthography using OpenCC without regional vocabulary localization.
// @author       CaoCao
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

    // Orthographic conversion: 裡→里, 說→说, but keeps original vocabulary.
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
      ['著式', '著式'], ['著志', '著志'], ['著于', '著于'], ['著白', '著白'],
      ['钜著', '钜著'],
      ['著', '着'],
    ]);

    // Preserve 鉅著 as 钜著 before OpenCC normalizes 鉅 to 巨; doing this after
    // the main conversion could not distinguish 鉅著 from an original 巨著.
    const preserveZheBeforeConversion = openCC.CustomConverter([
      ['鉅著', '钜著'],
    ]);

    const convertText = (text) => fixZhe(convert(preserveZheBeforeConversion(text)));

    const HAN_RE = /\p{Script=Han}/u;
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE']);
    const BLOCK_TAGS = new Set([
      'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'CAPTION', 'DD', 'DETAILS',
      'DIALOG', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER',
      'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR', 'LI',
      'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD',
      'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
    ]);
    const RUBY_ANNOTATION_TAGS = new Set(['RP', 'RT']);
    const OBSERVER_OPTIONS = {
      childList: true,
      characterData: true,
      subtree: true,
    };
    const sourceTextByNode = new WeakMap();
    const renderedTextByNode = new WeakMap();
    const observedRoots = new WeakSet();
    const dirtyContainers = new Set();
    let dirtyFlushScheduled = false;
    let lengthWarningLogged = false;

    function shouldSkip(element) {
      return SKIP_TAGS.has(element.tagName) || element.isContentEditable;
    }

    function composedParentElement(element) {
      if (element.parentElement) return element.parentElement;
      return element.getRootNode()?.host || null;
    }

    function isWithinSkippedSubtree(element) {
      for (let current = element; current; current = composedParentElement(current)) {
        if (shouldSkip(current)) return true;
      }
      return false;
    }

    function sourceText(node) {
      if (!sourceTextByNode.has(node)) {
        sourceTextByNode.set(node, node.nodeValue || '');
      }
      return sourceTextByNode.get(node);
    }

    function writeText(node, text) {
      renderedTextByNode.set(node, text);
      if (node.nodeValue !== text) node.nodeValue = text;
    }

    function convertRun(nodes) {
      if (nodes.length === 0) return;

      const sourceParts = nodes.map((node) => sourceText(node));
      const source = sourceParts.join('');
      if (!HAN_RE.test(source)) return;

      const converted = convertText(source);
      const sourcePointCounts = sourceParts.map((part) => Array.from(part).length);
      const sourcePointCount = sourcePointCounts.reduce((total, count) => total + count, 0);
      const convertedPoints = Array.from(converted);

      if (convertedPoints.length !== sourcePointCount) {
        if (!lengthWarningLogged) {
          lengthWarningLogged = true;
          console.warn(
            `${LOG_PREFIX} Conversion changed the Unicode code-point count; `
              + 'falling back to independent text-node conversion.'
          );
        }
        nodes.forEach((node, index) => writeText(node, convertText(sourceParts[index])));
        return;
      }

      let pointOffset = 0;
      nodes.forEach((node, index) => {
        const pointCount = sourcePointCounts[index];
        writeText(node, convertedPoints.slice(pointOffset, pointOffset + pointCount).join(''));
        pointOffset += pointCount;
      });
    }

    function processContainer(root) {
      if (
        root.nodeType !== Node.ELEMENT_NODE
        && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
      ) {
        return;
      }
      if (root.nodeType === Node.ELEMENT_NODE && isWithinSkippedSubtree(root)) return;

      let run = [];
      const flushRun = () => {
        convertRun(run);
        run = [];
      };

      function visit(node, isContainerRoot = false) {
        if (node.nodeType === Node.TEXT_NODE) {
          run.push(node);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const element = node;
        if (shouldSkip(element)) {
          flushRun();
          return;
        }

        if (RUBY_ANNOTATION_TAGS.has(element.tagName)) {
          const outerRun = run;
          run = [];
          for (const child of element.childNodes) visit(child);
          flushRun();
          run = outerRun;
          return;
        }

        const isBoundary = !isContainerRoot && BLOCK_TAGS.has(element.tagName);
        const hasShadowRoot = Boolean(element.shadowRoot);
        if (isBoundary || hasShadowRoot || element.tagName === 'BR') flushRun();

        if (element.tagName !== 'BR' && element.tagName !== 'HR') {
          for (const child of element.childNodes) visit(child);
        }

        if (isBoundary || hasShadowRoot || element.tagName === 'BR') flushRun();

        if (element.shadowRoot) {
          processContainer(element.shadowRoot);
          observeRoot(element.shadowRoot);
        }
      }

      if (root.nodeType === Node.ELEMENT_NODE) {
        visit(root, true);
      } else {
        for (const child of root.childNodes) visit(child);
      }
      flushRun();
    }

    function convertTitle() {
      const titleElement = document.querySelector('title');
      if (!titleElement) return;
      convertRun(
        Array.from(titleElement.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)
      );
    }

    function findContainer(node) {
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && node.host) return node;

      let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!element) return null;
      if (element.closest('head')) return null;

      for (let current = element; current; current = current.parentElement) {
        if (shouldSkip(current) || BLOCK_TAGS.has(current.tagName)) return current;
      }

      const root = element.getRootNode();
      if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && root.host) return root;
      return document.body;
    }

    function composedContains(container, candidate) {
      if (container === candidate) return true;

      let current = candidate.host || candidate;
      while (current) {
        if (typeof container.contains === 'function' && container.contains(current)) return true;
        const root = current.getRootNode?.();
        current = root?.host || null;
      }
      return false;
    }

    function addDirtyContainer(container) {
      if (!container) return;

      for (const existing of dirtyContainers) {
        if (composedContains(existing, container)) return;
        if (composedContains(container, existing)) dirtyContainers.delete(existing);
      }
      dirtyContainers.add(container);
    }

    function flushDirtyContainers() {
      dirtyFlushScheduled = false;
      const containers = Array.from(dirtyContainers);
      dirtyContainers.clear();

      for (const container of containers) {
        if (!container.isConnected) continue;
        processContainer(container);
      }
    }

    function scheduleConversion(node) {
      addDirtyContainer(findContainer(node));
      if (dirtyFlushScheduled || dirtyContainers.size === 0) return;
      dirtyFlushScheduled = true;
      queueMicrotask(flushDirtyContainers);
    }

    function mutationAffectsTitle(mutation) {
      if (mutation.target === document.head) return true;
      const targetElement = mutation.target.nodeType === Node.ELEMENT_NODE
        ? mutation.target
        : mutation.target.parentElement;
      if (targetElement?.closest('title')) return true;

      return Array.from(mutation.addedNodes).some((node) => (
        node.nodeType === Node.ELEMENT_NODE
        && (node.tagName === 'TITLE' || node.querySelector('title'))
      ));
    }

    const observer = new MutationObserver((mutations) => {
      let titleDirty = false;

      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const currentText = mutation.target.nodeValue || '';
          if (renderedTextByNode.get(mutation.target) === currentText) continue;
          if (mutationAffectsTitle(mutation)) titleDirty = true;
          sourceTextByNode.set(mutation.target, currentText);
          scheduleConversion(mutation.target);
        } else if (mutation.type === 'childList') {
          if (mutationAffectsTitle(mutation)) titleDirty = true;
          for (const node of mutation.addedNodes) scheduleConversion(node);
        }
      }

      if (titleDirty) convertTitle();
    });

    function observeRoot(root) {
      if (observedRoots.has(root)) return;
      observer.observe(root, OBSERVER_OPTIONS);
      observedRoots.add(root);
    }

    function start() {
      processContainer(document.body);
      convertTitle();
      observeRoot(document.documentElement);
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
