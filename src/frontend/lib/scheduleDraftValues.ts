import { weekdayOfDateIso, weekdayLabels } from "@/frontend/lib/helpers";

export function dateWithWeekday(date: string): string {
  return `${date} · ${weekdayLabels[weekdayOfDateIso(date)]}`;
}

export function timeTwoHoursLater(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  const totalMinutes = Math.min(hour * 60 + minute + 120, 23 * 60 + 59);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

export function parseOptionalBillingHours(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const hours = Number(trimmed);
  return Number.isFinite(hours) ? Math.max(hours, 0) : undefined;
}

export function updateTimeWithTwoHourEnd(startTime: string, setStartTime: (value: string) => void, setEndTime: (value: string) => void) {
  setStartTime(startTime);
  const nextEndTime = timeTwoHoursLater(startTime);
  if (nextEndTime) setEndTime(nextEndTime);
}
