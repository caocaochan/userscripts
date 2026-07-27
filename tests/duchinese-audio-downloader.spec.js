const path = require("node:path");
const { test, expect } = require("playwright/test");

const SCRIPT_PATH = path.resolve(__dirname, "../scripts/duchinese-audio-downloader.user.js");
const BUTTON_SELECTOR = "#duchinese-audio-downloader-button";
const SLOT_CLASS = "duchinese-audio-downloader-slot";
const CREATED_SLOT_ATTRIBUTE = "data-duchinese-audio-downloader-created-slot";
const DEFAULT_AUDIO_URL = "https://static.duchinese.net/documents/1442/audio.mp3?1";

function playerMarkup(audioUrl = DEFAULT_AUDIO_URL, includeSiteSlot = true) {
  return `
    <div class="du-player-controls">
      <div data-control="speed"></div>
      <div class="du-player-button">
        <div id="du-player">
          <audio preload="none"><source src="${audioUrl}" type="audio/mpeg"></audio>
        </div>
      </div>
      ${includeSiteSlot ? '<div data-control="site-slot"></div>' : ""}
    </div>
  `;
}

async function mountScript(page, {
  url = "https://duchinese.net/lessons/1442-example",
  title = "Example Lesson",
  audioUrl = DEFAULT_AUDIO_URL,
  includeHeading = true,
  includeSiteSlot = true,
  downloadAvailable = true,
  downloadOutcome = "success",
  downloadError = null,
  requestOutcome = { kind: "audio" },
} = {}) {
  const html = `
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Fixture</title></head>
      <body>
        ${includeHeading ? `<header><h1>${title}</h1></header>` : ""}
        ${playerMarkup(audioUrl, includeSiteSlot)}
      </body>
    </html>
  `;

  await page.route(/https:\/\/(?:www\.)?(?:duchinese\.net|yomuyomu\.app)\/.*/, async (route) => {
    if (route.request().resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: html });
    } else {
      await route.abort();
    }
  });
  await page.goto(url);

  await page.evaluate((configuration) => {
    window.__gmCalls = {
      styles: [],
      downloads: [],
      requests: [],
      anchorDownloads: [],
    };
    window.__downloadOutcome = configuration.downloadOutcome;
    window.__downloadError = configuration.downloadError;
    window.__requestOutcome = configuration.requestOutcome;
    window.__pendingDownload = null;

    window.GM = {
      addStyle(css) {
        window.__gmCalls.styles.push(css);
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
        return style;
      },

      xmlHttpRequest(options) {
        window.__gmCalls.requests.push({
          method: options.method,
          url: options.url,
          responseType: options.responseType,
          timeout: options.timeout,
          accept: options.headers?.Accept,
        });

        const outcome = window.__requestOutcome;
        return new Promise((resolve, reject) => {
          queueMicrotask(() => {
            if (outcome.kind === "network-error") {
              reject({ error: "network_failed" });
              return;
            }

            let response;
            let responseHeaders = "";
            if (outcome.kind === "empty") {
              response = new Blob([], { type: "audio/mpeg" });
              responseHeaders = "Content-Type: audio/mpeg\r\n";
            } else if (outcome.kind === "html") {
              response = new Blob(["<html>Error</html>"], { type: "text/html" });
              responseHeaders = "Content-Type: text/html; charset=utf-8\r\n";
            } else if (outcome.kind === "octet-stream") {
              response = new Blob(["audio"], { type: "application/octet-stream" });
              responseHeaders = "Content-Type: application/octet-stream\r\n";
            } else if (outcome.kind === "missing-mime") {
              response = new Blob(["audio"]);
            } else {
              response = new Blob(["audio"], { type: "audio/mpeg" });
              responseHeaders = "Content-Type: audio/mpeg\r\n";
            }

            resolve({
              status: outcome.status || 200,
              response,
              responseHeaders,
            });
          });
        });
      },
    };

    if (configuration.downloadAvailable) {
      window.GM.download = (options) => {
        window.__gmCalls.downloads.push({
          url: options.url,
          name: options.name,
          saveAs: options.saveAs,
        });

        return new Promise((resolve, reject) => {
          if (window.__downloadOutcome === "pending") {
            window.__pendingDownload = { resolve, reject };
          } else if (window.__downloadOutcome === "error") {
            queueMicrotask(() => reject(window.__downloadError));
          } else {
            queueMicrotask(resolve);
          }
        });
      };
    }

    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() {
      if (this.download) {
        window.__gmCalls.anchorDownloads.push({
          download: this.download,
          href: this.href,
        });
        return;
      }
      originalAnchorClick.call(this);
    };
  }, { downloadAvailable, downloadOutcome, downloadError, requestOutcome });

  await page.addScriptTag({ path: SCRIPT_PATH });
  await expect(page.locator(BUTTON_SELECTOR)).toBeVisible();
}

async function clickAndGetDownload(page) {
  await page.locator(BUTTON_SELECTOR).click();
  await expect.poll(() => page.evaluate(() => window.__gmCalls.downloads.length)).toBe(1);
  return page.evaluate(() => window.__gmCalls.downloads[0]);
}

test("reuses the production site slot without adding a fourth flex child", async ({ page }) => {
  await mountScript(page);

  await expect.poll(() => page.evaluate(() => window.__gmCalls.styles.length)).toBe(1);
  await expect(page.locator("head style").evaluate((style) => style.textContent)).resolves.toContain(
    BUTTON_SELECTOR,
  );
  await expect(page.locator(".du-player-controls > div")).toHaveCount(3);
  await expect(page.locator('[data-control="site-slot"]')).toHaveClass(new RegExp(`\\b${SLOT_CLASS}\\b`));
  await expect(page.locator('[data-control="site-slot"] > ' + BUTTON_SELECTOR)).toHaveCount(1);

  await page.locator("#du-player source").evaluate(
    (source, nextUrl) => source.setAttribute("src", nextUrl),
    `${DEFAULT_AUDIO_URL}&refresh=1`,
  );
  await expect(page.locator(".du-player-controls > div")).toHaveCount(3);
  await expect(page.locator(BUTTON_SELECTOR)).toHaveCount(1);
});

test("creates and removes a fallback slot only when the site slot is absent", async ({ page }) => {
  await mountScript(page, { includeSiteSlot: false });

  await expect(page.locator(".du-player-controls > div")).toHaveCount(3);
  await expect(page.locator(`[${CREATED_SLOT_ATTRIBUTE}]`)).toHaveCount(1);

  await page.locator(".du-player-button").evaluate((element) => element.remove());
  await expect(page.locator(`[${CREATED_SLOT_ATTRIBUTE}]`)).toHaveCount(0);
  await expect(page.locator(BUTTON_SELECTOR)).toHaveCount(0);
});

test("removes its class but not a site-owned slot during cleanup", async ({ page }) => {
  await mountScript(page);

  await page.locator(".du-player-button").evaluate((element) => element.remove());
  await expect(page.locator(BUTTON_SELECTOR)).toHaveCount(0);
  await expect(page.locator('[data-control="site-slot"]')).toHaveCount(1);
  await expect(page.locator('[data-control="site-slot"]')).not.toHaveClass(new RegExp(`\\b${SLOT_CLASS}\\b`));
});

for (const [name, downloadError] of [
  ["lowercase user_canceled", { error: "user_canceled" }],
  ["generic canceled", { error: "CANCELED" }],
  ["string USER_CANCELED", "USER_CANCELED"],
  ["string details", { error: "not_succeeded", details: "user_canceled" }],
  ["browser interruption details", { error: "not_succeeded", details: { current: "USER_CANCELED" } }],
]) {
  test(`does not retry a ${name} download`, async ({ page }) => {
    await mountScript(page, {
      downloadOutcome: "error",
      downloadError,
    });

    await page.locator(BUTTON_SELECTOR).click();
    await expect(page.locator("#duchinese-audio-downloader-toast")).toHaveText("Download cancelled.");
    await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(0);
    await expect(page.locator(BUTTON_SELECTOR)).toBeEnabled();
  });
}

test("falls back once after an ordinary GM.download failure", async ({ page }) => {
  await mountScript(page, {
    downloadOutcome: "error",
    downloadError: { error: "not_whitelisted" },
  });

  await page.locator(BUTTON_SELECTOR).click();
  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.anchorDownloads.length)).toBe(1);
  await expect(page.evaluate(() => window.__gmCalls.requests[0])).resolves.toEqual({
    method: "GET",
    url: DEFAULT_AUDIO_URL,
    responseType: "blob",
    timeout: 60000,
    accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
  });
  await expect(page.locator(BUTTON_SELECTOR)).toBeEnabled();
});

test("falls back when GM.download is unavailable", async ({ page }) => {
  await mountScript(page, { downloadAvailable: false });

  await page.locator(BUTTON_SELECTOR).click();
  await expect.poll(() => page.evaluate(() => window.__gmCalls.downloads.length)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.anchorDownloads.length)).toBe(1);
  await expect(page.locator(BUTTON_SELECTOR)).toBeEnabled();
});

for (const [chapter, expectedSuffix] of [
  ["1", "Chapter 01"],
  ["2", "Chapter 02"],
  ["12", "Chapter 12"],
]) {
  test(`adds ${expectedSuffix} to a course filename`, async ({ page }) => {
    await mountScript(page, {
      url: `https://duchinese.net/lessons/courses/38-example?chapter=${chapter}`,
      title: "Course Title",
    });

    const download = await clickAndGetDownload(page);
    expect(download.name).toBe(`Course Title - ${expectedSuffix}.mp3`);
  });
}

test("retains a title-only filename for standalone lessons", async ({ page }) => {
  await mountScript(page, { title: "Standalone Lesson" });

  const download = await clickAndGetDownload(page);
  expect(download.name).toBe("Standalone Lesson.mp3");
});

test("uses the route lesson ID when the heading is absent", async ({ page }) => {
  await mountScript(page, {
    url: "https://duchinese.net/lessons/0099-example",
    includeHeading: false,
  });

  const download = await clickAndGetDownload(page);
  expect(download.name).toBe("Du Chinese Lesson 0099.mp3");
});

test("uses the audio document ID on canonical course routes without a heading", async ({ page }) => {
  await mountScript(page, {
    url: "https://yomuyomu.app/lessons/courses/1-example?chapter=1",
    audioUrl: "https://static.yomuyomu.app/documents/7/audio.mp3?1",
    includeHeading: false,
  });

  const download = await clickAndGetDownload(page);
  expect(download.name).toBe("Yomu Yomu Lesson 7 - Chapter 01.mp3");
});

test("sanitizes Windows reserved filenames", async ({ page }) => {
  await mountScript(page, { title: "CON" });

  const download = await clickAndGetDownload(page);
  expect(download.name).toBe("_CON.mp3");
});

test("preserves a chapter suffix when truncating a long title", async ({ page }) => {
  await mountScript(page, {
    url: "https://duchinese.net/lessons/courses/38-example?chapter=2",
    title: "故".repeat(200),
  });

  const download = await clickAndGetDownload(page);
  expect(download.name).toHaveLength(164);
  expect(download.name).toMatch(/ - Chapter 02\.mp3$/);
});

test("moves busy state to a replacement player during navigation", async ({ page }) => {
  await mountScript(page, { downloadOutcome: "pending" });

  await page.locator(BUTTON_SELECTOR).click();
  await expect(page.locator(BUTTON_SELECTOR)).toBeDisabled();

  await page.locator(".du-player-controls").evaluate((element) => {
    element.remove();
    document.body.insertAdjacentHTML("beforeend", `
      <div class="du-player-controls" data-replacement="true">
        <div data-control="speed"></div>
        <div class="du-player-button">
          <div id="du-player">
            <audio preload="none">
              <source src="https://static.duchinese.net/documents/1443/audio.mp3" type="audio/mpeg">
            </audio>
          </div>
        </div>
        <div data-control="site-slot"></div>
      </div>
    `);
  });

  await expect(page.locator('[data-replacement="true"] ' + BUTTON_SELECTOR)).toBeDisabled();
  await expect(page.locator(BUTTON_SELECTOR)).toHaveCount(1);

  await page.evaluate(() => window.__pendingDownload.resolve());
  await expect(page.locator('[data-replacement="true"] ' + BUTTON_SELECTOR)).toBeEnabled();
});

test("cleans an orphaned site slot when moving to a replacement player", async ({ page }) => {
  await mountScript(page);

  await page.locator(".du-player-controls").evaluate((controls) => {
    controls.querySelector(".du-player-button").remove();
    controls.querySelector('[data-control="site-slot"]').dataset.orphaned = "true";
    document.body.insertAdjacentHTML("beforeend", `
      <div class="du-player-controls" data-replacement="true">
        <div data-control="speed"></div>
        <div class="du-player-button">
          <div id="du-player">
            <audio preload="none">
              <source src="https://static.duchinese.net/documents/1443/audio.mp3" type="audio/mpeg">
            </audio>
          </div>
        </div>
        <div data-control="site-slot"></div>
      </div>
    `);
  });

  await expect(page.locator('[data-replacement="true"] ' + BUTTON_SELECTOR)).toHaveCount(1);
  await expect(page.locator('[data-orphaned="true"]')).not.toHaveClass(new RegExp(`\\b${SLOT_CLASS}\\b`));
});

for (const [kind, expectedMessage] of [
  ["empty", "Audio request returned an empty file."],
  ["html", "Audio request returned unsupported content type: text/html; charset=utf-8."],
]) {
  test(`rejects a ${kind} GM.xmlHttpRequest fallback response`, async ({ page }) => {
    await mountScript(page, {
      downloadOutcome: "error",
      downloadError: { error: "not_whitelisted" },
      requestOutcome: { kind },
    });

    await page.locator(BUTTON_SELECTOR).click();
    await expect(page.locator("#duchinese-audio-downloader-toast")).toHaveText(expectedMessage);
    await expect.poll(() => page.evaluate(() => window.__gmCalls.anchorDownloads.length)).toBe(0);
  });
}

test("accepts application/octet-stream fallback responses", async ({ page }) => {
  await mountScript(page, {
    downloadOutcome: "error",
    downloadError: { error: "not_whitelisted" },
    requestOutcome: { kind: "octet-stream" },
  });

  await page.locator(BUTTON_SELECTOR).click();
  await expect.poll(() => page.evaluate(() => window.__gmCalls.anchorDownloads.length)).toBe(1);
});

test("handles a rejected GM.xmlHttpRequest Promise", async ({ page }) => {
  await mountScript(page, {
    downloadOutcome: "error",
    downloadError: { error: "not_whitelisted" },
    requestOutcome: { kind: "network-error" },
  });

  await page.locator(BUTTON_SELECTOR).click();
  await expect(page.locator("#duchinese-audio-downloader-toast")).toHaveText(
    "Audio download failed. See the console for details.",
  );
  await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.anchorDownloads.length)).toBe(0);
  await expect(page.locator(BUTTON_SELECTOR)).toBeEnabled();
});

test("accepts fallback responses without a MIME type", async ({ page }) => {
  await mountScript(page, {
    downloadOutcome: "error",
    downloadError: { error: "not_whitelisted" },
    requestOutcome: { kind: "missing-mime" },
  });

  await page.locator(BUTTON_SELECTOR).click();
  await expect.poll(() => page.evaluate(() => window.__gmCalls.anchorDownloads.length)).toBe(1);
});

for (const audioUrl of [
  "https://duchinese.net/audio.mp3",
  "https://static.duchinese.net/audio.mp3",
  "https://yomuyomu.app/audio.mp3",
  "https://static.yomuyomu.app/audio.mp3",
]) {
  test(`accepts supported audio host ${new URL(audioUrl).hostname}`, async ({ page }) => {
    await mountScript(page, { audioUrl });

    await clickAndGetDownload(page);
    await expect.poll(() => page.evaluate(() => window.__gmCalls.requests.length)).toBe(0);
  });
}
