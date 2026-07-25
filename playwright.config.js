const { defineConfig } = require("playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "line",
  use: {
    headless: true,
  },
});
