-- DropIndex
DROP INDEX "customers_store_id_name_kana_idx";

-- CreateIndex
CREATE INDEX "customers_store_id_name_kana_idx" ON "customers"("store_id", "name_kana" varchar_pattern_ops);
