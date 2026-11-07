import { useMemo, useState } from "react";
import type { CourseGroup, CourseType, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import type { buildStudentCourseIndex } from "@/frontend/lib/studentCourseIndex";
import { matchesKeywordSearch } from "@/frontend/lib/archiveSearch";
import { todayIso } from "@/frontend/lib/calculations";
import { countFutureSyncableLessons } from "@/frontend/lib/courseTypeUsage";
import { campusName, compareByName, courseTypeLabel, studentNames } from "@/frontend/lib/helpers";

type CourseArchiveOptions = {
  vault: TeacherVault;
  courseGroupOptions: CourseGroup[];
  studentCourseIndex: ReturnType<typeof buildStudentCourseIndex>;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  onUpdateCourses: (courses: CourseGroup[]) => void;
  onSyncCoursesToLessons: (courseIds: string[]) => void;
};

export function useCourseArchive({ vault, courseGroupOptions, studentCourseIndex, confirm, onUpdateCourses, onSyncCoursesToLessons }: CourseArchiveOptions) {
  const [courseSearch, setCourseSearch] = useState("");
  const [courseStatusFilter, setCourseStatusFilter] = useState<"active" | "paused" | "all">("active");
  const [courseTypeFilter, setCourseTypeFilter] = useState<"all" | CourseType>("all");
  const [courseGradeFilter, setCourseGradeFilter] = useState("all");
  const [courseSubjectFilter, setCourseSubjectFilter] = useState("all");
  const [courseCampusFilter, setCourseCampusFilter] = useState("all");
  const [courseArchiveMessage, setCourseArchiveMessage] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const normalizedCourseSearch = courseSearch.trim().toLowerCase();
  const courseGradeFilterOptions = Array.from(new Set(vault.courseGroups.flatMap((course) =>
    course.studentIds.map((studentId) => studentCourseIndex.studentById.get(studentId)?.grade).filter(Boolean) as string[]
  ))).sort(compareByName);
  const hasUnsetGradeFilterOption = vault.courseGroups.some((course) => course.studentIds.length === 0 || course.studentIds.some((studentId) => !studentCourseIndex.studentById.get(studentId)?.grade));
  const visibleCourses = courseGroupOptions
    .filter((course) => {
      const courseStudents = studentCourseIndex.studentsByCourse.get(course) ?? [];
      const matchesType = courseTypeFilter === "all" || course.type === courseTypeFilter;
      const hasActiveStudent = studentCourseIndex.coursesWithActiveStudents.has(course);
      const matchesStatus =
        courseStatusFilter === "all" ||
        (courseStatusFilter === "active" ? course.status === "active" && hasActiveStudent : course.status === "paused" || !hasActiveStudent);
      const matchesGrade =
        courseGradeFilter === "all" ||
        (courseGradeFilter === "__unset"
          ? courseStudents.length === 0 || courseStudents.some((student) => !student.grade)
          : courseStudents.some((student) => student.grade === courseGradeFilter));
      const matchesSubject = courseSubjectFilter === "all" || course.subject === courseSubjectFilter;
      const matchesCampus = courseCampusFilter === "all" || course.defaultCampusId === courseCampusFilter;
      if (!matchesStatus || !matchesType || !matchesGrade || !matchesSubject || !matchesCampus) return false;
      if (!normalizedCourseSearch) return true;
      const searchable = [
        course.name,
        course.subject,
        courseTypeLabel(vault, course.type),
        campusName(vault, course.defaultCampusId),
        studentNames(vault, course.studentIds),
        course.note ?? "",
        ...courseStudents.flatMap((student) => [student.name, student.grade ?? "", student.school ?? "", student.note ?? ""])
      ].join(" ").toLowerCase();
      return matchesKeywordSearch(searchable, normalizedCourseSearch);
    })
    .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id));
  const activeCourses = vault.courseGroups.filter((course) => course.status === "active" && studentCourseIndex.coursesWithActiveStudents.has(course)).length;
  const referencedCourseIds = useMemo(() => new Set(vault.lessons.map((lesson) => lesson.courseGroupId)), [vault.lessons]);

  function courseInUse(courseId: string): boolean {
    return referencedCourseIds.has(courseId);
  }

  function courseHasActiveStudent(course: CourseGroup): boolean {
    return studentCourseIndex.coursesWithActiveStudents.has(course);
  }

  function requestSyncVisibleCoursesToLessons() {
    const courses = visibleCourses;
    const lessonCount = countFutureSyncableLessons(vault, new Set(courses.map((course) => course.id)), todayIso());
    if (courses.length === 0) {
      setCourseArchiveMessage("当前筛选下没有课程档案，不需要同步。");
      return;
    }
    if (lessonCount === 0) {
      setCourseArchiveMessage(`当前筛选下 ${courses.length} 个课程档案没有未来待上课课节，不需要同步。`);
      return;
    }
    confirm({
      title: "同步当前筛选课程？",
      description: `会按当前课程档案列表筛选出的 ${courses.length} 个课程档案，刷新 ${lessonCount} 节未来待上课课节的班型、校区、学生名单和金额快照。已完成或历史课节保留原信息。`,
      confirmLabel: "同步刷新",
      onConfirm: () => {
        onSyncCoursesToLessons(courses.map((course) => course.id));
        setCourseArchiveMessage(`同步完成：已刷新 ${courses.length} 个课程档案下的 ${lessonCount} 节未来待上课课节。`);
      }
    });
  }

  function toggleCourseSelection(courseId: string) {
    setSelectedCourseIds((current) =>
      current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]
    );
  }

  function toggleVisibleCourseSelection(checked: boolean) {
    const visibleIds = visibleCourses.map((course) => course.id);
    setSelectedCourseIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      const visibleIdSet = new Set(visibleIds);
      return current.filter((id) => !visibleIdSet.has(id));
    });
  }

  function updateSelectedCoursesStatus(status: CourseGroup["status"]) {
    const selectedCourses = visibleCourses.filter((course) => selectedCourseIds.includes(course.id));
    if (selectedCourses.length === 0) return;
    const apply = () => {
      const selectedIdSet = new Set(selectedCourses.map((course) => course.id));
      onUpdateCourses(selectedCourses.map((course) => ({ ...course, status })));
      setSelectedCourseIds((current) => current.filter((id) => !selectedIdSet.has(id)));
      setCourseArchiveMessage(`${status === "active" ? "启用" : "结课"}完成：已处理 ${selectedCourses.length} 个课程档案。`);
    };
    if (status === "paused") {
      confirm({
        title: `将选中的 ${selectedCourses.length} 个课程设为结课？`,
        description: "课程结课后仍会保留历史课时；需要继续排课时可重新启用。",
        confirmLabel: "结课",
        tone: "danger",
        onConfirm: apply
      });
      return;
    }
    apply();
  }

  return {
    courseSearch,
    setCourseSearch,
    courseStatusFilter,
    setCourseStatusFilter,
    courseTypeFilter,
    setCourseTypeFilter,
    courseGradeFilter,
    setCourseGradeFilter,
    courseSubjectFilter,
    setCourseSubjectFilter,
    courseCampusFilter,
    setCourseCampusFilter,
    courseArchiveMessage,
    selectedCourseIds,
    gradeFilterOptions: courseGradeFilterOptions,
    hasUnsetGradeFilterOption,
    visibleCourses,
    activeCourses,
    courseInUse,
    courseHasActiveStudent,
    onRequestSyncVisibleCourses: requestSyncVisibleCoursesToLessons,
    onToggleCourseSelection: toggleCourseSelection,
    onToggleVisibleCourseSelection: toggleVisibleCourseSelection,
    onUpdateSelectedCoursesStatus: updateSelectedCoursesStatus
  };
}
