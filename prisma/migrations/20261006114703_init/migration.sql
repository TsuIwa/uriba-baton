-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('REGULAR', 'EVENT');

-- CreateEnum
CREATE TYPE "temperature" AS ENUM ('POSITIVE', 'CONSIDERING', 'COMPARING', 'NOT_NOW');

-- CreateEnum
CREATE TYPE "next_action_kind" AS ENUM ('QUOTE', 'FAMILY', 'DOCUMENTS', 'STOCK', 'CALLBACK', 'OTHER');

-- CreateTable
CREATE TABLE "stores" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "role" "staff_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name_kana" VARCHAR(60) NOT NULL,
    "phone_last4" CHAR(4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "visited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperature" "temperature" NOT NULL,
    "memo" VARCHAR(500),
    "input_seconds" INTEGER NOT NULL,
    "next_visit_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "label" VARCHAR(30) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" SERIAL NOT NULL,
    "topic_id" INTEGER NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_topics" (
    "visit_id" UUID NOT NULL,
    "topic_id" INTEGER NOT NULL,

    CONSTRAINT "visit_topics_pkey" PRIMARY KEY ("visit_id","topic_id")
);

-- CreateTable
CREATE TABLE "visit_checks" (
    "visit_id" UUID NOT NULL,
    "topic_id" INTEGER NOT NULL,
    "checklist_item_id" INTEGER NOT NULL,

    CONSTRAINT "visit_checks_pkey" PRIMARY KEY ("visit_id","checklist_item_id")
);

-- CreateTable
CREATE TABLE "next_actions" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "kind" "next_action_kind" NOT NULL,
    "note" VARCHAR(100),
    "done_at" TIMESTAMPTZ(3),
    "done_by_staff_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "next_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_store_id_name_key" ON "staff"("store_id", "name");

-- CreateIndex
CREATE INDEX "customers_store_id_phone_last4_name_kana_idx" ON "customers"("store_id", "phone_last4", "name_kana");

-- CreateIndex
CREATE INDEX "customers_store_id_name_kana_idx" ON "customers"("store_id", "name_kana");

-- CreateIndex
CREATE INDEX "visits_customer_id_visited_at_idx" ON "visits"("customer_id", "visited_at" DESC);

-- CreateIndex
CREATE INDEX "visits_next_visit_date_idx" ON "visits"("next_visit_date");

-- CreateIndex
CREATE INDEX "visits_staff_id_idx" ON "visits"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_code_key" ON "topics"("code");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_items_topic_id_label_key" ON "checklist_items"("topic_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_items_id_topic_id_key" ON "checklist_items"("id", "topic_id");

-- CreateIndex
CREATE INDEX "visit_topics_topic_id_idx" ON "visit_topics"("topic_id");

-- CreateIndex
CREATE INDEX "visit_checks_checklist_item_id_topic_id_idx" ON "visit_checks"("checklist_item_id", "topic_id");

-- CreateIndex
CREATE INDEX "next_actions_visit_id_idx" ON "next_actions"("visit_id");

-- CreateIndex
CREATE INDEX "next_actions_done_at_idx" ON "next_actions"("done_at");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_topics" ADD CONSTRAINT "visit_topics_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_topics" ADD CONSTRAINT "visit_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_checks" ADD CONSTRAINT "visit_checks_visit_id_topic_id_fkey" FOREIGN KEY ("visit_id", "topic_id") REFERENCES "visit_topics"("visit_id", "topic_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_checks" ADD CONSTRAINT "visit_checks_checklist_item_id_topic_id_fkey" FOREIGN KEY ("checklist_item_id", "topic_id") REFERENCES "checklist_items"("id", "topic_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_done_by_staff_id_fkey" FOREIGN KEY ("done_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- ここから手書き:Prisma のスキーマでは書けない制約
-- ============================================================

-- 電話番号の下4桁は数字4つだけ
ALTER TABLE "customers" ADD CONSTRAINT "customers_phone_last4_check"
  CHECK ("phone_last4" ~ '^[0-9]{4}$');

-- カナは全角カタカナ・長音・空白だけ(アプリ側で揃えてから入れる。揃え忘れをDBが止める)
ALTER TABLE "customers" ADD CONSTRAINT "customers_name_kana_check"
  CHECK ("name_kana" ~ '^[ァ-ヶー ]+$');

-- 入力秒数は0秒以上・1時間以内(画面を開きっぱなしの異常値を弾く)
ALTER TABLE "visits" ADD CONSTRAINT "visits_input_seconds_check"
  CHECK ("input_seconds" BETWEEN 0 AND 3600);

-- 「その他」を選んだときは中身の自由記入が必須
ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_other_needs_note_check"
  CHECK ("kind" <> 'OTHER' OR ("note" IS NOT NULL AND length(trim("note")) > 0));

-- 完了日と完了した人は、そろって入るかそろって空
ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_done_pair_check"
  CHECK (("done_at" IS NULL) = ("done_by_staff_id" IS NULL));

-- Supabase は public スキーマの表を API(anon キー)から読めるようにする。
-- このアプリはサーバー側の Prisma からだけ読み書きするので、RLS を有効にして
-- ポリシーを1つも作らないことで、API からの直接の読み書きを全部止める。
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "topics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_topics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "next_actions" ENABLE ROW LEVEL SECURITY;
