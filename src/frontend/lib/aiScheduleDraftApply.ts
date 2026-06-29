import {
  defaultFeeRuleForCourseType,
  defaultSalaryGradeRule,
  feeRuleForCourseType,
  salaryGradeRateForStage,
  salaryGradeRuleById
} from "@/frontend/lib/calculations";
import {
  buildScheduleSyncLessonsForDate,
  cloneVault,
  courseTypeLabel,
  createLessonFromCourse,
  datesBetween,
  linkSyncedLessonsToPreviousLessons
} from "@/frontend/lib/helpers";
import { normalizeTimeText, timeToMinutes, timesOverlap } from "@/frontend/lib/time";
import {
  arrayValue as arrayValueLocal,
  isPlainRecord as isPlainRecordLocal,
  numberValue,
  stringValue
} from "@/frontend/lib/typeGuards";
import type {
  AiScheduleSession,
  Campus,
  ClassFeeTier,
  CourseGroup,
  CourseType,
  CustomCourseType,
  DeletedLessonSource,
  FeeRule,
  Lesson,
  SalaryGradeId,
  Student,
  TeacherVault
} from "@/shared/types";

export type AiCourseLessonSyncScope = "future_scheduled" | "all_unfinished" | "all" | "none";

export type ApplyAiScheduleDraftOptions = {
  vault: TeacherVault | null;
  session: AiScheduleSession | null;
  makeId: (prefix: string) => string;
  recalculateLessonFeeSnapshot: (vault: TeacherVault, lesson: Lesson) => Lesson;
  moveLessonsToTrash: (vault: TeacherVault, lessons: Lesson[], source: DeletedLessonSource, reason?: string) => void;
  courseUpdateAffectsLessonDefaults: (previousCourse: CourseGroup, nextCourse: CourseGroup) => boolean;
  normalizeCourseLessonSyncScope: (value: unknown) => AiCourseLessonSyncScope;
  syncLessonsWithCourseDefaults: (vault: TeacherVault, course: CourseGroup, scope: AiCourseLessonSyncScope) => number;
  materializeStudentTrialStatusOnLessons: (vault: TeacherVault, studentId: string, currentTrial: boolean) => void;
  syncFutureLessonsWithStudentTrialStatus: (vault: TeacherVault, studentId: string, nextTrial: boolean) => number;
};

export type ApplyAiScheduleDraftResult =
  | { ok: false; message: string }
  | { ok: true; message: string; vault: TeacherVault };
export function applyAiScheduleDraftToVault(options: ApplyAiScheduleDraftOptions): ApplyAiScheduleDraftResult {
  const {
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
  } = options;

  if (!vault || !session?.draft) {
      return { ok: false, message: "没有可执行的 AI 建议。请先生成建议。" };
    }
    const parsedDraft = session.draft.draft;
    if (!isPlainRecordLocal(parsedDraft)) {
      return { ok: false, message: "AI 建议不是标准结构，无法确认写入。" };
    }
    const actions = arrayValueLocal(parsedDraft.actions).filter(isPlainRecordLocal);
    if (actions.length === 0) {
      return { ok: false, message: "AI 建议里没有可执行动作。请先补充信息后重新生成。" };
    }

    const nextVault = cloneVault(vault);
    const messages: string[] = [];
    const blockers: string[] = [];

    const campusByName = (name: unknown): Campus | undefined => {
      const normalized = stringValue(name).toLowerCase();
      if (!normalized) return undefined;
      return nextVault.campuses.find((campus) => campus.id.toLowerCase() === normalized || campus.name.trim().toLowerCase() === normalized);
    };

    const studentByName = (name: unknown): Student | undefined => {
      const normalized = stringValue(name).toLowerCase();
      if (!normalized) return undefined;
      return nextVault.students.find((student) => student.id.toLowerCase() === normalized || student.name.trim().toLowerCase() === normalized);
    };

    const courseByIdOrName = (value: unknown): CourseGroup | undefined => {
      const normalized = stringValue(value).toLowerCase();
      if (!normalized) return undefined;
      return nextVault.courseGroups.find((course) => course.id.toLowerCase() === normalized || course.name.trim().toLowerCase() === normalized);
    };

    const courseMatchesData = (course: CourseGroup, data: Record<string, unknown>): boolean => {
      const requestedSubject = stringValue(data.subject);
      const requestedType = data.type === undefined || data.type === null || data.type === "" ? "" : normalizeAiCourseType(data.type, nextVault);
      const requestedCampus = data.campus === undefined ? undefined : campusByName(data.campus);
      const requestedStudentIds = studentIdsFromAiData(data);
      if (requestedSubject && course.subject.trim().toLowerCase() !== requestedSubject.toLowerCase()) return false;
      if (requestedType && course.type !== requestedType) return false;
      if (requestedCampus && course.defaultCampusId !== requestedCampus.id) return false;
      if (requestedStudentIds.length > 0) {
        const currentIds = new Set(course.studentIds);
        if (!requestedStudentIds.every((studentId) => currentIds.has(studentId))) return false;
      }
      return true;
    };

    const ensureStudent = (data: Record<string, unknown>): Student | null => {
      const name = stringValue(data.name ?? data.studentName);
      if (!name) return null;
      const grade = stringValue(data.grade);
      const campus = campusByName(data.campus);
      const existing = nextVault.students.find((student) =>
        student.name.trim().toLowerCase() === name.toLowerCase() &&
        (!grade || (student.grade ?? "").trim().toLowerCase() === grade.toLowerCase()) &&
        (!campus || student.defaultCampusId === campus.id)
      );
      if (existing) return existing;

      const student: Student = {
        id: makeId("student"),
        name,
        grade: grade || undefined,
        defaultCampusId: campus?.id,
        note: stringValue(data.note) || undefined,
        temporaryTrial: Boolean(data.temporaryTrial),
        status: "active"
      };
      nextVault.students.push(student);
      messages.push(`新增学生「${student.name}」`);
      return student;
    };

    const studentIdsFromNames = (values: unknown): string[] => {
      const rawValues = Array.isArray(values) ? values : values === undefined || values === null || values === "" ? [] : [values];
      return rawValues
        .map((value) => {
          if (isPlainRecordLocal(value)) {
            const directId = stringValue(value.id ?? value.studentId);
            const student = nextVault.students.find((item) => item.id === directId) ?? studentByName(value.name ?? value.studentName);
            return student?.id ?? "";
          }
          const directId = stringValue(value);
          const student = nextVault.students.find((item) => item.id === directId) ?? studentByName(value);
          return student?.id ?? "";
        })
        .filter(Boolean);
    };

    const studentIdsFromAiData = (data: Record<string, unknown>): string[] => {
      const directStudentId = stringValue(data.studentId);
      const directStudent = directStudentId ? nextVault.students.find((student) => student.id === directStudentId) : undefined;
      return Array.from(new Set([
        directStudent?.id ?? "",
        ...studentIdsFromNames(data.studentIds ?? data.studentNames ?? data.students ?? data.studentsToAdd),
        ...studentIdsFromNames(data.studentName ?? data.student)
      ].filter(Boolean)));
    };

    const createCourseTypeFromAi = (data: Record<string, unknown>) => {
      const label = stringValue(data.label ?? data.name ?? data.courseTypeName);
      if (!label) return;
      const normalizedLabel = label.trim();
      const requestedId = stringValue(data.id ?? data.courseTypeId);
      const id = requestedId.startsWith("custom_") ? requestedId : `custom_${makeId("ctype")}`;
      const current = nextVault.preferences?.customCourseTypes ?? [];
      const existingType = current.find((item) => item.id === id || item.label.trim().toLowerCase() === normalizedLabel.toLowerCase());
      if (existingType) return;
      const templateMode = stringValue(data.templateMode ?? data.template ?? data.mode).toLowerCase();
      const feeRule = defaultFeeRuleForCustomTemplate(
        nextVault,
        templateMode === "hourly" ? "hourly" : templateMode === "non_class" || templateMode === "one_on_one" ? "non_class" : "class"
      );
      nextVault.preferences = {
        ...(nextVault.preferences ?? { weekStartsOn: 0 }),
        customCourseTypes: [...current, { id: id as CustomCourseType, label: normalizedLabel }],
        courseTypeFeeRules: {
          ...(nextVault.preferences?.courseTypeFeeRules ?? {}),
          [id]: feeRule
        }
      };
      messages.push(`新增班型「${normalizedLabel}」`);
    };

    const aiDataFeeMode = (data: Record<string, unknown>): FeeRule["mode"] | null => {
      const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
      const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
      if (mode === "salary_grade" || mode === "salary" || mode === "岗位薪资" || mode === "岗位薪资等级" || mode === "课时费等级") return "salary_grade";
      if (mode === "class_headcount" || mode === "class") return "class_headcount";
      if (mode === "fixed") return "fixed";
      if (mode === "hourly") return "hourly";
      if (
        source.baseFee !== undefined ||
        source.classBaseFee !== undefined ||
        source.minimumFee !== undefined ||
        source.perPresentStudentFee !== undefined ||
        source.perStudentFee !== undefined ||
        source.extraStudentFee !== undefined ||
        source.headcountFee !== undefined ||
        source.minStudents !== undefined ||
        source.minimumStudents !== undefined ||
        source.includedStudents !== undefined
      ) {
        return "class_headcount";
      }
      if (source.fixedFee !== undefined) return "fixed";
      if (source.hourlyRate !== undefined || source.rate !== undefined) return "hourly";
      return null;
    };

    const enforceAiFeeModeMatchesCourseType = (
      data: Record<string, unknown>,
      type: CourseType,
      courseLabel: string
    ): boolean => {
      const requestedMode = aiDataFeeMode(data);
      if (!requestedMode) return true;
      const templateMode = defaultFeeRuleForVaultCourseType(nextVault, type).mode;
      if (requestedMode === templateMode) return true;
      blockers.push(
        `未写入课程「${courseLabel}」：AI 试图把班型「${courseTypeLabel(nextVault, type)}」从「${feeModeLabel(templateMode)}」改成「${feeModeLabel(requestedMode)}」。课程档案需沿用后台班型计费模式；请先在后台修改班型计费，或改选按人数计费的班型。`
      );
      return false;
    };

    const needsClassFeeConfirmation = (
      data: Record<string, unknown>,
      type: CourseType,
      studentCount: number,
      fallback?: FeeRule,
      forceCheck = false
    ): string | null => {
      const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
      const templateRule = fallback ?? defaultFeeRuleForVaultCourseType(nextVault, type);
      const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
      const hasExplicitClassFeeSignal =
        mode === "class_headcount" ||
        mode === "class" ||
        source.baseFee !== undefined ||
        source.classBaseFee !== undefined ||
        source.minimumFee !== undefined ||
        source.perPresentStudentFee !== undefined ||
        source.perStudentFee !== undefined ||
        source.extraStudentFee !== undefined ||
        source.headcountFee !== undefined ||
        source.minStudents !== undefined ||
        source.minimumStudents !== undefined ||
        source.includedStudents !== undefined;
      const hasClassFeeSignal =
        forceCheck ||
        templateRule.mode === "class_headcount" ||
        hasExplicitClassFeeSignal;
      if (!hasClassFeeSignal) return null;

      const explicitDefault = Boolean(
        source.useDefaultFeeRule ??
        source.useDefaultClassFee ??
        source.useTemplateFeeRule ??
        source.useExistingFeeRule ??
        source.keepFeeRule
      );
      if (explicitDefault) return null;

      const hasMinStudents = source.minStudents !== undefined || source.minimumStudents !== undefined || source.includedStudents !== undefined;
      const hasBaseFee = source.baseFee !== undefined || source.classBaseFee !== undefined || source.minimumFee !== undefined;
      const hasPerStudentFee =
        source.perPresentStudentFee !== undefined ||
        source.perStudentFee !== undefined ||
        source.extraStudentFee !== undefined ||
        source.headcountFee !== undefined;
      if (!hasMinStudents || !hasBaseFee || !hasPerStudentFee) {
        return "班课/多人课需要先确认计费规则：最少人数、基础费用、每增加1人费用。最少人数不是当前关联学生人数，通常从 1 人起。";
      }

      const minStudents = numberValue(source.minStudents ?? source.minimumStudents ?? source.includedStudents);
      if (studentCount > 1 && minStudents === studentCount) {
        return `当前关联 ${studentCount} 人，但最少人数通常不是关联人数。请确认最少人数是否为 ${studentCount}，还是 1，并同时确认基础费用和每增加1人费用。`;
      }
      return null;
    };

    const ensureCourse = (data: Record<string, unknown>): CourseGroup | null => {
      const requestedId = stringValue(data.courseId ?? data.id);
      const existingById = requestedId ? nextVault.courseGroups.find((course) => course.id === requestedId) : undefined;
      if (existingById) return existingById;
      const name = stringValue(data.name ?? data.courseName);
      if (!name) return null;
      const normalizedName = name.toLowerCase();
      const existingByName = nextVault.courseGroups.find((course) =>
        course.name.trim().toLowerCase() === normalizedName && courseMatchesData(course, data)
      );
      if (existingByName) return existingByName;
      const type = normalizeAiCourseType(data.type, nextVault);
      const subject = stringValue(data.subject) || "语文";
      const campus = campusByName(data.campus);
      const studentIds = studentIdsFromAiData(data);
      if (!enforceAiFeeModeMatchesCourseType(data, type, name)) return null;
      const feeConfirmation = needsClassFeeConfirmation(data, type, studentIds.length, undefined, defaultFeeRuleForVaultCourseType(nextVault, type).mode === "class_headcount");
      if (feeConfirmation) {
        blockers.push(`未新增课程「${name}」：${feeConfirmation}`);
        return null;
      }
      const feeRule = feeRuleFromAiData(data, nextVault, type);
      const course: CourseGroup = {
        id: makeId("course"),
        name,
        type,
        subject,
        defaultCampusId: campus?.id,
        studentIds,
        feeRule,
        note: stringValue(data.note) || undefined,
        status: "active"
      };
      nextVault.courseGroups.push(course);
      messages.push(`新增课程「${course.name}」`);
      return course;
    };

    const updateCourseFromAi = (data: Record<string, unknown>): CourseGroup | null => {
      const course = courseByIdOrName(data.courseId ?? data.id ?? data.name ?? data.courseName);
      if (!course) return null;
      const previousType = course.type;
      const nextType = data.type === undefined || data.type === null || data.type === "" ? course.type : normalizeAiCourseType(data.type, nextVault);
      const nextStudentIds = studentIdsFromAiData(data);
      const campus = data.campus === undefined ? undefined : campusByName(data.campus);
      if (!enforceAiFeeModeMatchesCourseType(data, nextType, course.name)) return null;
      const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
      const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
      const hasFeeEdit =
        mode === "class_headcount" ||
        mode === "class" ||
        source.baseFee !== undefined ||
        source.classBaseFee !== undefined ||
        source.minimumFee !== undefined ||
        source.perPresentStudentFee !== undefined ||
        source.perStudentFee !== undefined ||
        source.extraStudentFee !== undefined ||
        source.headcountFee !== undefined ||
        source.minStudents !== undefined ||
        source.minimumStudents !== undefined ||
        source.includedStudents !== undefined;
      const feeConfirmation = needsClassFeeConfirmation(
        data,
        nextType,
        nextStudentIds.length > 0 ? nextStudentIds.length : course.studentIds.length,
        nextType !== previousType ? undefined : course.feeRule,
        nextType !== previousType || hasFeeEdit
      );
      if (feeConfirmation) {
        blockers.push(`未更新课程「${course.name}」：${feeConfirmation}`);
        return null;
      }
      const nextFeeRule = feeRuleFromAiData(data, nextVault, nextType, nextType !== previousType ? undefined : course.feeRule);
      const nextCourse: CourseGroup = {
        ...course,
        name: stringValue(data.newName ?? data.name ?? data.courseName) || course.name,
        subject: stringValue(data.subject) || course.subject,
        type: nextType,
        defaultCampusId: data.campus === undefined ? course.defaultCampusId : campus?.id,
        studentIds: nextStudentIds.length > 0 ? nextStudentIds : course.studentIds,
        feeRule: nextFeeRule,
        note: data.note === undefined ? course.note : stringValue(data.note) || undefined,
        status: data.status === "paused" ? "paused" : data.status === "active" ? "active" : course.status
      };
      nextVault.courseGroups = nextVault.courseGroups.map((item) => (item.id === course.id ? nextCourse : item));
      if (courseUpdateAffectsLessonDefaults(course, nextCourse)) {
        const scope = normalizeCourseLessonSyncScope(data.lessonUpdateScope ?? data.applyToLessons ?? data.updateLessons);
        const syncedCount = syncLessonsWithCourseDefaults(nextVault, nextCourse, scope);
        if (syncedCount > 0) {
          messages.push(`已按新课程规则同步 ${syncedCount} 节未完成排课`);
        }
      }
      messages.push(`已更新课程「${nextCourse.name}」`);
      return nextCourse;
    };

    const updateStudentFromAi = (data: Record<string, unknown>): Student | null => {
      const requestedId = stringValue(data.studentId ?? data.id);
      const currentName = stringValue(data.studentName ?? data.currentName ?? data.oldName ?? data.fromName ?? data.sourceStudentName ?? data.sourceName);
      const hasOtherFields =
        data.grade !== undefined ||
        data.school !== undefined ||
        data.campus !== undefined ||
        data.defaultCampusId !== undefined ||
        data.note !== undefined ||
        data.status !== undefined ||
        data.temporaryTrial !== undefined ||
        data.newName !== undefined ||
        data.newStudentName !== undefined ||
        data.targetName !== undefined;
      const lookupName = currentName || (!requestedId && hasOtherFields ? stringValue(data.name) : "");
      const student = requestedId
        ? nextVault.students.find((item) => item.id === requestedId)
        : lookupName
          ? studentByName(lookupName)
          : undefined;
      if (!student) return null;

      const previousName = student.name;
      const updates: string[] = [];
      let renamed = false;
      const nextName = stringValue(data.newName ?? data.newStudentName ?? data.targetName ?? ((requestedId || currentName) ? data.name : ""));
      if (nextName.trim() && nextName.trim() !== student.name.trim()) {
        student.name = nextName.trim();
        renamed = true;
        updates.push(`姓名改为「${student.name}」`);
      }
      if (data.grade !== undefined) {
        const grade = stringValue(data.grade);
        student.grade = grade || undefined;
        updates.push(student.grade ? `年级改为「${student.grade}」` : "年级已清空");
      }
      if (data.school !== undefined) {
        const school = stringValue(data.school);
        student.school = school || undefined;
        updates.push(student.school ? `学校改为「${student.school}」` : "学校已清空");
      }
      if (data.campus !== undefined || data.defaultCampusId !== undefined) {
        const campus = campusByName(data.campus ?? data.defaultCampusId);
        student.defaultCampusId = campus?.id;
        updates.push(student.defaultCampusId ? `默认校区改为「${campus?.name ?? student.defaultCampusId}」` : "默认校区已清空");
      }
      if (data.note !== undefined) {
        const note = stringValue(data.note);
        student.note = note || undefined;
        updates.push(student.note ? "备注已更新" : "备注已清空");
      }
      if (data.status !== undefined) {
        const status = normalizeAiStudentStatus(data.status);
        if (status) {
          student.status = status;
          updates.push(status === "active" ? "状态改为在读" : status === "transition" ? "状态改为过渡期" : "状态改为归档");
        }
      }
      if (data.temporaryTrial !== undefined) {
        const previousTrial = Boolean(student.temporaryTrial);
        const nextTrial = Boolean(data.temporaryTrial);
        if (previousTrial !== nextTrial) {
          materializeStudentTrialStatusOnLessons(nextVault, student.id, previousTrial);
        }
        student.temporaryTrial = Boolean(data.temporaryTrial);
        updates.push(student.temporaryTrial ? "已标记试听" : "已取消试听标记");
        if (previousTrial !== nextTrial) {
          const syncedCount = syncFutureLessonsWithStudentTrialStatus(nextVault, student.id, nextTrial);
          if (syncedCount > 0) {
            updates.push(`已同步 ${syncedCount} 节未来未上课程`);
          }
        }
      }
      if (updates.length === 0) return null;

      if (renamed && updates.length === 1) {
        messages.push(`已将学生「${previousName}」改名为「${student.name}」`);
      } else {
        messages.push(`已更新学生「${renamed ? previousName : student.name}」：${updates.join("；")}`);
      }
      return student;
    };

    const deleteOrPauseCourseFromAi = (data: Record<string, unknown>) => {
      const course = courseByIdOrName(data.courseId ?? data.id ?? data.name ?? data.courseName);
      if (!course) return;
      const inUse = nextVault.lessons.some((lesson) => lesson.courseGroupId === course.id);
      const mode = stringValue(data.mode ?? data.deleteMode ?? data.action).toLowerCase();
      const force = Boolean(data.forceDelete ?? data.force);
      if (mode === "pause" || mode === "paused" || mode === "archive" || mode === "归档" || mode === "暂停") {
        nextVault.courseGroups = nextVault.courseGroups.map((item) =>
          item.id === course.id ? { ...item, status: "paused" } : item
        );
        messages.push(`已暂停课程「${course.name}」`);
        return;
      }
      if (inUse && mode !== "force_delete" && !force) {
        nextVault.courseGroups = nextVault.courseGroups.map((item) =>
          item.id === course.id ? { ...item, status: "paused" } : item
        );
        messages.push(`课程「${course.name}」已有课时引用，已改为暂停`);
        return;
      }
      nextVault.courseGroups = nextVault.courseGroups.filter((item) => item.id !== course.id);
      moveLessonsToTrash(
        nextVault,
        nextVault.lessons.filter((lesson) => lesson.courseGroupId === course.id),
        "ai",
        `AI 强制删除课程「${course.name}」连带课节`
      );
      messages.push(`已删除课程「${course.name}」${inUse ? "及其课时" : ""}`);
    };

    const migrateCourseFromAi = (data: Record<string, unknown>) => {
      const source = courseByIdOrName(data.sourceCourseId ?? data.fromCourseId ?? data.courseId ?? data.id ?? data.sourceCourseName ?? data.courseName);
      if (!source) return;
      const target = courseByIdOrName(data.targetCourseId ?? data.toCourseId ?? data.targetCourseName)
        ?? ensureCourse({
          ...data,
          courseId: undefined,
          id: undefined,
          name: data.targetCourseName ?? data.newCourseName ?? data.newName ?? data.name ?? source.name,
          courseName: data.targetCourseName ?? data.newCourseName ?? data.newName ?? data.name ?? source.name,
          type: data.targetType ?? data.type ?? source.type,
          subject: data.subject ?? source.subject,
          campus: data.campus,
          students: data.students ?? data.studentNames ?? source.studentIds.map((studentId) => nextVault.students.find((student) => student.id === studentId)?.name).filter(Boolean)
        });
      if (!target) return;
      const migrateLessons = data.migrateLessons !== false && data.moveLessons !== false;
      const effectiveFrom = stringValue(data.effectiveFrom ?? data.fromDate);
      const effectiveTo = stringValue(data.effectiveTo ?? data.toDate);
      const studentIds = studentIdsFromAiData(data);
      const nextTargetStudentIds = Array.from(new Set([...target.studentIds, ...(studentIds.length > 0 ? studentIds : source.studentIds)]));
      Object.assign(target, {
        status: "active",
        studentIds: nextTargetStudentIds
      });
      if (migrateLessons) {
        let migratedCount = 0;
        nextVault.lessons = nextVault.lessons.map((lesson) => {
          if (lesson.courseGroupId !== source.id) return lesson;
          if (effectiveFrom && lesson.date < effectiveFrom) return lesson;
          if (effectiveTo && lesson.date > effectiveTo) return lesson;
          migratedCount += 1;
          return recalculateLessonFeeSnapshot(nextVault, {
            ...lesson,
            courseGroupId: target.id,
            type: target.type,
            campusId: target.defaultCampusId ?? lesson.campusId,
            expectedStudentIds: lesson.expectedStudentIds.length > 0 ? lesson.expectedStudentIds : nextTargetStudentIds
          });
        });
        messages.push(`已迁移 ${migratedCount} 节课到课程「${target.name}」`);
      }
      if (data.pauseSource !== false) {
        nextVault.courseGroups = nextVault.courseGroups.map((course) =>
          course.id === source.id ? { ...course, status: "paused" } : course
        );
      }
    };

    const deleteLessonFromAi = (data: Record<string, unknown>) => {
      const lessonIds = Array.from(new Set([
        ...arrayValueLocal(data.lessonIds).map(stringValue),
        stringValue(data.lessonId ?? data.id)
      ].filter(Boolean)));
      const lessonIdSet = new Set(lessonIds);
      const lessonDates = dateListFromAi(data.dates, data.date, data.dateStart ?? data.startDate ?? data.fromDate, data.dateEnd ?? data.endDate ?? data.toDate);
      const lessonDateSet = new Set(lessonDates);
      const startTime = stringValue(data.startTime);
      const endTime = stringValue(data.endTime);
      const courseName = stringValue(data.courseName ?? data.name);
      const subject = stringValue(data.subject);
      const courseId = stringValue(data.courseId);
      const deleteScheduledOnly = data.scheduledOnly !== false && data.includeCompleted !== true && data.deleteCompleted !== true;
      const hasDateRange = lessonDates.length > 0;
      const hasSpecificTime = Boolean(startTime || endTime);
      const hasCourseFilter = Boolean(courseId || courseName || subject);
      const hasSpecificIds = lessonIds.length > 0;
      if (!hasSpecificIds && !hasDateRange) {
        blockers.push("删除课节缺少明确日期或课节ID，已拒绝执行，避免误删历史课程。");
        return;
      }
      const matchedLessons = nextVault.lessons.filter((lesson) => {
        if (hasSpecificIds && !lessonIdSet.has(lesson.id)) return false;
        if (hasDateRange && !lessonDateSet.has(lesson.date)) return false;
        if (deleteScheduledOnly && lesson.status !== "scheduled" && lesson.status !== "draft" && lesson.status !== "makeup_pending") return false;
        if (courseId && lesson.courseGroupId !== courseId) return false;
        if (startTime && lesson.startTime !== startTime) return false;
        if (endTime && lesson.endTime !== endTime) return false;
        if (!courseName && !subject) return true;
        const course = nextVault.courseGroups.find((item) => item.id === lesson.courseGroupId);
        if (!course) return false;
        if (courseName && course.name.trim().toLowerCase() !== courseName.toLowerCase()) return false;
        if (subject && course.subject.trim().toLowerCase() !== subject.toLowerCase()) return false;
        return true;
      });
      if (matchedLessons.length === 0) {
        blockers.push(`没有找到符合${hasDateRange ? ` ${lessonDates[0]}${lessonDates.length > 1 ? ` 至 ${lessonDates.at(-1)}` : ""}` : ""} 条件的待上课课节。`);
        return;
      }
      if (!hasDateRange && !hasSpecificIds && matchedLessons.length > 1) {
        blockers.push(`删除课节匹配到 ${matchedLessons.length} 节，但缺少明确日期或课节ID，已拒绝执行。`);
        return;
      }
      if (!hasSpecificIds && !hasSpecificTime && !hasCourseFilter && matchedLessons.length > 80) {
        blockers.push(`删除课节将影响 ${matchedLessons.length} 节，范围过大，已拒绝执行。请缩小日期范围或指定课程。`);
        return;
      }
      moveLessonsToTrash(nextVault, matchedLessons, "ai", "AI 删除课节");
      const preview = matchedLessons
        .slice(0, 12)
        .map((lesson) => `「${lesson.date} ${lesson.startTime}-${lesson.endTime} · ${nextVault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.name ?? "未知课程"}」`);
      messages.push(`已将 ${matchedLessons.length} 节课移入回收站${hasDateRange ? `（${lessonDates[0]}${lessonDates.length > 1 ? ` 至 ${lessonDates.at(-1)}` : ""}）` : ""}${preview.length > 0 ? `：${preview.join("；")}${matchedLessons.length > preview.length ? `；另 ${matchedLessons.length - preview.length} 节` : ""}` : ""}`);
    };

    const addStudentsToCourse = (course: CourseGroup, studentIds: string[]) => {
      if (studentIds.length === 0) return;
      const nextIds = Array.from(new Set([...course.studentIds, ...studentIds]));
      if (nextIds.length === course.studentIds.length) return;
      course.studentIds = nextIds;
      messages.push(`已将学生加入课程「${course.name}」`);
    };

    const addStudentsToLessons = (lessonIds: string[], studentIds: string[]) => {
      if (lessonIds.length === 0 || studentIds.length === 0) return;
      let changedCount = 0;
      nextVault.lessons = nextVault.lessons.map((lesson) => {
        if (!lessonIds.includes(lesson.id)) return lesson;
        const expectedStudentIds = Array.from(new Set([...lesson.expectedStudentIds, ...studentIds]));
        const attendanceStudentIds = new Set(lesson.attendance.map((entry) => entry.studentId));
        const attendance = [
          ...lesson.attendance,
          ...studentIds
            .filter((studentId) => !attendanceStudentIds.has(studentId))
            .map((studentId) => ({ studentId, status: "attended" as const }))
        ];
        changedCount += 1;
        return recalculateLessonFeeSnapshot(nextVault, {
          ...lesson,
          expectedStudentIds,
          attendance
        });
      });
      if (changedCount > 0) {
        messages.push(`已更新 ${changedCount} 节课的关联学生`);
      }
    };

    const normalizeAiDate = (value: unknown): string | null => {
      const raw = stringValue(value).replace(/[./]/g, "-");
      const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!match) return null;
      const normalized = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
      return datesBetween(normalized, normalized)[0] === normalized ? normalized : null;
    };

    const normalizeAiTime = (value: unknown): string | null => {
      return normalizeTimeText(stringValue(value));
    };

    const createScheduledLessonsFromAi = (
      lessonItems: Array<Record<string, unknown>>,
      defaults: Record<string, unknown>,
      defaultCourse: CourseGroup | null
    ) => {
      if (lessonItems.length === 0) return;
      let createdCount = 0;
      const skippedReasons: string[] = [];
      const createdByCourse = new Map<string, number>();
      const fallbackStartTime = normalizeAiTime(defaults.startTime) ?? "19:00";
      const fallbackEndTime = normalizeAiTime(defaults.endTime) ?? "21:00";

      lessonItems.forEach((item, index) => {
        const merged = { ...defaults, ...item };
        const course =
          courseByIdOrName(merged.courseId ?? merged.courseGroupId ?? merged.courseName ?? merged.name) ??
          defaultCourse ??
          ensureCourse({ ...merged, lessons: undefined });
        const requestedLabel = `第 ${index + 1} 节`;
        if (!course) {
          skippedReasons.push(`${requestedLabel}缺少可匹配课程`);
          return;
        }

        const date = normalizeAiDate(merged.date);
        if (!date) {
          skippedReasons.push(`${requestedLabel}（${course.name}）日期无效`);
          return;
        }
        const startTime = merged.startTime === undefined ? fallbackStartTime : normalizeAiTime(merged.startTime);
        const endTime = merged.endTime === undefined ? fallbackEndTime : normalizeAiTime(merged.endTime);
        if (!startTime || !endTime || timeToMinutes(startTime) >= timeToMinutes(endTime)) {
          skippedReasons.push(`${date} ${course.name} 时间无效`);
          return;
        }

        const duplicate = nextVault.lessons.some((lesson) =>
          lesson.status !== "cancelled" &&
          lesson.courseGroupId === course.id &&
          lesson.date === date &&
          lesson.startTime === startTime &&
          lesson.endTime === endTime
        );
        if (duplicate) {
          skippedReasons.push(`${date} ${startTime}-${endTime}「${course.name}」已存在`);
          return;
        }

        const conflict = nextVault.lessons.find((lesson) =>
          lesson.status !== "cancelled" &&
          lesson.date === date &&
          timesOverlap(lesson.startTime, lesson.endTime, startTime, endTime)
        );
        if (conflict) {
          const conflictCourse = nextVault.courseGroups.find((courseItem) => courseItem.id === conflict.courseGroupId);
          skippedReasons.push(`${date} ${startTime}-${endTime}「${course.name}」与「${conflictCourse?.name ?? "未知课程"} ${conflict.startTime}-${conflict.endTime}」冲突`);
          return;
        }

        const campus = campusByName(merged.campus ?? merged.campusName);
        nextVault.lessons.push(createLessonFromCourse(nextVault, course, {
          date,
          startTime,
          endTime,
          campusId: campus?.id ?? course.defaultCampusId,
          status: "scheduled"
        }));
        createdCount += 1;
        createdByCourse.set(course.name, (createdByCourse.get(course.name) ?? 0) + 1);
      });

      if (createdCount > 0) {
        const courseSummary = Array.from(createdByCourse.entries())
          .map(([name, count]) => `${name} ${count} 节`)
          .join("、");
        messages.push(`已新增 ${createdCount} 节排课${courseSummary ? `：${courseSummary}` : ""}`);
        if (skippedReasons.length > 0) {
          messages.push(`另有 ${skippedReasons.length} 节未新增：${skippedReasons.slice(0, 6).join("；")}${skippedReasons.length > 6 ? `；另 ${skippedReasons.length - 6} 节` : ""}`);
        }
        return;
      }

      if (skippedReasons.length > 0) {
        blockers.push(`AI 排课建议已识别，但没有新增课节：${skippedReasons.slice(0, 8).join("；")}${skippedReasons.length > 8 ? `；另 ${skippedReasons.length - 8} 节` : ""}`);
      }
    };

    const createLessonsForCourse = (course: CourseGroup, data: Record<string, unknown>) => {
      const dates = arrayValueLocal(data.dates).map(normalizeAiDate).filter((date): date is string => Boolean(date));
      const singleDate = normalizeAiDate(data.date);
      if (singleDate) dates.push(singleDate);
      const lessonItems = arrayValueLocal(data.lessons).filter(isPlainRecordLocal);
      const lessonRequests = lessonItems.length > 0
        ? lessonItems
        : Array.from(new Set(dates)).map((date) => ({ date }));
      createScheduledLessonsFromAi(lessonRequests, data, course);
    };

    const falseyAiValue = (value: unknown): boolean => {
      if (value === false) return true;
      const normalized = stringValue(value).toLowerCase();
      return normalized === "false" || normalized === "no" || normalized === "0" || normalized === "不包含" || normalized === "不包括" || normalized === "排除";
    };

    const dateListFromAi = (listValue: unknown, singleValue: unknown, startValue: unknown, endValue: unknown): string[] => {
      const explicitDates = arrayValueLocal(listValue).map(stringValue).filter(Boolean);
      if (explicitDates.length > 0) return explicitDates;
      const singleDate = stringValue(singleValue);
      if (singleDate) return [singleDate];
      const startDate = stringValue(startValue);
      const endDate = stringValue(endValue);
      if (startDate && endDate) return datesBetween(startDate, endDate);
      return startDate ? [startDate] : [];
    };

    const applyScheduleSyncFromAi = (data: Record<string, unknown>): boolean => {
      const sourceLessonIds = Array.from(new Set([
        ...arrayValueLocal(data.lessonIds ?? data.sourceLessonIds).map(stringValue),
        stringValue(data.lessonId ?? data.sourceLessonId)
      ].filter(Boolean)));
      const sourceLessonIdSet = new Set(sourceLessonIds);
      const sourceDates = dateListFromAi(
        data.sourceDates,
        data.sourceDate,
        data.sourceDateStart ?? data.sourceStartDate,
        data.sourceDateEnd ?? data.sourceEndDate
      );
      const targetDates = dateListFromAi(
        data.targetDates,
        data.targetDate,
        data.targetDateStart ?? data.targetStartDate,
        data.targetDateEnd ?? data.targetEndDate
      );
      const hasScheduleSyncShape =
        sourceDates.length > 0 ||
        targetDates.length > 0 ||
        stringValue(data.sourceDateStart ?? data.sourceStartDate ?? data.sourceDateEnd ?? data.sourceEndDate) ||
        stringValue(data.targetDateStart ?? data.targetStartDate ?? data.targetDateEnd ?? data.targetEndDate);
      if (!hasScheduleSyncShape) return false;

      if (targetDates.length === 0) {
        blockers.push("同步课节缺少目标日期。");
        return true;
      }

      const includeCancelled = !falseyAiValue(data.includeCancelled ?? data.copyCancelled ?? data.cancelledLessons);
      const sourceSnapshot = [...nextVault.lessons];
      const emptySourceDates: string[] = [];

      const buildSyncBatch = (sourceLessons: Lesson[], targetDate: string, targetStartDate: string) => {
        const filteredSourceLessons = sourceLessons.filter((lesson) => includeCancelled || lesson.status !== "cancelled");
        return filteredSourceLessons.length > 0
          ? buildScheduleSyncLessonsForDate(nextVault, filteredSourceLessons, targetDate, targetStartDate)
          : { lessons: [], replaceLessonIds: [], skippedCount: 0, conflictSkippedCount: 0 };
      };

      const syncBuilds: Array<ReturnType<typeof buildScheduleSyncLessonsForDate>> = [];

      if (sourceDates.length === 0 && sourceLessonIds.length > 0) {
        if (targetDates.length !== 1) {
          blockers.push("按课节同步时，请只提供一个目标日期。");
          return true;
        }
        const selectedSourceLessons = sourceSnapshot.filter((lesson) => sourceLessonIdSet.has(lesson.id));
        syncBuilds.push(buildSyncBatch(selectedSourceLessons, targetDates[0], targetDates[0]));
      } else {
        if (sourceDates.length === 0) {
          blockers.push("同步课节缺少来源日期。");
          return true;
        }
        if (sourceDates.length !== targetDates.length) {
          blockers.push("同步课节的来源日期和目标日期数量不一致，请重新生成建议。");
          return true;
        }
        const targetStartDate = targetDates[0];
        sourceDates.forEach((sourceDate, index) => {
          const sourceLessons = sourceSnapshot.filter((lesson) =>
            lesson.date === sourceDate &&
            (sourceLessonIdSet.size === 0 || sourceLessonIdSet.has(lesson.id))
          );
          if (sourceLessons.length === 0) {
            emptySourceDates.push(sourceDate);
            return;
          }
          syncBuilds.push(buildSyncBatch(sourceLessons, targetDates[index], targetStartDate));
        });
      }

      const replaceLessonIds = Array.from(new Set(syncBuilds.flatMap((build) => build.replaceLessonIds)));
      const lessonsToAdd = linkSyncedLessonsToPreviousLessons(
        nextVault,
        syncBuilds.flatMap((build) => build.lessons),
        replaceLessonIds
      );
      const skippedCount = syncBuilds.reduce((sum, build) => sum + build.skippedCount, 0);
      const conflictSkippedCount = syncBuilds.reduce((sum, build) => sum + build.conflictSkippedCount, 0);
      const syncedCount = lessonsToAdd.length;
      const replacedCount = replaceLessonIds.length;

      if (syncedCount === 0) {
        blockers.push(
          conflictSkippedCount > 0
            ? "目标时间已有其他课程，已跳过同步，未覆盖原有手动排课。"
            : skippedCount > 0
              ? "来源课程已暂停或缺失，未同步课节。"
              : "没有找到可同步的来源课节。"
        );
        return true;
      }

      if (replaceLessonIds.length > 0) {
        const replaceLessonIdSet = new Set(replaceLessonIds);
        moveLessonsToTrash(
          nextVault,
          nextVault.lessons.filter((lesson) => replaceLessonIdSet.has(lesson.id)),
          "sync_overwrite",
          "AI 同步排课覆盖旧课节"
        );
      }
      nextVault.lessons.push(...lessonsToAdd);

      const sourceLabel = sourceDates.length > 1
        ? `${sourceDates[0]} 至 ${sourceDates[sourceDates.length - 1]}`
        : sourceDates[0] ?? `${sourceLessonIds.length} 个来源课节`;
      const targetLabel = targetDates.length > 1
        ? `${targetDates[0]} 至 ${targetDates[targetDates.length - 1]}`
        : targetDates[0];
      messages.push(
        `已同步 ${syncedCount} 节课：${sourceLabel} 到 ${targetLabel}${replacedCount > 0 ? `，覆盖 ${replacedCount} 节已有课节` : ""}${skippedCount > 0 ? `，${skippedCount} 节来源课程已暂停未同步` : ""}${emptySourceDates.length > 0 ? `，${emptySourceDates.length} 个来源日期没有课节` : ""}`
        + `${conflictSkippedCount > 0 ? `，${conflictSkippedCount} 节目标时间已有其他课程已跳过` : ""}`
      );
      return true;
    };

    actions.forEach((action) => {
      const type = stringValue(action.type ?? action.action);
      const data = isPlainRecordLocal(action.data) ? action.data : action;
      if (type === "create_student") {
        ensureStudent(data);
        return;
      }
      if (type === "update_student" || type === "modify_student" || type === "rename_student") {
        updateStudentFromAi(data);
        return;
      }
      if (type === "create_course_type" || type === "create_custom_course_type") {
        createCourseTypeFromAi(data);
        return;
      }
      if (type === "create_course") {
        ensureCourse(data);
        return;
      }
      if (type === "update_course" || type === "modify_course") {
        updateCourseFromAi(data);
        return;
      }
      if (type === "delete_course" || type === "pause_course") {
        deleteOrPauseCourseFromAi(type === "pause_course" ? { ...data, mode: "pause" } : data);
        return;
      }
      if (type === "migrate_course" || type === "move_course_lessons") {
        migrateCourseFromAi(data);
        return;
      }
      if (type === "delete_lesson" || type === "remove_lesson" || type === "cancel_lesson") {
        deleteLessonFromAi(data);
        return;
      }
      if (type === "schedule_lessons") {
        const lessonItems = arrayValueLocal(data.lessons).filter(isPlainRecordLocal);
        if (lessonItems.length > 0) {
          const course = courseByIdOrName(data.courseId ?? data.courseGroupId ?? data.courseName ?? data.name) ?? null;
          createScheduledLessonsFromAi(lessonItems, data, course);
          return;
        }
        const course = ensureCourse(data);
        if (course) createLessonsForCourse(course, data);
        return;
      }
      if (type === "sync_lessons") {
        if (applyScheduleSyncFromAi(data)) return;
        const lessonIds = Array.from(new Set([
          ...arrayValueLocal(data.lessonIds).map(stringValue),
          stringValue(data.lessonId)
        ].filter(Boolean)));
        const studentIds = studentIdsFromAiData(data);
        addStudentsToLessons(lessonIds, studentIds);
        const affectedCourseIds = Array.from(new Set(
          nextVault.lessons.filter((lesson) => lessonIds.includes(lesson.id)).map((lesson) => lesson.courseGroupId)
        ));
        affectedCourseIds.forEach((courseId) => {
          const course = nextVault.courseGroups.find((item) => item.id === courseId);
          if (course) addStudentsToCourse(course, studentIds);
        });
      }
    });

    if (blockers.length > 0) {
      return { ok: false, message: blockers.join("；") };
    }

    if (messages.length === 0) {
      return { ok: false, message: "AI 建议没有被识别为可写入内容，请补充信息后重新生成。" };
    }

    return { ok: true, message: `AI 建议已写入：${messages.join("；")}`, vault: nextVault };
  }

function feeModeLabel(mode: FeeRule["mode"]): string {
  if (mode === "salary_grade") return "课时费等级计费";
  if (mode === "class_headcount") return "按人数班课计费";
  if (mode === "fixed") return "按单节固定计费";
  return "按小时计费";
}

function defaultFeeRuleForVaultCourseType(vault: TeacherVault, type: CourseType): FeeRule {
  if (type !== "trial") {
    return {
      mode: "salary_grade",
      salaryGradeSource: "teacher_default",
      salaryGradeId: vault.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(vault).id
    };
  }
  return feeRuleForCourseType(vault, type);
}

function defaultFeeRuleForCustomTemplate(
  vault: TeacherVault,
  template: "class" | "non_class" | "hourly"
): FeeRule {
  if (template === "hourly") {
    return { mode: "hourly", hourlyRate: 0 };
  }
  const defaultGradeRule = salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault) ?? defaultSalaryGradeRule(vault);
  const juniorRate = salaryGradeRateForStage(defaultGradeRule, "junior_3");
  const minStudents = template === "class" ? 5 : 1;
  const baseFee = template === "class" ? juniorRate.classBaseFee : juniorRate.oneOnOneFee;
  const tier = {
    id: "tier_1_plus",
    minStudents: Math.max(Math.round(minStudents), 0),
    baseFee: Math.max(baseFee, 0),
    perStudentFee: Math.max(juniorRate.headcountIncrementFee, 0)
  };
  return {
    mode: "class_headcount",
    baseFee: tier.baseFee,
    perPresentStudentFee: tier.perStudentFee,
    classFeeTiers: [tier],
    stageRates: defaultGradeRule.stageRates,
    makeupFeeMode: "perStudentFee"
  };
}

function feeRuleFromAiData(data: Record<string, unknown>, vault: TeacherVault, type: CourseType, fallback?: FeeRule): FeeRule {
  const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
  const courseTypeRule = defaultFeeRuleForVaultCourseType(vault, type);
  const templateRule = fallback?.mode === courseTypeRule.mode ? fallback : courseTypeRule;
  const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
  const salaryGradeId = stringValue(source.salaryGradeId ?? source.gradeId ?? source.positionGradeId);
  if (mode === "salary_grade" || mode === "salary" || mode === "岗位薪资" || mode === "岗位薪资等级" || mode === "课时费等级") {
    return {
      mode: "salary_grade",
      salaryGradeSource: salaryGradeId ? "specific" : "teacher_default",
      salaryGradeId: (salaryGradeId || vault.profile.defaultSalaryGradeId) as SalaryGradeId | undefined
    };
  }
  const baseFee = numberValue(source.baseFee ?? source.classBaseFee ?? source.minimumFee);
  const perStudentFee = numberValue(source.perPresentStudentFee ?? source.perStudentFee ?? source.extraStudentFee ?? source.headcountFee);
  const minStudents = numberValue(source.minStudents ?? source.minimumStudents ?? source.includedStudents);
  const hourlyRate = numberValue(source.hourlyRate ?? source.rate);
  const fixedFee = numberValue(source.fixedFee);

  if (templateRule.mode === "class_headcount") {
    const tier = normalizedSingleClassFeeTier(templateRule);
    const nextTier = {
      id: tier.id,
      minStudents: Math.max(Math.round(minStudents ?? tier.minStudents ?? 1), 0),
      baseFee: Math.max(baseFee ?? tier.baseFee ?? 0, 0),
      perStudentFee: Math.max(perStudentFee ?? tier.perStudentFee ?? 0, 0)
    };
    return {
      ...templateRule,
      mode: "class_headcount",
      baseFee: nextTier.baseFee,
      perPresentStudentFee: nextTier.perStudentFee,
      classFeeTiers: [nextTier],
      makeupFeeMode: templateRule.makeupFeeMode ?? "perStudentFee"
    };
  }

  if (templateRule.mode === "fixed") {
    return {
      mode: "fixed",
      fixedFee: Math.max(fixedFee ?? templateRule.fixedFee ?? 0, 0)
    };
  }

  return {
    mode: "hourly",
    hourlyRate: Math.max(hourlyRate ?? templateRule.hourlyRate ?? 0, 0)
  };
}

function normalizedSingleClassFeeTier(rule: FeeRule): ClassFeeTier {
  const explicit = (rule.classFeeTiers ?? []).filter((tier) => Number.isFinite(tier.minStudents));
  const tier = explicit.length > 0
    ? [...explicit].sort((a, b) => a.minStudents - b.minStudents)[0]
    : {
        id: "tier_1_plus",
        minStudents: 1,
        baseFee: rule.baseFee ?? 0,
        perStudentFee: rule.perPresentStudentFee ?? 0
      };
  return {
    id: tier.id || "tier_1_plus",
    minStudents: tier.minStudents,
    baseFee: tier.baseFee,
    perStudentFee: tier.perStudentFee
  };
}

function normalizeAiStudentStatus(value: unknown): "active" | "transition" | "paused" | undefined {
  const normalized = stringValue(value).toLowerCase();
  if (normalized === "active" || normalized === "在读" || normalized === "正常") return "active";
  if (normalized === "transition" || normalized === "pending" || normalized === "过渡" || normalized === "过渡期" || normalized === "待定" || normalized === "升学") return "transition";
  if (normalized === "paused" || normalized === "archived" || normalized === "归档" || normalized === "已归档" || normalized === "暂停") return "paused";
  return undefined;
}
function normalizeAiCourseType(value: unknown, vault: TeacherVault | null = null): CourseType {
  const normalized = stringValue(value).toLowerCase();
  if (normalized === "one_on_one" || normalized === "一对一") return "one_on_one";
  if (normalized === "one_on_two" || normalized === "一对二") return "one_on_two";
  if (normalized === "class" || normalized === "班课" || normalized === "多人班课") return "class";
  if (normalized === "trial" || normalized === "试听") return "trial";
  if (normalized === "full_time" || normalized === "全职" || normalized === "全日制") return "class";
  const matchedCustomType = vault?.preferences?.customCourseTypes?.find((item) =>
    item.id.toLowerCase() === normalized || item.label.trim().toLowerCase() === normalized
  );
  if (matchedCustomType) return matchedCustomType.id;
  const matchedKnownType = vault
    ? Array.from(new Set([...vault.courseGroups.map((course) => course.type), ...vault.lessons.map((lesson) => lesson.type)]))
        .find((type) => type.toLowerCase() === normalized || courseTypeLabel(vault, type).trim().toLowerCase() === normalized)
    : undefined;
  if (matchedKnownType) return matchedKnownType;
  return "class";
}

