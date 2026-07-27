// ==UserScript==
// @name         Yatsu Simplified Chinese
// @namespace    https://app.yatsu.moe/
// @version      0.1.4
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/yatsu-simplified-chinese.user.js
// @description  Converts Yatsu Reader book content from Traditional Chinese to Simplified Chinese with OpenCC.
// @author       CaoCao
// @match        https://app.yatsu.moe/*
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/opencc-js@latest/dist/umd/full.js
// @grant        GM.addStyle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @grant        window.onurlchange
// ==/UserScript==

(() => {
  "use strict";

  const STORAGE_KEY = "yatsu-simplified-chinese-settings";
  const PANEL_ID = "yatsu-simplified-chinese-panel";
  const LAUNCHER_ID = "yatsu-simplified-chinese-launcher";
  const ROOT_CLASS = "yatsu-simplified-chinese-root";
  const STATUS_CLASS = "yatsu-simplified-chinese-status";
  const SKIP_SELECTOR = [
    "script",
    "style",
    "noscript",
    "textarea",
    "input",
    "select",
    "option",
    "svg",
    "canvas",
    "iframe",
    "object",
    "embed",
    "math",
    "code",
    "pre",
    "kbd",
    "samp",
    "[contenteditable='true']",
    ".ignore-opencc",
    `#${PANEL_ID}`,
    `#${LAUNCHER_ID}`,
  ].join(",");
  const CONTENT_SELECTOR = ".book-content";
  const FALLBACK_CONTENT_SELECTOR = ".book-content-container";
  const APPLY_DELAY_MS = 80;
  const OPENCC_WAIT_TIMEOUT_MS = 12000;
  const DEFAULT_SETTINGS = {
    enabled: true,
  };

  const css = `
    #${LAUNCHER_ID} {
      position: fixed;
      right: 24px;
      bottom: 32px;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 48px;
      height: 42px;
      padding: 0 12px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      color: #f8fbff;
      background: rgba(18, 26, 34, 0.96);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
      font: 800 14px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      touch-action: manipulation;
    }

    #${LAUNCHER_ID}:hover,
    #${LAUNCHER_ID}[aria-expanded="true"] {
      border-color: rgba(70, 211, 181, 0.54);
      background: rgba(28, 40, 51, 0.97);
    }

    #${LAUNCHER_ID}[data-enabled="false"] {
      color: rgba(248, 251, 255, 0.72);
      background: rgba(45, 49, 56, 0.92);
    }

    #${PANEL_ID} {
      position: fixed;
      right: 24px;
      bottom: 90px;
      z-index: 2147483647;
      box-sizing: border-box;
      width: min(320px, calc(100vw - 32px));
      padding: 14px;
      color: #f8fbff;
      background: rgba(18, 26, 34, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
      font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(10px);
    }

    #${PANEL_ID}[hidden] {
      display: none !important;
    }

    #${PANEL_ID} .ysc-title {
      margin: 0 0 10px;
      color: #fff;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.2;
    }

    #${PANEL_ID} .${STATUS_CLASS} {
      min-height: 18px;
      margin: 0 0 12px;
      color: rgba(248, 251, 255, 0.72);
      font-size: 12px;
    }

    #${PANEL_ID} .ysc-check {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 0 0 12px;
      color: rgba(248, 251, 255, 0.88);
      font-weight: 700;
    }

    #${PANEL_ID} .ysc-check input {
      position: static !important;
      display: block !important;
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      min-width: 18px;
      margin: 0;
      opacity: 1 !important;
      appearance: auto !important;
      -webkit-appearance: checkbox !important;
      accent-color: #46d3b5;
      cursor: pointer;
    }

    #${PANEL_ID} .ysc-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    #${PANEL_ID} button {
      height: 30px;
      padding: 0 11px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      color: #f8fbff;
      background: rgba(34, 48, 60, 0.94);
      font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
    }

    #${PANEL_ID} button:hover {
      border-color: rgba(70, 211, 181, 0.46);
      background: rgba(45, 63, 78, 0.96);
    }
  `;

  let settings = { ...DEFAULT_SETTINGS };
  let settingsWriteQueue = Promise.resolve();
  let converter = null;
  let launcher = null;
  let panel = null;
  let observer = null;
  let applyTimer = 0;
  let isPanelOpen = false;
  let isApplying = false;
  let menuCommandsInstalled = false;
  let lastConvertedCount = 0;
  const originalTextByNode = new WeakMap();
  const convertedTextByNode = new WeakMap();

  async function readSettings() {
    let rawValue;
    try {
      rawValue = await GM.getValue(STORAGE_KEY, null);
    } catch (error) {
      console.warn("[Yatsu Simplified Chinese] Could not read saved settings.", error);
      return { ...DEFAULT_SETTINGS };
    }

    if (!rawValue) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
      return normalizeSettings(parsed);
    } catch (error) {
      console.warn("[Yatsu Simplified Chinese] Could not parse saved settings.", error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  function normalizeSettings(value) {
    const next = { ...DEFAULT_SETTINGS, ...(value && typeof value === "object" ? value : {}) };
    next.enabled = Boolean(next.enabled);
    return next;
  }

  function saveSettings() {
    const snapshot = { ...settings };
    settingsWriteQueue = settingsWriteQueue
      .then(() => GM.setValue(STORAGE_KEY, snapshot))
      .catch((error) => {
        console.warn("[Yatsu Simplified Chinese] Could not save settings.", error);
      });
    return settingsWriteQueue;
  }

  function addStyle() {
    GM.addStyle(css);
  }

  function getMountRoot() {
    return document.body || document.documentElement;
  }

  function ensureLauncher() {
    if (launcher && launcher.isConnected) {
      return launcher;
    }

    launcher = document.getElementById(LAUNCHER_ID) || document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.textContent = "简";
    launcher.setAttribute("aria-controls", PANEL_ID);
    launcher.addEventListener("click", togglePanel);

    if (!launcher.parentElement) {
      getMountRoot().appendChild(launcher);
    }

    renderLauncher();
    return launcher;
  }

  function ensurePanel() {
    if (panel && panel.isConnected) {
      return panel;
    }

    panel = document.getElementById(PANEL_ID) || document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Yatsu Simplified Chinese settings");
    panel.hidden = !isPanelOpen;
    panel.replaceChildren();
    panel.append(buildPanelContent());

    if (!panel.parentElement) {
      getMountRoot().appendChild(panel);
    }

    syncPanel();
    return panel;
  }

  function buildPanelContent() {
    const fragment = document.createDocumentFragment();

    const title = document.createElement("div");
    title.className = "ysc-title";
    title.textContent = "Yatsu Simplified Chinese";
    fragment.appendChild(title);

    const status = document.createElement("div");
    status.className = STATUS_CLASS;
    fragment.appendChild(status);

    const label = document.createElement("label");
    label.className = "ysc-check";

    const text = document.createElement("span");
    text.textContent = "Convert book content";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.settingKey = "enabled";
    input.addEventListener("change", () => setEnabled(input.checked));

    label.append(text, input);
    fragment.appendChild(label);

    const actions = document.createElement("div");
    actions.className = "ysc-actions";

    const forceButton = document.createElement("button");
    forceButton.type = "button";
    forceButton.textContent = "Reconvert";
    forceButton.addEventListener("click", forceReconvert);

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.addEventListener("click", resetSettings);

    actions.append(forceButton, resetButton);
    fragment.appendChild(actions);
    return fragment;
  }

  function renderLauncher() {
    if (!launcher) {
      return;
    }

    launcher.dataset.enabled = String(settings.enabled);
    launcher.title = settings.enabled ? "Yatsu Simplified Chinese is enabled" : "Yatsu Simplified Chinese is disabled";
    launcher.setAttribute("aria-label", launcher.title);
    launcher.setAttribute("aria-expanded", isPanelOpen ? "true" : "false");
  }

  function syncPanel() {
    if (!panel) {
      return;
    }

    const input = panel.querySelector('[data-setting-key="enabled"]');
    if (input instanceof HTMLInputElement) {
      input.checked = settings.enabled;
    }

    const status = panel.querySelector(`.${STATUS_CLASS}`);
    if (status) {
      const contentCount = getContentRoots().length;
      if (!converter) {
        status.textContent = "Waiting for OpenCC...";
      } else if (!contentCount) {
        status.textContent = settings.enabled ? "Enabled; open a book to convert." : "Disabled.";
      } else if (settings.enabled) {
        status.textContent = lastConvertedCount > 0
          ? `Enabled; converted ${lastConvertedCount} new text node${lastConvertedCount === 1 ? "" : "s"}.`
          : "Enabled; reader content is being converted.";
      } else {
        status.textContent = "Disabled; original book text restored.";
      }
    }
  }

  function togglePanel() {
    if (isPanelOpen) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  function showPanel() {
    isPanelOpen = true;
    ensureLauncher();
    ensurePanel();
    panel.hidden = false;
    syncPanel();
    renderLauncher();
  }

  function hidePanel() {
    isPanelOpen = false;
    if (panel) {
      panel.hidden = true;
    }

    renderLauncher();
  }

  function setEnabled(enabled) {
    settings = normalizeSettings({ ...settings, enabled });
    saveSettings();

    if (settings.enabled) {
      scheduleApply(0);
    } else {
      restoreAllContent();
      lastConvertedCount = 0;
    }

    renderLauncher();
    syncPanel();
  }

  function forceReconvert() {
    restoreAllContent();
    lastConvertedCount = 0;

    if (settings.enabled) {
      scheduleApply(0);
    }

    syncPanel();
  }

  function resetSettings() {
    settings = { ...DEFAULT_SETTINGS };
    saveSettings();
    forceReconvert();
    renderLauncher();
    syncPanel();
  }

  function getContentRoots() {
    const bookContent = Array.from(document.querySelectorAll(CONTENT_SELECTOR))
      .filter((element) => element instanceof HTMLElement && !element.closest(`#${PANEL_ID}, #${LAUNCHER_ID}`));
    if (bookContent.length) {
      return bookContent;
    }

    return Array.from(document.querySelectorAll(FALLBACK_CONTENT_SELECTOR))
      .filter((element) => element instanceof HTMLElement && !element.closest(`#${PANEL_ID}, #${LAUNCHER_ID}`));
  }

  function scheduleApply(delay = APPLY_DELAY_MS) {
    window.clearTimeout(applyTimer);
    applyTimer = window.setTimeout(applyConversion, delay);
  }

  function applyConversion() {
    if (!settings.enabled || !converter || isApplying) {
      syncPanel();
      return;
    }

    const roots = getContentRoots();
    if (!roots.length) {
      lastConvertedCount = 0;
      syncPanel();
      return;
    }

    isApplying = true;
    try {
      lastConvertedCount = roots.reduce((count, root) => count + convertRoot(root), 0);
    } catch (error) {
      console.warn("[Yatsu Simplified Chinese] Could not convert reader content.", error);
    } finally {
      isApplying = false;
      syncPanel();
    }
  }

  function convertRoot(root) {
    let count = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => shouldProcessTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });

    while (walker.nextNode()) {
      count += convertTextNode(walker.currentNode);
    }

    return count;
  }

  function convertTextNode(node) {
    const current = node.nodeValue || "";
    if (!hasChineseText(current)) {
      return 0;
    }

    let source = current;
    if (originalTextByNode.has(node)) {
      const original = originalTextByNode.get(node);
      const converted = convertedTextByNode.get(node);
      if (current === converted) {
        return 0;
      }

      source = current === original ? original : current;
    }

    const next = converter(source);
    if (next === current || next === source) {
      return 0;
    }

    originalTextByNode.set(node, source);
    convertedTextByNode.set(node, next);
    node.nodeValue = next;
    return 1;
  }

  function restoreAllContent() {
    const roots = getContentRoots();
    isApplying = true;
    try {
      for (const root of roots) {
        restoreRoot(root);
      }
    } finally {
      isApplying = false;
    }
  }

  function restoreRoot(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => originalTextByNode.has(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });

    while (walker.nextNode()) {
      const node = walker.currentNode;
      node.nodeValue = originalTextByNode.get(node);
      originalTextByNode.delete(node);
      convertedTextByNode.delete(node);
    }
  }

  function shouldProcessTextNode(node) {
    const value = node.nodeValue || "";
    if (!value.trim() || !hasChineseText(value)) {
      return false;
    }

    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP_SELECTOR)) {
      return false;
    }

    return Boolean(parent.closest(CONTENT_SELECTOR) || parent.closest(FALLBACK_CONTENT_SELECTOR));
  }

  function hasChineseText(value) {
    return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(value);
  }

  function observeMutations() {
    if (observer || !document.body) {
      return;
    }

    observer = new MutationObserver((mutations) => {
      if (isApplying || !settings.enabled) {
        return;
      }

      for (const mutation of mutations) {
        if (mutation.type === "characterData" && shouldProcessTextNode(mutation.target)) {
          scheduleApply();
          return;
        }

        if (mutation.type !== "childList") {
          continue;
        }

        for (const addedNode of mutation.addedNodes) {
          if (isRelevantAddedNode(addedNode)) {
            scheduleApply();
            return;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function isRelevantAddedNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return shouldProcessTextNode(node);
    }

    if (!(node instanceof HTMLElement) || node.closest(`#${PANEL_ID}, #${LAUNCHER_ID}`)) {
      return false;
    }

    return node.matches(CONTENT_SELECTOR)
      || node.matches(FALLBACK_CONTENT_SELECTOR)
      || Boolean(node.querySelector(`${CONTENT_SELECTOR}, ${FALLBACK_CONTENT_SELECTOR}`))
      || Boolean(node.closest(`${CONTENT_SELECTOR}, ${FALLBACK_CONTENT_SELECTOR}`));
  }

  function observeNavigation() {
    window.addEventListener("urlchange", () => scheduleApply(0));
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);
  }

  function onDocumentPointerDown(event) {
    if (!isPanelOpen) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && ((panel && panel.contains(target)) || (launcher && launcher.contains(target)))) {
      return;
    }

    hidePanel();
  }

  function onDocumentKeyDown(event) {
    if (event.key !== "Escape" || !isPanelOpen) {
      return;
    }

    hidePanel();
  }

  function installMenuCommands() {
    if (menuCommandsInstalled) {
      return;
    }

    menuCommandsInstalled = true;
    GM.registerMenuCommand("Toggle Yatsu Chinese conversion", () => setEnabled(!settings.enabled));
    GM.registerMenuCommand("Force reconvert current book content", forceReconvert);
    GM.registerMenuCommand("Reset Yatsu Simplified Chinese settings", resetSettings);
  }

  function installDebugHandle() {
    window.yatsuSimplifiedChineseDebug = {
      apply: applyConversion,
      force: forceReconvert,
      getContentRoots,
      getSettings: () => ({ ...settings }),
      hide: hidePanel,
      reset: resetSettings,
      restore: restoreAllContent,
      setEnabled,
      show: showPanel,
      status: () => ({
        enabled: settings.enabled,
        hasConverter: Boolean(converter),
        contentRoots: getContentRoots().length,
        convertedTextNodes: lastConvertedCount,
        urlChangeListenerActive: true,
      }),
    };
  }

  async function waitForOpenCC() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < OPENCC_WAIT_TIMEOUT_MS) {
      const candidate = globalThis.OpenCC || window.OpenCC;
      if (candidate?.Converter) {
        return candidate;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }

    throw new Error("OpenCC did not load.");
  }

  async function start() {
    if (!document.body) {
      window.setTimeout(() => {
        void start().catch((error) => {
          console.error("[Yatsu Simplified Chinese] Could not start.", error);
        });
      }, 50);
      return;
    }

    settings = await readSettings();
    addStyle();
    ensureLauncher();
    ensurePanel();
    hidePanel();
    installMenuCommands();
    installDebugHandle();
    observeMutations();
    observeNavigation();

    try {
      const OpenCC = await waitForOpenCC();
      converter = OpenCC.Converter({ from: "tw", to: "cn" });
      scheduleApply(0);
    } catch (error) {
      console.warn("[Yatsu Simplified Chinese]", error);
      syncPanel();
    }
  }

  function startSafely() {
    void start().catch((error) => {
      console.error("[Yatsu Simplified Chinese] Could not start.", error);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSafely, { once: true });
  } else {
    startSafely();
  }
})();
