-- 記録に3つ足す:出どころ(見本/自動テスト/人)・送信ID(二重送信の防止)・記録時点の役割
-- すでに行がある表に NOT NULL の列を足すので、いったん空を許して埋めてから NOT NULL にする

-- CreateEnum
-- UNKNOWN = この列ができる前からあった記録(人が入れたか見本か分からない)
CREATE TYPE "visit_source" AS ENUM ('MANUAL', 'SEED', 'E2E', 'UNKNOWN');

-- AlterTable
ALTER TABLE "visits"
  ADD COLUMN "source" "visit_source" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "request_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "staff_role_at_visit" "staff_role";

-- 既存の記録は出どころが分からないので UNKNOWN のまま(実測の集計に入れない)。これから入る記録の既定は MANUAL
ALTER TABLE "visits" ALTER COLUMN "source" SET DEFAULT 'MANUAL';

-- 既存の記録は、今のスタッフの役割で埋める(これより前の役割の変化は分からないため)
UPDATE "visits" v SET "staff_role_at_visit" = s."role" FROM "staff" s WHERE s."id" = v."staff_id";
ALTER TABLE "visits" ALTER COLUMN "staff_role_at_visit" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "visits_request_id_key" ON "visits"("request_id");
