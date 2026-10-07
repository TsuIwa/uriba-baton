"use client";

// 画面下の切り替え。親指で届く位置に置く。浮かせず、線1本で区切る(影は使わない)
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
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-baton-line bg-baton-men pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const primary = item.href === "/record";
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`m-1.5 flex min-h-12 items-center justify-center text-base font-bold ${
                  primary
                    ? "rounded-[10px] bg-baton-ai text-baton-on-ai active:bg-baton-ai-press"
                    : active
                      ? "text-baton-ai underline decoration-2 underline-offset-8"
                      : "text-baton-sub"
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
