const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../scripts/anilist-english-titles.user.js",
);
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

function titleResponse(entries) {
  return {
    status: 200,
    response: {
      data: {
        MediaListCollection: {
          lists: [
            {
              entries: entries.map(({ mediaId, english = null, romaji = null }) => ({
                mediaId,
                media: {
                  title: { english, romaji },
                },
              })),
            },
          ],
        },
      },
    },
  };
}

async function loadFixture(page, {
  body,
  responses,
  url = "https://anilist.co/user/TestUser/animelist",
  manualTimeout = false,
}) {
  await page.route("https://anilist.co/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head></head><body>${body}</body></html>`,
    });
  });
  await page.goto(url);
  await page.evaluate(({ queuedResponses, useManualTimeout }) => {
    Object.defineProperty(window, "onurlchange", {
      value: null,
      writable: true,
      configurable: true,
    });

    window.__gmCalls = {
      requests: [],
      styles: [],
    };
    window.__queuedResponses = queuedResponses;

    if (useManualTimeout) {
      window.__timeoutControllers = [];
      Object.defineProperty(AbortSignal, "timeout", {
        configurable: true,
        value() {
          const controller = new AbortController();
          window.__timeoutControllers.push(controller);
          return controller.signal;
        },
      });
    }

    window.GM = {
      addStyle(css) {
        window.__gmCalls.styles.push(css);
        const style = document.createElement("style");
        style.textContent = css;
        (document.head ?? document.documentElement).append(style);
        return style;
      },
      xmlHttpRequest(details) {
        const queued = window.__queuedResponses.shift() ?? {
          status: 500,
          response: null,
        };
        const call = {
          details,
          queued,
          aborted: false,
          settled: false,
          resolve: null,
          reject: null,
        };
        window.__gmCalls.requests.push(call);

        const request = new Promise((resolve, reject) => {
          call.resolve = (response) => {
            if (call.settled) return;
            call.settled = true;
            resolve(response);
          };
          call.reject = (error) => {
            if (call.settled) return;
            call.settled = true;
            reject(error);
          };
        });
        request.abort = () => {
          call.aborted = true;
          if (!queued.ignoreAbort) {
            call.reject(new DOMException("The operation was aborted.", "AbortError"));
          }
        };

        if (!queued.deferred) {
          queueMicrotask(() => {
            if (queued.rejectMessage) {
              call.reject(new Error(queued.rejectMessage));
            } else {
              call.resolve(queued);
            }
          });
        }
        return request;
      },
    };

    window.__resolveRequest = (index, response) => {
      window.__gmCalls.requests[index].resolve(response);
    };
    window.__rejectRequest = (index, message) => {
      window.__gmCalls.requests[index].reject(new Error(message));
    };
  }, {
    queuedResponses: responses,
    useManualTimeout: manualTimeout,
  });

  await page.addScriptTag({ path: SCRIPT_PATH });
}

test("metadata and manifest expose the intended modern Tampermonkey integration", () => {
  expect(SCRIPT_SOURCE).toContain("// @version      0.1.0");
  expect(SCRIPT_SOURCE).toContain("// @match        https://anilist.co/user/*/animelist*");
  expect(SCRIPT_SOURCE).toContain("// @tag          anime");
  expect(SCRIPT_SOURCE).toContain("// @tag          enhancement");
  expect(SCRIPT_SOURCE).toContain("// @run-at       document-start");
  expect(SCRIPT_SOURCE).toContain("// @sandbox      DOM");
  expect(SCRIPT_SOURCE).toContain("// @connect      graphql.anilist.co");
  expect(SCRIPT_SOURCE).toContain("// @noframes");
  expect(SCRIPT_SOURCE).not.toMatch(/\bGM_[A-Za-z0-9_]+\b/);
  expect(SCRIPT_SOURCE).not.toMatch(/^\s+(?:onload|onerror|ontimeout):/m);

  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../manifest.json"), "utf8"),
  );
  expect(manifest.scripts.find(({ id }) => id === "anilist-english-titles")).toEqual({
    id: "anilist-english-titles",
    name: "English Titles for AniList",
    description: "Adds English titles beneath anime titles on AniList user lists, with romaji fallback.",
    installUrl:
      "https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/anilist-english-titles.user.js",
    sourceUrl:
      "https://github.com/caocaochan/userscripts/blob/main/scripts/anilist-english-titles.user.js",
    tags: ["tampermonkey", "anilist", "anime", "titles", "english", "romaji"],
  });
});

test("uses the modern request options and decorates table, compact, and card titles", async ({ page }) => {
  await loadFixture(page, {
    body: `
      <div class="medialist table">
        <div class="list-entries">
          <div class="entry row"><div class="title"><a href="/anime/1/native">日本語一</a></div></div>
          <div class="entry row"><div class="title"><a href="/anime/3/same"> Same   Title </a></div></div>
          <div class="entry row"><div class="title"><a href="/manga/5/wrong">Manga</a></div></div>
        </div>
      </div>
      <div class="medialist table compact">
        <div class="list-entries">
          <div class="entry row"><div class="title"><a href="/anime/2/native">日本語二</a></div></div>
          <div class="entry row"><div class="title"><a href="/anime/4/missing">日本語四</a></div></div>
        </div>
      </div>
      <div class="medialist cards">
        <div class="list-entries">
          <div class="entry-card row">
            <div class="title"><a href="/anime/5/hunter">HUNTER×HUNTER</a></div>
          </div>
        </div>
      </div>
    `,
    responses: [
      titleResponse([
        { mediaId: 1, english: "English One", romaji: "Romaji One" },
        { mediaId: 2, romaji: "Romaji Two" },
        { mediaId: 3, english: "same title" },
        { mediaId: 4 },
        { mediaId: 5, english: "Hunter x Hunter" },
      ]),
    ],
  });

  await expect.poll(
    () => page.locator(".anilist-english-titles-secondary").allTextContents(),
  ).toEqual(["English One", "Romaji Two", "Hunter x Hunter"]);
  await expect(page.locator('a[href="/anime/3/same"] .anilist-english-titles-secondary'))
    .toHaveCount(0);
  await expect(page.locator('a[href="/anime/4/missing"] .anilist-english-titles-secondary'))
    .toHaveCount(0);
  await expect(page.locator('a[href="/manga/5/wrong"] .anilist-english-titles-secondary'))
    .toHaveCount(0);

  const request = await page.evaluate(() => {
    const details = window.__gmCalls.requests[0].details;
    return {
      method: details.method,
      url: String(details.url),
      headers: details.headers,
      body: JSON.parse(details.data),
      responseType: details.responseType,
      anonymous: details.anonymous,
      fetch: details.fetch,
      redirect: details.redirect,
      callbackKeys: ["onload", "onerror", "ontimeout"].filter((key) => key in details),
    };
  });
  expect(request).toMatchObject({
    method: "POST",
    url: "https://graphql.anilist.co/",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    responseType: "json",
    anonymous: true,
    fetch: true,
    redirect: "error",
    callbackKeys: [],
  });
  expect(request.body.variables).toEqual({ userName: "TestUser" });
  expect(request.body.query).toContain("MediaListCollection");
  expect(request.body.query).not.toContain("mutation");
  expect(request.headers.Authorization).toBeUndefined();

  const styles = await page.locator('a[href="/anime/1/native"]').evaluate((anchor) => {
    const secondary = anchor.querySelector(".anilist-english-titles-secondary");
    const anchorStyle = getComputedStyle(anchor);
    const secondaryStyle = getComputedStyle(secondary);
    return {
      anchorDisplay: anchorStyle.display,
      flexDirection: anchorStyle.flexDirection,
      anchorFontSize: Number.parseFloat(anchorStyle.fontSize),
      secondaryFontSize: Number.parseFloat(secondaryStyle.fontSize),
      secondaryOpacity: secondaryStyle.opacity,
      secondaryParentIsAnchor: secondary.parentElement === anchor,
    };
  });
  expect(styles.anchorDisplay).toBe("inline-flex");
  expect(styles.flexDirection).toBe("column");
  expect(styles.secondaryFontSize).toBeLessThan(styles.anchorFontSize);
  expect(styles.secondaryOpacity).toBe("0.68");
  expect(styles.secondaryParentIsAnchor).toBe(true);
});

test("decorates dynamic entries and remains idempotent after list replacement", async ({ page }) => {
  await loadFixture(page, {
    body: `
      <div class="medialist table">
        <div class="list-entries">
          <div class="entry"><div class="title"><a href="/anime/10/first">最初</a></div></div>
        </div>
      </div>
    `,
    responses: [
      titleResponse([
        { mediaId: 10, english: "First" },
        { mediaId: 11, english: "Second" },
      ]),
    ],
  });

  await expect(page.locator(".anilist-english-titles-secondary")).toHaveText("First");
  await page.locator(".list-entries").evaluate((list) => {
    list.insertAdjacentHTML(
      "beforeend",
      '<div class="entry"><div class="title"><a href="/anime/11/second">次</a></div></div>',
    );
  });
  await expect(page.locator('a[href="/anime/11/second"] .anilist-english-titles-secondary'))
    .toHaveText("Second");

  await page.locator(".list-entries").evaluate((list) => {
    list.innerHTML =
      '<div class="entry-card"><div class="title">'
      + '<a href="/anime/11/second">次</a></div></div>';
  });
  await expect(page.locator('a[href="/anime/11/second"] .anilist-english-titles-secondary'))
    .toHaveText("Second");

  await page.locator(".list-entries").evaluate((list) => {
    const unrelated = document.createElement("div");
    unrelated.textContent = "unrelated";
    list.append(unrelated);
  });
  await page.waitForTimeout(50);
  await expect(page.locator('a[href="/anime/11/second"] .anilist-english-titles-secondary'))
    .toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
});

test("same-user SPA sections reuse the request and cached users are reused after navigation", async ({
  page,
}) => {
  await loadFixture(page, {
    body: `
      <div class="medialist table"><div class="list-entries">
        <div class="title"><a href="/anime/20/a">甲</a></div>
      </div></div>
    `,
    responses: [
      titleResponse([{ mediaId: 20, english: "User A" }]),
      titleResponse([{ mediaId: 21, english: "User B" }]),
    ],
    url: "https://anilist.co/user/UserA/animelist",
  });
  await expect(page.locator(".anilist-english-titles-secondary")).toHaveText("User A");

  await page.evaluate(() => {
    history.pushState({}, "", "/user/UserA/animelist/Watching");
    window.dispatchEvent(new Event("urlchange"));
  });
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);

  await page.evaluate(() => {
    document.querySelector(".list-entries").innerHTML =
      '<div class="title"><a href="/anime/21/b">乙</a></div>';
    history.pushState({}, "", "/user/UserB/animelist");
    window.dispatchEvent(new Event("urlchange"));
  });
  await expect(page.locator(".anilist-english-titles-secondary")).toHaveText("User B");

  await page.evaluate(() => {
    document.querySelector(".list-entries").innerHTML =
      '<div class="title"><a href="/anime/20/a">甲</a></div>';
    history.pushState({}, "", "/user/UserA/animelist/Completed");
    window.dispatchEvent(new Event("urlchange"));
  });
  await expect(page.locator(".anilist-english-titles-secondary")).toHaveText("User A");
  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(2);
});

test("aborts old-user requests and ignores a stale completion", async ({ page }) => {
  await loadFixture(page, {
    body: `
      <div class="medialist table"><div class="list-entries">
        <div class="title"><a href="/anime/30/shared">旧</a></div>
      </div></div>
    `,
    responses: [
      { deferred: true, ignoreAbort: true },
      titleResponse([{ mediaId: 30, english: "New User Title" }]),
    ],
    url: "https://anilist.co/user/OldUser/animelist",
  });
  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);

  await page.evaluate(() => {
    document.querySelector(".list-entries").innerHTML =
      '<div class="title"><a href="/anime/30/shared">新</a></div>';
    history.pushState({}, "", "/user/NewUser/animelist");
    window.dispatchEvent(new Event("urlchange"));
  });
  await expect(page.locator(".anilist-english-titles-secondary")).toHaveText("New User Title");
  expect(await page.evaluate(() => window.__gmCalls.requests[0].aborted)).toBe(true);

  await page.evaluate((response) => window.__resolveRequest(0, response), titleResponse([
    { mediaId: 30, english: "Stale Old Title" },
  ]));
  await page.waitForTimeout(50);
  await expect(page.locator(".anilist-english-titles-secondary")).toHaveText("New User Title");
});

for (const [label, response] of [
  ["HTTP failure", { status: 500, response: null }],
  ["GraphQL failure", {
    status: 200,
    response: { errors: [{ message: "Query failed" }], data: null },
  }],
  ["malformed response", { status: 200, response: { data: {} } }],
  ["rejected request", { rejectMessage: "Network failed" }],
]) {
  test(`${label} leaves the list unchanged and is not retried by mutations`, async ({ page }) => {
    const warnings = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await loadFixture(page, {
      body: `
        <div class="medialist table"><div class="list-entries">
          <div class="title"><a href="/anime/40/failure">失敗</a></div>
        </div></div>
      `,
      responses: [response],
    });

    await expect.poll(() => warnings.length).toBe(1);
    await page.locator(".list-entries").evaluate((list) => {
      list.insertAdjacentHTML(
        "beforeend",
        '<div class="title"><a href="/anime/41/new">新規</a></div>',
      );
    });
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
    await expect(page.locator(".anilist-english-titles-secondary")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
}

test("timeout aborts the request once and does not retry", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });

  await loadFixture(page, {
    body: `
      <div class="medialist table"><div class="list-entries">
        <div class="title"><a href="/anime/50/timeout">時間切れ</a></div>
      </div></div>
    `,
    responses: [{ deferred: true }],
    manualTimeout: true,
  });
  await expect.poll(() => page.evaluate(() => window.__timeoutControllers.length)).toBe(1);
  await page.evaluate(() => window.__timeoutControllers[0].abort());

  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests[0].aborted)).toBe(true);
  await expect.poll(() => warnings).toEqual([
    expect.stringContaining("The title request timed out."),
  ]);
  await page.locator(".list-entries").evaluate((list) => {
    list.append(document.createElement("div"));
  });
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
});

test("leaving an anime-list route removes decorations and stops observation", async ({ page }) => {
  await loadFixture(page, {
    body: `
      <div class="medialist table"><div class="list-entries">
        <div class="title"><a href="/anime/60/cleanup">掃除</a></div>
      </div></div>
    `,
    responses: [titleResponse([{ mediaId: 60, english: "Cleanup" }])],
  });
  await expect(page.locator(".anilist-english-titles-secondary")).toHaveText("Cleanup");

  await page.evaluate(() => {
    history.pushState({}, "", "/home");
    window.dispatchEvent(new Event("urlchange"));
  });
  await expect(page.locator(".anilist-english-titles-secondary")).toHaveCount(0);
  await expect(page.locator(".anilist-english-titles-link")).toHaveCount(0);

  await page.locator(".list-entries").evaluate((list) => {
    list.insertAdjacentHTML(
      "beforeend",
      '<div class="title"><a href="/anime/60/cleanup">掃除</a></div>',
    );
  });
  await page.waitForTimeout(50);
  await expect(page.locator(".anilist-english-titles-secondary")).toHaveCount(0);
});
