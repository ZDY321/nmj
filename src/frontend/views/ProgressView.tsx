import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardList,
  CheckCheck,
  MapPin,
  NotebookPen,
  Save,
  Search,
  Target,
  Trash2,
  UserCheck,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { getCourse, todayIso } from "@/frontend/lib/calculations";
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
  sortCampusesForProfile,
  sortCoursesByName,
  sortLessons,
  studentNames,
  subjectOptionsForVault,
  weekdayLabels,
  weekdayOfDateIso
} from "@/frontend/lib/helpers";
import { ProgressChecklistView } from "@/frontend/views/ProgressChecklistView";
import type {
  CourseGroup,
  Lesson,
  ProgressChecklistCompletion,
  ProgressChecklistTemplate,
  Student,
  StudentHomeworkStatus,
  StudentProgressRecord,
  StudentProgressStatus,
  TeacherVault
} from "@/shared/types";

type HomeworkFilter = "all" | StudentHomeworkStatus;
type ProgressFilter = "all" | StudentProgressStatus;
type ProgressSortOption = "smart" | "today" | "student_name" | "campus" | "grade";
type ProgressSectionView = "ledger" | "checklist";

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
  campusId?: string;
  campusLabel: string;
};

type TimelineColumn = {
  date: string;
  label: string;
  weekday: string;
  isToday: boolean;
};

type TimelineCell = {
  lesson?: Lesson;
  record?: StudentProgressRecord;
  studentCount: number;
  hasDifferences: boolean;
  isCancelled: boolean;
  progressText: string;
  homeworkText: string;
  nextPlan: string;
  note: string;
  progressStatus: StudentProgressStatus;
  homeworkStatus: StudentHomeworkStatus;
  needsRecord: boolean;
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

const progressSortLabels: Record<ProgressSortOption, string> = {
  smart: "智能排序",
  today: "今天有课优先",
  student_name: "按姓名",
  campus: "按校区",
  grade: "按年级"
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
  token,
  onSaveProgressRecord,
  onSaveProgressRecords,
  onDeleteProgressRecord,
  onSaveChecklistTemplate,
  onDeleteChecklistTemplate,
  onSaveChecklistCompletion,
  onDeleteChecklistCompletion,
  onOpenLessonInRecords
}: {
  vault: TeacherVault;
  token?: string;
  onSaveProgressRecord: (record: StudentProgressRecord) => void;
  onSaveProgressRecords: (records: StudentProgressRecord[]) => void;
  onDeleteProgressRecord: (recordId: string) => void;
  onSaveChecklistTemplate: (template: ProgressChecklistTemplate) => void;
  onDeleteChecklistTemplate: (templateId: string) => void;
  onSaveChecklistCompletion: (completion: ProgressChecklistCompletion) => void;
  onDeleteChecklistCompletion: (completionId: string) => void;
  onOpenLessonInRecords?: (lesson: Lesson) => void;
}) {
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [campusFilter, setCampusFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [homeworkFilter, setHomeworkFilter] = useState<HomeworkFilter>("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [sortOption, setSortOption] = useState<ProgressSortOption>("smart");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [onlyFollowUp, setOnlyFollowUp] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [draft, setDraft] = useState<ProgressDraft>(emptyDraft);
  const [sectionView, setSectionView] = useState<ProgressSectionView>("ledger");
  const { confirm, dialog } = useConfirmDialog();

  const progressRecords = vault.studentProgressRecords ?? [];
  const courseOptions = sortCoursesByName(vault.courseGroups);
  const gradeOptions = Array.from(new Set(vault.students.map((student) => student.grade?.trim()).filter((grade): grade is string => Boolean(grade)))).sort(compareByName);
  const campusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const subjectOptions = subjectOptionsForVault(vault);
  const normalizedQuery = query.trim().toLowerCase();
  const today = todayIso();

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
        row.campusLabel,
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
      const matchesGrade = gradeFilter === "all" || (gradeFilter === "__unset" ? !row.student.grade : row.student.grade === gradeFilter);
      const matchesCampus = campusFilter === "all" || row.campusId === campusFilter;
      const matchesSubject = subjectFilter === "all" || row.course.subject === subjectFilter;
      const matchesHomework = homeworkFilter === "all" || row.homeworkStatus === homeworkFilter;
      const matchesProgress = progressFilter === "all" || row.progressStatus === progressFilter;
      const matchesFollowUp = !onlyFollowUp || needsFollowUp(row);
      return matchesQuery && matchesCourse && matchesGrade && matchesCampus && matchesSubject && matchesHomework && matchesProgress && matchesFollowUp;
    })
    .sort((a, b) => sortProgressRows(a, b, sortOption, today));

  const timelineColumns = buildTimelineColumns(vault, visibleRows, dateStart, dateEnd);

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
  const selectedLessonStudents = selectedLesson
    ? lessonStudentIds(selectedLesson)
        .map((studentId) => findStudent(vault, studentId))
        .filter((student): student is Student => Boolean(student))
        .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id))
    : [];

  const rowsNeedingFollowUp = rows.filter(needsFollowUp).length;
  const rowsNeedingRecord = rows.filter((row) => row.needsLatestRecord).length;
  const assignedHomeworkRows = rows.filter((row) => row.homeworkStatus === "assigned").length;
  const checkedHomeworkRows = rows.filter((row) => row.homeworkStatus === "checked").length;
  const sectionSwitcher = (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-extrabold text-[#061226]">进度与作业</div>
          <div className="mt-1 text-xs font-semibold text-[#64748b]">台账页保留不动，学习清单是新增子页面。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={sectionView === "ledger" ? "default" : "outline"}
            onClick={() => setSectionView("ledger")}
          >
            <ClipboardList size={15} /> 进度台账
          </Button>
          <Button
            type="button"
            variant={sectionView === "checklist" ? "default" : "outline"}
            onClick={() => setSectionView("checklist")}
          >
            <CheckCheck size={15} /> 学习清单
          </Button>
        </div>
      </CardContent>
    </Card>
  );

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
    setEditModalOpen(false);
  }

  function saveRecordForLessonStudents() {
    if (!selectedRow || !selectedLesson) return;
    const now = new Date().toISOString();
    const students = lessonStudentIds(selectedLesson);
    onSaveProgressRecords(students.map((studentId) => {
      const existing = progressRecords.find(
        (record) => record.studentId === studentId && record.courseGroupId === selectedRow.course.id && record.lessonId === selectedLesson.id
      );
      return {
        id: existing?.id ?? makeId("progress"),
        studentId,
        courseGroupId: selectedRow.course.id,
        lessonId: selectedLesson.id,
        date: selectedLesson.date,
        progressText: draft.progressText.trim(),
        homeworkText: draft.homeworkText.trim(),
        nextPlan: draft.nextPlan.trim(),
        progressStatus: draft.progressStatus,
        homeworkStatus: draft.homeworkStatus,
        note: draft.note.trim() || undefined,
        updatedAt: now
      };
    }));
    setEditModalOpen(false);
  }

  function askDeleteRecord() {
    if (!selectedRecord || !selectedRow) return;
    confirm({
      title: "删除这条学生进度记录？",
      description: `${selectedRow.student.name} · ${selectedRow.course.name} · ${selectedRecord.date}`,
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        onDeleteProgressRecord(selectedRecord.id);
        setEditModalOpen(false);
      }
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

  if (sectionView === "checklist") {
    return (
      <div className="space-y-6">
        {dialog}
        {sectionSwitcher}
        <ProgressChecklistView
          vault={vault}
          token={token}
          onSaveChecklistTemplate={onSaveChecklistTemplate}
          onDeleteChecklistTemplate={onDeleteChecklistTemplate}
          onSaveChecklistCompletion={onSaveChecklistCompletion}
          onDeleteChecklistCompletion={onDeleteChecklistCompletion}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dialog}
      {sectionSwitcher}
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
            <Target size={14} /> 进度与作业
          </div>
          <CardTitle>学生进度与作业总览</CardTitle>
          <CardDescription>
            以学生为主视角，读取每节课的共同内容和课后作业，并允许为同一节课里的不同学生单独记录差异。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))]">
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
            <Select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
              <option value="all">全部年级</option>
              <option value="__unset">未设置年级</option>
              {gradeOptions.map((grade) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </Select>
            <Select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
              <option value="all">全部校区</option>
              {campusOptions.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_220px_auto] xl:items-end">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#25324a]">开始日期</label>
              <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#25324a]">结束日期</label>
              <Input type="date" value={dateEnd} min={dateStart} onChange={(event) => setDateEnd(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#25324a]">排序方式</label>
              <Select value={sortOption} onChange={(event) => setSortOption(event.target.value as ProgressSortOption)}>
                {Object.entries(progressSortLabels).map(([key, label]) => (
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
          </div>
        </CardContent>
      </Card>

      <div>
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>进度与作业台账</CardTitle>
              <CardDescription className="mt-1">行是学生课程，列是上课日期；横向看同一天，纵向看单个学生的连续进度。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="w-fit">{visibleRows.length} 组</Badge>
              <Badge variant="sky" className="w-fit">{timelineColumns.length} 天</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {visibleRows.length === 0 || timelineColumns.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                没有符合当前筛选条件的进度台账
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-auto rounded-[14px] border border-[#dbe4ef] bg-white">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#f8fbff]">
                      <th className="sticky top-0 z-30 w-[170px] min-w-[170px] border-b border-r border-[#dbe4ef] bg-[#f8fbff] p-3 text-xs font-extrabold text-[#25324a] md:left-0 md:w-[230px] md:min-w-[230px]">
                        学生 / 课程
                      </th>
                      {timelineColumns.map((column) => (
                        <th
                          key={column.date}
                          className={`sticky top-0 z-20 min-w-[230px] border-b border-r p-3 align-top text-xs font-extrabold ${
                            column.isToday
                              ? "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]"
                              : "border-[#dbe4ef] bg-[#f8fbff] text-[#25324a]"
                          }`}
                        >
                          <div>{column.isToday ? "今天" : column.label}</div>
                          <div className={`mt-1 font-semibold ${column.isToday ? "text-[#f97316]" : "text-[#64748b]"}`}>
                            {column.date} · {column.weekday}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.key} className={selectedRow?.key === row.key ? "bg-[#fff7ed]" : "odd:bg-white even:bg-[#fbfdff]"}>
                        <th className="w-[170px] min-w-[170px] border-b border-r border-[#dbe4ef] bg-inherit p-3 align-top md:sticky md:left-0 md:z-10 md:w-[230px] md:min-w-[230px]">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedKey(row.key);
                              setSelectedLessonId(row.latestLesson?.id ?? row.lessons.at(-1)?.id ?? "");
                            }}
                            className="w-full text-left"
                          >
                            <div className="font-extrabold text-[#061226]">{row.student.name}</div>
                            <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                              {row.course.name} · {row.course.subject}
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#64748b]">
                              <MapPin size={11} /> {row.campusLabel}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge variant={progressStatusVariant(row.progressStatus)} className="text-[10px]">{progressStatusLabels[row.progressStatus]}</Badge>
                              <Badge variant={homeworkStatusVariant(row.homeworkStatus)} className="text-[10px]">{homeworkStatusLabels[row.homeworkStatus]}</Badge>
                            </div>
                          </button>
                        </th>
                        {timelineColumns.map((column) => {
                          const cell = progressCellForDate(vault, row, column.date);
                          return (
                            <td key={`${row.key}-${column.date}`} className={`border-b border-r p-2 align-top ${column.isToday ? "border-[#fed7aa] bg-[#fffaf5]" : "border-[#dbe4ef]"}`}>
                              {cell?.isCancelled ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedKey(row.key);
                                    setSelectedLessonId(cell.lesson?.id ?? cell.record?.lessonId ?? "");
                                    setEditModalOpen(Boolean(cell.lesson));
                                  }}
                                  className={`flex h-[210px] w-full flex-col rounded-[10px] border p-2 text-left transition-colors ${
                                    selectedRow?.key === row.key && selectedLesson?.id === cell.lesson?.id
                                      ? "border-[#fca5a5] bg-[#fff1f2]"
                                      : "border-[#fecaca] bg-[#fff7f7] hover:border-[#f87171] hover:bg-[#fff1f2]"
                                  }`}
                                >
                                  <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
                                    {cell.lesson && (
                                      <Badge variant="secondary" className="flex items-center gap-1 text-[10px]">
                                        <Clock3 size={10} /> {cell.lesson.startTime}-{cell.lesson.endTime}
                                      </Badge>
                                    )}
                                    <Badge variant="destructive" className="text-[10px]">已取消</Badge>
                                    {cell.note && <Badge variant="plum" className="text-[10px]">备注</Badge>}
                                  </div>
                                  <div className="flex min-h-0 flex-1 flex-col justify-center rounded-[8px] border border-dashed border-[#fecaca] bg-white/70 px-3 py-4 text-center">
                                    <div className="text-sm font-extrabold text-[#b91c1c]">这天课程已取消</div>
                                    <div className="mt-3 text-left text-xs font-semibold leading-5 text-[#7f1d1d]">
                                      <div className="mb-1 font-extrabold text-[#991b1b]">取消原因</div>
                                      <div className="line-clamp-5 whitespace-pre-wrap">
                                        {cell.note || "未填写取消原因"}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              ) : cell ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedKey(row.key);
                                    setSelectedLessonId(cell.lesson?.id ?? cell.record?.lessonId ?? "");
                                    setEditModalOpen(Boolean(cell.lesson));
                                  }}
                                  className={`flex h-[210px] w-full flex-col overflow-hidden rounded-[10px] border p-2 text-left transition-colors ${
                                    selectedRow?.key === row.key && selectedLesson?.id === cell.lesson?.id
                                      ? "border-[#ff8617] bg-[#fff7ed]"
                                      : selectedRow?.key === row.key
                                        ? "border-[#fed7aa] bg-[#fff7ed]/70"
                                      : "border-[#e8eef6] bg-[#f8fbff] hover:border-[#93c5fd] hover:bg-[#eef5ff]"
                                  }`}
                                >
                                  <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
                                    {cell.lesson && (
                                      <Badge variant="secondary" className="flex items-center gap-1 text-[10px]">
                                        <Clock3 size={10} /> {cell.lesson.startTime}-{cell.lesson.endTime}
                                      </Badge>
                                    )}
                                    <Badge variant={progressStatusVariant(cell.progressStatus)} className="text-[10px]">{progressStatusLabels[cell.progressStatus]}</Badge>
                                    <Badge variant={homeworkStatusVariant(cell.homeworkStatus)} className="text-[10px]">{homeworkStatusLabels[cell.homeworkStatus]}</Badge>
                                    {cell.needsRecord && <Badge variant="amber" className="text-[10px]">未整理</Badge>}
                                    {cell.studentCount > 1 && <Badge variant="secondary" className="text-[10px]">{cell.studentCount}人</Badge>}
                                    {cell.hasDifferences && <Badge variant="destructive" className="text-[10px]">有差异</Badge>}
                                    {cell.nextPlan && <Badge variant="sky" className="text-[10px]">下次</Badge>}
                                    {cell.note && <Badge variant="plum" className="text-[10px]">备注</Badge>}
                                  </div>
                                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                                    <div className="text-[11px] font-extrabold text-[#1557c2]">内容</div>
                                    <div className="mt-0.5 whitespace-pre-wrap text-xs font-semibold leading-5 text-[#25324a]">
                                      {cell.progressText || "未填写"}
                                    </div>
                                    <div className="mt-2 text-[11px] font-extrabold text-[#c2410c]">作业</div>
                                    <div className="mt-0.5 whitespace-pre-wrap text-xs font-semibold leading-5 text-[#25324a]">
                                      {cell.homeworkText || "未布置"}
                                    </div>
                                    <div className="mt-2 text-[11px] font-extrabold text-[#5161d6]">下次</div>
                                    <div className="mt-0.5 whitespace-pre-wrap text-xs font-semibold leading-5 text-[#25324a]">
                                      {cell.nextPlan || "未填写"}
                                    </div>
                                  </div>
                                </button>
                              ) : (
                                <div className="flex h-[210px] items-center justify-center rounded-[10px] border border-dashed border-[#e8eef6] bg-[#f8fbff]/60 p-2 text-center">
                                  <div className="text-sm font-extrabold text-[#94a3b8]">无课</div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {editModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#061226]/45 p-4 backdrop-blur-sm">
            <Card className="max-h-[92vh] w-full max-w-[920px] overflow-hidden shadow-[0_30px_90px_rgba(6,18,38,0.28)]">
              <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-[#e8eef6]">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                    <NotebookPen size={14} /> 学生记录
                  </div>
                  <CardTitle>{selectedRow ? `${selectedRow.student.name} · ${selectedRow.course.name}` : "选择学生"}</CardTitle>
                  <CardDescription className="mt-1">
                    单独保存只改当前学生；应用到本节全部学生适合班课整体进度一致的情况。
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {selectedLesson && onOpenLessonInRecords && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditModalOpen(false);
                        onOpenLessonInRecords(selectedLesson);
                      }}
                      className="border-[#dbe4ef] text-[#1557c2] hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#0f4aa0]"
                    >
                      <CalendarDays size={15} /> 跳到课时详情
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon" onClick={() => setEditModalOpen(false)} aria-label="关闭编辑">
                    <X size={18} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-[calc(92vh-118px)] space-y-5 overflow-y-auto p-5 sm:p-6">
            {!selectedRow || !selectedLesson ? (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                请选择有课时的学生课程
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
                      tone="blue"
                      value={selectedLesson.content.taught}
                    />
                    <ReadonlyBlock
                      icon={<NotebookPen size={15} />}
                      title="课后作业"
                      tone="orange"
                      value={selectedLesson.content.homework}
                    />
                    <ReadonlyBlock
                      icon={<CalendarDays size={15} />}
                      title="下节提醒"
                      tone="purple"
                      value={selectedLesson.content.nextLessonReminder}
                    />
                  </div>
                </div>

                {selectedLessonStudents.length > 1 && (
                  <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-extrabold text-[#25324a]">本节学生</div>
                      <Badge variant={lessonHasStudentDifferences(vault, selectedLesson) ? "destructive" : "secondary"}>
                        {lessonHasStudentDifferences(vault, selectedLesson) ? "存在个人差异" : "暂未发现差异"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedLessonStudents.map((student) => {
                        const studentRecord = progressRecords.find(
                          (record) => record.studentId === student.id && record.courseGroupId === selectedLesson.courseGroupId && record.lessonId === selectedLesson.id
                        );
                        const active = selectedRow?.student.id === student.id;
                        return (
                          <Button
                            key={student.id}
                            type="button"
                            size="sm"
                            variant={active ? "default" : "outline"}
                            onClick={() => setSelectedKey(pairKey(student.id, selectedLesson.courseGroupId))}
                            className="h-9"
                          >
                            {student.name}
                            {studentRecord?.note ? " · 备注" : studentRecord ? " · 已记" : " · 未记"}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#1557c2]">进度状态</label>
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
                    <label className="text-sm font-bold text-[#c2410c]">作业状态</label>
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
                  <label className="text-sm font-bold text-[#1557c2]">该学生当前进度</label>
                  <Textarea
                    value={draft.progressText}
                    onChange={(event) => setDraft((current) => ({ ...current, progressText: event.target.value }))}
                    placeholder="例如：整式乘法公式会用，但平方差公式还需要复习"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#c2410c]">该学生作业安排</label>
                  <Textarea
                    value={draft.homeworkText}
                    onChange={(event) => setDraft((current) => ({ ...current, homeworkText: event.target.value }))}
                    placeholder="可以沿用本节共同作业，也可以给这个学生单独调整"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#5161d6]">下次处理</label>
                  <Textarea
                    value={draft.nextPlan}
                    onChange={(event) => setDraft((current) => ({ ...current, nextPlan: event.target.value }))}
                    placeholder="例如：下节课前 10 分钟先检查错题，再进入新内容"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#7c3aed]">备注</label>
                  <Textarea
                    value={draft.note}
                    onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                    placeholder="家长沟通、补课安排、个别要求等"
                    className="min-h-[76px]"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button type="button" variant="outline" onClick={useLessonCommonContent}>
                    <BookOpen size={15} /> 填入本节共同内容
                  </Button>
                  <Button type="button" onClick={saveRecord}>
                    <Save size={15} /> 保存记录
                  </Button>
                  <Button type="button" variant="destructive" onClick={askDeleteRecord} disabled={!selectedRecord}>
                    <Trash2 size={15} /> 删除
                  </Button>
                </div>
                {selectedLesson.expectedStudentIds.length > 1 && (
                  <Button type="button" variant="outline" onClick={saveRecordForLessonStudents} className="w-full border-[#93c5fd] bg-[#eff6ff] text-[#1557c2] hover:border-[#60a5fa] hover:bg-[#dbeafe] hover:text-[#0f4aa0]">
                    <UserCheck size={15} /> 应用到本节全部学生（{lessonStudentIds(selectedLesson).length} 人）
                  </Button>
                )}
              </>
            )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadonlyBlock({
  icon,
  title,
  tone,
  value
}: {
  icon: ReactNode;
  title: string;
  tone: "blue" | "orange" | "purple";
  value: string;
}) {
  const toneClass = tone === "blue" ? "text-[#1557c2]" : tone === "orange" ? "text-[#c2410c]" : "text-[#5161d6]";
  return (
    <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
      <div className={`mb-1 flex items-center gap-2 text-xs font-extrabold ${toneClass}`}>
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
      const latestLesson = lessons.filter((lesson) => lesson.status !== "cancelled").at(-1);
      const records = (vault.studentProgressRecords ?? [])
        .filter((record) => record.studentId === studentId && record.courseGroupId === courseGroupId)
        .sort(sortProgressRecords);
      const latestRecord = records.at(-1);
      const latestLessonRecord = latestLesson ? records.find((record) => record.lessonId === latestLesson.id) : undefined;
      const displayRecord = latestLessonRecord ?? latestRecord;
      const progressStatus = displayRecord?.progressStatus ?? inferProgressStatus(latestLesson);
      const homeworkStatus = displayRecord?.homeworkStatus ?? inferHomeworkStatus(latestLesson);
      const campusId = latestLesson?.campusId ?? course.defaultCampusId ?? student.defaultCampusId;
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
        needsLatestRecord: Boolean(latestLesson && !latestLessonRecord),
        campusId,
        campusLabel: campusName(vault, campusId)
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

function buildTimelineColumns(
  vault: TeacherVault,
  rows: ProgressRow[],
  dateStart: string,
  dateEnd: string
): TimelineColumn[] {
  const dates = new Set<string>();
  rows.forEach((row) => {
    row.lessons.forEach((lesson) => {
      if (dateInRange(lesson.date, dateStart, dateEnd)) dates.add(lesson.date);
    });
  });
  (vault.studentProgressRecords ?? []).forEach((record) => {
    if (rows.some((row) => row.student.id === record.studentId && row.course.id === record.courseGroupId) && dateInRange(record.date, dateStart, dateEnd)) {
      dates.add(record.date);
    }
  });

  const today = todayIso();
  const hasExplicitDateRange = Boolean(dateStart || dateEnd);
  const sortedDates = Array.from(dates)
    .filter((date) => hasExplicitDateRange || date <= today)
    .sort((a, b) => b.localeCompare(a));
  const visibleDates = sortedDates.length > 0 ? sortedDates : [today];
  return visibleDates.map((date) => ({
    date,
    label: date.slice(5),
    weekday: weekdayLabels[weekdayOfDateIso(date)],
    isToday: date === today
  }));
}

function progressCellForDate(vault: TeacherVault, row: ProgressRow, date: string): TimelineCell | undefined {
  const lesson = lessonOnDate(row, date);
  const records = (vault.studentProgressRecords ?? [])
    .filter((record) => record.studentId === row.student.id && record.courseGroupId === row.course.id && record.date === date)
    .sort(sortProgressRecords);
  const record = lesson
    ? records.find((item) => item.lessonId === lesson.id) ?? records.at(-1)
    : records.at(-1);
  if (!lesson && !record) return undefined;
  return {
    lesson,
    record,
    studentCount: lesson ? lessonStudentIds(lesson).length : 1,
    hasDifferences: lesson ? lessonHasStudentDifferences(vault, lesson) : false,
    isCancelled: lesson?.status === "cancelled",
    progressText: record?.progressText ?? lesson?.content.taught ?? "",
    homeworkText: record?.homeworkText ?? lesson?.content.homework ?? "",
    nextPlan: record?.nextPlan ?? lesson?.content.nextLessonReminder ?? "",
    note: record?.note ?? "",
    progressStatus: record?.progressStatus ?? inferProgressStatus(lesson),
    homeworkStatus: record?.homeworkStatus ?? inferHomeworkStatus(lesson),
    needsRecord: Boolean(lesson && !records.some((item) => item.lessonId === lesson.id))
  };
}

function lessonHasStudentDifferences(vault: TeacherVault, lesson: Lesson): boolean {
  const studentIds = lessonStudentIds(lesson);
  if (studentIds.length <= 1) return false;
  const signatures = studentIds.map((studentId) => {
    const record = (vault.studentProgressRecords ?? []).find(
      (item) => item.studentId === studentId && item.courseGroupId === lesson.courseGroupId && item.lessonId === lesson.id
    );
    return [
      record?.progressText ?? lesson.content.taught,
      record?.homeworkText ?? lesson.content.homework,
      record?.nextPlan ?? lesson.content.nextLessonReminder,
      record?.progressStatus ?? inferProgressStatus(lesson),
      record?.homeworkStatus ?? inferHomeworkStatus(lesson),
      record?.note ?? ""
    ].map((value) => String(value).trim()).join("\u001f");
  });
  return new Set(signatures).size > 1;
}

function dateInRange(date: string, dateStart: string, dateEnd: string): boolean {
  return (!dateStart || date >= dateStart) && (!dateEnd || date <= dateEnd) && (!dateStart || !dateEnd || dateStart <= dateEnd);
}

function pairKey(studentId: string, courseGroupId: string): string {
  return `${studentId}::${courseGroupId}`;
}

function sortProgressRecords(a: StudentProgressRecord, b: StudentProgressRecord): number {
  return `${a.date} ${a.updatedAt}`.localeCompare(`${b.date} ${b.updatedAt}`);
}

function sortProgressRows(
  a: ProgressRow,
  b: ProgressRow,
  sortOption: ProgressSortOption,
  today: string
): number {
  if (sortOption === "smart") {
    if (hasLessonOnDate(a, today) !== hasLessonOnDate(b, today)) return hasLessonOnDate(a, today) ? -1 : 1;
    const todayTimeCompare = compareRowsByLessonTimeOnDate(a, b, today);
    if (todayTimeCompare) return todayTimeCompare;
    if (needsFollowUp(a) !== needsFollowUp(b)) return needsFollowUp(a) ? -1 : 1;
    return (
      compareRowsByLessonPresence(a, b) ||
      compareRowsByLatestLesson(a, b) ||
      compareByName(a.student.name, b.student.name) ||
      compareByName(a.course.name, b.course.name) ||
      a.key.localeCompare(b.key)
    );
  }

  if (sortOption === "today") {
    if (hasLessonOnDate(a, today) !== hasLessonOnDate(b, today)) return hasLessonOnDate(a, today) ? -1 : 1;
    const todayTimeCompare = compareRowsByLessonTimeOnDate(a, b, today);
    if (todayTimeCompare) return todayTimeCompare;
    return (
      compareRowsByLessonPresence(a, b) ||
      compareRowsByLatestLesson(a, b) ||
      compareByName(a.student.name, b.student.name) ||
      compareByName(a.course.name, b.course.name) ||
      a.key.localeCompare(b.key)
    );
  }

  const baseCompare = compareRowsByLessonPresence(a, b);
  if (baseCompare) return baseCompare;

  if (sortOption === "student_name") {
    return (
      compareByName(a.student.name, b.student.name) ||
      compareByName(a.course.name, b.course.name) ||
      compareRowsByLatestLesson(a, b) ||
      a.key.localeCompare(b.key)
    );
  }

  if (sortOption === "campus") {
    return (
      compareOptionalLabel(a.campusLabel, b.campusLabel, "未设置校区") ||
      compareByName(a.student.name, b.student.name) ||
      compareByName(a.course.name, b.course.name) ||
      compareRowsByLatestLesson(a, b) ||
      a.key.localeCompare(b.key)
    );
  }

  return (
    compareOptionalLabel(a.student.grade, b.student.grade, "未设置年级") ||
    compareByName(a.student.name, b.student.name) ||
    compareByName(a.course.name, b.course.name) ||
    compareRowsByLatestLesson(a, b) ||
    a.key.localeCompare(b.key)
  );
}

function compareRowsByLessonPresence(a: ProgressRow, b: ProgressRow): number {
  if (Boolean(a.latestLesson) === Boolean(b.latestLesson)) return 0;
  return a.latestLesson ? -1 : 1;
}

function compareRowsByLessonTimeOnDate(a: ProgressRow, b: ProgressRow, date: string): number {
  const lessonA = lessonOnDate(a, date, "first");
  const lessonB = lessonOnDate(b, date, "first");
  if (Boolean(lessonA) !== Boolean(lessonB)) return lessonA ? -1 : 1;
  if (!lessonA || !lessonB) return 0;
  return `${lessonA.startTime} ${lessonA.endTime}`.localeCompare(`${lessonB.startTime} ${lessonB.endTime}`);
}

function compareRowsByLatestLesson(a: ProgressRow, b: ProgressRow): number {
  return `${b.latestLesson?.date ?? ""} ${b.latestLesson?.startTime ?? ""}`.localeCompare(
    `${a.latestLesson?.date ?? ""} ${a.latestLesson?.startTime ?? ""}`
  );
}

function compareOptionalLabel(a: string | undefined, b: string | undefined, emptyLabel: string): number {
  const normalizedA = a?.trim() || emptyLabel;
  const normalizedB = b?.trim() || emptyLabel;
  const aIsEmpty = normalizedA === emptyLabel;
  const bIsEmpty = normalizedB === emptyLabel;
  if (aIsEmpty !== bIsEmpty) return aIsEmpty ? 1 : -1;
  return compareByName(normalizedA, normalizedB);
}

function hasLessonOnDate(row: ProgressRow, date: string): boolean {
  return row.lessons.some((lesson) => lesson.date === date);
}

function lessonOnDate(row: ProgressRow, date: string, mode: "first" | "last" = "last"): Lesson | undefined {
  const lessonsOnDate = row.lessons.filter((lesson) => lesson.date === date);
  if (lessonsOnDate.length === 0) return undefined;
  return mode === "first" ? lessonsOnDate[0] : lessonsOnDate.at(-1);
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
