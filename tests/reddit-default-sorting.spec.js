const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../scripts/reddit-default-sorting.user.js",
);
const MANIFEST_PATH = path.resolve(__dirname, "../manifest.json");
const REDDIT_URL_PATTERN = /^https:\/\/(?:www\.|sh\.)?reddit\.com(?:\/|$)/;

async function serveReddit(page) {
  await page.route(REDDIT_URL_PATTERN, (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
}

async function installGm(page) {
  await page.evaluate(() => {
    window.__addedStyles = [];
    window.GM = {
      addStyle(css) {
        window.__addedStyles.push(css);
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
        return style;
      },
    };
  });
}

test("metadata and manifest expose the installable userscript", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const entry = manifest.scripts.find(({ id }) => id === "reddit-default-sorting");

  expect(source).toContain("// @version      2.2.0");
  expect(source).toContain("// @sandbox      DOM");
  expect(source).toContain("// @grant        GM.addStyle");
  expect(source).toContain("// @grant        window.onurlchange");
  expect(source).toContain(
    "// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/reddit-default-sorting.user.js",
  );
  expect(source).toContain(
    "// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/reddit-default-sorting.user.js",
  );
  expect(entry).toMatchObject({
    name: "Reddit Default Sorting",
    installUrl: "https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/reddit-default-sorting.user.js",
    sourceUrl: "https://github.com/caocaochan/userscripts/blob/main/scripts/reddit-default-sorting.user.js",
  });
});

test("redirects the homepage to Top/Today while preserving other URL components", async ({ page }) => {
  await serveReddit(page);
  await page.goto("https://www.reddit.com/?source=frontpage#content");
  await installGm(page);

  await page.addScriptTag({ path: SCRIPT_PATH });

  await expect.poll(() => page.url()).toBe(
    "https://www.reddit.com/top/?source=frontpage&t=day#content",
  );
});

test("redirects a bare subreddit route to New", async ({ page }) => {
  await serveReddit(page);
  await page.goto("https://sh.reddit.com/r/typescript/?view=compact#posts");
  await installGm(page);

  await page.addScriptTag({ path: SCRIPT_PATH });

  await expect.poll(() => page.url()).toBe(
    "https://sh.reddit.com/r/typescript/new/?view=compact#posts",
  );
});

test("rewrites pointer and keyboard link activations only on supported origins", async ({ page }) => {
  await serveReddit(page);
  await page.goto("https://www.reddit.com/top/");
  await installGm(page);
  await page.evaluate(() => {
    document.addEventListener("click", (event) => event.preventDefault());
    document.body.innerHTML = `
      <a id="community" href="/r/javascript/?view=compact#posts"><span>Community</span></a>
      <a id="home" href="https://sh.reddit.com/?feed=home#content">Home</a>
      <a id="sorted" href="/r/javascript/hot/">Sorted</a>
      <a id="old-reddit" href="https://old.reddit.com/r/javascript/">Old Reddit</a>
      <a id="service" href="https://oauth.reddit.com/r/javascript/">Reddit service</a>
      <a id="nonstandard-port" href="https://www.reddit.com:444/r/javascript/">Port</a>
      <a id="external" href="https://example.com/r/javascript/">External</a>
    `;
  });
  await page.addScriptTag({ path: SCRIPT_PATH });

  await page.locator("#community span").dispatchEvent("pointerdown");
  await page.locator("#home").dispatchEvent("click");

  await expect(page.locator("#community")).toHaveAttribute(
    "href",
    "https://www.reddit.com/r/javascript/new/?view=compact#posts",
  );
  await expect(page.locator("#home")).toHaveAttribute(
    "href",
    "https://sh.reddit.com/top/?feed=home&t=day#content",
  );
  await expect(page.locator("#sorted")).toHaveAttribute("href", "/r/javascript/hot/");
  await expect(page.locator("#old-reddit")).toHaveAttribute(
    "href",
    "https://old.reddit.com/r/javascript/",
  );
  await expect(page.locator("#service")).toHaveAttribute(
    "href",
    "https://oauth.reddit.com/r/javascript/",
  );
  await expect(page.locator("#nonstandard-port")).toHaveAttribute(
    "href",
    "https://www.reddit.com:444/r/javascript/",
  );
  await expect(page.locator("#external")).toHaveAttribute(
    "href",
    "https://example.com/r/javascript/",
  );
});

test("enforces sorting after a Tampermonkey urlchange event", async ({ page }) => {
  await serveReddit(page);
  await page.goto("https://reddit.com/top/");
  await installGm(page);
  await page.evaluate(() => {
    window.onurlchange = null;
  });
  await page.addScriptTag({ path: SCRIPT_PATH });

  await page.evaluate(() => {
    history.pushState({}, "", "/r/playwright/");
    window.dispatchEvent(new Event("urlchange"));
  });

  await expect.poll(() => page.url()).toBe("https://reddit.com/r/playwright/new/");
});

test("sets OP and comment bodies to 1rem without resizing metadata, titles, or feed posts", async ({ page }) => {
  await serveReddit(page);
  await page.goto("https://www.reddit.com/r/playwright/comments/example/thread/");
  await page.evaluate(() => {
    document.head.insertAdjacentHTML("beforeend", `
      <style>
        shreddit-comment [slot="comment"] { font-size: 14px; }
        shreddit-comment .metadata { font-size: 12px; }
        shreddit-post [property="schema:articleBody"] { font-size: 14px; }
        shreddit-post h1 { font-size: 24px; }
      </style>
    `);
    document.body.innerHTML = `
      <shreddit-post view-context="CommentsPage">
        <h1 id="post-title">Post title</h1>
        <shreddit-post-text-body slot="text-body">
          <div slot="text-body">
            <div id="op-body" class="md" property="schema:articleBody">
              <p id="op-text">OP body</p>
            </div>
          </div>
        </shreddit-post-text-body>
      </shreddit-post>
      <shreddit-post view-context="Feed">
        <shreddit-post-text-body slot="text-body">
          <div slot="text-body">
            <div id="feed-post-body" class="md" property="schema:articleBody">
              Feed preview
            </div>
          </div>
        </shreddit-post-text-body>
      </shreddit-post>
      <shreddit-comment>
        <div class="metadata">Author and controls</div>
        <div id="t1_example-comment-rtjson-content" class="md" slot="comment">
          <div><p id="comment-text">Comment body</p></div>
        </div>
      </shreddit-comment>
    `;
  });
  await installGm(page);

  await page.addScriptTag({ path: SCRIPT_PATH });

  const sizes = await page.evaluate(() => ({
    opBody: getComputedStyle(document.querySelector("#op-body")).fontSize,
    opParagraph: getComputedStyle(document.querySelector("#op-text")).fontSize,
    commentBody: getComputedStyle(document.querySelector('[slot="comment"]')).fontSize,
    commentParagraph: getComputedStyle(document.querySelector("#comment-text")).fontSize,
    metadata: getComputedStyle(document.querySelector(".metadata")).fontSize,
    title: getComputedStyle(document.querySelector("#post-title")).fontSize,
    feedPostBody: getComputedStyle(document.querySelector("#feed-post-body")).fontSize,
    addedStyleCount: window.__addedStyles.length,
  }));
  expect(sizes).toEqual({
    opBody: "16px",
    opParagraph: "16px",
    commentBody: "16px",
    commentParagraph: "16px",
    metadata: "12px",
    title: "24px",
    feedPostBody: "14px",
    addedStyleCount: 1,
  });
});
