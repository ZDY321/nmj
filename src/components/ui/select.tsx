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
            "flex h-11 w-full appearance-none rounded-[12px] border border-[#dbe4ef] bg-white px-4 pr-10 py-2 text-sm text-[#061226] shadow-[0_4px_14px_rgba(15,35,66,0.04)] ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8617] focus-visible:ring-offset-2 focus-visible:border-[#ff8617] hover:border-[#b9c7d9] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none"
        />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
