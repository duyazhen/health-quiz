"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

type SitePage = "funnel" | "result" | "subscribe";

export function SiteShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: SitePage;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            睿迄健康
            <span className="ml-2 font-normal text-muted-foreground">Funnel</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/" active={active === "funnel"}>
              测评
            </NavLink>
            <NavLink href="/result" active={active === "result"}>
              结果
            </NavLink>
            <NavLink href="/subscribe" active={active === "subscribe"}>
              订阅
            </NavLink>
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:py-12">{children}</div>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-muted-foreground">
          <p>基于 Mifflin-St Jeor 公式计算 · 模拟订阅不会真实扣款</p>
          <p>会话 7 天有效，进度会自动保存</p>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
