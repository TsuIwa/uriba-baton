// DBを使う統合テスト。
// 目録(用件・案内項目)は seed で入っている前提。テスト用の店を別に作り、最後に消す。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  completeNextAction,
  createVisit,
  getCatalog,
  getCustomerCard,
  getTodayBoard,
  searchCustomers,
} from "@/lib/queries";
import type { VisitInput } from "@/lib/visit-input";

let storeId: number;
let regularId: number;
let eventId: number;
let mnp: { id: number; items: { id: number }[] };
let hikari: { id: number; items: { id: number }[] };

const jst = (s: string) => new Date(`${s}+09:00`);

function input(over: Partial<VisitInput> = {}): VisitInput {
  return {
    customer: { kind: "new", nameKana: "テスト タロウ", phoneLast4: "9999" },
    topicIds: [mnp.id],
    checks: [{ topicId: mnp.id, checklistItemId: mnp.items[0].id }],
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
  regularId = (await prisma.staff.create({ data: { storeId, name: "試験 常勤", role: "REGULAR" } })).id;
  eventId = (await prisma.staff.create({ data: { storeId, name: "試験 イベント", role: "EVENT" } })).id;
});

afterAll(async () => {
  // お客様を消すと記録・用件・チェック・次にやることは連鎖して消える
  await prisma.customer.deleteMany({ where: { storeId } });
  await prisma.staff.deleteMany({ where: { storeId } });
  await prisma.store.delete({ where: { id: storeId } });
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
          checks: [{ topicId: hikari.id, checklistItemId: hikari.items[0].id }],
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
        data: { visitId, topicId: mnp.id, checklistItemId: hikari.items[0].id },
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

  it("別の店のスタッフでは記録できない", async () => {
    const other = await prisma.staff.findFirst({ where: { storeId: { not: storeId } } });
    if (!other) return; // seed の店がなければ飛ばす
    await expect(createVisit(storeId, other.id, input())).rejects.toThrow("今のスタッフ");
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
