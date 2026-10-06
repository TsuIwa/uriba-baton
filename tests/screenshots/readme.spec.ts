import { test } from "@playwright/test";

// README の3枚:今日の一覧・お客様カード・記録する(見本データの画面)
test("README のスクショ", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("今のスタッフ").selectOption({ label: "森田 陽菜" });
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.screenshot({ path: "docs/images/today.png" });

  await page.goto("/customers?q=ハヤシ");
  await page.getByRole("link", { name: /ハヤシ ソウタ/ }).click();
  await page.getByTestId("handoff-summary").waitFor();
  await page.screenshot({ path: "docs/images/customer-card.png" });

  await page.getByRole("link", { name: "このお客様の記録を残す" }).click();
  await page.getByRole("button", { name: "検討中" }).waitFor();
  await page.screenshot({ path: "docs/images/record.png" });
});
