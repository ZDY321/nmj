import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, GraduationCap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navItems, type ViewKey } from "@/frontend/lib/helpers";
import type { UserRole } from "@/shared/types";

export function Sidebar({
  view,
  collapsed,
  role,
  onViewChange,
  onToggle
}: {
  view: ViewKey;
  collapsed: boolean;
  role: UserRole;
  onViewChange: (view: ViewKey) => void;
  onToggle: () => void;
}) {
  const items = role === "admin" ? [...navItems, { key: "admin" as ViewKey, icon: ShieldCheck, label: "管理后台" }] : navItems;

  return (
    <aside
      className="navy-gradient sticky top-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-white/10 text-white shadow-[18px_0_50px_rgba(3,31,61,0.2)] transition-[width] duration-300 md:flex"
      style={{ width: collapsed ? 92 : 286 }}
    >
      <div className="flex h-full flex-col p-5">
        <div className="mb-12 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-[16px] text-left transition-colors hover:bg-white/8",
              collapsed ? "w-full justify-center p-2" : "p-2 pr-3"
            )}
            aria-label="折叠侧边栏"
          >
            <div className="orange-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] shadow-[0_14px_28px_rgba(255,134,23,0.28)]">
              <GraduationCap size={28} strokeWidth={2.4} />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-[25px] font-extrabold leading-tight">
                  <span>Teach</span>
                  <span className="text-[#ff911f]">Pro</span>
                </div>
                <div className="truncate text-sm font-medium text-white/68">课薪记录管理</div>
              </div>
            )}
          </button>

          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-9 w-9 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="折叠侧边栏"
            >
              <ChevronLeft size={18} />
            </Button>
          )}
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto pr-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.key;
            return (
              <motion.button
                key={item.key}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => onViewChange(item.key)}
                className={cn(
                  "group relative flex h-[64px] w-full items-center rounded-[14px] text-left text-[16px] font-semibold transition-all duration-200",
                  collapsed ? "justify-center px-0" : "gap-5 px-5",
                  isActive
                    ? "bg-[#0d4b86]/65 text-white shadow-[0_12px_26px_rgba(0,0,0,0.16)]"
                    : "text-white/68 hover:bg-white/8 hover:text-white"
                )}
                title={collapsed ? item.label : undefined}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition-colors",
                    isActive
                      ? "orange-gradient text-white shadow-[0_10px_20px_rgba(255,134,23,0.3)]"
                      : "text-white/72 group-hover:text-white"
                  )}
                >
                  <Icon size={24} strokeWidth={2.2} />
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </motion.button>
            );
          })}
        </nav>

        <div className="mt-6">
          {collapsed ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="mx-auto h-11 w-11 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="展开侧边栏"
            >
              <ChevronRight size={18} />
            </Button>
          ) : (
            <div className="rounded-[16px] border border-white/12 bg-white/[0.045] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-lg font-extrabold text-[#0a3a68]">
                  陈
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold">陈老师</div>
                  <div className="truncate text-sm text-white/60">
                    {role === "admin" ? "Administrator" : "Teacher"}
                  </div>
                </div>
                <ChevronRight size={18} className="text-white/52" />
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
