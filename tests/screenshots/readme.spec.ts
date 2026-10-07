import { test } from "@playwright/test";

// README の3枚:今日の一覧・お客様カード・記録する(見本データの画面)
test("README のスクショ", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("今のスタッフ").selectOption({ label: "森田 陽菜" });
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.screenshot({ path: "docs/images/today.png" });

  // 前々回の未完了の約束・キャンペーンの改定・理解があいまい、が全部出る見本のお客様
  await page.goto("/customers?q=アベ");
  await page.getByRole("link", { name: /アベ タクミ/ }).click();
  await page.getByRole("region", { name: "バトン" }).waitFor();
  await page.screenshot({ path: "docs/images/customer-card.png" });

  await page.screenshot({ path: "docs/images/customer-card-full.png", fullPage: true });

  await page.getByRole("link", { name: "このお客様の記録を残す" }).click();
  await page.getByRole("button", { name: "次へ" }).waitFor();
  // 案内したことの段:説明済みと、あいまい(黄+「?」+縁)を1つずつ押した状態を撮る
  await page.getByRole("button", { name: "料金比較を説明済み" }).click();
  await page.getByRole("button", { name: "下取りの理解があいまい" }).click();
  await page.screenshot({ path: "docs/images/record.png" });
});
