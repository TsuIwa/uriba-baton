// DBの読み書き。画面(page.tsx)とサーバーアクションからだけ呼ぶ。
// 「今」を引数で受け取れるようにして、年またぎなどをテストで再現できるようにしている。
import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import type { NextActionKindCode, StaffRoleCode, TemperatureCode } from "./catalog";
import { addDays, dbDateToYmd, jstDateString, jstWeekRange, ymdToDbDate } from "./dates";
import type { ChecklistCatalog, HandoffVisit } from "./handoff";
import type { CustomerQuery } from "./kana";
import { summarizeInputSeconds } from "./stats";
import type { VisitInput } from "./visit-input";

/** この版は店が1つだけ(複数店は「次の段階」) */
export async function getStore() {
  return prisma.store.findFirst({ orderBy: { id: "asc" } });
}

export async function getActiveStaff(storeId: number) {
  return prisma.staff.findMany({
    where: { storeId, isActive: true },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });
}

export async function getStaffInStore(storeId: number, staffId: number) {
  return prisma.staff.findFirst({ where: { id: staffId, storeId, isActive: true } });
}

/** 用件と案内項目の目録 */
export async function getCatalog() {
  const topics = await prisma.topic.findMany({
    orderBy: { sortOrder: "asc" },
    include: { checklistItems: { orderBy: { sortOrder: "asc" } } },
  });
  const checklist: ChecklistCatalog = Object.fromEntries(
    topics.map((t) => [t.code, t.checklistItems.map((i) => ({ id: i.id, label: i.label }))]),
  );
  return {
    topics: topics.map((t) => ({
      id: t.id,
      code: t.code,
      label: t.label,
      items: t.checklistItems.map((i) => ({ id: i.id, label: i.label })),
    })),
    checklist,
    topicIds: new Set(topics.map((t) => t.id)),
    itemTopic: new Map(topics.flatMap((t) => t.checklistItems.map((i) => [i.id, t.id] as const))),
  };
}

const latestVisitSelect = {
  orderBy: { visitedAt: "desc" },
  take: 1,
  select: {
    visitedAt: true,
    temperature: true,
    staff: { select: { name: true, role: true } },
    topics: { select: { topic: { select: { label: true, sortOrder: true } } } },
  },
} satisfies Prisma.Customer$visitsArgs;

/**
 * お客様を探す。下4桁は完全一致、カナは前方一致。
 * 両方空なら、最近来店したお客様を出す。
 */
export async function searchCustomers(storeId: number, q: CustomerQuery, limit = 20) {
  if (!q.kana && !q.last4) {
    const recent = await prisma.visit.findMany({
      where: { customer: { storeId } },
      orderBy: { visitedAt: "desc" },
      distinct: ["customerId"],
      take: limit,
      select: { customer: { include: { visits: latestVisitSelect } } },
    });
    return recent.map((v) => v.customer);
  }
  return prisma.customer.findMany({
    where: {
      storeId,
      ...(q.last4 ? { phoneLast4: q.last4 } : {}),
      ...(q.kana ? { nameKana: { startsWith: q.kana } } : {}),
    },
    orderBy: [{ nameKana: "asc" }],
    take: limit,
    include: { visits: latestVisitSelect },
  });
}

export type CustomerSearchResult = Awaited<ReturnType<typeof searchCustomers>>[number];

/** お客様カード:お客様と、記録の時系列(新しい順) */
export async function getCustomerCard(storeId: number, customerId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, storeId },
    include: {
      visits: {
        orderBy: { visitedAt: "desc" },
        include: {
          staff: true,
          topics: {
            orderBy: { topic: { sortOrder: "asc" } },
            include: {
              topic: true,
              checks: {
                orderBy: { checklistItem: { sortOrder: "asc" } },
                include: { checklistItem: true },
              },
            },
          },
          nextActions: { orderBy: { createdAt: "asc" }, include: { doneBy: true } },
        },
      },
    },
  });
}

export type CustomerCard = NonNullable<Awaited<ReturnType<typeof getCustomerCard>>>;

/** DBの形 → 要約ロジックが使う形 */
export function toHandoffVisits(card: CustomerCard): HandoffVisit[] {
  return card.visits.map((v) => ({
    visitedAt: v.visitedAt,
    staff: { name: v.staff.name, role: v.staff.role as StaffRoleCode },
    temperature: v.temperature as TemperatureCode,
    topics: v.topics.map((t) => ({ code: t.topic.code, label: t.topic.label })),
    checkedItemIds: v.topics.flatMap((t) => t.checks.map((c) => c.checklistItemId)),
    openActions: v.nextActions
      .filter((a) => a.doneAt === null)
      .map((a) => ({ kind: a.kind as NextActionKindCode, note: a.note })),
  }));
}

/**
 * 今日の一覧。
 * - 来店予定:今日〜今週日曜までに次回来店予定日があるお客様(最新の記録の予定だけを見る)
 * - 終わっていない「次にやること」
 * - 入力秒数の集計(直近30日)
 */
export async function getTodayBoard(storeId: number, now: Date) {
  const today = jstDateString(now);
  const week = jstWeekRange(now);

  const planned = await prisma.visit.findMany({
    where: {
      customer: { storeId },
      nextVisitDate: { gte: ymdToDbDate(today), lte: ymdToDbDate(week.end) },
    },
    orderBy: [{ nextVisitDate: "asc" }, { visitedAt: "asc" }],
    include: {
      staff: true,
      topics: { include: { topic: true }, orderBy: { topic: { sortOrder: "asc" } } },
      customer: { include: { visits: { orderBy: { visitedAt: "desc" }, take: 1, select: { id: true } } } },
    },
  });
  // その後にまた来店して記録が増えていたら、古い予定は出さない
  const scheduled = planned
    .filter((v) => v.customer.visits[0]?.id === v.id)
    .map((v) => ({ ...v, nextVisitYmd: dbDateToYmd(v.nextVisitDate!) }));

  const openActions = await prisma.nextAction.findMany({
    where: { doneAt: null, visit: { customer: { storeId } } },
    orderBy: { createdAt: "asc" },
    include: { visit: { include: { customer: true, staff: true } } },
  });

  const since = ymdToDbDate(addDays(today, -30));
  const recent = await prisma.visit.findMany({
    where: { customer: { storeId }, visitedAt: { gte: since } },
    select: { inputSeconds: true, staff: { select: { role: true } } },
  });

  return {
    today,
    week,
    scheduledToday: scheduled.filter((v) => v.nextVisitYmd === today),
    scheduledThisWeek: scheduled.filter((v) => v.nextVisitYmd > today),
    openActions,
    stats: {
      all: summarizeInputSeconds(recent.map((r) => r.inputSeconds)),
      regular: summarizeInputSeconds(
        recent.filter((r) => r.staff.role === "REGULAR").map((r) => r.inputSeconds),
      ),
      event: summarizeInputSeconds(
        recent.filter((r) => r.staff.role === "EVENT").map((r) => r.inputSeconds),
      ),
    },
  };
}

export class DomainError extends Error {}

/**
 * 記録を1件保存する。お客様(新規なら)・記録・用件・案内したこと・次にやることを
 * 1つのトランザクションでまとめて入れる(途中で失敗したら全部なかったことになる)。
 */
export async function createVisit(
  storeId: number,
  staffId: number,
  input: VisitInput,
  now: Date = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const staff = await tx.staff.findFirst({ where: { id: staffId, storeId, isActive: true } });
    if (!staff) throw new DomainError("今のスタッフが選ばれていません");

    let customerId: string;
    if (input.customer.kind === "existing") {
      const found = await tx.customer.findFirst({
        where: { id: input.customer.id, storeId },
        select: { id: true },
      });
      if (!found) throw new DomainError("お客様が見つかりません");
      customerId = found.id;
    } else {
      const created = await tx.customer.create({
        data: {
          storeId,
          nameKana: input.customer.nameKana,
          phoneLast4: input.customer.phoneLast4,
        },
      });
      customerId = created.id;
    }

    const visit = await tx.visit.create({
      data: {
        customerId,
        staffId,
        visitedAt: now,
        temperature: input.temperature,
        memo: input.memo,
        inputSeconds: input.inputSeconds,
        nextVisitDate: input.nextVisitDate ? ymdToDbDate(input.nextVisitDate) : null,
      },
    });
    await tx.visitTopic.createMany({
      data: input.topicIds.map((topicId) => ({ visitId: visit.id, topicId })),
    });
    if (input.checks.length > 0) {
      await tx.visitCheck.createMany({
        data: input.checks.map((c) => ({ visitId: visit.id, ...c })),
      });
    }
    if (input.actions.length > 0) {
      await tx.nextAction.createMany({
        data: input.actions.map((a) => ({ visitId: visit.id, kind: a.kind, note: a.note })),
      });
    }
    return { visitId: visit.id, customerId };
  });
}

/**
 * 次にやることを「済み」にする。
 * 2人が同時に押しても、先に押した1人だけが記録される
 * (done_at が空のときだけ書き換える条件つき更新)。
 * @returns 自分が済みにできたら true、もう誰かが済みにしていたら false
 */
export async function completeNextAction(
  storeId: number,
  actionId: string,
  staffId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await prisma.nextAction.updateMany({
    where: { id: actionId, doneAt: null, visit: { customer: { storeId } } },
    data: { doneAt: now, doneByStaffId: staffId },
  });
  return result.count === 1;
}
