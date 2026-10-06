// 今日の一覧:来店予定・終わっていない「次にやること」・入力にかかった秒数
import Link from "next/link";
import { connection } from "next/server";
import { nextActionText, type NextActionKindCode } from "@/lib/catalog";
import { formatJstShort, formatYmdShort } from "@/lib/dates";
import { getStore, getTodayBoard } from "@/lib/queries";
import { getCurrentStaff } from "@/lib/session";
import { TARGET_SECONDS, type InputSecondsSummary } from "@/lib/stats";
import { ActionDoneButton } from "./_components/ActionDoneButton";
import { Pill, Section, StaffName } from "./_components/ui";

function SecondsStat({ label, s }: { label: string; s: InputSecondsSummary }) {
  return (
    <div className="rounded-xl bg-brand-soft p-3 text-center">
      <div className="text-xs text-slate-600">{label}</div>
      <div className="text-2xl font-bold text-brand">
        {s.average ?? "-"}
        <span className="text-sm">秒</span>
      </div>
      <div className="text-[11px] text-slate-600">
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
    <ul className="divide-y divide-brand-line/60">
      {actions.map((a) => (
        <li key={a.id} className="flex items-center gap-3 py-2">
          <Link href={`/customers/${a.visit.customerId}`} className="min-w-0 flex-1">
            <div className="font-bold">{nextActionText(a.kind as NextActionKindCode, a.note)}</div>
            <div className="truncate text-xs text-slate-600">
              {a.visit.customer.nameKana}・{formatJstShort(a.visit.visitedAt)}{" "}
              <StaffName name={a.visit.staff.name} role={a.visit.staffRoleAtVisit} />
            </div>
          </Link>
          {canComplete ? <ActionDoneButton actionId={a.id} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default async function TodayPage() {
  await connection();
  const store = await getStore();
  if (!store) {
    return <p className="p-4">店のデータがありません。README の「動かし方」で seed を流してください。</p>;
  }
  const [board, current] = await Promise.all([
    getTodayBoard(store.id, new Date()),
    getCurrentStaff(store.id),
  ]);

  const scheduledRow = (v: (typeof board.scheduledToday)[number], showDate: boolean) => (
    <li key={v.id}>
      <Link
        href={`/customers/${v.customerId}`}
        className="block rounded-xl border border-brand-line p-3 active:bg-brand-soft"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-bold">{v.customer.nameKana}</span>
          <span className="text-xs text-slate-500">
            {showDate ? `${formatYmdShort(v.nextVisitYmd)} ・ ` : ""}下4桁 {v.customer.phoneLast4}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-slate-600">
          {v.topics.map((t) => (
            <Pill key={t.topicId}>{t.topic.label}</Pill>
          ))}
          <span className="ml-1">
            前回 <StaffName name={v.staff.name} role={v.staffRoleAtVisit} />
          </span>
        </div>
      </Link>
    </li>
  );

  return (
    <div className="space-y-3">
      {!current ? (
        <p className="rounded-xl bg-accent-soft p-3 text-sm font-bold text-accent">
          最初に、画面上部で「今のスタッフ」を選んでください。記録に担当者として残ります。
        </p>
      ) : null}

      <Section title={`今日 ${formatYmdShort(board.today)} の来店予定`} note={`${board.scheduledToday.length}人`}>
        {board.scheduledToday.length === 0 ? (
          <p className="text-sm text-slate-500">今日の予定はありません。</p>
        ) : (
          <ul className="space-y-2">{board.scheduledToday.map((v) => scheduledRow(v, false))}</ul>
        )}
      </Section>

      <Section
        title="今週のこのあとの予定"
        note={`${formatYmdShort(board.week.start)}〜${formatYmdShort(board.week.end)}`}
      >
        {board.scheduledThisWeek.length === 0 ? (
          <p className="text-sm text-slate-500">今週の予定はありません。</p>
        ) : (
          <ul className="space-y-2">{board.scheduledThisWeek.map((v) => scheduledRow(v, true))}</ul>
        )}
      </Section>

      <Section title="終わっていない「次にやること」" note={`${board.openActions.length}件`}>
        {board.openActions.length === 0 ? (
          <p className="text-sm text-slate-500">すべて済んでいます。</p>
        ) : (
          <ActionList actions={board.openActions.slice(0, VISIBLE_ACTIONS)} canComplete={Boolean(current)} />
        )}
        {board.openActions.length > VISIBLE_ACTIONS ? (
          <details className="mt-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand">
              残り {board.openActions.length - VISIBLE_ACTIONS} 件を見る
            </summary>
            <ActionList actions={board.openActions.slice(VISIBLE_ACTIONS)} canComplete={Boolean(current)} />
          </details>
        ) : null}
      </Section>

      <Section title="記録にかかった時間" note="直近30日・目標30秒以内">
        {board.stats.all.count === 0 ? (
          <p className="rounded-xl bg-brand-soft p-3 text-sm font-bold text-brand">
            まだ実測なし。人が画面で記録すると、ここに平均の秒数が出ます。
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <SecondsStat label="実測の平均" s={board.stats.all} />
            <SecondsStat label="常勤" s={board.stats.regular} />
            <SecondsStat label="イベント" s={board.stats.event} />
          </div>
        )}
        {board.stats.sample.count > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            見本値(参考・作り物のデータ):平均 {board.stats.sample.average}秒・{board.stats.sample.count}件。
            実測の集計には入れていません。
          </p>
        ) : null}
      </Section>
    </div>
  );
}
