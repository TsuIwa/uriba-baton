// 記録の保存前のチェック。
// 画面から届いた値は信用せず、サーバー側でここを通してから DB に入れる。
//
// 方針:まず型を確かめる。おかしな値が1つでもあれば、その欄のエラーにして全体を断る。
// 黙って捨てる・別の値に変える(文字の数字を数にする、重複を消す、など)はしない。
// 揃えるのは次だけで、どれも仕様として決めている:
//   - 名前カナはひらがな・半角カナでも受け付け、全角カタカナに揃える(探せるようにするため)
//   - 下4桁の全角数字は半角に揃える
//   - 前後の空白は取る(空白だけの自由記入は「空」とみなす)

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
  /** 画面に出ていた担当者。保存時の「今のスタッフ」と違えば保存しない */
  staffId: number;
  customer: { kind: "existing"; id: string } | { kind: "new"; nameKana: string; phoneLast4: string };
  topicIds: number[];
  /** unclear = 案内したが、お客様の理解があいまいだった(任意の印) */
  checks: { topicId: number; checklistItemId: number; unclear: boolean }[];
  temperature: TemperatureCode;
  actions: { kind: NextActionKindCode; note: string | null }[];
  nextVisitDate: string | null;
  memo: string | null;
  /** 最初の入力から保存までの秒数。測れなかったら null(0秒にはしない) */
  inputSeconds: number | null;
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 整数の配列として読む。
 * 文字の "1"・小数・重複は「おかしな値」として断る(黙って直さない)。null は「読めない」
 */
function intArray(v: unknown, required: boolean): number[] | null {
  if (v === undefined || v === null) return required ? null : [];
  if (!Array.isArray(v)) return null;
  if (!v.every((x) => typeof x === "number" && Number.isInteger(x))) return null;
  if (new Set(v).size !== v.length) return null;
  return v as number[];
}

/** 任意の文字欄。無い・null・空白だけ → null。文字でなければ undefined(=おかしな値) */
function optionalString(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
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
  if (!isRecord(raw)) return { ok: false, errors: ["送られた内容が読めません。画面を開き直してください"] };
  const r = raw;
  const errors: string[] = [];

  // 送信ID・画面の担当者(画面が自動で付ける。人が直すものではない)
  const requestId = typeof r.requestId === "string" && UUID.test(r.requestId) ? r.requestId : null;
  if (!requestId) errors.push("送信IDがありません。画面を開き直してから入れてください");
  const staffId = typeof r.staffId === "number" && Number.isInteger(r.staffId) ? r.staffId : null;
  if (staffId === null) errors.push("担当者:画面上部で「今のスタッフ」を選んでから入れてください");

  // お客様:既存の id か、新規のカナ+下4桁のどちらか
  let customer: VisitInput["customer"] | null = null;
  const c = isRecord(r.customer) ? r.customer : {};
  if (c.kind === "existing") {
    if (typeof c.id === "string" && UUID.test(c.id)) customer = { kind: "existing", id: c.id };
    else errors.push("お客様:選んだお客様が読めません。もう一度選んでください");
  } else if (c.kind === "new") {
    if (typeof c.nameKana !== "string" || typeof c.phoneLast4 !== "string") {
      errors.push("お客様:名前と下4桁は文字で入れてください");
    } else {
      const nameKana = normalizeKana(c.nameKana);
      const phoneLast4 = c.phoneLast4.normalize("NFKC").trim();
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
    }
  } else {
    errors.push("お客様:検索して選ぶか、「＋ 新規のお客様」で入れてください");
  }

  // 用件(1つ以上)
  const topicIds = intArray(r.topicIds, true);
  if (topicIds === null) {
    errors.push("用件:選んだ用件が読めません。画面を開き直してください");
  } else if (topicIds.length === 0) {
    errors.push("用件:1つ以上選んでください");
  } else if (topicIds.some((id) => !ctx.topicIds.has(id))) {
    errors.push("用件:一覧にない用件が入っています。画面を開き直してください");
  }

  // 案内したこと:選んだ用件の項目だけ。あいまいの印はチェックした項目にだけ
  const checks: VisitInput["checks"] = [];
  const checkedIds = intArray(r.checklistItemIds, false);
  const unclearIds = intArray(r.unclearItemIds, false);
  if (checkedIds === null || unclearIds === null) {
    errors.push("案内したこと:チェックした項目が読めません。画面を開き直してください");
  } else {
    if (unclearIds.some((id) => !checkedIds.includes(id))) {
      errors.push("案内したこと:「理解があいまい」は、チェックした項目にだけ付けられます");
    }
    for (const itemId of checkedIds) {
      const topicId = ctx.itemTopic.get(itemId);
      if (topicId === undefined || !(topicIds ?? []).includes(topicId)) {
        errors.push(
          "案内したこと:選んでいない用件の項目にチェックがあります。用件を選ぶか、チェックを外してください",
        );
        break;
      }
      checks.push({ topicId, checklistItemId: itemId, unclear: unclearIds.includes(itemId) });
    }
  }

  // 温度感(必須)
  const temperature = typeof r.temperature === "string" ? r.temperature : "";
  if (!TEMPERATURE_CODES.has(temperature)) errors.push("温度感:4つのうち1つを選んでください");

  // 次にやること(任意・複数)。「その他」は自由記入が必須
  const actions: VisitInput["actions"] = [];
  const otherNote = optionalString(r.otherNote);
  const rawActions: unknown = r.actions === undefined || r.actions === null ? [] : r.actions;
  if (
    !Array.isArray(rawActions) ||
    !rawActions.every((a) => typeof a === "string" && ACTION_CODES.has(a)) ||
    new Set(rawActions).size !== rawActions.length
  ) {
    errors.push("次にやること:一覧にない項目が入っています。画面を開き直してください");
  } else if (otherNote === undefined) {
    errors.push("次にやること:「その他」の中身は文字で入れてください");
  } else {
    for (const code of rawActions as string[]) {
      if (code !== "OTHER") {
        actions.push({ kind: code as NextActionKindCode, note: null });
      } else if (!otherNote) {
        errors.push("次にやること:「その他」を選んだときは、中身を書いてください");
      } else if (otherNote.length > LIMITS.otherNote) {
        errors.push(`次にやること:「その他」の中身は${LIMITS.otherNote}文字以内にしてください`);
      } else {
        actions.push({ kind: "OTHER", note: otherNote });
      }
    }
  }

  // 次回来店予定日(任意)。今日〜1年先まで
  let nextVisitDate: string | null = null;
  const d = optionalString(r.nextVisitDate);
  if (d === undefined) {
    errors.push("次回来店予定:日付が読めません。日付を選び直してください");
  } else if (d !== null) {
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

  // 入力秒数:測れなかったら null のまま(0秒として集計に混ぜない)
  let inputSeconds: number | null = null;
  const sec = r.inputSeconds;
  if (sec !== null && sec !== undefined) {
    if (typeof sec !== "number" || !Number.isInteger(sec) || sec < 0 || sec > 3600) {
      errors.push("入力秒数が正しくありません。画面を開き直してください");
    } else {
      inputSeconds = sec;
    }
  }

  const memo = optionalString(r.memo);
  if (memo === undefined) {
    errors.push("メモ:文字で入れてください");
  } else if (memo && memo.length > LIMITS.memo) {
    errors.push(`メモ:${LIMITS.memo}文字以内にしてください(今${memo.length}文字)`);
  }

  if (errors.length > 0 || !customer || !requestId || staffId === null || topicIds === null || memo === undefined) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      requestId,
      staffId,
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
