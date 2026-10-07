// 今日の一覧(docs/07 §2-3):1人=全幅の白い行。名前の横に「必ず」、2行目に次の一言、3行目に状態を言葉で
// このあと今週の予定・終わっていない約束・記録にかかった時間(目標30秒)
import Link from "next/link";
import { connection } from "next/server";
import { nextActionText, type NextActionKindCode } from "@/lib/catalog";
import { buildCardView, type CardView } from "@/lib/card-view";
import { formatJstShort, formatYmdShort } from "@/lib/dates";
import { getCatalog, getCustomerCard, getStore, getTodayBoard, toHandoffVisits } from "@/lib/queries";
import { getCurrentStaff } from "@/lib/session";
import { TARGET_SECONDS, type InputSecondsSummary } from "@/lib/stats";
import { ActionDoneButton } from "./_components/ActionDoneButton";
import { Section, StaffName } from "./_components/ui";

function SecondsStat({ label, s }: { label: string; s: InputSecondsSummary }) {
  return (
    <div className="px-2 py-1 text-center">
      <div className="text-[13px] text-baton-sub">{label}</div>
      <div className="text-[22px] font-bold leading-tight text-baton-ai tabular-nums">
        {s.average ?? "-"}
        <span className="text-[13px]">秒</span>
      </div>
      <div className="text-xs text-baton-sub tabular-nums">
        {s.count}件・{TARGET_SECONDS}秒以内 {s.withinTargetPercent ?? "-"}%
      </div>
    </div>
  );
}

type OpenAction = Awaited<ReturnType<typeof getTodayBoard>>["openActions"][number];

/** 一度に見せる件数。古い約束から順に出す */
const VISIBLE_ACTIONS = 8;

function ActionList({ actions, canComplete }: { actions: OpenAction[]; canComplete: boolean }) {
  return (
    <ul className="divide-y divide-baton-line">
      {actions.map((a) => (
        <li key={a.id} className="flex min-h-14 items-center gap-3 py-2">
          <Link
            href={`/customers/${a.visit.customerId}`}
            className="flex min-h-12 min-w-0 flex-1 flex-col justify-center active:bg-baton-ji"
          >
            <div className="text-base font-bold leading-snug">{nextActionText(a.kind as NextActionKindCode, a.note)}</div>
            <div className="text-[13px] text-baton-sub tabular-nums">
              {a.visit.customer.nameKana}・{formatJstShort(a.visit.visitedAt)}{" "}
              <StaffName name={a.visit.staff.displayName} role={a.visit.staffRoleAtVisit} />
            </div>
          </Link>
          {canComplete ? <ActionDoneButton actionId={a.id} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** 3行目:状態を言葉で(0の状態は書かない)。色丸と数字だけの並びはやめた(07 §2-3) */
function StateWords({ counts }: { counts: CardView["counts"] }) {
  const parts = [
    counts.confirm > 0 ? { text: `先に確認${counts.confirm}`, shu: true } : null,
    counts.changed > 0 ? { text: `変更あり${counts.changed}`, shu: true } : null,
    counts.unclear > 0 ? { text: `あいまい${counts.unclear}`, shu: false } : null,
    counts.notYet > 0 ? { text: `まだ${counts.notYet}`, shu: false } : null,
  ].filter((p): p is { text: string; shu: boolean } => p !== null);
  if (parts.length === 0) return null;
  return (
    <p className="mt-0.5 text-[13px] text-baton-sub tabular-nums">
      {parts.map((p, n) => (
        <span key={p.text}>
          {n > 0 ? " ・ " : ""}
          <span className={p.shu ? "font-bold text-baton-shu" : ""}>{p.text}</span>
        </span>
      ))}
    </p>
  );
}

export default async function TodayPage() {
  await connection();
  const store = await getStore();
  if (!store) {
    return <p className="p-4">店のデータがありません。README の「動かし方」で seed を流してください。</p>;
  }
  const [board, current, catalog] = await Promise.all([
    getTodayBoard(store.id, new Date()),
    getCurrentStaff(store.id),
    getCatalog(),
  ]);
  // 今日来る人だけ、カードと同じ組み立てで「次の一言」と「必ず」を出す(人数は少ない)
  const cards = await Promise.all(board.scheduledToday.map((v) => getCustomerCard(store.id, v.customerId)));
  const views = new Map(
    cards.flatMap((c) => (c ? [[c.id, buildCardView(toHandoffVisits(c), catalog.checklist)] as const] : [])),
  );

  return (
    <div>
      {!current ? (
        <p className="border-l-8 border-baton-shu bg-baton-men px-4 py-3 text-[15px] font-bold text-baton-shu">
          最初に、画面上部で「今のスタッフ」を選んでください。記録に担当者として残ります。
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pb-2 pt-4">
        <h1 className="flex items-baseline gap-2 text-xl font-bold tabular-nums">
          今日 {formatYmdShort(board.today)}
          <span className="text-base">{board.scheduledToday.length}人</span>
        </h1>
        <span className="text-[13px] text-baton-sub">{store.name}</span>
      </div>
      <section aria-label="今日の来店予定" className="border-y border-baton-line bg-baton-men">
        {board.scheduledToday.length === 0 ? (
          <p className="px-4 py-3 text-[15px] text-baton-sub">今日の予定はありません。</p>
        ) : (
          <ul className="divide-y divide-baton-line">
            {board.scheduledToday.map((v) => {
              const view = views.get(v.customerId);
              return (
                <li key={v.id}>
                  <Link href={`/customers/${v.customerId}`} className="block px-4 py-3 active:bg-baton-ji">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                        <span className="text-[19px] font-bold leading-snug">{v.customer.nameKana}</span>
                        {view && view.counts.required > 0 ? (
                          <span className="rounded bg-baton-shu px-1.5 py-0.5 text-[13px] font-bold leading-tight text-baton-on-shu tabular-nums">
                            必ず {view.counts.required}
                          </span>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right text-[13px] leading-snug text-baton-sub tabular-nums">
                        <div>{v.customer.phoneLast4}</div>
                        <div>
                          前回 <StaffName name={v.staff.displayName} role={v.staffRoleAtVisit} />
                        </div>
                      </div>
                    </div>
                    {view ? (
                      <>
                        <p className="mt-1 flex items-baseline gap-2">
                          <span className="shrink-0 text-xs text-baton-next">次の一言</span>
                          <span className="min-w-0 text-[15px] font-bold leading-snug">
                            {view.next.spoken ? `「${view.next.main}」` : view.next.main}
                          </span>
                        </p>
                        <StateWords counts={view.counts} />
                      </>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-3">
        <Section
          title="このあと今週"
          note={`${formatYmdShort(board.week.start)}〜${formatYmdShort(board.week.end)}`}
        >
          {board.scheduledThisWeek.length === 0 ? (
            <p className="py-2 text-[15px] text-baton-sub">今週の予定はありません。</p>
          ) : (
            <ul className="divide-y divide-baton-line">
              {board.scheduledThisWeek.map((v) => (
                <li key={v.id}>
                  <Link href={`/customers/${v.customerId}`} className="block min-h-12 py-2 active:bg-baton-ji">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-base font-bold">{v.customer.nameKana}</span>
                      <span className="shrink-0 text-[13px] text-baton-sub tabular-nums">
                        {formatYmdShort(v.nextVisitYmd)}・{v.customer.phoneLast4}
                      </span>
                    </div>
                    <div className="text-[13px] text-baton-sub">
                      {v.topics.map((t) => t.topic.label).join("・")} ・ 前回{" "}
                      <StaffName name={v.staff.displayName} role={v.staffRoleAtVisit} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-3">
        <Section title="終わっていない約束" note={`${board.openActions.length}件`}>
          {board.openActions.length === 0 ? (
            <p className="py-2 text-[15px] text-baton-sub">すべて済んでいます。</p>
          ) : (
            <ActionList actions={board.openActions.slice(0, VISIBLE_ACTIONS)} canComplete={Boolean(current)} />
          )}
          {board.openActions.length > VISIBLE_ACTIONS ? (
            <details className="border-t border-baton-line">
              <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-bold text-baton-ai">
                残り {board.openActions.length - VISIBLE_ACTIONS} 件を見る
              </summary>
              <ActionList actions={board.openActions.slice(VISIBLE_ACTIONS)} canComplete={Boolean(current)} />
            </details>
          ) : null}
        </Section>
      </div>

      <div className="mt-3">
        <Section title="記録にかかった時間" note={`直近30日・目標${TARGET_SECONDS}秒以内`}>
          {board.stats.all.count === 0 ? (
            <p className="py-1 text-[15px] text-baton-sub">
              まだ実測なし。人が画面で記録すると、ここに平均の秒数が出ます。
            </p>
          ) : (
            <div className="grid grid-cols-3 divide-x divide-baton-line">
              <SecondsStat label="実測の平均" s={board.stats.all} />
              <SecondsStat label="常勤" s={board.stats.regular} />
              <SecondsStat label="イベント" s={board.stats.event} />
            </div>
          )}
          {board.stats.sample.count > 0 ? (
            <p className="mt-2 text-[13px] text-baton-sub tabular-nums">
              見本値(参考・作り物のデータ):平均 {board.stats.sample.average}秒・{board.stats.sample.count}件。
              実測の集計には入れていません。
            </p>
          ) : null}
        </Section>
      </div>
    </div>
  );
}
