// ==UserScript==
// @name         Du Chinese — Yomitan Compatibility
// @namespace    https://duchinese.net/
// @version      0.1.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/duchinese-yomitan.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/duchinese-yomitan.user.js
// @description  Makes the existing Du Chinese canvas reader scannable by Yomitan.
// @author       CaoCao
// @match        https://duchinese.net/*
// @match        https://www.duchinese.net/*
// @run-at       document-start
// @sandbox      raw
// @grant        none
// @noframes
// ==/UserScript==

// Assumes Du Chinese's layered 2D canvas renderer; reload after installation.
(() => {
  "use strict";

  const KEY = Symbol.for("duchinese-yomitan-installed");
  if (window[KEY]) return;
  window[KEY] = true;

  const CANVAS = ".lesson-canvas-clipper > canvas:not(.hidden-print)";
  const LAYER = "duchinese-yomitan-layer";
  const states = new Map();
  let frame = 0;
  let warned = false;
  let styleElement;
  let measureContext;

  function warn(error) {
    if (warned) return;
    warned = true;
    console.warn("[Du Chinese Yomitan] Text capture unavailable; reload after installing. The site renderer may have changed.", error);
  }

  function guard(callback) {
    try { callback(); } catch (error) { warn(error); }
  }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(flush);
  }

  const resizeObserver = new ResizeObserver(schedule);

  function getState(canvas) {
    if (!canvas.matches(CANVAS)) return null;
    let state = states.get(canvas);
    if (!state) {
      state = { canvas, draws: [], layer: null, signature: "", failed: false };
      states.set(canvas, state);
      resizeObserver.observe(canvas);
    }
    return state;
  }

  function reset(canvas) {
    const state = getState(canvas);
    if (!state) return;
    state.draws = [];
    state.failed = false;
    schedule();
  }

  function capture(context, text, x, y, maxWidth) {
    const state = getState(context.canvas);
    if (!state || state.failed) return;
    try {
      const transform = context.getTransform();
      if (transform.b !== 0 || transform.c !== 0 || transform.a <= 0 || transform.d <= 0) {
        throw new Error("Unsupported rotated or reflected text canvas.");
      }
      // Native argument coercion has already happened. Do not coerce objects twice.
      if (typeof text !== "string" || typeof x !== "number" || typeof y !== "number") return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const metrics = context.measureText(text);
      let alphabeticBaseline = metrics.alphabeticBaseline;
      if (!Number.isFinite(alphabeticBaseline)) {
        measureContext ??= document.createElement("canvas").getContext("2d");
        measureContext.font = context.font;
        measureContext.textBaseline = "alphabetic";
        alphabeticBaseline = metrics.actualBoundingBoxAscent - measureContext.measureText(text).actualBoundingBoxAscent;
      }
      const compression = typeof maxWidth === "number" && maxWidth > 0 && metrics.width > maxWidth
        ? maxWidth / metrics.width : 1;
      if (typeof maxWidth === "number" && maxWidth <= 0) return;
      const alignment = context.textAlign;
      const rtl = context.direction === "rtl";
      const right = alignment === "right" || (alignment === "start" && rtl) || (alignment === "end" && !rtl);
      const offset = metrics.width * compression * (right ? 1 : alignment === "center" ? 0.5 : 0);
      state.draws.push({
        text, font: context.font,
        x: (x - offset) * transform.a + transform.e,
        y: (y - alphabeticBaseline) * transform.d + transform.f,
        scaleX: transform.a * compression, scaleY: transform.d,
      });
      schedule();
    } catch (error) {
      state.failed = true;
      state.draws = [];
      schedule();
      warn(error);
    }
  }

  function installHooks() {
    const prototype = CanvasRenderingContext2D.prototype;
    const fillText = prototype.fillText;
    prototype.fillText = function (...args) {
      const result = Reflect.apply(fillText, this, args);
      guard(() => capture(this, ...args));
      return result;
    };
    const clearRect = prototype.clearRect;
    prototype.clearRect = function (...args) {
      const result = Reflect.apply(clearRect, this, args);
      if (args[2] && args[3]) guard(() => reset(this.canvas));
      return result;
    };
    // A width/height assignment clears the bitmap even when its value is unchanged.
    // Observe it synchronously: MutationObserver runs after the replacement draws.
    for (const property of ["width", "height"]) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
      Object.defineProperty(HTMLCanvasElement.prototype, property, {
        ...descriptor,
        set(value) {
          Reflect.apply(descriptor.set, this, [value]);
          guard(() => reset(this));
        },
      });
    }
    if (typeof prototype.reset === "function") {
      const resetContext = prototype.reset;
      prototype.reset = function (...args) {
        const result = Reflect.apply(resetContext, this, args);
        guard(() => reset(this.canvas));
        return result;
      };
    }
  }

  function ensureStyle() {
    if (styleElement?.isConnected) return;
    styleElement = document.createElement("style");
    styleElement.textContent = `
      .${LAYER} {
        position: absolute !important; left: 0; top: 0; z-index: 1;
        margin: 0 !important; padding: 0 !important; border: 0 !important;
        color: transparent !important; -webkit-text-fill-color: transparent !important;
        background: transparent !important; opacity: 1 !important; visibility: visible !important;
        font: 16px/0 sans-serif !important; white-space: pre !important;
        pointer-events: none; user-select: text !important; -webkit-user-select: text !important;
      }
      .${LAYER} span {
        display: inline-block !important; position: relative !important;
        margin: 0 !important; padding: 0 !important; border: 0 !important;
        vertical-align: top !important; white-space: pre !important;
        color: transparent !important; -webkit-text-fill-color: transparent !important;
        background: transparent !important; opacity: 1 !important; visibility: visible !important;
        user-select: text !important; -webkit-user-select: text !important;
        text-shadow: none !important; letter-spacing: normal !important; word-spacing: normal !important;
      }
      .${LAYER} > span { width: 0 !important; height: 0 !important; pointer-events: none; }
      .${LAYER} .duchinese-yomitan-character { pointer-events: auto; transform-origin: 0 0; }
      .${LAYER} .duchinese-yomitan-baseline {
        width: 0 !important; height: 0 !important; vertical-align: baseline !important;
        pointer-events: none;
      }
      @media print { .${LAYER} { display: none !important; } }
    `;
    (document.head || document.documentElement).appendChild(styleElement);
  }

  function sync(state) {
    const { canvas } = state;
    if (state.failed || !canvas.width || !canvas.height || !state.draws.length) {
      state.layer?.remove();
      state.layer = null;
      state.signature = "";
      return;
    }
    // Pinyin is drawn with a separate font. Learn the prose font from Han draws,
    // then keep all its characters, including punctuation, Latin words and newlines.
    const fonts = new Set(state.draws.filter((draw) => /\p{Script=Han}/u.test(draw.text)).map((draw) => draw.font));
    const draws = state.draws.filter((draw) => fonts.has(draw.font));
    if (!draws.length) {
      state.layer?.remove();
      state.layer = null;
      state.signature = "";
      warn(new Error("No Han text captured from the lesson canvas."));
      return;
    }
    const width = Number.parseFloat(canvas.style.width) || canvas.clientWidth;
    const height = Number.parseFloat(canvas.style.height) || canvas.clientHeight;
    if (!width || !height) return;
    const scaleX = width / canvas.width;
    const scaleY = height / canvas.height;
    const signature = JSON.stringify([draws, width, height, canvas.width, canvas.height, canvas.offsetLeft, canvas.offsetTop, canvas.lang]);
    if (signature === state.signature && state.layer?.isConnected) return;

    ensureStyle();
    const layer = document.createElement("div");
    layer.className = LAYER;
    layer.lang = canvas.lang;
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;
    layer.style.left = `${canvas.offsetLeft}px`;
    layer.style.top = `${canvas.offsetTop}px`;
    const glyphs = [];
    for (const draw of draws) {
      const anchor = document.createElement("span");
      const glyph = document.createElement("span");
      glyph.className = "duchinese-yomitan-character";
      glyph.style.font = draw.font;
      glyph.style.lineHeight = "1";
      glyph.textContent = draw.text;
      // An empty inline marker gives the DOM alphabetic baseline for the actual
      // fallback font, avoiding hard-coded ascent ratios and platform differences.
      const marker = document.createElement("span");
      marker.className = "duchinese-yomitan-baseline";
      glyph.appendChild(marker);
      anchor.appendChild(glyph);
      layer.appendChild(anchor);
      glyphs.push({ draw, glyph, marker });
    }
    // The clipper's existing pointer handlers receive bubbled events naturally.
    // Suppress only internal mouseout transitions, which otherwise clear hover
    // each time the pointer passes between two newly introduced text nodes.
    layer.addEventListener("mouseout", (event) => {
      if (event.relatedTarget instanceof Node && layer.contains(event.relatedTarget)) event.stopPropagation();
    });
    state.layer?.remove();
    canvas.parentElement.appendChild(layer);
    state.layer = layer;
    const baselines = glyphs.map(({ glyph, marker }) => marker.getBoundingClientRect().top - glyph.getBoundingClientRect().top);
    for (let index = 0; index < glyphs.length; ++index) {
      const { draw, glyph, marker } = glyphs[index];
      glyph.style.left = `${draw.x * scaleX}px`;
      glyph.style.top = `${draw.y * scaleY - baselines[index] * draw.scaleY * scaleY}px`;
      glyph.style.transform = `scale(${draw.scaleX * scaleX}, ${draw.scaleY * scaleY})`;
      marker.remove();
    }
    state.signature = signature;
  }

  function flush() {
    frame = 0;
    for (const [canvas, state] of states) {
      if (!canvas.isConnected || !canvas.matches(CANVAS)) {
        state.layer?.remove();
        resizeObserver.unobserve(canvas);
        states.delete(canvas);
        continue;
      }
      try { sync(state); } catch (error) {
        state.layer?.remove();
        state.layer = null;
        state.failed = true;
        warn(error);
      }
    }
  }

  guard(installHooks);
  new MutationObserver((records) => {
    if (records.some((record) => !record.target.parentElement?.closest(`.${LAYER}`)
      && !(record.target instanceof Element && record.target.closest(`.${LAYER}`)))) schedule();
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "lang", "width", "height"] });
  document.fonts?.addEventListener("loadingdone", () => {
    for (const state of states.values()) state.signature = "";
    schedule();
  });
  window.addEventListener("pageshow", schedule);
  // A late installation cannot recover pixels already painted by the page.
  window.addEventListener("load", () => {
    for (const canvas of document.querySelectorAll(CANVAS)) {
      if (canvas.textContent && !states.get(canvas)?.draws.length) warn(new Error("Initial lesson draw was missed."));
    }
  }, { once: true });
})();
