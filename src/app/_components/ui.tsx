// 画面で何度も使う小さな部品
import type { ReactNode } from "react";

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-line/60">
      <h2 className="mb-3 flex items-baseline justify-between text-base font-bold text-brand">
        {title}
        {note ? <span className="text-xs font-normal text-slate-500">{note}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** イベントスタッフの印(誰が案内したかを一目で) */
export function EventBadge() {
  return (
    <span className="ml-1 inline-block rounded bg-accent px-1.5 py-0.5 align-middle text-[11px] font-bold leading-none text-white">
      イベント
    </span>
  );
}

export function StaffName({ name, role }: { name: string; role: string }) {
  return (
    <span className="font-bold">
      {name}
      {role === "EVENT" ? <EventBadge /> : null}
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand">
      {children}
    </span>
  );
}
