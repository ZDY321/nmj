import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            "flex h-11 w-full appearance-none rounded-[12px] border border-[#dbe4ef] bg-[#fbfdff] px-4 py-2 pr-10 text-sm font-semibold text-[#061226] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(15,35,66,0.05)] ring-offset-white transition-all duration-200 hover:border-[#b9c7d9] hover:bg-white focus-visible:border-[#ff8617] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8617]/25 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#64748b]"
        />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
