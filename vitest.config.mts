import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 単体テスト(DBなしで動く)。DBを使う統合テストは vitest.db.config.mts
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
