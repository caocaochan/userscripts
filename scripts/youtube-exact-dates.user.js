// ==UserScript==
// @name         YouTube Exact Dates
// @namespace    https://www.youtube.com/
// @version      0.1.1
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/youtube-exact-dates.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/youtube-exact-dates.user.js
// @description  Replaces relative YouTube video dates with exact browser-local timestamps.
// @author       CaoCao
// @match        https://www.youtube.com/*
// @tag          youtube
// @tag          dates
// @tag          enhancement
// @run-at       document-start
// @sandbox      DOM
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @grant        window.onurlchange
// @connect      www.youtube.com
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const LOG_PREFIX = "[YouTube Exact Dates]";
  const CACHE_KEY = "youtube-exact-dates-cache-v1";
  const CACHE_CAPACITY = 2000;
  const CACHE_SAVE_DELAY_MS = 1000;
  const REQUEST_TIMEOUT_MS = 10000;
  const MAX_CONCURRENT_REQUESTS = 2;
  const PRELOAD_MARGIN_PX = 600;
  const INTERSECTION_ROOT_MARGIN = `${PRELOAD_MARGIN_PX}px 0px`;
  const WATCH_RESCAN_DELAY_MS = 250;
  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  const TARGET_VIDEO_ATTRIBUTE = "data-youtube-exact-date-video-id";
  const TARGET_APPLIED_ATTRIBUTE = "data-youtube-exact-date-applied";

  const RELATIVE_DATE_SOURCE = String.raw`(?:(?:Streamed|Premiered)(?:\s+live)?\s+)?\d+(?:[.,]\d+)?\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?|min|mo|[smhdwy])\s+ago`;
  const RELATIVE_DATE_PATTERN = new RegExp(`^${RELATIVE_DATE_SOURCE}$`, "i");
  const TRAILING_RELATIVE_DATE_PATTERN = new RegExp(RELATIVE_DATE_SOURCE + "$", "i");

  const WATCH_DATE_SELECTOR = "ytd-watch-metadata yt-formatted-string#info > span";
  const MODERN_CARD_DATE_SELECTOR =
    ".ytContentMetadataViewModelMetadataTextLastPart";
  const LEGACY_CARD_DATE_SELECTOR = [
    "ytd-rich-grid-media #metadata-line > span:last-child",
    "ytd-video-renderer #metadata-line > span:last-child",
    "ytd-grid-video-renderer #metadata-line > span:last-child",
    "ytd-compact-video-renderer #metadata-line > span:last-child",
    "ytd-playlist-video-renderer #metadata-line > span:last-child",
    "ytd-playlist-panel-video-renderer #metadata-line > span:last-child",
  ].join(", ");
  const DATE_TARGET_SELECTOR = [
    WATCH_DATE_SELECTOR,
    MODERN_CARD_DATE_SELECTOR,
    LEGACY_CARD_DATE_SELECTOR,
  ].join(", ");
  const CARD_RENDERER_SELECTOR = [
    "yt-lockup-view-model",
    "ytd-rich-grid-media",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-playlist-panel-video-renderer",
  ].join(", ");
  const VIDEO_LINK_SELECTOR = [
    "a#video-title[href]",
    'a[href*="/watch?v="]',
    'a[href^="/shorts/"]',
  ].join(", ");

  const timestampCache = new Map();
  const failedVideoIds = new Set();
  const queuedVideoIds = new Set();
  const activeRequests = new Map();
  const requestQueue = [];
  const targetsByVideoId = new Map();
  const scanRoots = new Set();
  const warnedCategories = new Set();

  let intersectionObserver = null;
  let mutationObserver = null;
  let scanFrame = 0;
  let cacheSaveTimer = 0;
  let cacheDirty = false;
  let cacheSaveInFlight = null;
  let watchRescanTimer = 0;

  function warnOnce(category, message, error) {
    if (warnedCategories.has(category)) return;
    warnedCategories.add(category);
    if (error === undefined) {
      console.warn(`${LOG_PREFIX} ${message}`);
    } else {
      console.warn(`${LOG_PREFIX} ${message}`, error);
    }
  }

  function normalizeTimestamp(value) {
    if (
      typeof value !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.trim())
    ) {
      return null;
    }

    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;

    const pad = (part) => String(part).padStart(2, "0");
    return [
      date.getFullYear(),
      "-",
      pad(date.getMonth() + 1),
      "-",
      pad(date.getDate()),
      " ",
      pad(date.getHours()),
      ":",
      pad(date.getMinutes()),
    ].join("");
  }

  function isVideoId(value) {
    return typeof value === "string" && VIDEO_ID_PATTERN.test(value);
  }

  function normalizedElementText(element) {
    return (element.textContent ?? "").trim().replace(/\s+/gu, " ");
  }

  function isNearViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= -PRELOAD_MARGIN_PX
      && rect.top <= window.innerHeight + PRELOAD_MARGIN_PX
      && rect.right >= 0
      && rect.left <= window.innerWidth;
  }

  function isRelativeDateText(value) {
    return RELATIVE_DATE_PATTERN.test(value.trim().replace(/\s+/gu, " "));
  }

  function extractVideoIdFromUrl(value) {
    let url;
    try {
      url = new URL(value, location.origin);
    } catch {
      return null;
    }

    if (url.origin !== location.origin) return null;

    let videoId = null;
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else {
      const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)(?:\/|$)/);
      videoId = shortsMatch?.[1] ?? null;
    }

    return isVideoId(videoId) ? videoId : null;
  }

  function currentRouteVideoId() {
    return extractVideoIdFromUrl(location.href);
  }

  function readTimestampFromDocument(documentNode) {
    const published = documentNode.querySelector('meta[itemprop="datePublished"]')?.content;
    const uploaded = documentNode.querySelector('meta[itemprop="uploadDate"]')?.content;
    return normalizeTimestamp(published) ?? normalizeTimestamp(uploaded);
  }

  function readCurrentWatchTimestamp(videoId) {
    const identifier = document.querySelector('meta[itemprop="identifier"]')?.content;
    if (identifier !== videoId) return null;
    return readTimestampFromDocument(document);
  }

  async function loadCache() {
    let storedEntries;
    try {
      storedEntries = await GM.getValue(CACHE_KEY, []);
    } catch (error) {
      warnOnce("cache-read", "Could not read the timestamp cache.", error);
      return;
    }

    if (!Array.isArray(storedEntries)) return;
    for (const entry of storedEntries.slice(-CACHE_CAPACITY)) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [videoId, value] = entry;
      const timestamp = isVideoId(videoId) ? normalizeTimestamp(value) : null;
      if (!timestamp) continue;
      timestampCache.delete(videoId);
      timestampCache.set(videoId, timestamp);
    }
  }

  function scheduleCacheSave() {
    cacheDirty = true;
    if (cacheSaveTimer || cacheSaveInFlight) return;
    cacheSaveTimer = window.setTimeout(() => {
      cacheSaveTimer = 0;
      void flushCache();
    }, CACHE_SAVE_DELAY_MS);
  }

  async function flushCache() {
    if (!cacheDirty || cacheSaveInFlight) return;
    cacheDirty = false;
    const entries = [...timestampCache.entries()];

    try {
      cacheSaveInFlight = Promise.resolve(GM.setValue(CACHE_KEY, entries));
      await cacheSaveInFlight;
    } catch (error) {
      warnOnce("cache-write", "Could not save the timestamp cache.", error);
    } finally {
      cacheSaveInFlight = null;
      if (cacheDirty) scheduleCacheSave();
    }
  }

  function storeTimestamp(videoId, value) {
    const timestamp = normalizeTimestamp(value);
    if (!isVideoId(videoId) || !timestamp) return null;
    if (timestampCache.get(videoId) === timestamp) return timestamp;

    timestampCache.delete(videoId);
    timestampCache.set(videoId, timestamp);
    while (timestampCache.size > CACHE_CAPACITY) {
      timestampCache.delete(timestampCache.keys().next().value);
    }
    scheduleCacheSave();
    return timestamp;
  }

  function replaceRelativeAttribute(element, attributeName, formatted) {
    const value = element.getAttribute(attributeName);
    if (!value) return;

    const normalized = value.trim().replace(/\s+/gu, " ");
    if (!TRAILING_RELATIVE_DATE_PATTERN.test(normalized)) return;
    element.setAttribute(
      attributeName,
      normalized.replace(TRAILING_RELATIVE_DATE_PATTERN, formatted),
    );
  }

  function applyTimestampToTarget(target, videoId, timestamp) {
    if (
      !target.isConnected
      || target.getAttribute(TARGET_VIDEO_ATTRIBUTE) !== videoId
    ) {
      return;
    }

    const formatted = formatTimestamp(timestamp);
    if (!formatted) return;

    const currentText = normalizedElementText(target);
    const wasApplied = target.hasAttribute(TARGET_APPLIED_ATTRIBUTE);
    if (!isRelativeDateText(currentText) && !(wasApplied && currentText === formatted)) {
      return;
    }

    if (currentText !== formatted) target.textContent = formatted;
    replaceRelativeAttribute(target, "aria-label", formatted);
    replaceRelativeAttribute(target, "title", formatted);
    target.setAttribute(TARGET_APPLIED_ATTRIBUTE, "");
  }

  function applyTimestampToTargets(videoId, timestamp) {
    const targets = targetsByVideoId.get(videoId);
    if (!targets) return;

    for (const target of [...targets]) {
      if (!target.isConnected) {
        targets.delete(target);
        continue;
      }
      applyTimestampToTarget(target, videoId, timestamp);
    }
    if (!targets.size) targetsByVideoId.delete(videoId);
  }

  function unregisterTarget(target) {
    intersectionObserver?.unobserve(target);
    const videoId = target.getAttribute(TARGET_VIDEO_ATTRIBUTE);
    if (!videoId) return;

    const targets = targetsByVideoId.get(videoId);
    targets?.delete(target);
    if (targets && !targets.size) targetsByVideoId.delete(videoId);
    target.removeAttribute(TARGET_VIDEO_ATTRIBUTE);
    target.removeAttribute(TARGET_APPLIED_ATTRIBUTE);
  }

  function registerTarget(target, videoId) {
    const previousVideoId = target.getAttribute(TARGET_VIDEO_ATTRIBUTE);
    if (previousVideoId && previousVideoId !== videoId) unregisterTarget(target);

    target.setAttribute(TARGET_VIDEO_ATTRIBUTE, videoId);
    let targets = targetsByVideoId.get(videoId);
    if (!targets) {
      targets = new Set();
      targetsByVideoId.set(videoId, targets);
    }
    targets.add(target);

    const cachedTimestamp = timestampCache.get(videoId);
    if (cachedTimestamp) {
      intersectionObserver?.unobserve(target);
      applyTimestampToTarget(target, videoId, cachedTimestamp);
      return;
    }

    if (
      failedVideoIds.has(videoId)
      || queuedVideoIds.has(videoId)
      || activeRequests.has(videoId)
    ) {
      return;
    }

    if (isNearViewport(target)) {
      enqueueVideo(videoId);
    } else {
      intersectionObserver.observe(target);
    }
  }

  function resolveCardVideoId(target) {
    const renderer = target.closest(CARD_RENDERER_SELECTOR);
    if (!renderer) return null;

    for (const anchor of renderer.querySelectorAll(VIDEO_LINK_SELECTOR)) {
      const videoId = extractVideoIdFromUrl(anchor.href);
      if (videoId) return videoId;
    }
    return null;
  }

  function processDateTarget(target) {
    if (!(target instanceof Element)) return;

    const currentText = normalizedElementText(target);
    if (!isRelativeDateText(currentText)) return;

    if (target.matches(WATCH_DATE_SELECTOR)) {
      const videoId = currentRouteVideoId();
      if (!videoId) return;

      const timestamp = readCurrentWatchTimestamp(videoId);
      if (!timestamp) return;
      const storedTimestamp = storeTimestamp(videoId, timestamp);
      if (!storedTimestamp) return;
      registerTarget(target, videoId);
      applyTimestampToTarget(target, videoId, storedTimestamp);
      return;
    }

    const videoId = resolveCardVideoId(target);
    if (videoId) registerTarget(target, videoId);
  }

  function scanRoot(root) {
    if (root instanceof Element && root.matches(DATE_TARGET_SELECTOR)) {
      processDateTarget(root);
    }
    if (!(root instanceof Document || root instanceof DocumentFragment || root instanceof Element)) {
      return;
    }
    for (const target of root.querySelectorAll(DATE_TARGET_SELECTOR)) {
      processDateTarget(target);
    }
  }

  function scheduleScan(root) {
    if (!(root instanceof Document || root instanceof DocumentFragment || root instanceof Element)) {
      return;
    }

    if (root instanceof Document) {
      scanRoots.clear();
      scanRoots.add(root);
    } else if (![...scanRoots].some((queuedRoot) => (
      queuedRoot instanceof Document
      || (queuedRoot instanceof Element && queuedRoot.contains(root))
    ))) {
      for (const queuedRoot of [...scanRoots]) {
        if (root.contains(queuedRoot)) scanRoots.delete(queuedRoot);
      }
      scanRoots.add(root);
    }

    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      const roots = [...scanRoots];
      scanRoots.clear();
      for (const queuedRoot of roots) scanRoot(queuedRoot);
    });
  }

  function unregisterTargetsInSubtree(node) {
    if (!(node instanceof Element)) return;
    if (node.hasAttribute(TARGET_VIDEO_ATTRIBUTE)) unregisterTarget(node);
    for (const target of node.querySelectorAll(`[${TARGET_VIDEO_ATTRIBUTE}]`)) {
      unregisterTarget(target);
    }
  }

  function startMutationObserver() {
    mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          if (mutation.target.parentElement) scheduleScan(mutation.target.parentElement);
          continue;
        }

        for (const node of mutation.removedNodes) unregisterTargetsInSubtree(node);
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) scheduleScan(node);
          else if (node.parentElement) scheduleScan(node.parentElement);
        }
      }
    });
    mutationObserver.observe(document, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  function enqueueVideo(videoId) {
    if (
      !isVideoId(videoId)
      || timestampCache.has(videoId)
      || failedVideoIds.has(videoId)
      || queuedVideoIds.has(videoId)
      || activeRequests.has(videoId)
    ) {
      return;
    }

    queuedVideoIds.add(videoId);
    requestQueue.push(videoId);
    pumpRequestQueue();
  }

  async function fetchVideoTimestamp(videoId) {
    let request;
    try {
      const url = new URL("/watch", location.origin);
      url.searchParams.set("v", videoId);
      request = GM.xmlHttpRequest({
        method: "GET",
        url,
        headers: {
          Accept: "text/html",
        },
        responseType: "text",
        redirect: "follow",
      });
    } catch (error) {
      warnOnce("request-start", "Could not start a video metadata request.", error);
      return null;
    }

    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      request.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await request;
      if (response.status < 200 || response.status >= 300) {
        warnOnce("request-status", "YouTube returned an unsuccessful metadata response.");
        return null;
      }

      const responseText = typeof response.responseText === "string"
        ? response.responseText
        : response.response;
      if (typeof responseText !== "string" || !responseText) return null;

      const parsedDocument = new DOMParser().parseFromString(responseText, "text/html");
      return readTimestampFromDocument(parsedDocument);
    } catch (error) {
      if (timedOut) {
        warnOnce("request-timeout", "A video metadata request timed out.");
      } else {
        warnOnce("request-failure", "Could not load video metadata.", error);
      }
      return null;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function pumpRequestQueue() {
    while (
      activeRequests.size < MAX_CONCURRENT_REQUESTS
      && requestQueue.length
    ) {
      const videoId = requestQueue.shift();
      queuedVideoIds.delete(videoId);
      if (
        timestampCache.has(videoId)
        || failedVideoIds.has(videoId)
        || activeRequests.has(videoId)
      ) {
        continue;
      }

      const requestPromise = fetchVideoTimestamp(videoId);
      activeRequests.set(videoId, requestPromise);
      void requestPromise.then((timestamp) => {
        if (timestamp) {
          const storedTimestamp = storeTimestamp(videoId, timestamp);
          if (storedTimestamp) applyTimestampToTargets(videoId, storedTimestamp);
        } else {
          failedVideoIds.add(videoId);
        }
      }).catch((error) => {
        failedVideoIds.add(videoId);
        warnOnce("request-processing", "Could not process video metadata.", error);
      }).finally(() => {
        activeRequests.delete(videoId);
        pumpRequestQueue();
      });
    }
  }

  function startIntersectionObserver() {
    intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target;
        intersectionObserver.unobserve(target);
        const videoId = target.getAttribute(TARGET_VIDEO_ATTRIBUTE);
        if (videoId) enqueueVideo(videoId);
      }
    }, {
      rootMargin: INTERSECTION_ROOT_MARGIN,
    });
  }

  function scheduleRouteScan() {
    if (watchRescanTimer) window.clearTimeout(watchRescanTimer);
    scheduleScan(document);
    watchRescanTimer = window.setTimeout(() => {
      watchRescanTimer = 0;
      scheduleScan(document);
    }, WATCH_RESCAN_DELAY_MS);
  }

  async function main() {
    await loadCache();
    startIntersectionObserver();
    startMutationObserver();

    if (window.onurlchange === null) {
      window.addEventListener("urlchange", scheduleRouteScan);
    }

    scheduleRouteScan();
  }

  void main().catch((error) => {
    console.error(`${LOG_PREFIX} Initialization failed.`, error);
  });
})();
