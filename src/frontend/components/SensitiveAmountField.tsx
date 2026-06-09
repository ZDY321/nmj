import type { ReactNode } from "react";

type SensitiveAmountFieldProps = {
  visible: boolean;
  children: ReactNode;
  className?: string;
};

export function SensitiveAmountField({
  visible,
  children,
  className = "h-10"
}: SensitiveAmountFieldProps) {
  if (visible) return <>{children}</>;
  return (
    <div className={`flex items-center rounded-[10px] border border-[#dbe4ef] bg-[#f8fbff] px-3 text-sm font-extrabold text-[#64748b] ${className}`}>
      ***
    </div>
  );
}
