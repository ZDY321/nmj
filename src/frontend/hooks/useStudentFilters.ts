import { useState } from "react";
import type { CourseGroup, CourseType, Student, TeacherVault } from "@/shared/types";
import { compareByName, matchesGradeFilter } from "@/frontend/lib/helpers";

export type StudentStatusFilter = "active" | "transition" | "archived" | "all";

type StudentFiltersOptions = {
  vault: TeacherVault;
  coursesByStudentId: ReadonlyMap<string, CourseGroup[]>;
};

export function useStudentFilters({ vault, coursesByStudentId }: StudentFiltersOptions) {
  const [gradeFilter, setGradeFilter] = useState("all");
  const [studentCampusFilter, setStudentCampusFilter] = useState("all");
  const [studentStatusFilter, setStudentStatusFilter] = useState<StudentStatusFilter>("active");
  const [studentTrialFilter, setStudentTrialFilter] = useState<"all" | "trial" | "regular">("all");
  const [studentCourseTypeFilter, setStudentCourseTypeFilter] = useState<"all" | CourseType>("all");
  const [studentSubjectFilter, setStudentSubjectFilter] = useState("all");
  const [archiveSearch, setArchiveSearch] = useState("");
  const normalizedArchiveSearch = archiveSearch.trim().toLowerCase();
  const gradeFilterOptions = Array.from(new Set(vault.students.map((student) => student.grade).filter(Boolean) as string[]))
    .sort(compareByName);
  const hasStudentsWithoutGrade = vault.students.some((student) => !student.grade);
  const hasUnsetGradeFilterOption = hasStudentsWithoutGrade || vault.courseGroups.some((course) => course.studentIds.length === 0);
  const visibleStudents = vault.students
    .filter((student) => {
      const matchesStatus = matchesStudentStatusFilter(student, studentStatusFilter);
      const matchesTrial =
        studentTrialFilter === "all" ||
        (studentTrialFilter === "trial" ? Boolean(student.temporaryTrial) : !student.temporaryTrial);
      const matchesGrade = matchesGradeFilter(student.grade, gradeFilter);
      const matchesCampus = studentCampusFilter === "all" || student.defaultCampusId === studentCampusFilter;
      const studentCourses = coursesByStudentId.get(student.id) ?? [];
      const matchesType = studentCourseTypeFilter === "all" || studentCourses.some((course) => course.type === studentCourseTypeFilter);
      const matchesSubject = studentSubjectFilter === "all" || studentCourses.some((course) => course.subject === studentSubjectFilter);
      const matchesSearch =
        !normalizedArchiveSearch ||
        student.name.toLowerCase().includes(normalizedArchiveSearch) ||
        (student.school ?? "").toLowerCase().includes(normalizedArchiveSearch) ||
        (student.note ?? "").toLowerCase().includes(normalizedArchiveSearch);
      return matchesStatus && matchesTrial && matchesGrade && matchesCampus && matchesType && matchesSubject && matchesSearch;
    })
    .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id));

  return {
    archiveSearch,
    setArchiveSearch,
    gradeFilter,
    setGradeFilter,
    studentCampusFilter,
    setStudentCampusFilter,
    studentStatusFilter,
    setStudentStatusFilter,
    studentTrialFilter,
    setStudentTrialFilter,
    studentCourseTypeFilter,
    setStudentCourseTypeFilter,
    studentSubjectFilter,
    setStudentSubjectFilter,
    gradeFilterOptions,
    hasUnsetGradeFilterOption,
    visibleStudents
  };
}

function matchesStudentStatusFilter(student: Student, filter: StudentStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "archived") return student.status === "paused";
  return student.status === filter;
}
