// ==UserScript==
// @name         Plex Open in mpv
// @namespace    http://127.0.0.1:32400/
// @version      0.3.2
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/plex-open-in-mpv.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/plex-open-in-mpv.user.js
// @description  Adds Open in mpv controls to local Plex detail pages and Home/library media cards.
// @homepageURL   https://github.com/caocaochan/userscripts/tree/main/handlers/windows
// @author       CaoCao
// @match        http://127.0.0.1:32400/web/index.html*
// @match        http://localhost:32400/web/index.html*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  "use strict";

  const BUTTON_ID = "plex-open-in-mpv-button";
  const TOAST_CLASS = "plex-open-in-mpv-toast";
  const BUTTON_CLASS = "plex-open-in-mpv-inline-button";
  const BUTTON_ICON_CLASS = "plex-open-in-mpv-inline-button__icon";
  const BUTTON_LABEL_CLASS = "plex-open-in-mpv-inline-button__label";
  const CARD_BUTTON_CLASS = "plex-open-in-mpv-card-button";
  const CARD_BUTTON_ABSOLUTE_CLASS = "plex-open-in-mpv-card-button--absolute";
  const CARD_BUTTON_MOUNT_CLASS = "plex-open-in-mpv-card-button-mount";
  const CARD_PROCESSED_ATTR = "data-plex-open-in-mpv-card";
  const CARD_SCAN_INTERVAL_MS = 800;
  const READY_LABEL = "Open in mpv";
  const LOADING_LABEL = "Resolving...";
  const TOKEN_KEYS = new Set(["authToken", "token", "X-Plex-Token", "xPlexToken", "plexToken"]);
  const TOKEN_HINT_PATTERN = /(?:^|[-_.])(?:auth)?token(?:$|[-_.])|x-?plex-?token/i;
  const TOKEN_VALUE_PATTERN = /^[A-Za-z0-9_-]{12,80}$/;
  const CONTAINER_RANK = {
    mkv: 3,
    mp4: 2,
    m4v: 1,
  };

  const css = `
    #${BUTTON_ID} {
      flex: 0 0 auto;
    }

    #${BUTTON_ID}.${BUTTON_CLASS} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-width: 132px;
      min-height: 44px;
      margin-left: 12px;
      padding: 0 18px;
      border: 0;
      border-radius: 6px;
      color: #111;
      background: #e5a00d;
      font: 600 16px/1 "Segoe UI Semibold", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      white-space: nowrap;
      cursor: pointer;
      touch-action: manipulation;
      vertical-align: middle;
    }

    #${BUTTON_ID}.${BUTTON_CLASS}:hover:not(:disabled) {
      background: #f2b632;
    }

    #${BUTTON_ID}:disabled {
      cursor: not-allowed;
      opacity: 0.64;
    }

    .${BUTTON_ICON_CLASS} {
      display: inline-block;
      width: 0;
      height: 0;
      border-top: 9px solid transparent;
      border-bottom: 9px solid transparent;
      border-left: 15px solid currentColor;
    }

    .${BUTTON_LABEL_CLASS} {
      display: inline-block;
      min-width: 0;
    }

    .${TOAST_CLASS} {
      position: fixed;
      left: 50%;
      bottom: 24px;
      z-index: 2147483647;
      max-width: min(420px, calc(100vw - 32px));
      padding: 9px 12px;
      border-radius: 7px;
      color: #fff;
      background: rgba(0, 0, 0, 0.82);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
      transform: translateX(-50%);
      pointer-events: none;
    }

    [${CARD_PROCESSED_ATTR}="1"] {
      position: relative;
    }

    .${CARD_BUTTON_CLASS} {
      position: relative;
      z-index: 3;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 38px;
      height: 24px;
      margin-left: 8px;
      padding: 0 8px;
      border: 0;
      border-radius: 999px;
      color: #111;
      background: #e5a00d;
      font: 600 11px/1 "Segoe UI Semibold", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      letter-spacing: 0;
      text-transform: lowercase;
      white-space: nowrap;
      cursor: pointer;
      vertical-align: middle;
    }

    .${CARD_BUTTON_CLASS}:hover:not(:disabled) {
      background: #f2b632;
    }

    .${CARD_BUTTON_CLASS}:disabled {
      cursor: not-allowed;
      opacity: 0.64;
    }

    .${CARD_BUTTON_MOUNT_CLASS} {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
    }

    .${CARD_BUTTON_ABSOLUTE_CLASS} {
      position: absolute;
      right: 6px;
      bottom: 4px;
      margin-left: 0;
    }
  `;

  let button = null;
  let toastTimer = 0;
  let lastHref = "";
  let currentRatingKey = null;
  let isLoading = false;
  let lastPlayButton = null;
  let uiRefreshTimer = 0;

  function addStyle() {
    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function ensureButton() {
    if (button && button.isConnected) {
      return button;
    }

    button = document.getElementById(BUTTON_ID) || document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.classList.add(BUTTON_CLASS);
    button.innerHTML = `<span class="${BUTTON_ICON_CLASS}" aria-hidden="true"></span><span class="${BUTTON_LABEL_CLASS}">${READY_LABEL}</span>`;
    button.setAttribute("aria-label", "Open this Plex item in mpv");
    button.addEventListener("click", onButtonClick);

    return button;
  }

  function showToast(message) {
    document.querySelector(`.${TOAST_CLASS}`)?.remove();

    const toast = document.createElement("div");
    toast.className = TOAST_CLASS;
    toast.textContent = message;
    document.documentElement.appendChild(toast);

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), 2200);
  }

  function refreshButtonState() {
    ensureButton();

    currentRatingKey = getCurrentRatingKey();
    if (!currentRatingKey) {
      detachButton();
      setButtonState({
        display: "none",
        disabled: true,
        label: READY_LABEL,
        title: "Open a movie, episode, season, or show details page",
      });
      return;
    }

    if (!mountButtonNextToPlay()) {
      setButtonState({
        display: "none",
        disabled: true,
        label: READY_LABEL,
        title: "Open a movie, episode, season, or show details page",
      });
      return;
    }

    if (!findPlexToken()) {
      setButtonState({
        display: "",
        disabled: true,
        label: READY_LABEL,
        title: "Plex token not found",
      });
      return;
    }

    setButtonState({
      display: "",
      disabled: isLoading,
      label: isLoading ? LOADING_LABEL : READY_LABEL,
      title: isLoading ? "Resolving Plex media URL" : "Open this Plex item in mpv",
    });
  }

  function setButtonState({ display, disabled, label, title }) {
    if (button.style.display !== display) {
      button.style.display = display;
    }

    if (button.disabled !== disabled) {
      button.disabled = disabled;
    }

    setButtonLabel(label);

    if (button.title !== title) {
      button.title = title;
    }

    if (button.getAttribute("aria-label") !== title) {
      button.setAttribute("aria-label", title);
    }
  }

  function setButtonLabel(label) {
    const labelElement = button.querySelector(`.${BUTTON_LABEL_CLASS}`);
    if (labelElement) {
      if (labelElement.textContent !== label) {
        labelElement.textContent = label;
      }
      return;
    }

    if (button.textContent !== label) {
      button.textContent = label;
    }
  }

  function mountButtonNextToPlay() {
    const playButton = findPlayButton();
    if (!playButton) {
      return false;
    }

    if (lastPlayButton !== playButton) {
      copyPlayButtonClass(playButton);
      lastPlayButton = playButton;
    }

    if (button.previousElementSibling === playButton && button.parentElement === playButton.parentElement) {
      return true;
    }

    playButton.insertAdjacentElement("afterend", button);
    return true;
  }

  function detachButton() {
    button?.remove();
    lastPlayButton = null;
  }

  function copyPlayButtonClass(playButton) {
    const className = typeof playButton.className === "string" ? playButton.className : "";
    button.className = `${className} ${BUTTON_CLASS}`.trim();
  }

  function findPlayButton() {
    const candidates = Array.from(document.querySelectorAll('button, a[role="button"]')).filter((element) => {
      if (!(element instanceof HTMLElement) || element.id === BUTTON_ID || !isElementVisible(element)) {
        return false;
      }

      const text = normalizeText(element.textContent);
      const ariaLabel = normalizeText(element.getAttribute("aria-label"));
      const title = normalizeText(element.getAttribute("title"));
      return text === "Play" || ariaLabel === "Play" || title === "Play";
    });

    candidates.sort((left, right) => scorePlayButton(right) - scorePlayButton(left));
    return candidates[0] || null;
  }

  function scorePlayButton(element) {
    const rect = element.getBoundingClientRect();
    let score = 0;

    if (normalizeText(element.textContent) === "Play") {
      score += 20;
    }

    if (rect.width >= 70 && rect.height >= 34) {
      score += 10;
    }

    if (rect.left > window.innerWidth * 0.2 && rect.top > window.innerHeight * 0.15) {
      score += 6;
    }

    return score;
  }

  function scheduleUiRefresh(delay = 100) {
    window.clearTimeout(uiRefreshTimer);
    uiRefreshTimer = window.setTimeout(refreshUi, delay);
  }

  function refreshUi() {
    refreshButtonState();
    scanCardsForButtons();
  }

  function scanCardsForButtons() {
    const tokenAvailable = !!findPlexToken();
    for (const { card, ratingKey } of findCandidateCards()) {
      ensureCardButton(card, ratingKey, tokenAvailable);
    }
  }

  function findCandidateCards() {
    const candidates = new Map();
    const selectors = [
      'a[href*="/library/metadata"]',
      'a[href*="%2Flibrary%2Fmetadata%2F"]',
      'a[href*="key="]',
      '[data-rating-key]',
      '[data-key]',
      '[data-testid*="/library/metadata"]',
      '[data-testid*="%2Flibrary%2Fmetadata%2F"]',
    ];

    for (const element of document.querySelectorAll(selectors.join(","))) {
      if (!(element instanceof HTMLElement) || shouldSkipCardSource(element)) {
        continue;
      }

      const ratingKey = getCardRatingKey(element);
      if (!ratingKey) {
        continue;
      }

      const card = findCardContainer(element);
      if (!card || shouldSkipCardContainer(card)) {
        continue;
      }

      candidates.set(card, ratingKey);
    }

    return Array.from(candidates, ([card, ratingKey]) => ({ card, ratingKey }));
  }

  function ensureCardButton(card, ratingKey, tokenAvailable) {
    if (card.getAttribute(CARD_PROCESSED_ATTR) === "1") {
      const existingButton = card.querySelector(`.${CARD_BUTTON_CLASS}`);
      if (existingButton instanceof HTMLButtonElement) {
        const title = tokenAvailable ? "Open in mpv" : "Plex token not found";
        if (existingButton.dataset.ratingKey !== ratingKey) {
          existingButton.dataset.ratingKey = ratingKey;
        }

        if (existingButton.disabled !== !tokenAvailable) {
          existingButton.disabled = !tokenAvailable;
        }

        if (existingButton.title !== title) {
          existingButton.title = title;
        }
        return;
      }
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = CARD_BUTTON_CLASS;
    button.textContent = "mpv";
    button.dataset.ratingKey = ratingKey;
    button.disabled = !tokenAvailable;
    button.title = tokenAvailable ? "Open in mpv" : "Plex token not found";
    button.setAttribute("aria-label", "Open this Plex item in mpv");

    button.addEventListener("click", onCardButtonClick, true);
    button.addEventListener("mousedown", stopCardButtonEvent, true);
    button.addEventListener("pointerdown", stopCardButtonEvent, true);

    const mount = findCardButtonMount(card);
    if (mount) {
      mount.classList.add(CARD_BUTTON_MOUNT_CLASS);
      mount.appendChild(button);
    } else {
      button.classList.add(CARD_BUTTON_ABSOLUTE_CLASS);
      card.appendChild(button);
    }

    card.setAttribute(CARD_PROCESSED_ATTR, "1");
  }

  async function onCardButtonClick(event) {
    stopCardButtonEvent(event);

    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const ratingKey = button.dataset.ratingKey || "";
    if (!ratingKey) {
      showToast("No Plex item found for this card");
      return;
    }

    const token = findPlexToken();
    if (!token) {
      showToast("Plex token not found");
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "...";
    button.title = "Resolving...";

    try {
      await openRatingKeyInMpv(ratingKey, token, "card");
    } catch (error) {
      showToast(error?.message || "Could not read Plex metadata");
    } finally {
      button.disabled = false;
      button.textContent = originalText || "mpv";
      button.title = "Open in mpv";
    }
  }

  function stopCardButtonEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function getCardRatingKey(element) {
    let currentElement = element;
    while (currentElement && currentElement !== document.body) {
      const fromAttributes = getRatingKeyFromElementAttributes(currentElement);
      if (fromAttributes) {
        return fromAttributes;
      }

      currentElement = currentElement.parentElement;
    }

    return null;
  }

  function getRatingKeyFromElementAttributes(element) {
    const values = [
      element.getAttribute("href"),
      element.getAttribute("data-rating-key"),
      element.getAttribute("data-key"),
      element.getAttribute("data-testid"),
      element.getAttribute("aria-label"),
    ].filter(Boolean);

    for (const value of values) {
      const ratingKey = extractRatingKeyFromString(value);
      if (ratingKey) {
        return ratingKey;
      }
    }

    return null;
  }

  function extractRatingKeyFromString(value) {
    const text = safeDecode(String(value || ""));
    if (/^\d+$/.test(text)) {
      return text;
    }

    const directMatch = text.match(/\/library\/metadata\/(\d+)(?:$|[/?#&])/);
    if (directMatch) {
      return directMatch[1];
    }

    const queryMatch = text.match(/[?&#]key=([^&#]+)/);
    if (!queryMatch) {
      return null;
    }

    const key = safeDecode(queryMatch[1]);
    const keyMatch = key.match(/^\/library\/metadata\/(\d+)(?:$|[/?#])/);
    return keyMatch ? keyMatch[1] : null;
  }

  function findCardContainer(element) {
    let bestElement = null;
    let bestScore = 0;
    let currentElement = element;
    let depth = 0;

    while (currentElement && currentElement !== document.body && depth < 9) {
      if (currentElement instanceof HTMLElement) {
        const score = scoreCardContainer(currentElement);
        if (score > bestScore) {
          bestScore = score;
          bestElement = currentElement;
        }
      }

      currentElement = currentElement.parentElement;
      depth += 1;
    }

    return bestElement || (element instanceof HTMLElement ? element.parentElement : null);
  }

  function scoreCardContainer(element) {
    if (!isElementVisible(element) || shouldSkipCardContainer(element)) {
      return 0;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80 || rect.width > 430 || rect.height > 760) {
      return 0;
    }

    let score = 1;
    if (element.querySelector("img, picture")) {
      score += 20;
    }

    const text = normalizeText(element.textContent);
    if (text.length >= 4) {
      score += Math.min(20, text.length / 8);
    }

    if (element.querySelector('a[href*="key="], a[href*="/library/metadata"], a[href*="%2Flibrary%2Fmetadata%2F"]')) {
      score += 8;
    }

    return score;
  }

  function findCardButtonMount(card) {
    const buttonSelector = `.${CARD_BUTTON_CLASS}`;
    const textElements = Array.from(card.querySelectorAll("div, span, a")).filter((element) => {
      if (!(element instanceof HTMLElement) || element.matches(buttonSelector) || !isElementVisible(element)) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const text = normalizeText(element.textContent);
      return text.length > 0 && rect.width > 20 && rect.height > 8 && rect.height < 44;
    });

    const metadataElement = textElements.find((element) => /^(?:\d{4}|S\d+\s*.\s*E\d+|Season\s+\d+|\d+\s+seasons?)$/i.test(normalizeText(element.textContent)));
    if (metadataElement) {
      const mount = findCompactCardTextMount(metadataElement, card);
      if (mount) {
        return mount;
      }
    }

    const titleElement = textElements.find((element) => normalizeText(element.textContent).length >= 2);
    if (titleElement) {
      const mount = findCompactCardTextMount(titleElement, card);
      if (mount) {
        return mount;
      }
    }

    return null;
  }

  function findCompactCardTextMount(textElement, card) {
    const targetText = normalizeText(textElement.textContent);
    let currentElement = textElement;

    while (currentElement && currentElement !== card.parentElement) {
      if (currentElement instanceof HTMLElement && isCompactCardTextMount(currentElement, card, targetText)) {
        return currentElement;
      }

      currentElement = currentElement.parentElement;
    }

    return null;
  }

  function isCompactCardTextMount(element, card, targetText) {
    if (!card.contains(element) || !isElementVisible(element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return (
      rect.width <= cardRect.width + 2 &&
      rect.height >= 8 &&
      rect.height <= 44 &&
      normalizeText(element.textContent) === targetText
    );
  }

  function isReasonableCardMount(element, card) {
    if (!card.contains(element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return rect.width <= cardRect.width + 2 && rect.height < 80;
  }

  function shouldSkipCardSource(element) {
    return !!element.closest(`#${BUTTON_ID}, .${CARD_BUTTON_CLASS}, nav, [role="navigation"], [role="tablist"], [role="toolbar"]`);
  }

  function shouldSkipCardContainer(element) {
    return !!element.closest(`#${BUTTON_ID}, nav, [role="navigation"], [role="tablist"], [role="toolbar"]`);
  }

  async function onButtonClick() {
    if (isLoading) {
      return;
    }

    const ratingKey = getCurrentRatingKey();
    if (!ratingKey) {
      showToast("Open a movie, episode, season, or show details page first");
      refreshButtonState();
      return;
    }

    const token = findPlexToken();
    if (!token) {
      showToast("Plex token not found");
      refreshButtonState();
      return;
    }

    isLoading = true;
    refreshButtonState();

    try {
      await openRatingKeyInMpv(ratingKey, token, "detail");
    } catch (error) {
      showToast(error?.message || "Could not read Plex metadata");
    } finally {
      isLoading = false;
      refreshButtonState();
    }
  }

  async function openRatingKeyInMpv(ratingKey, token, source) {
    if (!ratingKey) {
      throw new Error(source === "card" ? "No Plex item found for this card" : "Open a movie, episode, season, or show details page first");
    }

    const item = await fetchMetadataItem(ratingKey, token);
    await openItemInMpv(item, token);
  }

  async function openItemInMpv(item, token) {
    if (item.type === "movie" || item.type === "episode") {
      openSingleItemInMpv(item, token);
      return;
    }

    if (item.type === "season") {
      await openSeasonInMpv(item, token);
      return;
    }

    if (item.type === "show") {
      await openShowInMpv(item, token);
      return;
    }

    throw new Error("Open a movie, episode, season, or show item");
  }

  function openSingleItemInMpv(item, token) {
    const part = pickBestPart(item);
    if (!part) {
      showToast("No playable Plex media part found");
      return;
    }

    const streamUrl = buildStreamUrl(part.key, token);
    window.location.href = buildMpvUrl(streamUrl);
    showToast("Opening in mpv");
  }

  async function openSeasonInMpv(item, token) {
    const episodes = await fetchSeasonEpisodes(item.ratingKey, token);
    openEpisodesAsPlaylist(episodes, token, "Opening season in mpv");
  }

  async function openShowInMpv(item, token) {
    const seasons = await fetchShowSeasons(item.ratingKey, token);
    const firstSeason = pickFirstSeason(seasons);
    if (!firstSeason) {
      showToast("No playable Plex media part found");
      return;
    }

    const episodes = await fetchSeasonEpisodes(firstSeason.ratingKey, token);
    openEpisodesAsPlaylist(episodes, token, "Opening first season in mpv");
  }

  function openEpisodesAsPlaylist(episodes, token, successMessage) {
    const entries = sortEpisodes(episodes)
      .map((episode) => ({
        episode,
        part: pickBestPart(episode),
      }))
      .filter((entry) => entry.part);

    if (!entries.length) {
      showToast("No playable Plex media part found");
      return;
    }

    const playlist = buildPlaylist(entries, token);
    window.location.href = buildMpvPlaylistUrl(playlist);
    showToast(successMessage);
  }

  async function fetchMetadataItem(ratingKey, token) {
    const url = new URL(`/library/metadata/${encodeURIComponent(ratingKey)}`, window.location.origin);
    url.searchParams.set("X-Plex-Token", token);

    const items = await fetchMetadataItems(url, "Could not read Plex metadata");
    const item = items[0];
    if (!item) {
      throw new Error("Could not read Plex metadata");
    }

    if (!item.ratingKey) {
      item.ratingKey = String(ratingKey);
    }

    return item;
  }

  async function fetchSeasonEpisodes(ratingKey, token) {
    const url = new URL(`/library/metadata/${encodeURIComponent(ratingKey)}/children`, window.location.origin);
    url.searchParams.set("X-Plex-Token", token);

    return (await fetchMetadataItems(url, "Could not read Plex season episodes")).filter((item) => item.type === "episode");
  }

  async function fetchShowSeasons(ratingKey, token) {
    const url = new URL(`/library/metadata/${encodeURIComponent(ratingKey)}/children`, window.location.origin);
    url.searchParams.set("X-Plex-Token", token);

    return (await fetchMetadataItems(url, "Could not read Plex season episodes")).filter((item) => item.type === "season");
  }

  async function fetchMetadataItems(url, failureMessage) {
    let response;
    try {
      response = await fetch(url.toString(), {
        credentials: "same-origin",
        headers: {
          Accept: "application/json, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        },
      });
    } catch {
      throw new Error(failureMessage);
    }

    if (!response.ok) {
      throw new Error(failureMessage);
    }

    const text = await response.text();
    return parseMetadataItems(text);
  }

  function parseMetadataItems(text) {
    const jsonItems = parseJsonMetadataItems(text);
    if (jsonItems) {
      return jsonItems;
    }

    return parseXmlMetadataItems(text) || [];
  }

  function parseJsonMetadataItems(text) {
    try {
      const payload = JSON.parse(text);
      const metadata = payload?.MediaContainer?.Metadata || payload?.MediaContainer?.metadata || payload?.Metadata || payload?.metadata;
      return toArray(metadata).map(normalizeJsonItem);
    } catch {
      return null;
    }
  }

  function normalizeJsonItem(item) {
    return {
      type: String(item.type || ""),
      title: String(item.title || ""),
      index: numberValue(item.index),
      parentIndex: numberValue(item.parentIndex),
      ratingKey: String(item.ratingKey || item.ratingkey || ""),
      media: toArray(item.Media || item.media).map((media) => ({
        videoResolution: media.videoResolution || media.videoResolutionID || media.videoProfile || "",
        duration: numberValue(media.duration),
        parts: toArray(media.Part || media.part).map((part) => ({
          key: part.key || "",
          size: numberValue(part.size),
          duration: numberValue(part.duration),
          container: part.container || media.container || "",
        })),
      })),
    };
  }

  function parseXmlMetadataItems(text) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(text, "application/xml");
    } catch {
      return null;
    }

    if (doc.querySelector("parsererror")) {
      return null;
    }

    const container = doc.querySelector("MediaContainer");
    if (!container) {
      return [];
    }

    return Array.from(container.children)
      .filter((element) => element.tagName === "Video" || element.tagName === "Directory")
      .map(normalizeXmlItem);
  }

  function normalizeXmlItem(element) {
    return {
      type: element.getAttribute("type") || "",
      title: element.getAttribute("title") || "",
      index: numberValue(element.getAttribute("index")),
      parentIndex: numberValue(element.getAttribute("parentIndex")),
      ratingKey: element.getAttribute("ratingKey") || "",
      media: elementChildren(element, "Media").map((mediaElement) => ({
        videoResolution: mediaElement.getAttribute("videoResolution") || mediaElement.getAttribute("videoResolutionID") || mediaElement.getAttribute("videoProfile") || "",
        duration: numberValue(mediaElement.getAttribute("duration")),
        parts: elementChildren(mediaElement, "Part").map((partElement) => ({
          key: partElement.getAttribute("key") || "",
          size: numberValue(partElement.getAttribute("size")),
          duration: numberValue(partElement.getAttribute("duration")),
          container: partElement.getAttribute("container") || mediaElement.getAttribute("container") || "",
        })),
      })),
    };
  }

  function pickBestPart(item) {
    const candidates = [];
    item.media.forEach((media, mediaIndex) => {
      media.parts.forEach((part, partIndex) => {
        if (!part.key) {
          return;
        }

        candidates.push({
          key: part.key,
          score: [
            resolutionValue(media.videoResolution),
            part.size,
            part.duration || media.duration,
            CONTAINER_RANK[String(part.container || "").toLowerCase()] || 0,
            -mediaIndex,
            -partIndex,
          ],
        });
      });
    });

    candidates.sort((a, b) => compareScores(b.score, a.score));
    return candidates[0] || null;
  }

  function compareScores(left, right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return left[index] - right[index];
      }
    }

    return 0;
  }

  function buildStreamUrl(partKey, token) {
    const url = new URL(partKey, window.location.origin);
    url.searchParams.set("download", "1");
    url.searchParams.set("X-Plex-Token", token);
    return url.toString();
  }

  function buildMpvUrl(streamUrl) {
    return `plex-mpv:///?url=${encodeURIComponent(streamUrl)}`;
  }

  function buildMpvPlaylistUrl(playlistText) {
    return `plex-mpv:///?playlist=${encodeURIComponent(playlistText)}`;
  }

  function buildPlaylist(entries, token) {
    const lines = ["#EXTM3U"];
    for (const entry of entries) {
      const duration = Math.floor((entry.part.duration || getEpisodeDuration(entry.episode)) / 1000);
      lines.push(`#EXTINF:${Number.isFinite(duration) && duration > 0 ? duration : -1},${formatEpisodeTitle(entry.episode)}`);
      lines.push(buildStreamUrl(entry.part.key, token));
    }

    return `${lines.join("\n")}\n`;
  }

  function getEpisodeDuration(episode) {
    const mediaDurations = episode.media.map((media) => media.duration).filter(Boolean);
    return mediaDurations[0] || 0;
  }

  function formatEpisodeTitle(episode) {
    const title = normalizeText(episode.title) || `Episode ${episode.index || episode.ratingKey || ""}`.trim();
    const season = episode.parentIndex ? String(episode.parentIndex).padStart(2, "0") : "";
    const episodeIndex = episode.index ? String(episode.index).padStart(2, "0") : "";
    if (season && episodeIndex) {
      return `S${season}E${episodeIndex} - ${title}`;
    }

    if (episodeIndex) {
      return `E${episodeIndex} - ${title}`;
    }

    return title;
  }

  function sortEpisodes(episodes) {
    return episodes
      .map((episode, originalIndex) => ({ episode, originalIndex }))
      .sort((left, right) => compareEpisodeEntries(left, right))
      .map((entry) => entry.episode);
  }

  function pickFirstSeason(seasons) {
    return seasons
      .filter((season) => season.ratingKey && season.index > 0)
      .sort((left, right) => compareNullableNumbers(left.index, right.index) || normalizeText(left.title).localeCompare(normalizeText(right.title)))[0] || null;
  }

  function compareEpisodeEntries(left, right) {
    return compareNullableNumbers(left.episode.parentIndex, right.episode.parentIndex)
      || compareNullableNumbers(left.episode.index, right.episode.index)
      || normalizeText(left.episode.title).localeCompare(normalizeText(right.episode.title))
      || left.originalIndex - right.originalIndex;
  }

  function compareNullableNumbers(left, right) {
    const leftValue = left || Number.POSITIVE_INFINITY;
    const rightValue = right || Number.POSITIVE_INFINITY;
    return leftValue - rightValue;
  }

  function getCurrentRatingKey() {
    const key = getRouteParam("key");
    if (!key) {
      return null;
    }

    const decodedKey = safeDecode(key);
    const match = decodedKey.match(/^\/library\/metadata\/(\d+)(?:$|[/?#])/);
    return match ? match[1] : null;
  }

  function getRouteParam(name) {
    const params = getAllRouteParams();
    return params.get(name) || params.get(name.toLowerCase()) || null;
  }

  function getAllRouteParams() {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, "");
    const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash;

    for (const [key, value] of new URLSearchParams(hashQuery)) {
      params.set(key, value);
    }

    return params;
  }

  function findPlexToken() {
    const tokenFromUrl = getRouteParam("X-Plex-Token") || getRouteParam("x-plex-token");
    if (isPlausibleToken(tokenFromUrl)) {
      return tokenFromUrl;
    }

    const candidates = [];
    collectStorageTokens(window.localStorage, candidates);
    collectStorageTokens(window.sessionStorage, candidates);
    candidates.sort((left, right) => right.score - left.score);

    return candidates[0]?.value || "";
  }

  function collectStorageTokens(storage, candidates) {
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        const value = key ? storage.getItem(key) : "";
        collectTokenCandidates(key || "", value || "", candidates);
      }
    } catch {
      // Some browsers can deny storage access in strict modes.
    }
  }

  function collectTokenCandidates(storageKey, rawValue, candidates) {
    if (!rawValue) {
      return;
    }

    const keyHasHint = TOKEN_HINT_PATTERN.test(storageKey);
    const trimmedValue = rawValue.trim();
    if (isPlausibleToken(trimmedValue)) {
      candidates.push({
        value: trimmedValue,
        score: keyHasHint ? 100 : 10,
      });
    }

    if (!looksLikeJson(trimmedValue)) {
      return;
    }

    try {
      collectJsonTokenCandidates(JSON.parse(trimmedValue), storageKey, keyHasHint, candidates, 0);
    } catch {
      // Ignore non-JSON storage values.
    }
  }

  function collectJsonTokenCandidates(value, path, pathHasHint, candidates, depth) {
    if (depth > 6 || value == null) {
      return;
    }

    if (typeof value === "string") {
      if (pathHasHint && isPlausibleToken(value)) {
        candidates.push({
          value,
          score: 90 - depth,
        });
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => collectJsonTokenCandidates(entry, `${path}[${index}]`, pathHasHint, candidates, depth + 1));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    Object.entries(value).forEach(([key, childValue]) => {
      const childHasHint = pathHasHint || TOKEN_KEYS.has(key) || TOKEN_HINT_PATTERN.test(key);
      collectJsonTokenCandidates(childValue, `${path}.${key}`, childHasHint, candidates, depth + 1);
    });
  }

  function isPlausibleToken(value) {
    return typeof value === "string" && TOKEN_VALUE_PATTERN.test(value.trim());
  }

  function looksLikeJson(value) {
    return value.startsWith("{") || value.startsWith("[");
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function toArray(value) {
    if (!value) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  }

  function elementChildren(element, tagName) {
    return Array.from(element.children).filter((child) => child.tagName === tagName);
  }

  function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getAttribute("aria-hidden") !== "true";
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function resolutionValue(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("4k") || text.includes("uhd")) {
      return 2160;
    }

    const match = text.match(/\d+/);
    if (match) {
      return Number(match[0]);
    }

    return 0;
  }

  function observeNavigation() {
    window.addEventListener("hashchange", () => scheduleUiRefresh(), { passive: true });
    window.addEventListener("popstate", () => scheduleUiRefresh(), { passive: true });

    window.setInterval(() => {
      if (window.location.href === lastHref) {
        scanCardsForButtons();
        return;
      }

      lastHref = window.location.href;
      scheduleUiRefresh(0);
    }, CARD_SCAN_INTERVAL_MS);

    new MutationObserver((mutations) => {
      if (mutations.every(isOwnUiMutation)) {
        return;
      }

      scheduleUiRefresh();
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function isOwnUiMutation(mutation) {
    if (isOwnUiNode(mutation.target)) {
      return true;
    }

    if (mutation.type !== "childList") {
      return false;
    }

    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return changedNodes.length > 0 && changedNodes.every(isOwnUiNode);
  }

  function isOwnUiNode(node) {
    if (node instanceof Text) {
      return node.parentElement ? isOwnUiNode(node.parentElement) : false;
    }

    if (!(node instanceof Element)) {
      return false;
    }

    return !!node.closest(`#${BUTTON_ID}, .${CARD_BUTTON_CLASS}, .${TOAST_CLASS}`);
  }

  function start() {
    addStyle();
    ensureButton();
    lastHref = window.location.href;
    refreshUi();
    observeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
