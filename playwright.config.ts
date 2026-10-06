import { defineConfig, devices } from "@playwright/test";

// 画面の通しテスト。ローカルのDB(supabase start + seed 済み)が必要
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    baseURL: "http://localhost:3100",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
