import { describe, expect, it } from "vitest";
import {
  buildHandoffSummary,
  buildTalkHints,
  itemStatuses,
  type ChecklistCatalog,
  type HandoffVisit,
} from "../handoff";

// 目録の一部(id は仮)。キャンペーンは 2026-10-01 に中身が変わった
const catalog: ChecklistCatalog = {
  MNP: [
    { id: 1, label: "料金比較", volatile: true, revisedOn: null },
    { id: 2, label: "端末価格" },
    { id: 3, label: "下取り" },
    { id: 4, label: "キャンペーン", volatile: true, revisedOn: "2026-10-01" },
    { id: 5, label: "必要書類" },
  ],
  HIKARI: [
    { id: 11, label: "提供エリア" },
    { id: 12, label: "月額料金" },
  ],
};
const ALL_MNP = [1, 2, 3, 4, 5];

function visit(over: Partial<HandoffVisit> = {}): HandoffVisit {
  return {
    // 2026-10-03 15:00 JST
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

const QUOTE_OPEN =
  "見積もりを作りながら詳細を案内する(声かけの例:『詳細を見積もりを作りながら、ご案内させていただきますね』)";

describe("buildHandoffSummary(基本)", () => {
  it("記録がなければ「初めて」と出す", () => {
    expect(buildHandoffSummary([], catalog).text).toContain("初めてのお客様");
  });

  it("前回の担当者・役割・日付・その日の案内・次の項目・説明済みの扱いを出す", () => {
    const s = buildHandoffSummary([visit()], catalog);
    expect(s.text).toBe(
      "前回 10/3(土) 森田 陽菜(イベント)が「のりかえ(MNP)」で 料金比較・端末価格 まで案内。" +
        "次は 下取り・キャンペーン から。" +
        "説明済み:料金比較・端末価格 はまず理解度を伺い、必要ならもう一度詳しく。",
    );
    expect(s.remaining).toEqual(["下取り", "キャンペーン", "必要書類"]);
  });

  it("その日に案内がなければ、その日の話としてそう書く", () => {
    const s = buildHandoffSummary([visit({ checkedItemIds: [] })], catalog);
    expect(s.text).toContain("の用件を伺った(この日の案内はなし)。");
    expect(s.text).toContain("次は 料金比較・端末価格 から。");
  });

  it("用件が2つなら両方の項目を目録の順に並べる", () => {
    const s = buildHandoffSummary(
      [
        visit({
          topics: [
            { code: "MNP", label: "のりかえ(MNP)" },
            { code: "HIKARI", label: "光回線" },
          ],
          checkedItemIds: [...ALL_MNP, 11],
        }),
      ],
      catalog,
    );
    expect(s.text).toContain("「のりかえ(MNP)・光回線」");
    expect(s.text).toContain("次は 月額料金 から。");
  });

  it("全部済んでいれば、未完了の約束の続きから", () => {
    const s = buildHandoffSummary(
      [visit({ checkedItemIds: ALL_MNP, actions: [{ kind: "QUOTE", note: null, done: false }] })],
      catalog,
    );
    expect(s.text).toContain("これまでに一通り案内済み。次は「見積もりを渡す」の続きから。");
  });
});

describe("要約の文が矛盾しない(組み合わせ)", () => {
  // その日の案内あり/なし × それ以前の案内あり/なし × 前々回の約束あり/なし × あいまいあり/なし
  const cases: { name: string; visits: HandoffVisit[] }[] = [];
  for (const thatDay of [[], [1, 2], ALL_MNP]) {
    for (const before of [[], [3, 5]]) {
      for (const stale of [false, true]) {
        for (const unclear of [[], [1]]) {
          const latest = visit({
            visitedAt: new Date("2026-10-05T06:00:00Z"),
            checkedItemIds: thatDay,
            unclearItemIds: unclear.filter((id) => thatDay.includes(id)),
          });
          const older = visit({
            visitedAt: new Date("2026-10-02T06:00:00Z"),
            staff: { name: "中村 誠", role: "REGULAR" },
            checkedItemIds: [...before, 4],
            actions: stale ? [{ kind: "STOCK", note: null, done: false }] : [],
          });
          cases.push({
            name: `その日${thatDay.length}件 以前${before.length}件 前々回の約束${stale ? "あり" : "なし"} あいまい${unclear.length}件`,
            visits: [latest, older],
          });
        }
      }
    }
  }

  it.each(cases)("$name", ({ visits }) => {
    const { text, items } = buildHandoffSummary(visits, catalog);
    // 「次は〜から」と「一通り案内済み」は同時に出ない
    expect(text.includes("次は ") && text.includes("一通り案内済み")).toBe(false);
    // 「案内はまだ」と「一通り済み」が並ぶ古い言い方は出さない
    expect(text).not.toContain("案内はまだ");
    // 「説明済み」に出る項目と「次は」に出る項目は重ならない
    const explained = items.filter((i) => i.state === "EXPLAINED").map((i) => i.label);
    const nextPart = text.match(/次は (.+?) から。/)?.[1] ?? "";
    const nextLabels = nextPart.split("・").map((l) => l.replace(/\(.+\)$/, ""));
    for (const label of explained) expect(nextLabels).not.toContain(label);
    // 前々回の約束が残っていれば、必ず担当者への確認を書く
    if (visits[1].actions.some((a) => !a.done)) {
      expect(text).toContain("済んでいるか中村 誠さんに確認してから進める");
    }
  });
});

describe("問1:未完了の「見積もりを渡す」(Codex が再現した例)", () => {
  it("まだなら「見積もりを作りながら案内」、感想は聞かない", () => {
    const hints = buildTalkHints([visit({ actions: [{ kind: "QUOTE", note: null, done: false }] })], catalog);
    expect(hints[0]).toBe(QUOTE_OPEN);
    expect(hints).not.toContain("お渡しした見積もりの感想から聞く");
  });

  it("済んでいれば「お渡しした見積もりの感想から聞く」", () => {
    const hints = buildTalkHints(
      [
        visit({
          temperature: "POSITIVE",
          checkedItemIds: ALL_MNP,
          actions: [{ kind: "QUOTE", note: null, done: true }],
        }),
      ],
      catalog,
    );
    expect(hints).toContain("お渡しした見積もりの感想から聞く");
    expect(hints).not.toContain(QUOTE_OPEN);
  });

  it("ほかの約束も、まだ/済みで文を分ける", () => {
    const open = buildTalkHints([visit({ actions: [{ kind: "CALLBACK", note: null, done: false }] })], catalog);
    const done = buildTalkHints([visit({ actions: [{ kind: "CALLBACK", note: null, done: true }] })], catalog);
    expect(open[0]).toBe("こちらからの連絡がまだ。連絡するはずだった件から話す");
    expect(done).toContain("前回こちらから連絡した件から話す");
    const other = buildTalkHints(
      [visit({ actions: [{ kind: "OTHER", note: "ケースの取り寄せ", done: false }] })],
      catalog,
    );
    expect(other[0]).toBe("「ケースの取り寄せ」がまだ済んでいない。その件から話す");
  });
});

describe("問2:前回より前の未完了の約束(Codex が再現した例)", () => {
  const older = visit({
    visitedAt: new Date("2026-09-25T03:00:00Z"),
    staff: { name: "中村 誠", role: "REGULAR" },
    actions: [{ kind: "STOCK", note: null, done: false }],
  });

  it("前々回の未完了は消えずに、担当者への確認つきで要約とヒントの先頭に出る", () => {
    const visits = [visit(), older];
    const s = buildHandoffSummary(visits, catalog);
    expect(s.text).toContain(
      "9/25(金) 中村 誠さんの「入荷・在庫の連絡」が未完了のまま。済んでいるか中村 誠さんに確認してから進める。",
    );
    expect(s.staleActions).toHaveLength(1);
    expect(buildTalkHints(visits, catalog)[0]).toBe(
      "9/25(金) 中村 誠さんの「入荷・在庫の連絡」が未完了のまま。済んでいるか中村 誠さんに確認してから進める",
    );
  });

  it("同じ日・同じ担当者の未完了は、要約では1文にまとめる", () => {
    const two = {
      ...older,
      actions: [
        { kind: "STOCK" as const, note: null, done: false },
        { kind: "FAMILY" as const, note: null, done: false },
      ],
    };
    const text = buildHandoffSummary([visit(), two], catalog).text;
    expect(text).toContain(
      "9/25(金) 中村 誠さんの「入荷・在庫の連絡」「家族と相談」が未完了のまま。済んでいるか中村 誠さんに確認してから進める。",
    );
    expect(text.match(/確認してから進める/g)).toHaveLength(1);
  });

  it("済んでいれば出さない", () => {
    const done = { ...older, actions: [{ kind: "STOCK" as const, note: null, done: true }] };
    expect(buildHandoffSummary([visit(), done], catalog).staleActions).toHaveLength(0);
  });

  it("前回の未完了には確認の印を付けない(前回の約束としてそのまま続ける)", () => {
    const s = buildHandoffSummary([visit({ actions: [{ kind: "QUOTE", note: null, done: false }] })], catalog);
    expect(s.text).not.toContain("確認してから");
  });
});

describe("問3:説明済みは期限で切らず、理解度と中身の変更で決める", () => {
  it("1年前の説明でも、日数では「まだ」に戻さない(Codex が再現した例)", () => {
    const yearAgo = visit({ visitedAt: new Date("2025-10-01T03:00:00Z"), checkedItemIds: [2, 3] });
    const latest = visit({ checkedItemIds: [] });
    const items = itemStatuses([latest, yearAgo], catalog);
    expect(items.find((i) => i.label === "端末価格")?.state).toBe("EXPLAINED");
    expect(buildHandoffSummary([latest, yearAgo], catalog).text).toContain(
      "説明済み:端末価格・下取り はまず理解度を伺い、必要ならもう一度詳しく。",
    );
  });

  it("キャンペーンが説明のあとに変わっていたら「変更あり:必ず案内」で、説明済みに数えない", () => {
    // 9/28 にキャンペーンを説明 → 10/1 に改定
    const visits = [visit({ visitedAt: new Date("2026-09-28T03:00:00Z"), checkedItemIds: [1, 2, 3, 4] })];
    const s = buildHandoffSummary(visits, catalog);
    expect(s.text).toContain("変更あり:キャンペーン は前回の説明のあとに中身が変わったので必ず案内。");
    expect(s.text).toContain("次は キャンペーン(変更あり)・必要書類 から。");
    expect(s.text).not.toMatch(/説明済み:[^。]*キャンペーン/);
    expect(buildTalkHints(visits, catalog)[0]).toBe(
      "変更あり:「キャンペーン」は前回の説明のあとに中身が変わったので必ず案内する",
    );
  });

  it("改定のあとに説明していれば、ふつうの説明済み", () => {
    const items = itemStatuses([visit({ checkedItemIds: [4] })], catalog); // 10/3 に説明
    expect(items.find((i) => i.label === "キャンペーン")?.state).toBe("EXPLAINED");
  });

  it("改定日と説明日が同じ日なら、必ず案内する方に倒す", () => {
    const items = itemStatuses(
      [visit({ visitedAt: new Date("2026-10-01T03:00:00Z"), checkedItemIds: [4] })],
      catalog,
    );
    expect(items.find((i) => i.label === "キャンペーン")?.state).toBe("CHANGED");
  });

  it("前回「理解があいまい」だった項目は、もう一度詳しく案内する", () => {
    const visits = [visit({ checkedItemIds: [1, 2], unclearItemIds: [2] })];
    const s = buildHandoffSummary(visits, catalog);
    expect(s.text).toContain("前回あいまいだった:端末価格 はもう一度詳しく案内。");
    expect(s.text).toContain("次は 端末価格(前回あいまい)・下取り から。");
    expect(s.text).toContain("説明済み:料金比較 はまず理解度を伺い");
    expect(buildTalkHints(visits, catalog)[0]).toBe("前回あいまいだった「端末価格」をもう一度詳しく案内する");
  });

  it("あいまいだった項目を、あとで分かってもらえたら説明済みに戻る", () => {
    const older = visit({ visitedAt: new Date("2026-10-02T03:00:00Z"), checkedItemIds: [2], unclearItemIds: [2] });
    const latest = visit({ checkedItemIds: [2] });
    expect(itemStatuses([latest, older], catalog).find((i) => i.label === "端末価格")?.state).toBe(
      "EXPLAINED",
    );
  });

  it("あいまいだったうえに中身も変わっていたら、変更ありを優先", () => {
    const v = visit({ visitedAt: new Date("2026-09-28T03:00:00Z"), checkedItemIds: [4], unclearItemIds: [4] });
    expect(itemStatuses([v], catalog).find((i) => i.label === "キャンペーン")?.state).toBe("CHANGED");
  });
});

describe("buildTalkHints(並びと上限)", () => {
  it("記録がなければ用件を聞くところから", () => {
    expect(buildTalkHints([], catalog)).toEqual(["用件を聞く(機種変更・のりかえ・光回線など)"]);
  });

  it("前々回の約束 → 前回の約束 → 変更あり の順で、3つまで", () => {
    const older = visit({
      visitedAt: new Date("2026-09-25T03:00:00Z"),
      staff: { name: "中村 誠", role: "REGULAR" },
      checkedItemIds: [4],
      actions: [{ kind: "STOCK", note: null, done: false }],
    });
    const hints = buildTalkHints(
      [visit({ checkedItemIds: [1, 2], actions: [{ kind: "QUOTE", note: null, done: false }] }), older],
      catalog,
    );
    expect(hints).toHaveLength(3);
    expect(hints[0]).toContain("中村 誠さんに確認してから進める");
    expect(hints[1]).toBe(QUOTE_OPEN);
    expect(hints[2]).toBe("変更あり:「キャンペーン」は前回の説明のあとに中身が変わったので必ず案内する");
  });

  it("約束も変更もなければ、温度感と未案内で埋める", () => {
    expect(buildTalkHints([visit({ temperature: "NOT_NOW" })], catalog)).toEqual([
      "無理に勧めず、前回から変わったことを聞く",
      "まだ案内していない「下取り」を説明する",
      "まだ案内していない「キャンペーン」を説明する",
    ]);
  });

  it("全部説明済みなら、最後に「まず理解度を伺う」が入る", () => {
    expect(buildTalkHints([visit({ temperature: "POSITIVE", checkedItemIds: ALL_MNP })], catalog)).toEqual([
      "手続きに進めるか確かめる(かかる時間を先に伝える)",
      "説明済みの「料金比較・端末価格」は、まず理解度を伺い、必要ならもう一度詳しく案内する",
    ]);
  });
});
