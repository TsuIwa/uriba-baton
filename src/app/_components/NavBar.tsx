"use client";

// 画面下の切り替え。親指で届く位置に置く
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "今日" },
  { href: "/record", label: "記録する" },
  { href: "/customers", label: "お客様" },
];

export function NavBar() {
  const pathname = usePathname();
  // 記録画面では保存ボタンを下に固定するので、ナビは出さない
  if (pathname.startsWith("/record")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-line bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const primary = item.href === "/record";
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-14 items-center justify-center text-base font-bold ${
                  primary
                    ? "m-1.5 rounded-xl bg-brand text-white"
                    : active
                      ? "text-brand underline decoration-2 underline-offset-8"
                      : "text-slate-500"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
