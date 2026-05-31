// ==UserScript==
// @name         Missevan Subtitle Styler
// @namespace    https://www.missevan.com/
// @version      0.1.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/missevan-subtitle-styler.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/missevan-subtitle-styler.user.js
// @description  Adds readable, customizable subtitle styling controls to Missevan sound player pages.
// @author       CaoCao
// @match        https://www.missevan.com/sound/player*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  "use strict";

  const STORAGE_KEY = "missevan-subtitle-styler-settings";
  const ROOT_CLASS = "missevan-subtitle-styler-root";
  const PANEL_ID = "missevan-subtitle-styler-panel";
  const LAUNCHER_ID = "missevan-subtitle-styler-launcher";
  const ENHANCED_CLASS = "missevan-subtitle-styler-enhanced";
  const COLOR_OVERRIDE_CLASS = "missevan-subtitle-styler-color-override";
  const HIDDEN_CLASS = "missevan-subtitle-styler-hidden";
  const ROUTE_CHECK_INTERVAL_MS = 800;
  const REBIND_DELAY_MS = 80;

  const FONT_OPTIONS = [
    {
      label: "System sans",
      value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    {
      label: "Missevan default",
      value: 'SimHei, "Microsoft JhengHei", Arial, Helvetica, sans-serif',
    },
    {
      label: "Microsoft YaHei",
      value: '"Microsoft YaHei", "PingFang SC", sans-serif',
    },
    {
      label: "PingFang SC",
      value: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    },
    {
      label: "Serif",
      value: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif',
    },
  ];

  const SHADOWS = {
    none: "none",
    soft: "0 1px 2px rgba(0, 0, 0, 0.75), 0 0 5px rgba(0, 0, 0, 0.45)",
    strong: "0 1px 2px rgba(0, 0, 0, 0.95), 0 0 7px rgba(0, 0, 0, 0.78), 0 0 14px rgba(0, 0, 0, 0.5)",
  };

  const DEFAULT_SETTINGS = {
    fontFamily: FONT_OPTIONS[0].value,
    fontSize: 30,
    lineHeight: 1.28,
    verticalPosition: 74,
    backgroundOpacity: 0.62,
    shadowStrength: "strong",
    useRoleColors: true,
    textColor: "#ffffff",
  };

  const css = `
    :root.${ROOT_CLASS} {
      --mss-font-family: ${DEFAULT_SETTINGS.fontFamily};
      --mss-font-size: ${DEFAULT_SETTINGS.fontSize}px;
      --mss-line-height: ${DEFAULT_SETTINGS.lineHeight};
      --mss-bottom: ${DEFAULT_SETTINGS.verticalPosition}px;
      --mss-background-opacity: ${DEFAULT_SETTINGS.backgroundOpacity};
      --mss-text-color: ${DEFAULT_SETTINGS.textColor};
      --mss-text-shadow: ${SHADOWS[DEFAULT_SETTINGS.shadowStrength]};
    }

    .subtitle-container.${ENHANCED_CLASS} {
      inset: auto 20px var(--mss-bottom) 20px !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-end !important;
      width: auto !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: calc(100% - 48px) !important;
      overflow: visible !important;
      padding: 0 !important;
      pointer-events: none !important;
      color: var(--mss-text-color) !important;
      font-family: var(--mss-font-family) !important;
      font-size: var(--mss-font-size) !important;
      line-height: var(--mss-line-height) !important;
      text-align: center !important;
      z-index: 2147483600 !important;
    }

    .subtitle-container.${ENHANCED_CLASS} > span {
      box-sizing: border-box !important;
      display: block !important;
      width: fit-content !important;
      max-width: min(100%, 1120px) !important;
      margin: 0 0 6px !important;
      padding: 5px 12px 6px !important;
      overflow-wrap: anywhere !important;
      border-radius: 7px !important;
      background: rgba(0, 0, 0, var(--mss-background-opacity)) !important;
      font-family: var(--mss-font-family) !important;
      font-size: var(--mss-font-size) !important;
      font-weight: 700 !important;
      line-height: var(--mss-line-height) !important;
      letter-spacing: 0 !important;
      text-align: center !important;
      text-shadow: var(--mss-text-shadow) !important;
      white-space: normal !important;
    }

    .subtitle-container.${ENHANCED_CLASS}.${COLOR_OVERRIDE_CLASS} > span {
      color: var(--mss-text-color) !important;
    }

    .subtitle-container.${ENHANCED_CLASS}.${HIDDEN_CLASS} {
      display: none !important;
    }

    #${LAUNCHER_ID} {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 58px;
      height: 42px;
      padding: 0 14px;
      border: 0;
      border-radius: 8px;
      color: #08110f;
      background: #7ce7d1;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
      font: 800 14px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      touch-action: manipulation;
    }

    #${LAUNCHER_ID}:hover,
    #${LAUNCHER_ID}[aria-expanded="true"] {
      background: #a0f2e2;
    }

    #${PANEL_ID} {
      position: fixed;
      right: 24px;
      bottom: 82px;
      z-index: 2147483647;
      box-sizing: border-box;
      width: min(360px, calc(100vw - 32px));
      max-height: calc(100vh - 106px);
      max-height: calc(100dvh - 106px);
      padding: 16px;
      overflow-y: auto;
      color: #f7fbff;
      background: rgba(17, 24, 39, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
      font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(10px);
    }

    #${PANEL_ID}[hidden] {
      display: none !important;
    }

    #${PANEL_ID} .mss-title {
      margin: 0 0 12px;
      color: #fff;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.2;
    }

    #${PANEL_ID} .mss-grid {
      display: grid;
      gap: 11px;
    }

    #${PANEL_ID} label {
      display: grid;
      gap: 5px;
      margin: 0;
      color: rgba(247, 251, 255, 0.82);
      font-weight: 700;
    }

    #${PANEL_ID} .mss-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }

    #${PANEL_ID} .mss-row output {
      min-width: 52px;
      color: rgba(247, 251, 255, 0.64);
      font-size: 12px;
      text-align: right;
    }

    #${PANEL_ID} select,
    #${PANEL_ID} input[type="range"],
    #${PANEL_ID} input[type="color"] {
      width: 100%;
    }

    #${PANEL_ID} select {
      height: 32px;
      padding: 0 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
      font: 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${PANEL_ID} input[type="range"] {
      accent-color: #7ce7d1;
    }

    #${PANEL_ID} input[type="color"] {
      height: 32px;
      padding: 2px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
    }

    #${PANEL_ID} .mss-check {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    #${PANEL_ID} .mss-check input {
      width: 18px;
      height: 18px;
      accent-color: #7ce7d1;
    }

    #${PANEL_ID} .mss-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
    }

    #${PANEL_ID} button {
      height: 30px;
      padding: 0 11px;
      border: 0;
      border-radius: 7px;
      color: #08110f;
      background: #7ce7d1;
      font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
    }

    #${PANEL_ID} button:hover {
      background: #a0f2e2;
    }
  `;

  let settings = readSettings();
  let launcher = null;
  let panel = null;
  let subtitleContainer = null;
  let subtitleObserver = null;
  let bodyObserver = null;
  let rebindTimer = 0;
  let isPanelOpen = false;
  let lastHref = window.location.href;
  let menuCommandsInstalled = false;

  function readSettings() {
    const rawValue = getStoredValue(STORAGE_KEY, null);
    if (!rawValue) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
      return normalizeSettings(parsed);
    } catch (error) {
      console.warn("[Missevan Subtitle Styler] Could not parse saved settings.", error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  function normalizeSettings(value) {
    const next = { ...DEFAULT_SETTINGS, ...(value && typeof value === "object" ? value : {}) };
    next.fontFamily = FONT_OPTIONS.some((option) => option.value === next.fontFamily) ? next.fontFamily : DEFAULT_SETTINGS.fontFamily;
    next.fontSize = clampNumber(next.fontSize, 16, 56, DEFAULT_SETTINGS.fontSize);
    next.lineHeight = clampNumber(next.lineHeight, 1, 1.8, DEFAULT_SETTINGS.lineHeight);
    next.verticalPosition = clampNumber(next.verticalPosition, 24, 180, DEFAULT_SETTINGS.verticalPosition);
    next.backgroundOpacity = clampNumber(next.backgroundOpacity, 0, 0.9, DEFAULT_SETTINGS.backgroundOpacity);
    next.shadowStrength = Object.prototype.hasOwnProperty.call(SHADOWS, next.shadowStrength) ? next.shadowStrength : DEFAULT_SETTINGS.shadowStrength;
    next.useRoleColors = Boolean(next.useRoleColors);
    next.textColor = /^#[0-9a-f]{6}$/i.test(String(next.textColor || "")) ? String(next.textColor) : DEFAULT_SETTINGS.textColor;
    return next;
  }

  function getStoredValue(key, fallbackValue) {
    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(key, fallbackValue);
      }
    } catch (error) {
      console.warn("[Missevan Subtitle Styler]", error);
    }

    try {
      const rawValue = window.localStorage.getItem(key);
      return rawValue == null ? fallbackValue : rawValue;
    } catch {
      return fallbackValue;
    }
  }

  function setStoredValue(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {
      console.warn("[Missevan Subtitle Styler]", error);
    }

    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn("[Missevan Subtitle Styler]", error);
    }
  }

  function saveSettings() {
    setStoredValue(STORAGE_KEY, JSON.stringify(settings));
  }

  function addStyle() {
    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement("style");
    style.textContent = css;
    getMountRoot().appendChild(style);
  }

  function getMountRoot() {
    return document.body || document.documentElement;
  }

  function applySettings() {
    settings = normalizeSettings(settings);
    document.documentElement.classList.add(ROOT_CLASS);
    document.documentElement.style.setProperty("--mss-font-family", settings.fontFamily);
    document.documentElement.style.setProperty("--mss-font-size", `${settings.fontSize}px`);
    document.documentElement.style.setProperty("--mss-line-height", String(settings.lineHeight));
    document.documentElement.style.setProperty("--mss-bottom", `${settings.verticalPosition}px`);
    document.documentElement.style.setProperty("--mss-background-opacity", String(settings.backgroundOpacity));
    document.documentElement.style.setProperty("--mss-text-shadow", SHADOWS[settings.shadowStrength]);
    document.documentElement.style.setProperty("--mss-text-color", settings.textColor);

    if (subtitleContainer) {
      enhanceSubtitleContainer(subtitleContainer);
    }

    syncPanelValues();
  }

  function ensureLauncher() {
    if (launcher && launcher.isConnected) {
      return launcher;
    }

    launcher = document.getElementById(LAUNCHER_ID) || document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.textContent = "Subs";
    launcher.title = "Missevan subtitle style settings";
    launcher.setAttribute("aria-label", launcher.title);
    launcher.setAttribute("aria-controls", PANEL_ID);
    launcher.setAttribute("aria-expanded", "false");
    launcher.addEventListener("click", togglePanel);

    if (!launcher.parentElement) {
      getMountRoot().appendChild(launcher);
    }

    return launcher;
  }

  function ensurePanel() {
    if (panel && panel.isConnected) {
      return panel;
    }

    panel = document.getElementById(PANEL_ID) || document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Missevan subtitle style settings");
    panel.hidden = !isPanelOpen;
    panel.replaceChildren();
    panel.append(buildPanelContent());

    if (!panel.parentElement) {
      getMountRoot().appendChild(panel);
    }

    return panel;
  }

  function buildPanelContent() {
    const fragment = document.createDocumentFragment();

    const title = document.createElement("div");
    title.className = "mss-title";
    title.textContent = "Subtitle style";
    fragment.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "mss-grid";
    fragment.appendChild(grid);

    grid.appendChild(buildSelectControl("Font family", "fontFamily", FONT_OPTIONS));
    grid.appendChild(buildRangeControl("Font size", "fontSize", 16, 56, 1, "px"));
    grid.appendChild(buildRangeControl("Line height", "lineHeight", 1, 1.8, 0.02, ""));
    grid.appendChild(buildRangeControl("Vertical position", "verticalPosition", 24, 180, 1, "px"));
    grid.appendChild(buildRangeControl("Background opacity", "backgroundOpacity", 0, 0.9, 0.01, ""));
    grid.appendChild(buildSelectControl("Text shadow", "shadowStrength", [
      { label: "None", value: "none" },
      { label: "Soft", value: "soft" },
      { label: "Strong", value: "strong" },
    ]));
    grid.appendChild(buildCheckboxControl("Use speaker colors", "useRoleColors"));
    grid.appendChild(buildColorControl("Text color override", "textColor"));

    const actions = document.createElement("div");
    actions.className = "mss-actions";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.addEventListener("click", resetSettings);
    actions.appendChild(resetButton);

    fragment.appendChild(actions);
    return fragment;
  }

  function buildSelectControl(labelText, key, options) {
    const label = document.createElement("label");
    label.textContent = labelText;

    const select = document.createElement("select");
    select.dataset.settingKey = key;

    for (const option of options) {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    }

    select.addEventListener("change", () => updateSetting(key, select.value));
    label.appendChild(select);
    return label;
  }

  function buildRangeControl(labelText, key, min, max, step, unit) {
    const label = document.createElement("label");

    const row = document.createElement("div");
    row.className = "mss-row";

    const text = document.createElement("span");
    text.textContent = labelText;

    const output = document.createElement("output");
    output.dataset.outputKey = key;

    row.append(text, output);
    label.appendChild(row);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.dataset.settingKey = key;
    input.dataset.unit = unit;
    input.addEventListener("input", () => updateSetting(key, Number(input.value)));

    label.appendChild(input);
    return label;
  }

  function buildCheckboxControl(labelText, key) {
    const label = document.createElement("label");
    label.className = "mss-check";

    const text = document.createElement("span");
    text.textContent = labelText;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.settingKey = key;
    input.addEventListener("change", () => updateSetting(key, input.checked));

    label.append(text, input);
    return label;
  }

  function buildColorControl(labelText, key) {
    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "color";
    input.dataset.settingKey = key;
    input.addEventListener("input", () => updateSetting(key, input.value));

    label.appendChild(input);
    return label;
  }

  function updateSetting(key, value) {
    settings = normalizeSettings({ ...settings, [key]: value });
    applySettings();
    saveSettings();
  }

  function resetSettings() {
    settings = { ...DEFAULT_SETTINGS };
    applySettings();
    saveSettings();
  }

  function syncPanelValues() {
    if (!panel) {
      return;
    }

    for (const input of panel.querySelectorAll("[data-setting-key]")) {
      const key = input.dataset.settingKey;
      if (!key || !(key in settings)) {
        continue;
      }

      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.checked = Boolean(settings[key]);
      } else {
        input.value = String(settings[key]);
      }
    }

    for (const output of panel.querySelectorAll("[data-output-key]")) {
      const key = output.dataset.outputKey;
      const input = panel.querySelector(`[data-setting-key="${key}"]`);
      const unit = input?.dataset?.unit || "";
      const value = settings[key];
      output.textContent = typeof value === "number" ? `${formatNumber(value)}${unit}` : String(value || "");
    }
  }

  function formatNumber(value) {
    if (Number.isInteger(value)) {
      return String(value);
    }

    return String(Number(value).toFixed(2)).replace(/0+$/g, "").replace(/\.$/g, "");
  }

  function togglePanel() {
    if (isPanelOpen) {
      hidePanel();
      return;
    }

    showPanel();
  }

  function showPanel() {
    isPanelOpen = true;
    ensureLauncher();
    ensurePanel();
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    syncPanelValues();
  }

  function hidePanel() {
    isPanelOpen = false;
    if (panel) {
      panel.hidden = true;
    }

    if (launcher) {
      launcher.setAttribute("aria-expanded", "false");
    }
  }

  function bindSubtitleContainer() {
    const nextContainer = document.querySelector(".subtitle-container");
    if (!nextContainer) {
      subtitleContainer = null;
      disconnectSubtitleObserver();
      return;
    }

    if (subtitleContainer !== nextContainer) {
      subtitleContainer = nextContainer;
      observeSubtitleContainer(nextContainer);
    }

    enhanceSubtitleContainer(nextContainer);
  }

  function enhanceSubtitleContainer(container) {
    container.classList.add(ENHANCED_CLASS);
    container.classList.toggle(COLOR_OVERRIDE_CLASS, !settings.useRoleColors);
    container.classList.toggle(HIDDEN_CLASS, false);
  }

  function scheduleRebind(delay = REBIND_DELAY_MS) {
    window.clearTimeout(rebindTimer);
    rebindTimer = window.setTimeout(bindSubtitleContainer, delay);
  }

  function observeSubtitleContainer(container) {
    disconnectSubtitleObserver();
    subtitleObserver = new MutationObserver(() => {
      if (subtitleContainer) {
        enhanceSubtitleContainer(subtitleContainer);
      }
    });
    subtitleObserver.observe(container, {
      childList: true,
      subtree: false,
    });
  }

  function disconnectSubtitleObserver() {
    if (!subtitleObserver) {
      return;
    }

    subtitleObserver.disconnect();
    subtitleObserver = null;
  }

  function observeBody() {
    if (bodyObserver || !document.body) {
      return;
    }

    bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList") {
          continue;
        }

        if (!subtitleContainer || !subtitleContainer.isConnected) {
          scheduleRebind(40);
          return;
        }

        for (const addedNode of mutation.addedNodes) {
          if (addedNode instanceof HTMLElement && (addedNode.matches(".subtitle-container") || addedNode.querySelector(".subtitle-container"))) {
            scheduleRebind(40);
            return;
          }
        }
      }
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function observeNavigation() {
    window.addEventListener("popstate", () => scheduleRebind(0), { passive: true });
    window.addEventListener("hashchange", () => scheduleRebind(0), { passive: true });
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      scheduleRebind(0);
      return result;
    };

    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      scheduleRebind(0);
      return result;
    };

    window.setInterval(() => {
      if (window.location.href === lastHref) {
        return;
      }

      lastHref = window.location.href;
      scheduleRebind(0);
    }, ROUTE_CHECK_INTERVAL_MS);
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
    if (menuCommandsInstalled || typeof GM_registerMenuCommand !== "function") {
      return;
    }

    menuCommandsInstalled = true;
    GM_registerMenuCommand("Open subtitle style settings", showPanel);
    GM_registerMenuCommand("Reset subtitle style settings", resetSettings);
  }

  function installDebugHandle() {
    window.missevanSubtitleStylerDebug = {
      getSettings: () => ({ ...settings }),
      apply: (nextSettings = {}) => {
        settings = normalizeSettings({ ...settings, ...nextSettings });
        applySettings();
        saveSettings();
        return { ...settings };
      },
      reset: () => {
        resetSettings();
        return { ...settings };
      },
      show: showPanel,
      hide: hidePanel,
    };
  }

  function clampNumber(value, min, max, fallbackValue) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallbackValue;
    }

    return Math.min(max, Math.max(min, number));
  }

  function start() {
    if (!document.body) {
      window.setTimeout(start, 50);
      return;
    }

    addStyle();
    ensureLauncher();
    ensurePanel();
    hidePanel();
    installMenuCommands();
    installDebugHandle();
    applySettings();
    bindSubtitleContainer();
    observeBody();
    observeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
