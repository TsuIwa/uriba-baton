// お客様カード:一番上に「次の人へ」、その下に「話す順のヒント」、その下に過去の記録
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  TEMPERATURE_LABEL,
  nextActionText,
  type NextActionKindCode,
  type TemperatureCode,
} from "@/lib/catalog";
import { dbDateToYmd, formatJstShort, formatYmdShort } from "@/lib/dates";
import { buildHandoffSummary, buildTalkHints } from "@/lib/handoff";
import { getCatalog, getCustomerCard, getStore, toHandoffVisits } from "@/lib/queries";
import { getCurrentStaff } from "@/lib/session";
import { ActionDoneButton } from "../../_components/ActionDoneButton";
import { Pill, Section, StaffName } from "../../_components/ui";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CustomerCardPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { saved } = await searchParams;
  if (!UUID.test(id)) notFound();

  const store = await getStore();
  if (!store) notFound();
  const [card, catalog, current] = await Promise.all([
    getCustomerCard(store.id, id),
    getCatalog(),
    getCurrentStaff(store.id),
  ]);
  if (!card) notFound();

  const visits = toHandoffVisits(card);
  const summary = buildHandoffSummary(visits, catalog.checklist);
  const hints = buildTalkHints(visits, catalog.checklist);
  const savedSeconds = saved && /^\d+$/.test(saved) ? Number(saved) : null;
  const openActions = card.visits.flatMap((v) =>
    v.nextActions.filter((a) => a.doneAt === null).map((a) => ({ ...a, visitedAt: v.visitedAt })),
  );

  return (
    <div className="space-y-3">
      {savedSeconds !== null ? (
        <p role="status" className="rounded-xl bg-brand p-3 text-center text-sm font-bold text-white">
          保存しました(入力 {savedSeconds} 秒)
        </p>
      ) : null}

      <div className="flex items-end justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold">{card.nameKana}</h1>
          <p className="text-sm text-slate-600">
            下4桁 {card.phoneLast4}・来店 {card.visits.length} 回
          </p>
        </div>
      </div>

      <section
        aria-label="次の人へ"
        className="rounded-2xl border-2 border-brand bg-white p-4 shadow-sm"
      >
        <h2 className="mb-1 text-sm font-bold text-brand">次の人へ</h2>
        <p className="text-base leading-relaxed" data-testid="handoff-summary">
          {summary.text}
        </p>
      </section>

      <Section title="話す順のヒント">
        <ol className="space-y-2">
          {hints.map((h, i) => (
            <li key={h} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5">{h}</span>
            </li>
          ))}
        </ol>
      </Section>

      {openActions.length > 0 ? (
        <Section title="終わっていない「次にやること」">
          <ul className="divide-y divide-brand-line/60">
            {openActions.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <div className="flex-1">
                  <div className="font-bold">{nextActionText(a.kind as NextActionKindCode, a.note)}</div>
                  <div className="text-xs text-slate-500">{formatJstShort(a.visitedAt)} の記録から</div>
                </div>
                {current ? <ActionDoneButton actionId={a.id} back={`/customers/${card.id}`} /> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Link
        href={`/record?customerId=${card.id}`}
        className="flex min-h-14 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white shadow"
      >
        このお客様の記録を残す
      </Link>

      <Section title="これまでの記録" note="新しい順">
        <ol className="space-y-4">
          {card.visits.map((v) => (
            <li key={v.id} className="border-l-4 border-brand-line pl-3">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold">{formatJstShort(v.visitedAt)}</span>
                <StaffName name={v.staff.name} role={v.staff.role} />
                <span className="text-slate-600">{TEMPERATURE_LABEL[v.temperature as TemperatureCode]}</span>
                <span className="ml-auto text-xs text-slate-400">入力 {v.inputSeconds}秒</span>
              </div>
              {v.topics.map((t) => (
                <div key={t.topicId} className="mt-1.5">
                  <Pill>{t.topic.label}</Pill>
                  <span className="ml-2 text-sm text-slate-700">
                    {t.checks.length > 0
                      ? t.checks.map((c) => c.checklistItem.label).join("・")
                      : "(案内した項目なし)"}
                  </span>
                </div>
              ))}
              {v.nextActions.length > 0 ? (
                <ul className="mt-1.5 text-sm">
                  {v.nextActions.map((a) => (
                    <li key={a.id} className={a.doneAt ? "text-slate-400 line-through" : ""}>
                      次: {nextActionText(a.kind as NextActionKindCode, a.note)}
                      {a.doneAt && a.doneBy ? (
                        <span className="ml-1 no-underline">
                          ({formatJstShort(a.doneAt)} {a.doneBy.name} 済み)
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {v.nextVisitDate ? (
                <p className="mt-1 text-sm text-slate-600">
                  次回来店予定 {formatYmdShort(dbDateToYmd(v.nextVisitDate))}
                </p>
              ) : null}
              {v.memo ? <p className="mt-1 rounded bg-slate-50 p-2 text-sm">{v.memo}</p> : null}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
