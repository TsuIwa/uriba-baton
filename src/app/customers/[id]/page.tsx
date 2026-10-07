// お客様カード(docs/07 §2-1)。上から:名前 → バトン帯(前回の人→今日の人・何まで・先に確認・次の一言)
// → 話す順 → 終わっていない約束 → これまでの記録(畳む)→ 記録を残す
// 中身は handoff.ts の判定のまま。card-view.ts で並べ方だけを組み替える
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  TEMPERATURE_LABEL,
  nextActionText,
  type NextActionKindCode,
  type TemperatureCode,
} from "@/lib/catalog";
import { buildCardView } from "@/lib/card-view";
import { dbDateToYmd, formatJstShort, formatYmdShort } from "@/lib/dates";
import { getCatalog, getCustomerCard, getStore, toHandoffVisits } from "@/lib/queries";
import { getCurrentStaff } from "@/lib/session";
import { TARGET_SECONDS } from "@/lib/stats";
import { ActionDoneButton } from "../../_components/ActionDoneButton";
import { Caret, EventBadge, Section, StateLabel, StateMark, StaffName, Tag } from "../../_components/ui";

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

  const view = buildCardView(toHandoffVisits(card), catalog.checklist);
  // 入力秒数は測れなかった記録もある("na")
  const savedSeconds = saved === "na" ? "na" : saved && /^\d+$/.test(saved) ? Number(saved) : null;
  // 前回より前の記録の未完了は「担当者に確認してから」
  const latestVisitId = card.visits[0]?.id;
  const openActions = card.visits.flatMap((v) =>
    v.nextActions
      .filter((a) => a.doneAt === null)
      .map((a) => ({ ...a, visitedAt: v.visitedAt, staffName: v.staff.displayName, stale: v.id !== latestVisitId })),
  );

  return (
    <div>
      {savedSeconds !== null ? (
        <p role="status" className="bg-baton-ai-press px-4 py-2 text-center text-[15px] font-bold text-baton-on-ai">
          {savedSeconds === "na"
            ? "保存しました"
            : `保存しました(入力 ${savedSeconds} 秒・目標${TARGET_SECONDS}秒)`}
        </p>
      ) : null}

      {/* 名前の行 */}
      <div className="flex flex-wrap items-baseline gap-x-3 bg-baton-men px-4 pb-3 pt-3.5">
        <h1 className="text-[26px] font-bold leading-tight">{card.nameKana}</h1>
        <p className="text-sm text-baton-sub tabular-nums">
          下4桁 {card.phoneLast4}・来店 {card.visits.length} 回
        </p>
      </div>

      {/* 読み上げ用の要約(画面には出さない。目で読むのは下のバトン帯) */}
      <p className="sr-only" data-testid="handoff-summary">
        {view.summaryText}
      </p>

      {/* バトン帯:前回の人 → 今日の人と、次の一言を藍の帯1枚で手渡す */}
      <section aria-label="バトン" className="bg-baton-ai px-4 pb-5 pt-4 text-baton-on-ai">
        <div className="flex items-start gap-2">
          <div className="min-w-0 shrink">
            {view.from ? (
              <>
                <div className="text-[17px] font-bold leading-snug">
                  {view.from.staffName}
                  {view.from.role === "EVENT" ? <EventBadge onAi /> : null}
                </div>
                <div className="text-[13px] text-baton-on-ai-sub tabular-nums">
                  {view.from.date} {view.from.roleLabel}
                </div>
              </>
            ) : (
              <>
                <div className="text-[17px] font-bold leading-snug">初めてのお客様</div>
                <div className="text-[13px] text-baton-on-ai-sub">前回の記録なし</div>
              </>
            )}
          </div>
          {/* 矢印は線1本+三角 */}
          <div aria-hidden className="mt-3 flex min-w-6 flex-1 items-center">
            <span className="h-0.5 flex-1 bg-baton-on-ai-line" />
            <span className="size-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-baton-on-ai-sub" />
          </div>
          <span className="sr-only">から</span>
          <div className="min-w-0 shrink text-right">
            <div className="text-[17px] font-bold leading-snug">
              {current ? (
                <>
                  {current.displayName}
                  {current.role === "EVENT" ? <EventBadge onAi /> : null}
                </>
              ) : (
                "今のスタッフ未選択"
              )}
            </div>
            <div className="text-[13px] text-baton-on-ai-sub">今日</div>
          </div>
        </div>

        {view.upTo ? (
          <p className="mt-3 line-clamp-2 text-base leading-normal">
            <span className="sr-only">何まで:</span>
            {view.upTo.topics.join("・")}
            <span className="text-baton-on-ai-sub"> ・ </span>
            {view.upTo.doneItems.length > 0 ? (
              <b>{view.upTo.doneItems.join("・")}まで</b>
            ) : (
              <span>案内はまだ</span>
            )}
            <span className="text-baton-on-ai-sub"> ・ </span>
            <span className="whitespace-nowrap">{view.upTo.temperature}</span>
          </p>
        ) : null}

        {view.confirm.length > 0 ? (
          <div aria-label="先に確認" role="group" className="mt-4 rounded-xl bg-baton-shu px-3.5 py-3 text-baton-on-shu">
            <ul className="space-y-2.5">
              {view.confirm.map((c) => (
                <li key={`${c.date}${c.staffName}`} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 rounded bg-baton-men px-1.5 py-0.5 text-[13px] font-bold leading-tight text-baton-shu">
                    先に確認
                  </span>
                  <div className="min-w-0">
                    <p className="text-[17px] font-bold leading-snug">
                      {c.staffName}さんに{c.labels.map((l) => `「${l}」`).join("")}は済んだ?
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug tabular-nums">{c.date}の約束が<span className="whitespace-nowrap">未完了のまま</span></p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border-l-8 border-baton-next bg-baton-men py-3 pl-3.5 pr-4 text-baton-moji">
          <h2 className="text-xs font-bold tracking-[0.08em] text-baton-next">次の一言</h2>
          <p className="mt-1 text-[22px] font-bold leading-[1.45]">
            {view.next.spoken ? `「${view.next.main}」` : view.next.main}
          </p>
          {view.next.note ? <p className="mt-1.5 text-[13px] text-baton-sub">{view.next.note}</p> : null}
        </div>
      </section>

      {view.talk.length + view.explained.length > 0 ? (
        <Section title="話す順" note={view.from ? `前回 ${view.from.date}` : undefined}>
          <ul className="divide-y divide-baton-line">
            {view.talk.map((i) => (
              <li key={i.id} className="flex min-h-[52px] items-center gap-3 py-1.5">
                <StateMark state={i.state} />
                <span className="min-w-0 flex-1 text-[17px] font-bold leading-snug">{i.label}</span>
                <StateLabel state={i.state} />
              </li>
            ))}
          </ul>
          {view.explained.length > 0 ? (
            <details className={view.talk.length > 0 ? "border-t border-baton-line" : ""}>
              <summary className="flex min-h-[52px] cursor-pointer items-center gap-3 py-1.5">
                <StateMark state="EXPLAINED" />
                <span className="flex-1 text-[17px] text-baton-sub">
                  説明済み <span className="tabular-nums">{view.explained.length}</span>件
                </span>
                <span className="text-[13px] text-baton-done">
                  理解度を伺う
                  <Caret />
                </span>
              </summary>
              <ul className="pb-1 pl-10">
                {view.explained.map((i) => (
                  <li key={i.id} className="flex min-h-11 items-center justify-between gap-2 text-baton-sub">
                    <span className="text-base">{i.label}</span>
                    {i.lastExplainedOn ? (
                      <span className="text-[13px] tabular-nums">{formatYmdShort(i.lastExplainedOn)} 案内</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Section>
      ) : null}

      {openActions.length > 0 ? (
        <div className="mt-3">
          <Section title="終わっていない約束" note={`${openActions.length}件`}>
            <ul className="divide-y divide-baton-line">
              {openActions.map((a) => (
                <li key={a.id} className="flex min-h-14 items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold leading-snug">
                      {nextActionText(a.kind as NextActionKindCode, a.note)}
                    </div>
                    <div className="text-[13px] text-baton-sub tabular-nums">
                      {formatJstShort(a.visitedAt)} {a.staffName}
                      {a.stale ? `・先に${a.staffName}さんに確認` : ""}
                    </div>
                  </div>
                  {current ? <ActionDoneButton actionId={a.id} back={`/customers/${card.id}`} /> : null}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      ) : null}

      <div className="mt-3">
        <details className="border-y border-baton-line bg-baton-men">
          <summary className="flex min-h-[52px] cursor-pointer items-center justify-between px-4 text-base">
            <span>
              これまでの記録 <span className="tabular-nums">{card.visits.length}</span>件
            </span>
            <span className="text-[15px] text-baton-sub">
              開く
              <Caret />
            </span>
          </summary>
          <ol className="space-y-4 border-t border-baton-line px-4 py-3">
            {card.visits.map((v) => (
              <li key={v.id} className="border-l-4 border-baton-line pl-3">
                <div className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
                  <span className="font-bold tabular-nums">{formatJstShort(v.visitedAt)}</span>
                  <StaffName name={v.staff.displayName} role={v.staffRoleAtVisit} />
                  <span className="text-baton-sub">{TEMPERATURE_LABEL[v.temperature as TemperatureCode]}</span>
                  <span className="ml-auto text-[13px] text-baton-sub tabular-nums">
                    {v.source === "MANUAL"
                      ? v.inputSeconds === null
                        ? "入力 —"
                        : `入力 ${v.inputSeconds}秒`
                      : v.source === "SEED"
                        ? "見本データ"
                        : v.source === "E2E"
                          ? "自動テスト"
                          : "出どころ不明"}
                  </span>
                </div>
                {v.topics.map((t) => (
                  <div key={t.topicId} className="mt-1.5 text-[15px]">
                    <Tag>{t.topic.label}</Tag>
                    <span className="ml-2">
                      {t.checks.length > 0
                        ? t.checks
                            .map((c) => `${c.understandingUnclear ? "?" : ""}${c.checklistItem.label}`)
                            .join("・")
                        : "(案内した項目なし)"}
                    </span>
                  </div>
                ))}
                {v.nextActions.length > 0 ? (
                  <ul className="mt-1.5 text-[15px]">
                    {v.nextActions.map((a) => (
                      <li key={a.id} className={a.doneAt ? "text-baton-sub line-through" : ""}>
                        次: {nextActionText(a.kind as NextActionKindCode, a.note)}
                        {a.doneAt && a.doneBy ? (
                          <span className="ml-1 tabular-nums">
                            ({formatJstShort(a.doneAt)} {a.doneBy.displayName} 済み)
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {v.nextVisitDate ? (
                  <p className="mt-1 text-[15px] text-baton-sub tabular-nums">
                    次回来店予定 {formatYmdShort(dbDateToYmd(v.nextVisitDate))}
                  </p>
                ) : null}
                {v.memo ? <p className="mt-1 rounded bg-baton-ji p-2 text-[15px]">{v.memo}</p> : null}
              </li>
            ))}
          </ol>
        </details>
      </div>

      <div className="px-4 pt-4">
        <Link
          href={`/record?customerId=${card.id}`}
          className="flex min-h-14 items-center justify-center rounded-xl bg-baton-ai text-lg font-bold text-baton-on-ai active:bg-baton-ai-press"
        >
          このお客様の記録を残す
        </Link>
        <p className="mt-1.5 text-center text-[13px] text-baton-sub">目標{TARGET_SECONDS}秒・文字を打たずに残せます</p>
      </div>
    </div>
  );
}
