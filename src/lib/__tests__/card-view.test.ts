import { describe, expect, it } from "vitest";
import { buildCardView, confirmLines, splitNextLine } from "../card-view";
import { buildTalkHints, type ChecklistCatalog, type HandoffVisit } from "../handoff";

// handoff.test.ts と同じ目録の一部。キャンペーンは版2
const catalog: ChecklistCatalog = {
  MNP: [
    { id: 1, label: "料金比較", volatile: true },
    { id: 2, label: "端末価格" },
    { id: 3, label: "下取り" },
    { id: 4, label: "キャンペーン", volatile: true, version: 2 },
    { id: 5, label: "必要書類" },
  ],
};

function visit(over: Partial<HandoffVisit> = {}): HandoffVisit {
  return {
    visitedAt: new Date("2026-10-03T06:00:00Z"),
    staff: { name: "森田 陽菜", role: "EVENT" },
    temperature: "COMPARING",
    topics: [{ code: "MNP", label: "のりかえ(MNP)" }],
    checkedItemIds: [1, 2],
    unclearItemIds: [],
    actions: [],
    ...over,
  };
}

/** 店主の原文。1字も変えない */
const VOICE = "詳細を見積もりを作りながら、ご案内させていただきますね";

describe("splitNextLine", () => {
  it("声かけの例は『』の中身を主役に、前の部分を補足にする(文字は変えない)", () => {
    const hints = buildTalkHints([visit({ actions: [{ kind: "QUOTE", note: null, done: false }] })], catalog);
    const line = splitNextLine(hints.extra[0]);
    expect(line).toEqual({ main: VOICE, spoken: true, note: "見積もりを作りながら詳細を案内する" });
  });

  it("声かけの例が無ければ、そのまま主役にして補足は無し", () => {
    expect(splitNextLine("ご家族と相談できたかを聞く")).toEqual({
      main: "ご家族と相談できたかを聞く",
      spoken: false,
      note: null,
    });
  });
});

describe("confirmLines", () => {
  it("同じ日・同じ担当者の未完了は1行にまとめ、担当者が違えば分ける", () => {
    const at = new Date("2026-09-24T06:00:00Z");
    const lines = confirmLines([
      { visitedAt: at, staffName: "小林 葵", kind: "STOCK", note: null },
      { visitedAt: at, staffName: "小林 葵", kind: "FAMILY", note: null },
      { visitedAt: at, staffName: "中村 誠", kind: "OTHER", note: "ケースの取り寄せ" },
    ]);
    expect(lines).toEqual([
      { staffName: "小林 葵", date: "9/24(木)", labels: ["入荷・在庫の連絡", "家族と相談"] },
      { staffName: "中村 誠", date: "9/24(木)", labels: ["ケースの取り寄せ"] },
    ]);
  });
});

describe("buildCardView", () => {
  it("初めてのお客様は前回が無く、次の一言は用件を聞く", () => {
    const v = buildCardView([], catalog);
    expect(v.from).toBeNull();
    expect(v.upTo).toBeNull();
    expect(v.next.main).toContain("用件を聞く");
    expect(v.talk).toEqual([]);
  });

  it("前回の担当・何まで・前々回の約束・話す順・説明済みを分けて返す", () => {
    const visits = [
      visit({
        // 前回:キャンペーンは版1で説明(今は版2=変更あり)、下取りはあいまい
        checkedItemIds: [1, 3, 4],
        unclearItemIds: [3],
        explainedVersions: { 4: 1 },
        temperature: "NOT_NOW",
        staff: { name: "小林 葵", role: "REGULAR" },
        actions: [{ kind: "QUOTE", note: null, done: false }],
      }),
      visit({
        visitedAt: new Date("2026-09-24T06:00:00Z"),
        checkedItemIds: [2],
        staff: { name: "小林 葵", role: "REGULAR" },
        actions: [
          { kind: "STOCK", note: null, done: false },
          { kind: "FAMILY", note: null, done: false },
        ],
      }),
    ];
    const v = buildCardView(visits, catalog);
    expect(v.from).toEqual({ staffName: "小林 葵", role: "REGULAR", roleLabel: "常勤", date: "10/3(土)" });
    expect(v.upTo).toEqual({
      topics: ["のりかえ(MNP)"],
      doneItems: ["料金比較", "下取り", "キャンペーン"],
      temperature: "今回は見送り",
    });
    expect(v.confirm).toEqual([{ staffName: "小林 葵", date: "9/24(木)", labels: ["入荷・在庫の連絡", "家族と相談"] }]);
    expect(v.next).toEqual({ main: VOICE, spoken: true, note: "見積もりを作りながら詳細を案内する" });
    // 変更あり → あいまい → まだ
    expect(v.talk.map((i) => [i.label, i.state])).toEqual([
      ["キャンペーン", "CHANGED"],
      ["下取り", "UNCLEAR"],
      ["必要書類", "NOT_YET"],
    ]);
    expect(v.explained.map((i) => i.label)).toEqual(["料金比較", "端末価格"]);
    // 必ず=先に確認2件+変更あり1件
    expect(v.counts).toEqual({ required: 3, confirm: 2, changed: 1, unclear: 1, notYet: 1 });
    expect(v.summaryText).toContain("前回 10/3(土) 小林 葵(常勤)");
  });
});
