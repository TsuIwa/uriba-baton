"use client";

// 30秒で残す記録フォーム(docs/07 §2-2)。5つの段に分け、今の段だけ開く。済んだ段は1行に畳む。
// お客様を選ぶ・温度感を押すと自動で次の段へ進む。文字を打たずに保存まで行ける(メモと「その他」以外)。
// 最初の入力(タップ・文字入力)から保存を押すまでの秒数を、記録と一緒に保存する。
// 画面を開いた時からにしないのは、接客中に画面を開いたままにすることがあり、接客の時間が混ざるため。

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  NEXT_ACTIONS,
  NEXT_ACTION_LABEL,
  TEMPERATURES,
  TEMPERATURE_LABEL,
  type NextActionKindCode,
  type TemperatureCode,
} from "@/lib/catalog";
import { addDays, formatYmdShort } from "@/lib/dates";
import { TARGET_SECONDS, elapsedSeconds, inputSeconds } from "@/lib/stats";
import { findCustomers, saveVisit, type CustomerOption } from "../actions";

type Topic = {
  id: number;
  code: string;
  label: string;
  /** version = 画面に出した時点の中身の版 */
  items: { id: number; label: string; version: number }[];
};

type Props = {
  topics: Topic[];
  staffName: string | null;
  /** 画面に出している担当者。保存時に「今のスタッフ」と食い違えば、サーバーが断る */
  staffId: number | null;
  today: string;
  initialCustomer: CustomerOption | null;
  initialTopicIds: number[];
  initialNew: { nameKana: string; phoneLast4: string } | null;
};

type StepNo = 1 | 2 | 3 | 4 | 5;
const STEP_TITLE: Record<StepNo, string> = {
  1: "お客様",
  2: "用件",
  3: "案内したこと",
  4: "温度感",
  5: "次にやること・来店予定",
};
const STEPS: StepNo[] = [1, 2, 3, 4, 5];

/** 最初の入力から今までの秒数(押した瞬間に1回だけ測る) */
function secondsSince(firstInputAtMs: number | null): number | null {
  return inputSeconds(firstInputAtMs, Date.now());
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** タップで選ぶボタン(角丸10。選ぶと藍の塗り) */
function Choice({
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
      className={`min-h-12 rounded-[10px] border-2 px-3 text-base font-bold transition-colors duration-150 ${
        wide ? "w-full" : ""
      } ${
        selected
          ? "border-baton-ai bg-baton-ai text-baton-on-ai"
          : "border-baton-line-strong bg-baton-men text-baton-moji active:bg-baton-ji"
      }`}
    >
      {children}
    </button>
  );
}

function NextButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <div className="mt-3 flex justify-end">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="min-h-12 min-w-24 rounded-[10px] bg-baton-ai px-5 text-lg font-bold text-baton-on-ai active:bg-baton-ai-press disabled:bg-baton-line disabled:text-baton-sub"
      >
        次へ
      </button>
    </div>
  );
}

export function RecordForm({
  topics,
  staffName,
  staffId,
  today,
  initialCustomer,
  initialTopicIds,
  initialNew,
}: Props) {
  // 計測の開始時刻(最初の入力の時)と送信ID(画面が表示された時)
  // 送信IDは、保存を2回押した・通信が切れて送り直した、でも記録を1件にするために使う
  const startedAt = useRef<number | null>(null);
  const requestId = useRef<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    requestId.current = crypto.randomUUID();
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

  // 2〜5
  const [topicIds, setTopicIds] = useState<number[]>(initialTopicIds);
  const [itemIds, setItemIds] = useState<number[]>([]);
  // 案内したが理解があいまいだった項目(任意。あいまいは説明済みにも数える)
  const [unclearIds, setUnclearIds] = useState<number[]>([]);
  const [temperature, setTemperature] = useState<TemperatureCode | null>(null);
  const [actions, setActions] = useState<NextActionKindCode[]>([]);
  const [otherNote, setOtherNote] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState("");

  // 計測は「入力の値が最初に変わった時」から。タップでもキーボードでも、ここ1か所で拾う
  // (画面を開いた時からにすると、画面を開いたまま接客している時間が混ざる)
  const formValues = JSON.stringify([
    customer?.id ?? null,
    isNew,
    newKana,
    newLast4,
    query,
    topicIds,
    itemIds,
    unclearIds,
    temperature,
    actions,
    otherNote,
    nextVisitDate,
    memo,
  ]);
  const initialValues = useRef(formValues);
  useEffect(() => {
    if (startedAt.current === null && formValues !== initialValues.current) startedAt.current = Date.now();
  }, [formValues]);

  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const selectedTopics = topics.filter((t) => topicIds.includes(t.id));
  const hasCustomer = customer !== null || (isNew && newKana.trim() !== "" && newLast4.length === 4);
  const missing = [
    staffName === null ? "今のスタッフ" : null,
    hasCustomer ? null : "お客様",
    topicIds.length > 0 ? null : "用件",
    temperature !== null ? null : "温度感",
  ].filter((m): m is string => m !== null);
  const ready = missing.length === 0;

  // どの段が済んだか(任意の段3・5は、一度「次へ」で通ったら済み)
  const [passed, setPassed] = useState<StepNo[]>([]);
  const isDone = (s: StepNo): boolean =>
    s === 1 ? hasCustomer : s === 2 ? topicIds.length > 0 : s === 4 ? temperature !== null : passed.includes(s);
  // 最初に開く段:前回の用件まで入っている(カードから来た)なら「案内したこと」から
  const [open, setOpen] = useState<StepNo>(initialCustomer ? (initialTopicIds.length > 0 ? 3 : 2) : 1);
  const stepRefs = useRef<Partial<Record<StepNo, HTMLElement | null>>>({});

  function openStep(s: StepNo) {
    setOpen(s);
    // 開いた段が見えるところへ(下の保存ボタンに隠れないよう、上にそろえる)
    requestAnimationFrame(() => stepRefs.current[s]?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  /** 今の段を済みにして、まだの段のうち次のものを開く(無ければ最後の段) */
  function goNext(from: StepNo, doneNow: Partial<Record<StepNo, boolean>> = {}) {
    if (from === 3 || from === 5) setPassed((p) => (p.includes(from) ? p : [...p, from]));
    const done = (s: StepNo) => doneNow[s] ?? isDone(s);
    const next = STEPS.find((s) => s > from && !done(s)) ?? 5;
    openStep(next);
  }

  function toggleTopic(id: number) {
    const next = toggle(topicIds, id);
    setTopicIds(next);
    // 外した用件のチェックは一緒に外す(DBの制約にも合わせる)
    const allowed = new Set(topics.filter((t) => next.includes(t.id)).flatMap((t) => t.items.map((i) => i.id)));
    setItemIds((prev) => prev.filter((i) => allowed.has(i)));
    setUnclearIds((prev) => prev.filter((i) => allowed.has(i)));
  }

  /** 「説明済み」を押す:もう一度押すと外す。あいまいだったら説明済みに直す */
  function pressExplained(id: number) {
    if (itemIds.includes(id) && !unclearIds.includes(id)) {
      setItemIds(itemIds.filter((i) => i !== id));
    } else {
      setItemIds(itemIds.includes(id) ? itemIds : [...itemIds, id]);
      setUnclearIds(unclearIds.filter((i) => i !== id));
    }
  }

  /** 「あいまい」を押す:説明済みにも記録する(今までと同じ)。もう一度押すと両方外す */
  function pressUnclear(id: number) {
    if (unclearIds.includes(id)) {
      setUnclearIds(unclearIds.filter((i) => i !== id));
      setItemIds(itemIds.filter((i) => i !== id));
    } else {
      setUnclearIds([...unclearIds, id]);
      setItemIds(itemIds.includes(id) ? itemIds : [...itemIds, id]);
    }
  }

  function chooseCustomer(o: CustomerOption) {
    setCustomer(o);
    setIsNew(false);
    goNext(1, { 1: true });
  }

  /** 足りない段のうち最初のものを開く */
  function openMissing() {
    openStep(!hasCustomer ? 1 : topicIds.length === 0 ? 2 : 4);
  }

  function submit() {
    // 足りない段があれば、保存せずにその段を開く(保存ボタンは無効にしない)
    if (staffName !== null && !ready) {
      openMissing();
      return;
    }
    const seconds = secondsSince(startedAt.current);
    const payload = {
      requestId: requestId.current,
      staffId,
      customer: customer
        ? { kind: "existing", id: customer.id }
        : { kind: "new", nameKana: newKana, phoneLast4: newLast4 },
      topicIds,
      checklistItemIds: itemIds,
      unclearItemIds: unclearIds,
      // 画面に出ていた版(=説明した版)。保存までに改定されていたらサーバーが断る
      itemVersions: Object.fromEntries(
        topics.flatMap((t) => t.items).filter((i) => itemIds.includes(i.id)).map((i) => [i.id, i.version]),
      ),
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
      if (result && !result.ok) {
        setErrors(result.errors);
        // 同じ送信IDで中身が変わっていると断られたら、次の保存は新しい記録として送る
        if (result.code === "REQUEST_CONFLICT") requestId.current = crypto.randomUUID();
        // 中身が改定されていたら、新しい版を読み直す(入れた内容はそのまま残る)
        if (result.code === "CONTENT_CHANGED") router.refresh();
      }
    });
  }

  const quickDates = [
    { label: "今日", value: today },
    { label: "明日", value: addDays(today, 1) },
    { label: "3日後", value: addDays(today, 3) },
    { label: "1週間後", value: addDays(today, 7) },
  ];

  // 畳んだ段に出す値
  const allItems = topics.flatMap((t) => t.items);
  const itemSummary = allItems
    .filter((i) => itemIds.includes(i.id))
    .map((i) => `${unclearIds.includes(i.id) ? "?" : ""}${i.label}`)
    .join("・");
  const extraSummary = [
    ...actions.map((a) => (a === "OTHER" ? otherNote.trim() || "その他" : NEXT_ACTION_LABEL[a])),
    nextVisitDate ? `来店 ${formatYmdShort(nextVisitDate)}` : null,
    memo.trim() ? "メモあり" : null,
  ]
    .filter(Boolean)
    .join("・");
  const doneValue: Record<StepNo, string> = {
    1: customer
      ? `${customer.nameKana} ${customer.phoneLast4}`
      : `${newKana} ${newLast4}(新規)`,
    2: selectedTopics.map((t) => t.label).join("・"),
    3: itemSummary || "案内なし",
    4: temperature ? TEMPERATURE_LABEL[temperature] : "",
    5: extraSummary || "なし",
  };

  function stepBody(s: StepNo) {
    switch (s) {
      case 1:
        return isNew ? (
          <div className="space-y-2">
            <input
              value={newKana}
              onChange={(e) => setNewKana(e.target.value)}
              placeholder="お名前(カナ・ひらがな)"
              aria-label="お名前カナ"
              autoComplete="off"
              className="min-h-12 w-full rounded-[10px] border border-baton-line-strong px-3 text-base"
            />
            <input
              value={newLast4}
              onChange={(e) => setNewLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="電話番号の下4桁"
              aria-label="電話番号の下4桁"
              inputMode="numeric"
              autoComplete="off"
              className="min-h-12 w-full rounded-[10px] border border-baton-line-strong px-3 text-base tabular-nums"
            />
            <p className="text-[13px] text-baton-sub">電話番号は下4桁だけ残します(全部は保存しません)。</p>
            {duplicates.length > 0 ? (
              <div className="border-l-4 border-baton-ai bg-baton-ji p-3" role="status">
                <p className="mb-2 text-[15px] font-bold">登録済みかもしれません。同じ方ならタップ:</p>
                <ul className="space-y-1">
                  {duplicates.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => chooseCustomer(o)}
                        className="flex min-h-12 w-full items-center justify-between rounded-[10px] border border-baton-line-strong bg-baton-men px-3 text-left"
                      >
                        <span className="font-bold">{o.nameKana}</span>
                        <span className="text-[13px] text-baton-sub tabular-nums">下4桁 {o.phoneLast4}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsNew(false)}
                className="min-h-11 text-[15px] text-baton-ai underline underline-offset-4"
              >
                登録済みのお客様から探す
              </button>
              <NextButton onClick={() => goNext(1)} disabled={!hasCustomer} />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="カナ か 下4桁で探す"
              aria-label="お客様を探す"
              autoComplete="off"
              className="min-h-12 w-full rounded-[10px] border border-baton-line-strong px-3 text-base"
            />
            {query.trim() !== "" && options.length > 0 ? (
              <ul className="divide-y divide-baton-line border-y border-baton-line">
                {options.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => chooseCustomer(o)}
                      className="flex min-h-14 w-full items-center justify-between gap-2 px-1 text-left active:bg-baton-ji"
                    >
                      <span className="text-[17px] font-bold">{o.nameKana}</span>
                      <span className="text-[13px] text-baton-sub tabular-nums">
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
              className="min-h-12 w-full rounded-[10px] border-2 border-baton-ai bg-baton-men text-base font-bold text-baton-ai active:bg-baton-ji"
            >
              ＋ 新規のお客様
            </button>
          </div>
        );
      case 2:
        return (
          <>
            <p className="-mt-1 mb-2 text-[13px] text-baton-sub">いくつでも選べます</p>
            <div className="grid grid-cols-2 gap-2">
              {topics.map((t) => (
                <Choice key={t.id} selected={topicIds.includes(t.id)} onClick={() => toggleTopic(t.id)} wide>
                  {t.label}
                </Choice>
              ))}
            </div>
            <NextButton onClick={() => goNext(2)} disabled={topicIds.length === 0} />
          </>
        );
      case 3:
        return (
          <>
            <p className="-mt-1 mb-1 text-[13px] text-baton-sub">押した項目だけ残る。押さない項目は前回のまま</p>
            {selectedTopics.length === 0 ? (
              <p className="py-2 text-[15px] text-baton-sub">用件を選ぶと、案内する項目が出ます。</p>
            ) : (
              selectedTopics.map((t) => (
                <div key={t.id}>
                  {selectedTopics.length > 1 ? (
                    <div className="pt-2 text-[13px] font-bold tracking-[0.08em] text-baton-sub">{t.label}</div>
                  ) : null}
                  <ul className="divide-y divide-baton-line border-y border-baton-line">
                    {t.items.map((i) => {
                      const unclear = unclearIds.includes(i.id);
                      const explained = itemIds.includes(i.id) && !unclear;
                      return (
                        <li key={i.id} className="flex min-h-14 items-center gap-2 py-1.5">
                          <span className="min-w-0 flex-1 text-[17px] font-bold leading-snug">{i.label}</span>
                          <div className="flex shrink-0" role="group" aria-label={`${i.label}の案内`}>
                            <button
                              type="button"
                              aria-pressed={explained}
                              aria-label={`${i.label}を説明済み`}
                              onClick={() => pressExplained(i.id)}
                              className={`min-h-11 w-[88px] rounded-l-[10px] border-2 border-r px-1 text-[15px] font-bold ${
                                explained
                                  ? "border-baton-ai bg-baton-ai text-baton-on-ai"
                                  : "border-baton-line-strong bg-baton-men text-baton-moji"
                              }`}
                            >
                              {explained ? "✓ " : ""}説明済み
                            </button>
                            <button
                              type="button"
                              aria-pressed={unclear}
                              aria-label={`${i.label}の理解があいまい`}
                              onClick={() => pressUnclear(i.id)}
                              className={`min-h-11 w-[88px] rounded-r-[10px] border-2 border-l px-1 text-[15px] font-bold ${
                                unclear
                                  ? "border-baton-ki-line bg-baton-ki text-baton-ki-text"
                                  : "border-baton-line-strong bg-baton-men text-baton-moji"
                              }`}
                            >
                              {unclear ? "? " : ""}あいまい
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
            <NextButton onClick={() => goNext(3)} />
          </>
        );
      case 4:
        return (
          <div className="grid grid-cols-2 gap-2">
            {TEMPERATURES.map((t) => (
              <Choice
                key={t.code}
                selected={temperature === t.code}
                onClick={() => {
                  setTemperature(t.code);
                  goNext(4, { 4: true });
                }}
                wide
              >
                {t.label}
              </Choice>
            ))}
          </div>
        );
      case 5:
        return (
          <>
            <p className="-mt-1 mb-2 text-[13px] text-baton-sub">任意。なければ、そのまま保存</p>
            <h3 className="mb-1.5 text-[13px] font-bold tracking-[0.08em] text-baton-sub">次にやること</h3>
            <div className="flex flex-wrap gap-2">
              {NEXT_ACTIONS.map((a) => (
                <Choice key={a.code} selected={actions.includes(a.code)} onClick={() => setActions(toggle(actions, a.code))}>
                  {a.label}
                </Choice>
              ))}
            </div>
            {actions.includes("OTHER") ? (
              <input
                value={otherNote}
                onChange={(e) => setOtherNote(e.target.value)}
                placeholder="その他の中身(例: ケースの取り寄せ)"
                aria-label="その他の中身"
                maxLength={100}
                className="mt-2 min-h-12 w-full rounded-[10px] border border-baton-line-strong px-3 text-base"
              />
            ) : null}
            <h3 className="mb-1.5 mt-4 text-[13px] font-bold tracking-[0.08em] text-baton-sub">次回来店予定</h3>
            <div className="flex flex-wrap gap-2">
              {quickDates.map((d) => (
                <Choice
                  key={d.label}
                  selected={nextVisitDate === d.value}
                  onClick={() => setNextVisitDate(nextVisitDate === d.value ? "" : d.value)}
                >
                  {d.label}
                </Choice>
              ))}
              <input
                type="date"
                value={nextVisitDate}
                min={today}
                onChange={(e) => setNextVisitDate(e.target.value)}
                aria-label="次回来店予定日"
                className="min-h-12 rounded-[10px] border border-baton-line-strong px-2 text-base tabular-nums"
              />
            </div>
            {memoOpen ? (
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={500}
                rows={3}
                aria-label="メモ"
                placeholder="メモ(任意)"
                className="mt-4 w-full rounded-[10px] border border-baton-line-strong p-3 text-base"
              />
            ) : (
              <button
                type="button"
                onClick={() => setMemoOpen(true)}
                className="mt-3 min-h-11 text-[15px] text-baton-ai underline underline-offset-4"
              >
                ＋ メモを足す
              </button>
            )}
          </>
        );
    }
  }

  return (
    <div className="pb-36">
      <div className="flex items-baseline justify-between gap-2 border-b border-baton-line bg-baton-men px-4 pb-2 pt-3">
        <div>
          <h1 className="text-xl font-bold leading-tight">記録する</h1>
          {staffName !== null ? (
            <p className="mt-0.5 text-[13px] text-baton-sub">
              担当:<span className="font-bold text-baton-moji">{staffName}</span>
            </p>
          ) : null}
        </div>
        {/* 秒数は小さく。30秒を超えても赤くしない(急かさない) */}
        <p className="shrink-0 text-[15px] text-baton-sub tabular-nums" aria-live="off">
          {open}/5 ・ 目標{TARGET_SECONDS}秒 ・ <span>{elapsed === null ? "—" : `${elapsed}秒`}</span>
        </p>
      </div>

      {staffName === null ? (
        <p className="border-l-8 border-baton-shu bg-baton-men px-4 py-3 text-[15px] font-bold text-baton-shu">
          画面上部で「今のスタッフ」を選んでください。担当者として記録に残ります。
        </p>
      ) : null}

      <ol>
        {STEPS.map((s) => {
          const ref = (el: HTMLElement | null) => {
            stepRefs.current[s] = el;
          };
          if (s === open) {
            return (
              <li
                key={s}
                ref={ref}
                data-testid={`step-${s}`}
                aria-current="step"
                className="scroll-mt-28 border-t-[3px] border-baton-next bg-baton-men px-4 pb-4 pt-3"
              >
                <h2 className="mb-2 text-xl font-bold">
                  <span className="tabular-nums">{s}</span> {STEP_TITLE[s]}
                </h2>
                <div className="step-in">{stepBody(s)}</div>
              </li>
            );
          }
          if (isDone(s)) {
            return (
              <li
                key={s}
                ref={ref}
                data-testid={`step-${s}`}
                className="flex min-h-12 items-center gap-3 border-b border-baton-line bg-baton-men pl-4"
              >
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-baton-ai text-[13px] font-bold text-baton-on-ai"
                >
                  ✓
                </span>
                <span className="sr-only">{STEP_TITLE[s]}:</span>
                <span className="min-w-0 flex-1 truncate text-base font-bold tabular-nums">{doneValue[s]}</span>
                <button
                  type="button"
                  aria-label={`${STEP_TITLE[s]}を変える`}
                  onClick={() => {
                    if (s === 1 && customer) setCustomer(null);
                    openStep(s);
                  }}
                  className="min-h-12 shrink-0 px-4 text-[15px] text-baton-ai underline underline-offset-4"
                >
                  変える
                </button>
              </li>
            );
          }
          return (
            <li key={s} ref={ref} data-testid={`step-${s}`} className="border-b border-dashed border-baton-line-strong bg-baton-ji">
              <button
                type="button"
                onClick={() => openStep(s)}
                className="flex min-h-11 w-full items-center px-4 text-left text-base text-baton-sub"
              >
                <span className="tabular-nums">{s}</span>&nbsp;{STEP_TITLE[s]}
                {s === 3 || s === 5 ? <span className="ml-1 text-[13px]">・任意</span> : null}
              </button>
            </li>
          );
        })}
      </ol>

      {errors.length > 0 ? (
        <ul role="alert" className="mt-3 space-y-1 border-l-8 border-baton-shu bg-baton-men px-4 py-3 text-[15px] font-bold text-baton-shu">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-baton-line bg-baton-men px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="mx-auto max-w-md">
          {!ready ? (
            staffName !== null ? (
              // 残りの段を開くボタン(保存ボタンと同じ所にまとめて、まだ終わっていないことを見せる)
              <button
                type="button"
                onClick={openMissing}
                className="mb-1 flex min-h-11 w-full items-center justify-center text-[15px] font-bold text-baton-ai underline underline-offset-4"
              >
                あと:{missing.join("・")} を開く
              </button>
            ) : (
              <p className="mb-1.5 text-center text-[13px] text-baton-sub">あと:{missing.join("・")}</p>
            )
          ) : null}
          {/* 足りなくても押せる(足りない段を開く)。担当者が未選択のときだけは、開く段が無いので押せない */}
          <button
            type="button"
            onClick={submit}
            disabled={staffName === null || pending}
            className="min-h-14 w-full rounded-xl bg-baton-ai text-lg font-bold text-baton-on-ai active:bg-baton-ai-press disabled:bg-baton-line disabled:text-baton-sub"
          >
            {pending ? "保存中…" : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}
