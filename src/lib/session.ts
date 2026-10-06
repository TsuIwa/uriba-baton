// 「今のスタッフ」をブラウザの Cookie に覚えておく。
// ログイン認証ではない(この版は店内の共用端末を想定。認証は次の段階)。
import "server-only";

import { cookies } from "next/headers";
import { getStaffInStore } from "./queries";

export const STAFF_COOKIE = "current_staff_id";

export async function getCurrentStaff(storeId: number) {
  const raw = (await cookies()).get(STAFF_COOKIE)?.value;
  const id = Number(raw);
  if (!raw || !Number.isInteger(id)) return null;
  return getStaffInStore(storeId, id);
}
