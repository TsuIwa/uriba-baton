// お客様カードの一番上に出す「次の人へ」の要約と、「話す順のヒント」。
// AIは使わず、決まったルールで組み立てる(同じ記録なら毎回同じ文になる=説明できる)。
//
// 次のルールは、現場の判断(制作者=携帯売り場14年が決めた所)に沿っている。
// 原文は docs/04_AIとの作業記録.md の「現場の判断」。
//   1. 次にやることは、未完了と完了で話す文を分ける(未完了の見積もりは「作りながら案内」)
//   2. 前回より前の記録に残っている未完了の約束も拾い、担当者に済んでいるか確認してから進める
//   3. 説明済みかどうかは日数で切らず、お客様の理解度で決める
//      - 前回「理解があいまい」だった項目は、もう一度詳しく案内する
//      - それ以外の説明済みは、まず理解度を伺い、必要ならもう一度詳しく
//      - 中身が変わる項目(料金・キャンペーンなど)は、説明した版と今の版が違えば必ず案内する
//   「必ず案内(変更あり)」と「担当者に確認」は、ヒントの3件の上限の外に出して全部見せる

import {
  NEXT_ACTION_LABEL,
  STAFF_ROLE_LABEL,
  type NextActionKindCode,
  type StaffRoleCode,
  type TemperatureCode,
} from "./catalog";
import { formatJstShort, jstDateString } from "./dates";

export type ChecklistItemInfo = {
  id: number;
  label: string;
  /** 料金・キャンペーンのように中身が変わる項目か */
  volatile?: boolean;
  /** 最後に中身が変わった日 "YYYY-MM-DD"(表示用。判定には使わない) */
  revisedOn?: string | null;
  /** 今の中身の版(なければ 1) */
  version?: number;
};

export type ChecklistCatalog = Record<string, ChecklistItemInfo[]>;

/** 要約に必要な、1回分の記録 */
export type HandoffVisit = {
  visitedAt: Date;
  /** name は画面に出す呼び名(店内で一意)。「◯◯さんに確認」もこれを使う */
  staff: { name: string; role: StaffRoleCode };
  temperature: TemperatureCode;
  topics: { code: string; label: string }[];
  /** 案内した項目 */
  checkedItemIds: number[];
  /** そのうち、お客様の理解があいまいだった項目 */
  unclearItemIds: number[];
  /** 案内した項目ごとの、説明したときの中身の版(無ければ版1を説明したとみなす) */
  explainedVersions?: Record<number, number>;
  /** その記録の「次にやること」(済んだものも含む) */
  actions: { kind: NextActionKindCode; note: string | null; done: boolean }[];
};

/**
 * 案内項目の状況。
 * - NOT_YET:まだ一度も案内していない
 * - CHANGED:中身が変わる項目で、最後に説明した版と今の版が違う(必ず案内)
 * - UNCLEAR:最後に案内したとき、理解があいまいだった(もう一度詳しく)
 * - EXPLAINED:案内済み(まず理解度を伺う)
 */
export type ItemState = "NOT_YET" | "CHANGED" | "UNCLEAR" | "EXPLAINED";

export type ItemStatus = {
  id: number;
  label: string;
  topicLabel: string;
  state: ItemState;
  /** 最後に案内した日 "YYYY-MM-DD"(まだなら null) */
  lastExplainedOn: string | null;
};

/** 前回より前の記録に残っている、未完了の約束 */
export type StaleAction = {
  visitedAt: Date;
  staffName: string;
  kind: NextActionKindCode;
  note: string | null;
};

export type HandoffSummary = {
  /** 要約の文 */
  text: string;
  /** 次に案内する項目(未案内・変更あり・あいまい。話す順) */
  remaining: string[];
  items: ItemStatus[];
  staleActions: StaleAction[];
};

const MAX_NEXT_ITEMS = 2;
export const MAX_HINTS = 3;

export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  NOT_YET: "まだ",
  CHANGED: "変更あり:必ず案内",
  UNCLEAR: "前回あいまい:もう一度詳しく",
  EXPLAINED: "説明済み:まず理解度を伺う",
};

function joinLabels(labels: string[]): string {
  return labels.join("・");
}

function actionLabel(kind: NextActionKindCode, note: string | null): string {
  if (kind === "OTHER") return note?.trim() || "その他";
  return NEXT_ACTION_LABEL[kind];
}

/**
 * 前回の用件の、案内項目ごとの状況(目録の話す順)。
 * 「説明済み」に期限は付けない。中身が変わったかは日付でなく版で比べる
 * (改定と説明が同じ日でも、どちらの版を説明したかで正しく決まる)。CHANGED は UNCLEAR より優先する。
 */
export function itemStatuses(visits: HandoffVisit[], catalog: ChecklistCatalog): ItemStatus[] {
  const last = visits[0];
  if (!last) return [];
  // 項目ごとに「最後に案内した日」と「そのとき理解があいまいだったか」
  // visits は新しい順なので、最初に見つかったものが最後の案内
  const latest = new Map<number, { on: string; unclear: boolean; version: number }>();
  for (const v of visits) {
    const on = jstDateString(v.visitedAt);
    const unclear = new Set(v.unclearItemIds);
    for (const id of v.checkedItemIds) {
      if (!latest.has(id)) {
        latest.set(id, { on, unclear: unclear.has(id), version: v.explainedVersions?.[id] ?? 1 });
      }
    }
  }
  return last.topics.flatMap((t) =>
    (catalog[t.code] ?? []).map((item) => {
      const explained = latest.get(item.id) ?? null;
      let state: ItemState;
      if (!explained) state = "NOT_YET";
      else if (item.volatile && explained.version !== (item.version ?? 1)) state = "CHANGED";
      else if (explained.unclear) state = "UNCLEAR";
      else state = "EXPLAINED";
      return {
        id: item.id,
        label: item.label,
        topicLabel: t.label,
        state,
        lastExplainedOn: explained?.on ?? null,
      };
    }),
  );
}

/** 前回より前の記録に残っている未完了の約束(古い順) */
export function staleActions(visits: HandoffVisit[]): StaleAction[] {
  return visits
    .slice(1)
    .flatMap((v) =>
      v.actions
        .filter((a) => !a.done)
        .map((a) => ({ visitedAt: v.visitedAt, staffName: v.staff.name, kind: a.kind, note: a.note })),
    )
    .sort((a, b) => a.visitedAt.getTime() - b.visitedAt.getTime());
}

/** 例:「9/25(金) 中村 誠さんの「入荷・在庫の連絡」が未完了のまま。済んでいるか中村 誠さんに確認してから進める」 */
export function staleActionText(a: StaleAction): string {
  return `${formatJstShort(a.visitedAt)} ${a.staffName}さんの「${actionLabel(a.kind, a.note)}」が未完了のまま。済んでいるか${a.staffName}さんに確認してから進める`;
}

/**
 * 要約用:同じ日・同じ担当者の未完了はまとめて1文にする。
 * 例:「9/24(木) 小林 葵さんの「入荷・在庫の連絡」「家族と相談」が未完了のまま。済んでいるか小林 葵さんに確認してから進める」
 */
export function staleSummaryTexts(stale: StaleAction[]): string[] {
  const groups = new Map<string, StaleAction[]>();
  for (const a of stale) {
    const key = `${a.visitedAt.getTime()}|${a.staffName}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.values()].map((list) => {
    const { visitedAt, staffName } = list[0];
    const labels = list.map((a) => `「${actionLabel(a.kind, a.note)}」`).join("");
    return `${formatJstShort(visitedAt)} ${staffName}さんの${labels}が未完了のまま。済んでいるか${staffName}さんに確認してから進める`;
  });
}

/** 次に案内する項目の表示名(変更あり・あいまいには印をつける) */
function nextLabel(s: ItemStatus): string {
  if (s.state === "CHANGED") return `${s.label}(変更あり)`;
  if (s.state === "UNCLEAR") return `${s.label}(前回あいまい)`;
  return s.label;
}

/**
 * 「次の人へ」の要約。
 * @param visits そのお客様の記録(新しい順)。先頭が前回
 */
export function buildHandoffSummary(
  visits: HandoffVisit[],
  catalog: ChecklistCatalog,
): HandoffSummary {
  const last = visits[0];
  if (!last) {
    return {
      text: "初めてのお客様です。用件を聞くところから始めてください。",
      remaining: [],
      items: [],
      staleActions: [],
    };
  }

  const who = `${last.staff.name}(${STAFF_ROLE_LABEL[last.staff.role]})`;
  const when = formatJstShort(last.visitedAt);
  const topicText = `「${joinLabels(last.topics.map((t) => t.label))}」`;
  const items = itemStatuses(visits, catalog);
  const stale = staleActions(visits);
  const byState = (s: ItemState) => items.filter((i) => i.state === s);

  // 1文目:前回その日に何をしたか(この日の話だけ。これまで全体の話は2文目以降)
  const lastChecked = new Set(last.checkedItemIds);
  const doneThatDay = items.filter((i) => lastChecked.has(i.id)).map((i) => i.label);
  const sentences: string[] = [
    doneThatDay.length > 0
      ? `前回 ${when} ${who}が${topicText}で ${joinLabels(doneThatDay)} まで案内。`
      : `前回 ${when} ${who}が${topicText}の用件を伺った(この日の案内はなし)。`,
  ];

  // 前回より前の未完了の約束は、担当者に確認してから
  for (const t of staleSummaryTexts(stale)) sentences.push(`${t}。`);

  // ここから:これまで全体で見た状況
  const changed = byState("CHANGED");
  if (changed.length > 0) {
    sentences.push(
      `変更あり:${joinLabels(changed.map((i) => i.label))} は前回の説明のあとに中身が変わったので必ず案内。`,
    );
  }
  const unclear = byState("UNCLEAR");
  if (unclear.length > 0) {
    sentences.push(`前回あいまいだった:${joinLabels(unclear.map((i) => i.label))} はもう一度詳しく案内。`);
  }

  const next = items.filter((i) => i.state !== "EXPLAINED");
  if (next.length > 0) {
    sentences.push(`次は ${joinLabels(next.slice(0, MAX_NEXT_ITEMS).map(nextLabel))} から。`);
  } else {
    const open = last.actions.find((a) => !a.done);
    sentences.push(
      open
        ? `これまでに一通り案内済み。次は「${actionLabel(open.kind, open.note)}」の続きから。`
        : "これまでに一通り案内済み。次は手続きに進めるかの確認から。",
    );
  }

  const explained = byState("EXPLAINED");
  if (explained.length > 0) {
    sentences.push(
      `説明済み:${joinLabels(explained.map((i) => i.label))} はまず理解度を伺い、必要ならもう一度詳しく。`,
    );
  }

  return { text: sentences.join(""), remaining: next.map((i) => i.label), items, staleActions: stale };
}

/** 次にやることが「まだ」のときに話すこと */
const OPEN_ACTION_HINT: Record<NextActionKindCode, (note: string | null) => string> = {
  QUOTE: () =>
    "見積もりを作りながら詳細を案内する(声かけの例:『詳細を見積もりを作りながら、ご案内させていただきますね』)",
  FAMILY: () => "ご家族と相談できたかを聞く",
  DOCUMENTS: () => "本人確認書類などがそろっているか、先に確かめる",
  STOCK: () => "入荷・在庫の状況を確かめてから伝える(連絡はまだ)",
  CALLBACK: () => "こちらからの連絡がまだ。連絡するはずだった件から話す",
  OTHER: (note) => `「${note?.trim() || "前回の約束"}」がまだ済んでいない。その件から話す`,
};

/** 次にやることが「済み」のときに話すこと */
const DONE_ACTION_HINT: Record<NextActionKindCode, (note: string | null) => string> = {
  QUOTE: () => "お渡しした見積もりの感想から聞く",
  FAMILY: () => "ご家族と相談した結果から聞く",
  DOCUMENTS: () => "そろった書類で手続きに進めるか確かめる",
  STOCK: () => "お伝えした入荷・在庫の件から話す",
  CALLBACK: () => "前回こちらから連絡した件から話す",
  OTHER: (note) => `「${note?.trim() || "前回の約束"}」がどうなったか確かめる`,
};

export function actionHint(kind: NextActionKindCode, note: string | null, done: boolean): string {
  return (done ? DONE_ACTION_HINT : OPEN_ACTION_HINT)[kind](note);
}

const TEMPERATURE_HINT: Record<TemperatureCode, string> = {
  POSITIVE: "手続きに進めるか確かめる(かかる時間を先に伝える)",
  CONSIDERING: "迷っている点を1つだけ聞く",
  COMPARING: "他社の条件で何が決め手になっているかを聞く",
  NOT_NOW: "無理に勧めず、前回から変わったことを聞く",
};

export type TalkHints = {
  /** 必ず全部見せるもの(担当者への確認・変更あり)。件数の上限なし */
  required: string[];
  /** 補助のヒント(最大3つ) */
  extra: string[];
};

/**
 * 話す順のヒント。
 * required(上限なし・全部):前回より前の未完了の約束(担当者に確認してから)/中身が変わった項目(必ず案内)
 * extra(最大3つ)の並び:
 *   ①前回の未完了の約束 ②前回あいまいだった項目 ③温度感に合わせた一言
 *   ④まだ案内していない項目 ⑤前回済んだ約束の続き → 残り → 「説明済みは理解度を伺う」
 */
export function buildTalkHints(visits: HandoffVisit[], catalog: ChecklistCatalog): TalkHints {
  const last = visits[0];
  if (!last) return { required: [], extra: ["用件を聞く(機種変更・のりかえ・光回線など)"] };

  const items = itemStatuses(visits, catalog);
  const labelsOf = (s: ItemState) => items.filter((i) => i.state === s).map((i) => i.label);

  const staleHints = staleActions(visits).map(staleActionText);
  const openHints = last.actions.filter((a) => !a.done).map((a) => actionHint(a.kind, a.note, false));
  const doneHints = last.actions.filter((a) => a.done).map((a) => actionHint(a.kind, a.note, true));
  const changedHints = labelsOf("CHANGED").map(
    (l) => `変更あり:「${l}」は前回の説明のあとに中身が変わったので必ず案内する`,
  );
  const unclearHints = labelsOf("UNCLEAR").map((l) => `前回あいまいだった「${l}」をもう一度詳しく案内する`);
  const notYetHints = labelsOf("NOT_YET").map((l) => `まだ案内していない「${l}」を説明する`);
  const explained = labelsOf("EXPLAINED");
  const confirmHint =
    explained.length > 0
      ? `説明済みの「${joinLabels(explained.slice(0, 2))}」は、まず理解度を伺い、必要ならもう一度詳しく案内する`
      : undefined;

  const ordered = [
    openHints[0],
    unclearHints[0],
    TEMPERATURE_HINT[last.temperature],
    notYetHints[0],
    doneHints[0],
    ...openHints.slice(1),
    ...unclearHints.slice(1),
    ...notYetHints.slice(1),
    ...doneHints.slice(1),
    confirmHint,
  ].filter((h): h is string => typeof h === "string");

  return {
    required: [...staleHints, ...changedHints],
    extra: [...new Set(ordered)].slice(0, MAX_HINTS),
  };
}
