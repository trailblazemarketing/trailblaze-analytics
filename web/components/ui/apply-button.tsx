"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Filter-form Apply button with a pending spinner. Used on /markets
// and /companies where the form action is a server route (not a server
// action), so we can't useFormStatus — fall back to a local pending
// flag set on click. The flag clears naturally on page navigation.
//
// Spec from QA: loading spinner while query runs + disabled state +
// brief visual feedback. Spinner satisfies the first two; disabling
// the button prevents double-submits.
export function ApplyButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={() => setPending(true)}
      className={cn(
        "inline-flex h-8 min-w-[64px] items-center justify-center gap-1.5 rounded-md bg-tb-blue px-3 text-xs font-medium text-white transition-opacity hover:brightness-110",
        pending && "cursor-progress opacity-70",
        className,
      )}
    >
      {pending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
