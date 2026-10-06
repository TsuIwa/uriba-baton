// 記録の保存前のチェック。
// 画面から届いた値は信用せず、サーバー側でここを通してから DB に入れる。

import {
  NEXT_ACTIONS,
  TEMPERATURES,
  type NextActionKindCode,
  type TemperatureCode,
} from "./catalog";
import { addDays } from "./dates";
import { isValidKana, isValidLast4, normalizeKana } from "./kana";

export type VisitInput = {
  customer: { kind: "existing"; id: string } | { kind: "new"; nameKana: string; phoneLast4: string };
  topicIds: number[];
  checks: { topicId: number; checklistItemId: number }[];
  temperature: TemperatureCode;
  actions: { kind: NextActionKindCode; note: string | null }[];
  nextVisitDate: string | null;
  memo: string | null;
  inputSeconds: number;
};

export type ParseResult = { ok: true; value: VisitInput } | { ok: false; errors: string[] };

export type ParseContext = {
  /** 用件の id の一覧 */
  topicIds: Set<number>;
  /** 案内項目の id → その項目が属する用件の id */
  itemTopic: Map<number, number>;
  /** 日本時間の今日 "YYYY-MM-DD" */
  today: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEMPERATURE_CODES = new Set<string>(TEMPERATURES.map((t) => t.code));
const ACTION_CODES = new Set<string>(NEXT_ACTIONS.map((a) => a.code));
/** 次回来店予定は1年先まで(打ち間違いで遠い未来が入るのを防ぐ) */
const MAX_DAYS_AHEAD = 365;

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function asIntArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isInteger(n));
}

function optionalText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

export function parseVisitInput(raw: unknown, ctx: ParseContext): ParseResult {
  const r = asRecord(raw);
  const errors: string[] = [];

  // お客様:既存の id か、新規のカナ+下4桁のどちらか
  let customer: VisitInput["customer"] | null = null;
  const c = asRecord(r.customer);
  if (c.kind === "existing" && typeof c.id === "string" && UUID.test(c.id)) {
    customer = { kind: "existing", id: c.id };
  } else if (c.kind === "new") {
    const nameKana = normalizeKana(String(c.nameKana ?? ""));
    const phoneLast4 = String(c.phoneLast4 ?? "").normalize("NFKC").trim();
    if (!nameKana || !isValidKana(nameKana)) errors.push("名前はカナで入れてください");
    if (!isValidLast4(phoneLast4)) errors.push("電話番号の下4桁は数字4つで入れてください");
    customer = { kind: "new", nameKana, phoneLast4 };
  } else {
    errors.push("お客様を選ぶか、新規で入れてください");
  }

  // 用件(1つ以上)
  const topicIds = [...new Set(asIntArray(r.topicIds))];
  if (topicIds.length === 0) errors.push("用件を1つ以上選んでください");
  if (topicIds.some((id) => !ctx.topicIds.has(id))) errors.push("用件の選び方が正しくありません");

  // 案内したこと:選んだ用件の項目だけ受け付ける
  const checks: VisitInput["checks"] = [];
  for (const itemId of new Set(asIntArray(r.checklistItemIds))) {
    const topicId = ctx.itemTopic.get(itemId);
    if (topicId === undefined || !topicIds.includes(topicId)) {
      errors.push("選んでいない用件の項目にチェックがあります");
      break;
    }
    checks.push({ topicId, checklistItemId: itemId });
  }

  // 温度感(必須)
  const temperature = typeof r.temperature === "string" ? r.temperature : "";
  if (!TEMPERATURE_CODES.has(temperature)) errors.push("お客様の温度感を選んでください");

  // 次にやること(任意・複数)。「その他」は自由記入が必須
  const actions: VisitInput["actions"] = [];
  const otherNote = optionalText(r.otherNote, 100);
  for (const code of new Set(Array.isArray(r.actions) ? r.actions.map(String) : [])) {
    if (!ACTION_CODES.has(code)) {
      errors.push("次にやることの選び方が正しくありません");
      break;
    }
    if (code === "OTHER") {
      if (!otherNote) {
        errors.push("「その他」を選んだときは、中身を書いてください");
        continue;
      }
      actions.push({ kind: "OTHER", note: otherNote });
    } else {
      actions.push({ kind: code as NextActionKindCode, note: null });
    }
  }

  // 次回来店予定日(任意)。今日〜1年先まで
  let nextVisitDate: string | null = null;
  if (typeof r.nextVisitDate === "string" && r.nextVisitDate !== "") {
    const d = r.nextVisitDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      errors.push("次回来店予定日の形が正しくありません");
    } else if (d < ctx.today) {
      errors.push("次回来店予定日が過去になっています");
    } else if (d > addDays(ctx.today, MAX_DAYS_AHEAD)) {
      errors.push("次回来店予定日は1年以内にしてください");
    } else {
      nextVisitDate = d;
    }
  }

  const inputSeconds = Number(r.inputSeconds);
  if (!Number.isInteger(inputSeconds) || inputSeconds < 0 || inputSeconds > 3600) {
    errors.push("入力秒数が正しくありません");
  }

  if (errors.length > 0 || !customer) return { ok: false, errors };
  return {
    ok: true,
    value: {
      customer,
      topicIds,
      checks,
      temperature: temperature as TemperatureCode,
      actions,
      nextVisitDate,
      memo: optionalText(r.memo, 500),
      inputSeconds,
    },
  };
}
