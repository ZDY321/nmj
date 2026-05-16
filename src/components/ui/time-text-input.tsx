import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";

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

export function normalizeTimeText(value: string): string | null {
  const raw = value.trim().replace(/[：.]/g, ":");
  if (!raw) return null;

  let hourText = "";
  let minuteText = "";
  const colonMatch = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colonMatch) {
    hourText = colonMatch[1];
    minuteText = colonMatch[2];
  } else if (/^\d{3,4}$/.test(raw)) {
    hourText = raw.slice(0, -2);
    minuteText = raw.slice(-2);
  } else if (/^\d{1,2}$/.test(raw)) {
    hourText = raw;
    minuteText = "00";
  } else {
    return null;
  }

  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeTextToMinutes(value: string): number {
  const normalized = normalizeTimeText(value);
  if (!normalized) return Number.NaN;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

export { TimeTextInput };
