// ==UserScript==
// @name         Plex Open in mpv
// @namespace    http://127.0.0.1:32400/
// @version      0.2.1
// @updateURL    https://cdn.jsdelivr.net/gh/caocaochan/userscripts@main/scripts/plex-open-in-mpv.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/caocaochan/userscripts@main/scripts/plex-open-in-mpv.user.js
// @description  Adds an Open in mpv button to local Plex movie, episode, and season detail pages.
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
      font: 700 16px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
  `;

  let button = null;
  let toastTimer = 0;
  let lastHref = "";
  let currentRatingKey = null;
  let isLoading = false;
  let lastPlayButton = null;

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
        title: "Open a movie, episode, or season details page",
      });
      return;
    }

    if (!mountButtonNextToPlay()) {
      setButtonState({
        display: "none",
        disabled: true,
        label: READY_LABEL,
        title: "Open a movie, episode, or season details page",
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
    button.style.display = display;
    button.disabled = disabled;
    setButtonLabel(label);
    button.title = title;
    button.setAttribute("aria-label", title);
  }

  function setButtonLabel(label) {
    const labelElement = button.querySelector(`.${BUTTON_LABEL_CLASS}`);
    if (labelElement) {
      labelElement.textContent = label;
      return;
    }

    button.textContent = label;
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

  async function onButtonClick() {
    if (isLoading) {
      return;
    }

    const ratingKey = getCurrentRatingKey();
    if (!ratingKey) {
      showToast("Open a movie, episode, or season details page first");
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
      const item = await fetchMetadataItem(ratingKey, token);
      if (item.type === "movie" || item.type === "episode") {
        openSingleItemInMpv(item, token);
        return;
      }

      if (item.type === "season") {
        await openSeasonInMpv(item, token);
        return;
      }

      showToast("Open an episode or season page first");
    } catch (error) {
      showToast(error?.message || "Could not read Plex metadata");
    } finally {
      isLoading = false;
      refreshButtonState();
    }
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
    const entries = sortEpisodes(episodes)
      .map((episode, originalIndex) => ({
        episode,
        originalIndex,
        part: pickBestPart(episode),
      }))
      .filter((entry) => entry.part);

    if (!entries.length) {
      showToast("No playable Plex media part found");
      return;
    }

    const playlist = buildPlaylist(entries, token);
    window.location.href = buildMpvPlaylistUrl(playlist);
    showToast("Opening season in mpv");
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
    window.addEventListener("hashchange", refreshButtonState, { passive: true });
    window.addEventListener("popstate", refreshButtonState, { passive: true });

    window.setInterval(() => {
      if (window.location.href === lastHref) {
        return;
      }

      lastHref = window.location.href;
      refreshButtonState();
    }, 500);

    new MutationObserver(() => {
      if (!button || !button.isConnected) {
        refreshButtonState();
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function start() {
    addStyle();
    ensureButton();
    lastHref = window.location.href;
    refreshButtonState();
    observeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
