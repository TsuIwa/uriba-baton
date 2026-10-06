import { describe, expect, it } from "vitest";
import { buildHandoffSummary, buildTalkHints, type ChecklistCatalog, type HandoffVisit } from "../handoff";

// 目録の一部(id は仮)
const catalog: ChecklistCatalog = {
  MNP: [
    { id: 1, label: "料金比較" },
    { id: 2, label: "端末価格" },
    { id: 3, label: "下取り" },
    { id: 4, label: "キャンペーン" },
    { id: 5, label: "必要書類" },
  ],
  HIKARI: [
    { id: 11, label: "提供エリア" },
    { id: 12, label: "月額料金" },
  ],
};

function visit(over: Partial<HandoffVisit> = {}): HandoffVisit {
  return {
    // 2026-10-03 15:00 JST
    visitedAt: new Date("2026-10-03T06:00:00Z"),
    staff: { name: "森田 陽菜", role: "EVENT" },
    temperature: "COMPARING",
    topics: [{ code: "MNP", label: "のりかえ(MNP)" }],
    checkedItemIds: [1, 2],
    openActions: [],
    ...over,
  };
}

describe("buildHandoffSummary", () => {
  it("記録がなければ「初めて」と出す", () => {
    expect(buildHandoffSummary([], catalog).text).toContain("初めてのお客様");
  });

  it("前回の担当者・役割・日付・案内済み・次の項目を1文で出す", () => {
    const s = buildHandoffSummary([visit()], catalog);
    expect(s.text).toBe(
      "前回 10/3(土) 森田 陽菜(イベント)が「のりかえ(MNP)」で 料金比較・端末価格 まで案内済み。次は 下取り・キャンペーン から。",
    );
    expect(s.remaining).toEqual(["下取り", "キャンペーン", "必要書類"]);
  });

  it("前々回に案内した項目は「次は」に出さない", () => {
    const older = visit({ visitedAt: new Date("2026-09-20T03:00:00Z"), checkedItemIds: [3] });
    const s = buildHandoffSummary([visit(), older], catalog);
    expect(s.text).toContain("次は キャンペーン・必要書類 から。");
  });

  it("チェックが1つもなければ「案内はまだ」と出す", () => {
    const s = buildHandoffSummary([visit({ checkedItemIds: [] })], catalog);
    expect(s.text).toContain("用件を伺っただけで、案内はまだ。");
    expect(s.text).toContain("次は 料金比較・端末価格 から。");
  });

  it("全部案内済みなら、約束していた次にやることから", () => {
    const s = buildHandoffSummary(
      [visit({ checkedItemIds: [1, 2, 3, 4, 5], openActions: [{ kind: "QUOTE", note: null }] })],
      catalog,
    );
    expect(s.text).toContain("案内は一通り済み。次は「見積もりを渡す」の続きから。");
  });

  it("用件が2つなら両方の項目を目録の順に並べる", () => {
    const s = buildHandoffSummary(
      [
        visit({
          topics: [
            { code: "MNP", label: "のりかえ(MNP)" },
            { code: "HIKARI", label: "光回線" },
          ],
          checkedItemIds: [1, 2, 3, 4, 5, 11],
        }),
      ],
      catalog,
    );
    expect(s.text).toContain("「のりかえ(MNP)・光回線」");
    expect(s.text).toContain("次は 月額料金 から。");
  });
});

describe("buildTalkHints", () => {
  it("記録がなければ用件を聞くところから", () => {
    expect(buildTalkHints([], catalog)).toEqual(["用件を聞く(機種変更・のりかえ・光回線など)"]);
  });

  it("約束 → 温度感 → 未案内 の順に3つまで", () => {
    const hints = buildTalkHints(
      [visit({ openActions: [{ kind: "FAMILY", note: null }, { kind: "QUOTE", note: null }] })],
      catalog,
    );
    expect(hints).toEqual([
      "ご家族と相談した結果から聞く",
      "他社の条件で何が決め手になっているかを聞く",
      "まだ案内していない「下取り」を説明する",
    ]);
  });

  it("約束がなければ温度感と未案内で埋める", () => {
    const hints = buildTalkHints([visit({ temperature: "NOT_NOW" })], catalog);
    expect(hints).toEqual([
      "無理に勧めず、前回から変わったことを聞く",
      "まだ案内していない「下取り」を説明する",
      "まだ案内していない「キャンペーン」を説明する",
    ]);
  });

  it("「その他」の約束は自由記入をそのまま使う", () => {
    const hints = buildTalkHints(
      [visit({ openActions: [{ kind: "OTHER", note: "ケースの取り寄せ" }] })],
      catalog,
    );
    expect(hints[0]).toBe("「ケースの取り寄せ」の件から話す");
  });

  it("全部案内済みで約束もなければ、温度感の1つだけ", () => {
    const hints = buildTalkHints(
      [visit({ temperature: "POSITIVE", checkedItemIds: [1, 2, 3, 4, 5] })],
      catalog,
    );
    expect(hints).toEqual(["手続きに進めるか確かめる(かかる時間を先に伝える)"]);
  });
});
