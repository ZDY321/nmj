import type {
  CourseGroup,
  Lesson,
  TeacherVault
} from "../../shared/types";
import { isSubstituteClassLesson } from "./billingPrimitives";
import { billableStudentCapForRule, calculateClassHeadcountFee, classHeadcountBaseStudentCountForRule, extraFeeTotal, feeRuleForCourseType, lessonFeeUnitHours, presentCount } from "./feeRules";
import { resolveSalaryGradeRule, salaryGradeAmountForCount, salaryGradeStageForLesson } from "./salaryGradeCalculations";
import { getCourse } from "./vaultLookups";

type StudentMakeupFeeAllocation = {
  amount: number;
  unitAmount: number;
  headcountBaseStudentCount: number;
};

function lessonStudentIdsForMakeupAllocation(lesson: Pick<Lesson, "expectedStudentIds" | "attendance" | "linkedOriginalLessonId">): string[] {
  const presentAttendanceIds = lesson.attendance
    .filter((entry) => (entry.status === "attended" || (Boolean(lesson.linkedOriginalLessonId) && entry.status === "makeup_completed")) && !entry.trial)
    .map((entry) => entry.studentId);
  if (presentAttendanceIds.length > 0 || lesson.attendance.length > 0) {
    return Array.from(new Set(presentAttendanceIds));
  }
  return Array.from(new Set(lesson.expectedStudentIds));
}

function compareMakeupAllocationLessons(a: Lesson, b: Lesson): number {
  return (
    `${a.date} ${a.startTime} ${a.endTime} ${a.id}`.localeCompare(`${b.date} ${b.startTime} ${b.endTime} ${b.id}`)
  );
}

function linkedMakeupLessonsForAllocation(vault: TeacherVault, originalLessonId: string, currentLesson: Lesson): Lesson[] {
  const lessonsById = new Map(
    vault.lessons
      .filter((lesson) => lesson.linkedOriginalLessonId === originalLessonId && lesson.status !== "cancelled")
      .map((lesson) => [lesson.id, lesson])
  );
  if (currentLesson.status !== "cancelled") {
    lessonsById.set(currentLesson.id, currentLesson);
  }
  return Array.from(lessonsById.values()).sort(compareMakeupAllocationLessons);
}

export function studentMakeupOriginalClassFeeAllocation(
  vault: TeacherVault,
  course: CourseGroup,
  lesson: Lesson,
  hours: number
): StudentMakeupFeeAllocation | undefined {
  if (!lesson.linkedOriginalLessonId || isSubstituteClassLesson(lesson)) return undefined;
  const original = vault.lessons.find((item) => item.id === lesson.linkedOriginalLessonId);
  if (!original || original.linkedOriginalLessonId) return undefined;
  const originalCourse = getCourse(vault, original.courseGroupId) ?? course;
  const originalRule = originalCourse.feeRule;
  const stage = salaryGradeStageForLesson(vault, originalCourse, original);
  const durationMultiplier = hours / lessonFeeUnitHours;
  const extraFee = extraFeeTotal({ ...lesson, feeSnapshot: { ...lesson.feeSnapshot, hours } }, originalRule, vault);

  let headcountBaseStudentCount = 0;
  let unitAmountForCount: ((studentCount: number) => number) | undefined;

  if (originalRule.mode === "salary_grade") {
    const gradeRule = resolveSalaryGradeRule(vault, originalRule);
    if (!gradeRule) return undefined;
    const courseTypeRule = feeRuleForCourseType(vault, originalCourse.type);
    headcountBaseStudentCount = classHeadcountBaseStudentCountForRule(originalCourse.type, courseTypeRule);
    const billableStudentCap = billableStudentCapForRule(originalCourse.type, courseTypeRule);
    unitAmountForCount = (studentCount) =>
      salaryGradeAmountForCount(gradeRule, originalCourse.type, studentCount, stage, headcountBaseStudentCount, billableStudentCap);
  } else if (originalRule.mode === "class_headcount") {
    headcountBaseStudentCount = classHeadcountBaseStudentCountForRule(originalCourse.type, originalRule);
    unitAmountForCount = (studentCount) =>
      calculateClassHeadcountFee(originalRule, studentCount, originalCourse.type, stage);
  }

  if (!unitAmountForCount || headcountBaseStudentCount <= 1) return undefined;

  let runningStudentCount = presentCount(original);
  const linkedMakeupLessons = linkedMakeupLessonsForAllocation(vault, original.id, lesson);

  for (const makeupLesson of linkedMakeupLessons) {
    const makeupStudentCount = lessonStudentIdsForMakeupAllocation(makeupLesson).length;
    const beforeStudentCount = runningStudentCount;
    const afterStudentCount = beforeStudentCount + makeupStudentCount;
    const unitBefore = unitAmountForCount(beforeStudentCount);
    const unitAfter = unitAmountForCount(afterStudentCount);
    const unitAmount = Math.max(unitAfter - unitBefore, 0);
    if (makeupLesson.id === lesson.id) {
      return {
        amount: Math.round(unitAmount * durationMultiplier + extraFee),
        unitAmount,
        headcountBaseStudentCount
      };
    }
    runningStudentCount = afterStudentCount;
  }

  return undefined;
}
