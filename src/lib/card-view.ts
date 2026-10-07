// 画面用の組み替え。handoff.ts の判定と文言はそのまま使い、並べ方と区切り方だけを変える。
// (docs/07_UI方針.md §2。判定を足したり、文の中身を変えたりはしない)

import {
  NEXT_ACTION_LABEL,
  STAFF_ROLE_LABEL,
  TEMPERATURE_LABEL,
  type NextActionKindCode,
  type StaffRoleCode,
} from "./catalog";
import { formatJstShort } from "./dates";
import {
  buildHandoffSummary,
  buildTalkHints,
  type ChecklistCatalog,
  type HandoffVisit,
  type ItemState,
  type ItemStatus,
  type StaleAction,
} from "./handoff";

/** 次の一言を、主役(22px)と補足(13px)に分けたもの */
export type NextLine = {
  /** 主役に出す文。声かけの例があるときは『』の中身をそのまま */
  main: string;
  /** main が店員の声かけ(お客様に言う言葉)か */
  spoken: boolean;
  /** 補足(なぜこの一言か)。無ければ null */
  note: string | null;
};

const SPOKEN = /^(.*)\(声かけの例:『(.+)』\)$/;

/**
 * buildTalkHints の1件を、主役と補足に分ける。
 * 「〜する(声かけの例:『…』)」の形なら『』の中身を主役に、前の部分を補足にする。文字は1字も変えない
 */
export function splitNextLine(hint: string): NextLine {
  const m = SPOKEN.exec(hint);
  if (m) return { main: m[2], spoken: true, note: m[1] };
  return { main: hint, spoken: false, note: null };
}

/** 「先に確認」の1行(同じ日・同じ担当者の未完了をまとめる) */
export type ConfirmLine = {
  staffName: string;
  /** 例 "9/24(木)" */
  date: string;
  /** 約束の名前(「その他」は自由記入) */
  labels: string[];
};

function actionLabel(kind: NextActionKindCode, note: string | null): string {
  if (kind === "OTHER") return note?.trim() || "その他";
  return NEXT_ACTION_LABEL[kind];
}

/** 前回より前の未完了の約束を、担当者と日付ごとにまとめる(handoff の staleSummaryTexts と同じ区切り方) */
export function confirmLines(stale: StaleAction[]): ConfirmLine[] {
  const groups = new Map<string, ConfirmLine>();
  for (const a of stale) {
    const key = `${a.visitedAt.getTime()}|${a.staffName}`;
    const g = groups.get(key) ?? { staffName: a.staffName, date: formatJstShort(a.visitedAt), labels: [] };
    g.labels.push(actionLabel(a.kind, a.note));
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** 話す順の並び:変更あり → 前回あいまい → まだ(同じ状態の中は目録の順のまま) */
const TALK_ORDER: Record<ItemState, number> = { CHANGED: 0, UNCLEAR: 1, NOT_YET: 2, EXPLAINED: 3 };

export type CardView = {
  /** バトン帯の左側(前回)。初めてのお客様は null */
  from: { staffName: string; role: StaffRoleCode; roleLabel: string; date: string } | null;
  /** 「何まで」:用件・その日に案内した項目・温度感 */
  upTo: { topics: string[]; doneItems: string[]; temperature: string } | null;
  confirm: ConfirmLine[];
  next: NextLine;
  /** 話す順(説明済み以外)。変更あり → あいまい → まだ */
  talk: ItemStatus[];
  /** 説明済み(畳んで出す) */
  explained: ItemStatus[];
  /** 今日の一覧用の数 */
  counts: { required: number; confirm: number; changed: number; unclear: number; notYet: number };
  /** 読み上げ用の要約(画面には出さない) */
  summaryText: string;
};

/**
 * お客様カード・今日の一覧に出すものを、handoff の結果から組み立てる。
 * @param visits そのお客様の記録(新しい順)
 */
export function buildCardView(visits: HandoffVisit[], catalog: ChecklistCatalog): CardView {
  const summary = buildHandoffSummary(visits, catalog);
  const hints = buildTalkHints(visits, catalog);
  const last = visits[0];
  const items = summary.items;
  const count = (s: ItemState) => items.filter((i) => i.state === s).length;

  const lastChecked = new Set(last?.checkedItemIds ?? []);
  return {
    from: last
      ? {
          staffName: last.staff.name,
          role: last.staff.role,
          roleLabel: STAFF_ROLE_LABEL[last.staff.role],
          date: formatJstShort(last.visitedAt),
        }
      : null,
    upTo: last
      ? {
          topics: last.topics.map((t) => t.label),
          doneItems: items.filter((i) => lastChecked.has(i.id)).map((i) => i.label),
          temperature: TEMPERATURE_LABEL[last.temperature],
        }
      : null,
    confirm: confirmLines(summary.staleActions),
    next: splitNextLine(hints.extra[0] ?? ""),
    talk: items
      .filter((i) => i.state !== "EXPLAINED")
      .map((i, n) => ({ i, n }))
      .sort((a, b) => TALK_ORDER[a.i.state] - TALK_ORDER[b.i.state] || a.n - b.n)
      .map(({ i }) => i),
    explained: items.filter((i) => i.state === "EXPLAINED"),
    counts: {
      required: hints.required.length,
      // 必ず=先に確認(前々回以前の未完了の約束)+変更あり
      confirm: summary.staleActions.length,
      changed: count("CHANGED"),
      unclear: count("UNCLEAR"),
      notYet: count("NOT_YET"),
    },
    summaryText: summary.text,
  };
}
