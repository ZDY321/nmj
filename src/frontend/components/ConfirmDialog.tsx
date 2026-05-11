import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "normal";
  onConfirm: () => void;
};

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);

  const confirm = useCallback((nextOptions: ConfirmOptions) => {
    setOptions(nextOptions);
  }, []);

  const close = useCallback(() => setOptions(null), []);

  const dialog = (
    <AnimatePresence>
      {options && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#061226]/36 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-[430px] overflow-hidden rounded-[20px] border border-[#dbe4ef] bg-white shadow-[0_28px_80px_rgba(6,18,38,0.24)]"
          >
            <div className="flex items-start gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#fff3e4] text-[#f97316]">
                <AlertTriangle size={21} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-extrabold leading-6 text-[#061226]">{options.title}</div>
                {options.description && (
                  <div className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">
                    {options.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#64748b] transition-colors hover:bg-[#f3f7fb] hover:text-[#061226]"
                aria-label="关闭确认弹窗"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[#e8eef6] bg-[#f8fbff] p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={close}>
                {options.cancelLabel ?? "取消"}
              </Button>
              <Button
                type="button"
                variant={options.tone === "danger" ? "destructive" : "default"}
                onClick={() => {
                  options.onConfirm();
                  close();
                }}
              >
                {options.confirmLabel ?? "确认"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { confirm, dialog };
}
