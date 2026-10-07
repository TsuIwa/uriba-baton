// 記録する画面(サーバー側):目録と、選ばれているお客様を読み込んでフォームに渡す
import { getCatalog, getCustomerCard, getStore } from "@/lib/queries";
import { getCurrentStaff } from "@/lib/session";
import { jstDateString } from "@/lib/dates";
import { normalizeKana } from "@/lib/kana";
import { RecordForm } from "./RecordForm";

type Props = {
  searchParams: Promise<{ customerId?: string; new?: string; kana?: string; last4?: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RecordPage({ searchParams }: Props) {
  const sp = await searchParams;
  const store = await getStore();
  if (!store) return null;
  const [catalog, current] = await Promise.all([getCatalog(), getCurrentStaff(store.id)]);

  const card = sp.customerId && UUID.test(sp.customerId) ? await getCustomerCard(store.id, sp.customerId) : null;
  // 前回と同じ用件を最初から選んでおく(2回目の入力を短くする)
  const lastTopicIds = card?.visits[0]?.topics.map((t) => t.topicId) ?? [];

  return (
    <RecordForm
      // お客様が変わったらフォームを作り直して、秒数の計測もやり直す
      key={card?.id ?? "new"}
      topics={catalog.topics}
      staffName={current ? `${current.displayName}${current.role === "EVENT" ? "(イベント)" : ""}` : null}
      staffId={current?.id ?? null}
      today={jstDateString(new Date())}
      initialCustomer={
        card
          ? { id: card.id, nameKana: card.nameKana, phoneLast4: card.phoneLast4, lastVisit: null }
          : null
      }
      initialTopicIds={lastTopicIds}
      initialNew={
        sp.new === "1"
          ? { nameKana: sp.kana ? normalizeKana(sp.kana).slice(0, 60) : "", phoneLast4: sp.last4?.slice(0, 4) ?? "" }
          : null
      }
    />
  );
}
