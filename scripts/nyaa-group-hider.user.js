// ==UserScript==
// @name         Nyaa Group Hider + Highlighter
// @namespace    https://nyaa.si/
// @version      0.2.1
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/nyaa-group-hider.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/nyaa-group-hider.user.js
// @description  Hide or highlight Nyaa torrent rows from configured release groups.
// @author       CaoCao
// @match        https://nyaa.si/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  "use strict";

  const DEFAULT_HIDDEN_GROUPS = [
    // "SubsPlease",
    // "Erai-raws",
  ];

  const DEFAULT_HIGHLIGHTED_GROUPS = [
    // "SubsPlease",
  ];

  const HIDDEN_STORAGE_KEY = "nyaa-group-hider-hidden-groups";
  const HIGHLIGHTED_STORAGE_KEY = "nyaa-group-hider-highlighted-groups";
  const ROW_SELECTOR = "table.torrent-list tbody tr";
  const TITLE_LINK_SELECTOR = 'a[href^="/view/"]:not(.comments)';
  const HIDDEN_CLASS = "nyaa-group-hider-hidden";
  const HIGHLIGHTED_CLASS = "nyaa-group-hider-highlighted";
  const CONTROLS_ID = "nyaa-group-hider-controls";
  const HIDDEN_BADGE_ID = "nyaa-group-hider-hidden-status";
  const HIGHLIGHTED_BADGE_ID = "nyaa-group-hider-highlighted-status";
  const HIDDEN_ADD_BUTTON_ID = "nyaa-group-hider-hidden-add";
  const HIGHLIGHTED_ADD_BUTTON_ID = "nyaa-group-hider-highlighted-add";
  const STYLE_ID = "nyaa-group-hider-style";

  let hiddenGroups = normalizeGroups(readStoredGroups(HIDDEN_STORAGE_KEY, DEFAULT_HIDDEN_GROUPS));
  let highlightedGroups = normalizeGroups(readStoredGroups(HIGHLIGHTED_STORAGE_KEY, DEFAULT_HIGHLIGHTED_GROUPS));
  let hiddenCount = 0;
  let highlightedCount = 0;
  let showHiddenRows = false;

  const css = `
    .${HIDDEN_CLASS} {
      display: none !important;
    }

    .${HIGHLIGHTED_CLASS} {
      outline: 2px solid rgba(51, 122, 183, 0.98);
      outline-offset: -2px;
    }

    .${HIGHLIGHTED_CLASS} > td {
      position: relative;
    }

    .${HIGHLIGHTED_CLASS} > td::after {
      content: "";
      position: absolute;
      z-index: 2;
      top: -1px;
      right: -1px;
      bottom: -1px;
      left: -1px;
      border-top: 2px solid rgba(51, 122, 183, 0.98);
      border-bottom: 2px solid rgba(51, 122, 183, 0.98);
      pointer-events: none;
    }

    .${HIGHLIGHTED_CLASS} > td:first-child::after {
      border-left: 3px solid rgba(51, 122, 183, 0.98);
    }

    .${HIGHLIGHTED_CLASS} > td:last-child::after {
      border-right: 3px solid rgba(51, 122, 183, 0.98);
    }

    body.dark .${HIGHLIGHTED_CLASS} {
      outline-color: rgba(91, 192, 222, 0.98);
    }

    body.dark .${HIGHLIGHTED_CLASS} > td::after {
      border-top-color: rgba(91, 192, 222, 0.98);
      border-bottom-color: rgba(91, 192, 222, 0.98);
    }

    body.dark .${HIGHLIGHTED_CLASS} > td:first-child::after {
      border-left-color: rgba(91, 192, 222, 0.98);
    }

    body.dark .${HIGHLIGHTED_CLASS} > td:last-child::after {
      border-right-color: rgba(91, 192, 222, 0.98);
    }

    #${CONTROLS_ID} {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0 0 8px;
      font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${HIDDEN_BADGE_ID},
    #${HIGHLIGHTED_BADGE_ID},
    #${HIDDEN_ADD_BUTTON_ID},
    #${HIGHLIGHTED_ADD_BUTTON_ID} {
      min-height: 26px;
      border: 1px solid rgba(51, 122, 183, 0.35);
      border-radius: 4px;
      color: #23527c;
      background: rgba(217, 237, 247, 0.92);
      cursor: pointer;
      touch-action: manipulation;
    }

    #${HIGHLIGHTED_BADGE_ID},
    #${HIGHLIGHTED_ADD_BUTTON_ID} {
      color: #23527c;
      background: rgba(217, 237, 247, 0.94);
      border-color: rgba(51, 122, 183, 0.4);
    }

    #${HIDDEN_BADGE_ID},
    #${HIGHLIGHTED_BADGE_ID} {
      padding: 4px 8px;
    }

    #${HIDDEN_BADGE_ID}[aria-pressed="true"] {
      color: #1b4f72;
      background: rgba(232, 245, 255, 0.98);
      border-color: rgba(51, 122, 183, 0.58);
      box-shadow: inset 0 0 0 1px rgba(51, 122, 183, 0.12);
    }

    #${HIDDEN_ADD_BUTTON_ID},
    #${HIGHLIGHTED_ADD_BUTTON_ID} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      padding: 0;
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
    }

    #${HIDDEN_BADGE_ID}:hover,
    #${HIDDEN_ADD_BUTTON_ID}:hover {
      background: rgba(198, 230, 248, 0.98);
      border-color: rgba(51, 122, 183, 0.6);
    }

    #${HIGHLIGHTED_BADGE_ID}:hover,
    #${HIGHLIGHTED_ADD_BUTTON_ID}:hover {
      background: rgba(198, 230, 248, 0.98);
      border-color: rgba(51, 122, 183, 0.62);
    }

    #${HIDDEN_BADGE_ID}:focus-visible,
    #${HIGHLIGHTED_BADGE_ID}:focus-visible,
    #${HIDDEN_ADD_BUTTON_ID}:focus-visible,
    #${HIGHLIGHTED_ADD_BUTTON_ID}:focus-visible {
      outline: 2px solid rgba(51, 122, 183, 0.62);
      outline-offset: 2px;
    }

    body.dark #${HIDDEN_BADGE_ID},
    body.dark #${HIDDEN_ADD_BUTTON_ID} {
      color: #d9edf7;
      background: rgba(35, 82, 124, 0.72);
      border-color: rgba(217, 237, 247, 0.26);
    }

    body.dark #${HIDDEN_BADGE_ID}[aria-pressed="true"] {
      color: #fff;
      background: rgba(51, 122, 183, 0.86);
      border-color: rgba(217, 237, 247, 0.48);
    }

    body.dark #${HIGHLIGHTED_BADGE_ID},
    body.dark #${HIGHLIGHTED_ADD_BUTTON_ID} {
      color: #d9edf7;
      background: rgba(35, 82, 124, 0.72);
      border-color: rgba(217, 237, 247, 0.26);
    }

    #${CONTROLS_ID}[hidden] {
      display: none !important;
    }
  `;

  function readStoredGroups(storageKey, defaultGroups) {
    const fallbackGroups = defaultGroups.slice();

    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(storageKey, fallbackGroups);
      }
    } catch (error) {
      console.warn("[Nyaa Group Hider]", error);
    }

    try {
      const rawValue = window.localStorage.getItem(storageKey);
      return rawValue ? JSON.parse(rawValue) : fallbackGroups;
    } catch (error) {
      console.warn("[Nyaa Group Hider]", error);
      return fallbackGroups;
    }
  }

  function writeStoredGroups(storageKey, groups) {
    const nextGroups = normalizeGroups(groups);

    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(storageKey, nextGroups);
      } else {
        window.localStorage.setItem(storageKey, JSON.stringify(nextGroups));
      }
    } catch (error) {
      console.warn("[Nyaa Group Hider]", error);

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(nextGroups));
      } catch (storageError) {
        console.warn("[Nyaa Group Hider]", storageError);
      }
    }

    return nextGroups;
  }

  function setHiddenGroups(groups) {
    hiddenGroups = writeStoredGroups(HIDDEN_STORAGE_KEY, groups);
  }

  function setHighlightedGroups(groups) {
    highlightedGroups = writeStoredGroups(HIGHLIGHTED_STORAGE_KEY, groups);
  }

  function normalizeGroups(groups) {
    if (!Array.isArray(groups)) {
      return normalizeGroupInput(String(groups || ""));
    }

    const seenGroups = new Set();
    const nextGroups = [];

    for (const group of groups) {
      const normalizedGroup = String(group || "").trim();
      const key = groupKey(normalizedGroup);

      if (!normalizedGroup || seenGroups.has(key)) {
        continue;
      }

      seenGroups.add(key);
      nextGroups.push(normalizedGroup);
    }

    return nextGroups;
  }

  function normalizeGroupInput(value) {
    return normalizeGroups(String(value || "").split(/[\n,]+/));
  }

  function groupKey(groupName) {
    return String(groupName || "").trim().toLocaleLowerCase();
  }

  function getGroupKeys(groups) {
    return new Set(groups.map(groupKey));
  }

  function getTitleLink(row) {
    const links = Array.from(row.querySelectorAll(TITLE_LINK_SELECTOR));

    return links.find((link) => {
      const href = link.getAttribute("href") || "";
      return /^\/view\/\d+$/.test(href);
    }) || null;
  }

  function getLeadingGroup(title) {
    const match = String(title || "").match(/^\s*\[([^\]]+)\]/);
    return match ? match[1].trim() : "";
  }

  function applyGroupRules() {
    const hiddenGroupKeys = getGroupKeys(hiddenGroups);
    const highlightedGroupKeys = getGroupKeys(highlightedGroups);
    hiddenCount = 0;
    highlightedCount = 0;

    for (const row of document.querySelectorAll(ROW_SELECTOR)) {
      const titleLink = getTitleLink(row);
      const groupName = titleLink ? getLeadingGroup(titleLink.textContent) : "";
      const key = groupKey(groupName);
      const isHiddenGroup = Boolean(groupName && hiddenGroupKeys.has(key));
      const isHighlightedGroup = Boolean(groupName && highlightedGroupKeys.has(key));

      row.classList.toggle(HIDDEN_CLASS, isHiddenGroup && !showHiddenRows);
      row.classList.toggle(HIGHLIGHTED_CLASS, isHighlightedGroup);

      if (isHiddenGroup) {
        hiddenCount += 1;
      }

      if (isHighlightedGroup) {
        highlightedCount += 1;
      }
    }

    updateControls();
  }

  function ensureControls() {
    let controls = document.getElementById(CONTROLS_ID);
    if (controls) {
      return controls;
    }

    const table = document.querySelector("table.torrent-list");
    if (!table || !table.parentElement) {
      return null;
    }

    controls = document.createElement("div");
    controls.id = CONTROLS_ID;

    const hiddenBadge = document.createElement("button");
    hiddenBadge.id = HIDDEN_BADGE_ID;
    hiddenBadge.type = "button";
    hiddenBadge.addEventListener("click", () => {
      showHiddenRows = !showHiddenRows;
      applyGroupRules();
    });

    const hiddenAddButton = document.createElement("button");
    hiddenAddButton.id = HIDDEN_ADD_BUTTON_ID;
    hiddenAddButton.type = "button";
    hiddenAddButton.textContent = "+";
    hiddenAddButton.setAttribute("aria-label", "Add hidden group");
    hiddenAddButton.title = "Add hidden group";
    hiddenAddButton.addEventListener("click", promptForNewHiddenGroups);

    const highlightedBadge = document.createElement("button");
    highlightedBadge.id = HIGHLIGHTED_BADGE_ID;
    highlightedBadge.type = "button";
    highlightedBadge.addEventListener("click", promptForHighlightedGroups);

    const highlightedAddButton = document.createElement("button");
    highlightedAddButton.id = HIGHLIGHTED_ADD_BUTTON_ID;
    highlightedAddButton.type = "button";
    highlightedAddButton.textContent = "+";
    highlightedAddButton.setAttribute("aria-label", "Add highlighted group");
    highlightedAddButton.title = "Add highlighted group";
    highlightedAddButton.addEventListener("click", promptForNewHighlightedGroups);

    controls.append(hiddenBadge, hiddenAddButton, highlightedBadge, highlightedAddButton);
    table.parentElement.insertBefore(controls, table);
    return controls;
  }

  function updateControls() {
    const controls = ensureControls();
    const hiddenBadge = document.getElementById(HIDDEN_BADGE_ID);
    const highlightedBadge = document.getElementById(HIGHLIGHTED_BADGE_ID);
    if (!hiddenBadge || !highlightedBadge) {
      return;
    }

    if (controls) {
      controls.hidden = false;
    }

    const hiddenGroupCount = hiddenGroups.length;
    hiddenBadge.textContent = `${hiddenCount} hidden (${hiddenGroupCount} group${hiddenGroupCount === 1 ? "" : "s"})`;
    hiddenBadge.setAttribute("aria-pressed", String(showHiddenRows));
    hiddenBadge.setAttribute(
      "aria-label",
      showHiddenRows
        ? "Hide matched Nyaa releases again"
        : "Show hidden Nyaa releases"
    );
    hiddenBadge.title = showHiddenRows ? "Hide matched releases again" : "Show hidden releases";

    const highlightedGroupCount = highlightedGroups.length;
    highlightedBadge.textContent = `${highlightedCount} highlighted (${highlightedGroupCount} group${highlightedGroupCount === 1 ? "" : "s"})`;
    highlightedBadge.setAttribute("aria-label", "Edit highlighted Nyaa groups");
    highlightedBadge.title = "Edit highlighted groups";
  }

  function addHiddenGroups(groups) {
    setHiddenGroups(hiddenGroups.concat(groups));
    showHiddenRows = false;
    applyGroupRules();
  }

  function addHighlightedGroups(groups) {
    setHighlightedGroups(highlightedGroups.concat(groups));
    applyGroupRules();
  }

  function promptForNewHiddenGroups() {
    const nextValue = window.prompt("Enter Nyaa groups to hide, one per line or comma-separated:");

    if (nextValue == null) {
      return;
    }

    addHiddenGroups(normalizeGroupInput(nextValue));
  }

  function promptForNewHighlightedGroups() {
    const nextValue = window.prompt("Enter Nyaa groups to highlight, one per line or comma-separated:");

    if (nextValue == null) {
      return;
    }

    addHighlightedGroups(normalizeGroupInput(nextValue));
  }

  function promptForHiddenGroups() {
    const currentValue = hiddenGroups.join("\n");
    const nextValue = window.prompt("Enter hidden Nyaa groups, one per line or comma-separated:", currentValue);

    if (nextValue == null) {
      return;
    }

    setHiddenGroups(normalizeGroupInput(nextValue));
    showHiddenRows = false;
    applyGroupRules();
  }

  function promptForHighlightedGroups() {
    const currentValue = highlightedGroups.join("\n");
    const nextValue = window.prompt("Enter highlighted Nyaa groups, one per line or comma-separated:", currentValue);

    if (nextValue == null) {
      return;
    }

    setHighlightedGroups(normalizeGroupInput(nextValue));
    applyGroupRules();
  }

  function registerMenuCommand(name, handler) {
    try {
      if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand(name, handler);
      }
    } catch (error) {
      console.warn("[Nyaa Group Hider]", error);
    }
  }

  function registerMenuCommands() {
    registerMenuCommand("Edit hidden groups", promptForHiddenGroups);

    registerMenuCommand("Show hidden groups", () => {
      const groupList = hiddenGroups.length ? hiddenGroups.join("\n") : "(none)";
      window.alert(`Nyaa Group Hider + Highlighter\n\nHidden rows on this page: ${hiddenCount}\n\nHidden groups:\n${groupList}`);
    });

    registerMenuCommand("Reset hidden groups", () => {
      setHiddenGroups(DEFAULT_HIDDEN_GROUPS);
      showHiddenRows = false;
      applyGroupRules();
    });

    registerMenuCommand("Edit highlighted groups", promptForHighlightedGroups);

    registerMenuCommand("Show highlighted groups", () => {
      const groupList = highlightedGroups.length ? highlightedGroups.join("\n") : "(none)";
      window.alert(`Nyaa Group Hider + Highlighter\n\nHighlighted rows on this page: ${highlightedCount}\n\nHighlighted groups:\n${groupList}`);
    });

    registerMenuCommand("Reset highlighted groups", () => {
      setHighlightedGroups(DEFAULT_HIGHLIGHTED_GROUPS);
      applyGroupRules();
    });
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    try {
      if (typeof GM_addStyle === "function") {
        const styleElement = GM_addStyle(css);
        if (styleElement && !styleElement.id) {
          styleElement.id = STYLE_ID;
        }
        return;
      }
    } catch (error) {
      console.warn("[Nyaa Group Hider]", error);
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function start() {
    addStyles();
    registerMenuCommands();
    applyGroupRules();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
