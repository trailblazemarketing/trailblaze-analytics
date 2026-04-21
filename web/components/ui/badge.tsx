import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-tb-border text-tb-text",
        blue: "bg-tb-blue/15 text-tb-blue border border-tb-blue/30",
        purple: "bg-tb-purple/25 text-tb-text border border-tb-purple/50",
        success: "bg-tb-success/15 text-tb-success border border-tb-success/30",
        beacon: "bg-tb-beacon/15 text-tb-beacon border border-tb-beacon/30",
        danger: "bg-tb-danger/15 text-tb-danger border border-tb-danger/30",
        muted: "bg-transparent text-tb-muted border border-tb-border",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
