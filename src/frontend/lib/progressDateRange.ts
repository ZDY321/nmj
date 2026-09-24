import { addDays } from "@/frontend/lib/helpers";

export function defaultProgressDateRange(today: string): { start: string; end: string } {
  return {
    start: addDays(today, -29),
    end: today
  };
}
