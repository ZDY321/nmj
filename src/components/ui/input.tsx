import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  const isDateTime = type === "date" || type === "time" || type === "month" || type === "week";
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-[12px] border border-[#dbe4ef] bg-[#fbfdff] px-4 py-2 text-sm font-semibold text-[#061226] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(15,35,66,0.05)] ring-offset-white placeholder:text-[#94a3b8] transition-all duration-200 hover:border-[#b9c7d9] hover:bg-white focus-visible:border-[#ff8617] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8617]/25 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
        isDateTime && "date-time-input",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
