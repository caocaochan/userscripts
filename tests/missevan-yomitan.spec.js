const fs = require("node:fs");
const { test, expect } = require("playwright/test");
const { SCRIPT, STYLE, GM_STUB, scannerCode, scanLine } = require("./fixtures/missevan-yomitan");

const LINE = "#subtitle";

async function mount(page, { enabled = true } = {}) {
  await page.route("https://www.missevan.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><meta charset="utf-8">
      <style>
        .web-sound { position: relative; width: 1000px; height: 535px; background: #18212a; user-select: none; }
        .subtitle-container { position: absolute; inset: 0 30px; z-index: 20; }
        .subtitle-container > span { position: absolute; bottom: 60px; left: 40px; font: 28px sans-serif; color: white; pointer-events: none; }
      </style>
      <div class="web-sound"><div class="subtitle-container">
        <span id="subtitle"><b>沈抱山</b>：好，马上看</span>
      </div></div>`,
  }));
  await page.addInitScript({ content: GM_STUB + (enabled ? fs.readFileSync(SCRIPT, "utf8") : "") });
  await page.goto("https://www.missevan.com/sound/player?id=1");
  await page.addScriptTag({ content: scannerCode });
  if (enabled) await expect(page.locator(STYLE)).toHaveCount(1);
}

test("native subtitles become scannable across elements without changing their appearance", async ({ page }) => {
  await mount(page, { enabled: false });
  const box = () => page.locator(LINE).boundingBox();
  const before = await box();
  expect((await scanLine(page, LINE)).target).toBe(false);
  await page.addScriptTag({ path: SCRIPT });
  await expect(page.locator(STYLE)).toHaveCount(1);
  expect(await scanLine(page, LINE)).toMatchObject({ target: true, offset: 0, scanned: "沈抱山：" });
  expect(await box()).toEqual(before);
});

test("follows replaced subtitle lines without reinjection", async ({ page }) => {
  await mount(page);
  await page.locator(".subtitle-container").evaluate((container) => {
    container.innerHTML = '<span id="subtitle">李迟舒你好</span>';
  });
  expect(await scanLine(page, LINE)).toMatchObject({ target: true, offset: 0, scanned: "李迟舒你" });
  await page.addScriptTag({ path: SCRIPT });
  await expect(page.locator(STYLE)).toHaveCount(1);
});
