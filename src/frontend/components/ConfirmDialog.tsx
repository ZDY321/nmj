import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  tone?: "danger" | "normal";
  onConfirm: () => void;
  onSecondary?: () => void;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.offsetParent !== null || element === document.activeElement);
}

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const confirm = useCallback((nextOptions: ConfirmOptions) => {
    setOptions(nextOptions);
  }, []);

  const close = useCallback(() => setOptions(null), []);

  useEffect(() => {
    if (!options || typeof document === "undefined") return;
    const panel = document.getElementById(titleId)?.closest<HTMLElement>("[data-confirm-dialog-panel]");
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      const focusTarget = panel ? focusableElements(panel)[0] ?? panel : null;
      focusTarget?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = focusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [close, descriptionId, options, titleId]);

  const dialogContent = options ? (
    <div className="app-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-[#061226]/36 p-4 backdrop-blur-sm">
      <div
        className="app-modal-panel w-full max-w-[430px] overflow-hidden rounded-[20px] border border-[#dbe4ef] bg-white shadow-[0_28px_80px_rgba(6,18,38,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.description ? descriptionId : undefined}
        tabIndex={-1}
        data-confirm-dialog-panel
      >
        <div className="flex items-start gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#fff3e4] text-[#f97316]">
            <AlertTriangle size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <div id={titleId} className="text-lg font-extrabold leading-6 text-[#061226]">{options.title}</div>
            {options.description && (
              <div id={descriptionId} className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">
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
          {options.onSecondary && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                close();
                options.onSecondary?.();
              }}
            >
              {options.secondaryLabel ?? "保存后继续"}
            </Button>
          )}
          <Button
            type="button"
            variant={options.tone === "danger" ? "destructive" : "default"}
            onClick={() => {
              close();
              options.onConfirm();
            }}
          >
            {options.confirmLabel ?? "确认"}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  const dialog = typeof document === "undefined" ? dialogContent : createPortal(dialogContent, document.body);

  return { confirm, dialog };
}
