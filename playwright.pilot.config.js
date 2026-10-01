import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "pilot.spec.js",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/v3-browser-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4184",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "PILOT_FIXTURE_PORT=4184 PILOT_FIXTURE_DB=/tmp/stable-desk-v3-browser.sqlite node scripts/pilot-fixture.mjs",
    url: "http://127.0.0.1:4184/pilot.html",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
