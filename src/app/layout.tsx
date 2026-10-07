import type { Metadata, Viewport } from "next";
import { BIZ_UDPGothic } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import { getActiveStaff, getStore } from "@/lib/queries";
import { getCurrentStaff } from "@/lib/session";
import { NavBar } from "./_components/NavBar";
import { StaffPicker } from "./_components/StaffPicker";
import "./globals.css";

// UD書体(濁点・数字の取り違えが起きにくい)。docs/07 §1「書体」。和文なので部分読み込みはしない
const bizUd = BIZ_UDPGothic({
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-biz-ud",
});

export const metadata: Metadata = {
  title: "売り場バトン",
  description: "携帯売り場の接客を、30秒で次の人へ引き継ぐ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#112640",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 全画面がDBを読むので、build 時に先読み(プリレンダー)させず、毎回リクエスト時に描く
  await connection();
  const store = await getStore();
  const staff = store ? await getActiveStaff(store.id) : [];
  const current = store ? await getCurrentStaff(store.id) : null;

  return (
    <html lang="ja" className={`${bizUd.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-base leading-normal">
        <div className="sticky top-0 z-20">
          {/* 見本データの注記(3画面とも最上部に1回だけ)。docs/07 §2-1 の1 */}
          <p className="bg-baton-sample px-4 py-1 text-center text-xs font-bold leading-tight text-baton-on-sample">
            見本データです(実在のお客様ではありません)
          </p>
          <header className="border-b border-baton-sample bg-baton-ai text-baton-on-ai">
            <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-1.5 max-[359px]:gap-2">
              {/* 店の名前は「今日」の見出しの横に出す(ここに置くと今のスタッフの名前が切れる) */}
              <Link href="/" className="flex min-h-11 shrink-0 items-center text-base font-bold leading-tight">
                売り場バトン
              </Link>
              <div className="min-w-0 flex-1">
                <StaffPicker
                  staff={staff.map((s) => ({ id: s.id, name: s.displayName, role: s.role }))}
                  currentId={current?.id ?? null}
                />
              </div>
            </div>
          </header>
        </div>
        <main className="mx-auto max-w-md pb-28">{children}</main>
        <NavBar />
      </body>
    </html>
  );
}
