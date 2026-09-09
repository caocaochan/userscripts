const js = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const globals = require("globals");

module.exports = defineConfig([
  { ignores: ["node_modules/**", "test-results/**", "playwright-report/**"] },
  {
    files: ["scripts/*.user.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...globals.browser, GM: "readonly" },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "prefer-object-has-own": "error",
      "object-shorthand": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      // Control characters must be matched when validating paths and filenames.
      "no-control-regex": "off",
    },
  },
  {
    files: ["*.config.js"],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
]);
