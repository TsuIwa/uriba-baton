// 記録の保存前のチェック。
// 画面から届いた値は信用せず、サーバー側でここを通してから DB に入れる。

import {
  NEXT_ACTIONS,
  TEMPERATURES,
  type NextActionKindCode,
  type TemperatureCode,
} from "./catalog";
import { addDays, ymdToDbDate } from "./dates";
import { isValidKana, isValidLast4, normalizeKana } from "./kana";

export type VisitInput = {
  /** 記録画面を開いたときに発行した送信ID(同じIDの再送は1件にまとめる) */
  requestId: string;
  customer: { kind: "existing"; id: string } | { kind: "new"; nameKana: string; phoneLast4: string };
  topicIds: number[];
  /** unclear = 案内したが、お客様の理解があいまいだった(任意の印) */
  checks: { topicId: number; checklistItemId: number; unclear: boolean }[];
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
/** DBの列の長さと同じ上限 */
export const LIMITS = { nameKana: 60, otherNote: 100, memo: 500 } as const;

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function asIntArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isInteger(n));
}

function optionalText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** "YYYY-MM-DD" の形で、しかも実在する日付か(2027-02-30 などは false) */
function isRealDate(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  try {
    ymdToDbDate(ymd);
    return true;
  } catch {
    return false;
  }
}

export function parseVisitInput(raw: unknown, ctx: ParseContext): ParseResult {
  const r = asRecord(raw);
  const errors: string[] = [];

  // 送信ID(画面が自動で付ける。人が直すものではない)
  const requestId = typeof r.requestId === "string" && UUID.test(r.requestId) ? r.requestId : null;
  if (!requestId) errors.push("送信IDがありません。画面を開き直してから入れてください");

  // お客様:既存の id か、新規のカナ+下4桁のどちらか
  let customer: VisitInput["customer"] | null = null;
  const c = asRecord(r.customer);
  if (c.kind === "existing" && typeof c.id === "string" && UUID.test(c.id)) {
    customer = { kind: "existing", id: c.id };
  } else if (c.kind === "new") {
    const nameKana = normalizeKana(String(c.nameKana ?? ""));
    const phoneLast4 = String(c.phoneLast4 ?? "").normalize("NFKC").trim();
    if (!nameKana) {
      errors.push("お客様:名前をカナかひらがなで入れてください");
    } else if (!isValidKana(nameKana)) {
      errors.push("お客様:名前はカナかひらがなで入れてください(漢字・英字・数字・記号は使えません)");
    } else if (nameKana.length > LIMITS.nameKana) {
      errors.push(`お客様:名前は${LIMITS.nameKana}文字以内にしてください(今${nameKana.length}文字)`);
    }
    if (!isValidLast4(phoneLast4)) {
      errors.push("お客様:電話番号の下4桁は、数字をちょうど4つ入れてください");
    }
    customer = { kind: "new", nameKana, phoneLast4 };
  } else {
    errors.push("お客様:検索して選ぶか、「＋ 新規のお客様」で入れてください");
  }

  // 用件(1つ以上)
  const topicIds = [...new Set(asIntArray(r.topicIds))];
  if (topicIds.length === 0) errors.push("用件:1つ以上選んでください");
  if (topicIds.some((id) => !ctx.topicIds.has(id))) {
    errors.push("用件:一覧にない用件が入っています。画面を開き直してください");
  }

  // 案内したこと:選んだ用件の項目だけ受け付ける
  const checks: VisitInput["checks"] = [];
  const checkedIds = new Set(asIntArray(r.checklistItemIds));
  const unclearIds = new Set(asIntArray(r.unclearItemIds));
  if ([...unclearIds].some((id) => !checkedIds.has(id))) {
    errors.push("案内したこと:「理解があいまい」は、チェックした項目にだけ付けられます");
  }
  for (const itemId of checkedIds) {
    const topicId = ctx.itemTopic.get(itemId);
    if (topicId === undefined || !topicIds.includes(topicId)) {
      errors.push("案内したこと:選んでいない用件の項目にチェックがあります。用件を選ぶか、チェックを外してください");
      break;
    }
    checks.push({ topicId, checklistItemId: itemId, unclear: unclearIds.has(itemId) });
  }

  // 温度感(必須)
  const temperature = typeof r.temperature === "string" ? r.temperature : "";
  if (!TEMPERATURE_CODES.has(temperature)) errors.push("温度感:4つのうち1つを選んでください");

  // 次にやること(任意・複数)。「その他」は自由記入が必須
  const actions: VisitInput["actions"] = [];
  const otherNote = optionalText(r.otherNote);
  for (const code of new Set(Array.isArray(r.actions) ? r.actions.map(String) : [])) {
    if (!ACTION_CODES.has(code)) {
      errors.push("次にやること:一覧にない項目が入っています。画面を開き直してください");
      break;
    }
    if (code === "OTHER") {
      if (!otherNote) {
        errors.push("次にやること:「その他」を選んだときは、中身を書いてください");
        continue;
      }
      if (otherNote.length > LIMITS.otherNote) {
        errors.push(`次にやること:「その他」の中身は${LIMITS.otherNote}文字以内にしてください`);
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
    if (!isRealDate(d)) {
      errors.push(`次回来店予定:「${d.slice(0, 10)}」はない日付です。日付を選び直してください`);
    } else if (d < ctx.today) {
      errors.push("次回来店予定:過去の日付になっています。今日以降を選んでください");
    } else if (d > addDays(ctx.today, MAX_DAYS_AHEAD)) {
      errors.push("次回来店予定:1年以内の日付を選んでください");
    } else {
      nextVisitDate = d;
    }
  }

  const inputSeconds = Number(r.inputSeconds);
  if (!Number.isInteger(inputSeconds) || inputSeconds < 0 || inputSeconds > 3600) {
    errors.push("入力秒数が正しくありません。画面を開き直してください");
  }

  const memo = optionalText(r.memo);
  if (memo && memo.length > LIMITS.memo) {
    errors.push(`メモ:${LIMITS.memo}文字以内にしてください(今${memo.length}文字)`);
  }

  if (errors.length > 0 || !customer || !requestId) return { ok: false, errors };
  return {
    ok: true,
    value: {
      requestId,
      customer,
      topicIds,
      checks,
      temperature: temperature as TemperatureCode,
      actions,
      nextVisitDate,
      memo,
      inputSeconds,
    },
  };
}
