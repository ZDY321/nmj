import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Link2, Plus, Search, Trash2, UserCheck, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TimeTextInput } from "@/components/ui/time-text-input";
import type { AttendanceStatus, CourseGroup, Lesson, Student, TeacherVault } from "@/shared/types";
import {
  attendanceLabels,
  attendedStudentNamesForLesson,
  findStudent,
  formatPrivateMoney,
  isMakeupAttendanceStatus,
  lessonStudentIds,
  studentNames
} from "@/frontend/lib/helpers";
import { attendanceSurfaceClass } from "@/frontend/lib/scheduleViewHelpers";

type ScheduleLessonAttendancePanelProps = {
  amountsVisible: boolean;
  attendancePanelOpen: boolean;
  attendanceStudentFilter: string;
  availableTrialStudentOptionCount: number;
  dateWithWeekday: (date: string) => string;
  displayedTemporaryStudentOptions: Student[];
  getDefaultTemporaryFeeForEntry: (lesson: Lesson, entry: Lesson["attendance"][number]) => number | undefined;
  isMakeupTimeValid: boolean;
  makeupArrangementOpen: boolean;
  makeupDate: string;
  makeupEndTime: string;
  makeupStartTime: string;
  onAddTemporaryStudent: () => void;
  onAskRemoveLessonStudent: (studentId: string) => void;
  onCreateSelectedMakeupLesson: (studentIds: string[]) => void;
  onOpenLesson: (lesson: Lesson) => void;
  onSelectDetailMakeupStudentIds: (studentIds: string[]) => void;
  onToggleAttendancePanel: () => void;
  onToggleDetailMakeupStudent: (studentId: string) => void;
  onToggleMakeupArrangement: () => void;
  onUpdateAttendance: (studentId: string, status: AttendanceStatus) => void;
  onUpdateAttendanceMakeupExempt: (studentId: string, makeupExempt: boolean) => void;
  onUpdateAttendanceNote: (studentId: string, note: string) => void;
  onUpdateTemporaryFee: (studentId: string, fee: number | undefined) => void;
  onUpdateTrialStats: (patch: Pick<Partial<Lesson>, "trialStudentCount" | "trialFee">) => void;
  scheduledMakeupLessonForStudent: (originalLessonId: string, studentId: string) => Lesson | undefined;
  selected: Lesson;
  selectedAttendanceEntries: Lesson["attendance"];
  selectedAttendedStudentCount: number;
  selectedCourse: CourseGroup | undefined;
  selectedDetailMakeupStudentIds: string[];
  selectedExpectedStudentCount: number;
  selectedLinkedMakeupLessons: Lesson[];
  selectedMakeupAssignableStudentIds: string[];
  selectedMakeupCandidateStudentIds: string[];
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
};

export function ScheduleLessonAttendancePanel({
  amountsVisible,
  attendancePanelOpen,
  attendanceStudentFilter,
  availableTrialStudentOptionCount,
  dateWithWeekday,
  displayedTemporaryStudentOptions,
  getDefaultTemporaryFeeForEntry,
  isMakeupTimeValid,
  makeupArrangementOpen,
  makeupDate,
  makeupEndTime,
  makeupStartTime,
  onAddTemporaryStudent,
  onAskRemoveLessonStudent,
  onCreateSelectedMakeupLesson,
  onOpenLesson,
  onSelectDetailMakeupStudentIds,
  onToggleAttendancePanel,
  onToggleDetailMakeupStudent,
  onToggleMakeupArrangement,
  onUpdateAttendance,
  onUpdateAttendanceMakeupExempt,
  onUpdateAttendanceNote,
  onUpdateTemporaryFee,
  onUpdateTrialStats,
  scheduledMakeupLessonForStudent,
  selected,
  selectedAttendanceEntries,
  selectedAttendedStudentCount,
  selectedCourse,
  selectedDetailMakeupStudentIds,
  selectedExpectedStudentCount,
  selectedLinkedMakeupLessons,
  selectedMakeupAssignableStudentIds,
  selectedMakeupCandidateStudentIds,
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
  vault
}: ScheduleLessonAttendancePanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
        <UserCheck size={14} /> 到课情况
      </div>
      {selectedLinkedMakeupLessons.length > 0 && (
        <div className="rounded-[14px] border border-[#bfdbfe] bg-[#eff6ff] p-3">
          <div className="mb-2 text-sm font-extrabold text-[#1557c2]">已安排补课</div>
          <div className="flex flex-wrap gap-2">
            {selectedLinkedMakeupLessons.map((makeupLesson) => (
              <Button
                key={makeupLesson.id}
                type="button"
                size="sm"
                variant="outline"
                className="border-[#bfdbfe] bg-white text-[#1557c2]"
                onClick={() => onOpenLesson(makeupLesson)}
              >
                <Link2 size={13} />
                {dateWithWeekday(makeupLesson.date)} {makeupLesson.startTime}-{makeupLesson.endTime} · {attendedStudentNamesForLesson(vault, makeupLesson) || studentNames(vault, makeupLesson.expectedStudentIds)}
              </Button>
            ))}
          </div>
        </div>
      )}
      {!selected.linkedOriginalLessonId && selectedMakeupAssignableStudentIds.length > 0 && (
        <div className="space-y-3 rounded-[14px] border border-[#facc15] bg-[#fefce8] p-4">
          <button
            type="button"
            onClick={onToggleMakeupArrangement}
            className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <div className="text-sm font-extrabold text-[#061226]">补课安排</div>
              <div className="mt-1 text-xs font-semibold text-[#854d0e]">
                {selectedWholeLessonPending ? "这节课整体待补课，直接安排补课即可。" : "勾选可一起补课的学生，分批安排不同时间。"}
              </div>
            </div>
            <span className="flex items-center gap-2">
              <Badge variant="amber" className="w-fit">
                {selectedWholeLessonPending ? "整节待补" : `${selectedMakeupCandidateStudentIds.length} 人待补`}
              </Badge>
              {makeupArrangementOpen ? <ChevronUp size={16} className="text-[#854d0e]" /> : <ChevronDown size={16} className="text-[#854d0e]" />}
            </span>
          </button>
          {makeupArrangementOpen && (
            <>
              {!selectedWholeLessonPending && selectedMakeupCandidateStudentIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => onSelectDetailMakeupStudentIds(selectedMakeupCandidateStudentIds)}>
                    全选待补学生
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onSelectDetailMakeupStudentIds([])} disabled={selectedDetailMakeupStudentIds.length === 0}>
                    清空
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-2">
                {selectedMakeupAssignableStudentIds.length > 0 ? (
                  selectedMakeupAssignableStudentIds.map((studentId) => {
                    const student = findStudent(vault, studentId);
                    const checked = selectedDetailMakeupStudentIds.includes(studentId);
                    return (
                      <div
                        key={studentId}
                        className={`flex flex-col gap-2 rounded-[12px] border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${
                          checked ? "border-[#f59e0b] bg-white text-[#7c2d12]" : "border-[#fde68a] bg-white text-[#061226]"
                        }`}
                      >
                        <span className="min-w-0 flex items-center gap-3">
                          {!selectedWholeLessonPending && (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => onToggleDetailMakeupStudent(studentId)}
                              className="h-4 w-4 accent-[#ff8617]"
                            />
                          )}
                          <span className="truncate font-semibold">{student?.name ?? "未知学生"}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Badge variant={checked ? "default" : "secondary"} className="w-fit">
                            {checked ? "已选" : "待补"}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0 border-[#fde68a] bg-white text-[#854d0e]"
                            onClick={() => onUpdateAttendanceMakeupExempt(studentId, true)}
                          >
                            本次不补
                          </Button>
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[12px] border border-dashed border-[#fcd34d] bg-white p-4 text-center text-sm font-semibold text-[#854d0e]">
                    没有待安排补课的学生
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#854d0e]">补课日期</label>
                  <Input type="date" value={makeupDate} onChange={(event) => setMakeupDate(event.target.value)} className="bg-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#854d0e]">补课时间</label>
                  <div className="grid grid-cols-2 gap-2">
                    <TimeTextInput value={makeupStartTime} onValueChange={setMakeupStartTime} className={!isMakeupTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : "bg-white"} />
                    <TimeTextInput value={makeupEndTime} onValueChange={setMakeupEndTime} className={!isMakeupTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : "bg-white"} />
                  </div>
                </div>
              </div>
              {!isMakeupTimeValid && <div className="text-xs font-bold text-[#b91c1c]">补课结束时间必须晚于开始时间。</div>}
              <Button
                type="button"
                onClick={() => onCreateSelectedMakeupLesson(selectedWholeLessonPending ? lessonStudentIds(selected) : selectedDetailMakeupStudentIds)}
                disabled={!isMakeupTimeValid || !makeupDate || selectedMakeupAssignableStudentIds.length === 0 || (!selectedWholeLessonPending && selectedDetailMakeupStudentIds.length === 0)}
                className="w-full sm:w-auto"
              >
                <Plus size={14} /> {selectedWholeLessonPending ? "安排补课" : "安排选中学生补课"}
              </Button>
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <Input
            className="h-10 pl-9"
            value={temporaryStudentSearch}
            onChange={(event) => setTemporaryStudentSearch(event.target.value)}
            placeholder="搜索临时或试听学生"
          />
        </label>
        <Select value={temporaryStudentId} onChange={(event) => setTemporaryStudentId(event.target.value)}>
          <option value="">选择学生档案（含试听）</option>
          {displayedTemporaryStudentOptions.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}{student.grade ? ` · ${student.grade}` : ""}{student.temporaryTrial ? "（试听档案）" : ""}
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" onClick={onAddTemporaryStudent} disabled={!temporaryStudentId || selected.expectedStudentIds.includes(temporaryStudentId)}>
          <UserPlus size={15} /> {selectedTemporaryStudent?.temporaryTrial ? "添加试听学生" : "添加学生"}
        </Button>
      </div>
      <div className="rounded-[12px] border border-dashed border-[#c7d2fe] bg-[#f8faff] px-3 py-2 text-xs font-semibold text-[#5161d6]">
        已保存试听档案 {availableTrialStudentOptionCount} 人，可直接从上面选择后添加为试听学生。
      </div>
      <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
        <button
          type="button"
          onClick={onToggleAttendancePanel}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="text-sm font-extrabold text-[#061226]">关联学生</div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">显示 {selectedAttendanceEntries.length} 人</Badge>
            <Badge variant="sky">实到 {selectedAttendedStudentCount} / 应到 {selectedExpectedStudentCount} 人</Badge>
            {attendancePanelOpen ? <ChevronUp size={16} className="text-[#64748b]" /> : <ChevronDown size={16} className="text-[#64748b]" />}
          </div>
        </button>
        {attendancePanelOpen && (
          <>
            <label className="relative mt-3 block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                className="h-10 bg-white pl-9"
                value={attendanceStudentFilter}
                onChange={(event) => setAttendanceStudentFilter(event.target.value)}
                placeholder="搜索姓名、年级、校区、试听或到课状态"
              />
            </label>
            {selected.type === "class" && (
              <div className="mt-3 grid grid-cols-1 gap-2 rounded-[12px] border border-[#c7d2fe] bg-[#eef0ff] p-3 sm:grid-cols-[1fr_150px_180px] sm:items-end">
                <div className="text-xs font-semibold leading-5 text-[#5161d6]">
                  <span className="font-extrabold text-[#25324a]">试听统计</span>
                  <br />
                  已关联试听学生档案 {trialStudentCount} 人；未建档试听可补录人数，费用按本节总试听收入填写。
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#64748b]">补录试听人数</label>
                  <Input
                    type="number"
                    min={0}
                    value={selected.trialStudentCount ?? 0}
                    onChange={(event) => onUpdateTrialStats({ trialStudentCount: Math.max(Number(event.target.value), 0) })}
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#64748b]">试听费用</label>
                  {amountsVisible ? (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                      <Input
                        type="number"
                        min={0}
                        value={selected.trialFee ?? 0}
                        onChange={(event) => onUpdateTrialStats({ trialFee: Math.max(Number(event.target.value), 0) })}
                        className="bg-white pl-10"
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 items-center rounded-[10px] border border-[#dbe4ef] bg-white px-3 text-sm font-extrabold text-[#64748b]">
                      ***
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {selectedAttendanceEntries.map((entry) => {
                const student = findStudent(vault, entry.studentId);
                const isTrialStudent = Boolean(entry.trial ?? student?.temporaryTrial);
                const isTemporary = Boolean(entry.temporary || !selectedCourse?.studentIds.includes(entry.studentId));
                const canToggleMakeupNeed = isMakeupAttendanceStatus(entry.status);
                const scheduledMakeupLesson = !selected.linkedOriginalLessonId
                  ? scheduledMakeupLessonForStudent(selected.id, entry.studentId)
                  : undefined;
                return (
                  <motion.div
                    key={entry.studentId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`rounded-[14px] border p-3 ${attendanceSurfaceClass(entry.status, isTemporary)}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff1e2]">
                          <span className="text-xs font-bold text-[#ff8617]">{(student?.name ?? "未知").slice(0, 1)}</span>
                        </div>
                        <span className="truncate text-sm font-medium">{student?.name ?? "未知学生"}</span>
                        {isTrialStudent && <Badge variant="plum" className="shrink-0">试听学生</Badge>}
                        {isTemporary && <Badge variant="secondary" className="shrink-0">临时加入</Badge>}
                        {entry.makeupExempt && <Badge variant="secondary" className="shrink-0">不需补课</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        {scheduledMakeupLesson && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-[#bfdbfe] bg-white text-[#1557c2]"
                            onClick={() => onOpenLesson(scheduledMakeupLesson)}
                          >
                            <Link2 size={13} /> 补课详情
                          </Button>
                        )}
                        <Select value={entry.status} onChange={(event) => onUpdateAttendance(entry.studentId, event.target.value as AttendanceStatus)} className="h-9 max-w-[136px]">
                          {Object.entries(attendanceLabels).map(([key, value]) => (
                            <option key={key} value={key}>{value}</option>
                          ))}
                        </Select>
                        {canToggleMakeupNeed && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={entry.makeupExempt ? "border-[#facc15] bg-white text-[#854d0e]" : "border-[#bfdbfe] bg-white text-[#1557c2]"}
                            onClick={() => onUpdateAttendanceMakeupExempt(entry.studentId, !entry.makeupExempt)}
                          >
                            {entry.makeupExempt ? "恢复需补" : "不需补课"}
                          </Button>
                        )}
                        <Button type="button" size="sm" variant="destructive" onClick={() => onAskRemoveLessonStudent(entry.studentId)} title="只从本节课移除">
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                    {isTemporary && !isTrialStudent && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px]">
                        <div className="rounded-[10px] bg-white/70 px-3 py-2 text-xs font-semibold text-[#5161d6]">
                          默认按人头增量 {formatPrivateMoney(getDefaultTemporaryFeeForEntry(selected, entry) ?? 0, amountsVisible)} 计入；填写金额后会替换这名临时学生的默认增量。
                        </div>
                        {amountsVisible ? (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                            <Input
                              type="number"
                              value={entry.temporaryFee ?? ""}
                              onChange={(event) => {
                                const value = event.target.value.trim();
                                onUpdateTemporaryFee(entry.studentId, value === "" ? undefined : Number(value));
                              }}
                              className="bg-white pl-10"
                              placeholder="留空则按默认人头费"
                            />
                          </div>
                        ) : (
                          <div className="flex h-10 items-center rounded-[10px] border border-[#dbe4ef] bg-white px-3 text-sm font-extrabold text-[#64748b]">
                            ***
                          </div>
                        )}
                      </div>
                    )}
                    {isTrialStudent && (
                      <div className="mt-3 rounded-[10px] bg-white/70 px-3 py-2 text-xs font-semibold text-[#5161d6]">
                        试听学生不计入班课新增人头费；本节总试听费用 {formatPrivateMoney(selected.trialFee ?? 0, amountsVisible)}。
                      </div>
                    )}
                    {selected.type === "class" && (
                      <div className="mt-3">
                        <Input
                          className="bg-white"
                          value={entry.note ?? ""}
                          onChange={(event) => onUpdateAttendanceNote(entry.studentId, event.target.value)}
                          placeholder="学生备注，例如排错移除原因、请假原因、已约补课时间"
                        />
                      </div>
                    )}
                    {selected.type !== "class" && (
                      <Input
                        className="mt-3 bg-white"
                        value={entry.note ?? ""}
                        onChange={(event) => onUpdateAttendanceNote(entry.studentId, event.target.value)}
                        placeholder="学生备注，例如请假原因、已约补课时间"
                      />
                    )}
                  </motion.div>
                );
              })}
              {selectedAttendanceEntries.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                  没有符合条件的关联学生
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
