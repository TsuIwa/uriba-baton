// 見本データ(すべて作り物)。店名・人名は架空。
// 何度流しても同じ形になるよう、乱数は種(シード)を固定している。
// 日付だけは「流した日」を基準に並べるので、今日の一覧にいつでも中身が出る。
//
// 注意:流すたびに全テーブルの中身を消してから入れ直す(ローカル開発用)。

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { NextActionKind, StaffRole, Temperature } from "../src/generated/prisma/enums";
import { TOPIC_CATALOG } from "../src/lib/catalog";
import { addDays, jstDateString, ymdToDbDate } from "../src/lib/dates";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// 種を固定した乱数(mulberry32)
function makeRandom(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRandom(20261006);
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

const STAFF: { name: string; role: StaffRole }[] = [
  { name: "高橋 恵", role: "REGULAR" },
  { name: "中村 誠", role: "REGULAR" },
  { name: "小林 葵", role: "REGULAR" },
  { name: "森田 陽菜", role: "EVENT" },
  { name: "石井 蓮", role: "EVENT" },
];

const CUSTOMER_KANA = [
  "ヤマモト ハルカ", "イノウエ ケンタ", "キムラ ユイ", "ハヤシ ソウタ", "シミズ ミオ",
  "ヤマザキ ダイキ", "モリ アカリ", "イケダ ショウ", "ハシモト リコ", "アベ タクミ",
  "イシカワ ナナ", "ヤマシタ ユウト", "オガワ サクラ", "マエダ カイト", "オカダ メイ",
  "フジタ リク", "ゴトウ ヒナ", "ハセガワ ユウマ", "ムラカミ アオイ", "コンドウ ハルト",
];

const MEMOS = [
  "料金を一番気にしている",
  "ご家族と一緒に来店",
  "今の機種の電池の減りが早いとのこと",
  "写真のデータを必ず残したい",
  "平日の夕方なら来られる",
  "他社の見積もりを持参",
];

const TEMPS: Temperature[] = ["POSITIVE", "CONSIDERING", "COMPARING", "NOT_NOW"];
const ACTIONS: NextActionKind[] = ["QUOTE", "FAMILY", "DOCUMENTS", "STOCK", "CALLBACK"];

async function main() {
  // 子のテーブルから順に空にする
  await prisma.nextAction.deleteMany();
  await prisma.visitCheck.deleteMany();
  await prisma.visitTopic.deleteMany();
  await prisma.visit.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.store.deleteMany();

  const store = await prisma.store.create({ data: { name: "サンプルモバイル 中央店" } });

  const staff = [];
  for (const s of STAFF) {
    staff.push(await prisma.staff.create({ data: { ...s, storeId: store.id } }));
  }
  const regulars = staff.filter((s) => s.role === "REGULAR");
  const events = staff.filter((s) => s.role === "EVENT");

  // 用件と案内項目の目録
  const topics = [];
  for (const [i, t] of TOPIC_CATALOG.entries()) {
    const topic = await prisma.topic.create({
      data: {
        code: t.code,
        label: t.label,
        sortOrder: i + 1,
        checklistItems: {
          create: t.items.map((label, j) => ({ label, sortOrder: j + 1 })),
        },
      },
      include: { checklistItems: { orderBy: { sortOrder: "asc" } } },
    });
    topics.push(topic);
  }
  // 「その他」は見本では使わない。よく来る用件ほど出やすくする
  const topicWeights = ["MODEL_CHANGE", "MODEL_CHANGE", "MNP", "MNP", "MNP", "NEW", "HIKARI", "PLAN_REVIEW", "PLAN_REVIEW", "CANCEL"];
  const topicByCode = new Map(topics.map((t) => [t.code, t]));

  const today = jstDateString(new Date());
  let visitCount = 0;

  for (const [ci, nameKana] of CUSTOMER_KANA.entries()) {
    // 下4桁が同じお客様を2人わざと作る(カナで見分けられるか確かめる用)
    const phoneLast4 = ci === 3 || ci === 15 ? "0817" : String(int(0, 9999)).padStart(4, "0");
    const customer = await prisma.customer.create({
      data: { storeId: store.id, nameKana, phoneLast4 },
    });

    // 1人あたり1〜4回。合計がおよそ50件になる
    const times = ci < 8 ? int(3, 4) : int(1, 3);
    const firstTopic = topicByCode.get(pick(topicWeights))!;
    const visitTopics =
      rand() < 0.25 ? [firstTopic, topicByCode.get(pick(topicWeights))!] : [firstTopic];
    const uniqueTopics = [...new Map(visitTopics.map((t) => [t.id, t])).values()];
    const covered = new Map<number, number>(); // 用件ごとに、何項目目まで案内したか

    // 来店日:古い順に並べる。最後の来店は 0〜12日前
    const lastDaysAgo = ci < 2 ? int(3, 6) : int(0, 12);
    const days = Array.from({ length: times }, (_, k) => lastDaysAgo + (times - 1 - k) * int(3, 8));

    let prevActions: { id: string }[] = [];
    for (const [k, daysAgo] of days.entries()) {
      const ymd = addDays(today, -daysAgo);
      const dow = ymdToDbDate(ymd).getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const person = weekend && rand() < 0.6 ? pick(events) : pick(regulars);
      const isEvent = person.role === "EVENT";
      // 10:00〜18:59(日本時間)
      const visitedAt = new Date(`${ymd}T${String(int(10, 18)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:00+09:00`);
      const isLast = k === times - 1;

      // イベントスタッフは「さっくり」= 1〜2項目、常勤は2〜3項目進める
      const checks: { topicId: number; checklistItemId: number }[] = [];
      for (const t of uniqueTopics) {
        const from = covered.get(t.id) ?? 0;
        const step = isEvent ? int(1, 2) : int(2, 3);
        const to = Math.min(from + step, t.checklistItems.length);
        for (const item of t.checklistItems.slice(from, to)) {
          checks.push({ topicId: t.id, checklistItemId: item.id });
        }
        covered.set(t.id, to);
      }

      const nextVisitDate = isLast
        ? ci < 2
          ? today // 見本として「今日来店予定」を必ず2人つくる
          : rand() < 0.6
            ? addDays(today, int(0, 9))
            : null
        : addDays(ymd, int(2, 7));

      const visit = await prisma.visit.create({
        data: {
          customerId: customer.id,
          staffId: person.id,
          visitedAt,
          temperature: isLast ? pick(TEMPS) : pick(["CONSIDERING", "COMPARING"] as const),
          memo: rand() < 0.3 ? pick(MEMOS) : null,
          inputSeconds: isEvent ? int(18, 48) : int(12, 34),
          nextVisitDate: nextVisitDate ? ymdToDbDate(nextVisitDate) : null,
          createdAt: visitedAt,
        },
      });
      await prisma.visitTopic.createMany({
        data: uniqueTopics.map((t) => ({ visitId: visit.id, topicId: t.id })),
      });
      await prisma.visitCheck.createMany({
        data: checks.map((c) => ({ visitId: visit.id, ...c })),
      });

      // 前回の「次にやること」は、今回の来店で済んだことにする
      if (prevActions.length > 0) {
        await prisma.nextAction.updateMany({
          where: { id: { in: prevActions.map((a) => a.id) } },
          data: { doneAt: visitedAt, doneByStaffId: person.id },
        });
      }
      const actionKinds = [...new Set(Array.from({ length: int(isLast ? 1 : 0, 2) }, () => pick(ACTIONS)))];
      prevActions = await prisma.nextAction.createManyAndReturn({
        data: actionKinds.map((kind) => ({ visitId: visit.id, kind, createdAt: visitedAt })),
        select: { id: true },
      });
      visitCount++;
    }
  }

  console.log(
    `seed 完了: 店1・スタッフ${staff.length}人・用件${topics.length}・お客様${CUSTOMER_KANA.length}人・記録${visitCount}件`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
