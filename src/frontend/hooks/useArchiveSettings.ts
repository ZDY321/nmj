import { useMemo, useState, type FormEvent } from "react";
import type { Campus, TeacherVault } from "@/shared/types";
import { makeId } from "@/frontend/lib/crypto";
import { subjectOptionsForVault } from "@/frontend/lib/helpers";

interface ArchiveSettingsOptions {
  vault: TeacherVault;
  onAddCampus: (campus: Campus) => void;
  onAddSubject: (subject: string) => void;
  onUpdateSubject: (previousSubject: string, nextSubject: string) => void;
  onAddGrade: (grade: string) => void;
  onUpdateGrade: (previousGrade: string, nextGrade: string) => void;
}

const defaultGradeOptions = ["初一", "初二", "初三"];

export function useArchiveSettings({ vault, onAddCampus, onAddSubject, onUpdateSubject, onAddGrade, onUpdateGrade }: ArchiveSettingsOptions) {
  const configuredGradeOptions = useMemo(() => Array.from(new Set([
    ...(vault.preferences?.grades?.map((grade) => grade.trim()).filter(Boolean) ?? defaultGradeOptions),
    ...vault.students.map((student) => student.grade?.trim()).filter((grade): grade is string => Boolean(grade))
  ])), [vault.preferences?.grades, vault.students]);
  const subjectOptions = useMemo(() => subjectOptionsForVault(vault), [vault.preferences?.subjects, vault.courseGroups, vault.lessons]);
  const usage = useMemo(() => {
    const campuses = new Set<string | undefined>();
    const subjects = new Set<string>();
    const grades = new Set<string | undefined>();
    for (const student of vault.students) {
      campuses.add(student.defaultCampusId);
      grades.add(student.grade);
    }
    for (const course of vault.courseGroups) {
      campuses.add(course.defaultCampusId);
      subjects.add(course.subject);
    }
    for (const lesson of vault.lessons) campuses.add(lesson.campusId);
    return { campuses, subjects, grades };
  }, [vault.students, vault.courseGroups, vault.lessons]);
  const [campusNameInput, setCampusNameInput] = useState("");
  const [campusAddressInput, setCampusAddressInput] = useState("");
  const [campusNoteInput, setCampusNoteInput] = useState("");
  const [subjectInput, setSubjectInput] = useState("");
  const [editingSubject, setEditingSubject] = useState("");
  const [editingSubjectInput, setEditingSubjectInput] = useState("");
  const [gradeInput, setGradeInput] = useState("");
  const [editingGrade, setEditingGrade] = useState("");
  const [editingGradeInput, setEditingGradeInput] = useState("");
  const [gradeMessage, setGradeMessage] = useState("");
  const [subjectMessage, setSubjectMessage] = useState("");
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);

  function campusInUse(campusId: string): boolean {
    return usage.campuses.has(campusId);
  }

  function subjectInUse(subject: string): boolean {
    return usage.subjects.has(subject);
  }

  function gradeInUse(grade: string): boolean {
    return usage.grades.has(grade);
  }

  function addCampus(e: FormEvent) {
    e.preventDefault();
    if (!campusNameInput.trim()) return;
    onAddCampus({
      id: makeId("campus"),
      name: campusNameInput.trim(),
      address: campusAddressInput.trim() || undefined,
      note: campusNoteInput.trim() || undefined
    });
    setCampusNameInput("");
    setCampusAddressInput("");
    setCampusNoteInput("");
  }

  function addSubject() {
    const subject = subjectInput.trim();
    if (!subject) return;
    if (subjectOptions.some((item) => item === subject)) {
      setSubjectMessage(`已存在科目「${subject}」。`);
      return;
    }
    onAddSubject(subject);
    setSubjectInput("");
    setSubjectMessage("");
  }

  function addGrade() {
    const grade = gradeInput.trim();
    if (!grade) return;
    if (configuredGradeOptions.some((item) => item === grade)) {
      setGradeMessage(`已存在年级「${grade}」。`);
      return;
    }
    onAddGrade(grade);
    setGradeInput("");
    setGradeMessage("");
  }

  function startEditGrade(grade: string) {
    setEditingGrade(grade);
    setEditingGradeInput(grade);
    setGradeMessage("");
  }

  function cancelEditGrade() {
    setEditingGrade("");
    setEditingGradeInput("");
    setGradeMessage("");
  }

  function saveGrade() {
    const next = editingGradeInput.trim();
    if (!editingGrade || !next) return;
    if (next !== editingGrade && configuredGradeOptions.includes(next)) {
      setGradeMessage(`已存在年级「${next}」。`);
      return;
    }
    onUpdateGrade(editingGrade, next);
    cancelEditGrade();
  }

  function startEditSubject(subject: string) {
    setEditingSubject(subject);
    setEditingSubjectInput(subject);
    setSubjectMessage("");
  }

  function cancelEditSubject() {
    setEditingSubject("");
    setEditingSubjectInput("");
    setSubjectMessage("");
  }

  function saveSubject() {
    const nextSubject = editingSubjectInput.trim();
    if (!editingSubject || !nextSubject) return;
    if (nextSubject !== editingSubject && subjectOptions.some((subject) => subject === nextSubject)) {
      setSubjectMessage(`已存在科目「${nextSubject}」。`);
      return;
    }
    onUpdateSubject(editingSubject, nextSubject);
    cancelEditSubject();
  }

  return {
    configuredGradeOptions,
    subjectOptions,
    setGradeMessage,
    panelProps: {
      campusNameInput, setCampusNameInput, campusAddressInput, setCampusAddressInput,
      campusNoteInput, setCampusNoteInput, editingCampus, setEditingCampus, campusInUse,
      onAddCampus: addCampus,
      subjectOptions, subjectInput, setSubjectInput, editingSubject, editingSubjectInput,
      setEditingSubjectInput, subjectMessage, setSubjectMessage, subjectInUse,
      onAddSubject: addSubject, onStartEditSubject: startEditSubject,
      onSaveSubject: saveSubject, onCancelEditSubject: cancelEditSubject,
      gradeOptions: configuredGradeOptions, gradeInput, setGradeInput, editingGrade,
      editingGradeInput, setEditingGradeInput, gradeMessage, gradeInUse,
      onAddGrade: addGrade, onStartEditGrade: startEditGrade,
      onSaveGrade: saveGrade, onCancelEditGrade: cancelEditGrade
    }
  };
}
