import type {
  AttendanceStatus,
  Campus,
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

function completedHours(lesson: Lesson): number {
  if (lesson.status !== "completed" && lesson.status !== "makeup_completed") {
    return 0;
  }
  return lesson.feeSnapshot.hours ?? hoursBetween(lesson.startTime, lesson.endTime);
}

export type ObligationSummary = {
  campus?: Campus;
  course?: CourseGroup;
  mode: "auto_gap" | "manual";
  requiredHours: number;
  completedHours: number;
  deductedHours: number;
  missingHours: number;
  hourlyDeduction: number;
  manualAmount: number;
  amount: number;
};

export function obligationSummary(vault: TeacherVault, month: string, campusId = vault.profile.obligationCampusId): ObligationSummary {
  const courseId = vault.profile.obligationCourseGroupId;
  const mode = vault.profile.obligationDeductionMode ?? "auto_gap";
  const requiredHours = Math.max(vault.profile.monthlyObligationHours ?? 0, 0);
  const hourlyDeduction = Math.max(vault.profile.obligationHourlyDeduction ?? 0, 0);
  const manualAmount = Math.max(vault.profile.manualObligationDeduction ?? 0, 0);
  const campus = vault.campuses.find((item) => item.id === campusId);
  const course = vault.courseGroups.find((item) => item.id === courseId);
  const completedAtCampus = vault.lessons
    .filter((lesson) => {
      const lessonCampusId = lesson.campusId ?? getCourse(vault, lesson.courseGroupId)?.defaultCampusId;
      const matchesCampus = !campusId || lessonCampusId === campusId;
      const matchesCourse = !courseId || lesson.courseGroupId === courseId;
      return monthOf(lesson.date) === month && matchesCampus && matchesCourse;
    })
    .reduce((sum, lesson) => sum + completedHours(lesson), 0);
  const missingHours = Math.max(requiredHours - completedAtCampus, 0);
  const autoAmount = Math.round(missingHours * hourlyDeduction);

  return {
    campus,
    course,
    mode,
    requiredHours,
    completedHours: completedAtCampus,
    deductedHours: mode === "manual" ? 0 : missingHours,
    missingHours,
    hourlyDeduction,
    manualAmount,
    amount: mode === "manual" ? manualAmount : autoAmount
  };
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
  const obligationDeduction = obligationSummary(vault, month).amount;

  return {
    baseSalary: vault.profile.baseSalary,
    oneOnOne: lessonTotals.oneOnOne,
    classLessons: lessonTotals.classLessons,
    makeup: lessonTotals.makeup,
    adjustments,
    obligationDeduction,
    total:
      vault.profile.baseSalary +
      lessonTotals.oneOnOne +
      lessonTotals.classLessons +
      lessonTotals.makeup +
      adjustments -
      obligationDeduction
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
      total: salaryBreakdown(vault, month).total,
      count: lessons.filter((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed").length
    };
  });
}

export function adjustmentTotal(adjustments: SalaryAdjustment[]): number {
  return adjustments.reduce((sum, item) => sum + item.amount, 0);
}
