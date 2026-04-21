"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { TrailblazeLogo } from "@/components/brand/logo";
import { Omnibox } from "@/components/search/omnibox";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Overview", match: (p: string) => p === "/" },
  {
    href: "/markets",
    label: "Markets",
    match: (p: string) => p.startsWith("/markets"),
  },
  {
    href: "/companies",
    label: "Companies",
    match: (p: string) => p.startsWith("/companies"),
  },
  {
    href: "/operators",
    label: "Operators",
    match: (p: string) => p.startsWith("/operators"),
  },
  {
    href: "/reports",
    label: "Reports",
    match: (p: string) => p.startsWith("/reports"),
  },
  {
    href: "/methodology",
    label: "Methodology",
    match: (p: string) => p.startsWith("/methodology"),
  },
];

export function AppHeader({
  email,
  onSignOut,
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-tb-border bg-tb-bg/90 px-4 backdrop-blur">
      <Link href="/" className="shrink-0">
        <TrailblazeLogo />
      </Link>
      <nav className="ml-2 flex items-center gap-0.5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative px-3 py-2 text-[11px] font-medium transition-colors",
                active ? "text-tb-text" : "text-tb-muted hover:text-tb-text",
              )}
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 bg-tb-blue" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto w-full max-w-md">
        <Omnibox />
      </div>
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-tb-border bg-tb-surface text-tb-muted hover:border-tb-blue hover:text-tb-text"
          aria-label="Account menu"
        >
          <User className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 w-56 overflow-hidden rounded-md border border-tb-border bg-tb-surface text-xs shadow-lg animate-fade-in">
            <div className="border-b border-tb-border px-3 py-2 text-[10px]">
              <div className="uppercase tracking-wider text-tb-muted">
                Signed in as
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-tb-text">
                {email ?? "guest"}
              </div>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-tb-muted hover:bg-tb-border/40 hover:text-tb-text"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
