"use client";

// 画面上部の「今のスタッフ」。選んだ瞬間に保存する(保存ボタンを押す手間をなくす)
import { useRef } from "react";
import { setCurrentStaff } from "@/app/actions";
import { EventBadge } from "./ui";

type Props = {
  /** name は呼び名(店内で一意) */
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
      {/* 幅360px未満では見出しを読み上げ用だけにして、名前が切れないようにする */}
      <label htmlFor="staffId" className="shrink-0 text-xs leading-tight text-baton-on-ai-sub max-[359px]:sr-only">
        今の
        <br />
        スタッフ
      </label>
      <select
        id="staffId"
        name="staffId"
        defaultValue={currentId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className={`min-h-11 w-full min-w-0 rounded-[10px] border-0 px-2 text-base font-bold max-[359px]:px-1.5 max-[359px]:text-[15px] ${
          currentId ? "bg-baton-men text-baton-ai" : "bg-baton-shu text-baton-on-shu"
        }`}
        aria-label="今のスタッフ"
      >
        <option value="">選んでください</option>
        {/* 選んだ後に見える文字は名前だけにして、役割は横の印で出す(名前が切れないように) */}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {current?.role === "EVENT" ? <EventBadge onAi /> : null}
    </form>
  );
}
