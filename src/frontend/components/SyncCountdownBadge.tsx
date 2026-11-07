import { useEffect, useState } from "react";

type SyncState = "idle" | "checking" | "syncing" | "outdated" | "conflict" | "error";

type SyncCountdownBadgeProps = {
  intervalSeconds: number;
  enabled: boolean;
  hasRemoteVersion: boolean;
  syncState: SyncState;
  saving: boolean;
  resetKey: number;
};

export function SyncCountdownBadge({
  intervalSeconds,
  enabled,
  hasRemoteVersion,
  syncState,
  saving,
  resetKey
}: SyncCountdownBadgeProps) {
  const [seconds, setSeconds] = useState(intervalSeconds);

  useEffect(() => {
    setSeconds(intervalSeconds);
  }, [intervalSeconds, resetKey]);

  useEffect(() => {
    if (syncState === "outdated" || syncState === "conflict") {
      if (syncState === "outdated") setSeconds(0);
      return;
    }
    if (!enabled || saving) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [enabled, syncState, saving]);

  const tone =
    syncState === "outdated" || syncState === "conflict" || hasRemoteVersion
      ? "bg-[#ef4444] text-white"
      : seconds <= 15
        ? "bg-[#fee2e2] text-[#b91c1c]"
        : seconds <= 45
          ? "bg-[#ffedd5] text-[#9a3412]"
          : "bg-[#dcfce7] text-[#166534]";

  return (
    <span className={
      "absolute -bottom-1 -right-1 min-w-7 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none ring-2 ring-white " + tone
    }>
      {syncState === "checking" || syncState === "syncing" ? "..." : `${seconds}s`}
    </span>
  );
}
