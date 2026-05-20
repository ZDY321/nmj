import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  NotebookPen,
  Save,
  Search,
  Target,
  Trash2,
  UserCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { getCourse } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import {
  campusName,
  compareByName,
  courseSubject,
  courseTypeLabel,
  findStudent,
  lessonStatusLabels,
  lessonStatusVariant,
  lessonStudentIds,
  sortCoursesByName,
  sortLessons,
  studentNames,
  subjectOptionsForVault
} from "@/frontend/lib/helpers";
import type {
  CourseGroup,
  Lesson,
  Student,
  StudentHomeworkStatus,
  StudentProgressRecord,
  StudentProgressStatus,
  TeacherVault
} from "@/shared/types";

type HomeworkFilter = "all" | StudentHomeworkStatus;
type ProgressFilter = "all" | StudentProgressStatus;

type ProgressDraft = {
  progressText: string;
  homeworkText: string;
  nextPlan: string;
  progressStatus: StudentProgressStatus;
  homeworkStatus: StudentHomeworkStatus;
  note: string;
};

type ProgressRow = {
  key: string;
  student: Student;
  course: CourseGroup;
  lessons: Lesson[];
  latestLesson?: Lesson;
  latestRecord?: StudentProgressRecord;
  latestLessonRecord?: StudentProgressRecord;
  displayRecord?: StudentProgressRecord;
  progressStatus: StudentProgressStatus;
  homeworkStatus: StudentHomeworkStatus;
  needsLatestRecord: boolean;
};

const progressStatusLabels: Record<StudentProgressStatus, string> = {
  on_track: "正常推进",
  review_needed: "需要复习",
  behind: "进度滞后",
  ahead: "进度超前"
};

const homeworkStatusLabels: Record<StudentHomeworkStatus, string> = {
  unassigned: "未布置",
  assigned: "待检查",
  checked: "已检查",
  partial: "部分完成",
  missing: "未完成"
};

const emptyDraft: ProgressDraft = {
  progressText: "",
  homeworkText: "",
  nextPlan: "",
  progressStatus: "on_track",
  homeworkStatus: "unassigned",
  note: ""
};

export function ProgressView({
  vault,
  onSaveProgressRecord,
  onDeleteProgressRecord
}: {
  vault: TeacherVault;
  onSaveProgressRecord: (record: StudentProgressRecord) => void;
  onDeleteProgressRecord: (recordId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [homeworkFilter, setHomeworkFilter] = useState<HomeworkFilter>("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [onlyFollowUp, setOnlyFollowUp] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [draft, setDraft] = useState<ProgressDraft>(emptyDraft);
  const { confirm, dialog } = useConfirmDialog();

  const progressRecords = vault.studentProgressRecords ?? [];
  const courseOptions = sortCoursesByName(vault.courseGroups);
  const subjectOptions = subjectOptionsForVault(vault);
  const normalizedQuery = query.trim().toLowerCase();

  const rows = useMemo(
    () => buildProgressRows(vault),
    [vault]
  );

  const visibleRows = rows
    .filter((row) => {
      const searchable = [
        row.student.name,
        row.student.grade ?? "",
        row.student.school ?? "",
        row.course.name,
        row.course.subject,
        courseTypeLabel(vault, row.course.type),
        row.latestLesson?.content.taught ?? "",
        row.latestLesson?.content.homework ?? "",
        row.displayRecord?.progressText ?? "",
        row.displayRecord?.homeworkText ?? "",
        row.displayRecord?.nextPlan ?? "",
        row.displayRecord?.note ?? ""
      ].join(" ").toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        normalizedQuery.split(/\s+/).filter(Boolean).every((term) => searchable.includes(term));
      const matchesCourse = courseFilter === "all" || row.course.id === courseFilter;
      const matchesSubject = subjectFilter === "all" || row.course.subject === subjectFilter;
      const matchesHomework = homeworkFilter === "all" || row.homeworkStatus === homeworkFilter;
      const matchesProgress = progressFilter === "all" || row.progressStatus === progressFilter;
      const matchesFollowUp = !onlyFollowUp || needsFollowUp(row);
      return matchesQuery && matchesCourse && matchesSubject && matchesHomework && matchesProgress && matchesFollowUp;
    })
    .sort((a, b) => {
      if (needsFollowUp(a) !== needsFollowUp(b)) return needsFollowUp(a) ? -1 : 1;
      const dateCompare = (b.latestLesson?.date ?? "").localeCompare(a.latestLesson?.date ?? "");
      return dateCompare || compareByName(a.student.name, b.student.name) || compareByName(a.course.name, b.course.name);
    });

  const selectedRow = visibleRows.find((row) => row.key === selectedKey) ?? visibleRows[0];
  const selectedLessons = selectedRow?.lessons ?? [];
  const effectiveLessonId = selectedLessons.some((lesson) => lesson.id === selectedLessonId)
    ? selectedLessonId
    : selectedRow?.latestLesson?.id ?? selectedLessons.at(-1)?.id ?? "";
  const selectedLesson = selectedLessons.find((lesson) => lesson.id === effectiveLessonId);
  const selectedRecord = selectedRow && selectedLesson
    ? progressRecords.find(
        (record) =>
          record.studentId === selectedRow.student.id &&
          record.courseGroupId === selectedRow.course.id &&
          record.lessonId === selectedLesson.id
      )
    : undefined;

  const rowsNeedingFollowUp = rows.filter(needsFollowUp).length;
  const rowsNeedingRecord = rows.filter((row) => row.needsLatestRecord).length;
  const assignedHomeworkRows = rows.filter((row) => row.homeworkStatus === "assigned").length;
  const checkedHomeworkRows = rows.filter((row) => row.homeworkStatus === "checked").length;

  useEffect(() => {
    if (!selectedRow) {
      setSelectedKey("");
      setSelectedLessonId("");
      return;
    }
    if (!selectedKey || !visibleRows.some((row) => row.key === selectedKey)) {
      setSelectedKey(selectedRow.key);
      setSelectedLessonId(selectedRow.latestLesson?.id ?? selectedRow.lessons.at(-1)?.id ?? "");
    }
  }, [selectedRow?.key, selectedKey, visibleRows]);

  useEffect(() => {
    if (!selectedRow || !selectedLesson) {
      setDraft(emptyDraft);
      return;
    }
    setDraft(recordToDraft(selectedRecord, selectedLesson));
  }, [selectedRow?.key, selectedLesson?.id, selectedRecord?.id, selectedRecord?.updatedAt]);

  function saveRecord() {
    if (!selectedRow || !selectedLesson) return;
    onSaveProgressRecord({
      id: selectedRecord?.id ?? makeId("progress"),
      studentId: selectedRow.student.id,
      courseGroupId: selectedRow.course.id,
      lessonId: selectedLesson.id,
      date: selectedLesson.date,
      progressText: draft.progressText.trim(),
      homeworkText: draft.homeworkText.trim(),
      nextPlan: draft.nextPlan.trim(),
      progressStatus: draft.progressStatus,
      homeworkStatus: draft.homeworkStatus,
      note: draft.note.trim() || undefined,
      updatedAt: new Date().toISOString()
    });
  }

  function askDeleteRecord() {
    if (!selectedRecord || !selectedRow) return;
    confirm({
      title: "删除这条学生进度记录？",
      description: `${selectedRow.student.name} · ${selectedRow.course.name} · ${selectedRecord.date}`,
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => onDeleteProgressRecord(selectedRecord.id)
    });
  }

  function useLessonCommonContent() {
    if (!selectedLesson) return;
    setDraft((current) => ({
      ...current,
      progressText: selectedLesson.content.taught,
      homeworkText: selectedLesson.content.homework,
      nextPlan: selectedLesson.content.nextLessonReminder,
      homeworkStatus: selectedLesson.content.homework.trim() ? current.homeworkStatus === "unassigned" ? "assigned" : current.homeworkStatus : "unassigned"
    }));
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "学生课程", value: `${rows.length} 组`, icon: UserCheck, tone: "bg-[#eaf2ff] text-[#1557c2]" },
          { label: "需要跟进", value: `${rowsNeedingFollowUp} 组`, icon: AlertTriangle, tone: "bg-[#fff3e4] text-[#c2410c]" },
          { label: "最新课未整理", value: `${rowsNeedingRecord} 组`, icon: Clock3, tone: "bg-[#eef0ff] text-[#5161d6]" },
          { label: "作业已检查", value: `${checkedHomeworkRows}/${Math.max(assignedHomeworkRows + checkedHomeworkRows, checkedHomeworkRows)}`, icon: CheckCircle2, tone: "bg-[#e8f8ef] text-[#15803d]" }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ${item.tone}`}>
                  <Icon size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#64748b]">{item.label}</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#061226]">{item.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <Target size={14} /> 进度作业
          </div>
          <CardTitle>学生进度与作业总览</CardTitle>
          <CardDescription>
            以学生为主视角，读取每节课的共同内容和课后作业，并允许为同一节课里的不同学生单独记录差异。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索学生、课程、内容或作业"
              />
            </label>
            <Select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
              <option value="all">全部课程</option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
              ))}
            </Select>
            <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
              <option value="all">全部科目</option>
              {subjectOptions.map((subject) => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </Select>
            <Select value={homeworkFilter} onChange={(event) => setHomeworkFilter(event.target.value as HomeworkFilter)}>
              <option value="all">全部作业状态</option>
              {Object.entries(homeworkStatusLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
            <Select value={progressFilter} onChange={(event) => setProgressFilter(event.target.value as ProgressFilter)}>
              <option value="all">全部进度状态</option>
              {Object.entries(progressStatusLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </div>
          <label className="flex w-fit items-center gap-3 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-bold text-[#25324a]">
            <input
              type="checkbox"
              checked={onlyFollowUp}
              onChange={(event) => setOnlyFollowUp(event.target.checked)}
              className="h-4 w-4 accent-[#ff8617]"
            />
            只看需要跟进
          </label>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)] xl:items-start">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>学生列表</CardTitle>
              <CardDescription className="mt-1">同一节班课会按学生拆开，便于记录不同进度和作业完成情况。</CardDescription>
            </div>
            <Badge variant="secondary" className="w-fit">{visibleRows.length} 组</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleRows.map((row, index) => (
              <motion.button
                key={row.key}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.015 }}
                onClick={() => {
                  setSelectedKey(row.key);
                  setSelectedLessonId(row.latestLesson?.id ?? row.lessons.at(-1)?.id ?? "");
                }}
                className={`w-full rounded-[14px] border p-4 text-left transition-all ${
                  selectedRow?.key === row.key
                    ? "border-[#ff8617]/45 bg-[#fff7ed] shadow-[0_12px_28px_rgba(255,134,23,0.12)]"
                    : "border-[#dbe4ef] bg-[#f8fbff] hover:border-[#93c5fd] hover:bg-[#eef5ff]"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#1557c2] ring-1 ring-[#dbe4ef]">
                        {row.student.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-extrabold text-[#061226]">{row.student.name}</div>
                        <div className="mt-1 text-xs font-semibold text-[#64748b]">
                          {row.course.name} · {row.course.subject} · {courseTypeLabel(vault, row.course.type)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#64748b]">
                      <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                        {row.latestLesson ? `${row.latestLesson.date} ${row.latestLesson.startTime}-${row.latestLesson.endTime}` : "暂无课时"}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                        {campusName(vault, row.latestLesson?.campusId ?? row.course.defaultCampusId)}
                      </span>
                      {row.needsLatestRecord && (
                        <span className="rounded-full bg-[#fff3e4] px-2.5 py-1 font-extrabold text-[#c2410c] ring-1 ring-[#fed7aa]">
                          最新课未整理
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    <Badge variant={progressStatusVariant(row.progressStatus)}>{progressStatusLabels[row.progressStatus]}</Badge>
                    <Badge variant={homeworkStatusVariant(row.homeworkStatus)}>{homeworkStatusLabels[row.homeworkStatus]}</Badge>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                    <div className="text-[11px] font-bold text-[#64748b]">当前进度</div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-[#25324a]">
                      {row.displayRecord?.progressText || row.latestLesson?.content.taught || "还没有记录进度"}
                    </div>
                  </div>
                  <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                    <div className="text-[11px] font-bold text-[#64748b]">作业安排</div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-[#25324a]">
                      {row.displayRecord?.homeworkText || row.latestLesson?.content.homework || "还没有布置作业"}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
            {visibleRows.length === 0 && (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                没有符合当前筛选条件的学生进度
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="sticky top-4 overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <NotebookPen size={14} /> 学生记录
            </div>
            <CardTitle>{selectedRow ? `${selectedRow.student.name} · ${selectedRow.course.name}` : "选择学生"}</CardTitle>
            <CardDescription>
              这里保存的是学生个人记录，不会改写 AI 排课助手，也不会自动生成 AI 建议。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedRow || !selectedLesson ? (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                请选择左侧有课时的学生课程
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">关联课时</label>
                  <Select
                    value={effectiveLessonId}
                    onChange={(event) => setSelectedLessonId(event.target.value)}
                  >
                    {selectedLessons.slice().reverse().map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.date} · {lesson.startTime}-{lesson.endTime} · {lessonStatusLabels[lesson.status]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant={lessonStatusVariant(selectedLesson.status)}>
                      {lessonStatusLabels[selectedLesson.status]}
                    </Badge>
                    <Badge variant="secondary">{courseSubject(vault, selectedLesson.courseGroupId)}</Badge>
                    <Badge variant="secondary">{studentNames(vault, lessonStudentIds(selectedLesson))}</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <ReadonlyBlock
                      icon={<BookOpen size={15} />}
                      title="本节共同内容"
                      value={selectedLesson.content.taught}
                    />
                    <ReadonlyBlock
                      icon={<NotebookPen size={15} />}
                      title="课后作业"
                      value={selectedLesson.content.homework}
                    />
                    <ReadonlyBlock
                      icon={<CalendarDays size={15} />}
                      title="下节提醒"
                      value={selectedLesson.content.nextLessonReminder}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#25324a]">进度状态</label>
                    <Select
                      value={draft.progressStatus}
                      onChange={(event) => setDraft((current) => ({ ...current, progressStatus: event.target.value as StudentProgressStatus }))}
                    >
                      {Object.entries(progressStatusLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#25324a]">作业状态</label>
                    <Select
                      value={draft.homeworkStatus}
                      onChange={(event) => setDraft((current) => ({ ...current, homeworkStatus: event.target.value as StudentHomeworkStatus }))}
                    >
                      {Object.entries(homeworkStatusLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">该学生当前进度</label>
                  <Textarea
                    value={draft.progressText}
                    onChange={(event) => setDraft((current) => ({ ...current, progressText: event.target.value }))}
                    placeholder="例如：整式乘法公式会用，但平方差公式还需要复习"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">该学生作业安排</label>
                  <Textarea
                    value={draft.homeworkText}
                    onChange={(event) => setDraft((current) => ({ ...current, homeworkText: event.target.value }))}
                    placeholder="可以沿用本节共同作业，也可以给这个学生单独调整"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">下次处理</label>
                  <Textarea
                    value={draft.nextPlan}
                    onChange={(event) => setDraft((current) => ({ ...current, nextPlan: event.target.value }))}
                    placeholder="例如：下节课前 10 分钟先检查错题，再进入新内容"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">备注</label>
                  <Textarea
                    value={draft.note}
                    onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                    placeholder="家长沟通、补课安排、个别要求等"
                    className="min-h-[76px]"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button type="button" variant="outline" onClick={useLessonCommonContent}>
                    <BookOpen size={15} /> 同步共同内容
                  </Button>
                  <Button type="button" onClick={saveRecord}>
                    <Save size={15} /> 保存记录
                  </Button>
                  <Button type="button" variant="destructive" onClick={askDeleteRecord} disabled={!selectedRecord}>
                    <Trash2 size={15} /> 删除
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReadonlyBlock({
  icon,
  title,
  value
}: {
  icon: ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-extrabold text-[#64748b]">
        {icon}
        {title}
      </div>
      <div className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#25324a]">
        {value.trim() || "未填写"}
      </div>
    </div>
  );
}

function buildProgressRows(vault: TeacherVault): ProgressRow[] {
  const pairMap = new Map<string, { studentId: string; courseGroupId: string }>();
  vault.courseGroups.forEach((course) => {
    course.studentIds.forEach((studentId) => {
      pairMap.set(pairKey(studentId, course.id), { studentId, courseGroupId: course.id });
    });
  });
  vault.lessons.forEach((lesson) => {
    lessonStudentIds(lesson).forEach((studentId) => {
      pairMap.set(pairKey(studentId, lesson.courseGroupId), { studentId, courseGroupId: lesson.courseGroupId });
    });
  });
  (vault.studentProgressRecords ?? []).forEach((record) => {
    pairMap.set(pairKey(record.studentId, record.courseGroupId), {
      studentId: record.studentId,
      courseGroupId: record.courseGroupId
    });
  });

  return Array.from(pairMap.values())
    .map(({ studentId, courseGroupId }) => {
      const student = findStudent(vault, studentId);
      const course = getCourse(vault, courseGroupId);
      if (!student || !course) return null;
      const lessons = vault.lessons
        .filter((lesson) => lesson.courseGroupId === courseGroupId && lessonStudentIds(lesson).includes(studentId))
        .sort(sortLessons);
      const latestLesson = lessons.at(-1);
      const records = (vault.studentProgressRecords ?? [])
        .filter((record) => record.studentId === studentId && record.courseGroupId === courseGroupId)
        .sort(sortProgressRecords);
      const latestRecord = records.at(-1);
      const latestLessonRecord = latestLesson ? records.find((record) => record.lessonId === latestLesson.id) : undefined;
      const displayRecord = latestLessonRecord ?? latestRecord;
      const progressStatus = displayRecord?.progressStatus ?? inferProgressStatus(latestLesson);
      const homeworkStatus = displayRecord?.homeworkStatus ?? inferHomeworkStatus(latestLesson);
      const row: ProgressRow = {
        key: pairKey(studentId, courseGroupId),
        student,
        course,
        lessons,
        latestLesson,
        latestRecord,
        latestLessonRecord,
        displayRecord,
        progressStatus,
        homeworkStatus,
        needsLatestRecord: Boolean(latestLesson && !latestLessonRecord)
      };
      return row;
    })
    .filter((row): row is ProgressRow => Boolean(row));
}

function recordToDraft(record: StudentProgressRecord | undefined, lesson: Lesson): ProgressDraft {
  return {
    progressText: record?.progressText ?? lesson.content.taught,
    homeworkText: record?.homeworkText ?? lesson.content.homework,
    nextPlan: record?.nextPlan ?? lesson.content.nextLessonReminder,
    progressStatus: record?.progressStatus ?? inferProgressStatus(lesson),
    homeworkStatus: record?.homeworkStatus ?? inferHomeworkStatus(lesson),
    note: record?.note ?? ""
  };
}

function pairKey(studentId: string, courseGroupId: string): string {
  return `${studentId}::${courseGroupId}`;
}

function sortProgressRecords(a: StudentProgressRecord, b: StudentProgressRecord): number {
  return `${a.date} ${a.updatedAt}`.localeCompare(`${b.date} ${b.updatedAt}`);
}

function inferProgressStatus(lesson?: Lesson): StudentProgressStatus {
  if (!lesson) return "review_needed";
  if (lesson.status === "makeup_pending") return "behind";
  if (lesson.status === "cancelled") return "review_needed";
  return "on_track";
}

function inferHomeworkStatus(lesson?: Lesson): StudentHomeworkStatus {
  if (!lesson) return "unassigned";
  return lesson.content.homework.trim() ? "assigned" : "unassigned";
}

function needsFollowUp(row: ProgressRow): boolean {
  return (
    row.needsLatestRecord ||
    row.progressStatus === "review_needed" ||
    row.progressStatus === "behind" ||
    row.homeworkStatus === "assigned" ||
    row.homeworkStatus === "partial" ||
    row.homeworkStatus === "missing"
  );
}

function progressStatusVariant(status: StudentProgressStatus): "sage" | "yellow" | "amber" | "sky" {
  if (status === "on_track") return "sage";
  if (status === "ahead") return "sky";
  if (status === "behind") return "amber";
  return "yellow";
}

function homeworkStatusVariant(status: StudentHomeworkStatus): "secondary" | "yellow" | "sage" | "amber" | "destructive" {
  if (status === "checked") return "sage";
  if (status === "assigned") return "yellow";
  if (status === "partial") return "amber";
  if (status === "missing") return "destructive";
  return "secondary";
}
