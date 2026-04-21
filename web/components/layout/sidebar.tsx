"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Globe2,
  Building2,
  BarChart3,
  FileText,
  Info,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { TrailblazeLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: (pathname: string) => boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: Home, match: (p) => p === "/" },
  { href: "/markets", label: "Markets", icon: Globe2, match: (p) => p.startsWith("/markets") },
  { href: "/companies", label: "Companies", icon: Building2, match: (p) => p.startsWith("/companies") },
  { href: "/operators", label: "Operators", icon: BarChart3, match: (p) => p.startsWith("/operators") },
  { href: "/reports", label: "Reports", icon: FileText, match: (p) => p.startsWith("/reports") },
  { href: "/methodology", label: "Beacon™ Methodology", icon: Info, match: (p) => p.startsWith("/methodology") },
];

export function Sidebar({
  userEmail,
  onSignOut,
}: {
  userEmail: string | null;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  // Persist collapsed state
  React.useEffect(() => {
    const v = localStorage.getItem("tb-sidebar-collapsed");
    if (v === "1") setCollapsed(true);
  }, []);
  React.useEffect(() => {
    localStorage.setItem("tb-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "relative flex h-screen shrink-0 flex-col border-r border-tb-border bg-tb-surface transition-[width] duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Brand */}
      <div className={cn("flex h-14 items-center border-b border-tb-border px-3", collapsed && "justify-center")}>
        {collapsed ? (
          <TrailblazeLogo showWordmark={false} />
        ) : (
          <TrailblazeLogo />
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = item.match ? item.match(pathname) : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-tb-blue/15 text-tb-blue"
                      : "text-tb-muted hover:bg-tb-border/50 hover:text-tb-text",
                    collapsed && "justify-center",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && active && (
                    <span className="ml-auto h-1 w-1 rounded-full bg-tb-blue" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t border-tb-border p-2">
        {!collapsed && userEmail && (
          <div className="mb-1 truncate px-2 py-1 text-[10px] text-tb-muted">
            {userEmail}
          </div>
        )}
        <button
          onClick={onSignOut}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-tb-muted transition-colors hover:bg-tb-border/50 hover:text-tb-text",
            collapsed && "justify-center",
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="h-3.5 w-3.5" />
          {!collapsed && "Sign out"}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-tb-border bg-tb-surface text-tb-muted shadow-sm hover:border-tb-blue hover:text-tb-blue"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  );
}
