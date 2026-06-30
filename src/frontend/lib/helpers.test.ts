import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { linkSyncedLessonsToPreviousLessons, previousLesson } from "@/frontend/lib/helpers";
import type { CourseGroup, Lesson, TeacherVault } from "@/shared/types";

const course: CourseGroup = {
  id: "course_1",
  name: "Math",
  type: "one_on_one",
  subject: "Math",
  defaultCampusId: "campus_1",
  studentIds: ["student_1"],
  feeRule: { mode: "fixed", fixedFee: 100 },
  status: "active"
};

function makeVault(lessons: Lesson[] = []): TeacherVault {
  const vault = createEmptyVault("tester");
  vault.campuses = [{ id: "campus_1", name: "Main" }];
  vault.students = [{ id: "student_1", name: "Student", status: "active" }];
  vault.courseGroups = [course];
  vault.lessons = lessons;
  return vault;
}

function makeLesson(id: string, date: string, patch: Partial<Lesson> = {}): Lesson {
  return {
    id,
    date,
    startTime: "19:00",
    endTime: "21:00",
    courseGroupId: course.id,
    campusId: course.defaultCampusId,
    type: course.type,
    status: "completed",
    expectedStudentIds: ["student_1"],
    attendance: [{ studentId: "student_1", status: "attended" }],
    feeSnapshot: { amount: 0, hours: 2 },
    content: { taught: "", homework: "", nextLessonReminder: "" },
    ...patch
  };
}

describe("lesson timeline helpers", () => {
  it("uses the last actually taught lesson as the previous content source", () => {
    const taughtLesson = makeLesson("lesson_29", "2026-07-29", {
      content: { taught: "讲了一元二次方程", homework: "完成第 3 讲", nextLessonReminder: "" }
    });
    const makeupPendingLesson = makeLesson("lesson_30", "2026-07-30", {
      status: "makeup_pending",
      attendance: [{ studentId: "student_1", status: "makeup_pending" }],
      content: { taught: "", homework: "", nextLessonReminder: "" }
    });
    const currentLesson = makeLesson("lesson_31", "2026-07-31", { status: "scheduled" });
    const vault = makeVault([taughtLesson, makeupPendingLesson, currentLesson]);

    expect(previousLesson(vault, currentLesson)?.id).toBe(taughtLesson.id);
  });

  it("ignores stale sync sources that point to cancelled or makeup-pending lessons", () => {
    const taughtLesson = makeLesson("lesson_29", "2026-07-29");
    const cancelledLesson = makeLesson("lesson_30", "2026-07-30", { status: "cancelled" });
    const currentLesson = makeLesson("lesson_31", "2026-07-31", {
      status: "scheduled",
      syncSourceLessonId: cancelledLesson.id,
      syncSourceDate: cancelledLesson.date
    });
    const vault = makeVault([taughtLesson, cancelledLesson, currentLesson]);

    expect(previousLesson(vault, currentLesson)?.id).toBe(taughtLesson.id);
  });

  it("does not link synced lessons to makeup-pending timeline entries", () => {
    const taughtLesson = makeLesson("lesson_29", "2026-07-29");
    const makeupPendingLesson = makeLesson("lesson_30", "2026-07-30", { status: "makeup_pending" });
    const syncedLesson = makeLesson("lesson_31", "2026-07-31", { status: "scheduled" });
    const vault = makeVault([taughtLesson, makeupPendingLesson]);

    const [linkedLesson] = linkSyncedLessonsToPreviousLessons(vault, [syncedLesson]);

    expect(linkedLesson.syncSourceLessonId).toBe(taughtLesson.id);
    expect(linkedLesson.syncSourceDate).toBe(taughtLesson.date);
  });
});