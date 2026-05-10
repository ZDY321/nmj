import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-(--color-ring) focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#ff8617] text-white",
        secondary:
          "border-transparent bg-[#eef4fb] text-[#25324a]",
        destructive:
          "border-transparent bg-[#fee2e2] text-[#dc2626]",
        outline: "border-[#dbe4ef] text-[#25324a]",
        sage: "border-transparent bg-[#e8f8ef] text-[#16a34a]",
        amber: "border-transparent bg-[#fff3e4] text-[#f97316]",
        sky: "border-transparent bg-[#eaf2ff] text-[#1557c2]",
        plum: "border-transparent bg-[#eef0ff] text-[#5161d6]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
