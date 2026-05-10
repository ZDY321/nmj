import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[90px] w-full rounded-[12px] border border-[#dbe4ef] bg-white px-4 py-3 text-sm text-[#061226] shadow-[0_4px_14px_rgba(15,35,66,0.04)] ring-offset-white placeholder:text-[#94a3b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8617] focus-visible:ring-offset-2 focus-visible:border-[#ff8617] hover:border-[#b9c7d9] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 resize-y leading-relaxed",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
