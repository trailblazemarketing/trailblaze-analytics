import { cn } from "@/lib/utils";

// Inline Trailblaze mark — a blazing trail-arrow. Replace with SVG export
// from design when final asset is ready.
export function TrailblazeLogo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="tb-grad" x1="0" y1="0" x2="32" y2="32">
            <stop offset="0%" stopColor="var(--tb-blue)" />
            <stop offset="100%" stopColor="var(--tb-purple)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="6" fill="url(#tb-grad)" />
        <path
          d="M7 22 L15 10 L18 15 L25 10"
          stroke="white"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="25" cy="10" r="1.8" fill="var(--tb-beacon)" />
      </svg>
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-tb-text">
            Trailblaze
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-tb-muted">
            Analytics
          </span>
        </div>
      )}
    </div>
  );
}
