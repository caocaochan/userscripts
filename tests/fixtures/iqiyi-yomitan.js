const fs = require("node:fs");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "../../scripts/iqiyi-yomitan.user.js");
const STYLE = "#iqiyi-yomitan-style";
// Exercise the Promise-returning API, including injection before <head> exists.
const GM_STUB = `window.GM = {
  async addStyle(css) {
    if (!document.documentElement) {
      await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }
    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  }
};`;
const scannerCode = ["string-util.js", "dom-text-scanner.js"].map((name) =>
  fs.readFileSync(path.join(__dirname, "yomitan", name), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, ""),
).join("\n") + "\nwindow.DOMTextScanner = DOMTextScanner;";

async function scanCaption(page, selector, length = 4, startOffset = 0) {
  return page.evaluate(({ selector, length, startOffset }) => {
    const caption = document.querySelector(selector);
    const walker = document.createTreeWalker(caption, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && !node.textContent.trim()) { /* Skip empty nodes. */ }
    if (!node) return null;
    const range = document.createRange();
    range.setStart(node, startOffset);
    range.setEnd(node, startOffset + Array.from(node.textContent.slice(startOffset))[0].length);
    const rect = range.getBoundingClientRect();
    const x = rect.left + rect.width * 0.25;
    const y = rect.top + rect.height * 0.5;
    const hit = document.caretRangeFromPoint?.(x, y);
    const position = !hit && document.caretPositionFromPoint?.(x, y);
    const textNode = hit?.startContainer || position?.offsetNode;
    const offset = hit?.startOffset ?? position?.offset;
    return {
      target: document.elementFromPoint(x, y)?.closest(".caption") === caption,
      offset,
      scanned: textNode ? new window.DOMTextScanner(textNode, offset).seek(length).content : "",
      x, y,
    };
  }, { selector, length, startOffset });
}

module.exports = { SCRIPT, STYLE, GM_STUB, scannerCode, scanCaption };
