// ==UserScript==
// @name         Yatsu OpenCC Toggle
// @namespace    https://app.yatsu.moe/
// @version      0.1.0
// @description  Toggle simplified/traditional Chinese conversion for Yatsu reader content with OpenCC.
// @match        https://app.yatsu.moe/*
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.3.0/dist/umd/full.js
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  const STORAGE_KEY = 'yatsu-opencc-mode';
  const MODE_SIMPLIFIED = 'simplified';
  const MODE_TRADITIONAL = 'traditional';
  const BUTTON_ID = 'yatsu-opencc-toggle';
  const BUTTON_IGNORE_CLASS = 'ignore-opencc';
  const APP_SHELL_SELECTOR = '.app-page-shell';
  const READER_SELECTORS = [
    '.contents',
    '[data-reader-content]',
    '[class*="reader-content"]',
    '[class*="chapter-content"]',
    '[class*="book-content"]',
    'article',
  ];
  const SKIP_TAGS = new Set([
    'BUTTON',
    'INPUT',
    'NOSCRIPT',
    'OPTION',
    'SCRIPT',
    'SELECT',
    'STYLE',
    'TEXTAREA',
  ]);
  const HAN_REGEX = /\p{Script=Han}/gu;

  const originalTextByNode = new WeakMap();

  let mode = readMode();
  let button = null;
  let currentContainer = null;
  let rootObserver = null;
  let containerObserver = null;
  let rebindTimer = 0;
  let isApplying = false;
  let warnedAboutOpenCC = false;
  let warnedAboutContainer = false;
  const converters = createConverters();

  function createConverters() {
    if (!window.OpenCC || typeof window.OpenCC.Converter !== 'function') {
      warnOnce('OpenCC is not available; the toggle button will stay visible but conversion is disabled.');
      return null;
    }

    return {
      [MODE_SIMPLIFIED]: window.OpenCC.Converter({ from: 't', to: 'cn' }),
      [MODE_TRADITIONAL]: window.OpenCC.Converter({ from: 'cn', to: 't' }),
    };
  }

  function readMode() {
    const storedMode = getStoredValue(STORAGE_KEY, MODE_SIMPLIFIED);
    return storedMode === MODE_TRADITIONAL ? MODE_TRADITIONAL : MODE_SIMPLIFIED;
  }

  function writeMode(nextMode) {
    setStoredValue(STORAGE_KEY, nextMode);
  }

  function getStoredValue(key, fallbackValue) {
    try {
      if (typeof GM_getValue === 'function') {
        return GM_getValue(key, fallbackValue);
      }
    } catch (error) {
      console.warn('[Yatsu OpenCC]', error);
    }

    try {
      const rawValue = window.localStorage.getItem(key);
      return rawValue == null ? fallbackValue : rawValue;
    } catch (error) {
      return fallbackValue;
    }
  }

  function setStoredValue(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {
      console.warn('[Yatsu OpenCC]', error);
    }

    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn('[Yatsu OpenCC]', error);
    }
  }

  function warnOnce(message) {
    if (message.includes('OpenCC')) {
      if (warnedAboutOpenCC) {
        return;
      }
      warnedAboutOpenCC = true;
    }

    if (message.includes('reader container')) {
      if (warnedAboutContainer) {
        return;
      }
      warnedAboutContainer = true;
    }

    console.warn(`[Yatsu OpenCC] ${message}`);
  }

  function ensureButton() {
    if (button && button.isConnected) {
      updateButtonLabel();
      return button;
    }

    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = BUTTON_IGNORE_CLASS;
    button.textContent = '';
    button.setAttribute('aria-live', 'polite');
    button.style.position = 'fixed';
    button.style.right = '18px';
    button.style.bottom = '56px';
    button.style.width = '42px';
    button.style.height = '42px';
    button.style.border = '1px solid rgba(15, 23, 42, 0.16)';
    button.style.borderRadius = '999px';
    button.style.background = 'rgba(255, 255, 255, 0.92)';
    button.style.color = '#111827';
    button.style.boxShadow = '0 10px 30px rgba(15, 23, 42, 0.18)';
    button.style.backdropFilter = 'blur(8px)';
    button.style.fontSize = '18px';
    button.style.fontWeight = '700';
    button.style.lineHeight = '1';
    button.style.cursor = 'pointer';
    button.style.zIndex = '2147483647';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.padding = '0';
    button.style.touchAction = 'manipulation';

    button.addEventListener('click', () => {
      mode = mode === MODE_SIMPLIFIED ? MODE_TRADITIONAL : MODE_SIMPLIFIED;
      writeMode(mode);
      updateButtonLabel();
      applyToCurrentContainer();
    });

    updateButtonLabel();
    document.body.appendChild(button);
    return button;
  }

  function updateButtonLabel() {
    if (!button) {
      return;
    }

    button.textContent = mode === MODE_SIMPLIFIED ? '简' : '繁';
    button.title = mode === MODE_SIMPLIFIED ? 'Simplified mode' : 'Traditional mode';
    button.setAttribute('aria-label', button.title);
    button.style.opacity = converters ? '1' : '0.72';
  }

  function scheduleRebind(delay = 80) {
    window.clearTimeout(rebindTimer);
    rebindTimer = window.setTimeout(bindReaderContainer, delay);
  }

  function bindReaderContainer() {
    const nextContainer = findReaderContainer();

    if (!nextContainer) {
      currentContainer = null;
      disconnectContainerObserver();
      warnOnce('No reader container found on this page; skipping conversion until reader content appears.');
      return;
    }

    warnedAboutContainer = false;

    if (currentContainer !== nextContainer) {
      currentContainer = nextContainer;
      observeContainer(currentContainer);
    }

    applyToCurrentContainer();
  }

  function findReaderContainer() {
    const appShell = document.querySelector(APP_SHELL_SELECTOR);
    if (!appShell) {
      return null;
    }

    for (const selector of READER_SELECTORS) {
      const candidates = Array.from(appShell.querySelectorAll(selector));
      const bestMatch = pickBestContainer(candidates);
      if (bestMatch) {
        return bestMatch;
      }
    }

    const heuristicCandidates = Array.from(appShell.querySelectorAll('main, article, section, div'));
    return pickBestContainer(heuristicCandidates);
  }

  function pickBestContainer(candidates) {
    let bestElement = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = scoreContainer(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestElement = candidate;
      }
    }

    return bestElement;
  }

  function scoreContainer(element) {
    if (!(element instanceof HTMLElement)) {
      return 0;
    }

    if (!element.isConnected || !isElementVisible(element) || shouldSkipContainer(element)) {
      return 0;
    }

    const metrics = getTextMetrics(element);
    if (metrics.textLength < 120 || metrics.hanCount < 40 || metrics.nodeCount < 4 || metrics.maxNodeLength < 20) {
      return 0;
    }

    return metrics.textLength + metrics.hanCount * 2 + metrics.maxNodeLength * 3;
  }

  function getTextMetrics(root) {
    let textLength = 0;
    let hanCount = 0;
    let nodeCount = 0;
    let maxNodeLength = 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();

    while (textNode) {
      if (shouldScoreTextNode(textNode, root)) {
        const value = normalizeWhitespace(textNode.nodeValue || '');
        if (value) {
          nodeCount += 1;
          textLength += value.length;
          maxNodeLength = Math.max(maxNodeLength, value.length);
          hanCount += countHanCharacters(value);
        }
      }
      textNode = walker.nextNode();
    }

    return { textLength, hanCount, nodeCount, maxNodeLength };
  }

  function shouldScoreTextNode(node, root) {
    if (!(node instanceof Text)) {
      return false;
    }

    const parentElement = node.parentElement;
    if (!parentElement || !root.contains(parentElement) || !isElementVisible(parentElement)) {
      return false;
    }

    if (parentElement.closest('[aria-hidden="true"]')) {
      return false;
    }

    if (parentElement.closest('[contenteditable=""], [contenteditable="plaintext-only"], [contenteditable="true"]')) {
      return false;
    }

    let currentElement = parentElement;
    while (currentElement) {
      if (SKIP_TAGS.has(currentElement.tagName) || currentElement.classList.contains(BUTTON_IGNORE_CLASS)) {
        return false;
      }

      currentElement = currentElement.parentElement;
    }

    return countHanCharacters(node.nodeValue || '') > 0;
  }

  function countHanCharacters(value) {
    return Array.from(value.matchAll(HAN_REGEX)).length;
  }

  function shouldSkipContainer(element) {
    const tagName = element.tagName;
    const className = element.className;
    const role = element.getAttribute('role') || '';

    if (SKIP_TAGS.has(tagName)) {
      return true;
    }

    if (element.id === BUTTON_ID || element.closest(`#${BUTTON_ID}`)) {
      return true;
    }

    if (typeof className === 'string' && /(dialog|drawer|footer|header|menu|modal|nav|sidebar|toolbar)/i.test(className)) {
      return true;
    }

    if (/^(banner|complementary|dialog|menu|navigation|search|tablist|toolbar)$/i.test(role)) {
      return true;
    }

    if (element.closest('[aria-hidden="true"]')) {
      return true;
    }

    return false;
  }

  function isElementVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    return element.getAttribute('aria-hidden') !== 'true';
  }

  function normalizeWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
  }

  function observeRoot() {
    if (rootObserver || !document.body) {
      return;
    }

    rootObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') {
          continue;
        }

        if (!currentContainer || !currentContainer.isConnected) {
          scheduleRebind(40);
          return;
        }

        for (const addedNode of mutation.addedNodes) {
          if (addedNode instanceof HTMLElement && addedNode.matches(APP_SHELL_SELECTOR)) {
            scheduleRebind(40);
            return;
          }
        }

        for (const removedNode of mutation.removedNodes) {
          if (removedNode === currentContainer || (removedNode instanceof HTMLElement && removedNode.contains(currentContainer))) {
            scheduleRebind(40);
            return;
          }
        }
      }
    });

    rootObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function observeContainer(container) {
    disconnectContainerObserver();

    containerObserver = new MutationObserver((mutations) => {
      if (isApplying) {
        return;
      }

      if (!currentContainer || !currentContainer.isConnected) {
        scheduleRebind(40);
        return;
      }

      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          processTextNode(mutation.target, true);
          continue;
        }

        for (const addedNode of mutation.addedNodes) {
          processNode(addedNode, true);
        }

        for (const removedNode of mutation.removedNodes) {
          if (removedNode === currentContainer || (removedNode instanceof HTMLElement && removedNode.contains(currentContainer))) {
            scheduleRebind(40);
            return;
          }
        }
      }
    });

    containerObserver.observe(container, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function disconnectContainerObserver() {
    if (!containerObserver) {
      return;
    }

    containerObserver.disconnect();
    containerObserver = null;
  }

  function applyToCurrentContainer() {
    if (!currentContainer || !currentContainer.isConnected || !converters) {
      return;
    }

    processNode(currentContainer, false);
  }

  function processNode(node, refreshOriginal) {
    if (!currentContainer || !currentContainer.isConnected || !converters) {
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      processTextNode(node, refreshOriginal);
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      processTextNode(textNode, refreshOriginal);
      textNode = walker.nextNode();
    }
  }

  function processTextNode(node, refreshOriginal) {
    if (!(node instanceof Text) || !converters) {
      return;
    }

    if (!shouldProcessTextNode(node)) {
      return;
    }

    const currentValue = node.nodeValue || '';
    const trimmedValue = normalizeWhitespace(currentValue);
    if (!trimmedValue) {
      return;
    }

    if (refreshOriginal || !originalTextByNode.has(node)) {
      originalTextByNode.set(node, currentValue);
    }

    const sourceValue = originalTextByNode.get(node);
    const converter = converters[mode];
    const convertedValue = converter(sourceValue);

    if (convertedValue === currentValue) {
      return;
    }

    isApplying = true;
    node.nodeValue = convertedValue;
    isApplying = false;
  }

  function shouldProcessTextNode(node) {
    if (!(node instanceof Text)) {
      return false;
    }

    const parentElement = node.parentElement;
    if (!parentElement || !currentContainer || !currentContainer.contains(parentElement)) {
      return false;
    }

    if (!isElementVisible(parentElement)) {
      return false;
    }

    if (parentElement.closest(`#${BUTTON_ID}, .${BUTTON_IGNORE_CLASS}`)) {
      return false;
    }

    if (parentElement.closest('[aria-hidden="true"]')) {
      return false;
    }

    if (parentElement.closest('[contenteditable=""], [contenteditable="plaintext-only"], [contenteditable="true"]')) {
      return false;
    }

    let currentElement = parentElement;
    while (currentElement) {
      if (SKIP_TAGS.has(currentElement.tagName)) {
        return false;
      }

      if (currentElement.classList.contains(BUTTON_IGNORE_CLASS)) {
        return false;
      }

      currentElement = currentElement.parentElement;
    }

    return countHanCharacters(node.nodeValue || '') > 0;
  }

  function start() {
    ensureButton();
    observeRoot();
    scheduleRebind(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
