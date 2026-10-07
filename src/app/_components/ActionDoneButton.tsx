// 「次にやること」を済みにするボタン(JavaScript が無くても動く普通のフォーム)
import { markActionDone } from "@/app/actions";

export function ActionDoneButton({ actionId, back }: { actionId: string; back?: string }) {
  return (
    <form action={markActionDone}>
      <input type="hidden" name="actionId" value={actionId} />
      {back ? <input type="hidden" name="back" value={back} /> : null}
      <button
        type="submit"
        className="min-h-11 min-w-14 rounded-[10px] border-2 border-baton-ai bg-baton-men px-3 text-base font-bold text-baton-ai active:bg-baton-ji"
      >
        済み
      </button>
    </form>
  );
}
