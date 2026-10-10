const path = require("node:path");
const { GM_STUB, scannerCode } = require("./iqiyi-yomitan");

const SCRIPT = path.resolve(__dirname, "../../scripts/missevan-yomitan.user.js");
const STYLE = "#missevan-yomitan-style";

// Scan from the first character of a line through the hit-tested caret position.
async function scanLine(page, selector, length = 4, startOffset = 0) {
  return page.evaluate(({ selector, length, startOffset }) => {
    const line = document.querySelector(selector);
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
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
      target: line.contains(document.elementFromPoint(x, y)),
      offset,
      scanned: textNode && line.contains(textNode)
        ? new window.DOMTextScanner(textNode, offset).seek(length).content : "",
      x, y,
    };
  }, { selector, length, startOffset });
}

module.exports = { SCRIPT, STYLE, GM_STUB, scannerCode, scanLine };
