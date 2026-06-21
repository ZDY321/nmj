import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  ChevronLeft,
  CornerUpLeft,
  Link2,
  NotebookPen,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimeTextInput } from "@/components/ui/time-text-input";
import { LessonChecklistLinker } from "@/frontend/components/LessonChecklistLinker";
import { ScheduleLessonAttendancePanel } from "@/frontend/components/ScheduleLessonAttendancePanel";
import type { AttendanceStatus, Campus, CourseGroup, Lesson, Student, TeacherVault } from "@/shared/types";
import {
  attendedStudentNamesForLesson,
  courseName,
  courseSubject,
  courseTypeLabel,
  formatPrivateMoney,
  lessonStatusLabels,
  lessonTimeRangeBillingLabel,
  lessonTimeRangeLabel,
  studentNames
} from "@/frontend/lib/helpers";
import type { LessonReturnTarget } from "@/frontend/lib/scheduleViewTypes";

type LessonContentField = "taught" | "homework";

type ScheduleLessonDetailPanelProps = {
  amountsVisible: boolean;
  attendancePanelOpen: boolean;
  attendanceStudentFilter: string;
  availableTrialStudentOptionCount: number;
  campusOptions: Campus[];
  courseGroupOptions: CourseGroup[];
  dateWithWeekday: (date: string) => string;
  displayedTemporaryStudentOptions: Student[];
  isMakeupTimeValid: boolean;
  lessonHistoryLength: number;
  lessonReturnTarget: LessonReturnTarget | null;
  makeupArrangementOpen: boolean;
  makeupDate: string;
  makeupEndTime: string;
  makeupStartTime: string;
  onAddTemporaryStudent: () => void;
  onAskDeleteLesson: (lesson: Lesson) => void;
  onAskRemoveLessonStudent: (studentId: string) => void;
  onChecklistContentChange: (content: Lesson["content"]) => void;
  onContentChange: (field: LessonContentField, value: string) => void;
  onCreateSelectedMakeupLesson: (studentIds: string[]) => void;
  onGoBackToLessonSource: () => void;
  onGoBackToPreviousLesson: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onSelectDetailMakeupStudentIds: (studentIds: string[]) => void;
  onSelectedCourseChange: (courseId: string) => void;
  onSelectedDateChange: (date: string) => void;
  onSelectedEndTimeChange: (time: string) => void;
  onSelectedStartTimeChange: (time: string) => void;
  onSelectedStatusChange: (status: Lesson["status"]) => void;
  onRecalculateSelectedFee: () => void;
  onResetBillingHoursToSuggested: () => void;
  onToggleAttendancePanel: () => void;
  onToggleDetailMakeupStudent: (studentId: string) => void;
  onToggleMakeupArrangement: () => void;
  onUpdateAttendance: (studentId: string, status: AttendanceStatus) => void;
  onUpdateAttendanceMakeupExempt: (studentId: string, makeupExempt: boolean) => void;
  onUpdateAttendanceNote: (studentId: string, note: string) => void;
  onUpdateBillingHours: (hours: number) => void;
  onUpdateSelected: (patch: Partial<Lesson>, shouldRecalculate?: boolean) => void;
  onUpdateTemporaryFee: (studentId: string, fee: number | undefined) => void;
  onUpdateTrialStats: (patch: Pick<Partial<Lesson>, "trialStudentCount" | "trialFee">) => void;
  scheduledMakeupLessonForStudent: (originalLessonId: string, studentId: string) => Lesson | undefined;
  selected: Lesson;
  selectedAttendanceEntries: Lesson["attendance"];
  selectedActualHours: number;
  selectedAttendedStudentCount: number;
  selectedBillingHours: number;
  selectedCalculatedAmount: number;
  selectedCalculatedPresentCount: number;
  selectedCourse: CourseGroup | undefined;
  selectedDetailMakeupStudentIds: string[];
  selectedExpectedStudentCount: number;
  selectedLinkedMakeupLessons: Lesson[];
  selectedMakeupAssignableStudentIds: string[];
  selectedMakeupCandidateStudentIds: string[];
  selectedOriginalLesson: Lesson | undefined;
  selectedPreviousHomework: string;
  selectedPreviousLesson: Lesson | undefined;
  selectedPreviousTaught: string;
  selectedSuggestedBillingHours: number;
  selectedTemporaryStudent: Student | undefined;
  selectedWholeLessonPending: boolean;
  setAttendanceStudentFilter: (value: string) => void;
  setMakeupDate: (value: string) => void;
  setMakeupEndTime: (value: string) => void;
  setMakeupStartTime: (value: string) => void;
  setTemporaryStudentId: (value: string) => void;
  setTemporaryStudentSearch: (value: string) => void;
  temporaryStudentId: string;
  temporaryStudentSearch: string;
  trialStudentCount: number;
  vault: TeacherVault;
  getDefaultTemporaryFeeForEntry: (lesson: Lesson, entry: Lesson["attendance"][number]) => number | undefined;
};

export function ScheduleLessonDetailPanel({
  amountsVisible,
  attendancePanelOpen,
  attendanceStudentFilter,
  availableTrialStudentOptionCount,
  campusOptions,
  courseGroupOptions,
  dateWithWeekday,
  displayedTemporaryStudentOptions,
  isMakeupTimeValid,
  lessonHistoryLength,
  lessonReturnTarget,
  makeupArrangementOpen,
  makeupDate,
  makeupEndTime,
  makeupStartTime,
  onAddTemporaryStudent,
  onAskDeleteLesson,
  onAskRemoveLessonStudent,
  onChecklistContentChange,
  onContentChange,
  onCreateSelectedMakeupLesson,
  onGoBackToLessonSource,
  onGoBackToPreviousLesson,
  onOpenLesson,
  onSelectDetailMakeupStudentIds,
  onSelectedCourseChange,
  onSelectedDateChange,
  onSelectedEndTimeChange,
  onSelectedStartTimeChange,
  onSelectedStatusChange,
  onRecalculateSelectedFee,
  onResetBillingHoursToSuggested,
  onToggleAttendancePanel,
  onToggleDetailMakeupStudent,
  onToggleMakeupArrangement,
  onUpdateAttendance,
  onUpdateAttendanceMakeupExempt,
  onUpdateAttendanceNote,
  onUpdateBillingHours,
  onUpdateSelected,
  onUpdateTemporaryFee,
  onUpdateTrialStats,
  scheduledMakeupLessonForStudent,
  selected,
  selectedAttendanceEntries,
  selectedActualHours,
  selectedAttendedStudentCount,
  selectedBillingHours,
  selectedCalculatedAmount,
  selectedCalculatedPresentCount,
  selectedCourse,
  selectedDetailMakeupStudentIds,
  selectedExpectedStudentCount,
  selectedLinkedMakeupLessons,
  selectedMakeupAssignableStudentIds,
  selectedMakeupCandidateStudentIds,
  selectedOriginalLesson,
  selectedPreviousHomework,
  selectedPreviousLesson,
  selectedPreviousTaught,
  selectedSuggestedBillingHours,
  selectedTemporaryStudent,
  selectedWholeLessonPending,
  setAttendanceStudentFilter,
  setMakeupDate,
  setMakeupEndTime,
  setMakeupStartTime,
  setTemporaryStudentId,
  setTemporaryStudentSearch,
  temporaryStudentId,
  temporaryStudentSearch,
  trialStudentCount,
  vault,
  getDefaultTemporaryFeeForEntry
}: ScheduleLessonDetailPanelProps) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b border-[#e8eef6] bg-white sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>课程详情</CardTitle>
            <CardDescription className="space-y-1 leading-5">
              <span className="block">{courseSubject(vault, selected.courseGroupId)} · {courseTypeLabel(vault, selected.type)}</span>
              <span className="block">{dateWithWeekday(selected.date)} · {lessonTimeRangeBillingLabel(vault, selected)}</span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {lessonReturnTarget && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onGoBackToLessonSource}
                className="border-[#bfdbfe] bg-[#f8fbff] text-[#1557c2] hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#0f4aa0]"
              >
                <CornerUpLeft size={15} /> {lessonReturnTarget.label}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onGoBackToPreviousLesson}
              disabled={lessonHistoryLength === 0}
              className="border-[#bfdbfe] bg-white text-[#1557c2] hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#0f4aa0]"
            >
              <ChevronLeft size={15} /> 返回上一条
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onAskDeleteLesson(selected)}>
              <Trash2 size={15} /> 删除
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {selectedOriginalLesson && (
            <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-4">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#9a3412]">
                  <Link2 size={16} /> 补课来源
                </div>
                <Button type="button" size="sm" variant="outline" className="w-fit border-[#fed7aa] bg-white text-[#9a3412]" onClick={() => onOpenLesson(selectedOriginalLesson)}>
                  返回原课
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm font-semibold text-[#7c2d12] sm:grid-cols-2">
                <div>原课日期：{dateWithWeekday(selectedOriginalLesson.date)}</div>
                <div>补课日期：{dateWithWeekday(selected.date)}</div>
                <div>学生：{selected.makeupStudentId ? studentNames(vault, [selected.makeupStudentId]) : attendedStudentNamesForLesson(vault, selected) || studentNames(vault, selected.expectedStudentIds)}</div>
                <div>原课程：{courseName(vault, selectedOriginalLesson.courseGroupId)}</div>
                <div>原课科目：{courseSubject(vault, selectedOriginalLesson.courseGroupId)}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">课程</label>
              <Select value={selected.courseGroupId} onChange={(event) => onSelectedCourseChange(event.target.value)}>
                {courseGroupOptions.map((course) => (
                  <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">校区</label>
              <Select value={selected.campusId ?? ""} onChange={(event) => onUpdateSelected({ campusId: event.target.value || undefined })}>
                <option value="">课程默认校区</option>
                {campusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">日期</label>
              <Input type="date" value={selected.date} onChange={(event) => onSelectedDateChange(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">开始</label>
                <TimeTextInput value={selected.startTime} onValueChange={onSelectedStartTimeChange} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束</label>
                <TimeTextInput value={selected.endTime} onValueChange={onSelectedEndTimeChange} />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">状态</label>
              <Select value={selected.status} onChange={(event) => onSelectedStatusChange(event.target.value as Lesson["status"])}>
                {Object.entries(lessonStatusLabels).map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">计费课时</label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={selectedBillingHours}
                onChange={(event) => onUpdateBillingHours(Number(event.target.value))}
              />
              <div className="rounded-[10px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-xs font-semibold leading-5 text-[#64748b]">
                <div>实际时长 {selectedActualHours.toFixed(2)}h · 建议计费课时 {selectedSuggestedBillingHours.toFixed(1)}h</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{selected.feeSnapshot.manualHours ? "当前使用手动计费课时，重算金额会保留这个课时。" : "当前按时间和课程规则自动建议计费课时。"}</span>
                  {selected.feeSnapshot.manualHours && (
                    <Button type="button" variant="outline" size="sm" className="h-7 bg-white text-xs" onClick={onResetBillingHoursToSuggested}>
                      恢复建议课时
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">金额</label>
              {amountsVisible ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                  <Input
                    type="number"
                    value={selected.feeSnapshot.amount}
                    onChange={(event) => onUpdateSelected({ feeSnapshot: { ...selected.feeSnapshot, amount: Number(event.target.value) } })}
                    className="pl-10"
                  />
                </div>
              ) : (
                <div className="flex h-10 items-center rounded-[10px] border border-[#dbe4ef] bg-[#f8fbff] px-3 text-sm font-extrabold text-[#64748b]">
                  ***
                </div>
              )}
              <div className="flex flex-col gap-2 rounded-[10px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-semibold leading-5 text-[#64748b]">
                  实到 {selectedCalculatedPresentCount} 人 · 重算 {formatPrivateMoney(selectedCalculatedAmount, amountsVisible)}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 w-fit bg-white text-xs" onClick={onRecalculateSelectedFee}>
                  <Calculator size={14} /> 按实到重算
                </Button>
              </div>
            </div>
          </div>

          {selected.status === "cancelled" && (
            <div className="rounded-[14px] border border-[#fecaca] bg-[#fff1f2] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#7f1d1d]">
                <AlertTriangle size={16} /> 取消备注
              </div>
              <Textarea
                value={selected.note ?? ""}
                onChange={(event) => onUpdateSelected({ note: event.target.value })}
                placeholder="填写取消原因，例如学生请假、校区停课、老师调课..."
                className="min-h-[76px] bg-white"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => selectedPreviousLesson && onOpenLesson(selectedPreviousLesson)}
              disabled={!selectedPreviousLesson}
              className="rounded-[14px] border border-[#dbeafe] bg-[#f8fbff] p-4 text-left transition-colors hover:border-[#1557c2] hover:bg-[#f1f7ff] disabled:cursor-default disabled:hover:border-[#dbeafe] disabled:hover:bg-[#f8fbff]"
            >
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                <BookOpen size={16} className="text-[#1557c2]" /> 上节课内容
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                {selectedPreviousTaught || "上一节课没有记录内容。"}
              </p>
              {selectedPreviousLesson && (
                <div className="mt-3 text-xs font-semibold text-[#64748b]">
                  来源：{dateWithWeekday(selectedPreviousLesson.date)} · {lessonTimeRangeLabel(selectedPreviousLesson)} · 点击查看详情
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={() => selectedPreviousLesson && onOpenLesson(selectedPreviousLesson)}
              disabled={!selectedPreviousLesson}
              className="rounded-[14px] border border-[#fed7aa] bg-[#fffaf5] p-4 text-left transition-colors hover:border-[#ff8617] hover:bg-[#fff8ef] disabled:cursor-default disabled:hover:border-[#fed7aa] disabled:hover:bg-[#fffaf5]"
            >
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                <NotebookPen size={16} className="text-[#ff8617]" /> 上节课作业
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                {selectedPreviousHomework || "上一节课没有记录作业。"}
              </p>
              {selectedPreviousLesson && (
                <div className="mt-3 text-xs font-semibold text-[#64748b]">
                  来源：{dateWithWeekday(selectedPreviousLesson.date)} · {lessonTimeRangeLabel(selectedPreviousLesson)} · 点击查看详情
                </div>
              )}
            </button>
          </div>

          <ScheduleLessonAttendancePanel
            amountsVisible={amountsVisible}
            attendancePanelOpen={attendancePanelOpen}
            attendanceStudentFilter={attendanceStudentFilter}
            availableTrialStudentOptionCount={availableTrialStudentOptionCount}
            dateWithWeekday={dateWithWeekday}
            displayedTemporaryStudentOptions={displayedTemporaryStudentOptions}
            getDefaultTemporaryFeeForEntry={getDefaultTemporaryFeeForEntry}
            isMakeupTimeValid={isMakeupTimeValid}
            makeupArrangementOpen={makeupArrangementOpen}
            makeupDate={makeupDate}
            makeupEndTime={makeupEndTime}
            makeupStartTime={makeupStartTime}
            onAddTemporaryStudent={onAddTemporaryStudent}
            onAskRemoveLessonStudent={onAskRemoveLessonStudent}
            onCreateSelectedMakeupLesson={onCreateSelectedMakeupLesson}
            onOpenLesson={onOpenLesson}
            onSelectDetailMakeupStudentIds={onSelectDetailMakeupStudentIds}
            onToggleAttendancePanel={onToggleAttendancePanel}
            onToggleDetailMakeupStudent={onToggleDetailMakeupStudent}
            onToggleMakeupArrangement={onToggleMakeupArrangement}
            onUpdateAttendance={onUpdateAttendance}
            onUpdateAttendanceMakeupExempt={onUpdateAttendanceMakeupExempt}
            onUpdateAttendanceNote={onUpdateAttendanceNote}
            onUpdateTemporaryFee={onUpdateTemporaryFee}
            onUpdateTrialStats={onUpdateTrialStats}
            scheduledMakeupLessonForStudent={scheduledMakeupLessonForStudent}
            selected={selected}
            selectedAttendanceEntries={selectedAttendanceEntries}
            selectedAttendedStudentCount={selectedAttendedStudentCount}
            selectedCourse={selectedCourse}
            selectedDetailMakeupStudentIds={selectedDetailMakeupStudentIds}
            selectedExpectedStudentCount={selectedExpectedStudentCount}
            selectedLinkedMakeupLessons={selectedLinkedMakeupLessons}
            selectedMakeupAssignableStudentIds={selectedMakeupAssignableStudentIds}
            selectedMakeupCandidateStudentIds={selectedMakeupCandidateStudentIds}
            selectedTemporaryStudent={selectedTemporaryStudent}
            selectedWholeLessonPending={selectedWholeLessonPending}
            setAttendanceStudentFilter={setAttendanceStudentFilter}
            setMakeupDate={setMakeupDate}
            setMakeupEndTime={setMakeupEndTime}
            setMakeupStartTime={setMakeupStartTime}
            setTemporaryStudentId={setTemporaryStudentId}
            setTemporaryStudentSearch={setTemporaryStudentSearch}
            temporaryStudentId={temporaryStudentId}
            temporaryStudentSearch={temporaryStudentSearch}
            trialStudentCount={trialStudentCount}
            vault={vault}
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <BookOpen size={14} /> 本次课内容
            </div>
            <Textarea value={selected.content.taught} onChange={(event) => onContentChange("taught", event.target.value)} placeholder="例如：本节讲了什么知识点、重点方法、课堂例题、常见错误和掌握情况。" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <NotebookPen size={14} /> 课后作业
            </div>
            <Textarea value={selected.content.homework} onChange={(event) => onContentChange("homework", event.target.value)} placeholder="例如：第几页第几题、几道练习、下次前要完成什么、有没有分层要求或备注。" />
          </div>

          <LessonChecklistLinker
            vault={vault}
            content={selected.content}
            subjectHint={courseSubject(vault, selected.courseGroupId)}
            onChange={onChecklistContentChange}
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}
