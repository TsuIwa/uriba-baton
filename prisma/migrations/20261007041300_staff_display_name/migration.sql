-- スタッフに「呼び名」を足す。店内で一意。画面の担当表示・選択欄・「◯◯さんに確認」はこれを使う
-- (名前は同じ人がいるので一意にしない。ID の末尾で見分ける方法は 104 と 204 のように重なるのでやめた)

ALTER TABLE "staff" ADD COLUMN "display_name" VARCHAR(20);

-- 既存のスタッフ:名前をそのまま呼び名にする。同じ店に同じ名前がいたら、2人目からは「名前-ID」
UPDATE "staff" s SET "display_name" = CASE WHEN r.n = 1 THEN left(s."name", 20) ELSE left(s."name", 12) || '-' || s."id" END
FROM (SELECT "id", row_number() OVER (PARTITION BY "store_id", "name" ORDER BY "id") AS n FROM "staff") r
WHERE r."id" = s."id";

ALTER TABLE "staff" ALTER COLUMN "display_name" SET NOT NULL;
ALTER TABLE "staff" ADD CONSTRAINT "staff_display_name_not_blank_check" CHECK (length(trim("display_name")) > 0);

-- CreateIndex
CREATE UNIQUE INDEX "staff_store_id_display_name_key" ON "staff"("store_id", "display_name");
