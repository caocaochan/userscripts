const fs = require("node:fs");
const { test, expect } = require("playwright/test");
const { SCRIPT, STYLE, GM_STUB, scannerCode, scanCaption } = require("./fixtures/iqiyi-yomitan");

const CAPTION = ".caption-main";
const TEXT = "方外山灵";

async function mount(page, { enabled = true, legacy = false, hostname = "www.iqiyi.com" } = {}) {
  await page.route(`https://${hostname}/**`, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><meta charset="utf-8">
      <style>
        body { margin: 24px; }
        #videoContent { position: relative; width: 720px; height: 400px; user-select: none; }
        #video-surface { position: absolute; inset: 0; background: #18212a; }
        #pcaSubtitleContainer, .iqp-subtitle-cont { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
        .iqp-caption-stage { position: relative; width: 100%; height: 100%; }
        .caption-box { position: absolute; left: 5%; bottom: 80px; width: 90%; display: flex; flex-direction: column; align-items: center; padding: 6px 0; }
        .caption { position: relative; font: 28px/1.4 sans-serif; white-space: pre-wrap; color: white; text-shadow: 1px 1px 3px black; }
        .caption, .caption * { user-select: none; pointer-events: none; }
        #native-control { position: absolute; bottom: 12px; right: 12px; z-index: 2; }
        #unrelated { user-select: none; pointer-events: none; }
      </style>
      <div id="videoContent">
        <div id="video-surface"></div>
        <div ${legacy ? 'class="iqp-subtitle-cont"' : 'id="pcaSubtitleContainer"'}>
          <div class="iqp-caption-stage"><div class="caption-box">
            <div class="caption caption-main"><span>方外</span><span>山灵</span></div>
            <div class="caption caption-secondary">Subtitle second line</div>
          </div></div>
        </div>
        <button id="native-control">Native control</button>
      </div>
      <div id="unrelated" class="caption">无关文字</div>`,
  }));
  await page.addInitScript({ content: GM_STUB + (enabled ? fs.readFileSync(SCRIPT, "utf8") : "") });
  await page.goto(`https://${hostname}/v_fixture.html`);
  await page.addScriptTag({ content: scannerCode });
  await page.evaluate(() => {
    window.events = { videoClicks: 0, controlClicks: 0, mouseMoves: 0 };
    document.querySelector("#video-surface").addEventListener("click", () => ++window.events.videoClicks);
    document.querySelector("#native-control").addEventListener("click", () => ++window.events.controlClicks);
    document.addEventListener("mousemove", () => ++window.events.mouseMoves);
  });
  if (enabled) await expect(page.locator(STYLE)).toHaveCount(1);
}

async function appearance(page) {
  return page.locator(CAPTION).evaluate((caption) => {
    const rect = caption.getBoundingClientRect();
    const css = getComputedStyle(caption);
    return { html: caption.outerHTML, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      font: css.font, color: css.color, shadow: css.textShadow };
  });
}

test("native captions become scannable across spans without changing their appearance", async ({ page }) => {
  await mount(page, { enabled: false });
  const before = await appearance(page);
  expect((await scanCaption(page, CAPTION)).target).toBe(false);
  await page.addScriptTag({ path: SCRIPT });
  await expect(page.locator(STYLE)).toHaveCount(1);
  expect(await scanCaption(page, CAPTION)).toMatchObject({ target: true, offset: 0, scanned: TEXT });
  expect(await appearance(page)).toEqual(before);
  await expect(page.locator("#unrelated")).toHaveCSS("pointer-events", "none");
  await expect(page.locator("#unrelated")).toHaveCSS("user-select", "none");
});

test("supports drag selection and document scanning events while native controls remain reachable", async ({ page }) => {
  await mount(page);
  const points = await page.locator(CAPTION).evaluate((caption) => {
    const range = document.createRange();
    range.selectNodeContents(caption);
    const rects = [...range.getClientRects()];
    return { start: { x: rects[0].left + 1, y: rects[0].top + rects[0].height / 2 },
      end: { x: rects.at(-1).right - 1, y: rects.at(-1).top + rects.at(-1).height / 2 } };
  });
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString())).toBe(TEXT);
  expect(await page.evaluate(() => window.events.videoClicks)).toBe(0);
  expect(await page.evaluate(() => window.events.mouseMoves)).toBeGreaterThan(0);
  await expect(page.locator("#pcaSubtitleContainer")).toHaveCSS("pointer-events", "none");
  await page.locator("#video-surface").click({ position: { x: 20, y: 20 } });
  await page.locator("#native-control").click();
  expect(await page.evaluate(() => window.events)).toMatchObject({ videoClicks: 1, controlClicks: 1 });
});

test("follows cue changes, multiple lines and complete player replacement without reinjection", async ({ page }) => {
  await mount(page);
  await page.locator(CAPTION).evaluate((caption) => { caption.textContent = "新的字幕\n第二行文字"; });
  expect(await scanCaption(page, CAPTION)).toMatchObject({ target: true, scanned: "新的字幕" });
  expect(await scanCaption(page, CAPTION, 5, 5)).toMatchObject({ target: true, offset: 5, scanned: "第二行文字" });
  expect(await scanCaption(page, ".caption-secondary", 8)).toMatchObject({ target: true, scanned: "Subtitle" });
  await page.evaluate(() => {
    history.pushState({}, "", "/v_next.html");
    const container = document.querySelector("#pcaSubtitleContainer");
    const replacement = container.cloneNode(true);
    replacement.querySelector(".caption-main").innerHTML = "<b>下一</b><span>集了</span>";
    container.replaceWith(replacement);
  });
  expect(await scanCaption(page, CAPTION)).toMatchObject({ target: true, scanned: "下一集了" });
  await page.addScriptTag({ path: SCRIPT });
  await expect(page.locator(STYLE)).toHaveCount(1);
});

test("also enables captions inside the legacy container on the bare hostname", async ({ page }) => {
  await mount(page, { legacy: true, hostname: "iqiyi.com" });
  expect(await scanCaption(page, CAPTION)).toMatchObject({ target: true, offset: 0, scanned: TEXT });
  await expect(page.locator(".iqp-subtitle-cont")).toHaveCSS("pointer-events", "none");
});
