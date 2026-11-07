import { applyAiScheduleDraftToVault } from "@/frontend/lib/aiScheduleDraftApply";
import { defaultFeeRuleForCourseType, defaultSalaryGradeRule, isClassBillingCourseType } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import { generateBatchLessonsInVault, type BatchLessonGenerationResult } from "@/frontend/lib/scheduleBatch";
import {
  applyLessonUpdates,
  cloneFeeRule,
  courseUpdateAffectsLessonDefaults,
  materializeStudentTrialStatusOnLessons,
  migrateLessonsFromCourseType,
  moveLessonsToTrash,
  normalizeCourseLessonSyncScope,
  recalculateLessonFeeSnapshot,
  recalculateLinkedMakeupLessonFeeSnapshots,
  repairCourseStudentLinksFromLessons,
  restoreLessonsFromTrash,
  syncFutureLessonsWithStudentTrialStatus,
  syncLessonsWithCourseDefaults,
  type CourseTypeMigrationMode,
  type CourseTypeMigrationResult
} from "@/frontend/lib/vaultMutations";
import type {
  AiScheduleSession,
  CalendarDayNote,
  Campus,
  CourseGroup,
  CourseType,
  CustomCourseType,
  CustomCourseTypeOption,
  FeeRule,
  GradeRecord,
  Lesson,
  MemoItem,
  ProgressChecklistCompletion,
  ProgressChecklistTemplate,
  SalaryAdjustment,
  Student,
  StudentCourseTransition,
  StudentProgressRecord,
  TeacherProfile,
  TeacherVault,
  TimePreset,
  TodoItem,
  Weekday,
  WeekStart
} from "@/shared/types";

function pauseCoursesWithoutActiveStudents(vault: TeacherVault, studentIds: Set<string>) {
  if (studentIds.size === 0) return;
  vault.courseGroups = vault.courseGroups.map((course) => {
    if (course.status === "paused" || !course.studentIds.some((studentId) => studentIds.has(studentId))) return course;
    return courseHasActiveStudentLocal(vault, course) ? course : { ...course, status: "paused" };
  });
}

function courseHasActiveStudentLocal(vault: TeacherVault, course: CourseGroup): boolean {
  return course.studentIds.some((studentId) => vault.students.find((student) => student.id === studentId)?.status === "active");
}

function shouldPauseSupersededClassCourse(vault: TeacherVault, existingCourse: CourseGroup, newCourse: CourseGroup): boolean {
  if (existingCourse.status !== "active") return false;
  if (existingCourse.type !== newCourse.type) return false;
  if (!isClassBillingCourseType(existingCourse.type)) return false;
  if (existingCourse.subject.trim() !== newCourse.subject.trim()) return false;
  if ((existingCourse.defaultCampusId ?? "") !== (newCourse.defaultCampusId ?? "")) return false;

  const existingStudents = existingCourse.studentIds
    .map((studentId) => vault.students.find((student) => student.id === studentId))
    .filter(Boolean);
  const hasStoppedStudent = existingStudents.some((student) => student?.status === "transition" || student?.status === "paused");
  if (!hasStoppedStudent) return false;

  const existingActiveStudentIds = existingStudents
    .filter((student) => student?.status === "active")
    .map((student) => student!.id);
  if (existingActiveStudentIds.length === 0) return true;

  const newStudentIds = new Set(newCourse.studentIds);
  return existingActiveStudentIds.every((studentId) => newStudentIds.has(studentId));
}

interface VaultActionsOptions {
  vault: TeacherVault | null;
  updateVault: (updater: (draft: TeacherVault) => void) => void;
  persist: (vault: TeacherVault, options?: { force?: boolean }) => Promise<void>;
  setAiScheduleSession: (session: AiScheduleSession | null) => void;
}

export function useVaultActions({ vault, updateVault, persist, setAiScheduleSession }: VaultActionsOptions) {
  function updateWeekStart(weekStart: WeekStart) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? {}),
        weekStartsOn: weekStart
      };
    });
  }

  function addGrade(grade: string) {
    const normalized = grade.trim();
    if (!normalized) return;
    updateVault((draft) => {
      const current = draft.preferences?.grades ?? ["初一", "初二", "初三"];
      if (current.includes(normalized)) return;
      draft.preferences = { ...(draft.preferences ?? { weekStartsOn: 0 }), grades: [...current, normalized] };
    });
  }

  function updateGrade(previousGrade: string, nextGrade: string) {
    const previous = previousGrade.trim();
    const next = nextGrade.trim();
    if (!previous || !next || previous === next) return;
    updateVault((draft) => {
      const current = draft.preferences?.grades ?? ["初一", "初二", "初三"];
      if (current.some((grade) => grade !== previous && grade === next)) return;
      draft.preferences = { ...(draft.preferences ?? { weekStartsOn: 0 }), grades: current.map((grade) => grade === previous ? next : grade) };
      draft.students = draft.students.map((student) => student.grade === previous ? { ...student, grade: next } : student);
    });
  }

  function deleteGrade(grade: string) {
    const normalized = grade.trim();
    if (!normalized) return;
    updateVault((draft) => {
      if (draft.students.some((student) => student.grade === normalized)) return;
      const current = draft.preferences?.grades ?? ["初一", "初二", "初三"];
      draft.preferences = { ...(draft.preferences ?? { weekStartsOn: 0 }), grades: current.filter((item) => item !== normalized) };
    });
  }

  function addLesson(lesson: Lesson) {
    updateVault((draft) => {
      draft.lessons.push(lesson);
    });
  }

  function addLessons(lessons: Lesson[], options: { replaceLessonIds?: string[] } = {}) {
    if (lessons.length === 0) return;
    updateVault((draft) => {
      const replaceLessonIds = new Set(options.replaceLessonIds ?? []);
      if (replaceLessonIds.size > 0) {
        moveLessonsToTrash(
          draft,
          draft.lessons.filter((lesson) => replaceLessonIds.has(lesson.id)),
          "sync_overwrite",
          "复用排课覆盖旧课节"
        );
      }
      draft.lessons.push(...lessons);
    });
  }

  function addLessonAndUpdateLesson(lessonToAdd: Lesson, lessonToUpdate: Lesson) {
    updateVault((draft) => {
      draft.lessons.push(lessonToAdd);
      draft.lessons = draft.lessons.map((item) => (item.id === lessonToUpdate.id ? lessonToUpdate : item));
      const originalLessonId = lessonToAdd.linkedOriginalLessonId ?? (!lessonToUpdate.linkedOriginalLessonId ? lessonToUpdate.id : undefined);
      if (originalLessonId) {
        recalculateLinkedMakeupLessonFeeSnapshots(draft, originalLessonId);
      }
    });
  }

  function updateLesson(lesson: Lesson) {
    updateVault((draft) => applyLessonUpdates(draft, [lesson]));
  }

  function updateLessons(lessons: Lesson[]) {
    if (lessons.length === 0) return;
    updateVault((draft) => applyLessonUpdates(draft, lessons));
  }

  function updateCalendarDayNote(date: string, note: string) {
    const normalizedDate = date.trim();
    if (!normalizedDate) return;
    const normalizedNote = note.replace(/\r\n/g, "\n");
    updateVault((draft) => {
      const existingNotes = draft.calendarDayNotes ?? [];
      if (!normalizedNote.trim()) {
        draft.calendarDayNotes = existingNotes.filter((item) => item.date !== normalizedDate);
        return;
      }
      const updatedAt = new Date().toISOString();
      const nextEntry: CalendarDayNote = {
        date: normalizedDate,
        note: normalizedNote,
        updatedAt
      };
      draft.calendarDayNotes = existingNotes.some((item) => item.date === normalizedDate)
        ? existingNotes.map((item) => (item.date === normalizedDate ? nextEntry : item))
        : [...existingNotes, nextEntry].sort((left, right) => left.date.localeCompare(right.date));
    });
  }

  function deleteLesson(lessonId: string) {
    updateVault((draft) => {
      const lesson = draft.lessons.find((item) => item.id === lessonId);
      if (lesson) {
        moveLessonsToTrash(draft, [lesson], "manual", "手动删除课节");
      }
    });
  }

  function restoreDeletedLessons(deletedLessonIds: string[]) {
    if (deletedLessonIds.length === 0) return;
    updateVault((draft) => {
      restoreLessonsFromTrash(draft, deletedLessonIds);
    });
  }

  function permanentlyDeleteDeletedLessons(deletedLessonIds: string[]) {
    if (deletedLessonIds.length === 0) return;
    updateVault((draft) => {
      const idSet = new Set(deletedLessonIds);
      const deletedLessons = draft.deletedLessons ?? [];
      const deletingOriginalLessonIds = new Set(
        deletedLessons
          .filter((item) => idSet.has(item.id) && !item.lesson.linkedOriginalLessonId)
          .map((item) => item.lesson.id)
      );
      draft.deletedLessons = deletedLessons.filter((item) =>
        !idSet.has(item.id) &&
        !(item.lesson.linkedOriginalLessonId && deletingOriginalLessonIds.has(item.lesson.linkedOriginalLessonId))
      );
    });
  }

  function updateCampus(campus: Campus) {
    updateVault((draft) => {
      draft.campuses = draft.campuses.map((item) => (item.id === campus.id ? campus : item));
    });
  }

  function deleteCampus(campusId: string) {
    updateVault((draft) => {
      draft.campuses = draft.campuses.filter((campus) => campus.id !== campusId);
    });
  }

  function updateStudent(student: Student) {
    updateStudents([student]);
  }

  function updateStudents(students: Student[]) {
    if (students.length === 0) return;
    updateVault((draft) => {
      const changedStudentIds = new Set<string>();
      students.forEach((student) => {
        const previousStudent = draft.students.find((item) => item.id === student.id);
        if (!previousStudent) return;
        const isRestoringStudent = previousStudent.status === "paused" && student.status !== "paused";
        if (Boolean(previousStudent.temporaryTrial) !== Boolean(student.temporaryTrial)) {
          materializeStudentTrialStatusOnLessons(draft, student.id, Boolean(previousStudent.temporaryTrial));
        }
        draft.students = draft.students.map((item) => (item.id === student.id ? student : item));
        changedStudentIds.add(student.id);
        if (isRestoringStudent) {
          repairCourseStudentLinksFromLessons(draft, student.id);
        }
        if (Boolean(previousStudent.temporaryTrial) !== Boolean(student.temporaryTrial)) {
          syncFutureLessonsWithStudentTrialStatus(draft, student.id, Boolean(student.temporaryTrial));
        }
      });
      pauseCoursesWithoutActiveStudents(draft, changedStudentIds);
    });
  }

  function updateProfile(profile: TeacherProfile) {
    updateVault((draft) => {
      draft.profile = profile;
    });
  }

  function deleteStudent(studentId: string) {
    deleteStudents([studentId]);
  }

  function deleteStudents(studentIds: string[]) {
    if (studentIds.length === 0) return;
    updateVault((draft) => {
      const studentIdSet = new Set(studentIds);
      draft.students = draft.students.filter((student) => !studentIdSet.has(student.id));
    });
  }

  function addCourse(course: CourseGroup) {
    updateVault((draft) => {
      draft.courseGroups = draft.courseGroups.map((item) =>
        shouldPauseSupersededClassCourse(draft, item, course) ? { ...item, status: "paused" } : item
      );
      draft.courseGroups.push(course);
    });
  }

  function updateCourse(course: CourseGroup) {
    updateVault((draft) => {
      const previousCourse = draft.courseGroups.find((item) => item.id === course.id);
      draft.courseGroups = draft.courseGroups.map((item) => (item.id === course.id ? course : item));
      if (previousCourse && courseUpdateAffectsLessonDefaults(previousCourse, course)) {
        syncLessonsWithCourseDefaults(draft, course, "future_scheduled");
      }
    });
  }

  function updateCourses(courses: CourseGroup[]) {
    if (courses.length === 0) return;
    updateVault((draft) => {
      const nextCoursesById = new Map(courses.map((course) => [course.id, course]));
      const previousCoursesById = new Map(draft.courseGroups.map((course) => [course.id, course]));
      draft.courseGroups = draft.courseGroups.map((course) => nextCoursesById.get(course.id) ?? course);
      courses.forEach((course) => {
        const previousCourse = previousCoursesById.get(course.id);
        if (previousCourse && courseUpdateAffectsLessonDefaults(previousCourse, course)) {
          syncLessonsWithCourseDefaults(draft, course, "future_scheduled");
        }
      });
    });
  }

  function syncCoursesToLessons(courseIds: string[]) {
    const courseIdSet = new Set(courseIds);
    if (courseIdSet.size === 0) return;
    updateVault((draft) => {
      draft.courseGroups
        .filter((course) => courseIdSet.has(course.id))
        .forEach((course) => {
          syncLessonsWithCourseDefaults(draft, course, "future_scheduled");
        });
    });
  }

  function deleteCourse(courseId: string) {
    updateVault((draft) => {
      draft.courseGroups = draft.courseGroups.filter((course) => course.id !== courseId);
    });
  }

  function transferStudentCourse(transition: StudentCourseTransition) {
    updateVault((draft) => {
      const targetSubject =
        transition.subject ??
        transition.newCourse?.subject ??
        draft.courseGroups.find((course) => course.id === transition.targetCourseId)?.subject;

      if (transition.endExisting) {
        draft.courseGroups = draft.courseGroups.map((course) => {
          if (!course.studentIds.includes(transition.studentId)) return course;
          if (transition.targetCourseId && course.id === transition.targetCourseId) {
            return { ...course, status: "active" };
          }
          if (targetSubject && course.subject !== targetSubject) return course;

          const nextStudentIds = course.studentIds.filter((id) => id !== transition.studentId);
          return {
            ...course,
            studentIds: nextStudentIds,
            status: nextStudentIds.length === 0 ? "paused" : course.status
          };
        });
      }

      if (transition.targetCourseId) {
        draft.courseGroups = draft.courseGroups.map((course) =>
          course.id === transition.targetCourseId
            ? {
                ...course,
                status: "active",
                studentIds: course.studentIds.includes(transition.studentId)
                  ? course.studentIds
                  : [...course.studentIds, transition.studentId]
              }
            : course
        );
      }

      if (transition.newCourse) {
        draft.courseGroups.push(transition.newCourse);
      }
    });
  }

  function addCustomTimePreset(preset: TimePreset) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customTimePresets: [...(draft.preferences?.customTimePresets ?? []), preset]
      };
    });
  }

  function deleteCustomTimePreset(presetId: string) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customTimePresets: (draft.preferences?.customTimePresets ?? []).filter((preset) => preset.id !== presetId)
      };
    });
  }

  function addCustomCourseType(courseType: CustomCourseTypeOption, feeRule?: FeeRule) {
    updateVault((draft) => {
      const current = draft.preferences?.customCourseTypes ?? [];
      const normalizedLabel = courseType.label.trim();
      if (!normalizedLabel || current.some((item) => item.id === courseType.id || item.label.trim() === normalizedLabel)) return;
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customCourseTypes: [...current, { ...courseType, label: normalizedLabel }],
        courseTypeFeeRules: {
          ...(draft.preferences?.courseTypeFeeRules ?? {}),
          [courseType.id]: feeRule ?? draft.preferences?.courseTypeFeeRules?.[courseType.id] ?? defaultFeeRuleForCourseType(courseType.id)
        }
      };
    });
  }

  function updateCourseTypeLabel(courseType: CourseType, label: string) {
    updateVault((draft) => {
      const normalizedLabel = label.trim();
      if (!normalizedLabel) return;
      if (courseType.startsWith("custom_")) {
        const current = draft.preferences?.customCourseTypes ?? [];
        if (current.some((item) => item.id !== courseType && item.label.trim() === normalizedLabel)) return;
        draft.preferences = {
          ...(draft.preferences ?? { weekStartsOn: 0 }),
          customCourseTypes: current.map((item) => (item.id === courseType ? { ...item, label: normalizedLabel } : item))
        };
        return;
      }
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        courseTypeLabels: {
          ...(draft.preferences?.courseTypeLabels ?? {}),
          [courseType]: normalizedLabel
        }
      };
    });
  }

  function deleteCourseType(courseType: CourseType) {
    updateVault((draft) => {
      const courseTypeLabels = { ...(draft.preferences?.courseTypeLabels ?? {}) };
      const courseTypeFeeRules = { ...(draft.preferences?.courseTypeFeeRules ?? {}) };
      delete courseTypeLabels[courseType];
      delete courseTypeFeeRules[courseType];
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        disabledCourseTypes: Array.from(new Set([...(draft.preferences?.disabledCourseTypes ?? []), courseType])),
        courseTypeLabels,
        courseTypeFeeRules
      };
    });
  }

  function updateCourseTypeFeeRule(courseType: CourseType, feeRule: FeeRule) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        courseTypeFeeRules: {
          ...(draft.preferences?.courseTypeFeeRules ?? {}),
          [courseType]: feeRule
        }
      };
    });
  }

  function syncCourseTypeFeeRuleToCourses(courseType: CourseType) {
    updateVault((draft) => {
      const defaultSalaryFeeRule: FeeRule = {
        mode: "salary_grade",
        salaryGradeSource: "teacher_default",
        salaryGradeId: draft.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(draft).id
      };
      draft.courseGroups = draft.courseGroups.map((course) => {
        if (course.type !== courseType) return course;
        if (course.type === "trial") return course;
        return {
          ...course,
          feeRule: cloneFeeRule(defaultSalaryFeeRule)
        };
      });
      draft.courseGroups
        .filter((course) => course.type === courseType)
        .forEach((course) => {
          syncLessonsWithCourseDefaults(draft, course, "future_scheduled");
        });
    });
  }

  function migrateCourseTypeLessons(
    fromType: CourseType,
    orphanTargetType: CourseType,
    mode: CourseTypeMigrationMode
  ): CourseTypeMigrationResult {
    let result: CourseTypeMigrationResult = { total: 0, byCourse: 0, substitute: 0, orphan: 0, refreshed: 0, skipped: 0 };
    updateVault((draft) => {
      result = migrateLessonsFromCourseType(draft, fromType, orphanTargetType, mode);
    });
    return result;
  }

  function updateAiScheduleSession(session: AiScheduleSession | null) {
    setAiScheduleSession(session);
  }

  function applyAiScheduleDraft(session: AiScheduleSession | null): { ok: boolean; message: string } {
    const result = applyAiScheduleDraftToVault({
      vault,
      session,
      makeId,
      recalculateLessonFeeSnapshot,
      moveLessonsToTrash,
      courseUpdateAffectsLessonDefaults,
      normalizeCourseLessonSyncScope,
      syncLessonsWithCourseDefaults,
      materializeStudentTrialStatusOnLessons,
      syncFutureLessonsWithStudentTrialStatus
    });
    if (result.ok) {
      void persist(result.vault);
    }
    return { ok: result.ok, message: result.message };
  }

  function addSubject(subject: string) {
    const normalizedSubject = subject.trim();
    if (!normalizedSubject) return;
    updateVault((draft) => {
      const subjects = draft.preferences?.subjects ?? [];
      if (subjects.some((item) => item.trim() === normalizedSubject)) return;
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        subjects: [...subjects, normalizedSubject]
      };
    });
  }

  function updateSubject(previousSubject: string, nextSubject: string) {
    const normalizedPrevious = previousSubject.trim();
    const normalizedNext = nextSubject.trim();
    if (!normalizedPrevious || !normalizedNext) return;
    updateVault((draft) => {
      const subjects = draft.preferences?.subjects ?? [];
      const nextSubjects = subjects
        .map((item) => (item.trim() === normalizedPrevious ? normalizedNext : item.trim()))
        .filter(Boolean);
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        subjects: Array.from(new Set(nextSubjects))
      };
      draft.courseGroups = draft.courseGroups.map((course) =>
        course.subject.trim() === normalizedPrevious ? { ...course, subject: normalizedNext } : course
      );
    });
  }

  function deleteSubject(subject: string) {
    const normalizedSubject = subject.trim();
    if (!normalizedSubject) return;
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        subjects: (draft.preferences?.subjects ?? []).filter((item) => item.trim() !== normalizedSubject)
      };
    });
  }

  function deleteCustomCourseType(courseTypeId: CustomCourseType) {
    updateVault((draft) => {
      const inUse =
        draft.courseGroups.some((course) => course.type === courseTypeId) ||
        draft.lessons.some((lesson) => lesson.type === courseTypeId);
      if (inUse) return;
      const courseTypeFeeRules = { ...(draft.preferences?.courseTypeFeeRules ?? {}) };
      const courseTypeLabels = { ...(draft.preferences?.courseTypeLabels ?? {}) };
      delete courseTypeFeeRules[courseTypeId];
      delete courseTypeLabels[courseTypeId];
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customCourseTypes: (draft.preferences?.customCourseTypes ?? []).filter((item) => item.id !== courseTypeId),
        disabledCourseTypes: (draft.preferences?.disabledCourseTypes ?? []).filter((type) => type !== courseTypeId),
        courseTypeLabels,
        courseTypeFeeRules
      };
    });
  }

  function addSalaryAdjustment(adjustment: SalaryAdjustment) {
    updateVault((draft) => {
      draft.salaryAdjustments.push(adjustment);
    });
  }

  function deleteSalaryAdjustment(adjustmentId: string) {
    updateVault((draft) => {
      draft.salaryAdjustments = draft.salaryAdjustments.filter((adjustment) => adjustment.id !== adjustmentId);
    });
  }

  function addTodo(todo: TodoItem) {
    updateVault((draft) => {
      draft.todoItems = [todo, ...(draft.todoItems ?? [])];
    });
  }

  function updateTodo(todo: TodoItem) {
    updateVault((draft) => {
      draft.todoItems = (draft.todoItems ?? []).map((item) => (item.id === todo.id ? todo : item));
    });
  }

  function deleteTodo(todoId: string) {
    updateVault((draft) => {
      draft.todoItems = (draft.todoItems ?? []).filter((todo) => todo.id !== todoId);
    });
  }

  function mergeTodosIntoMemo(todoIds: string[], memo: MemoItem) {
    if (todoIds.length === 0) return;
    const todoIdSet = new Set(todoIds);
    const archivedAt = new Date().toISOString();
    updateVault((draft) => {
      draft.memoItems = [memo, ...(draft.memoItems ?? []).filter((item) => item.id !== memo.id)];
      draft.todoItems = (draft.todoItems ?? []).map((todo) =>
        todoIdSet.has(todo.id) && todo.status === "open"
          ? { ...todo, status: "archived", archivedAt, archivedMemoId: memo.id }
          : todo
      );
    });
  }

  function saveMemo(memo: MemoItem) {
    updateVault((draft) => {
      const memos = draft.memoItems ?? [];
      const exists = memos.some((item) => item.id === memo.id);
      draft.memoItems = exists
        ? memos.map((item) => (item.id === memo.id ? memo : item))
        : [memo, ...memos];
    });
  }

  function deleteMemo(memoId: string) {
    updateVault((draft) => {
      draft.memoItems = (draft.memoItems ?? []).filter((memo) => memo.id !== memoId);
    });
  }

  function saveStudentProgressRecord(record: StudentProgressRecord) {
    updateVault((draft) => {
      const records = draft.studentProgressRecords ?? [];
      const exists = records.some((item) => item.id === record.id);
      draft.studentProgressRecords = exists
        ? records.map((item) => (item.id === record.id ? record : item))
        : [record, ...records];
    });
  }

  function saveStudentProgressRecords(recordsToSave: StudentProgressRecord[]) {
    if (recordsToSave.length === 0) return;
    updateVault((draft) => {
      const incomingIds = new Set(recordsToSave.map((record) => record.id));
      draft.studentProgressRecords = [
        ...recordsToSave,
        ...(draft.studentProgressRecords ?? []).filter((record) => !incomingIds.has(record.id))
      ];
    });
  }

  function deleteStudentProgressRecord(recordId: string) {
    updateVault((draft) => {
      draft.studentProgressRecords = (draft.studentProgressRecords ?? []).filter((record) => record.id !== recordId);
    });
  }

  function saveProgressChecklistTemplate(template: ProgressChecklistTemplate) {
    updateVault((draft) => {
      const templates = draft.progressChecklistTemplates ?? [];
      const exists = templates.some((item) => item.id === template.id);
      draft.progressChecklistTemplates = exists
        ? templates.map((item) => (item.id === template.id ? template : item))
        : [template, ...templates];

      const validItemIds = new Set(template.items.map((item) => item.id));
      draft.progressChecklistCompletions = (draft.progressChecklistCompletions ?? []).filter(
        (completion) => completion.templateId !== template.id || validItemIds.has(completion.itemId)
      );
    });
  }

  function deleteProgressChecklistTemplate(templateId: string) {
    updateVault((draft) => {
      draft.progressChecklistTemplates = (draft.progressChecklistTemplates ?? []).filter((template) => template.id !== templateId);
      draft.progressChecklistCompletions = (draft.progressChecklistCompletions ?? []).filter((completion) => completion.templateId !== templateId);
    });
  }

  function saveExternalPromptTemplate(template: string) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        checklistPromptTemplate: template
      };
    });
  }

  function saveProgressChecklistCompletion(completion: ProgressChecklistCompletion) {
    saveProgressChecklistCompletions([completion]);
  }

  function updateProgressChecklistCompletions(completionsToSave: ProgressChecklistCompletion[], completionIdsToDelete: string[]) {
    if (completionsToSave.length === 0 && completionIdsToDelete.length === 0) return;
    updateVault((draft) => {
      const incomingIds = new Set(completionsToSave.map((completion) => completion.id));
      const deletedIds = new Set(completionIdsToDelete);
      draft.progressChecklistCompletions = [
        ...completionsToSave,
        ...(draft.progressChecklistCompletions ?? []).filter((completion) =>
          !incomingIds.has(completion.id) && !deletedIds.has(completion.id)
        )
      ];
    });
  }

  function saveProgressChecklistCompletions(completionsToSave: ProgressChecklistCompletion[]) {
    updateProgressChecklistCompletions(completionsToSave, []);
  }

  function deleteProgressChecklistCompletion(completionId: string) {
    deleteProgressChecklistCompletions([completionId]);
  }

  function deleteProgressChecklistCompletions(completionIds: string[]) {
    updateProgressChecklistCompletions([], completionIds);
  }

  function addGradeRecord(record: GradeRecord) {
    updateVault((draft) => {
      draft.gradeRecords = [record, ...(draft.gradeRecords ?? [])];
    });
  }

  function deleteGradeRecord(recordId: string) {
    updateVault((draft) => {
      draft.gradeRecords = (draft.gradeRecords ?? []).filter((record) => record.id !== recordId);
    });
  }

  function generateDrafts(
    startDate: string,
    endDate: string,
    weekdays: Weekday[],
    courseGroupId: string,
    startTime: string,
    endTime: string,
    manualBillingHours?: number
  ): BatchLessonGenerationResult {
    let result: BatchLessonGenerationResult = { candidateCount: 0, createdCount: 0, conflictCount: 0, existingCount: 0 };
    updateVault((draft) => {
      result = generateBatchLessonsInVault(draft, {
        startDate,
        endDate,
        weekdays,
        courseGroupId,
        startTime,
        endTime,
        manualBillingHours
      });
    });
    return result;
  }

  return {
    updateWeekStart,
    addGrade,
    updateGrade,
    deleteGrade,
    addLesson,
    addLessons,
    addLessonAndUpdateLesson,
    updateLesson,
    updateLessons,
    updateCalendarDayNote,
    deleteLesson,
    restoreDeletedLessons,
    permanentlyDeleteDeletedLessons,
    updateCampus,
    deleteCampus,
    updateStudent,
    updateStudents,
    updateProfile,
    deleteStudent,
    deleteStudents,
    addCourse,
    updateCourse,
    updateCourses,
    syncCoursesToLessons,
    deleteCourse,
    transferStudentCourse,
    addCustomTimePreset,
    deleteCustomTimePreset,
    addCustomCourseType,
    updateCourseTypeLabel,
    deleteCourseType,
    updateCourseTypeFeeRule,
    syncCourseTypeFeeRuleToCourses,
    migrateCourseTypeLessons,
    updateAiScheduleSession,
    applyAiScheduleDraft,
    addSubject,
    updateSubject,
    deleteSubject,
    deleteCustomCourseType,
    addSalaryAdjustment,
    deleteSalaryAdjustment,
    addTodo,
    updateTodo,
    deleteTodo,
    mergeTodosIntoMemo,
    saveMemo,
    deleteMemo,
    saveStudentProgressRecord,
    saveStudentProgressRecords,
    deleteStudentProgressRecord,
    saveProgressChecklistTemplate,
    deleteProgressChecklistTemplate,
    saveExternalPromptTemplate,
    saveProgressChecklistCompletion,
    updateProgressChecklistCompletions,
    saveProgressChecklistCompletions,
    deleteProgressChecklistCompletion,
    addGradeRecord,
    deleteGradeRecord,
    generateDrafts
  };
}
