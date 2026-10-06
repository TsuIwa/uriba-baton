import { expect, test, type Page } from "@playwright/test";

// 1人目(イベントスタッフ)が記録 → 2人目(常勤)がお客様カードを開いて続きから記録、の流れ
// 何度流しても重ならないよう、お客様の名前と下4桁は毎回変える
const KANA = "アイウエオカキクケコサシスセソタチツテト";
const suffix = Array.from({ length: 3 }, () => KANA[Math.floor(Math.random() * KANA.length)]).join("");
const nameKana = `エトウ ${suffix}`;
const last4 = String(Math.floor(Math.random() * 10000)).padStart(4, "0");

async function chooseStaff(page: Page, label: string) {
  await page.getByLabel("今のスタッフ").selectOption({ label });
  // 選んだら保存され、画面が描き直される
  await expect(page.getByLabel("今のスタッフ")).toHaveValue(/\d+/);
  // サーバーに保存し終わるのを待つ(待たずに次へ進むと、前のスタッフのまま記録される)
  await page.waitForLoadState("networkidle");
}

test("イベントスタッフの記録を、常勤が続きから引き継げる", async ({ page }) => {
  await page.goto("/");
  await chooseStaff(page, "森田 陽菜");

  // 1人目:新規のお客様を記録
  await page.getByRole("link", { name: "記録する", exact: true }).click();
  await expect(page.getByText("担当:")).toContainText("森田 陽菜(イベント)");
  await page.getByRole("button", { name: "＋ 新規のお客様" }).click();
  await page.getByLabel("お名前カナ").fill(nameKana.replace("エトウ", "えとう"));
  await page.getByLabel("電話番号の下4桁").fill(last4);
  await page.getByRole("button", { name: "のりかえ(MNP)" }).click();
  await page.getByRole("button", { name: "料金比較" }).click();
  await page.getByRole("button", { name: "端末価格" }).click();
  await page.getByRole("button", { name: "他社と比較中" }).click();
  await page.getByRole("button", { name: "見積もりを渡す" }).click();
  await page.getByRole("button", { name: "明日" }).click();
  await page.getByRole("button", { name: "保存する" }).click();

  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}\?saved=\d+/);
  await expect(page.getByRole("status")).toContainText("保存しました");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nameKana);
  const summary = page.getByTestId("handoff-summary");
  await expect(summary).toContainText("森田 陽菜(イベント)が「のりかえ(MNP)」で 料金比較・端末価格 まで案内済み。");
  await expect(summary).toContainText("次は 下取り・キャンペーン から。");
  await expect(page.getByText("お渡しした見積もりの感想から聞く")).toBeVisible();
  await page.screenshot({ path: "test-results/01_お客様カード_1回目.png", fullPage: true });

  // 2人目:常勤に替わって、お客様を検索して開く
  await chooseStaff(page, "高橋 恵");
  await page.getByRole("link", { name: "お客様", exact: true }).click();
  await page.getByLabel("お客様を探す").fill(`えとう ${last4}`);
  await page.getByRole("button", { name: "探す" }).click();
  await page.getByRole("link", { name: new RegExp(nameKana) }).click();
  await expect(page.getByTestId("handoff-summary")).toContainText("森田 陽菜(イベント)");

  // 約束していた見積もりは済みにする
  await page.getByRole("button", { name: "済み" }).first().click();
  await expect(page.getByRole("button", { name: "済み" })).toHaveCount(0);

  // 続きを記録(前回の用件は最初から選ばれている)
  await page.getByRole("link", { name: "このお客様の記録を残す" }).click();
  await expect(page.getByRole("button", { name: "のりかえ(MNP)" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "下取り" }).click();
  await page.getByRole("button", { name: "前向き" }).click();
  await page.screenshot({ path: "test-results/02_記録画面.png", fullPage: true });
  await page.getByRole("button", { name: "保存する" }).click();

  await expect(page.getByRole("status")).toContainText("保存しました");
  await expect(page.getByTestId("handoff-summary")).toContainText(
    "高橋 恵(常勤)が「のりかえ(MNP)」で 下取り まで案内済み。次は キャンペーン・必要書類 から。",
  );
  await expect(page.getByText("来店 2 回")).toBeVisible();

  // 今日の一覧:明日の予定は新しい記録で上書きされたので、終わっていない約束にも出ない
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await expect(page.getByText("記録にかかった時間")).toBeVisible();
  // 見本と自動テストの秒数は実測に混ぜず、見本は「見本値」と書いて分ける
  await expect(page.getByText(/見本値\(参考/)).toBeVisible();
  await page.screenshot({ path: "test-results/03_今日の一覧.png", fullPage: true });
});

test("今のスタッフを選ばないと保存できない", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/record");
  await expect(page.getByText("画面上部で「今のスタッフ」を選んでください")).toBeVisible();
  await expect(page.getByRole("button", { name: /保存/ })).toBeDisabled();
});

test("新規で入れた人が登録済みなら、候補を出して選び直せる", async ({ page }) => {
  await page.goto("/record");
  await page.getByRole("button", { name: "＋ 新規のお客様" }).click();
  // seed の「ハヤシ ソウタ」(下4桁 0817)
  await page.getByLabel("お名前カナ").fill("はやし");
  await page.getByLabel("電話番号の下4桁").fill("0817");
  await expect(page.getByText("登録済みかもしれません")).toBeVisible();
  await page.getByRole("button", { name: /ハヤシ ソウタ/ }).click();
  await expect(page.getByRole("button", { name: "変える" })).toBeVisible();
  await expect(page.getByText("ハヤシ ソウタ")).toBeVisible();
});
