// 「次にやること」を済みにするボタン(JavaScript が無くても動く普通のフォーム)
import { markActionDone } from "@/app/actions";

export function ActionDoneButton({ actionId, back }: { actionId: string; back?: string }) {
  return (
    <form action={markActionDone}>
      <input type="hidden" name="actionId" value={actionId} />
      {back ? <input type="hidden" name="back" value={back} /> : null}
      <button
        type="submit"
        className="min-h-11 rounded-lg border border-brand px-3 text-sm font-bold text-brand active:bg-brand-soft"
      >
        済み
      </button>
    </form>
  );
}
