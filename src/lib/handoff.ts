// お客様カードの一番上に出す「次の人へ」の要約と、「話す順のヒント」。
// AIは使わず、決まったルールで組み立てる(同じ記録なら毎回同じ文になる=説明できる)。

import {
  STAFF_ROLE_LABEL,
  type NextActionKindCode,
  type StaffRoleCode,
  type TemperatureCode,
  nextActionText,
} from "./catalog";
import { formatJstShort } from "./dates";

export type ChecklistCatalog = Record<string, { id: number; label: string }[]>;

/** 要約に必要な、1回分の記録 */
export type HandoffVisit = {
  visitedAt: Date;
  staff: { name: string; role: StaffRoleCode };
  temperature: TemperatureCode;
  topics: { code: string; label: string }[];
  checkedItemIds: number[];
  openActions: { kind: NextActionKindCode; note: string | null }[];
};

export type HandoffSummary = {
  /** 1〜2文の要約 */
  text: string;
  /** 前回の用件のうち、これまでの全記録でまだ案内していない項目(話す順) */
  remaining: string[];
};

const MAX_NEXT_ITEMS = 2;

function joinLabels(labels: string[]): string {
  return labels.join("・");
}

/** 前回の用件について、まだ案内していない項目を話す順に並べる */
export function remainingItems(
  topics: { code: string }[],
  coveredItemIds: Set<number>,
  catalog: ChecklistCatalog,
): string[] {
  return topics.flatMap((t) =>
    (catalog[t.code] ?? []).filter((item) => !coveredItemIds.has(item.id)).map((i) => i.label),
  );
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
    return { text: "初めてのお客様です。用件を聞くところから始めてください。", remaining: [] };
  }

  const who = `${last.staff.name}(${STAFF_ROLE_LABEL[last.staff.role]})`;
  const when = formatJstShort(last.visitedAt);
  const topicText = `「${joinLabels(last.topics.map((t) => t.label))}」`;

  // 前回チェックした項目(目録の並び順で出す)
  const lastChecked = new Set(last.checkedItemIds);
  const doneLabels = last.topics.flatMap((t) =>
    (catalog[t.code] ?? []).filter((i) => lastChecked.has(i.id)).map((i) => i.label),
  );

  // 「まだ」は全記録を合わせて判断する(前々回に説明済みなら繰り返さない)
  const covered = new Set(visits.flatMap((v) => v.checkedItemIds));
  const remaining = remainingItems(last.topics, covered, catalog);

  const first =
    doneLabels.length > 0
      ? `前回 ${when} ${who}が${topicText}で ${joinLabels(doneLabels)} まで案内済み。`
      : `前回 ${when} ${who}が${topicText}の用件を伺っただけで、案内はまだ。`;

  let second: string;
  if (remaining.length > 0) {
    second = `次は ${joinLabels(remaining.slice(0, MAX_NEXT_ITEMS))} から。`;
  } else if (last.openActions.length > 0) {
    const a = last.openActions[0];
    second = `案内は一通り済み。次は「${nextActionText(a.kind, a.note)}」の続きから。`;
  } else {
    second = "案内は一通り済み。次は手続きに進めるかの確認から。";
  }

  return { text: first + second, remaining };
}

const ACTION_HINT: Record<NextActionKindCode, (note: string | null) => string> = {
  QUOTE: () => "お渡しした見積もりの感想から聞く",
  FAMILY: () => "ご家族と相談した結果から聞く",
  DOCUMENTS: () => "本人確認書類などがそろっているか、先に確かめる",
  STOCK: () => "入荷・在庫の状況を先に伝える",
  CALLBACK: () => "前回こちらから連絡した件から話す",
  OTHER: (note) => `「${note?.trim() || "前回の約束"}」の件から話す`,
};

const TEMPERATURE_HINT: Record<TemperatureCode, string> = {
  POSITIVE: "手続きに進めるか確かめる(かかる時間を先に伝える)",
  CONSIDERING: "迷っている点を1つだけ聞く",
  COMPARING: "他社の条件で何が決め手になっているかを聞く",
  NOT_NOW: "無理に勧めず、前回から変わったことを聞く",
};

export const MAX_HINTS = 3;

/**
 * 話す順のヒント(最大3つ)。
 * 並び: ①約束していたこと(次にやること)→ ②温度感に合わせた一言 → ③まだ案内していない項目。
 * 3つに届かなければ、残りの約束・未案内の項目で埋める。
 */
export function buildTalkHints(visits: HandoffVisit[], catalog: ChecklistCatalog): string[] {
  const last = visits[0];
  if (!last) return ["用件を聞く(機種変更・のりかえ・光回線など)"];

  const actionHints = last.openActions.map((a) => ACTION_HINT[a.kind](a.note));
  const covered = new Set(visits.flatMap((v) => v.checkedItemIds));
  const itemHints = remainingItems(last.topics, covered, catalog).map(
    (label) => `まだ案内していない「${label}」を説明する`,
  );

  const ordered = [
    actionHints[0],
    TEMPERATURE_HINT[last.temperature],
    itemHints[0],
    ...actionHints.slice(1),
    ...itemHints.slice(1),
  ].filter((h): h is string => typeof h === "string");

  return [...new Set(ordered)].slice(0, MAX_HINTS);
}
