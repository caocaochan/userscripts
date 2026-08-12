const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../scripts/youtube-exact-dates.user.js",
);
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");
const CACHE_KEY = "youtube-exact-dates-cache-v1";
const VIDEO_A = "AAAAAAA0001";
const VIDEO_B = "BBBBBBB0002";
const VIDEO_C = "CCCCCCC0003";
const VIDEO_D = "DDDDDDD0004";
const PLAYLIST_ID = "PLCZsar9rNRv1HTX-QRIDw0-Avm4Cd1mKx";

function modernCard(videoId, dateText, id = "") {
  return `
    <yt-lockup-view-model id="${id}">
      <a href="/watch?v=${videoId}">Video</a>
      <yt-content-metadata-view-model>
        <span class="ytContentMetadataViewModelMetadataTextLastPart"
              aria-label="${dateText}" title="${dateText}">${dateText}</span>
      </yt-content-metadata-view-model>
    </yt-lockup-view-model>
  `;
}

function legacyCard(videoId, dateText, id = "") {
  return `
    <ytd-video-renderer id="${id}">
      <a id="video-title" href="/watch?v=${videoId}">Video</a>
      <div id="metadata-line">
        <span>1K views</span>
        <span aria-label="${dateText}">${dateText}</span>
      </div>
    </ytd-video-renderer>
  `;
}

function playlistCard(videoId, dateText, id = "", modern = false) {
  const metadata = modern
    ? `<span class="ytContentMetadataViewModelMetadataTextLastPart">${dateText}</span>`
    : `<div id="metadata-line"><span>1K views</span><span>${dateText}</span></div>`;
  return `
    <ytd-playlist-video-renderer id="${id}">
      <a id="video-title" href="/watch?v=${videoId}&list=PLAYLIST&index=1">Video</a>
      ${metadata}
    </ytd-playlist-video-renderer>
  `;
}

async function loadFixture(page, {
  body,
  cache = [],
  fastRequestTimeout = false,
  head = "",
  intersectImmediately = true,
  responses = {},
  url = `https://www.youtube.com/results?search_query=test`,
}) {
  await page.route("https://www.youtube.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head>${head}</head><body>${body}</body></html>`,
    });
  });
  await page.goto(url);

  await page.evaluate((configuration) => {
    Object.defineProperty(window, "onurlchange", {
      configurable: true,
      value: null,
      writable: true,
    });

    window.__gmCalls = {
      getValue: [],
      setValue: [],
      requests: [],
      activeRequests: 0,
      maxActiveRequests: 0,
    };
    window.__storedCache = configuration.cache;
    window.__responses = configuration.responses;
    window.__intersectionObservers = [];

    if (configuration.fastRequestTimeout) {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(
        callback,
        delay === 30000 ? 0 : delay,
        ...args,
      );
    }

    class TestIntersectionObserver {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.elements = new Set();
        window.__intersectionObservers.push(this);
      }

      observe(element) {
        this.elements.add(element);
        if (configuration.intersectImmediately) {
          queueMicrotask(() => {
            if (this.elements.has(element)) {
              this.callback([{ isIntersecting: true, target: element }], this);
            }
          });
        }
      }

      unobserve(element) {
        this.elements.delete(element);
      }

      disconnect() {
        this.elements.clear();
      }
    }

    window.IntersectionObserver = TestIntersectionObserver;
    window.__triggerAllIntersections = () => {
      for (const observer of window.__intersectionObservers) {
        const entries = [...observer.elements].map((target) => ({
          isIntersecting: true,
          target,
        }));
        if (entries.length) observer.callback(entries, observer);
      }
    };

    function responseBody(responseConfiguration) {
      if (typeof responseConfiguration.html === "string") {
        return responseConfiguration.html;
      }
      if (Array.isArray(responseConfiguration.feedEntries)) {
        const entries = responseConfiguration.feedEntries.map(({ videoId, timestamp }) => `
          <entry>
            <yt:videoId>${videoId}</yt:videoId>
            <published>${timestamp}</published>
          </entry>
        `).join("");
        return `<?xml version="1.0" encoding="UTF-8"?>
          <feed xmlns="http://www.w3.org/2005/Atom"
                xmlns:yt="http://www.youtube.com/xml/schemas/2015">
            ${entries}
          </feed>`;
      }
      const published = responseConfiguration.timestamp
        ? `<meta itemprop="datePublished" content="${responseConfiguration.timestamp}">`
        : "";
      const uploaded = responseConfiguration.uploadTimestamp
        ? `<meta itemprop="uploadDate" content="${responseConfiguration.uploadTimestamp}">`
        : "";
      return `<!doctype html><html><head>${published}${uploaded}</head></html>`;
    }

    function settleCall(call, type, value) {
      if (call.settled) return;
      call.settled = true;
      window.__gmCalls.activeRequests -= 1;
      if (type === "resolve") call.resolve(value);
      else call.reject(value);
    }

    window.GM = {
      async getValue(key, fallbackValue) {
        window.__gmCalls.getValue.push({ key, fallbackValue });
        return window.__storedCache;
      },

      async setValue(key, value) {
        window.__gmCalls.setValue.push({ key, value });
        window.__storedCache = value;
      },

      xmlHttpRequest(details) {
        const requestUrl = new URL(String(details.url));
        const isPlaylistFeed = requestUrl.pathname === "/feeds/videos.xml";
        const videoId = isPlaylistFeed ? null : requestUrl.searchParams.get("v");
        const playlistId = isPlaylistFeed
          ? requestUrl.searchParams.get("playlist_id")
          : null;
        const requestKey = isPlaylistFeed ? `playlist:${playlistId}` : videoId;
        const responseConfiguration = window.__responses[requestKey] ?? { status: 404 };
        const call = {
          aborted: false,
          details,
          isPlaylistFeed,
          playlistId,
          reject: null,
          requestKey,
          resolve: null,
          responseConfiguration,
          settled: false,
          videoId,
        };
        window.__gmCalls.requests.push(call);
        window.__gmCalls.activeRequests += 1;
        window.__gmCalls.maxActiveRequests = Math.max(
          window.__gmCalls.maxActiveRequests,
          window.__gmCalls.activeRequests,
        );

        const request = new Promise((resolve, reject) => {
          call.resolve = resolve;
          call.reject = reject;
        });
        request.abort = () => {
          call.aborted = true;
          settleCall(call, "reject", new DOMException("Aborted", "AbortError"));
        };

        call.resolveConfiguredResponse = () => {
          const responseBodyText = responseBody(responseConfiguration);
          settleCall(call, "resolve", {
            status: responseConfiguration.status ?? 200,
            response: responseBodyText,
            responseText: responseBodyText,
          });
        };

        if (!responseConfiguration.deferred) {
          queueMicrotask(() => {
            if (responseConfiguration.rejectMessage) {
              settleCall(call, "reject", new Error(responseConfiguration.rejectMessage));
            } else {
              call.resolveConfiguredResponse();
            }
          });
        }
        return request;
      },
    };

    window.__resolveRequest = (videoId) => {
      const call = window.__gmCalls.requests.find((candidate) => (
        candidate.videoId === videoId && !candidate.settled
      ));
      call?.resolveConfiguredResponse();
    };
  }, {
    cache,
    fastRequestTimeout,
    intersectImmediately,
    responses,
  });

  await page.addScriptTag({ path: SCRIPT_PATH });
}

async function formatInBrowser(page, timestamp) {
  return page.evaluate((value) => {
    const date = new Date(value);
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }, timestamp);
}

test("metadata and repository catalog expose the intended Tampermonkey integration", () => {
  expect(SCRIPT_SOURCE).toContain("// @version      0.1.2");
  expect(SCRIPT_SOURCE).toContain("// @match        https://www.youtube.com/*");
  expect(SCRIPT_SOURCE).toContain("// @run-at       document-start");
  expect(SCRIPT_SOURCE).toContain("// @sandbox      DOM");
  expect(SCRIPT_SOURCE).toContain("// @connect      www.youtube.com");
  expect(SCRIPT_SOURCE).toContain("// @noframes");
  expect(SCRIPT_SOURCE).toContain('window.addEventListener("urlchange"');
  expect(SCRIPT_SOURCE).not.toMatch(/\bGM_[A-Za-z0-9_]+\b/);
  expect(SCRIPT_SOURCE).not.toMatch(/^\s+(?:onload|onerror|ontimeout):/m);

  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../manifest.json"), "utf8"),
  );
  expect(manifest.scripts.find(({ id }) => id === "youtube-exact-dates")).toEqual({
    id: "youtube-exact-dates",
    name: "YouTube Exact Dates",
    description: "Replaces relative YouTube video dates with exact browser-local timestamps.",
    installUrl:
      "https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/youtube-exact-dates.user.js",
    sourceUrl:
      "https://github.com/caocaochan/userscripts/blob/main/scripts/youtube-exact-dates.user.js",
    tags: ["tampermonkey", "youtube", "dates", "timestamps"],
  });
});

test("watch pages prefer datePublished, format locally, and make no request", async ({ page }) => {
  const published = "2020-08-12T23:05:00-07:00";
  const uploaded = "2019-01-02T03:04:00Z";
  await loadFixture(page, {
    head: `
      <meta itemprop="identifier" content="${VIDEO_A}">
      <meta itemprop="datePublished" content="${published}">
      <meta itemprop="uploadDate" content="${uploaded}">
    `,
    body: `
      <ytd-watch-metadata>
        <yt-formatted-string id="info">
          <span aria-label="6 years ago" title="6 years ago">6 years ago</span>
        </yt-formatted-string>
      </ytd-watch-metadata>
    `,
    url: `https://www.youtube.com/watch?v=${VIDEO_A}`,
  });

  const expected = await formatInBrowser(page, published);
  const date = page.locator("ytd-watch-metadata #info > span");
  await expect(date).toHaveText(expected);
  await expect(date).toHaveAttribute("aria-label", expected);
  await expect(date).toHaveAttribute("title", expected);
  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(0);
  expect(await page.evaluate(() => window.__gmCalls.getValue)).toEqual([
    { key: CACHE_KEY, fallbackValue: [] },
  ]);
});

test("watch-page SPA navigation validates the video id and falls back to uploadDate", async ({ page }) => {
  const firstTimestamp = "2021-01-02T03:04:00Z";
  const secondTimestamp = "2022-05-06T07:08:00Z";
  await loadFixture(page, {
    head: `
      <meta itemprop="identifier" content="${VIDEO_A}">
      <meta itemprop="datePublished" content="${firstTimestamp}">
      <meta itemprop="uploadDate" content="2018-01-01T00:00:00Z">
    `,
    body: `
      <ytd-watch-metadata>
        <yt-formatted-string id="info"><span>4 years ago</span></yt-formatted-string>
      </ytd-watch-metadata>
    `,
    url: `https://www.youtube.com/watch?v=${VIDEO_A}`,
  });
  await expect(page.locator("#info > span")).toHaveText(
    await formatInBrowser(page, firstTimestamp),
  );

  await page.evaluate(({ videoId, timestamp }) => {
    history.pushState({}, "", `/watch?v=${videoId}`);
    document.querySelector('meta[itemprop="identifier"]').content = videoId;
    document.querySelector('meta[itemprop="datePublished"]').content = "not-a-date";
    document.querySelector('meta[itemprop="uploadDate"]').content = timestamp;
    document.querySelector("#info > span").textContent = "Premiered 2 years ago";
    window.dispatchEvent(new Event("urlchange"));
  }, { videoId: VIDEO_B, timestamp: secondTimestamp });

  await expect(page.locator("#info > span")).toHaveText(
    await formatInBrowser(page, secondTimestamp),
  );
  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(0);
});

test("modern and legacy cards use cache, deduplicate requests, and update attributes", async ({ page }) => {
  const fetchedTimestamp = "2023-03-04T05:06:00Z";
  const cachedTimestamp = "2017-08-09T10:11:00Z";
  await loadFixture(page, {
    body: `
      ${modernCard(VIDEO_A, "4mo ago", "modern-a")}
      ${modernCard(VIDEO_A, "4 months ago", "modern-a-duplicate")}
      ${legacyCard(VIDEO_B, "Streamed 6 years ago", "legacy-b")}
    `,
    cache: [[VIDEO_B, cachedTimestamp]],
    responses: {
      [VIDEO_A]: { timestamp: fetchedTimestamp },
    },
  });

  const fetchedExpected = await formatInBrowser(page, fetchedTimestamp);
  const cachedExpected = await formatInBrowser(page, cachedTimestamp);
  await expect(page.locator("#modern-a .ytContentMetadataViewModelMetadataTextLastPart"))
    .toHaveText(fetchedExpected);
  await expect(page.locator("#modern-a-duplicate .ytContentMetadataViewModelMetadataTextLastPart"))
    .toHaveText(fetchedExpected);
  await expect(page.locator("#legacy-b #metadata-line > span:last-child"))
    .toHaveText(cachedExpected);
  await expect(page.locator("#modern-a .ytContentMetadataViewModelMetadataTextLastPart"))
    .toHaveAttribute("aria-label", fetchedExpected);

  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
  expect(await page.evaluate(() => window.__gmCalls.requests[0].videoId)).toBe(VIDEO_A);
});

test("main playlist renderers support both legacy and view-model date markup", async ({ page }) => {
  const legacyTimestamp = "2026-08-03T12:00:05Z";
  const modernTimestamp = "2026-07-15T08:09:00Z";
  await loadFixture(page, {
    body: `
      ${playlistCard(VIDEO_A, "9 days ago", "playlist-legacy")}
      ${playlistCard(VIDEO_B, "4 weeks ago", "playlist-modern", true)}
    `,
    responses: {
      [`playlist:${PLAYLIST_ID}`]: {
        feedEntries: [
          { videoId: VIDEO_A, timestamp: legacyTimestamp },
          { videoId: VIDEO_B, timestamp: modernTimestamp },
        ],
      },
    },
    url: `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`,
  });

  await expect(page.locator("#playlist-legacy #metadata-line > span:last-child"))
    .toHaveText(await formatInBrowser(page, legacyTimestamp));
  await expect(page.locator("#playlist-modern span"))
    .toHaveText(await formatInBrowser(page, modernTimestamp));
  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
  expect(await page.evaluate(() => ({
    isPlaylistFeed: window.__gmCalls.requests[0].isPlaylistFeed,
    playlistId: window.__gmCalls.requests[0].playlistId,
  }))).toEqual({
    isPlaylistFeed: true,
    playlistId: PLAYLIST_ID,
  });
});

test("uncached dynamic cards wait for intersection and reused cards apply the new cached video", async ({ page }) => {
  const fetchedTimestamp = "2024-01-02T03:04:00Z";
  const reusedTimestamp = "2016-07-08T09:10:00Z";
  await loadFixture(page, {
    body: '<main id="feed" style="position: absolute; top: 5000px"></main>',
    cache: [[VIDEO_B, reusedTimestamp]],
    intersectImmediately: false,
    responses: {
      [VIDEO_A]: { timestamp: fetchedTimestamp },
    },
  });

  await page.locator("#feed").evaluate((feed, markup) => {
    feed.insertAdjacentHTML("beforeend", markup);
  }, modernCard(VIDEO_A, "13d ago", "dynamic-card"));
  await expect(page.locator("#dynamic-card span")).toHaveAttribute(
    "data-youtube-exact-date-video-id",
    VIDEO_A,
  );
  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(0);

  await page.evaluate(() => window.__triggerAllIntersections());
  await expect(page.locator("#dynamic-card span")).toHaveText(
    await formatInBrowser(page, fetchedTimestamp),
  );
  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);

  await page.locator("#dynamic-card").evaluate((card, videoId) => {
    card.querySelector("a").href = `/watch?v=${videoId}`;
    card.querySelector("span").textContent = "2y ago";
  }, VIDEO_B);
  await expect(page.locator("#dynamic-card span")).toHaveText(
    await formatInBrowser(page, reusedTimestamp),
  );
  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
});

test("comments, posts, non-video lockups, and malformed video links remain unchanged", async ({ page }) => {
  await loadFixture(page, {
    body: `
      <ytd-comment-thread-renderer>
        <span class="ytContentMetadataViewModelMetadataTextLastPart">6 years ago</span>
      </ytd-comment-thread-renderer>
      <ytd-backstage-post-renderer>
        <div id="metadata-line"><span>5 years ago</span></div>
      </ytd-backstage-post-renderer>
      <yt-lockup-view-model id="channel-lockup">
        <a href="/@channel">Channel</a>
        <span class="ytContentMetadataViewModelMetadataTextLastPart">4 years ago</span>
      </yt-lockup-view-model>
      ${modernCard("bad", "3 years ago", "bad-video")}
      ${modernCard(VIDEO_C, "LIVE", "not-relative")}
    `,
  });

  await page.waitForTimeout(50);
  await expect(page.locator("ytd-comment-thread-renderer span")).toHaveText("6 years ago");
  await expect(page.locator("ytd-backstage-post-renderer span")).toHaveText("5 years ago");
  await expect(page.locator("#channel-lockup span")).toHaveText("4 years ago");
  await expect(page.locator("#bad-video span")).toHaveText("3 years ago");
  await expect(page.locator("#not-relative span")).toHaveText("LIVE");
  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(0);
});

test("failed and malformed responses remain relative and are not retried", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await loadFixture(page, {
    body: `
      ${modernCard(VIDEO_A, "6 years ago", "http-failure")}
      ${modernCard(VIDEO_B, "7 years ago", "missing-date")}
    `,
    responses: {
      [VIDEO_A]: { status: 500 },
      [VIDEO_B]: { html: "<!doctype html><html><head></head></html>" },
    },
  });

  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(2);
  await page.locator("#http-failure span").evaluate((span) => {
    span.textContent = "8 years ago";
  });
  await page.locator("#missing-date span").evaluate((span) => {
    span.textContent = "9 years ago";
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => window.__triggerAllIntersections());
  await page.waitForTimeout(50);

  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(2);
  await expect(page.locator("#http-failure span")).toHaveText("8 years ago");
  await expect(page.locator("#missing-date span")).toHaveText("9 years ago");
  expect(pageErrors).toEqual([]);
});

test("watch-page fallback queue runs only one metadata request at a time", async ({ page }) => {
  const timestamp = "2020-01-02T03:04:00Z";
  await loadFixture(page, {
    body: `
      ${modernCard(VIDEO_A, "1y ago", "card-a")}
      ${modernCard(VIDEO_B, "2y ago", "card-b")}
      ${modernCard(VIDEO_C, "3y ago", "card-c")}
      ${modernCard(VIDEO_D, "4y ago", "card-d")}
    `,
    responses: {
      [VIDEO_A]: { deferred: true, timestamp },
      [VIDEO_B]: { deferred: true, timestamp },
      [VIDEO_C]: { deferred: true, timestamp },
      [VIDEO_D]: { deferred: true, timestamp },
    },
  });

  for (let requestCount = 1; requestCount <= 4; requestCount += 1) {
    await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length))
      .toBe(requestCount);
    expect(await page.evaluate(() => window.__gmCalls.maxActiveRequests)).toBe(1);
    const activeVideoId = await page.evaluate(() => (
      window.__gmCalls.requests.find(({ settled }) => !settled)?.videoId
    ));
    await page.evaluate((videoId) => window.__resolveRequest(videoId), activeVideoId);
  }

  const expected = await formatInBrowser(page, timestamp);
  await expect.poll(() => page.locator("yt-lockup-view-model span").allTextContents())
    .toEqual([expected, expected, expected, expected]);
  expect(await page.evaluate(() => window.__gmCalls.maxActiveRequests)).toBe(1);
});

test("timed-out requests abort once and do not create retry storms", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await loadFixture(page, {
    body: modernCard(VIDEO_A, "6 years ago", "timeout-card"),
    fastRequestTimeout: true,
    responses: {
      [VIDEO_A]: { deferred: true },
    },
  });

  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests[0]?.aborted)).toBe(true);
  await page.locator("#timeout-card span").evaluate((span) => {
    span.textContent = "7 years ago";
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => window.__triggerAllIntersections());
  await page.waitForTimeout(50);

  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
  await expect(page.locator("#timeout-card span")).toHaveText("7 years ago");
  expect(pageErrors).toEqual([]);
});

test("persistent cache is validated, bounded to 2000 entries, and saved after a burst", async ({ page }) => {
  const entries = Array.from({ length: 2000 }, (_, index) => [
    String(index).padStart(11, "0"),
    "2020-01-02T03:04:00.000Z",
  ]);
  const newVideoId = "NEWCACHE001";
  await loadFixture(page, {
    body: modernCard(newVideoId, "6 years ago", "new-cache-card"),
    cache: [["invalid", "bad"], ...entries],
    responses: {
      [newVideoId]: { timestamp: "2024-05-06T07:08:00Z" },
    },
  });

  await expect.poll(
    () => page.evaluate(() => window.__gmCalls.setValue.length),
    { timeout: 3000 },
  ).toBe(1);
  const saved = await page.evaluate(() => window.__gmCalls.setValue[0]);
  expect(saved.key).toBe(CACHE_KEY);
  expect(saved.value).toHaveLength(2000);
  expect(saved.value[0][0]).toBe("00000000001");
  expect(saved.value.at(-1)[0]).toBe(newVideoId);
});
