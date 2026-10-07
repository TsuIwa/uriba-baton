"use client";

// 画面上部の「今のスタッフ」。選んだ瞬間に保存する(保存ボタンを押す手間をなくす)
import { useRef } from "react";
import { setCurrentStaff } from "@/app/actions";
import { staffOptionLabel } from "@/lib/staff-label";
import { EventBadge } from "./ui";

type Props = {
  staff: { id: number; name: string; role: "REGULAR" | "EVENT" }[];
  currentId: number | null;
};

export function StaffPicker({ staff, currentId }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const current = staff.find((s) => s.id === currentId) ?? null;
  const groups = [
    { label: "常勤", list: staff.filter((s) => s.role === "REGULAR") },
    { label: "イベントスタッフ", list: staff.filter((s) => s.role === "EVENT") },
  ];
  return (
    <form ref={formRef} action={setCurrentStaff} className="flex items-center gap-2" key={currentId ?? "none"}>
      <label htmlFor="staffId" className="shrink-0 text-[11px] leading-tight text-white/80">
        今の
        <br />
        スタッフ
      </label>
      <select
        id="staffId"
        name="staffId"
        defaultValue={currentId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className={`min-h-11 w-full min-w-0 rounded-lg border-0 px-2 text-base font-bold ${
          currentId ? "bg-white text-brand" : "bg-accent text-white"
        }`}
        aria-label="今のスタッフ"
      >
        <option value="">選んでください</option>
        {/* 選んだ後に見える文字は名前だけにして、役割は横の印で出す(名前が切れないように) */}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.list.map((s) => (
              <option key={s.id} value={s.id}>
                {staffOptionLabel(s, staff)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {current?.role === "EVENT" ? <EventBadge /> : null}
    </form>
  );
}
