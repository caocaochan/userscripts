// ==UserScript==
// @name         Reddit Default Sorting
// @namespace    https://www.reddit.com/
// @version      2.1.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/reddit-default-sorting.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/reddit-default-sorting.user.js
// @description  Applies preferred Reddit sorting and sets comment body text to 1rem.
// @author       CaoCao
// @match        https://www.reddit.com/*
// @match        https://reddit.com/*
// @match        https://sh.reddit.com/*
// @tag          reddit
// @tag          navigation
// @run-at       document-start
// @sandbox      DOM
// @grant        GM.addStyle
// @grant        window.onurlchange
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const REDDIT_ORIGINS = new Set([
    "https://reddit.com",
    "https://www.reddit.com",
    "https://sh.reddit.com",
  ]);
  const COMMUNITY_ROUTE_PATTERN = /^\/r\/([^/]+)\/?$/i;
  const COMMENT_CSS = `
    shreddit-comment [slot="comment"] {
      font-size: 1rem !important;
    }
  `;

  function rewriteURL(input) {
    let url;

    try {
      url = new URL(input, location.href);
    } catch {
      return null;
    }

    if (!REDDIT_ORIGINS.has(url.origin)) return null;

    // Reddit homepage -> Top, Today.
    if (url.pathname === "/") {
      url.pathname = "/top/";
      url.searchParams.set("t", "day");
      return url;
    }

    // /r/subreddit or /r/subreddit/ -> /r/subreddit/new/
    const community = url.pathname.match(COMMUNITY_ROUTE_PATTERN);
    if (community) {
      url.pathname = `/r/${community[1]}/new/`;
      return url;
    }

    return null;
  }

  function enforceCurrentURL() {
    const replacement = rewriteURL(location.href);

    if (replacement && replacement.href !== location.href) {
      location.replace(replacement.href);
    }
  }

  function rewriteClickedLink(event) {
    const anchor = event.composedPath().find(
      (node) => node instanceof HTMLAnchorElement && node.hasAttribute("href"),
    );

    if (!anchor) return;

    const replacement = rewriteURL(anchor.href);

    if (replacement && replacement.href !== anchor.href) {
      anchor.href = replacement.href;
    }
  }

  // pointerdown covers middle-click, drag, and context-menu navigation;
  // click covers keyboard activation.
  document.addEventListener("pointerdown", rewriteClickedLink, true);
  document.addEventListener("click", rewriteClickedLink, true);

  GM.addStyle(COMMENT_CSS);

  if (window.onurlchange === null) {
    window.addEventListener("urlchange", enforceCurrentURL);
  }

  enforceCurrentURL();
})();
