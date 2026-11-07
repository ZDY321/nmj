import {
  isPlainRecord as isPlainRecordLocal,
  stringValue
} from "@/frontend/lib/typeGuards";
import type {
  CourseGroup,
  CustomCourseType,
  Student
} from "@/shared/types";

import type { createAiDraftData } from "./aiDraftData";
import { normalizeAiCourseType, normalizeAiStudentStatus } from "./aiDraftData";
import type { createAiDraftFees } from "./aiDraftFees";
import { defaultFeeRuleForCustomTemplate, defaultFeeRuleForVaultCourseType, feeRuleFromAiData } from "./aiDraftFees";
import type { AiDraftContext } from "./aiDraftTypes";

export function createAiDraftArchives({ makeId, nextVault, messages, blockers, courseUpdateAffectsLessonDefaults, normalizeCourseLessonSyncScope, syncLessonsWithCourseDefaults, materializeStudentTrialStatusOnLessons, syncFutureLessonsWithStudentTrialStatus }: AiDraftContext, { courseMatchesData, campusByName, studentIdsFromAiData, enforceAiFeeModeMatchesCourseType, needsClassFeeConfirmation, courseByIdOrName, studentByName }: Pick<ReturnType<typeof createAiDraftData>, "courseMatchesData" | "campusByName" | "studentIdsFromAiData" | "courseByIdOrName" | "studentByName"> & Pick<ReturnType<typeof createAiDraftFees>, "enforceAiFeeModeMatchesCourseType" | "needsClassFeeConfirmation">) {
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

  const addStudentsToCourse = (course: CourseGroup, studentIds: string[]) => {
    if (studentIds.length === 0) return;
    const nextIds = Array.from(new Set([...course.studentIds, ...studentIds]));
    if (nextIds.length === course.studentIds.length) return;
    course.studentIds = nextIds;
    messages.push(`已将学生加入课程「${course.name}」`);
  };

  return { createCourseTypeFromAi, ensureCourse, updateCourseFromAi, updateStudentFromAi, addStudentsToCourse };
}
