import { useEffect, useState, type FormEvent } from "react";
import type { Student, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { makeId } from "@/frontend/lib/crypto";

type StudentCreationOptions = {
  vault: TeacherVault;
  preferredCampusId: string;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  onAddStudent: (student: Student) => void;
  onAddStudents: (students: Student[]) => void;
};

export function useStudentCreation({ vault, preferredCampusId, confirm, onAddStudent, onAddStudents }: StudentCreationOptions) {
  const [studentNameInput, setStudentNameInput] = useState("");
  const [studentGradeInput, setStudentGradeInput] = useState("");
  const [studentSchoolInput, setStudentSchoolInput] = useState("");
  const [studentTemporaryTrialInput, setStudentTemporaryTrialInput] = useState(false);
  const [studentCampusInput, setStudentCampusInput] = useState(preferredCampusId);
  const [studentNoteInput, setStudentNoteInput] = useState("");
  const [batchStudentText, setBatchStudentText] = useState("");
  const [batchStudentMessage, setBatchStudentMessage] = useState("");
  const campusOptionIds = [vault.profile.homeCampusId ?? "", ...vault.campuses.map((campus) => campus.id)].join("|");

  useEffect(() => {
    const fallbackCampusId = preferredCampusId;
    setStudentCampusInput((current) =>
      current && vault.campuses.some((campus) => campus.id === current) ? current : fallbackCampusId
    );
  }, [campusOptionIds]);

  function addStudent(e: FormEvent) {
    e.preventDefault();
    submitStudent();
  }

  function submitStudent(forceDuplicate = false, forceMissingGrade = false) {
    if (!studentNameInput.trim()) return;
    const resolvedGrade = studentGradeInput;
    const resolvedCampusId = studentCampusInput || preferredCampusId;
    if (!resolvedGrade && !forceMissingGrade) {
      confirm({
        title: "未设置学生年级？",
        description: "学生年级会影响班课同年级筛选和暑假班、课时费结算判断。建议先设置年级后再添加。",
        confirmLabel: "仍然添加",
        cancelLabel: "返回设置",
        tone: "danger",
        onConfirm: () => submitStudent(forceDuplicate, true)
      });
      return;
    }
    const duplicateStudent = findDuplicateStudent(studentNameInput.trim(), resolvedGrade, resolvedCampusId);
    if (duplicateStudent && !forceDuplicate) {
      const duplicateStatus = duplicateStudent.status === "paused" ? "，当前已归档" : duplicateStudent.status === "transition" ? "，当前为过渡期" : "";
      confirm({
        title: "可能重复添加学生",
        description: `已有「${duplicateStudent.name}」使用相同姓名、年级和校区${duplicateStatus}。建议先确认是否需要恢复或编辑原档案。`,
        confirmLabel: "仍然添加",
        tone: "danger",
        onConfirm: () => submitStudent(true, forceMissingGrade)
      });
      return;
    }
    onAddStudent({
      id: makeId("student"),
      name: studentNameInput.trim(),
      grade: resolvedGrade || undefined,
      school: studentSchoolInput.trim() || undefined,
      temporaryTrial: studentTemporaryTrialInput,
      defaultCampusId: resolvedCampusId,
      note: studentNoteInput.trim() || undefined,
      status: "active"
    });
    setStudentNameInput("");
    setStudentGradeInput("");
    setStudentSchoolInput("");
    setStudentTemporaryTrialInput(false);
    setStudentNoteInput("");
  }

  function addBatchStudents() {
    submitBatchStudents();
  }

  function submitBatchStudents(forceMissingGrade = false) {
    const rows = parseStudentBatchRows(batchStudentText).filter((row) => !row.isHeader);
    if (rows.length === 0) {
      setBatchStudentMessage("请先粘贴至少一行学生信息。");
      return;
    }

    const defaultGrade = studentGradeInput;
    const hasMissingGrade = rows.some((row) => !normalizeStudentGradeValue(row.grade) && !defaultGrade);
    if (hasMissingGrade && !forceMissingGrade) {
      confirm({
        title: "批量添加包含未设置年级的学生？",
        description: "学生年级会影响班课同年级筛选和暑假班、课时费结算判断。建议先设置默认年级，或在每行第 2 列写年级。",
        confirmLabel: "仍然添加",
        cancelLabel: "返回设置",
        tone: "danger",
        onConfirm: () => submitBatchStudents(true)
      });
      return;
    }

    const resolvedCampusId = studentCampusInput || preferredCampusId || undefined;
    const defaultSchool = studentSchoolInput.trim();
    const defaultNote = studentNoteInput.trim();
    const batchDuplicateKeys = new Set<string>();
    const studentsToAdd: Student[] = [];
    let skippedDuplicateCount = 0;

    rows.forEach((row) => {
      const name = row.name.trim();
      const grade = normalizeStudentGradeValue(row.grade) || defaultGrade || undefined;
      const school = row.school?.trim() || defaultSchool || undefined;
      const note = row.note?.trim() || defaultNote || undefined;
      const duplicateKey = studentDuplicateKey(name, grade, resolvedCampusId);
      if (batchDuplicateKeys.has(duplicateKey) || findDuplicateStudent(name, grade, resolvedCampusId)) {
        skippedDuplicateCount += 1;
        return;
      }
      batchDuplicateKeys.add(duplicateKey);
      studentsToAdd.push({
        id: makeId("student"),
        name,
        grade,
        school,
        temporaryTrial: studentTemporaryTrialInput,
        defaultCampusId: resolvedCampusId,
        note,
        status: "active"
      });
    });

    if (studentsToAdd.length === 0) {
      setBatchStudentMessage(skippedDuplicateCount > 0 ? `没有新增学生，已跳过 ${skippedDuplicateCount} 条重复记录。` : "没有识别到可添加的学生。");
      return;
    }

    onAddStudents(studentsToAdd);
    setBatchStudentText("");
    setBatchStudentMessage(`已批量添加 ${studentsToAdd.length} 名学生${skippedDuplicateCount > 0 ? `，跳过 ${skippedDuplicateCount} 条重复记录` : ""}。`);
  }

  function findDuplicateStudent(name: string, grade: string | undefined, campusId: string | undefined): Student | undefined {
    const normalizedName = normalizeStudentDuplicateValue(name);
    const normalizedGrade = normalizeStudentDuplicateValue(grade ?? "");
    const normalizedCampusId = campusId ?? "";
    return vault.students.find(
      (student) =>
        normalizeStudentDuplicateValue(student.name) === normalizedName &&
        normalizeStudentDuplicateValue(student.grade ?? "") === normalizedGrade &&
        (student.defaultCampusId ?? "") === normalizedCampusId
    );
  }

  return {
    studentNameInput,
    setStudentNameInput,
    studentGradeInput,
    setStudentGradeInput,
    studentSchoolInput,
    setStudentSchoolInput,
    studentTemporaryTrialInput,
    setStudentTemporaryTrialInput,
    studentCampusInput,
    setStudentCampusInput,
    studentNoteInput,
    setStudentNoteInput,
    batchStudentText,
    setBatchStudentText,
    batchStudentMessage,
    onAddStudent: addStudent,
    onBatchAddStudents: addBatchStudents
  };
}

type ParsedStudentBatchRow = {
  name: string;
  grade?: string;
  school?: string;
  note?: string;
  isHeader: boolean;
};

function parseStudentBatchRows(text: string): ParsedStudentBatchRow[] {
  return text
    .split(/\r?\n/)
    .map(parseStudentBatchLine)
    .filter((row): row is ParsedStudentBatchRow => Boolean(row));
}

function parseStudentBatchLine(line: string): ParsedStudentBatchRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const hasExplicitDelimiter = /[｜|\t,，]/.test(trimmed);
  const parts = hasExplicitDelimiter
    ? trimTrailingEmptyParts(trimmed.split(/[｜|\t,，]/).map((part) => part.trim()))
    : trimmed.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  const [name = "", grade, school, ...noteParts] = parts;
  if (!name) return null;
  const note = noteParts.join("，");
  return {
    name,
    grade,
    school,
    note: note || undefined,
    isHeader: isStudentBatchHeader(name, grade, school)
  };
}

function trimTrailingEmptyParts(parts: string[]): string[] {
  const nextParts = [...parts];
  while (nextParts.length > 0 && !nextParts[nextParts.length - 1]) {
    nextParts.pop();
  }
  return nextParts;
}

function isStudentBatchHeader(name: string, grade?: string, school?: string): boolean {
  const normalizedName = normalizeStudentDuplicateValue(name);
  if (normalizedName !== "姓名" && normalizedName !== "学生姓名") return false;
  const normalizedGrade = normalizeStudentDuplicateValue(grade ?? "");
  const normalizedSchool = normalizeStudentDuplicateValue(school ?? "");
  return !grade || normalizedGrade.includes("年级") || normalizedSchool.includes("学校");
}

function normalizeStudentGradeValue(value?: string): string {
  const grade = value?.trim() ?? "";
  return grade === "未设置年级" ? "" : grade;
}

function studentDuplicateKey(name: string, grade: string | undefined, campusId: string | undefined): string {
  return [
    normalizeStudentDuplicateValue(name),
    normalizeStudentDuplicateValue(grade ?? ""),
    campusId ?? ""
  ].join("|");
}

function normalizeStudentDuplicateValue(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}
