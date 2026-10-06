"use client";

// 画面上部の「今のスタッフ」。選んだ瞬間に保存する(保存ボタンを押す手間をなくす)
import { useRef } from "react";
import { setCurrentStaff } from "@/app/actions";

type Props = {
  staff: { id: number; name: string; role: "REGULAR" | "EVENT" }[];
  currentId: number | null;
};

export function StaffPicker({ staff, currentId }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setCurrentStaff} className="flex items-center gap-2" key={currentId ?? "none"}>
      <label htmlFor="staffId" className="shrink-0 text-xs text-white/80">
        今のスタッフ
      </label>
      <select
        id="staffId"
        name="staffId"
        defaultValue={currentId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className={`min-h-11 w-full rounded-lg border-0 px-3 text-base font-bold ${
          currentId ? "bg-white text-brand" : "bg-accent text-white"
        }`}
        aria-label="今のスタッフ"
      >
        <option value="">選んでください</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.role === "EVENT" ? "(イベント)" : ""}
          </option>
        ))}
      </select>
    </form>
  );
}
