// 画面とseedで共通に使う「目録」。
// DBの enum と同じ文字列を使う(Prisma の生成物に頼らず、ロジックだけでテストできるように)。

export type StaffRoleCode = "REGULAR" | "EVENT";
export type TemperatureCode = "POSITIVE" | "CONSIDERING" | "COMPARING" | "NOT_NOW";
export type NextActionKindCode =
  | "QUOTE"
  | "FAMILY"
  | "DOCUMENTS"
  | "STOCK"
  | "CALLBACK"
  | "OTHER";

export const STAFF_ROLE_LABEL: Record<StaffRoleCode, string> = {
  REGULAR: "常勤",
  EVENT: "イベント",
};

export const TEMPERATURES: { code: TemperatureCode; label: string }[] = [
  { code: "POSITIVE", label: "前向き" },
  { code: "CONSIDERING", label: "検討中" },
  { code: "COMPARING", label: "他社と比較中" },
  { code: "NOT_NOW", label: "今回は見送り" },
];

export const TEMPERATURE_LABEL = Object.fromEntries(
  TEMPERATURES.map((t) => [t.code, t.label]),
) as Record<TemperatureCode, string>;

export const NEXT_ACTIONS: { code: NextActionKindCode; label: string }[] = [
  { code: "QUOTE", label: "見積もりを渡す" },
  { code: "FAMILY", label: "家族と相談" },
  { code: "DOCUMENTS", label: "書類を持って再来店" },
  { code: "STOCK", label: "入荷・在庫の連絡" },
  { code: "CALLBACK", label: "こちらから連絡" },
  { code: "OTHER", label: "その他" },
];

export const NEXT_ACTION_LABEL = Object.fromEntries(
  NEXT_ACTIONS.map((a) => [a.code, a.label]),
) as Record<NextActionKindCode, string>;

/** 次にやることを1行の文にする(「その他」は自由記入をそのまま出す) */
export function nextActionText(kind: NextActionKindCode, note: string | null): string {
  if (kind === "OTHER") return note?.trim() || "その他";
  return note?.trim() ? `${NEXT_ACTION_LABEL[kind]}(${note.trim()})` : NEXT_ACTION_LABEL[kind];
}

/**
 * 時期によって中身が変わる案内項目(料金・キャンペーン・端末の値段など)。
 * 前回の説明のあとに中身が変わっていたら、次の人は必ず案内し直す。
 */
export const VOLATILE_ITEM_LABELS = new Set([
  "料金比較",
  "料金プラン",
  "端末価格",
  "キャンペーン",
  "月額料金",
  "スマホとのセット割",
  "プラン比較",
  "家族割",
  "解約金",
]);

/**
 * 用件と、用件ごとの「案内すること」。並び順 = 話す順。
 * seed はこの目録をそのままDBに入れる。
 */
export const TOPIC_CATALOG: { code: string; label: string; items: string[] }[] = [
  {
    code: "MODEL_CHANGE",
    label: "機種変更",
    items: ["希望の機種", "端末価格", "下取り", "データ移行", "キャンペーン"],
  },
  {
    code: "MNP",
    label: "のりかえ(MNP)",
    items: ["料金比較", "端末価格", "下取り", "キャンペーン", "必要書類"],
  },
  {
    code: "NEW",
    label: "新規契約",
    items: ["料金プラン", "端末価格", "キャンペーン", "必要書類"],
  },
  {
    code: "HIKARI",
    label: "光回線",
    items: ["提供エリア", "月額料金", "スマホとのセット割", "工事日"],
  },
  {
    code: "PLAN_REVIEW",
    label: "料金見直し",
    items: ["今の使い方", "プラン比較", "オプション整理", "家族割"],
  },
  {
    code: "CANCEL",
    label: "解約相談",
    items: ["解約の理由", "残りの端末代", "解約金", "続ける場合の案"],
  },
  {
    code: "OTHER",
    label: "その他",
    items: ["用件の聞き取り"],
  },
];
