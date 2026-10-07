// 画面で何度も使う小さな部品。色と形の決まりは docs/07_UI方針.md・docs/08_配色.md
import type { ReactNode } from "react";
import type { ItemState } from "@/lib/handoff";

/**
 * 区画:全幅の白い面+上下1pxの線(角丸の白カードを浮かせない。07 §1「角丸・面・影」)
 * title は13pxの区切り見出し、note はその右の補足
 */
export function Section({
  title,
  note,
  children,
  label,
}: {
  title?: string;
  note?: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section aria-label={label ?? title} className="border-y border-baton-line bg-baton-men px-4 py-3">
      {title ? (
        <h2 className="mb-1 flex items-baseline justify-between gap-3 text-[13px] font-bold leading-snug tracking-[0.08em] text-baton-sub">
          {title}
          {note ? <span className="text-[13px] font-normal tracking-normal tabular-nums">{note}</span> : null}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

/** イベントスタッフの印。色は作らず、線だけの四角+「イベント」の文字(08 §3-3) */
export function EventBadge({ onAi = false }: { onAi?: boolean }) {
  return (
    <span
      className={`ml-1.5 inline-block shrink-0 rounded border-[1.5px] px-1 py-px align-[2px] text-xs font-bold leading-tight ${
        onAi ? "border-baton-on-ai text-baton-on-ai" : "border-baton-ai text-baton-ai"
      }`}
    >
      イベント
    </span>
  );
}

export function StaffName({ name, role, onAi = false }: { name: string; role: string; onAi?: boolean }) {
  return (
    <span className="font-bold">
      {name}
      {role === "EVENT" ? <EventBadge onAi={onAi} /> : null}
    </span>
  );
}

/** 用件などの小さなタグ(角丸4。丸ピルは使わない) */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded border border-baton-line-strong px-1.5 py-px text-xs font-bold leading-tight text-baton-sub">
      {children}
    </span>
  );
}

/**
 * 4状態の印(既定28px)。色だけで伝えず、形と記号を変える(07 §2-1)
 * 変更あり=朱の丸に「!」/あいまい=黄のひし形に「?」/まだ=白抜きの丸/説明済み=淡い藍の丸に「✓」
 */
export function StateMark({ state, size = 28 }: { state: ItemState; size?: number }) {
  const box = { width: size, height: size };
  if (state === "UNCLEAR") {
    return (
      <span aria-hidden className="relative inline-flex shrink-0 items-center justify-center" style={box}>
        <span
          className="absolute rotate-45 rounded-[3px] border-[1.5px] border-baton-ki-line bg-baton-ki"
          style={{ width: size * 0.72, height: size * 0.72 }}
        />
        <span className="relative text-sm font-bold text-baton-ki-text">?</span>
      </span>
    );
  }
  const look: Record<Exclude<ItemState, "UNCLEAR">, string> = {
    CHANGED: "bg-baton-shu text-baton-on-shu",
    NOT_YET: "border-[2.5px] border-baton-mada bg-baton-men",
    EXPLAINED: "bg-baton-done-soft text-baton-done",
  };
  const sign = state === "CHANGED" ? "!" : state === "EXPLAINED" ? "✓" : "";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${look[state]}`}
      style={box}
    >
      {sign}
    </span>
  );
}

/** 状態の右のラベル(記号+短い言葉) */
export function StateLabel({ state }: { state: ItemState }) {
  switch (state) {
    case "CHANGED":
      return <span className="shrink-0 text-[13px] font-bold text-baton-shu">! 変更あり・必ず案内</span>;
    case "UNCLEAR":
      return (
        <span className="shrink-0 rounded bg-baton-ki-soft px-1.5 py-0.5 text-[13px] font-bold text-baton-ki-text">
          ? 前回あいまい
        </span>
      );
    case "NOT_YET":
      return <span className="shrink-0 text-[13px] text-baton-mada">○ まだ</span>;
    case "EXPLAINED":
      return <span className="shrink-0 text-[13px] text-baton-done">理解度を伺う</span>;
  }
}

/** 畳む・開くの印(開くと上向き) */
export function Caret() {
  return (
    <span aria-hidden className="when-open-rotate ml-1 inline-block text-xs transition-transform duration-200">
      ▼
    </span>
  );
}
