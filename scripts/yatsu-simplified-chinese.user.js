// ==UserScript==
// @name         Yatsu Reader — Traditional to Simplified Chinese
// @namespace    https://app.yatsu.moe/
// @version      1.2.4
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @description  Converts Traditional Chinese text on app.yatsu.moe to Simplified orthography using OpenCC without regional vocabulary localization.
// @author       CaoCao
// @match        https://app.yatsu.moe/*
// @require      https://cdn.jsdelivr.net/npm/opencc-js@latest/dist/umd/t2cn.js
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

    // Apply Taiwan-to-Mainland orthographic variants that do not collide with
    // ordinary Simplified text, without enabling regional vocabulary
    // localization. Ambiguous 么 is deliberately preserved. 鉅著 intentionally
    // keeps its direct simplified form instead of being normalized to 巨著.
    const preNormalize = openCC.CustomConverter([
      ['鉅著', '钜著'],
      ['潀', '潨'],
      ['痺', '痹'],
      ['睪', '睾'],
      ['簷', '檐'],
    ]);

    const ZHU_LEXEMES = [
      '著作', '著名', '著稱', '著述', '著者', '著書', '著錄', '著有',
      '著式', '著志', '著白', '著效', '著績', '著聞', '著成', '著文',
      '名著', '原著', '巨著', '钜著', '專著', '論著', '編著', '譯著',
      '合著', '拙著', '遺著', '顯著', '昭著', '卓著', '土著', '新著',
      '舊著', '近著',
    ];
    const PROTECTED_ZHU_LEXEMES = new Set(
      ZHU_LEXEMES.flatMap((lexeme) => [lexeme, convert(lexeme)])
    );

    let wordSegmenter = null;
    try {
      if (typeof globalThis.Intl?.Segmenter === 'function') {
        wordSegmenter = new globalThis.Intl.Segmenter('zh-Hans', { granularity: 'word' });
      }
    } catch {
      // The warning below also covers an implementation that exposes but
      // cannot construct Intl.Segmenter.
    }

    if (!wordSegmenter) {
      console.warn(
        `${LOG_PREFIX} Intl.Segmenter is unavailable; leaving ambiguous 著 unchanged.`
      );
    }

    function normalizeZheSegment(segment) {
      if (segment === '著' || !segment.includes('著')) return segment;

      const protectedOffsets = new Set();
      for (const lexeme of PROTECTED_ZHU_LEXEMES) {
        let lexemeOffset = segment.indexOf(lexeme);
        while (lexemeOffset !== -1) {
          for (let index = 0; index < lexeme.length; index += 1) {
            if (lexeme[index] === '著') protectedOffsets.add(lexemeOffset + index);
          }
          lexemeOffset = segment.indexOf(lexeme, lexemeOffset + 1);
        }
      }

      return segment.replace(/著/g, (match, offset) => (
        protectedOffsets.has(offset) ? match : '着'
      ));
    }

    function normalizeZheByWord(text) {
      if (!wordSegmenter || !text.includes('著')) return text;

      let normalized = '';
      for (const { segment } of wordSegmenter.segment(text)) {
        normalized += normalizeZheSegment(segment);
      }
      return normalized;
    }

    const convertText = (text) => convert(normalizeZheByWord(preNormalize(text)));

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
