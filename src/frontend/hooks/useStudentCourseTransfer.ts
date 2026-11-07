import { useEffect, useState, type FormEvent } from "react";
import type { CourseGroup, CourseType, Student, StudentCourseTransition, TeacherVault } from "@/shared/types";
import { makeId } from "@/frontend/lib/crypto";
import { canAddStudentToCourse, courseTypeDefaultFeeRule } from "@/frontend/lib/courseFormRules";
import { courseTypeLabel, sortStudentsByName } from "@/frontend/lib/helpers";

type StudentCourseTransferOptions = {
  vault: TeacherVault;
  courseGroupOptions: CourseGroup[];
  preferredCampusId: string;
  subjectOptions: string[];
  courseTypeOptions: Array<{ value: CourseType }>;
  onTransferStudentCourse: (transition: StudentCourseTransition) => void;
};

export function useStudentCourseTransfer({ vault, courseGroupOptions, preferredCampusId, subjectOptions, courseTypeOptions, onTransferStudentCourse }: StudentCourseTransferOptions) {
  const activeStudentOptions = sortStudentsByName(vault.students.filter((student) => student.status !== "paused"));
  const [transferPanelOpen, setTransferPanelOpen] = useState(false);
  const [transferStudentId, setTransferStudentId] = useState(activeStudentOptions[0]?.id ?? "");
  const [transferCourseType, setTransferCourseType] = useState<CourseType>("trial");
  const [transferTargetMode, setTransferTargetMode] = useState<"new" | "existing">("new");
  const [transferTargetCourseId, setTransferTargetCourseId] = useState("");
  const [transferSubjectInput, setTransferSubjectInput] = useState("");
  const [transferCourseNameInput, setTransferCourseNameInput] = useState("");
  const [transferCampusInput, setTransferCampusInput] = useState(preferredCampusId);
  const [transferEndExisting, setTransferEndExisting] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const transferStudent = vault.students.find((student) => student.id === transferStudentId);
  const transferCurrentCourses = transferStudent
    ? courseGroupOptions.filter((course) => course.status === "active" && course.studentIds.includes(transferStudent.id))
    : [];
  const transferSubject = transferSubjectInput.trim() || transferCurrentCourses[0]?.subject || subjectOptions[0] || "未设置";
  const transferTargetCourses = transferStudent
    ? courseGroupOptions.filter(
        (course) =>
          course.status === "active" &&
          course.type === transferCourseType &&
          !course.studentIds.includes(transferStudent.id) &&
          canJoinCourse(vault, course, transferStudent)
      )
    : [];
  const transferTargetCourseIds = transferTargetCourses.map((course) => course.id).join("|");
  const activeStudentOptionIds = activeStudentOptions.map((student) => student.id).join("|");
  const campusOptionIds = [vault.profile.homeCampusId ?? "", ...vault.campuses.map((campus) => campus.id)].join("|");
  const courseTypeOptionIds = courseTypeOptions.map((option) => option.value).join("|");
  const subjectOptionIds = subjectOptions.join("|");

  // Keep option identities as dependencies so unrelated edits do not reset the draft.
  useEffect(() => {
    setTransferStudentId((current) =>
      activeStudentOptions.some((student) => student.id === current) ? current : activeStudentOptions[0]?.id ?? ""
    );
  }, [activeStudentOptionIds]);

  useEffect(() => {
    setTransferCampusInput(transferStudent?.defaultCampusId || preferredCampusId);
  }, [transferStudentId, campusOptionIds]);

  useEffect(() => {
    setTransferTargetCourseId((current) =>
      transferTargetCourses.some((course) => course.id === current) ? current : transferTargetCourses[0]?.id ?? ""
    );
  }, [transferTargetCourseIds]);

  useEffect(() => {
    const fallbackSubject = subjectOptions[0] ?? "未设置";
    setTransferSubjectInput((current) => (current && subjectOptions.includes(current) ? current : fallbackSubject));
  }, [subjectOptionIds]);

  useEffect(() => {
    if (courseTypeOptions.length === 0) return;
    const fallbackType = courseTypeOptions[0].value;
    if (!courseTypeOptions.some((option) => option.value === transferCourseType)) {
      setTransferCourseType(fallbackType);
    }
  }, [courseTypeOptionIds]);

  function applyStudentCourseTransfer(event: FormEvent) {
    event.preventDefault();
    if (!transferStudent) return;

    if (transferTargetMode === "existing") {
      const targetCourse = transferTargetCourses.find((course) => course.id === transferTargetCourseId);
      if (!targetCourse) {
        setTransferMessage("请选择一个可加入的目标课程。");
        return;
      }
      onTransferStudentCourse({
        studentId: transferStudent.id,
        targetCourseId: targetCourse.id,
        subject: targetCourse.subject,
        endExisting: transferEndExisting
      });
      setTransferMessage(`已将「${transferStudent.name}」调整到「${targetCourse.name}」。已有课时不受影响。`);
      return;
    }

    const nextCourseName = transferCourseNameInput.trim() || `${transferStudent.name}${courseTypeLabel(vault, transferCourseType)}`;
    const nextCourse: CourseGroup = {
      id: makeId("course"),
      name: nextCourseName,
      type: transferCourseType,
      subject: transferSubject,
      defaultCampusId: transferCampusInput || transferStudent.defaultCampusId || preferredCampusId,
      studentIds: [transferStudent.id],
      feeRule: courseTypeDefaultFeeRule(vault, transferCourseType),
      status: "active"
    };
    onTransferStudentCourse({
      studentId: transferStudent.id,
      newCourse: nextCourse,
      subject: nextCourse.subject,
      endExisting: transferEndExisting
    });
    setTransferCourseNameInput("");
    setTransferMessage(`已为「${transferStudent.name}」新建「${nextCourse.name}」。已有课时不受影响。`);
  }

  return {
    activeStudentOptions,
    transferPanelOpen,
    setTransferPanelOpen,
    transferStudentId,
    setTransferStudentId,
    transferStudent,
    transferCourseType,
    setTransferCourseType,
    transferTargetMode,
    setTransferTargetMode,
    transferTargetCourseId,
    setTransferTargetCourseId,
    transferSubjectInput,
    setTransferSubjectInput,
    transferCourseNameInput,
    setTransferCourseNameInput,
    transferCampusInput,
    setTransferCampusInput,
    transferEndExisting,
    setTransferEndExisting,
    transferMessage,
    transferCurrentCourses,
    transferTargetCourses,
    studentOptionLabel,
    onSubmit: applyStudentCourseTransfer
  };
}

function canJoinCourse(vault: TeacherVault, course: CourseGroup, student: Student): boolean {
  return student.status !== "paused" && canAddStudentToCourse(vault, course.type, course.feeRule, course.studentIds, student);
}

function studentOptionLabel(student: Student): string {
  return `${student.name} · ${student.grade || "未设置年级"}`;
}
