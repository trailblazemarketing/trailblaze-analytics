"use client";
import { usePathname } from "next/navigation";
import { Omnibox } from "@/components/search/omnibox";
import { ChevronRight } from "lucide-react";

// Build a breadcrumb from the URL — dense Linear-ish style.
function useBreadcrumb(): { label: string; href?: string }[] {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Home" }];
  const crumbs: { label: string; href?: string }[] = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc += "/" + parts[i];
    crumbs.push({
      label: decodeURIComponent(parts[i]).replace(/-/g, " "),
      href: i < parts.length - 1 ? acc : undefined,
    });
  }
  return crumbs;
}

export function Topbar() {
  const crumbs = useBreadcrumb();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-tb-border bg-tb-bg/80 px-6 backdrop-blur">
      <nav className="flex items-center gap-1 text-xs text-tb-muted">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
            <span
              className={
                i === crumbs.length - 1
                  ? "font-medium capitalize text-tb-text"
                  : "capitalize"
              }
            >
              {c.label}
            </span>
          </span>
        ))}
      </nav>
      <div className="ml-auto flex-1 max-w-md">
        <Omnibox />
      </div>
    </header>
  );
}
