-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN     "content_revised_on" DATE,
ADD COLUMN     "is_volatile" BOOLEAN NOT NULL DEFAULT false;

-- 手書き:改定日は「中身が変わる項目」にだけ入れられる
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_revised_only_if_volatile_check"
  CHECK ("content_revised_on" IS NULL OR "is_volatile");
