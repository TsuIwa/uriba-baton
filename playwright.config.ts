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
    // 本番と同じ build で試す(同じフォルダで dev サーバーが動いていても重ならない)
    command: "npm run build && npm run start -- -p 3100",
    // 画面テストで入った記録は E2E として残し、実測の秒数の集計に混ぜない
    env: { VISIT_SOURCE: "E2E" },
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
