// 送った内容の「指紋」。同じ送信IDで再送が来たとき、中身が同じかどうかを見分ける。
// 入力秒数は押すたびに変わるので含めない(押し直しは同じ内容として扱う)。
import { createHash } from "node:crypto";
import type { VisitInput } from "./visit-input";

export function visitFingerprint(input: VisitInput): string {
  const byNumber = (a: number, b: number) => a - b;
  const normalized = {
    staffId: input.staffId,
    customer: input.customer,
    topicIds: [...input.topicIds].sort(byNumber),
    checks: [...input.checks]
      .sort((a, b) => a.checklistItemId - b.checklistItemId)
      .map((c) => [c.topicId, c.checklistItemId, c.unclear, c.shownVersion]),
    temperature: input.temperature,
    actions: [...input.actions]
      .sort((a, b) => a.kind.localeCompare(b.kind))
      .map((a) => [a.kind, a.note]),
    nextVisitDate: input.nextVisitDate,
    memo: input.memo,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
