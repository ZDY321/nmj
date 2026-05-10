import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8617] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "orange-gradient text-white hover:brightness-105 shadow-[0_12px_22px_rgba(255,134,23,0.22)] border-0",
        destructive:
          "bg-[#ef4444] text-white hover:bg-[#dc2626] shadow-[0_12px_22px_rgba(239,68,68,0.18)]",
        outline:
          "border border-[#dbe4ef] bg-white text-[#25324a] hover:bg-[#f6f9fd] hover:border-[#b9c7d9]",
        secondary:
          "bg-[#eef4fb] text-[#25324a] hover:bg-[#e2edf8] border-0",
        ghost:
          "hover:bg-[#eef4fb] hover:text-[#061226] border-0 shadow-none",
        link: "text-[#1557c2] underline-offset-4 hover:underline border-0 shadow-none"
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-[10px] px-3 text-xs",
        lg: "h-12 rounded-[14px] px-8 text-base",
        icon: "h-11 w-11"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
