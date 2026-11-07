import { useEffect, useState } from "react";

export type ArchivePanel = "profile" | "salaryRules" | "campuses" | "students" | "courses";

export function useArchiveNavigation(focusRequest?: { panel: ArchivePanel; nonce: number } | null) {
  const [flashingArchiveItem, setFlashingArchiveItem] = useState<{ panel: ArchivePanel; id: string } | null>(null);
  const [archivePanel, setArchivePanel] = useState<ArchivePanel>("profile");

  useEffect(() => {
    if (focusRequest?.panel) {
      setArchivePanel(focusRequest.panel);
    }
  }, [focusRequest?.nonce]);

  function flashArchiveRow(panel: ArchivePanel, id: string) {
    setFlashingArchiveItem({ panel, id });
    window.setTimeout(() => {
      setFlashingArchiveItem((current) => (current?.panel === panel && current.id === id ? null : current));
    }, 1800);
  }

  function archiveRowClass(panel: ArchivePanel, id: string): string {
    return `border-b border-[#e8eef6] bg-white px-3 py-3 last:border-b-0 ${
      flashingArchiveItem?.panel === panel && flashingArchiveItem.id === id ? "archive-row-flash" : ""
    }`;
  }

  return { archivePanel, setArchivePanel, flashArchiveRow, archiveRowClass };
}
