import { useEffect, useState } from "react";
import type { DeletedLesson, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { canRestoreDeletedLesson, filterTrashLessons, sortDeletedLessons } from "@/frontend/lib/scheduleViewHelpers";

interface ScheduleTrashOptions {
  vault: TeacherVault;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  showScheduleError: (message: string) => void;
  onRestoreDeletedLessons: (ids: string[]) => void;
  onPermanentlyDeleteDeletedLessons: (ids: string[]) => void;
}

export function useScheduleTrash({ vault, confirm, showScheduleError, onRestoreDeletedLessons, onPermanentlyDeleteDeletedLessons }: ScheduleTrashOptions) {
  const [trashDateStart, setTrashDateStart] = useState("");
  const [trashDateEnd, setTrashDateEnd] = useState("");
  const [trashCampusFilter, setTrashCampusFilter] = useState("all");
  const [trashSourceFilter, setTrashSourceFilter] = useState<"all" | DeletedLesson["source"]>("all");
  const [trashSearch, setTrashSearch] = useState("");
  const [selectedTrashIds, setSelectedTrashIds] = useState<string[]>([]);

  useEffect(() => {
    const availableTrashIds = new Set((vault.deletedLessons ?? []).map((item) => item.id));
    setSelectedTrashIds((current) => current.filter((id) => availableTrashIds.has(id)));
  }, [vault.deletedLessons]);

  const deletedLessons = sortDeletedLessons(vault.deletedLessons ?? []);
  const normalizedTrashSearch = trashSearch.trim().toLowerCase();
  const trashLessons = filterTrashLessons(vault, deletedLessons, {
    campusFilter: trashCampusFilter,
    dateEnd: trashDateEnd,
    dateStart: trashDateStart,
    normalizedSearch: normalizedTrashSearch,
    sourceFilter: trashSourceFilter
  });
  const selectedTrashIdSet = new Set(selectedTrashIds);
  const selectedVisibleTrashIds = trashLessons.filter((item) => selectedTrashIdSet.has(item.id)).map((item) => item.id);
  const selectedVisibleTrashLessonIds = new Set(
    trashLessons.filter((item) => selectedTrashIdSet.has(item.id)).map((item) => item.lesson.id)
  );
  const allVisibleTrashSelected = trashLessons.length > 0 && trashLessons.every((item) => selectedTrashIdSet.has(item.id));
  const activeLessonIds = new Set(vault.lessons.map((lesson) => lesson.id));
  const selectedTrashRestoreCount = selectedVisibleTrashIds.filter((id) => {
    const item = trashLessons.find((deletedLesson) => deletedLesson.id === id);
    return item ? canRestoreDeletedLesson(vault, activeLessonIds, item, selectedVisibleTrashLessonIds) : false;
  }).length;

  function toggleTrashSelection(id: string) {
    setSelectedTrashIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleAllVisibleTrashSelection() {
    setSelectedTrashIds((current) => {
      const visibleIds = trashLessons.map((item) => item.id);
      if (visibleIds.length === 0) return current;
      if (visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function restoreTrashItems(ids: string[]) {
    const restoringLessonIds = new Set(
      deletedLessons.filter((item) => ids.includes(item.id)).map((item) => item.lesson.id)
    );
    const restorables = ids.filter((id) => {
      const item = deletedLessons.find((deletedLesson) => deletedLesson.id === id);
      return item && canRestoreDeletedLesson(vault, activeLessonIds, item, restoringLessonIds);
    });
    if (restorables.length === 0) {
      showScheduleError("选中的课节当前无法恢复，可能已有同 ID 课节或课程档案已不存在。");
      return;
    }
    onRestoreDeletedLessons(restorables);
    setSelectedTrashIds((current) => current.filter((id) => !restorables.includes(id)));
  }

  function askRestoreTrashItems(ids: string[]) {
    const count = ids.length;
    if (count === 0) return;
    confirm({
      title: count === 1 ? "恢复这节课？" : `恢复选中的 ${count} 节课？`,
      description: "恢复后课节会回到课程记录和日历中，原来的课程内容、作业、学生出勤和费用快照会一并恢复。",
      confirmLabel: "恢复",
      onConfirm: () => restoreTrashItems(ids)
    });
  }

  function askPermanentDeleteTrashItems(ids: string[]) {
    const count = ids.length;
    if (count === 0) return;
    confirm({
      title: count === 1 ? "彻底删除这条回收站记录？" : `彻底删除选中的 ${count} 条回收站记录？`,
      description: "彻底删除后将无法从系统内恢复，请确认这些课节不再需要找回。",
      confirmLabel: "彻底删除",
      tone: "danger",
      onConfirm: () => {
        onPermanentlyDeleteDeletedLessons(ids);
        setSelectedTrashIds((current) => current.filter((id) => !ids.includes(id)));
      }
    });
  }

  return {
    activeLessonIds, allVisibleTrashSelected, deletedLessonCount: deletedLessons.length,
    onPermanentDelete: askPermanentDeleteTrashItems, onRestore: askRestoreTrashItems,
    onToggleAllVisible: toggleAllVisibleTrashSelection, onToggleSelection: toggleTrashSelection,
    selectedTrashIdSet, selectedTrashRestoreCount, selectedVisibleTrashIds,
    setTrashCampusFilter, setTrashDateEnd, setTrashDateStart, setTrashSearch, setTrashSourceFilter,
    trashCampusFilter, trashDateEnd, trashDateStart, trashLessons, trashSearch, trashSourceFilter
  };
}
