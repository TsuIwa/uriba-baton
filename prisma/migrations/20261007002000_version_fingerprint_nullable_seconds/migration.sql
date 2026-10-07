-- 2周目の審査の直し
--  ・入力秒数は測れなかったら空にする(0秒として集計に混ぜない)
--  ・同じ送信IDで中身の違う再送を見分ける「指紋」
--  ・「変更あり」を日付の比較でなく、中身の版で決める
--  ・スタッフ名の一意制約を外す(同じ名前の人はありうる)

-- AlterEnum(旧版の行の UNKNOWN は 20261006121000 で入れている)

-- AlterTable
ALTER TABLE "visits" ALTER COLUMN "input_seconds" DROP NOT NULL;
ALTER TABLE "visits" ADD COLUMN "request_fingerprint" CHAR(64);

-- 中身の版。改定日が入っている項目は、少なくとも1回は中身が変わっているので版2にする
ALTER TABLE "checklist_items" ADD COLUMN "content_version" INTEGER NOT NULL DEFAULT 1;
UPDATE "checklist_items" SET "content_version" = 2 WHERE "content_revised_on" IS NOT NULL;
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_content_version_check"
  CHECK ("content_version" >= 1);

-- 説明したときの版。既存の行は来店日で推し量る:改定日の当日以前に説明していたら古い版(1)、
-- 改定日より後なら今の版。当日はどちらが先か分からないので古い版に倒す(=必ず案内し直す側)
ALTER TABLE "visit_checks" ADD COLUMN "explained_version" INTEGER;
UPDATE "visit_checks" vc
SET "explained_version" = CASE
  WHEN ci."content_revised_on" IS NOT NULL
   AND (v."visited_at" AT TIME ZONE 'Asia/Tokyo')::date <= ci."content_revised_on" THEN 1
  ELSE ci."content_version"
END
FROM "checklist_items" ci, "visits" v
WHERE ci."id" = vc."checklist_item_id" AND v."id" = vc."visit_id";
ALTER TABLE "visit_checks" ALTER COLUMN "explained_version" SET NOT NULL;
ALTER TABLE "visit_checks" ADD CONSTRAINT "visit_checks_explained_version_check"
  CHECK ("explained_version" >= 1);

-- DropIndex
DROP INDEX "staff_store_id_name_key";
