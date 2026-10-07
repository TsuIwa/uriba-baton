// DBを使う統合テスト。
// 目録(用件・案内項目)は seed で入っている前提。テスト用の店を別に作り、最後に消す。
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  completeNextAction,
  createVisit as createVisitRaw,
  getCatalog,
  getCustomerCard,
  getTodayBoard,
  searchCustomers,
  toHandoffVisits,
} from "@/lib/queries";
import type { VisitInput } from "@/lib/visit-input";
import { buildHandoffSummary, buildTalkHints } from "@/lib/handoff";
import { ymdToDbDate } from "@/lib/dates";

/**
 * 多くのテストは「画面の担当者=保存する人」なので、staffId が 0 のときは保存する人で埋める。
 * 担当者の食い違いを試すテストだけ createVisitRaw を直接呼ぶ
 */
const createVisit: typeof createVisitRaw = (store, staff, inp, now, source) =>
  createVisitRaw(store, staff, { ...inp, staffId: inp.staffId === 0 ? staff : inp.staffId }, now, source);

let storeId: number;
let regularId: number;
let eventId: number;
// 境界の確かめ用の、もう1つの店
let otherStoreId: number;
let otherStaffId: number;
let mnp: { id: number; items: { id: number; version: number }[] };
let hikari: { id: number; items: { id: number; version: number }[] };

const jst = (s: string) => new Date(`${s}+09:00`);

function input(over: Partial<VisitInput> = {}): VisitInput {
  return {
    requestId: randomUUID(),
    staffId: 0,
    customer: { kind: "new", nameKana: "テスト タロウ", phoneLast4: "9999" },
    topicIds: [mnp.id],
    checks: [{ topicId: mnp.id, checklistItemId: mnp.items[0].id, unclear: false, shownVersion: mnp.items[0].version }],
    temperature: "CONSIDERING",
    actions: [{ kind: "QUOTE", note: null }],
    nextVisitDate: null,
    memo: null,
    inputSeconds: 21,
    ...over,
  };
}

beforeAll(async () => {
  const catalog = await getCatalog();
  const find = (code: string) => {
    const t = catalog.topics.find((x) => x.code === code);
    if (!t) throw new Error("目録がありません。先に npm run db:seed を流してください");
    return t;
  };
  mnp = find("MNP");
  hikari = find("HIKARI");

  const store = await prisma.store.create({ data: { name: "自動テスト用の店" } });
  storeId = store.id;
  regularId = (await prisma.staff.create({ data: { storeId, name: "試験 常勤", displayName: "試験 常勤", role: "REGULAR" } })).id;
  eventId = (await prisma.staff.create({ data: { storeId, name: "試験 イベント", displayName: "試験 イベント", role: "EVENT" } })).id;

  otherStoreId = (await prisma.store.create({ data: { name: "自動テスト用の別の店" } })).id;
  otherStaffId = (
    await prisma.staff.create({ data: { storeId: otherStoreId, name: "別店 常勤", displayName: "別店 常勤", role: "REGULAR" } })
  ).id;
});

afterAll(async () => {
  // お客様を消すと記録・用件・チェック・次にやることは連鎖して消える
  const stores = [storeId, otherStoreId];
  await prisma.customer.deleteMany({ where: { storeId: { in: stores } } });
  await prisma.staff.deleteMany({ where: { storeId: { in: stores } } });
  await prisma.store.deleteMany({ where: { id: { in: stores } } });
  await prisma.$disconnect();
});

describe("年またぎ:来店予定が今日・今週の一覧に正しく出る", () => {
  it("12/29に「1/2来店予定」と記録 → 12/30は今週・1/2は今日・1/4は出ない", async () => {
    const { customerId } = await createVisit(
      storeId,
      regularId,
      input({
        customer: { kind: "new", nameKana: "ネンマタギ ハナコ", phoneLast4: "1231" },
        nextVisitDate: "2027-01-02",
      }),
      jst("2026-12-29T18:00:00"),
    );

    // 12/30(水)の週は 12/28〜1/3。1/2 は「今週」に入る
    const b1 = await getTodayBoard(storeId, jst("2026-12-30T09:00:00"));
    expect(b1.week).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(b1.scheduledThisWeek.map((v) => v.customerId)).toContain(customerId);
    expect(b1.scheduledToday.map((v) => v.customerId)).not.toContain(customerId);

    // 大みそかの 23:59 はまだ 2026 年。1/1 0:00 を過ぎても同じ週
    const b2 = await getTodayBoard(storeId, jst("2027-01-01T00:00:00"));
    expect(b2.today).toBe("2027-01-01");
    expect(b2.scheduledThisWeek.map((v) => v.customerId)).toContain(customerId);

    // 当日は「今日」に出る
    const b3 = await getTodayBoard(storeId, jst("2027-01-02T10:00:00"));
    expect(b3.scheduledToday.map((v) => v.customerId)).toContain(customerId);

    // 予定日を過ぎた翌週には出ない
    const b4 = await getTodayBoard(storeId, jst("2027-01-04T10:00:00"));
    expect([...b4.scheduledToday, ...b4.scheduledThisWeek].map((v) => v.customerId)).not.toContain(
      customerId,
    );

    // 前の週(12/21〜12/27)の一覧にも出ない
    const b5 = await getTodayBoard(storeId, jst("2026-12-27T10:00:00"));
    expect([...b5.scheduledToday, ...b5.scheduledThisWeek].map((v) => v.customerId)).not.toContain(
      customerId,
    );
  });

  it("その後に来店して新しい記録ができたら、古い予定は一覧から消える", async () => {
    const { customerId } = await createVisit(
      storeId,
      eventId,
      input({
        customer: { kind: "new", nameKana: "ウワガキ ジロウ", phoneLast4: "2222" },
        nextVisitDate: "2027-01-02",
      }),
      jst("2026-12-28T12:00:00"),
    );
    await createVisit(
      storeId,
      regularId,
      input({ customer: { kind: "existing", id: customerId }, nextVisitDate: null }),
      jst("2026-12-30T12:00:00"),
    );
    const board = await getTodayBoard(storeId, jst("2026-12-31T10:00:00"));
    expect(board.scheduledThisWeek.map((v) => v.customerId)).not.toContain(customerId);
  });
});

describe("同時に動いたとき", () => {
  it("同じ「次にやること」を2人が同時に済みにしても、記録されるのは1人だけ", async () => {
    const { visitId } = await createVisit(
      storeId,
      regularId,
      input({ customer: { kind: "new", nameKana: "ドウジ サブロウ", phoneLast4: "3333" } }),
    );
    const action = await prisma.nextAction.findFirstOrThrow({ where: { visitId } });

    const results = await Promise.all([
      completeNextAction(storeId, action.id, regularId),
      completeNextAction(storeId, action.id, eventId),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);

    const after = await prisma.nextAction.findUniqueOrThrow({ where: { id: action.id } });
    const winner = results[0] ? regularId : eventId;
    expect(after.doneByStaffId).toBe(winner);
    expect(after.doneAt).not.toBeNull();

    // もう済んでいるものを押しても false(上書きしない)
    expect(await completeNextAction(storeId, action.id, regularId)).toBe(false);
  });

  it("同じお客様に2人が同時に記録しても、両方とも残る", async () => {
    const { customerId } = await createVisit(
      storeId,
      regularId,
      input({ customer: { kind: "new", nameKana: "ドウジ シロウ", phoneLast4: "4444" } }),
      jst("2026-10-01T10:00:00"),
    );
    await Promise.all([
      createVisit(storeId, regularId, input({ customer: { kind: "existing", id: customerId } })),
      createVisit(storeId, eventId, input({ customer: { kind: "existing", id: customerId } })),
    ]);
    const card = await getCustomerCard(storeId, customerId);
    expect(card?.visits).toHaveLength(3);
    expect(new Set(card?.visits.map((v) => v.staffId))).toEqual(new Set([regularId, eventId]));
  });
});

describe("DBの制約が守っていること", () => {
  it("途中で失敗したら、新規のお客様も作られない(トランザクション)", async () => {
    // 選んでいない用件(光回線)の項目を混ぜる → 複合外部キーで弾かれる
    await expect(
      createVisit(
        storeId,
        regularId,
        input({
          customer: { kind: "new", nameKana: "シッパイ ゴロウ", phoneLast4: "5555" },
          checks: [{ topicId: hikari.id, checklistItemId: hikari.items[0].id, unclear: false, shownVersion: hikari.items[0].version }],
        }),
      ),
    ).rejects.toThrow();
    const found = await searchCustomers(storeId, { kana: "シッパイ", last4: null });
    expect(found).toHaveLength(0);
  });

  it("用件と項目の組み合わせが違うチェックは入らない", async () => {
    const { visitId } = await createVisit(
      storeId,
      regularId,
      input({ customer: { kind: "new", nameKana: "クミアワセ ロク", phoneLast4: "6666" } }),
    );
    // 用件は MNP なのに、光回線の項目を MNP として入れようとする
    await expect(
      prisma.visitCheck.create({
        data: { visitId, topicId: mnp.id, checklistItemId: hikari.items[0].id, explainedVersion: 1 },
      }),
    ).rejects.toThrow();
  });

  it("下4桁が数字4つでない・カナでないお客様は入らない(CHECK制約)", async () => {
    await expect(
      prisma.customer.create({ data: { storeId, nameKana: "テスト", phoneLast4: "12a4" } }),
    ).rejects.toThrow();
    await expect(
      prisma.customer.create({ data: { storeId, nameKana: "山田", phoneLast4: "1234" } }),
    ).rejects.toThrow();
  });

  it("「その他」の次にやることは自由記入なしでは入らない(CHECK制約)", async () => {
    const { visitId } = await createVisit(
      storeId,
      regularId,
      input({ customer: { kind: "new", nameKana: "ソノタ ナナ", phoneLast4: "7777" } }),
    );
    await expect(prisma.nextAction.create({ data: { visitId, kind: "OTHER" } })).rejects.toThrow();
  });

});

describe("店の境界(DBでは保証していないので、関数側で確かめる)", () => {
  it("別の店のスタッフでは記録できない", async () => {
    await expect(createVisit(storeId, otherStaffId, input())).rejects.toThrow("今のスタッフ");
  });

  it("別の店のお客様には記録できない", async () => {
    const { customerId } = await createVisit(
      otherStoreId,
      otherStaffId,
      input({ customer: { kind: "new", nameKana: "ベツミセ キャク", phoneLast4: "1010" } }),
    );
    await expect(
      createVisit(storeId, regularId, input({ customer: { kind: "existing", id: customerId } })),
    ).rejects.toThrow("お客様が見つかりません");
  });

  it("別の店のスタッフは「済み」にできない", async () => {
    const { visitId } = await createVisit(
      storeId,
      regularId,
      input({ customer: { kind: "new", nameKana: "キョウカイ ズミ", phoneLast4: "2020" } }),
    );
    const action = await prisma.nextAction.findFirstOrThrow({ where: { visitId } });
    await expect(completeNextAction(storeId, action.id, otherStaffId)).rejects.toThrow("この店のスタッフ");
    // 別の店の名前で、この店の約束を済みにすることもできない
    expect(await completeNextAction(otherStoreId, action.id, otherStaffId)).toBe(false);
    const after = await prisma.nextAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(after.doneAt).toBeNull();
  });
});

describe("検索", () => {
  it("下4桁が同じでもカナで見分けられる", async () => {
    await createVisit(storeId, regularId, input({ customer: { kind: "new", nameKana: "オナジ イチ", phoneLast4: "8888" } }));
    await createVisit(storeId, regularId, input({ customer: { kind: "new", nameKana: "ベツ ニ", phoneLast4: "8888" } }));
    expect(await searchCustomers(storeId, { kana: null, last4: "8888" })).toHaveLength(2);
    const one = await searchCustomers(storeId, { kana: "オナ", last4: "8888" });
    expect(one.map((c) => c.nameKana)).toEqual(["オナジ イチ"]);
  });
});

describe("二重送信", () => {
  it("同じ送信IDを2回送っても、記録は1件", async () => {
    const same = input({ customer: { kind: "new", nameKana: "ニジュウ ソウシン", phoneLast4: "3030" } });
    const first = await createVisit(storeId, regularId, same);
    const second = await createVisit(storeId, regularId, same);
    expect(first.duplicated).toBe(false);
    expect(second).toEqual({ ...first, duplicated: true });
    expect(await prisma.visit.count({ where: { requestId: same.requestId } })).toBe(1);
    expect(await searchCustomers(storeId, { kana: "ニジュウ", last4: "3030" })).toHaveLength(1);
  });

  it("同じ送信IDが同時に2つ届いても、記録もお客様も1件", async () => {
    const same = input({ customer: { kind: "new", nameKana: "ドウジ ソウシン", phoneLast4: "4040" } });
    const [a, b] = await Promise.all([
      createVisit(storeId, regularId, same),
      createVisit(storeId, regularId, same),
    ]);
    expect(a.visitId).toBe(b.visitId);
    expect([a.duplicated, b.duplicated].filter(Boolean)).toHaveLength(1);
    expect(await prisma.visit.count({ where: { requestId: same.requestId } })).toBe(1);
    expect(await searchCustomers(storeId, { kana: "ドウジ ソウシン", last4: "4040" })).toHaveLength(1);
  });
});

describe("記録時点の役割と、記録の出どころ", () => {
  it("イベントスタッフが後で常勤になっても、過去の記録の印と集計は変わらない", async () => {
    const temp = await prisma.staff.create({ data: { storeId, name: "試験 のちに常勤", displayName: "試験 のちに常勤", role: "EVENT" } });
    const { customerId } = await createVisit(
      storeId,
      temp.id,
      input({ customer: { kind: "new", nameKana: "ヤクワリ ヘンコウ", phoneLast4: "5050" }, inputSeconds: 40 }),
    );
    const now = new Date();
    const before = (await getTodayBoard(storeId, now)).stats.event.count;

    await prisma.staff.update({ where: { id: temp.id }, data: { role: "REGULAR" } });

    const after = (await getTodayBoard(storeId, now)).stats.event.count;
    expect(after).toBe(before);
    const card = await getCustomerCard(storeId, customerId);
    expect(toHandoffVisits(card!)[0].staff.role).toBe("EVENT");
  });

  it("見本(SEED)と自動テスト(E2E)の秒数は、実測の集計に入らない", async () => {
    const now = new Date();
    const base = (await getTodayBoard(storeId, now)).stats;
    await createVisit(
      storeId,
      regularId,
      input({ customer: { kind: "new", nameKana: "ミホン イチ", phoneLast4: "6060" }, inputSeconds: 999 }),
      now,
      "SEED",
    );
    await createVisit(
      storeId,
      regularId,
      input({ customer: { kind: "new", nameKana: "ジドウ ニ", phoneLast4: "7070" }, inputSeconds: 888 }),
      now,
      "E2E",
    );
    const next = (await getTodayBoard(storeId, now)).stats;
    expect(next.all).toEqual(base.all);
    expect(next.sample.count).toBe(base.sample.count + 1);
  });
});

describe("現場の判断(問1〜3)を、DBの記録から通しで", () => {
  it("あいまいの印・中身の改定・前々回の未完了の約束が、要約とヒントに出る", async () => {
    // MNP の「キャンペーン」を探す(seed の目録)
    const camp = await prisma.checklistItem.findFirstOrThrow({
      where: { topicId: mnp.id, label: "キャンペーン" },
    });
    const price = await prisma.checklistItem.findFirstOrThrow({ where: { topicId: mnp.id, label: "端末価格" } });
    const before = {
      isVolatile: camp.isVolatile,
      contentRevisedOn: camp.contentRevisedOn,
      contentVersion: camp.contentVersion,
    };

    try {
      // 9/20 中村…ではなく、テスト用の常勤が「キャンペーン」を説明し、入荷連絡を約束(未完了のまま)
      const { customerId } = await createVisit(
        storeId,
        regularId,
        input({
          customer: { kind: "new", nameKana: "ゲンバ ハンダン", phoneLast4: "8080" },
          checks: [{ topicId: mnp.id, checklistItemId: camp.id, unclear: false, shownVersion: camp.contentVersion }],
          actions: [{ kind: "STOCK", note: null }],
        }),
        jst("2026-09-20T12:00:00"),
      );
      // 9/27 イベントスタッフが「端末価格」を案内(理解があいまい)、見積もりを約束
      await createVisit(
        storeId,
        eventId,
        input({
          customer: { kind: "existing", id: customerId },
          checks: [{ topicId: mnp.id, checklistItemId: price.id, unclear: true, shownVersion: price.contentVersion }],
          actions: [{ kind: "QUOTE", note: null }],
        }),
        jst("2026-09-27T12:00:00"),
      );
      // 10/1 にキャンペーンの中身が変わった(版を1つ上げる)
      await prisma.checklistItem.update({
        where: { id: camp.id },
        data: { isVolatile: true, contentRevisedOn: ymdToDbDate("2026-10-01"), contentVersion: { increment: 1 } },
      });

      const catalog = await getCatalog();
      const card = await getCustomerCard(storeId, customerId);
      const visits = toHandoffVisits(card!);
      const s = buildHandoffSummary(visits, catalog.checklist);
      expect(s.text).toContain("済んでいるか試験 常勤さんに確認してから進める");
      expect(s.text).toContain("変更あり:キャンペーン");
      expect(s.text).toContain("前回あいまいだった:端末価格");
      const hints = buildTalkHints(visits, catalog.checklist);
      expect(hints.required[0]).toContain("試験 常勤さんの「入荷・在庫の連絡」が未完了のまま");
      expect(hints.required[1]).toContain("変更あり:「キャンペーン」");
      expect(hints.extra[0]).toContain("見積もりを作りながら詳細を案内する");
    } finally {
      await prisma.checklistItem.update({ where: { id: camp.id }, data: before });
    }
  });

  it("改定日は「中身が変わる項目」にしか入らない(CHECK制約)", async () => {
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { isVolatile: false } });
    await expect(
      prisma.checklistItem.update({
        where: { id: item.id },
        data: { contentRevisedOn: ymdToDbDate("2026-10-01") },
      }),
    ).rejects.toThrow();
  });
});

describe("2周目の審査の直し", () => {
  it("画面の担当者と保存するときの担当者が違えば、保存しない", async () => {
    const inp = { ...input({ customer: { kind: "new" as const, nameKana: "タントウ チガイ", phoneLast4: "1212" } }), staffId: eventId };
    await expect(createVisitRaw(storeId, regularId, inp)).rejects.toThrow("担当者が切り替わっています");
    expect(await prisma.visit.count({ where: { requestId: inp.requestId } })).toBe(0);
    expect(await searchCustomers(storeId, { kana: "タントウ", last4: "1212" })).toHaveLength(0);
  });

  it("同じ送信IDで中身が違う再送は、古い記録を返さずに断る", async () => {
    const first = input({ customer: { kind: "new", nameKana: "ナカミ チガイ", phoneLast4: "1313" } });
    await createVisit(storeId, regularId, first);
    // 押し直し(秒数だけ違う)は同じ内容として1件にまとめる
    const again = await createVisit(storeId, regularId, { ...first, inputSeconds: 99 });
    expect(again.duplicated).toBe(true);
    // 温度感を変えて同じ送信IDで送る → 断る
    await expect(createVisit(storeId, regularId, { ...first, temperature: "POSITIVE" })).rejects.toThrow(
      "内容が変わっています。新しい記録として保存し直してください",
    );
    expect(await prisma.visit.count({ where: { requestId: first.requestId } })).toBe(1);
  });

  it("入力秒数が測れなかった記録は null で残り、集計に入らない", async () => {
    const now = new Date();
    const base = (await getTodayBoard(storeId, now)).stats.all.count;
    const { visitId } = await createVisit(
      storeId,
      regularId,
      input({ customer: { kind: "new", nameKana: "ハカレズ", phoneLast4: "1414" }, inputSeconds: null }),
      now,
    );
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visitId } })).inputSeconds).toBeNull();
    expect((await getTodayBoard(storeId, now)).stats.all.count).toBe(base);
  });

  it("説明したときの中身の版が、案内したことと一緒に残る", async () => {
    const camp = await prisma.checklistItem.findFirstOrThrow({ where: { topicId: mnp.id, label: "キャンペーン" } });
    const { visitId } = await createVisit(
      storeId,
      regularId,
      input({
        customer: { kind: "new", nameKana: "バン ノコス", phoneLast4: "1515" },
        checks: [{ topicId: mnp.id, checklistItemId: camp.id, unclear: false, shownVersion: camp.contentVersion }],
      }),
    );
    const check = await prisma.visitCheck.findFirstOrThrow({ where: { visitId } });
    expect(check.explainedVersion).toBe(camp.contentVersion);
  });

  it("同じ名前のスタッフは登録できるが、呼び名は店内で重ならない", async () => {
    await prisma.staff.create({ data: { storeId, name: "同名 太郎", displayName: "同名(早番)", role: "REGULAR" } });
    await expect(
      prisma.staff.create({ data: { storeId, name: "同名 太郎", displayName: "同名(遅番)", role: "EVENT" } }),
    ).resolves.toBeTruthy();
    // 呼び名が同じなら入らない
    await expect(
      prisma.staff.create({ data: { storeId, name: "別人 花子", displayName: "同名(早番)", role: "EVENT" } }),
    ).rejects.toThrow();
  });

  it("同じ名前の2人でも、要約の担当と「◯◯さんに確認」は呼び名で見分けられる", async () => {
    const a = await prisma.staff.create({ data: { storeId, name: "佐藤 光", displayName: "佐藤 光(104)", role: "REGULAR" } });
    const b = await prisma.staff.create({ data: { storeId, name: "佐藤 光", displayName: "佐藤 光(204)", role: "REGULAR" } });
    const { customerId } = await createVisit(
      storeId,
      a.id,
      input({ customer: { kind: "new", nameKana: "ドウメイ カクニン", phoneLast4: "1616" }, actions: [{ kind: "STOCK", note: null }] }),
      jst("2026-09-20T12:00:00"),
    );
    await createVisit(storeId, b.id, input({ customer: { kind: "existing", id: customerId }, actions: [] }), jst("2026-09-27T12:00:00"));
    const catalog = await getCatalog();
    const card = await getCustomerCard(storeId, customerId);
    const text = buildHandoffSummary(toHandoffVisits(card!), catalog.checklist).text;
    expect(text).toContain("佐藤 光(204)(常勤)");
    expect(text).toContain("済んでいるか佐藤 光(104)さんに確認してから進める");
  });
});

describe("説明した版(画面に出ていた版)", () => {
  it("記録画面を開いたあとに中身が改定されたら、保存せず確かめ直してもらう(表示→改定→保存)", async () => {
    const camp = await prisma.checklistItem.findFirstOrThrow({ where: { topicId: mnp.id, label: "キャンペーン" } });
    // 1) 表示:画面に出ていた版を覚えておく
    const shown = camp.contentVersion;
    const inp = input({
      customer: { kind: "new", nameKana: "カイテイ チュウ", phoneLast4: "1717" },
      checks: [{ topicId: mnp.id, checklistItemId: camp.id, unclear: false, shownVersion: shown }],
    });
    try {
      // 2) 改定:店長が中身を変えた
      await prisma.checklistItem.update({ where: { id: camp.id }, data: { contentVersion: { increment: 1 } } });
      // 3) 保存:画面に出ていた版と今の版が違うので断る。お客様も記録も作られない
      await expect(createVisit(storeId, regularId, inp)).rejects.toThrow(
        "「キャンペーン」の中身が変わりました。もう一度確認してから保存してください",
      );
      expect(await prisma.visit.count({ where: { requestId: inp.requestId } })).toBe(0);
      expect(await searchCustomers(storeId, { kana: "カイテイ", last4: "1717" })).toHaveLength(0);

      // 読み直して新しい版で送れば保存でき、説明した版として新しい版が残る
      const again = { ...inp, requestId: randomUUID(), checks: [{ ...inp.checks[0], shownVersion: shown + 1 }] };
      const { visitId } = await createVisit(storeId, regularId, again);
      expect((await prisma.visitCheck.findFirstOrThrow({ where: { visitId } })).explainedVersion).toBe(shown + 1);
    } finally {
      await prisma.checklistItem.update({ where: { id: camp.id }, data: { contentVersion: camp.contentVersion } });
    }
  });
});
