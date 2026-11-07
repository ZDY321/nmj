import type {
  AiScheduleSession,
  CourseGroup,
  DeletedLessonSource,
  Lesson,
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

export type AiDraftContext = Omit<ApplyAiScheduleDraftOptions, "vault" | "session"> & { nextVault: TeacherVault; messages: string[]; blockers: string[] };
