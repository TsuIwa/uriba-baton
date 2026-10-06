import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// DBを使う統合テスト。DATABASE_URL のDBにテスト用の店を作って試し、最後に消す
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    setupFiles: ["dotenv/config"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
