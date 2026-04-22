// @ts-check
const baseConfig = require('./playwright.config.cjs');

module.exports = {
  ...baseConfig,
  testDir: './tests/e2e',
};