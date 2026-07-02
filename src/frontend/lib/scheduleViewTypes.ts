import type { CourseType } from "@/shared/types";
import type { ViewKey } from "@/frontend/lib/helpers";

export type LessonScope = "month" | "day" | "range" | "week";
export type CourseTypeFilter = "all" | CourseType;
export type SchedulePanel = "ai" | "schedule" | "adjust" | "calendar" | "records" | "studentStats" | "trash";

export type CalendarOverviewReturnFocus = {
  selectedDate: string;
  month: string;
  overviewPage: "month" | "week";
  weekCampusFilter: string;
  weekGradeFilter: string;
  weekSubjectFilter: string;
  weekStudentFilter: string;
};

export type ExternalLessonReturnTarget = {
  kind: "view";
  view: ViewKey;
  label: string;
  calendarFocus?: CalendarOverviewReturnFocus;
  payrollPanel?: "review" | "reconcile" | "mapping" | "guide";
};

export type InternalLessonReturnTarget = {
  kind: "panel";
  panel: Exclude<SchedulePanel, "records">;
  label: string;
  calendarDate?: string;
  calendarMonth?: string;
  calendarMode?: "schedule" | "view";
  calendarDetailDate?: string | null;
};

export type LessonReturnTarget = ExternalLessonReturnTarget | InternalLessonReturnTarget;

export type CalendarFocus = {
  date: string;
  lessonId?: string;
  targetPanel?: SchedulePanel;
  calendarMode?: "schedule" | "view";
  scheduleDraft?: {
    courseGroupId?: string;
    startTime?: string;
    endTime?: string;
  };
  nonce: number;
  returnTarget?: ExternalLessonReturnTarget | null;
} | null;
