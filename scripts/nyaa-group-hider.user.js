// ==UserScript==
// @name         Nyaa Group Hider
// @namespace    https://nyaa.si/
// @version      0.1.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/nyaa-group-hider.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/nyaa-group-hider.user.js
// @description  Hide Nyaa torrent rows from configured release groups.
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

  const STORAGE_KEY = "nyaa-group-hider-hidden-groups";
  const ROW_SELECTOR = "table.torrent-list tbody tr";
  const TITLE_LINK_SELECTOR = 'a[href^="/view/"]:not(.comments)';
  const HIDDEN_CLASS = "nyaa-group-hider-hidden";
  const BADGE_ID = "nyaa-group-hider-status";
  const STYLE_ID = "nyaa-group-hider-style";

  let hiddenGroups = normalizeGroups(readStoredGroups());
  let hiddenCount = 0;

  const css = `
    .${HIDDEN_CLASS} {
      display: none !important;
    }

    #${BADGE_ID} {
      display: inline-block;
      margin: 0 0 8px;
      padding: 4px 8px;
      border: 1px solid rgba(51, 122, 183, 0.35);
      border-radius: 4px;
      color: #23527c;
      background: rgba(217, 237, 247, 0.92);
      font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body.dark #${BADGE_ID} {
      color: #d9edf7;
      background: rgba(35, 82, 124, 0.72);
      border-color: rgba(217, 237, 247, 0.26);
    }

    #${BADGE_ID}[hidden] {
      display: none !important;
    }
  `;

  function readStoredGroups() {
    const fallbackGroups = DEFAULT_HIDDEN_GROUPS.slice();

    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(STORAGE_KEY, fallbackGroups);
      }
    } catch (error) {
      console.warn("[Nyaa Group Hider]", error);
    }

    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      return rawValue ? JSON.parse(rawValue) : fallbackGroups;
    } catch (error) {
      console.warn("[Nyaa Group Hider]", error);
      return fallbackGroups;
    }
  }

  function writeStoredGroups(groups) {
    const nextGroups = normalizeGroups(groups);

    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(STORAGE_KEY, nextGroups);
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextGroups));
      }
    } catch (error) {
      console.warn("[Nyaa Group Hider]", error);

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextGroups));
      } catch (storageError) {
        console.warn("[Nyaa Group Hider]", storageError);
      }
    }

    hiddenGroups = nextGroups;
  }

  function normalizeGroups(groups) {
    if (!Array.isArray(groups)) {
      return normalizeGroupInput(String(groups || ""));
    }

    const seenGroups = new Set();
    const nextGroups = [];

    for (const group of groups) {
      const normalizedGroup = String(group || "").trim();
      const key = normalizedGroup.toLocaleLowerCase();

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

  function getHiddenGroupKeys() {
    return new Set(hiddenGroups.map(groupKey));
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

  function applyHiddenGroups() {
    const hiddenGroupKeys = getHiddenGroupKeys();
    hiddenCount = 0;

    for (const row of document.querySelectorAll(ROW_SELECTOR)) {
      const titleLink = getTitleLink(row);
      const groupName = titleLink ? getLeadingGroup(titleLink.textContent) : "";
      const shouldHide = groupName && hiddenGroupKeys.has(groupKey(groupName));

      row.classList.toggle(HIDDEN_CLASS, Boolean(shouldHide));

      if (shouldHide) {
        hiddenCount += 1;
      }
    }

    updateStatusBadge();
  }

  function ensureStatusBadge() {
    let badge = document.getElementById(BADGE_ID);
    if (badge) {
      return badge;
    }

    const table = document.querySelector("table.torrent-list");
    if (!table || !table.parentElement) {
      return null;
    }

    badge = document.createElement("div");
    badge.id = BADGE_ID;
    table.parentElement.insertBefore(badge, table);
    return badge;
  }

  function updateStatusBadge() {
    const badge = ensureStatusBadge();
    if (!badge) {
      return;
    }

    const groupCount = hiddenGroups.length;
    badge.hidden = groupCount === 0 && hiddenCount === 0;
    badge.textContent = `${hiddenCount} hidden by Nyaa Group Hider (${groupCount} group${groupCount === 1 ? "" : "s"})`;
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
    registerMenuCommand("Edit hidden groups", () => {
      const currentValue = hiddenGroups.join("\n");
      const nextValue = window.prompt("Enter hidden Nyaa groups, one per line or comma-separated:", currentValue);

      if (nextValue == null) {
        return;
      }

      writeStoredGroups(normalizeGroupInput(nextValue));
      applyHiddenGroups();
    });

    registerMenuCommand("Show hidden groups", () => {
      const groupList = hiddenGroups.length ? hiddenGroups.join("\n") : "(none)";
      window.alert(`Nyaa Group Hider\n\nHidden rows on this page: ${hiddenCount}\n\nHidden groups:\n${groupList}`);
    });

    registerMenuCommand("Reset hidden groups", () => {
      writeStoredGroups(DEFAULT_HIDDEN_GROUPS);
      applyHiddenGroups();
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
    applyHiddenGroups();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
