"use server";

// 画面から呼ぶサーバー側の処理。
// 画面から届く値は信用せず、ここで必ず確かめてからDBに渡す。

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { jstDateString } from "@/lib/dates";
import { parseCustomerQuery } from "@/lib/kana";
import {
  DomainError,
  completeNextAction,
  createVisit,
  getCatalog,
  getStaffInStore,
  getStore,
  searchCustomers,
} from "@/lib/queries";
import { STAFF_COOKIE, getCurrentStaff } from "@/lib/session";
import { parseVisitInput } from "@/lib/visit-input";

async function requireStore() {
  const store = await getStore();
  if (!store) throw new Error("店のデータがありません。npm run db:seed を流してください");
  return store;
}

/** 画面上部の「今のスタッフ」を切り替える */
export async function setCurrentStaff(formData: FormData) {
  const store = await requireStore();
  const id = Number(formData.get("staffId"));
  const jar = await cookies();
  const staff = Number.isInteger(id) ? await getStaffInStore(store.id, id) : null;
  if (staff) {
    jar.set(STAFF_COOKIE, String(staff.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 14, // 1日の勤務ぶん。翌日は選び直す
    });
  } else {
    jar.delete(STAFF_COOKIE);
  }
  revalidatePath("/", "layout");
}

export type CustomerOption = {
  id: string;
  nameKana: string;
  phoneLast4: string;
  lastVisit: string | null;
};

/** 記録画面のお客様検索(入力のたびに呼ぶ) */
export async function findCustomers(query: string): Promise<CustomerOption[]> {
  const store = await requireStore();
  const q = parseCustomerQuery(query.slice(0, 40));
  if (!q.kana && !q.last4) return [];
  const rows = await searchCustomers(store.id, q, 8);
  return rows.map((c) => ({
    id: c.id,
    nameKana: c.nameKana,
    phoneLast4: c.phoneLast4,
    lastVisit: c.visits[0] ? jstDateString(c.visits[0].visitedAt) : null,
  }));
}

export type SaveVisitResult = {
  ok: false;
  errors: string[];
  /** STAFF_MISMATCH=担当者が切り替わった/REQUEST_CONFLICT=同じ送信IDで中身が違う */
  code?: "STAFF_MISMATCH" | "REQUEST_CONFLICT";
};

/** 記録を保存する。うまくいけばお客様カードへ移る */
export async function saveVisit(raw: unknown): Promise<SaveVisitResult> {
  const store = await requireStore();
  const staff = await getCurrentStaff(store.id);
  if (!staff) return { ok: false, errors: ["画面上部で「今のスタッフ」を選んでください"] };

  const catalog = await getCatalog();
  const parsed = parseVisitInput(raw, {
    topicIds: catalog.topicIds,
    itemTopic: catalog.itemTopic,
    today: jstDateString(new Date()),
  });
  if (!parsed.ok) return parsed;

  // 自動テストの画面操作で入った記録は E2E として残す(実測の集計に混ぜない)。
  // サーバーの環境変数で決めるので、画面から送られた値では変えられない
  const source = process.env.VISIT_SOURCE === "E2E" ? "E2E" : "MANUAL";

  let customerId: string;
  try {
    // 同じ送信IDの再送なら、新しく作らず保存済みの1件が返る
    ({ customerId } = await createVisit(store.id, staff.id, parsed.value, new Date(), source));
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, errors: [e.message], code: e.code === "OTHER" ? undefined : e.code };
    }
    console.error(e);
    return { ok: false, errors: ["保存できませんでした。もう一度押してください"] };
  }
  revalidatePath("/");
  redirect(`/customers/${customerId}?saved=${parsed.value.inputSeconds ?? "na"}`);
}

/** 次にやることを「済み」にする */
export async function markActionDone(formData: FormData) {
  const store = await requireStore();
  const staff = await getCurrentStaff(store.id);
  const actionId = String(formData.get("actionId") ?? "");
  if (!staff || !/^[0-9a-f-]{36}$/i.test(actionId)) return;
  // 同時に押されても先の1人だけが残る(false なら誰かが先に済みにしている)
  try {
    await completeNextAction(store.id, actionId, staff.id);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    return;
  }
  revalidatePath("/");
  const back = String(formData.get("back") ?? "");
  if (back.startsWith("/customers/")) revalidatePath(back);
}
