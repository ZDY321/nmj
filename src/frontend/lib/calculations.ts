import type {
  AttendanceStatus,
  CourseGroup,
  FeeRule,
  Lesson,
  SalaryAdjustment,
  SalaryBreakdown,
  TeacherVault
} from "../../shared/types";

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function todayIso(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hoursBetween(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return Math.max((end - start) / 60, 0);
}

export function presentCount(lesson: Lesson): number {
  return lesson.attendance.filter((entry) => entry.status === "attended").length;
}

export function calculateFee(rule: FeeRule, lesson: Lesson): number {
  if (rule.mode === "hourly") {
    return Math.round((rule.hourlyRate ?? 0) * hoursBetween(lesson.startTime, lesson.endTime));
  }

  if (rule.mode === "fixed") {
    return rule.fixedFee ?? 0;
  }

  return Math.round((rule.baseFee ?? 0) + presentCount(lesson) * (rule.perPresentStudentFee ?? 0));
}

export function getCourse(vault: TeacherVault, courseId: string): CourseGroup | undefined {
  return vault.courseGroups.find((course) => course.id === courseId);
}

export function completedAmount(lesson: Lesson): number {
  if (lesson.status !== "completed" && lesson.status !== "makeup_completed") {
    return 0;
  }
  return lesson.feeSnapshot.amount;
}

export function salaryBreakdown(vault: TeacherVault, month: string): SalaryBreakdown {
  const monthLessons = vault.lessons.filter((lesson) => monthOf(lesson.date) === month);
  const monthAdjustments = vault.salaryAdjustments.filter((item) => item.month === month);

  const lessonTotals = monthLessons.reduce(
    (totals, lesson) => {
      const amount = completedAmount(lesson);
      if (lesson.status === "makeup_completed") {
        totals.makeup += amount;
      } else if (lesson.type === "class") {
        totals.classLessons += amount;
      } else {
        totals.oneOnOne += amount;
      }
      return totals;
    },
    { oneOnOne: 0, classLessons: 0, makeup: 0 }
  );

  const adjustments = monthAdjustments.reduce((sum, item) => sum + item.amount, 0);

  return {
    baseSalary: vault.profile.baseSalary,
    oneOnOne: lessonTotals.oneOnOne,
    classLessons: lessonTotals.classLessons,
    makeup: lessonTotals.makeup,
    adjustments,
    total:
      vault.profile.baseSalary +
      lessonTotals.oneOnOne +
      lessonTotals.classLessons +
      lessonTotals.makeup +
      adjustments
  };
}

export function attendanceSummary(vault: TeacherVault, month: string): Record<AttendanceStatus, number> {
  const initial: Record<AttendanceStatus, number> = {
    attended: 0,
    leave_requested: 0,
    absent: 0,
    cancelled: 0,
    makeup_pending: 0,
    makeup_completed: 0
  };

  return vault.lessons
    .filter((lesson) => monthOf(lesson.date) === month)
    .flatMap((lesson) => lesson.attendance)
    .reduce((summary, entry) => {
      summary[entry.status] += 1;
      return summary;
    }, initial);
}

export function yearlyTrend(vault: TeacherVault, year: string): Array<{ month: string; total: number; count: number }> {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const lessons = vault.lessons.filter((lesson) => monthOf(lesson.date) === month);
    return {
      month,
      total: lessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0),
      count: lessons.filter((lesson) => lesson.status === "completed").length
    };
  });
}

export function adjustmentTotal(adjustments: SalaryAdjustment[]): number {
  return adjustments.reduce((sum, item) => sum + item.amount, 0);
}
