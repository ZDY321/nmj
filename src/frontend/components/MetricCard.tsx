import { motion } from "framer-motion";
import { Banknote, BookOpen, Clock3, Tag, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const variantStyles = {
  1: {
    icon: Banknote,
    iconWrap: "bg-[#fff1e2]",
    iconBadge: "orange-gradient",
    trend: "text-[#16a34a]",
    sparkline: "sparkline-orange"
  },
  2: {
    icon: Clock3,
    iconWrap: "bg-[#eaf2ff]",
    iconBadge: "bg-[#1557c2]",
    trend: "text-[#16a34a]",
    sparkline: "sparkline-blue"
  },
  3: {
    icon: Tag,
    iconWrap: "bg-[#fff1e2]",
    iconBadge: "orange-gradient",
    trend: "text-[#16a34a]",
    sparkline: "sparkline-orange"
  },
  4: {
    icon: BookOpen,
    iconWrap: "bg-[#eaf2ff]",
    iconBadge: "bg-[#1557c2]",
    trend: "text-[#1557c2]",
    sparkline: "sparkline-blue"
  }
} as const;

export function MetricCard({
  label,
  value,
  hint,
  variant = 1,
  index = 0,
  showSparkline = true
}: {
  label: string;
  value: string;
  hint: string;
  variant?: 1 | 2 | 3 | 4;
  index?: number;
  showSparkline?: boolean;
}) {
  const style = variantStyles[variant] || variantStyles[1];
  const Icon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      whileHover={{ y: -3 }}
    >
      <Card className="min-h-[150px] overflow-hidden rounded-[18px] border-[#dce5f0] bg-white shadow-[0_14px_34px_rgba(15,35,66,0.08)]">
        <CardContent className="relative flex h-full items-center gap-5 p-5">
          <div className={cn("flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full", style.iconWrap)}>
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_12px_24px_rgba(15,35,66,0.16)]", style.iconBadge)}>
              <Icon size={22} strokeWidth={2.4} />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#475569]">{label}</span>
            <strong className="mt-2 block truncate text-[30px] font-extrabold leading-none text-[#050b18]">
              {value}
            </strong>
            <span className="mt-3 flex min-w-0 items-center gap-1 text-sm text-[#64748b]">
              <TrendingUp size={15} className={style.trend} />
              <span className="truncate">{hint}</span>
            </span>
          </div>

          {showSparkline && (
            <div className={cn("absolute bottom-7 right-5 h-12 w-28 opacity-95", style.sparkline)} />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
