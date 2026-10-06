import { defineConfig, devices } from "@playwright/test";

// README 用のスクショを撮る(テストではない)。npm run screenshots
// 先に npm run db:seed で見本データに戻しておく
export default defineConfig({
  testDir: "tests/screenshots",
  timeout: 60_000,
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    deviceScaleFactor: 2,
    baseURL: "http://localhost:3100",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
