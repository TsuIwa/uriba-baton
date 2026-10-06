"use client";

// 30秒で残す記録フォーム。上から順にタップしていけば保存まで行ける並びにしている。
// 画面を開いた時刻から保存を押した時刻までの秒数を、記録と一緒に保存する。

import { useEffect, useRef, useState, useTransition } from "react";
import { NEXT_ACTIONS, TEMPERATURES, type NextActionKindCode, type TemperatureCode } from "@/lib/catalog";
import { addDays, formatYmdShort } from "@/lib/dates";
import { elapsedSeconds } from "@/lib/stats";
import { findCustomers, saveVisit, type CustomerOption } from "../actions";

type Topic = { id: number; code: string; label: string; items: { id: number; label: string }[] };

type Props = {
  topics: Topic[];
  staffName: string | null;
  today: string;
  initialCustomer: CustomerOption | null;
  initialTopicIds: number[];
  initialNew: { nameKana: string; phoneLast4: string } | null;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** タップで選ぶボタン。選ぶと藍色になる */
function Chip({
  selected,
  onClick,
  children,
  wide,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-12 rounded-xl border-2 px-3 text-base font-bold transition-colors ${
        wide ? "w-full" : ""
      } ${selected ? "border-brand bg-brand text-white" : "border-brand-line bg-white text-slate-700"}`}
    >
      {children}
    </button>
  );
}

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-line/60">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-brand">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand text-xs text-white">{n}</span>
        {title}
        {note ? <span className="text-xs font-normal text-slate-500">{note}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function RecordForm({ topics, staffName, today, initialCustomer, initialTopicIds, initialNew }: Props) {
  // 計測の開始時刻。画面が表示された時点で決める
  const startedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    startedAt.current = Date.now();
    const timer = setInterval(() => {
      if (startedAt.current !== null) setElapsed(elapsedSeconds(startedAt.current, Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. お客様
  const [customer, setCustomer] = useState<CustomerOption | null>(initialCustomer);
  const [isNew, setIsNew] = useState(initialNew !== null && initialCustomer === null);
  const [newKana, setNewKana] = useState(initialNew?.nameKana ?? "");
  const [newLast4, setNewLast4] = useState(initialNew?.phoneLast4 ?? "");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CustomerOption[]>([]);

  useEffect(() => {
    if (customer || isNew || query.trim() === "") return;
    // 打つたびに問い合わせないよう、手が止まって0.25秒後に探す
    let cancelled = false;
    const t = setTimeout(async () => {
      const found = await findCustomers(query);
      if (!cancelled) setOptions(found);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, customer, isNew]);

  // 新規で入れている人が、もう登録されていないか(二重登録を防ぐため候補を見せる)
  const [sameOnes, setSameOnes] = useState<CustomerOption[]>([]);
  useEffect(() => {
    if (!isNew || newLast4.length !== 4) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const found = await findCustomers(`${newKana} ${newLast4}`);
      if (!cancelled) setSameOnes(found);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isNew, newKana, newLast4]);
  const duplicates = isNew && newLast4.length === 4 ? sameOnes : [];

  // 2〜6
  const [topicIds, setTopicIds] = useState<number[]>(initialTopicIds);
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [temperature, setTemperature] = useState<TemperatureCode | null>(null);
  const [actions, setActions] = useState<NextActionKindCode[]>([]);
  const [otherNote, setOtherNote] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState("");

  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const selectedTopics = topics.filter((t) => topicIds.includes(t.id));
  const hasCustomer = customer !== null || (isNew && newKana.trim() !== "" && newLast4.length === 4);
  const ready = staffName !== null && hasCustomer && topicIds.length > 0 && temperature !== null;

  function toggleTopic(id: number) {
    const next = toggle(topicIds, id);
    setTopicIds(next);
    // 外した用件のチェックは一緒に外す(DBの制約にも合わせる)
    const allowed = new Set(topics.filter((t) => next.includes(t.id)).flatMap((t) => t.items.map((i) => i.id)));
    setItemIds((prev) => prev.filter((i) => allowed.has(i)));
  }

  function submit() {
    const seconds = startedAt.current === null ? 0 : elapsedSeconds(startedAt.current, Date.now());
    const payload = {
      customer: customer
        ? { kind: "existing", id: customer.id }
        : { kind: "new", nameKana: newKana, phoneLast4: newLast4 },
      topicIds,
      checklistItemIds: itemIds,
      temperature,
      actions,
      otherNote,
      nextVisitDate,
      memo,
      inputSeconds: seconds,
    };
    startTransition(async () => {
      const result = await saveVisit(payload);
      // 成功したときはサーバー側でお客様カードへ移るので、ここに来るのは失敗のときだけ
      if (result && !result.ok) setErrors(result.errors);
    });
  }

  const quickDates = [
    { label: "今日", value: today },
    { label: "明日", value: addDays(today, 1) },
    { label: "3日後", value: addDays(today, 3) },
    { label: "1週間後", value: addDays(today, 7) },
  ];

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-bold">記録する</h1>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand" aria-live="off">
          {elapsed}秒
        </span>
      </div>

      {staffName === null ? (
        <p className="rounded-xl bg-accent-soft p-3 text-sm font-bold text-accent">
          画面上部で「今のスタッフ」を選んでください。担当者として記録に残ります。
        </p>
      ) : (
        <p className="px-1 text-sm text-slate-600">
          担当:<span className="font-bold text-slate-800">{staffName}</span>
        </p>
      )}

      <Step n={1} title="お客様">
        {customer ? (
          <div className="flex items-center justify-between rounded-xl bg-brand-soft p-3">
            <div>
              <div className="text-lg font-bold">{customer.nameKana}</div>
              <div className="text-xs text-slate-600">下4桁 {customer.phoneLast4}</div>
            </div>
            <button type="button" onClick={() => setCustomer(null)} className="min-h-11 px-3 text-sm text-brand underline">
              変える
            </button>
          </div>
        ) : isNew ? (
          <div className="space-y-2">
            <input
              value={newKana}
              onChange={(e) => setNewKana(e.target.value)}
              placeholder="お名前(カナ・ひらがな)"
              aria-label="お名前カナ"
              autoComplete="off"
              className="min-h-12 w-full rounded-xl border border-brand-line px-3 text-base"
            />
            <input
              value={newLast4}
              onChange={(e) => setNewLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="電話番号の下4桁"
              aria-label="電話番号の下4桁"
              inputMode="numeric"
              autoComplete="off"
              className="min-h-12 w-full rounded-xl border border-brand-line px-3 text-base"
            />
            <p className="text-xs text-slate-500">電話番号は下4桁だけ残します(全部は保存しません)。</p>
            {duplicates.length > 0 ? (
              <div className="rounded-xl bg-accent-soft p-3" role="status">
                <p className="mb-2 text-sm font-bold text-accent">登録済みかもしれません。同じ方ならタップ:</p>
                <ul className="space-y-1">
                  {duplicates.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomer(o);
                          setIsNew(false);
                        }}
                        className="flex min-h-12 w-full items-center justify-between rounded-lg bg-white px-3 text-left"
                      >
                        <span className="font-bold">{o.nameKana}</span>
                        <span className="text-xs text-slate-500">下4桁 {o.phoneLast4}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button type="button" onClick={() => setIsNew(false)} className="min-h-11 text-sm text-brand underline">
              登録済みのお客様から探す
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="カナ か 下4桁で探す"
              aria-label="お客様を探す"
              autoComplete="off"
              className="min-h-12 w-full rounded-xl border border-brand-line px-3 text-base"
            />
            {query.trim() !== "" && options.length > 0 ? (
              <ul className="space-y-1">
                {options.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setCustomer(o)}
                      className="flex min-h-12 w-full items-center justify-between rounded-xl border border-brand-line px-3 text-left active:bg-brand-soft"
                    >
                      <span className="font-bold">{o.nameKana}</span>
                      <span className="text-xs text-slate-500">
                        下4桁 {o.phoneLast4}
                        {o.lastVisit ? `・前回 ${formatYmdShort(o.lastVisit)}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={() => setIsNew(true)}
              className="min-h-12 w-full rounded-xl border-2 border-dashed border-brand text-base font-bold text-brand"
            >
              ＋ 新規のお客様
            </button>
          </div>
        )}
      </Step>

      <Step n={2} title="用件" note="複数OK">
        <div className="grid grid-cols-2 gap-2">
          {topics.map((t) => (
            <Chip key={t.id} selected={topicIds.includes(t.id)} onClick={() => toggleTopic(t.id)} wide>
              {t.label}
            </Chip>
          ))}
        </div>
      </Step>

      <Step n={3} title="案内したこと" note="済んだものだけ">
        {selectedTopics.length === 0 ? (
          <p className="text-sm text-slate-500">用件を選ぶと、案内する項目が出ます。</p>
        ) : (
          <div className="space-y-3">
            {selectedTopics.map((t) => (
              <div key={t.id}>
                <div className="mb-1.5 text-sm font-bold text-slate-600">{t.label}</div>
                <div className="flex flex-wrap gap-2">
                  {t.items.map((i) => (
                    <Chip key={i.id} selected={itemIds.includes(i.id)} onClick={() => setItemIds(toggle(itemIds, i.id))}>
                      {i.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Step>

      <Step n={4} title="お客様の温度感">
        <div className="grid grid-cols-2 gap-2">
          {TEMPERATURES.map((t) => (
            <Chip key={t.code} selected={temperature === t.code} onClick={() => setTemperature(t.code)} wide>
              {t.label}
            </Chip>
          ))}
        </div>
      </Step>

      <Step n={5} title="次にやること" note="なければ飛ばしてOK">
        <div className="flex flex-wrap gap-2">
          {NEXT_ACTIONS.map((a) => (
            <Chip key={a.code} selected={actions.includes(a.code)} onClick={() => setActions(toggle(actions, a.code))}>
              {a.label}
            </Chip>
          ))}
        </div>
        {actions.includes("OTHER") ? (
          <input
            value={otherNote}
            onChange={(e) => setOtherNote(e.target.value)}
            placeholder="その他の中身(例: ケースの取り寄せ)"
            aria-label="その他の中身"
            maxLength={100}
            className="mt-2 min-h-12 w-full rounded-xl border border-brand-line px-3 text-base"
          />
        ) : null}
      </Step>

      <Step n={6} title="次回来店予定" note="任意">
        <div className="flex flex-wrap gap-2">
          {quickDates.map((d) => (
            <Chip
              key={d.label}
              selected={nextVisitDate === d.value}
              onClick={() => setNextVisitDate(nextVisitDate === d.value ? "" : d.value)}
            >
              {d.label}
            </Chip>
          ))}
          <input
            type="date"
            value={nextVisitDate}
            min={today}
            onChange={(e) => setNextVisitDate(e.target.value)}
            aria-label="次回来店予定日"
            className="min-h-12 rounded-xl border border-brand-line px-2 text-base"
          />
        </div>
      </Step>

      {memoOpen ? (
        <Step n={7} title="メモ" note="任意">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={500}
            rows={3}
            aria-label="メモ"
            className="w-full rounded-xl border border-brand-line p-3 text-base"
          />
        </Step>
      ) : (
        <button type="button" onClick={() => setMemoOpen(true)} className="min-h-11 px-1 text-sm text-brand underline">
          ＋ メモを書く(任意)
        </button>
      )}

      {errors.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-xl bg-accent-soft p-3 text-sm font-bold text-accent">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-line bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={submit}
            disabled={!ready || pending}
            className="min-h-14 w-full rounded-xl bg-accent text-lg font-bold text-white shadow disabled:bg-slate-300"
          >
            {pending ? "保存中…" : ready ? "保存する" : "お客様・用件・温度感を選ぶと保存できます"}
          </button>
        </div>
      </div>
    </div>
  );
}
