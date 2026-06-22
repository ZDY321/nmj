import { describe, expect, it } from "vitest";
import {
  buildFeeSnapshot,
  completedAmount,
  salaryBreakdown
} from "@/frontend/lib/calculations";
import type {
  AttendanceEntry,
  CourseGroup,
  CourseType,
  Lesson,
  TeacherVault
} from "@/shared/types";

const campus = { id: "campus_1", name: "Main Campus" };

const students = Array.from({ length: 9 }, (_, index) => ({
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
    courseGroups: [oneOnOneCourse, classCourse, trialCourse],
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
      adjustments: 150,
      obligationDeduction: 0,
      total: 3494
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
});
