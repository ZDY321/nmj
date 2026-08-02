import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpenCheck, ChevronLeft, ChevronRight, Clock3, FilePlus2, History, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LessonFeedbackEditor } from "@/frontend/components/LessonFeedbackEditor";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { ApiError } from "@/frontend/lib/cloud";
import { courseHasActiveStudent, sortCoursesByName, sortLessons } from "@/frontend/lib/helpers";
import {
  createLessonFeedbackRecord,
  emptyLessonFeedbackIndex,
  lessonFeedbackIndexDocKey,
  lessonFeedbackIndexDocType,
  lessonFeedbackIndexItem,
  lessonFeedbackRecordDocType,
  upsertLessonFeedbackIndexItem,
  type LessonFeedbackIndexDocument,
  type LessonFeedbackIndexItem,
  type LessonFeedbackRecord
} from "@/frontend/lib/lessonFeedback";
import {
  convertLegacyFeedbackRecords,
  parseLegacyFeedbackJson,
  suggestLegacyCourseMappings,
  type LegacyCourseMappings,
  type LegacyFeedbackData
} from "@/frontend/lib/legacyLessonFeedback";
import {
  deleteEncryptedDocument,
  loadEncryptedDocumentWithVersion,
  saveEncryptedDocument
} from "@/frontend/lib/storage";
import type { CourseGroup, TeacherVault } from "@/shared/types";

type SaveState = "idle" | "loading" | "saving" | "saved" | "error" | "conflict";

export function LessonFeedbackWorkspace({
  vault,
  token,
  password,
  focusRequest,
  syncNonce = 0
}: {
  vault: TeacherVault;
  token: string;
  password: string;
  focusRequest?: { lessonId: string; nonce: number } | null;
  syncNonce?: number;
}) {
  // 课程下拉只列在读课程：口径与课程档案一致（手动结课，或已无在读学生）。
  // 结课课程的历史反馈仍从左侧列表打开，只是不能再新建。
  const courses = useMemo(
    () => sortCoursesByName(vault.courseGroups).filter((course) => course.status !== "paused" && courseHasActiveStudent(vault, course)),
    [vault]
  );
  const { confirm, dialog } = useConfirmDialog();
  // 历史筛选与旧数据导入仍需覆盖结课课程，否则它们的历史反馈会变得无法检索。
  const allCourses = useMemo(() => sortCoursesByName(vault.courseGroups), [vault.courseGroups]);
  const isEndedCourse = (course: CourseGroup) => course.status === "paused" || !courseHasActiveStudent(vault, course);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [historyCourseId, setHistoryCourseId] = useState("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [indexDocument, setIndexDocument] = useState<LessonFeedbackIndexDocument>(emptyLessonFeedbackIndex);
  const [activeRecord, setActiveRecord] = useState<LessonFeedbackRecord | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [message, setMessage] = useState("");
  const [legacyData, setLegacyData] = useState<LegacyFeedbackData | null>(null);
  const [legacyMappings, setLegacyMappings] = useState<LegacyCourseMappings>({});
  const [legacyFileName, setLegacyFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const legacyFileInputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef(indexDocument);
  const indexVersionRef = useRef("");
  const activeRecordRef = useRef(activeRecord);
  const recordVersionsRef = useRef(new Map<string, string>());
  const savedSignaturesRef = useRef(new Map<string, string>());
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const syncingRef = useRef(false);
  const saveStateRef = useRef<SaveState>(saveState);

  indexRef.current = indexDocument;
  activeRecordRef.current = activeRecord;
  saveStateRef.current = saveState;

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const lessons = useMemo(
    () => [...vault.lessons].filter((lesson) => lesson.courseGroupId === selectedCourseId).sort(sortLessons).reverse(),
    [selectedCourseId, vault.lessons]
  );
  const historyItems = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase();
    return [...indexDocument.items]
      .filter((item) => historyCourseId === "all" || item.courseGroupId === historyCourseId)
      .filter((item) => !query || `${item.className} ${item.subject} ${item.studentNames.join(" ")} ${item.preview}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [historyCourseId, historyQuery, indexDocument.items]);

  useEffect(() => {
    if (!courses.length) {
      setSelectedCourseId("");
      return;
    }
    if (!courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(courses.find((course) => course.status === "active")?.id ?? courses[0].id);
    }
  }, [courses, selectedCourseId]);

  useEffect(() => {
    let cancelled = false;
    setSaveState("loading");
    setIndexLoaded(false);
    setMessage("");
    loadEncryptedDocumentWithVersion<LessonFeedbackIndexDocument>(token, password, lessonFeedbackIndexDocType, lessonFeedbackIndexDocKey)
      .then(async ({ value, updatedAt }) => {
        if (cancelled) return;
        const nextIndex = normalizeIndex(value);
        indexVersionRef.current = updatedAt;
        indexRef.current = nextIndex;
        setIndexDocument(nextIndex);
        const latest = [...nextIndex.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (latest) {
          await loadRecord(latest.id, cancelled);
        } else {
          setSaveState("idle");
        }
        if (!cancelled) setIndexLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setSaveState("error");
        setIndexLoaded(true);
        setMessage(errorMessage(error, "课后反馈历史读取失败。"));
      });
    return () => {
      cancelled = true;
    };
  }, [password, token]);

  useEffect(() => {
    if (!indexLoaded || !focusRequest?.lessonId) return;
    const lesson = vault.lessons.find((item) => item.id === focusRequest.lessonId);
    const course = lesson ? vault.courseGroups.find((item) => item.id === lesson.courseGroupId) : undefined;
    if (!lesson || !course) {
      setSaveState("error");
      setMessage("没有找到这节课对应的课程档案，暂时无法建立课后反馈。" );
      return;
    }
    let cancelled = false;
    void (async () => {
      setSelectedCourseId(course.id);
      setSelectedLessonId(lesson.id);
      const existing = indexRef.current.items.find((item) => item.lessonId === lesson.id);
      if (existing) {
        if (activeRecordRef.current?.id !== existing.id) await openHistoryItem(existing);
        return;
      }
      if (!(await flushActiveRecord()) || cancelled) return;
      const next = createLessonFeedbackRecord(vault, course, lesson);
      recordVersionsRef.current.set(next.id, "");
      savedSignaturesRef.current.delete(next.id);
      activeRecordRef.current = next;
      setActiveRecord(next);
      setSaveState("idle");
      setMessage("已从课次详情带入学生、到课状态、课堂内容与作业。" );
    })();
    return () => {
      cancelled = true;
    };
  }, [focusRequest?.nonce, indexLoaded]);

  useEffect(() => {
    if (!activeRecord || saveState === "loading") return;
    const signature = recordSignature(activeRecord);
    if (savedSignaturesRef.current.get(activeRecord.id) === signature) return;
    setSaveState("idle");
    const timer = window.setTimeout(() => {
      void persistRecord(activeRecord);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [activeRecord]);

  useEffect(() => {
    if (!indexLoaded || !syncNonce) return;
    void syncFromCloud();
  }, [syncNonce]);

  useEffect(() => {
    if (!indexLoaded) return;
    const handleWake = () => {
      if (document.hidden) return;
      void syncFromCloud();
    };
    window.addEventListener("focus", handleWake);
    document.addEventListener("visibilitychange", handleWake);
    return () => {
      window.removeEventListener("focus", handleWake);
      document.removeEventListener("visibilitychange", handleWake);
    };
  }, [indexLoaded, password, token]);

  async function loadRecord(recordId: string, cancelled = false): Promise<boolean> {
    setSaveState("loading");
    setMessage("");
    try {
      const { value, updatedAt } = await loadEncryptedDocumentWithVersion<LessonFeedbackRecord>(
        token,
        password,
        lessonFeedbackRecordDocType,
        recordId
      );
      if (cancelled) return false;
      if (!value || value.version !== 1) throw new Error("反馈记录不存在或格式不受支持。");
      recordVersionsRef.current.set(recordId, updatedAt);
      savedSignaturesRef.current.set(recordId, recordSignature(value));
      activeRecordRef.current = value;
      setActiveRecord(value);
      setSelectedCourseId(value.courseGroupId);
      setSelectedLessonId(value.lessonId ?? "");
      setSaveState("saved");
      return true;
    } catch (error) {
      if (!cancelled) {
        setSaveState("error");
        setMessage(errorMessage(error, "反馈记录读取失败。"));
      }
      return false;
    }
  }

  function persistRecord(requestedRecord: LessonFeedbackRecord, force = false): Promise<boolean> {
    const queued = saveQueueRef.current.catch(() => false).then(async () => {
      const current = activeRecordRef.current?.id === requestedRecord.id ? activeRecordRef.current : requestedRecord;
      if (!current) return true;
      const signature = recordSignature(current);
      if (!force && savedSignaturesRef.current.get(current.id) === signature) return true;
      setSaveState("saving");
      setMessage("");
      try {
        const recordResult = await saveEncryptedDocument(
          token,
          password,
          lessonFeedbackRecordDocType,
          current.id,
          current,
          { expectedUpdatedAt: recordVersionsRef.current.get(current.id) ?? "", force }
        );
        recordVersionsRef.current.set(current.id, recordResult.updatedAt);

        const nextItem = lessonFeedbackIndexItem(current);
        let nextIndex = upsertIndexItem(indexRef.current, nextItem);
        let indexResult;
        try {
          indexResult = await saveEncryptedDocument(
            token,
            password,
            lessonFeedbackIndexDocType,
            lessonFeedbackIndexDocKey,
            nextIndex,
            { expectedUpdatedAt: indexVersionRef.current, force }
          );
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          // 索引条目之间互不冲突：重新读取云端后合并本条，避免覆盖其他设备新增的反馈。
          const remote = await loadEncryptedDocumentWithVersion<LessonFeedbackIndexDocument>(
            token,
            password,
            lessonFeedbackIndexDocType,
            lessonFeedbackIndexDocKey
          );
          nextIndex = upsertIndexItem(normalizeIndex(remote.value), nextItem);
          indexResult = await saveEncryptedDocument(
            token,
            password,
            lessonFeedbackIndexDocType,
            lessonFeedbackIndexDocKey,
            nextIndex,
            { expectedUpdatedAt: remote.updatedAt, force }
          );
        }
        indexVersionRef.current = indexResult.updatedAt;
        indexRef.current = nextIndex;
        setIndexDocument(nextIndex);
        savedSignaturesRef.current.set(current.id, signature);
        setSaveState("saved");
        return true;
      } catch (error) {
        const conflict = error instanceof ApiError && error.status === 409;
        setSaveState(conflict ? "conflict" : "error");
        setMessage(errorMessage(error, conflict ? "云端版本有更新，请重新读取或确认覆盖。" : "反馈自动保存失败。"));
        return false;
      }
    });
    saveQueueRef.current = queued;
    return queued;
  }

  async function flushActiveRecord(): Promise<boolean> {
    const current = activeRecordRef.current;
    if (!current || savedSignaturesRef.current.get(current.id) === recordSignature(current)) return true;
    return persistRecord(current);
  }

  async function openHistoryItem(item: LessonFeedbackIndexItem): Promise<void> {
    if (activeRecordRef.current?.id === item.id) return;
    if (!(await flushActiveRecord())) return;
    await loadRecord(item.id);
  }

  async function createOrOpenFeedback(): Promise<void> {
    if (!selectedCourse) return;
    const lesson = lessons.find((item) => item.id === selectedLessonId);
    const existing = selectedLessonId
      ? indexRef.current.items.find((item) => item.lessonId === selectedLessonId)
      : undefined;
    if (existing) {
      await openHistoryItem(existing);
      return;
    }
    if (!(await flushActiveRecord())) return;
    const next = createLessonFeedbackRecord(vault, selectedCourse, lesson);
    recordVersionsRef.current.set(next.id, "");
    savedSignaturesRef.current.delete(next.id);
    activeRecordRef.current = next;
    setActiveRecord(next);
    setSaveState("idle");
    setMessage(lesson ? "已带入本课次的学生、到课状态、课堂内容与作业。" : "已按当前课程名单创建反馈。" );
  }

  async function syncFromCloud(): Promise<void> {
    if (!token || !password || syncingRef.current) return;
    if (saveStateRef.current === "saving" || saveStateRef.current === "loading") return;
    syncingRef.current = true;
    try {
      const { value, updatedAt } = await loadEncryptedDocumentWithVersion<LessonFeedbackIndexDocument>(
        token,
        password,
        lessonFeedbackIndexDocType,
        lessonFeedbackIndexDocKey
      );
      if (updatedAt && updatedAt === indexVersionRef.current) return;
      const nextIndex = normalizeIndex(value);
      indexVersionRef.current = updatedAt;
      indexRef.current = nextIndex;
      setIndexDocument(nextIndex);

      const current = activeRecordRef.current;
      if (!current) return;
      if (savedSignaturesRef.current.get(current.id) !== recordSignature(current)) {
        setMessage("云端反馈历史已更新。当前反馈有未保存的修改，已为你保留，可保存后再重新读取。");
        return;
      }
      const remoteItem = nextIndex.items.find((item) => item.id === current.id);
      if (!remoteItem) return;
      if (remoteItem.updatedAt === current.updatedAt) return;
      await loadRecord(current.id);
      setMessage("已同步云端最新反馈。");
    } catch {
      // 静默同步失败不打断当前编辑，等待下一次同步或手动重新读取。
    } finally {
      syncingRef.current = false;
    }
  }

  function requestReloadFromCloud(): void {
    const current = activeRecordRef.current;
    const dirty = Boolean(current) && savedSignaturesRef.current.get(current!.id) !== recordSignature(current!);
    if (!dirty) {
      void reloadFromCloud();
      return;
    }
    confirm({
      title: "重新读取会丢弃未保存的修改？",
      description: "当前反馈有尚未保存到云端的改动，重新读取后这些改动将无法恢复。",
      confirmLabel: "丢弃并重新读取",
      tone: "danger",
      onConfirm: () => void reloadFromCloud()
    });
  }

  async function reloadFromCloud(): Promise<void> {
    setSaveState("loading");
    try {
      const { value, updatedAt } = await loadEncryptedDocumentWithVersion<LessonFeedbackIndexDocument>(
        token,
        password,
        lessonFeedbackIndexDocType,
        lessonFeedbackIndexDocKey
      );
      const nextIndex = normalizeIndex(value);
      indexVersionRef.current = updatedAt;
      indexRef.current = nextIndex;
      setIndexDocument(nextIndex);
      const activeId = activeRecordRef.current?.id;
      if (activeId && nextIndex.items.some((item) => item.id === activeId)) {
        await loadRecord(activeId);
      } else {
        activeRecordRef.current = null;
        setActiveRecord(null);
        setSaveState("idle");
      }
      setMessage("已重新读取云端反馈。" );
    } catch (error) {
      setSaveState("error");
      setMessage(errorMessage(error, "重新读取失败。"));
    }
  }

  async function overwriteConflict(): Promise<void> {
    const current = activeRecordRef.current;
    if (!current) return;
    setSaveState("loading");
    try {
      const { value, updatedAt } = await loadEncryptedDocumentWithVersion<LessonFeedbackIndexDocument>(
        token,
        password,
        lessonFeedbackIndexDocType,
        lessonFeedbackIndexDocKey
      );
      indexVersionRef.current = updatedAt;
      indexRef.current = normalizeIndex(value);
      setIndexDocument(indexRef.current);
      await persistRecord(current, true);
    } catch (error) {
      setSaveState("error");
      setMessage(errorMessage(error, "覆盖保存失败。"));
    }
  }

  function requestDeleteActiveRecord(): void {
    const current = activeRecordRef.current;
    if (!current) return;
    confirm({
      title: "删除这条课后反馈？",
      description: `${current.className} ${current.date} ${current.periodLabel} 的反馈将从云端移除，此操作无法撤销。`,
      confirmLabel: "删除反馈",
      tone: "danger",
      onConfirm: () => void deleteActiveRecord()
    });
  }

  async function deleteActiveRecord(): Promise<void> {
    const current = activeRecordRef.current;
    if (!current) return;
    setSaveState("saving");
    setMessage("");
    try {
      const nextIndex: LessonFeedbackIndexDocument = {
        ...indexRef.current,
        items: indexRef.current.items.filter((item) => item.id !== current.id),
        updatedAt: new Date().toISOString()
      };
      const indexResult = await saveEncryptedDocument(
        token,
        password,
        lessonFeedbackIndexDocType,
        lessonFeedbackIndexDocKey,
        nextIndex,
        { expectedUpdatedAt: indexVersionRef.current }
      );
      await deleteEncryptedDocument(token, lessonFeedbackRecordDocType, current.id, { force: true });
      indexVersionRef.current = indexResult.updatedAt;
      indexRef.current = nextIndex;
      setIndexDocument(nextIndex);
      recordVersionsRef.current.delete(current.id);
      savedSignaturesRef.current.delete(current.id);
      activeRecordRef.current = null;
      setActiveRecord(null);
      setSaveState("idle");
      // 不再提示“已删除”：这条提示会在列表上方占一行、随后消失，导致左侧条目位移误点。
      setMessage("");
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      setSaveState(conflict ? "conflict" : "error");
      setMessage(errorMessage(error, "删除反馈失败。"));
    }
  }

  async function chooseLegacyFile(file?: File): Promise<void> {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setSaveState("error");
      setMessage("导入文件超过 20MB，请确认选择的是旧反馈项目的课堂反馈数据.json。" );
      return;
    }
    try {
      const data = parseLegacyFeedbackJson(await file.text());
      setLegacyData(data);
      setLegacyMappings(suggestLegacyCourseMappings(vault, data));
      setLegacyFileName(file.name);
      setSaveState("idle");
      setMessage(`已识别 ${data.classes.length} 个旧班级、${data.lessons.length} 条反馈，请确认课程映射。`);
    } catch (error) {
      setLegacyData(null);
      setLegacyMappings({});
      setLegacyFileName("");
      setSaveState("error");
      setMessage(errorMessage(error, "旧反馈文件读取失败。"));
    } finally {
      if (legacyFileInputRef.current) legacyFileInputRef.current.value = "";
    }
  }

  async function importLegacyRecords(): Promise<void> {
    if (!legacyData || importing) return;
    const converted = convertLegacyFeedbackRecords(vault, legacyData, legacyMappings);
    const existingLegacyIds = new Set(indexRef.current.items.map((item) => item.legacySourceId).filter(Boolean));
    const existingRecordIds = new Set(indexRef.current.items.map((item) => item.id));
    const pending = converted.records.filter((record) => !existingRecordIds.has(record.id) && !existingLegacyIds.has(record.legacySourceId));
    if (pending.length === 0) {
      setMessage(converted.records.length === 0 ? "没有可导入的反馈，请至少为一个旧班级选择对应课程。" : "所选旧反馈均已导入，无需重复处理。" );
      return;
    }
    if (!(await flushActiveRecord())) return;

    setImporting(true);
    setSaveState("saving");
    setMessage("正在逐条加密并导入旧反馈..." );
    try {
      const imported: Array<{ record: LessonFeedbackRecord; updatedAt: string }> = [];
      for (let offset = 0; offset < pending.length; offset += 4) {
        const batch = pending.slice(offset, offset + 4);
        const saved = await Promise.all(batch.map(async (record) => {
          try {
            const result = await saveEncryptedDocument(
              token,
              password,
              lessonFeedbackRecordDocType,
              record.id,
              record,
              { expectedUpdatedAt: "" }
            );
            return { record, updatedAt: result.updatedAt };
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 409) throw error;
            const existing = await loadEncryptedDocumentWithVersion<LessonFeedbackRecord>(
              token,
              password,
              lessonFeedbackRecordDocType,
              record.id
            );
            if (!existing.value || existing.value.legacySourceId !== record.legacySourceId) throw error;
            return { record: existing.value, updatedAt: existing.updatedAt };
          }
        }));
        imported.push(...saved);
      }

      const importedItems = imported.map(({ record }) => lessonFeedbackIndexItem(record));
      let baseIndex = indexRef.current;
      let baseVersion = indexVersionRef.current;
      let nextIndex = mergeIndexItems(baseIndex, importedItems);
      let indexResult;
      try {
        indexResult = await saveEncryptedDocument(
          token,
          password,
          lessonFeedbackIndexDocType,
          lessonFeedbackIndexDocKey,
          nextIndex,
          { expectedUpdatedAt: baseVersion }
        );
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        const remote = await loadEncryptedDocumentWithVersion<LessonFeedbackIndexDocument>(
          token,
          password,
          lessonFeedbackIndexDocType,
          lessonFeedbackIndexDocKey
        );
        baseIndex = normalizeIndex(remote.value);
        baseVersion = remote.updatedAt;
        nextIndex = mergeIndexItems(baseIndex, importedItems);
        indexResult = await saveEncryptedDocument(
          token,
          password,
          lessonFeedbackIndexDocType,
          lessonFeedbackIndexDocKey,
          nextIndex,
          { expectedUpdatedAt: baseVersion }
        );
      }

      imported.forEach(({ record, updatedAt }) => {
        recordVersionsRef.current.set(record.id, updatedAt);
        savedSignaturesRef.current.set(record.id, recordSignature(record));
      });
      indexVersionRef.current = indexResult.updatedAt;
      indexRef.current = nextIndex;
      setIndexDocument(nextIndex);
      const first = imported[0]?.record;
      if (first) {
        activeRecordRef.current = first;
        setActiveRecord(first);
        setSelectedCourseId(first.courseGroupId);
        setSelectedLessonId(first.lessonId ?? "");
      }
      setLegacyData(null);
      setLegacyMappings({});
      setLegacyFileName("");
      setSaveState("saved");
      const unmatched = converted.unmatchedStudentCount > 0 ? `；${converted.unmatchedStudentCount} 名未匹配学生已保留为历史快照` : "";
      const skipped = converted.skippedLessonCount > 0 ? `；跳过 ${converted.skippedLessonCount} 条未映射课程反馈` : "";
      setMessage(`已加密导入 ${imported.length} 条旧反馈${unmatched}${skipped}。`);
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      setSaveState(conflict ? "conflict" : "error");
      setMessage(errorMessage(error, "旧反馈导入失败，已经成功写入的记录不会丢失，再次导入可继续补齐。"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="lesson-feedback-view">
      <section className="lesson-feedback-create-panel is-compact">
        <div className="lesson-feedback-panel-heading">
          <div>
            <div className="lesson-feedback-eyebrow"><BookOpenCheck size={15} /> 课程与课次</div>
            <h2>建立课后反馈</h2>
          </div>
          <div className="lesson-feedback-heading-actions">
            <input
              ref={legacyFileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => void chooseLegacyFile(event.target.files?.[0])}
            />
            <Button size="sm" variant="outline" onClick={() => legacyFileInputRef.current?.click()}>
              <Upload size={14} /> 导入旧 JSON
            </Button>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)} disabled={courses.length === 0}>
              <FilePlus2 size={15} /> 新建反馈
            </Button>
          </div>
        </div>
      </section>

      {createDialogOpen && (
        <div className="lesson-feedback-modal-backdrop" onClick={() => setCreateDialogOpen(false)}>
          <div
            className="lesson-feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-label="选择课程与课次"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="lesson-feedback-modal-head">
              <div>
                <div className="lesson-feedback-eyebrow"><BookOpenCheck size={15} /> 课程与课次</div>
                <h3>选择要建立反馈的课</h3>
              </div>
              <button type="button" className="lesson-feedback-modal-close" onClick={() => setCreateDialogOpen(false)} aria-label="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="lesson-feedback-modal-body">
              <label>
                <span>课程</span>
                <Select value={selectedCourseId} onChange={(event) => {
                  setSelectedCourseId(event.target.value);
                  setSelectedLessonId("");
                }}>
                  {courses.length === 0 && <option value="">暂无课程</option>}
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>)}
                </Select>
              </label>
              <label>
                <span>对应课次</span>
                <Select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)} disabled={!selectedCourse}>
                  <option value="">不关联具体课次，按课程名单创建</option>
                  {lessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.date} {lesson.startTime}-{lesson.endTime}{lesson.status === "cancelled" ? "（已取消）" : ""}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="lesson-feedback-modal-foot">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>取消</Button>
              <Button
                disabled={!selectedCourse}
                onClick={() => {
                  setCreateDialogOpen(false);
                  void createOrOpenFeedback();
                }}
              >
                <FilePlus2 size={16} /> {selectedLessonId && indexDocument.items.some((item) => item.lessonId === selectedLessonId) ? "打开本课次反馈" : "新建反馈"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {legacyData && (
        <section className="lesson-feedback-import-panel">
          <div className="lesson-feedback-import-heading">
            <div>
              <div className="lesson-feedback-eyebrow"><Upload size={15} /> 旧反馈迁移</div>
              <h3>{legacyFileName}</h3>
              <p>已识别 {legacyData.classes.length} 个班级、{legacyData.lessons.length} 条反馈。请选择每个旧班级在课薪系统中对应的课程。</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setLegacyData(null)} aria-label="关闭导入"><X size={18} /></Button>
          </div>
          <div className="lesson-feedback-import-mappings">
            {legacyData.classes.map((legacyClass) => {
              const lessonCount = legacyData.lessons.filter((lesson) => lesson.classId === legacyClass.id).length;
              return (
                <div key={legacyClass.id} className="lesson-feedback-import-row">
                  <div><strong>{legacyClass.name}</strong><span>{legacyClass.subject || "未设置科目"} · {legacyClass.students.length} 名学生 · {lessonCount} 条反馈</span></div>
                  <Select value={legacyMappings[legacyClass.id] ?? ""} onChange={(event) => setLegacyMappings((current) => ({ ...current, [legacyClass.id]: event.target.value }))}>
                    <option value="">跳过这个旧班级</option>
                    {allCourses.map((course) => <option key={course.id} value={course.id}>{course.name} · {course.subject}{isEndedCourse(course) ? "（结课）" : ""}</option>)}
                  </Select>
                </div>
              );
            })}
          </div>
          <div className="lesson-feedback-import-footer">
            <span>同名学生会自动关联当前档案；未匹配学生仍会保留姓名快照，不会写入学生档案。</span>
            <Button disabled={importing || !Object.values(legacyMappings).some(Boolean)} onClick={() => void importLegacyRecords()}>
              <Upload size={16} /> {importing ? "正在加密导入..." : "确认映射并导入"}
            </Button>
          </div>
        </section>
      )}

      {message && (
        <div className={`lesson-feedback-notice ${saveState === "error" || saveState === "conflict" ? "is-error" : ""}`}>
          <span>{saveState === "error" || saveState === "conflict" ? <AlertTriangle size={16} /> : <Clock3 size={16} />}{message}</span>
          {saveState === "conflict" && (
            <span className="lesson-feedback-notice-actions">
              <Button size="sm" variant="outline" onClick={requestReloadFromCloud}><RefreshCw size={14} /> 重新读取</Button>
              <Button size="sm" variant="destructive" onClick={() => void overwriteConflict()}>保留当前并覆盖</Button>
            </span>
          )}
        </div>
      )}

      <div className={`lesson-feedback-layout${historyCollapsed ? " is-history-collapsed" : ""}`}>
        <aside className="lesson-feedback-history">
          <button
            type="button"
            className="lesson-feedback-history-title"
            onClick={() => setHistoryCollapsed((current) => !current)}
            title={historyCollapsed ? "展开反馈历史" : "折叠反馈历史"}
            aria-expanded={!historyCollapsed}
          >
            <History size={17} />
            <span>反馈历史</span>
            <strong>{indexDocument.items.length}</strong>
            {historyCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
          <Select value={historyCourseId} onChange={(event) => setHistoryCourseId(event.target.value)}>
            <option value="all">全部课程</option>
            {allCourses.map((course) => <option key={course.id} value={course.id}>{course.name}{isEndedCourse(course) ? "（结课）" : ""}</option>)}
          </Select>
          <label className="lesson-feedback-search">
            <Search size={15} />
            <Input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索学生或内容" />
          </label>
          <div className="lesson-feedback-history-list">
            {historyItems.map((item) => (
              <button type="button" key={item.id} className={activeRecord?.id === item.id ? "is-active" : ""} onClick={() => void openHistoryItem(item)}>
                <span><strong>{item.className}</strong><small>{item.subject} · {item.periodLabel}</small></span>
                <time>{item.date}</time>
                <em>{item.studentNames.join("、") || "未记录学生"}</em>
              </button>
            ))}
            {saveState === "loading" && <div className="lesson-feedback-history-empty">正在读取加密反馈...</div>}
            {saveState !== "loading" && historyItems.length === 0 && <div className="lesson-feedback-history-empty">暂无符合条件的反馈</div>}
          </div>
        </aside>

        <main className="lesson-feedback-main">
          {activeRecord ? (
            <>
              <div className="lesson-feedback-record-toolbar">
                <div><strong>{activeRecord.className}</strong><span>{activeRecord.date} · {activeRecord.periodLabel}{courses.find((course) => course.id === activeRecord.courseGroupId)?.status === "paused" ? " · 结课" : ""}</span></div>
                <Button size="sm" variant="destructive" onClick={requestDeleteActiveRecord}><Trash2 size={15} /> 删除反馈</Button>
              </div>
              <LessonFeedbackEditor record={activeRecord} onChange={setActiveRecord} saveState={saveState} />
            </>
          ) : (
            <div className="lesson-feedback-empty-editor">
              <BookOpenCheck size={34} />
              <strong>选择历史反馈，或从上方课程与课次新建</strong>
              <span>反馈中的学生姓名、班级与课次信息会保存为当时的快照。</span>
            </div>
          )}
        </main>
      </div>
      {dialog}
    </div>
  );
}

function normalizeIndex(value: LessonFeedbackIndexDocument | null): LessonFeedbackIndexDocument {
  if (!value || value.version !== 1 || !Array.isArray(value.items)) return emptyLessonFeedbackIndex();
  return { ...value, items: value.items.filter((item) => item && typeof item.id === "string") };
}

function upsertIndexItem(index: LessonFeedbackIndexDocument, item: LessonFeedbackIndexItem): LessonFeedbackIndexDocument {
  return upsertLessonFeedbackIndexItem(index, item);
}

function mergeIndexItems(index: LessonFeedbackIndexDocument, items: LessonFeedbackIndexItem[]): LessonFeedbackIndexDocument {
  const newIds = new Set(items.map((item) => item.id));
  const legacyIds = new Set(items.map((item) => item.legacySourceId).filter(Boolean));
  return {
    version: 1,
    items: [
      ...items,
      ...index.items.filter((item) => !newIds.has(item.id) && (!item.legacySourceId || !legacyIds.has(item.legacySourceId)))
    ],
    updatedAt: new Date().toISOString()
  };
}

function recordSignature(record: LessonFeedbackRecord): string {
  return JSON.stringify(record);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const FeedbackView = LessonFeedbackWorkspace;
