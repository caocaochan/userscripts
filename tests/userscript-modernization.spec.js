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
      "GM.getValue",
      "GM.setValue",
      "GM.registerMenuCommand",
    ],
    spa: false,
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

test("Yatsu uses the DOM sandbox and an integrity-pinned OpenCC 1.4.1 bundle", () => {
  const source = readScript("yatsu-simplified-chinese.user.js");
  expect(source).toContain("// @version      1.2.0");
  expect(source).toContain("// @sandbox      DOM");
  expect(source).toContain(
    "// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.4.1/dist/umd/t2cn.js"
      + "#sha256-cnj6Y5j1mnkHXndo208qeMqyKFQXA6HVkAIsGeIzQZ8=",
  );
  expect(source).not.toMatch(/^\/\/ @run-in\b/m);
  expect(source).not.toContain("window.onurlchange");
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

test("Yatsu awaits its setting, registers a descriptive menu, and converts eligible text", async ({ page }) => {
  await page.setContent(`
    <title>傳統標題</title>
    <main>傳統內容 看著 著名 著作</main>
    <input value="傳統輸入">
    <code>傳統程式</code>
    <div contenteditable="true"><span>傳統編輯</span></div>
  `);
  await page.evaluate(() => {
    const shadowHost = document.createElement("div");
    shadowHost.id = "shadow-host";
    shadowHost.attachShadow({ mode: "open" }).innerHTML = "<span>傳統陰影</span>";
    document.body.appendChild(shadowHost);

    window.__gmCalls = { getValue: [], setValue: [], menus: [], converter: [], customConverter: [] };
    window.__settingPromise = new Promise((resolve) => {
      window.__resolveSetting = resolve;
    });
    window.OpenCC = {
      Converter(options) {
        window.__gmCalls.converter.push(options);
        return (text) => text
          .replaceAll("傳統", "传统")
          .replaceAll("標題", "标题")
          .replaceAll("內容", "内容")
          .replaceAll("動態", "动态")
          .replaceAll("程式", "程序")
          .replaceAll("編輯", "编辑")
          .replaceAll("陰影", "阴影");
      },
      CustomConverter(entries) {
        window.__gmCalls.customConverter.push(entries);
        const longestFirst = [...entries].sort((left, right) => right[0].length - left[0].length);
        return (text) => {
          let converted = "";
          for (let index = 0; index < text.length;) {
            const match = longestFirst.find(([source]) => text.startsWith(source, index));
            if (match) {
              converted += match[1];
              index += match[0].length;
            } else {
              converted += text[index];
              index += 1;
            }
          }
          return converted;
        };
      },
    };
    window.GM = {
      async getValue(key, fallbackValue) {
        window.__gmCalls.getValue.push({ key, fallbackValue });
        return window.__settingPromise;
      },
      async setValue(key, value) {
        window.__gmCalls.setValue.push({ key, value });
      },
      async registerMenuCommand(name, callback, options) {
        window.__gmCalls.menus.push({ name, callback, options });
        return name;
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });
  await expect(page.locator("main")).toHaveText("傳統內容 看著 著名 著作");
  await expect.poll(() => page.evaluate(() => window.__gmCalls.menus.length)).toBe(0);
  await page.evaluate(() => window.__resolveSetting(true));

  await expect.poll(() => page.locator("main").textContent()).toBe("传统内容 看着 著名 著作");
  await expect.poll(() => page.title()).toBe("传统标题");
  await expect(page.locator("input")).toHaveValue("傳統輸入");
  await expect(page.locator("code")).toHaveText("傳統程式");
  await expect(page.locator('[contenteditable="true"]')).toHaveText("傳統編輯");
  await expect.poll(
    () => page.evaluate(() => document.querySelector("#shadow-host").shadowRoot.textContent),
  ).toBe("传统阴影");
  await expect.poll(() => page.evaluate(() => window.__gmCalls.getValue)).toEqual([
    { key: "yatsu-t2s-enabled", fallbackValue: true },
  ]);
  await expect.poll(
    () => page.evaluate(() => window.__gmCalls.menus.map(({ name, options }) => ({ name, options }))),
  ).toEqual([
    {
      name: "Disable Simplified conversion (reloads page)",
      options: {
        title: "Disable conversion and reload this page.",
      },
    },
  ]);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.converter)).toEqual([
    { from: "t", to: "cn" },
  ]);
  await expect.poll(
    () => page.evaluate(() => window.__gmCalls.customConverter[0]),
  ).toEqual(expect.arrayContaining([
    ["著作", "著作"],
    ["著名", "著名"],
    ["著", "着"],
  ]));

  await page.locator("main").evaluate((main) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "動態內容";
    main.appendChild(paragraph);
  });
  await expect.poll(() => page.locator("p").textContent()).toBe("动态内容");
});

test("disabled Yatsu registers its enable command without starting conversion", async ({ page }) => {
  await page.setContent("<main>傳統內容</main>");
  await page.evaluate(() => {
    window.__gmCalls = { menus: [], converterCalls: 0, customConverterCalls: 0 };
    window.OpenCC = {
      Converter() {
        window.__gmCalls.converterCalls += 1;
        return (text) => text.replaceAll("傳統內容", "传统内容");
      },
      CustomConverter() {
        window.__gmCalls.customConverterCalls += 1;
        return (text) => text;
      },
    };
    window.GM = {
      async getValue() {
        return false;
      },
      async setValue() {},
      async registerMenuCommand(name, callback, options) {
        window.__gmCalls.menus.push({ name, callback, options });
        return name;
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });
  await expect.poll(
    () => page.evaluate(() => window.__gmCalls.menus.map(({ name, options }) => ({ name, options }))),
  ).toEqual([
    {
      name: "Enable Simplified conversion (reloads page)",
      options: {
        title: "Enable conversion and reload this page.",
      },
    },
  ]);
  await expect(page.locator("main")).toHaveText("傳統內容");
  await expect.poll(
    () => page.evaluate(() => ({
      converterCalls: window.__gmCalls.converterCalls,
      customConverterCalls: window.__gmCalls.customConverterCalls,
    })),
  ).toEqual({ converterCalls: 0, customConverterCalls: 0 });

  await page.locator("main").evaluate((main) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "動態內容";
    main.appendChild(paragraph);
  });
  await expect(page.locator("p")).toHaveText("動態內容");
});

test("Yatsu reports initialization failures without an unhandled rejection", async ({ page }) => {
  const pageErrors = [];
  const errorMessages = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errorMessages.push(message.text());
    }
  });

  await page.setContent("<main>傳統內容</main>");
  await page.evaluate(() => {
    window.GM = {
      async getValue() {
        return true;
      },
      async setValue() {},
      async registerMenuCommand() {
        return "menu-id";
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });
  await expect.poll(() => errorMessages).toEqual([
    expect.stringContaining("[Yatsu Reader T2S] Initialization failed."),
  ]);
  expect(pageErrors).toEqual([]);
  await expect(page.locator("main")).toHaveText("傳統內容");
});
