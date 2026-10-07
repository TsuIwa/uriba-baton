import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getActiveStaff, getStore } from "@/lib/queries";
import { getCurrentStaff } from "@/lib/session";
import { NavBar } from "./_components/NavBar";
import { StaffPicker } from "./_components/StaffPicker";
import "./globals.css";

export const metadata: Metadata = {
  title: "売り場バトン",
  description: "携帯売り場の接客を、30秒で次の人へ引き継ぐ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f3b5c",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 全画面がDBを読むので、build 時に先読み(プリレンダー)させず、毎回リクエスト時に描く
  await connection();
  const store = await getStore();
  const staff = store ? await getActiveStaff(store.id) : [];
  const current = store ? await getCurrentStaff(store.id) : null;

  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">
        <header className="sticky top-0 z-20 bg-brand text-white shadow">
          <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-2">
            <Link href="/" className="shrink-0 leading-tight">
              <span className="block text-base font-bold">売り場バトン</span>
              <span className="block text-[11px] text-white/70">{store?.name ?? "店のデータなし"}</span>
            </Link>
            <div className="flex-1">
              <StaffPicker
                staff={staff.map((s) => ({ id: s.id, name: s.displayName, role: s.role }))}
                currentId={current?.id ?? null}
              />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-md px-3 pb-28 pt-3">{children}</main>
        <NavBar />
      </body>
    </html>
  );
}
