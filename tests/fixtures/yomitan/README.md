# Yomitan scanner test fixture

Unmodified upstream source from [yomidevs/yomitan](https://github.com/yomidevs/yomitan/tree/d34832d756e05dc00945e5b7d7ebc80963299a7a), revision `d34832d756e05dc00945e5b7d7ebc80963299a7a`:

- `dom-text-scanner.js`: `ext/js/dom/dom-text-scanner.js`
- `string-util.js`: `ext/js/data/string-util.js`
- `LICENSE`: upstream GPL-3.0 license (source files permit GPL-3.0-or-later).

Used only by the browser tests, not bundled into or loaded by the userscript. The test harness removes module declarations in memory to load both files in a single browser script; upstream source files remain unchanged.
