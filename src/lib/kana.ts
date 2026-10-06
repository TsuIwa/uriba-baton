// お客様の名前カナと、検索語の揃え方。

/**
 * 名前カナを「全角カタカナ+半角スペース1つ」に揃える。
 * ひらがな・半角カナ・全角スペースで入れても同じ形になる。
 */
export function normalizeKana(input: string): string {
  return (
    input
      // 半角カナ → 全角カナ、全角スペース → 半角スペース
      .normalize("NFKC")
      // ひらがな → カタカナ(ぁ〜ゖ をコード差 0x60 でずらす)
      .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** DBの CHECK 制約と同じ条件:全角カタカナ・長音・スペースだけ */
export function isValidKana(kana: string): boolean {
  return /^[ァ-ヶー ]+$/.test(kana);
}

export function isValidLast4(value: string): boolean {
  return /^[0-9]{4}$/.test(value);
}

export type CustomerQuery = { kana: string | null; last4: string | null };

/**
 * 検索欄の1行を「カナ」と「下4桁」に分ける。
 * 例: "やまだ 1234" → { kana: "ヤマダ", last4: "1234" }
 * 数字が4桁ちょうどのときだけ下4桁として使う。
 */
export function parseCustomerQuery(raw: string): CustomerQuery {
  const text = raw.normalize("NFKC");
  const digits = text.match(/\d+/g) ?? [];
  const last4 = digits.find((d) => d.length === 4) ?? null;
  const kanaPart = normalizeKana(text.replace(/\d+/g, " "));
  return { kana: kanaPart.length > 0 ? kanaPart : null, last4 };
}
