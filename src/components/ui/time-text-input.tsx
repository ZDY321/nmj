import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { normalizeTimeText, timeToMinutes } from "@/frontend/lib/time";

export interface TimeTextInputProps extends Omit<InputProps, "type" | "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  showHint?: boolean;
}

const TimeTextInput = React.forwardRef<HTMLInputElement, TimeTextInputProps>(
  ({ value, onValueChange, onBlur, onKeyDown, placeholder = "HH:mm", showHint = true, ...props }, ref) => {
    const [draft, setDraft] = React.useState(value);

    React.useEffect(() => {
      setDraft(value);
    }, [value]);

    function commitDraft() {
      const raw = draft.trim();
      const nextValue = raw ? normalizeTimeText(raw) ?? raw : "";
      setDraft(nextValue);
      if (nextValue !== value) {
        onValueChange(nextValue);
      }
    }

    return (
      <div className="space-y-1">
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            commitDraft();
            onBlur?.(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitDraft();
              event.currentTarget.blur();
            }
            onKeyDown?.(event);
          }}
          {...props}
        />
        {showHint && (
          <div className="text-[11px] font-semibold leading-4 text-[#64748b]">
            使用24小时制，兼容格式示例：09:00 / 9:00 / 900
          </div>
        )}
      </div>
    );
  }
);
TimeTextInput.displayName = "TimeTextInput";

export function timeTextToMinutes(value: string): number {
  return timeToMinutes(value);
}

export { normalizeTimeText };
export { TimeTextInput };
