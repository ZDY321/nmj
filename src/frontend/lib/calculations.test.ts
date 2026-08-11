import { describe, expect, it } from "vitest";
import {
  buildFeeSnapshot,
  buildSubstituteClassFeeSnapshot,
  completedAmount,
  headcountAmountBreakdown,
  obligationCampusDeductions,
  obligationSummary,
  payrollExcludedSplitMergeLessonIds,
  salaryBreakdown,
  yearlyTrend
} from "@/frontend/lib/calculations";
import { SUBSTITUTE_CLASS_COURSE_GROUP_ID } from "@/shared/types";
import type {
  AttendanceEntry,
  CourseGroup,
  CourseType,
  Lesson,
  TeacherVault
} from "@/shared/types";

const campus = { id: "campus_1", name: "Main Campus" };

const students = Array.from({ length: 24 }, (_, index) => ({
  id: `student_${index + 1}`,
  name: `Student ${index + 1}`,
  status: "active" as const
}));

const oneOnOneCourse: CourseGroup = {
  id: "course_one",
  name: "One on one",
  type: "one_on_one",
  subject: "Math",
  defaultCampusId: campus.id,
  studentIds: ["student_1"],
  feeRule: { mode: "fixed", fixedFee: 120 },
  status: "active"
};

const classCourse: CourseGroup = {
  id: "course_class",
  name: "Class course",
  type: "class",
  subject: "Math",
  defaultCampusId: campus.id,
  studentIds: students.slice(0, 7).map((student) => student.id),
  feeRule: {
    mode: "class_headcount",
    baseFee: 80,
    perPresentStudentFee: 12,
    classFeeTiers: [{ id: "tier_5_plus", minStudents: 5, baseFee: 80, perStudentFee: 12 }]
  },
  status: "active"
};

const smallClassCourse: CourseGroup = {
  id: "course_small_class",
  name: "Small class",
  type: "small_class",
  subject: "Math",
  defaultCampusId: campus.id,
  studentIds: students.slice(0, 12).map((student) => student.id),
  feeRule: {
    mode: "class_headcount",
    baseFee: 65,
    perPresentStudentFee: 12,
    classFeeTiers: [{ id: "tier_5_plus", minStudents: 5, baseFee: 65, perStudentFee: 12 }]
  },
  status: "active"
};

const bigClassCourse: CourseGroup = {
  id: "course_big_class",
  name: "Big class",
  type: "big_class",
  subject: "Math",
  defaultCampusId: campus.id,
  studentIds: students.slice(0, 23).map((student) => student.id),
  feeRule: {
    mode: "class_headcount",
    baseFee: 65,
    perPresentStudentFee: 12,
    classFeeTiers: [{ id: "tier_5_plus", minStudents: 5, baseFee: 65, perStudentFee: 12 }]
  },
  status: "active"
};

const trialCourse: CourseGroup = {
  id: "course_trial",
  name: "Trial course",
  type: "trial",
  subject: "Math",
  defaultCampusId: campus.id,
  studentIds: ["student_9"],
  feeRule: { mode: "fixed", fixedFee: 90 },
  status: "active"
};

function makeVault(patch: Partial<TeacherVault> = {}): TeacherVault {
  return {
    version: 1,
    profile: {
      displayName: "Teacher",
      baseSalary: 3000,
      currency: "CNY",
      homeCampusId: campus.id
    },
    preferences: { weekStartsOn: 1 },
    campuses: [campus],
    students,
    courseGroups: [oneOnOneCourse, classCourse, smallClassCourse, bigClassCourse, trialCourse],
    scheduleRules: [],
    lessons: [],
    salaryAdjustments: [],
    notice: { enabled: false, title: "", content: "", updatedAt: "2026-06-01T00:00:00.000Z" },
    ...patch
  };
}

function attended(studentId: string, patch: Partial<AttendanceEntry> = {}): AttendanceEntry {
  return { studentId, status: "attended", ...patch };
}

function makeLesson(
  patch: Pick<Lesson, "id" | "courseGroupId" | "type"> & Partial<Lesson>
): Lesson {
  const { id, courseGroupId, type, ...rest } = patch;
  return {
    id,
    date: "2026-06-05",
    startTime: "10:00",
    endTime: "12:00",
    courseGroupId,
    campusId: campus.id,
    type,
    status: "completed",
    expectedStudentIds: [],
    attendance: [],
    feeSnapshot: { amount: 0 },
    content: { taught: "", homework: "", nextLessonReminder: "" },
    ...rest
  };
}

function lessonWithSnapshot(
  vault: TeacherVault,
  course: CourseGroup,
  patch: Pick<Lesson, "id"> & Partial<Lesson>
): Lesson {
  const lesson = makeLesson({
    courseGroupId: course.id,
    type: course.type as CourseType,
    ...patch
  });
  return { ...lesson, feeSnapshot: buildFeeSnapshot(vault, course, lesson) };
}

describe("salary calculations", () => {
  it("breaks down completed one-on-one, class, makeup, adjustments, and split-merge exclusions", () => {
    const baseVault = makeVault();
    const oneOnOne = lessonWithSnapshot(baseVault, oneOnOneCourse, {
      id: "lesson_one",
      expectedStudentIds: ["student_1"],
      attendance: [attended("student_1")]
    });
    const classLesson = lessonWithSnapshot(baseVault, classCourse, {
      id: "lesson_class",
      expectedStudentIds: students.slice(0, 7).map((student) => student.id),
      attendance: students.slice(0, 7).map((student) => attended(student.id))
    });
    const makeupLesson = lessonWithSnapshot(baseVault, oneOnOneCourse, {
      id: "lesson_makeup",
      status: "makeup_completed",
      linkedOriginalLessonId: "lesson_original",
      expectedStudentIds: ["student_1"],
      attendance: [{ studentId: "student_1", status: "makeup_completed" }]
    });
    const excludedLesson = lessonWithSnapshot(baseVault, oneOnOneCourse, {
      id: "lesson_excluded",
      expectedStudentIds: ["student_1"],
      attendance: [attended("student_1")]
    });
    const scheduledLesson = lessonWithSnapshot(baseVault, oneOnOneCourse, {
      id: "lesson_scheduled",
      status: "scheduled",
      expectedStudentIds: ["student_1"],
      attendance: []
    });

    const vault = makeVault({
      lessons: [oneOnOne, classLesson, makeupLesson, excludedLesson, scheduledLesson],
      salaryAdjustments: [
        { id: "bonus", month: "2026-06", title: "Bonus", amount: 200 },
        { id: "deduction", month: "2026-06", title: "Deduction", amount: -50 },
        { id: "other_month", month: "2026-07", title: "Other month", amount: 1000 }
      ],
      scheduleImport: {
        mappings: {},
        reviews: [],
        splitMergeExcludedLessonIds: [excludedLesson.id],
        updatedAt: "2026-06-05T00:00:00.000Z"
      }
    });

    expect(oneOnOne.feeSnapshot.amount).toBe(120);
    expect(classLesson.feeSnapshot.amount).toBe(104);
    expect(completedAmount(scheduledLesson)).toBe(0);
    expect(salaryBreakdown(vault, "2026-06")).toEqual({
      baseSalary: 3000,
      oneOnOne: 120,
      classLessons: 104,
      makeup: 120,
      substituteClass: 0,
      adjustments: 150,
      obligationDeduction: 0,
      total: 3494
    });
  });

  it("calculates substitute class records from teacher grade headcount fees", () => {
    const vault = makeVault({
      profile: {
        displayName: "Teacher",
        baseSalary: 3000,
        currency: "CNY",
        homeCampusId: campus.id,
        defaultSalaryGradeId: "advanced_1"
      }
    });
    const lesson = makeLesson({
      id: "lesson_substitute",
      courseGroupId: SUBSTITUTE_CLASS_COURSE_GROUP_ID,
      type: "class",
      lessonSource: "substitute_class",
      substituteClass: {
        subject: "Math",
        salaryGradeStage: "junior_3",
        presentStudentCount: 6
      }
    });
    const substituteLesson = { ...lesson, feeSnapshot: buildSubstituteClassFeeSnapshot(vault, lesson) };
    const breakdown = salaryBreakdown(makeVault({ ...vault, lessons: [substituteLesson] }), "2026-06");

    expect(substituteLesson.feeSnapshot.perPresentStudentFee).toBe(15);
    expect(substituteLesson.feeSnapshot.amount).toBe(90);
    expect(breakdown.substituteClass).toBe(90);
    expect(breakdown.classLessons).toBe(0);
    expect(breakdown.total).toBe(3090);
  });

  describe("headcount tiers and billable caps", () => {
    function classLessonFor(course: CourseGroup, presentStudentCount: number): Lesson {
      const attendingStudentIds = students.slice(0, presentStudentCount).map((student) => student.id);
      return makeLesson({
        id: `lesson_${course.id}_${presentStudentCount}`,
        courseGroupId: course.id,
        type: course.type,
        expectedStudentIds: attendingStudentIds,
        attendance: attendingStudentIds.map((studentId) => attended(studentId))
      });
    }

    it("charges the graded increment for students 6 through 10", () => {
      const snapshot = buildFeeSnapshot(makeVault(), smallClassCourse, classLessonFor(smallClassCourse, 8));

      // 65 + 3 * 12
      expect(snapshot.amount).toBe(101);
      expect(snapshot.billableStudentCount).toBe(8);
      expect(snapshot.overflowStudentCount).toBe(0);
    });

    it("charges a flat overflow fee from the 11th student regardless of teacher grade", () => {
      const snapshot = buildFeeSnapshot(makeVault(), bigClassCourse, classLessonFor(bigClassCourse, 13));

      // 65 + 5 * 12 + 3 * 10
      expect(snapshot.amount).toBe(155);
      expect(snapshot.billableStudentCount).toBe(13);
      expect(snapshot.overflowStudentCount).toBe(3);
      expect(snapshot.overflowHeadcountFee).toBe(10);
    });

    it("stops billing small class students beyond the 10 person cap", () => {
      const snapshot = buildFeeSnapshot(makeVault(), smallClassCourse, classLessonFor(smallClassCourse, 12));

      // capped at 10 -> 65 + 5 * 12, the 11th and 12th students add nothing
      expect(snapshot.amount).toBe(125);
      expect(snapshot.presentStudentCount).toBe(12);
      expect(snapshot.billableStudentCount).toBe(10);
      expect(snapshot.billableStudentCap).toBe(10);
      expect(snapshot.overflowStudentCount).toBe(0);
    });

    it("stops billing big class students beyond the 20 person cap", () => {
      const snapshot = buildFeeSnapshot(makeVault(), bigClassCourse, classLessonFor(bigClassCourse, 23));

      // capped at 20 -> 65 + 5 * 12 + 10 * 10
      expect(snapshot.amount).toBe(225);
      expect(snapshot.presentStudentCount).toBe(23);
      expect(snapshot.billableStudentCount).toBe(20);
      expect(snapshot.overflowStudentCount).toBe(10);
    });

    it("gives an over-cap student a zero marginal increment", () => {
      const atCap = buildFeeSnapshot(makeVault(), smallClassCourse, classLessonFor(smallClassCourse, 10));
      const overCap = buildFeeSnapshot(makeVault(), smallClassCourse, classLessonFor(smallClassCourse, 11));

      expect(overCap.amount - atCap.amount).toBe(0);
    });

    it("honours an explicit cap override on the fee rule", () => {
      const cappedCourse: CourseGroup = {
        ...smallClassCourse,
        feeRule: { ...smallClassCourse.feeRule, billableStudentCap: 7 }
      };
      const snapshot = buildFeeSnapshot(makeVault(), cappedCourse, classLessonFor(cappedCourse, 12));

      // capped at 7 -> 65 + 2 * 12
      expect(snapshot.amount).toBe(89);
      expect(snapshot.billableStudentCount).toBe(7);
      expect(snapshot.billableStudentCap).toBe(7);
    });

    it("keeps the uncapped non-class formula on the same two tiers", () => {
      // base 1 person, increment from the 2nd, flat overflow from the 11th
      expect(headcountAmountBreakdown({
        baseFee: 80,
        incrementFee: 12,
        baseStudentCount: 1,
        presentStudentCount: 13
      })).toEqual({
        amount: 80 + 9 * 12 + 3 * 10,
        billableStudentCount: 13,
        gradedStudentCount: 9,
        overflowStudentCount: 3
      });
    });
  });

  it("does not count trial students as class headcount but keeps explicit trial income", () => {
    const vault = makeVault();
    const regularStudents = students.slice(0, 5).map((student) => student.id);
    const lesson = makeLesson({
      id: "lesson_class_trial",
      courseGroupId: classCourse.id,
      type: classCourse.type,
      expectedStudentIds: [...regularStudents, "student_8", "student_9"],
      attendance: [
        ...regularStudents.map((studentId) => attended(studentId)),
        attended("student_8", { trial: true }),
        attended("student_9", { trial: true })
      ],
      trialFee: 30
    });

    const snapshot = buildFeeSnapshot(vault, classCourse, lesson);

    expect(snapshot.presentStudentCount).toBe(5);
    expect(snapshot.trialStudentCount).toBe(2);
    expect(snapshot.amount).toBe(110);
  });

  it("keeps trial course pay as a single fixed fee instead of prorating by duration", () => {
    const vault = makeVault();
    const lesson = makeLesson({
      id: "lesson_trial",
      courseGroupId: trialCourse.id,
      type: trialCourse.type,
      startTime: "09:00",
      endTime: "12:00",
      expectedStudentIds: ["student_9"],
      attendance: [attended("student_9", { trial: true })]
    });

    const snapshot = buildFeeSnapshot(vault, trialCourse, lesson);

    expect(snapshot.hours).toBe(3);
    expect(snapshot.amount).toBe(90);
  });

  it("prices own class makeup lessons as the original class headcount delta", () => {
    const originalStudentIds = students.slice(0, 6).map((student) => student.id);
    const originalLesson = makeLesson({
      id: "lesson_original_class",
      courseGroupId: classCourse.id,
      type: classCourse.type,
      expectedStudentIds: originalStudentIds,
      attendance: [
        ...originalStudentIds.slice(0, 5).map((studentId) => attended(studentId)),
        { studentId: "student_6", status: "makeup_pending" }
      ]
    });
    const vault = makeVault({
      lessons: [{ ...originalLesson, feeSnapshot: buildFeeSnapshot(makeVault(), classCourse, originalLesson) }]
    });
    const makeupLesson = makeLesson({
      id: "lesson_class_makeup",
      courseGroupId: classCourse.id,
      type: classCourse.type,
      status: "scheduled",
      linkedOriginalLessonId: originalLesson.id,
      makeupOriginalDate: originalLesson.date,
      makeupScheduledDate: "2026-06-08",
      expectedStudentIds: ["student_6"],
      attendance: [attended("student_6")]
    });

    const snapshot = buildFeeSnapshot(vault, classCourse, makeupLesson);

    expect(snapshot.presentStudentCount).toBe(1);
    expect(snapshot.unitAmount).toBe(12);
    expect(snapshot.amount).toBe(12);
  });

  it("does not add class makeup income while missed students are still inside the class base count", () => {
    const originalStudentIds = students.slice(0, 5).map((student) => student.id);
    const originalLesson = makeLesson({
      id: "lesson_original_base_count",
      courseGroupId: classCourse.id,
      type: classCourse.type,
      expectedStudentIds: originalStudentIds,
      attendance: [
        ...originalStudentIds.slice(0, 3).map((studentId) => attended(studentId)),
        { studentId: "student_4", status: "makeup_pending" },
        { studentId: "student_5", status: "makeup_pending" }
      ]
    });
    const vault = makeVault({ lessons: [originalLesson] });
    const makeupLesson = makeLesson({
      id: "lesson_class_makeup_inside_base",
      courseGroupId: classCourse.id,
      type: classCourse.type,
      status: "scheduled",
      linkedOriginalLessonId: originalLesson.id,
      expectedStudentIds: ["student_4", "student_5"],
      attendance: [attended("student_4"), attended("student_5")]
    });

    const snapshot = buildFeeSnapshot(vault, classCourse, makeupLesson);

    expect(snapshot.presentStudentCount).toBe(2);
    expect(snapshot.unitAmount).toBe(0);
    expect(snapshot.amount).toBe(0);
  });

  it("allocates split class makeup income by scheduled makeup order", () => {
    const originalStudentIds = students.slice(0, 6).map((student) => student.id);
    const originalLesson = makeLesson({
      id: "lesson_original_split_makeup",
      courseGroupId: classCourse.id,
      type: classCourse.type,
      expectedStudentIds: originalStudentIds,
      attendance: [
        ...originalStudentIds.slice(0, 4).map((studentId) => attended(studentId)),
        { studentId: "student_5", status: "makeup_pending" },
        { studentId: "student_6", status: "makeup_pending" }
      ]
    });
    const firstMakeup = makeLesson({
      id: "lesson_split_makeup_1",
      date: "2026-06-08",
      courseGroupId: classCourse.id,
      type: classCourse.type,
      status: "scheduled",
      linkedOriginalLessonId: originalLesson.id,
      expectedStudentIds: ["student_5"],
      attendance: [attended("student_5")]
    });
    const secondMakeup = makeLesson({
      id: "lesson_split_makeup_2",
      date: "2026-06-09",
      courseGroupId: classCourse.id,
      type: classCourse.type,
      status: "scheduled",
      linkedOriginalLessonId: originalLesson.id,
      expectedStudentIds: ["student_6"],
      attendance: [attended("student_6")]
    });
    const vault = makeVault({ lessons: [originalLesson, firstMakeup, secondMakeup] });

    expect(buildFeeSnapshot(vault, classCourse, firstMakeup).amount).toBe(0);
    expect(buildFeeSnapshot(vault, classCourse, secondMakeup).amount).toBe(12);
  });

  it("ignores split-merge payroll exclusions when the merge target lesson was deleted", () => {
    const baseVault = makeVault();
    const sourceLesson = lessonWithSnapshot(baseVault, oneOnOneCourse, {
      id: "lesson_source",
      expectedStudentIds: ["student_1"],
      attendance: [attended("student_1")]
    });
    const vault = makeVault({
      lessons: [sourceLesson],
      scheduleImport: {
        mappings: {},
        resolutions: {
          [`${sourceLesson.id}|教务课表.xlsx|2026-06-05|10:00|12:00|${oneOnOneCourse.id}|One on one`]: {
            status: "split_merge_ok",
            linkedSystemLessonIds: ["lesson_deleted_target"],
            updatedAt: "2026-06-06T00:00:00.000Z"
          }
        },
        reviews: [],
        splitMergeExcludedLessonIds: [sourceLesson.id],
        updatedAt: "2026-06-06T00:00:00.000Z"
      }
    });

    expect(Array.from(payrollExcludedSplitMergeLessonIds(vault, "2026-06"))).toEqual([]);
    expect(salaryBreakdown(vault, "2026-06").oneOnOne).toBe(120);
  });

  it("subtracts automatic obligation deductions from eligible completed lesson income", () => {
    const baseVault = makeVault({
      profile: {
        displayName: "Teacher",
        baseSalary: 0,
        currency: "CNY",
        homeCampusId: campus.id,
        monthlyObligationHours: 2,
        obligationHourlyDeduction: 50
      }
    });
    const lesson = lessonWithSnapshot(baseVault, oneOnOneCourse, {
      id: "lesson_obligation",
      expectedStudentIds: ["student_1"],
      attendance: [attended("student_1")]
    });

    const breakdown = salaryBreakdown(makeVault({ ...baseVault, lessons: [lesson] }), "2026-06");

    expect(breakdown.oneOnOne).toBe(120);
    expect(breakdown.obligationDeduction).toBe(120);
    expect(breakdown.total).toBe(0);
  });

  it("does not add fallback obligation deductions when completed hours are insufficient", () => {
    const baseVault = makeVault({
      profile: {
        displayName: "Teacher",
        baseSalary: 0,
        currency: "CNY",
        homeCampusId: campus.id,
        monthlyObligationHours: 10,
        obligationHourlyDeduction: 50
      }
    });
    const lesson = lessonWithSnapshot(baseVault, oneOnOneCourse, {
      id: "lesson_obligation_short",
      expectedStudentIds: ["student_1"],
      attendance: [attended("student_1")]
    });
    const vault = makeVault({ ...baseVault, lessons: [lesson] });
    const obligation = obligationSummary(vault, "2026-06");
    const breakdown = salaryBreakdown(vault, "2026-06");

    expect(obligation.requiredHours).toBe(10);
    expect(obligation.deductedHours).toBe(2);
    expect(obligation.missingHours).toBe(8);
    expect(obligation.fallbackAmount).toBe(0);
    expect(breakdown.obligationDeduction).toBe(120);
  });

  it("caps automatic obligation deductions at ten hours per month", () => {
    const baseVault = makeVault({
      profile: {
        displayName: "Teacher",
        baseSalary: 0,
        currency: "CNY",
        homeCampusId: campus.id,
        monthlyObligationHours: 12,
        obligationHourlyDeduction: 50
      }
    });
    const lessons = Array.from({ length: 6 }, (_, index) => lessonWithSnapshot(baseVault, oneOnOneCourse, {
      id: `lesson_obligation_cap_${index + 1}`,
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
      expectedStudentIds: ["student_1"],
      attendance: [attended("student_1")]
    }));
    const vault = makeVault({ ...baseVault, lessons });
    const obligation = obligationSummary(vault, "2026-06");
    const breakdown = salaryBreakdown(vault, "2026-06");

    expect(obligation.requiredHours).toBe(10);
    expect(obligation.deductedHours).toBe(10);
    expect(obligation.missingHours).toBe(0);
    expect(breakdown.oneOnOne).toBe(720);
    expect(breakdown.obligationDeduction).toBe(600);
    expect(breakdown.total).toBe(120);
  });

  it("allocates cross-campus obligation deductions to the lessons actually deducted", () => {
    const otherCampus = { id: "campus_2", name: "Other Campus" };
    const otherCourse: CourseGroup = {
      ...oneOnOneCourse,
      id: "course_other_campus",
      name: "Other campus course",
      defaultCampusId: otherCampus.id,
      feeRule: { mode: "fixed", fixedFee: 80 }
    };
    const baseVault = makeVault({
      profile: {
        displayName: "Teacher",
        baseSalary: 0,
        currency: "CNY",
        homeCampusId: campus.id,
        monthlyObligationHours: 10,
        obligationHourlyDeduction: 50
      },
      campuses: [campus, otherCampus],
      courseGroups: [oneOnOneCourse, otherCourse]
    });
    const homeLessons = Array.from({ length: 4 }, (_, index) => lessonWithSnapshot(baseVault, oneOnOneCourse, {
      id: `lesson_home_${index + 1}`,
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
      expectedStudentIds: ["student_1"],
      attendance: [attended("student_1")]
    }));
    const otherLessons = Array.from({ length: 2 }, (_, index) => lessonWithSnapshot(baseVault, otherCourse, {
      id: `lesson_other_${index + 1}`,
      date: `2026-06-${String(index + 5).padStart(2, "0")}`,
      campusId: otherCampus.id,
      expectedStudentIds: ["student_1"],
      attendance: [attended("student_1")]
    }));
    const vault = makeVault({ ...baseVault, lessons: [...homeLessons, ...otherLessons] });
    const obligation = obligationSummary(vault, "2026-06");
    const campusDeductions = obligationCampusDeductions(vault, obligation);
    const homeOnlyDeductions = obligationCampusDeductions(vault, obligation, new Set(homeLessons.map((lesson) => lesson.id)));
    const homeDeduction = campusDeductions.find((item) => item.campusId === campus.id);
    const otherDeduction = campusDeductions.find((item) => item.campusId === otherCampus.id);

    expect(obligation.deductedHours).toBe(10);
    expect(obligation.amount).toBe(560);
    expect(homeDeduction).toMatchObject({ deductedHours: 8, amount: 480 });
    expect(otherDeduction).toMatchObject({ deductedHours: 2, amount: 80 });
    expect(homeOnlyDeductions).toEqual([{ campusId: campus.id, deductedHours: 8, amount: 480 }]);
    expect(4 * 120 - (homeDeduction?.amount ?? 0)).toBe(0);
    expect(2 * 80 - (otherDeduction?.amount ?? 0)).toBe(80);
    expect(salaryBreakdown(vault, "2026-06").total).toBe(80);
    expect(yearlyTrend(vault, "2026").find((item) => item.month === "2026-06")?.total).toBe(80);
  });
});
