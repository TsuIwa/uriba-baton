// お客様を探す:名前カナ・電話番号の下4桁(どちらか一方でも、両方でも)
import Link from "next/link";
import { formatJstShort } from "@/lib/dates";
import { parseCustomerQuery } from "@/lib/kana";
import { getStore, searchCustomers } from "@/lib/queries";
import { Pill, Section, StaffName } from "../_components/ui";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function CustomersPage({ searchParams }: Props) {
  const store = await getStore();
  if (!store) return null;
  const raw = (await searchParams).q;
  const text = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 40) ?? "";
  const q = parseCustomerQuery(text);
  const searched = Boolean(q.kana || q.last4);
  const rows = await searchCustomers(store.id, q);

  const newHref = `/record?new=1${q.kana ? `&kana=${encodeURIComponent(q.kana)}` : ""}${
    q.last4 ? `&last4=${q.last4}` : ""
  }`;

  return (
    <div className="space-y-3">
      <form role="search" className="flex gap-2">
        <input
          name="q"
          defaultValue={text}
          placeholder="カナ か 下4桁(例: やまだ 1234)"
          autoComplete="off"
          enterKeyHint="search"
          className="min-h-12 w-full rounded-xl border border-brand-line bg-white px-3 text-base"
          aria-label="お客様を探す"
        />
        <button type="submit" className="min-h-12 shrink-0 rounded-xl bg-brand px-4 font-bold text-white">
          探す
        </button>
      </form>

      <Section title={searched ? `見つかったお客様` : "最近来店したお客様"} note={`${rows.length}人`}>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">見つかりませんでした。</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((c) => {
              const last = c.visits[0];
              return (
                <li key={c.id}>
                  <Link
                    href={`/customers/${c.id}`}
                    className="block rounded-xl border border-brand-line p-3 active:bg-brand-soft"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-bold">{c.nameKana}</span>
                      <span className="text-xs text-slate-500">下4桁 {c.phoneLast4}</span>
                    </div>
                    {last ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-600">
                        <span>前回 {formatJstShort(last.visitedAt)}</span>
                        <StaffName name={last.staff.name} role={last.staff.role} />
                        {last.topics
                          .toSorted((a, b) => a.topic.sortOrder - b.topic.sortOrder)
                          .map((t) => (
                            <Pill key={t.topic.label}>{t.topic.label}</Pill>
                          ))}
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Link
        href={newHref}
        className="flex min-h-14 items-center justify-center rounded-xl border-2 border-dashed border-brand text-base font-bold text-brand"
      >
        ＋ 新規のお客様として記録する
      </Link>
    </div>
  );
}
