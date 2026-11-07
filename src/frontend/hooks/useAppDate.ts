import { useEffect, useState } from "react";
import { todayIso } from "@/frontend/lib/calculations";

// Keep date-sensitive views fresh across midnight without rerendering them every minute.
export function useAppDate(): string {
  const [date, setDate] = useState(todayIso);
  useEffect(() => {
    const timer = window.setInterval(() => setDate(todayIso()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return date;
}
