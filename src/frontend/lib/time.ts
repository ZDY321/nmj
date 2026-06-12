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

export function timeToMinutes(value: string): number {
  const normalized = normalizeTimeText(value);
  if (!normalized) return Number.NaN;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

export function durationHours(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start) / 60;
}

export function timesOverlap(firstStart: string, firstEnd: string, secondStart: string, secondEnd: string): boolean {
  const firstStartMinutes = timeToMinutes(firstStart);
  const firstEndMinutes = timeToMinutes(firstEnd);
  const secondStartMinutes = timeToMinutes(secondStart);
  const secondEndMinutes = timeToMinutes(secondEnd);
  if (![firstStartMinutes, firstEndMinutes, secondStartMinutes, secondEndMinutes].every(Number.isFinite)) return false;
  return firstStartMinutes < secondEndMinutes && secondStartMinutes < firstEndMinutes;
}
