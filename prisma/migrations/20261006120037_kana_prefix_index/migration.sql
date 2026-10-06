-- カナだけの前方一致検索(LIKE 'カト%')で索引が使われるよう、varchar_pattern_ops を付けて作り直す。
-- 普通の索引は並び順の規則(照合順序)のせいで LIKE の前方一致に使われない(2万人で確かめた)。
-- schema.prisma 側は素の @@index のまま(理由は schema.prisma の注記)

-- DropIndex
DROP INDEX "customers_store_id_name_kana_idx";

-- CreateIndex
CREATE INDEX "customers_store_id_name_kana_idx" ON "customers"("store_id", "name_kana" varchar_pattern_ops);
