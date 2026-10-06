import { describe, expect, it } from "vitest";
import { parseVisitInput, type ParseContext } from "../visit-input";

const ctx: ParseContext = {
  topicIds: new Set([1, 2]),
  // 項目 10,11 は用件1、項目 20 は用件2
  itemTopic: new Map([
    [10, 1],
    [11, 1],
    [20, 2],
  ]),
  today: "2026-12-30",
};

const base = {
  customer: { kind: "existing", id: "0b6f6a3e-6f1e-4c55-9a43-2a4f3c1d9e10" },
  topicIds: [1],
  checklistItemIds: [10],
  temperature: "CONSIDERING",
  actions: ["QUOTE"],
  nextVisitDate: "2027-01-02",
  memo: "  ",
  inputSeconds: 24,
};

describe("parseVisitInput", () => {
  it("正しい入力を受け付けて、用件つきのチェックに直す", () => {
    const r = parseVisitInput(base, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.checks).toEqual([{ topicId: 1, checklistItemId: 10 }]);
    expect(r.value.actions).toEqual([{ kind: "QUOTE", note: null }]);
    expect(r.value.memo).toBeNull(); // 空白だけの自由記入は空にする
    expect(r.value.nextVisitDate).toBe("2027-01-02"); // 年をまたぐ予定日も通る
  });

  it("新規のお客様はカナを揃えてから確かめる", () => {
    const r = parseVisitInput(
      { ...base, customer: { kind: "new", nameKana: "すずき　いちろう", phoneLast4: "０４５６" } },
      ctx,
    );
    expect(r.ok && r.value.customer).toEqual({
      kind: "new",
      nameKana: "スズキ イチロウ",
      phoneLast4: "0456",
    });
  });

  it("新規で漢字・下4桁の間違いはエラー", () => {
    const r = parseVisitInput(
      { ...base, customer: { kind: "new", nameKana: "鈴木", phoneLast4: "12" } },
      ctx,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain("名前はカナで入れてください");
    expect(r.errors).toContain("電話番号の下4桁は数字4つで入れてください");
  });

  it("用件なし・温度感なしはエラー", () => {
    const r = parseVisitInput({ ...base, topicIds: [], checklistItemIds: [], temperature: "" }, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain("用件を1つ以上選んでください");
    expect(r.errors).toContain("お客様の温度感を選んでください");
  });

  it("選んでいない用件の項目にチェックがあればエラー", () => {
    const r = parseVisitInput({ ...base, checklistItemIds: [20] }, ctx);
    expect(r.ok).toBe(false);
  });

  it("「その他」は自由記入が必須", () => {
    expect(parseVisitInput({ ...base, actions: ["OTHER"] }, ctx).ok).toBe(false);
    const r = parseVisitInput({ ...base, actions: ["OTHER"], otherNote: "ケース取り寄せ" }, ctx);
    expect(r.ok && r.value.actions).toEqual([{ kind: "OTHER", note: "ケース取り寄せ" }]);
  });

  it("次回来店予定日は今日から1年以内", () => {
    expect(parseVisitInput({ ...base, nextVisitDate: "2026-12-29" }, ctx).ok).toBe(false);
    expect(parseVisitInput({ ...base, nextVisitDate: "2026-12-30" }, ctx).ok).toBe(true);
    expect(parseVisitInput({ ...base, nextVisitDate: "2027-12-31" }, ctx).ok).toBe(false);
    expect(parseVisitInput({ ...base, nextVisitDate: "" }, ctx).ok).toBe(true);
  });

  it("入力秒数は0〜3600の整数", () => {
    expect(parseVisitInput({ ...base, inputSeconds: -1 }, ctx).ok).toBe(false);
    expect(parseVisitInput({ ...base, inputSeconds: 12.5 }, ctx).ok).toBe(false);
  });

  it("中身が空っぽでも落ちずにエラーを返す", () => {
    const r = parseVisitInput(null, ctx);
    expect(r.ok).toBe(false);
  });
});
