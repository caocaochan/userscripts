// ==UserScript==
// @name         English Titles for AniList
// @namespace    https://anilist.co/
// @version      0.1.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/anilist-english-titles.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/anilist-english-titles.user.js
// @description  Adds English titles beneath anime titles on AniList user lists, with romaji fallback.
// @author       CaoCao
// @match        https://anilist.co/user/*/animelist*
// @tag          anime
// @tag          enhancement
// @run-at       document-start
// @sandbox      DOM
// @grant        GM.addStyle
// @grant        GM.xmlHttpRequest
// @grant        window.onurlchange
// @connect      graphql.anilist.co
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const LOG_PREFIX = "[English Titles for AniList]";
  const API_URL = new URL("https://graphql.anilist.co/");
  const REQUEST_TIMEOUT_MS = 15000;
  const ANIME_LIST_ROUTE_PATTERN = /^\/user\/([^/]+)\/animelist(?:\/|$)/i;
  const ANIME_MEDIA_PATH_PATTERN = /^\/anime\/(\d+)(?:\/|$)/i;
  const TITLE_LINK_SELECTOR = ".medialist .list-entries .title > a[href]";
  const RELEVANT_MUTATION_SELECTOR =
    `.medialist, .list-entries, .title, ${TITLE_LINK_SELECTOR}`;
  const LINK_CLASS = "anilist-english-titles-link";
  const SECONDARY_CLASS = "anilist-english-titles-secondary";

  const QUERY = `
    query EnglishTitlesForAniList($userName: String!) {
      MediaListCollection(userName: $userName, type: ANIME) {
        lists {
          entries {
            mediaId
            media {
              title {
                english
                romaji
              }
            }
          }
        }
      }
    }
  `;

  const CSS = `
    .${LINK_CLASS} {
      display: inline-flex;
      min-width: 0;
      flex-direction: column;
      align-items: flex-start;
      white-space: normal;
    }

    .${SECONDARY_CLASS} {
      display: block;
      margin-top: 2px;
      color: currentColor;
      font-size: 0.82em;
      font-weight: 400;
      line-height: 1.3;
      opacity: 0.68;
    }
  `;

  const titleCache = new Map();
  const attemptedUsers = new Set();

  let activeRoute = null;
  let activeTitles = null;
  let activeRequest = null;
  let domObserver = null;
  let syncFrame = 0;
  let routeGeneration = 0;
  let styleElement = null;

  function parseAnimeListRoute(url = location.href) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url, location.origin);
    } catch {
      return null;
    }

    if (parsedUrl.origin !== location.origin) return null;

    const match = parsedUrl.pathname.match(ANIME_LIST_ROUTE_PATTERN);
    if (!match) return null;

    let userName;
    try {
      userName = decodeURIComponent(match[1]).trim();
    } catch {
      return null;
    }
    if (!userName) return null;

    return {
      userName,
      cacheKey: userName.toLocaleLowerCase("en-US"),
    };
  }

  function parseMediaId(anchor) {
    try {
      const match = new URL(anchor.href, location.origin).pathname.match(ANIME_MEDIA_PATH_PATTERN);
      if (!match) return null;
      const mediaId = Number(match[1]);
      return Number.isSafeInteger(mediaId) && mediaId > 0 ? mediaId : null;
    } catch {
      return null;
    }
  }

  function cleanTitle(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function normalizeTitle(value) {
    return value
      .normalize("NFKC")
      .trim()
      .replace(/\s+/gu, " ")
      .toLocaleLowerCase("en-US");
  }

  function primaryTitleText(anchor) {
    let text = "";
    for (const node of anchor.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains(SECONDARY_CLASS)) {
        continue;
      }
      text += node.textContent ?? "";
    }
    return text.trim();
  }

  function directSecondaryElements(anchor) {
    return [...anchor.children].filter((element) => element.classList.contains(SECONDARY_CLASS));
  }

  function removeDecoration(anchor) {
    for (const element of directSecondaryElements(anchor)) element.remove();
    anchor.classList.remove(LINK_CLASS);
  }

  function clearDecorations() {
    for (const anchor of document.querySelectorAll(`.${LINK_CLASS}`)) {
      removeDecoration(anchor);
    }
    for (const element of document.querySelectorAll(`.${SECONDARY_CLASS}`)) {
      element.remove();
    }
  }

  function syncTitles() {
    if (!activeRoute || !activeTitles) return;

    for (const anchor of document.querySelectorAll(TITLE_LINK_SELECTOR)) {
      const mediaId = parseMediaId(anchor);
      const titles = mediaId === null ? null : activeTitles.get(mediaId);
      const secondaryTitle = titles?.english ?? titles?.romaji ?? null;
      const secondaryElements = directSecondaryElements(anchor);
      const secondaryElement = secondaryElements.shift() ?? null;
      for (const duplicate of secondaryElements) duplicate.remove();

      const primaryTitle = primaryTitleText(anchor);
      if (
        !secondaryTitle
        || !primaryTitle
        || normalizeTitle(primaryTitle) === normalizeTitle(secondaryTitle)
      ) {
        secondaryElement?.remove();
        anchor.classList.remove(LINK_CLASS);
        continue;
      }

      const element = secondaryElement ?? document.createElement("span");
      element.className = SECONDARY_CLASS;
      if (element.textContent !== secondaryTitle) element.textContent = secondaryTitle;
      if (!element.isConnected || element.parentElement !== anchor) anchor.append(element);
      anchor.classList.add(LINK_CLASS);
    }
  }

  function scheduleSync() {
    if (!activeRoute || !activeTitles || syncFrame) return;
    syncFrame = requestAnimationFrame(() => {
      syncFrame = 0;
      syncTitles();
    });
  }

  function nodeCanAffectTitles(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.classList.contains(SECONDARY_CLASS)) return false;
    return node.matches(RELEVANT_MUTATION_SELECTOR)
      || node.querySelector(RELEVANT_MUTATION_SELECTOR) !== null;
  }

  function mutationsCanAffectTitles(mutations) {
    return mutations.some((mutation) => (
      [...mutation.addedNodes, ...mutation.removedNodes].some(nodeCanAffectTitles)
    ));
  }

  function startDomObserver() {
    domObserver?.disconnect();
    domObserver = new MutationObserver((mutations) => {
      if (mutationsCanAffectTitles(mutations)) scheduleSync();
    });
    domObserver.observe(document, {
      childList: true,
      subtree: true,
    });
  }

  function stopDomObserver() {
    domObserver?.disconnect();
    domObserver = null;
    if (syncFrame) {
      cancelAnimationFrame(syncFrame);
      syncFrame = 0;
    }
  }

  function abortActiveRequest() {
    if (!activeRequest) return;
    activeRequest.abortedByRoute = true;
    activeRequest.request.abort();
  }

  function buildTitleMap(payload) {
    if (Array.isArray(payload?.errors) && payload.errors.length) {
      throw new Error(payload.errors.map((error) => error?.message).filter(Boolean).join("; ")
        || "AniList returned a GraphQL error.");
    }

    const lists = payload?.data?.MediaListCollection?.lists;
    if (!Array.isArray(lists)) {
      throw new Error("AniList returned an unexpected media-list response.");
    }

    const titlesByMediaId = new Map();
    for (const list of lists) {
      if (!Array.isArray(list?.entries)) continue;
      for (const entry of list.entries) {
        const mediaId = Number(entry?.mediaId);
        if (!Number.isSafeInteger(mediaId) || mediaId <= 0) continue;

        const english = cleanTitle(entry?.media?.title?.english);
        const romaji = cleanTitle(entry?.media?.title?.romaji);
        titlesByMediaId.set(mediaId, { english, romaji });
      }
    }

    return titlesByMediaId;
  }

  async function loadTitles(route, generation) {
    const cachedTitles = titleCache.get(route.cacheKey);
    if (cachedTitles) {
      if (generation === routeGeneration) {
        activeTitles = cachedTitles;
        scheduleSync();
      }
      return;
    }
    if (attemptedUsers.has(route.cacheKey)) return;
    attemptedUsers.add(route.cacheKey);

    let request;
    try {
      request = GM.xmlHttpRequest({
        method: "POST",
        url: API_URL,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        data: JSON.stringify({
          query: QUERY,
          variables: { userName: route.userName },
        }),
        responseType: "json",
        anonymous: true,
        fetch: true,
        redirect: "error",
      });
    } catch (error) {
      console.warn(`${LOG_PREFIX} Could not request titles.`, error);
      return;
    }

    const requestState = {
      request,
      generation,
      abortedByRoute: false,
      timedOut: false,
    };
    activeRequest = requestState;

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const abortForTimeout = () => {
      requestState.timedOut = true;
      request.abort();
    };
    timeoutSignal.addEventListener("abort", abortForTimeout, { once: true });

    try {
      const response = await request;
      if (
        requestState.abortedByRoute
        || requestState.timedOut
        || generation !== routeGeneration
      ) {
        return;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`AniList returned HTTP ${response.status}.`);
      }

      let payload = response.response;
      if (payload === null || typeof payload !== "object") {
        payload = JSON.parse(response.responseText);
      }
      const titles = buildTitleMap(payload);
      titleCache.set(route.cacheKey, titles);

      if (generation === routeGeneration) {
        activeTitles = titles;
        scheduleSync();
      }
    } catch (error) {
      if (requestState.abortedByRoute || generation !== routeGeneration) return;
      if (requestState.timedOut) {
        console.warn(`${LOG_PREFIX} The title request timed out.`);
        return;
      }
      console.warn(`${LOG_PREFIX} Could not load titles.`, error);
    } finally {
      timeoutSignal.removeEventListener("abort", abortForTimeout);
      if (activeRequest === requestState) activeRequest = null;
    }
  }

  async function handleRouteChange() {
    const nextRoute = parseAnimeListRoute();
    if (activeRoute && nextRoute && activeRoute.cacheKey === nextRoute.cacheKey) {
      scheduleSync();
      return;
    }

    routeGeneration += 1;
    const generation = routeGeneration;
    abortActiveRequest();
    stopDomObserver();
    clearDecorations();
    activeRoute = nextRoute;
    activeTitles = null;

    if (!nextRoute) return;

    startDomObserver();
    await loadTitles(nextRoute, generation);
  }

  async function main() {
    styleElement = GM.addStyle(CSS);

    if (window.onurlchange === null) {
      window.addEventListener("urlchange", () => {
        void handleRouteChange().catch((error) => {
          console.error(`${LOG_PREFIX} Route update failed.`, error);
        });
      });
    }

    await handleRouteChange();
  }

  void main().catch((error) => {
    console.error(`${LOG_PREFIX} Initialization failed.`, error);
  });
})();
