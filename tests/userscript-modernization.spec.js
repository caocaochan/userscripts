const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

const SCRIPTS_DIR = path.resolve(__dirname, "../scripts");
const SCRIPT_CONFIG = {
  "gagaoolala-subtitle-downloader.user.js": {
    grants: [
      "GM.addStyle",
      "GM.download",
      "GM.xmlHttpRequest",
      "GM.registerMenuCommand",
      "window.onurlchange",
    ],
    spa: true,
  },
  "iqiyi-subtitle-downloader.user.js": {
    grants: [
      "GM.addStyle",
      "GM.download",
      "GM.xmlHttpRequest",
      "GM.registerMenuCommand",
      "window.onurlchange",
    ],
    spa: true,
  },
  "missevan-subtitle-styler.user.js": {
    grants: [
      "GM.addStyle",
      "GM.getValue",
      "GM.setValue",
      "GM.registerMenuCommand",
      "window.onurlchange",
    ],
    spa: true,
  },
  "nyaa-group-hider.user.js": {
    grants: [
      "GM.addStyle",
      "GM.getValues",
      "GM.setValue",
      "GM.registerMenuCommand",
    ],
    spa: false,
  },
  "plex-open-in-mpv.user.js": {
    grants: [
      "GM.addStyle",
      "window.onurlchange",
    ],
    spa: true,
  },
  "yatsu-simplified-chinese.user.js": {
    grants: [
      "GM.addStyle",
      "GM.getValue",
      "GM.setValue",
      "GM.registerMenuCommand",
      "window.onurlchange",
    ],
    spa: true,
  },
};

function scriptPath(filename) {
  return path.join(SCRIPTS_DIR, filename);
}

function readScript(filename) {
  return fs.readFileSync(scriptPath(filename), "utf8");
}

function metadataGrants(source) {
  return [...source.matchAll(/^\/\/ @grant\s+(.+)$/gm)].map((match) => match[1].trim());
}

test("all in-scope scripts use their exact modern Tampermonkey grants", () => {
  for (const [filename, configuration] of Object.entries(SCRIPT_CONFIG)) {
    const source = readScript(filename);
    expect(source, filename).not.toMatch(/\bGM_[A-Za-z0-9_]+\b/);
    expect(metadataGrants(source), filename).toEqual(configuration.grants);
  }
});

test("the modernization scope excludes DuChinese", () => {
  expect(Object.keys(SCRIPT_CONFIG)).not.toContain("duchinese-audio-downloader.user.js");
  expect(readScript("duchinese-audio-downloader.user.js")).toContain("// @version      0.4.1");
});

test("SPA scripts use urlchange without History interception or URL polling", () => {
  for (const [filename, configuration] of Object.entries(SCRIPT_CONFIG)) {
    if (!configuration.spa) {
      continue;
    }

    const source = readScript(filename);
    expect(source, filename).toContain('window.addEventListener("urlchange"');
    expect(source, filename).not.toMatch(/history\.(?:pushState|replaceState)\s*=/);
    expect(source, filename).not.toMatch(/addEventListener\("(?:popstate|hashchange)"/);
    expect(source, filename).not.toContain("ROUTE_CHECK_INTERVAL_MS");
    expect(source, filename).not.toContain("lastHref");
  }
});

test("iQIYI uses match metadata only", () => {
  expect(readScript("iqiyi-subtitle-downloader.user.js")).not.toMatch(/^\/\/ @include\b/m);
});

test("subtitle downloaders await the Promise-based privileged APIs", () => {
  for (const filename of [
    "gagaoolala-subtitle-downloader.user.js",
    "iqiyi-subtitle-downloader.user.js",
  ]) {
    const source = readScript(filename);
    expect(source, filename).toMatch(/await GM\.download\(\{/);
    expect(source, filename).toMatch(/await GM\.xmlHttpRequest\(\{/);
    expect(source, filename).not.toMatch(/^\s+(?:onload|onerror|ontimeout):/m);
  }
});

test("Missevan awaits stored settings, persists objects, and schedules a rebind on urlchange", async ({ page }) => {
  await page.setContent('<div class="subtitle-container"></div>');
  await page.evaluate(() => {
    window.__gmCalls = { getValue: [], setValue: [], styles: [], menus: [] };
    window.GM = {
      addStyle(css) {
        window.__gmCalls.styles.push(css);
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
        return style;
      },
      async getValue(key, fallbackValue) {
        window.__gmCalls.getValue.push({ key, fallbackValue });
        await new Promise((resolve) => window.setTimeout(resolve, 20));
        return {
          fontSize: 42,
          fontWeight: 700,
          lineHeight: 1.4,
          verticalPosition: 72,
          backgroundOpacity: 0.5,
          shadowStrength: "soft",
          useRoleColors: true,
          textColor: "#ffffff",
          fontFamily: "sans-serif",
        };
      },
      async setValue(key, value) {
        window.__gmCalls.setValue.push({ key, value });
      },
      registerMenuCommand(name, callback) {
        window.__gmCalls.menus.push({ name, callback });
        return name;
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("missevan-subtitle-styler.user.js") });
  await expect(page.locator("#missevan-subtitle-styler-launcher")).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => document.documentElement.style.getPropertyValue("--mss-font-size")),
  ).toBe("42px");

  await page.locator('[data-setting-key="fontSize"]').evaluate((input) => {
    input.value = "44";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__gmCalls.setValue.at(-1)?.value.fontSize)).toBe(44);
  await expect.poll(() => page.evaluate(() => typeof window.__gmCalls.setValue.at(-1)?.value)).toBe("object");

  const zeroDelayTimeoutsBefore = await page.evaluate(() => {
    window.__zeroDelayTimeouts = 0;
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 0) {
        window.__zeroDelayTimeouts += 1;
      }
      return originalSetTimeout(callback, delay, ...args);
    };
    return window.__zeroDelayTimeouts;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("urlchange")));
  await expect.poll(() => page.evaluate(() => window.__zeroDelayTimeouts)).toBeGreaterThan(zeroDelayTimeoutsBefore);
});

test("Nyaa batches its initial storage read before applying both group lists", async ({ page }) => {
  await page.setContent(`
    <table class="torrent-list">
      <tbody>
        <tr id="hidden-row"><td><a href="/view/1">[HideMe] Hidden release</a></td></tr>
        <tr id="highlighted-row"><td><a href="/view/2">[HighlightMe] Highlighted release</a></td></tr>
      </tbody>
    </table>
  `);
  await page.evaluate(() => {
    window.__gmCalls = { getValues: [], setValue: [], menus: [] };
    window.GM = {
      addStyle(css) {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
        return style;
      },
      async getValues(defaults) {
        window.__gmCalls.getValues.push(defaults);
        await new Promise((resolve) => window.setTimeout(resolve, 20));
        return {
          "nyaa-group-hider-hidden-groups": ["HideMe"],
          "nyaa-group-hider-highlighted-groups": ["HighlightMe"],
        };
      },
      async setValue(key, value) {
        window.__gmCalls.setValue.push({ key, value });
      },
      registerMenuCommand(name, callback) {
        window.__gmCalls.menus.push({ name, callback });
        return name;
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("nyaa-group-hider.user.js") });
  await expect(page.locator("#hidden-row")).toHaveClass(/nyaa-group-hider-hidden/);
  await expect(page.locator("#highlighted-row")).toHaveClass(/nyaa-group-hider-highlighted/);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.getValues.length)).toBe(1);
  await expect.poll(
    () => page.evaluate(() => Object.keys(window.__gmCalls.getValues[0]).sort()),
  ).toEqual([
    "nyaa-group-hider-hidden-groups",
    "nyaa-group-hider-highlighted-groups",
  ]);
});

test("Yatsu reads legacy JSON settings and writes the migrated object form", async ({ page }) => {
  await page.setContent('<div class="book-content">傳統內容</div>');
  await page.evaluate(() => {
    window.__gmCalls = { getValue: [], setValue: [], menus: [] };
    window.OpenCC = {
      Converter() {
        return (text) => text.replaceAll("傳統內容", "传统内容");
      },
    };
    window.GM = {
      addStyle(css) {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
        return style;
      },
      async getValue(key, fallbackValue) {
        window.__gmCalls.getValue.push({ key, fallbackValue });
        await new Promise((resolve) => window.setTimeout(resolve, 20));
        return JSON.stringify({ enabled: false });
      },
      async setValue(key, value) {
        window.__gmCalls.setValue.push({ key, value });
      },
      registerMenuCommand(name, callback) {
        window.__gmCalls.menus.push({ name, callback });
        return name;
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });
  await expect(page.locator("#yatsu-simplified-chinese-launcher")).toHaveAttribute("data-enabled", "false");
  await page.locator('[data-setting-key="enabled"]').evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect.poll(() => page.evaluate(() => window.__gmCalls.setValue.at(-1)?.value.enabled)).toBe(true);
  await expect.poll(() => page.evaluate(() => typeof window.__gmCalls.setValue.at(-1)?.value)).toBe("object");
  await expect.poll(() => page.locator(".book-content").textContent()).toBe("传统内容");
  await expect.poll(
    () => page.evaluate(() => window.yatsuSimplifiedChineseDebug.status().urlChangeListenerActive),
  ).toBe(true);
});
