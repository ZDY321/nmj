import { describe, expect, it, vi } from "vitest";
import {
  buildImportPreview,
  parseCampusFromFileName,
  parseExportYearFromFileName,
  parseScheduleCell,
  summarizeImportPreview,
  type ImportedScheduleLesson,
  type ImportPreviewLesson
} from "@/frontend/lib/scheduleImport";
import {
  buildNextScheduleImportState,
  savedReviewEffectiveCounts,
  savedScheduleImportReviewOverflowCount,
  savedScheduleImportReviewLimit,
  summarizeScheduleImportSystemLessons
} from "@/frontend/lib/scheduleImportReviewRecords";
import { summarizeScheduleImportImportedLessons } from "@/frontend/lib/scheduleImportReviewLessons";
import { buildDefaultCampusOverrides, buildLocalOnlyRows } from "@/frontend/lib/scheduleImportReviewRows";
import { resolutionKey } from "@/frontend/lib/scheduleImportReviewMatching";
import type {
  CourseGroup,
  CourseType,
  Lesson,
  ScheduleImportReviewRecord,
  TeacherVault
} from "@/shared/types";

const campus = { id: "campus_main", name: "东城校区" };
const otherCampus = { id: "campus_west", name: "西城校区" };

const students = [
  { id: "student_ming", name: "小明", status: "active" as const },
  { id: "student_hong", name: "小红", status: "active" as const },
  { id: "student_li", name: "小李", status: "active" as const }
];

const oneOnOneCourse: CourseGroup = {
  id: "course_one",
  name: "小明数学一对一",
  type: "one_on_one",
  subject: "数学",
  defaultCampusId: campus.id,
  studentIds: ["student_ming"],
  feeRule: { mode: "fixed", fixedFee: 120 },
  status: "active"
};

const classCourse: CourseGroup = {
  id: "course_class",
  name: "数学提高班",
  type: "class",
  subject: "数学",
  defaultCampusId: campus.id,
  studentIds: ["student_ming", "student_hong", "student_li"],
  feeRule: { mode: "class_headcount", baseFee: 80, perPresentStudentFee: 10 },
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
    campuses: [campus, otherCampus],
    students,
    courseGroups: [oneOnOneCourse, classCourse],
    scheduleRules: [],
    lessons: [],
    salaryAdjustments: [],
    notice: { enabled: false, title: "", content: "", updatedAt: "2026-06-01T00:00:00.000Z" },
    ...patch
  };
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
    expectedStudentIds: ["student_ming"],
    attendance: [{ studentId: "student_ming", status: "attended" }],
    feeSnapshot: { amount: 120, hours: 2 },
    content: { taught: "", homework: "", nextLessonReminder: "" },
    ...rest
  };
}

function makeImportedLesson(patch: Pick<ImportedScheduleLesson, "id"> & Partial<ImportedScheduleLesson>): ImportedScheduleLesson {
  const { id, ...rest } = patch;
  return {
    id,
    fileName: "教务课表（东城校区）2026.xlsx",
    campusName: campus.name,
    date: "2026-06-05",
    startTime: "10:00",
    endTime: "12:00",
    title: "小明_数学一对一",
    subjectHint: "数学",
    courseTypeHint: "one_on_one",
    studentNameHint: "小明",
    presentCount: 1,
    expectedCount: 1,
    rawText: "小明_数学一对一 教师：王老师 实到/应到：1/1",
    warnings: [],
    ...rest
  };
}

function makePreviewRow(patch: Pick<ImportPreviewLesson, "id"> & Partial<ImportPreviewLesson>): ImportPreviewLesson {
  const imported = makeImportedLesson(patch);
  return {
    ...imported,
    campusId: campus.id,
    matchedCourseId: oneOnOneCourse.id,
    status: "matched",
    systemLessonId: "lesson_one",
    systemLessonLabel: "2026-06-05 10:00-12:00 小明数学一对一",
    systemLessonStatus: "completed",
    systemPresentCount: 1,
    systemExpectedCount: 1,
    systemPresentStudentNames: "小明",
    systemExpectedStudentNames: "小明",
    issues: [],
    ...patch
  };
}

function makeSavedReview(id: string, savedAt: string): ScheduleImportReviewRecord {
  return {
    id,
    savedAt,
    month: "2026-06",
    selectedDate: "2026-06-05",
    rawLessonCount: 0,
    fileNames: [],
    mapping: {},
    fileCampusOverrides: {},
    summary: {
      total: 0,
      matched: 0,
      attendanceMismatch: 0,
      timeMismatch: 0,
      courseMismatch: 0,
      systemMissing: 0,
      importMissing: 0,
      needsMapping: 0
    },
    rows: []
  };
}

describe("schedule import parsing and matching", () => {
  it("parses exported schedule cells with course hints, counts, and cancellation warnings", () => {
    const fileName = "教务课表（东城校区）2026.xlsx";
    const lessons = parseScheduleCell(
      [
        "6月5日",
        "9:00 - 11:00 小明_数学一对一 教师：王老师 助教：李老师 教室：101 实到/应到：1/1",
        "13:00 - 15:00 数学提高班 教师：王老师 教室：202 实到/应到：0/3 未上课原因：学生请假"
      ].join("\n"),
      { fileName, campusName: "东城校区", year: 2026 }
    );

    expect(parseCampusFromFileName(fileName)).toBe("东城校区");
    expect(parseExportYearFromFileName(fileName)).toBe(2026);
    expect(lessons).toHaveLength(2);
    expect(lessons[0]).toMatchObject({
      date: "2026-06-05",
      startTime: "09:00",
      endTime: "11:00",
      title: "小明_数学一对一",
      subjectHint: "数学",
      courseTypeHint: "one_on_one",
      studentNameHint: "小明",
      teacher: "王老师",
      assistant: "李老师",
      room: "101",
      presentCount: 1,
      expectedCount: 1,
      warnings: []
    });
    expect(lessons[1]).toMatchObject({
      courseTypeHint: "class",
      presentCount: 0,
      expectedCount: 3,
      warnings: ["未全员到课", "未开课/取消"]
    });
  });

  it("matches imported rows to system lessons and summarizes mismatches plus local-only lessons", () => {
    const exactLesson = makeLesson({ id: "lesson_one", courseGroupId: oneOnOneCourse.id, type: "one_on_one" });
    const localOnlyLesson = makeLesson({
      id: "lesson_local_only",
      courseGroupId: classCourse.id,
      type: "class",
      startTime: "15:00",
      endTime: "17:00",
      expectedStudentIds: ["student_ming", "student_hong", "student_li"],
      attendance: [
        { studentId: "student_ming", status: "attended" },
        { studentId: "student_hong", status: "attended" },
        { studentId: "student_li", status: "attended" }
      ],
      feeSnapshot: { amount: 80, hours: 2 }
    });
    const vault = makeVault({ lessons: [exactLesson, localOnlyLesson] });
    const matchedImport = makeImportedLesson({ id: "import_matched" });
    const attendanceMismatchImport = makeImportedLesson({
      id: "import_mismatch",
      presentCount: 0,
      expectedCount: 1,
      rawText: "小明_数学一对一 教师：王老师 实到/应到：0/1 缺勤原因：请假",
      warnings: ["未全员到课"]
    });

    const rows = buildImportPreview(vault, [matchedImport, attendanceMismatchImport], {});
    const localOnlyRows = buildLocalOnlyRows(vault, rows, [matchedImport, attendanceMismatchImport]);
    const summary = summarizeImportPreview([...rows, ...localOnlyRows]);

    expect(rows[0]).toMatchObject({
      status: "matched",
      campusId: campus.id,
      matchedCourseId: oneOnOneCourse.id,
      systemLessonId: exactLesson.id
    });
    expect(rows[1].status).toBe("attendance_mismatch");
    expect(rows[1].issues.join(" ")).toContain("到课人数不一致");
    expect(localOnlyRows).toHaveLength(1);
    expect(localOnlyRows[0]).toMatchObject({
      status: "import_missing",
      systemLessonId: localOnlyLesson.id,
      title: classCourse.name,
      issues: ["教务 Excel 没有对应云端课节"]
    });
    expect(summary).toMatchObject({
      total: 3,
      matched: 1,
      attendanceMismatch: 1,
      importMissing: 1
    });
    expect(summary.byCampus).toContainEqual({ key: campus.name, count: 3, selected: 1 });
  });

  it("maps legacy Haizhou file names to Haining campus", () => {
    const hainingCampus = { id: "campus_haining", name: "海宁校区" };
    const hainingCourse: CourseGroup = {
      ...oneOnOneCourse,
      id: "course_haining",
      defaultCampusId: hainingCampus.id
    };
    const vault = makeVault({
      campuses: [campus, hainingCampus],
      courseGroups: [hainingCourse],
      lessons: [makeLesson({ id: "lesson_haining", courseGroupId: hainingCourse.id, type: "one_on_one", campusId: hainingCampus.id })]
    });
    const fileName = "校宝课表导出2026-06-20（海州区）.xlsx";
    const imported = makeImportedLesson({
      id: "import_haining",
      fileName,
      campusName: parseCampusFromFileName(fileName) ?? ""
    });
    const overrides = buildDefaultCampusOverrides(vault, [imported], {});
    const rows = buildImportPreview(vault, [imported], {}, overrides);

    expect(imported.campusName).toBe("海州区");
    expect(overrides[fileName]).toBe(hainingCampus.id);
    expect(rows[0]).toMatchObject({
      campusId: hainingCampus.id,
      campusName: hainingCampus.name,
      status: "matched"
    });
  });

  it("matches paused course archives when an existing system lesson belongs to the import month", () => {
    const archivedCourse: CourseGroup = {
      ...oneOnOneCourse,
      id: "course_archived",
      name: "小明数学归档课",
      status: "paused"
    };
    const archivedLesson = makeLesson({
      id: "lesson_archived",
      courseGroupId: archivedCourse.id,
      type: "one_on_one",
      startTime: "10:00",
      endTime: "12:00"
    });
    const vault = makeVault({
      courseGroups: [archivedCourse],
      lessons: [archivedLesson]
    });
    const imported = makeImportedLesson({
      id: "import_archived",
      title: "小明数学归档课",
      startTime: "10:30",
      endTime: "12:30"
    });

    const rows = buildImportPreview(vault, [imported], {});

    expect(rows[0]).toMatchObject({
      status: "time_mismatch",
      matchedCourseId: archivedCourse.id,
      systemLessonId: archivedLesson.id
    });
  });
});

describe("schedule import review records", () => {
  it("reports how many saved reviews will be removed by the next save", () => {
    expect(savedScheduleImportReviewOverflowCount(savedScheduleImportReviewLimit - 1)).toBe(0);
    expect(savedScheduleImportReviewOverflowCount(savedScheduleImportReviewLimit)).toBe(1);
    expect(savedScheduleImportReviewOverflowCount(savedScheduleImportReviewLimit + 2)).toBe(3);
  });

  it("limits saved reviews, trims raw text, and treats split-merge rows as resolved", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T04:00:00.000Z"));
    try {
      const mainLesson = makeLesson({ id: "lesson_main", courseGroupId: oneOnOneCourse.id, type: "one_on_one" });
      const linkedLesson = makeLesson({
        id: "lesson_linked",
        courseGroupId: classCourse.id,
        type: "class",
        startTime: "10:00",
        endTime: "11:00",
        feeSnapshot: { amount: 80, hours: 1 }
      });
      const previousReviews = Array.from({ length: savedScheduleImportReviewLimit + 2 }, (_, index) =>
        makeSavedReview(`previous_${index}`, `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`)
      );
      const vault = makeVault({
        lessons: [mainLesson, linkedLesson],
        scheduleImport: {
          mappings: { old: "course_old" },
          reviews: previousReviews,
          splitMergeExcludedLessonIds: ["old_lesson"],
          updatedAt: "2026-06-01T00:00:00.000Z"
        }
      });
      const longRawText = "x".repeat(300);
      const splitMergeRow = makePreviewRow({
        id: "row_split",
        status: "time_mismatch",
        rawText: longRawText,
        systemLessonId: mainLesson.id,
        issues: ["云端同课程时间不一致"]
      });
      const importMissingRow = makePreviewRow({
        id: "row_import_missing",
        fileName: "云端课表",
        title: classCourse.name,
        courseTypeHint: "class" as CourseType,
        matchedCourseId: classCourse.id,
        status: "import_missing",
        systemLessonId: linkedLesson.id,
        rawText: "",
        issues: ["教务 Excel 没有对应云端课节"]
      });
      const resolutions = {
        [resolutionKey(splitMergeRow)]: {
          status: "split_merge_ok" as const,
          note: "拆分合并确认",
          linkedSystemLessonIds: [linkedLesson.id],
          updatedAt: "2026-06-22T03:00:00.000Z"
        }
      };

      const nextState = buildNextScheduleImportState(vault, {
        rawLessons: [splitMergeRow],
        mapping: { [splitMergeRow.title]: oneOnOneCourse.id },
        resolutions,
        fileCampusOverrides: { [splitMergeRow.fileName]: campus.id },
        selectedMonth: "2026-06",
        selectedDate: "2026-06-05",
        rows: [splitMergeRow, importMissingRow],
        summary: summarizeImportPreview([splitMergeRow, importMissingRow]),
        splitMergeExcludedLessonIds: [mainLesson.id]
      });
      const systemStats = summarizeScheduleImportSystemLessons(vault, [splitMergeRow, importMissingRow], resolutions);

      expect(nextState.reviews).toHaveLength(savedScheduleImportReviewLimit);
      expect(nextState.reviews[0]?.id).toBe("schedule-import-2026-06-22T04:00:00.000Z");
      expect(nextState.reviews.map((review) => review.id)).not.toContain("previous_5");
      expect(nextState.splitMergeExcludedLessonIds).toEqual([mainLesson.id]);
      expect(systemStats).toEqual({
        count: 1,
        hours: 1,
        completedCount: 1,
        completedHours: 1,
        completedAmount: 80
      });

      const savedReview = nextState.reviews[0];
      if (!savedReview) throw new Error("Expected saved review");
      expect(savedReview.rawLessonCount).toBe(1);
      expect(savedReview.summary).toMatchObject({
        total: 2,
        timeMismatch: 1,
        importMissing: 1,
        systemLessonCount: 1,
        systemCompletedLessonCount: 1,
        systemCompletedAmount: 80
      });
      expect(savedReview.rows[0]?.rawText).toHaveLength(240);
      expect(savedReview.rows[0]).toMatchObject({
        resolutionStatus: "split_merge_ok",
        resolutionNote: "拆分合并确认",
        linkedSystemLessonIds: [linkedLesson.id]
      });
      expect(savedReviewEffectiveCounts(savedReview)).toEqual({
        matched: 2,
        attendanceMismatch: 0,
        timeMismatch: 0,
        courseMismatch: 0,
        systemMissing: 0,
        importMissing: 0,
        needsMapping: 0
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("excludes not-due imported rows and uses system billing hours after confirmation", () => {
    const systemLesson = makeLesson({
      id: "lesson_class_confirmed",
      courseGroupId: classCourse.id,
      type: "class",
      startTime: "10:00",
      endTime: "12:00",
      expectedStudentIds: ["student_ming", "student_hong", "student_li"],
      attendance: [
        { studentId: "student_ming", status: "attended" },
        { studentId: "student_hong", status: "attended" },
        { studentId: "student_li", status: "attended" }
      ],
      feeSnapshot: { amount: 80, hours: 2 }
    });
    const vault = makeVault({ lessons: [systemLesson] });
    const confirmedRow = makePreviewRow({
      id: "row_confirmed",
      title: classCourse.name,
      courseTypeHint: "class" as CourseType,
      startTime: "10:00",
      endTime: "11:50",
      matchedCourseId: undefined,
      mappedCourseId: undefined,
      status: "time_mismatch",
      systemLessonId: systemLesson.id,
      issues: ["云端同课程时间不一致"]
    });
    const notDueRow = makePreviewRow({
      id: "row_not_due",
      status: "system_missing",
      systemLessonId: undefined,
      issues: ["云端课表缺少这节教务 Excel 课节"]
    });
    const resolutions = {
      [resolutionKey(confirmedRow)]: {
        status: "accepted" as const,
        note: "确认按云端课时统计",
        updatedAt: "2026-06-22T05:00:00.000Z"
      },
      [resolutionKey(notDueRow)]: {
        status: "not_due" as const,
        note: "课程未到日期",
        updatedAt: "2026-06-22T05:00:00.000Z"
      }
    };

    expect(summarizeScheduleImportImportedLessons(vault, [confirmedRow], {}).hours).toBeCloseTo(1.83, 2);
    expect(summarizeScheduleImportImportedLessons(vault, [confirmedRow, notDueRow], resolutions)).toEqual({
      rawCount: 2,
      count: 1,
      hours: 2,
      excludedCount: 1
    });
  });
});
