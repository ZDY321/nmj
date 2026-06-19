import { motion } from "framer-motion";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, DeletedLesson, TeacherVault } from "@/shared/types";
import { formatAppDateTime, getCourse } from "@/frontend/lib/calculations";
import {
  campusName,
  courseTypeLabel,
  lessonStatusLabels,
  lessonStatusVariant,
  lessonStudentDisplay,
  lessonTimeRangeLabel
} from "@/frontend/lib/helpers";
import {
  canRestoreDeletedLesson,
  deletedLessonSourceLabel,
  deletedLessonSourceVariant,
  isOrderedDateRange
} from "@/frontend/lib/scheduleViewHelpers";

type ScheduleTrashPanelProps = {
  activeLessonIds: Set<string>;
  allVisibleTrashSelected: boolean;
  campusOptions: Campus[];
  dateWithWeekday: (date: string) => string;
  deletedLessonCount: number;
  onPermanentDelete: (ids: string[]) => void;
  onRestore: (ids: string[]) => void;
  onToggleAllVisible: () => void;
  onToggleSelection: (id: string) => void;
  selectedTrashIdSet: Set<string>;
  selectedTrashRestoreCount: number;
  selectedVisibleTrashIds: string[];
  setTrashCampusFilter: (value: string) => void;
  setTrashDateEnd: (value: string) => void;
  setTrashDateStart: (value: string) => void;
  setTrashSearch: (value: string) => void;
  setTrashSourceFilter: (value: "all" | DeletedLesson["source"]) => void;
  trashCampusFilter: string;
  trashDateEnd: string;
  trashDateStart: string;
  trashLessons: DeletedLesson[];
  trashSearch: string;
  trashSourceFilter: "all" | DeletedLesson["source"];
  vault: TeacherVault;
};

export function ScheduleTrashPanel({
  activeLessonIds,
  allVisibleTrashSelected,
  campusOptions,
  dateWithWeekday,
  deletedLessonCount,
  onPermanentDelete,
  onRestore,
  onToggleAllVisible,
  onToggleSelection,
  selectedTrashIdSet,
  selectedTrashRestoreCount,
  selectedVisibleTrashIds,
  setTrashCampusFilter,
  setTrashDateEnd,
  setTrashDateStart,
  setTrashSearch,
  setTrashSourceFilter,
  trashCampusFilter,
  trashDateEnd,
  trashDateStart,
  trashLessons,
  trashSearch,
  trashSourceFilter,
  vault
}: ScheduleTrashPanelProps) {
  const dateRangeInvalid = !isOrderedDateRange(trashDateStart, trashDateEnd) && trashDateStart && trashDateEnd;
  const dateInputClassName = dateRangeInvalid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-2 border-[#fecaca]">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#b91c1c]">
              <Trash2 size={14} /> 课节回收站
            </div>
            <CardTitle>误删课节恢复</CardTitle>
            <CardDescription>手动删除、AI 删除和同步覆盖移除的课节会先保存在这里，可筛选后单个或批量恢复。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{deletedLessonCount} 条回收记录</Badge>
            <Badge variant="sky">当前筛选 {trashLessons.length} 条</Badge>
            <Badge variant={selectedVisibleTrashIds.length > 0 ? "amber" : "secondary"}>已选 {selectedVisibleTrashIds.length} 条</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">课程开始日期</label>
              <Input type="date" value={trashDateStart} onChange={(event) => setTrashDateStart(event.target.value)} className={dateInputClassName} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">课程结束日期</label>
              <Input type="date" value={trashDateEnd} min={trashDateStart} onChange={(event) => setTrashDateEnd(event.target.value)} className={dateInputClassName} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">校区</label>
              <Select value={trashCampusFilter} onChange={(event) => setTrashCampusFilter(event.target.value)}>
                <option value="all">全部校区</option>
                {campusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">删除来源</label>
              <Select value={trashSourceFilter} onChange={(event) => setTrashSourceFilter(event.target.value as "all" | DeletedLesson["source"])}>
                <option value="all">全部来源</option>
                <option value="manual">手动删除</option>
                <option value="ai">AI 删除</option>
                <option value="sync_overwrite">同步覆盖</option>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-2">
              <label className="text-sm font-medium">搜索</label>
              <label className="relative block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <Input className="pl-9" value={trashSearch} onChange={(event) => setTrashSearch(event.target.value)} placeholder="搜索课程、学生、科目、校区、备注或删除原因" />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex items-center gap-3 text-sm font-bold text-[#25324a]">
              <input
                type="checkbox"
                checked={allVisibleTrashSelected}
                onChange={onToggleAllVisible}
                className="h-4 w-4 accent-[#ff8617]"
              />
              全选当前筛选结果
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onRestore(selectedVisibleTrashIds)} disabled={selectedTrashRestoreCount === 0}>
                <RotateCcw size={15} /> 恢复选中 {selectedTrashRestoreCount > 0 ? selectedTrashRestoreCount : ""}
              </Button>
              <Button type="button" variant="destructive" onClick={() => onPermanentDelete(selectedVisibleTrashIds)} disabled={selectedVisibleTrashIds.length === 0}>
                <Trash2 size={15} /> 彻底删除选中
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {trashLessons.map((item) => {
              const lesson = item.lesson;
              const course = getCourse(vault, lesson.courseGroupId);
              const checked = selectedTrashIdSet.has(item.id);
              const hasActiveConflict = activeLessonIds.has(lesson.id);
              const missingCourse = !course;
              const canRestore = canRestoreDeletedLesson(vault, activeLessonIds, item);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-[14px] border p-4 ${checked ? "border-[#f59e0b] bg-[#fff7ed]" : "border-[#dbe4ef] bg-white"}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleSelection(item.id)}
                          className="h-4 w-4 accent-[#ff8617]"
                        />
                        <span className="truncate text-base font-extrabold text-[#061226]">{course?.name ?? "未知课程"}</span>
                        <Badge variant="secondary" className="text-[10px]">{course?.subject ?? "未知科目"}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{courseTypeLabel(vault, lesson.type)}</Badge>
                        <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">{lessonStatusLabels[lesson.status]}</Badge>
                        <Badge variant={deletedLessonSourceVariant(item.source)} className="text-[10px]">{deletedLessonSourceLabel(item.source)}</Badge>
                        {hasActiveConflict && <Badge variant="destructive" className="text-[10px]">恢复冲突</Badge>}
                        {missingCourse && <Badge variant="destructive" className="text-[10px]">课程档案缺失</Badge>}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 text-sm font-semibold text-[#64748b] md:grid-cols-2">
                        <div>{dateWithWeekday(lesson.date)} · {lessonTimeRangeLabel(lesson)}</div>
                        <div>{campusName(vault, lesson.campusId ?? course?.defaultCampusId)} · {lessonStudentDisplay(vault, lesson)}</div>
                        <div>删除时间：{formatAppDateTime(item.deletedAt)}</div>
                        <div>删除原因：{item.reason ?? "未记录"}</div>
                      </div>
                      {(lesson.content.taught || lesson.content.homework || lesson.note) && (
                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs font-semibold leading-5 text-[#25324a] lg:grid-cols-3">
                          {lesson.content.taught && (
                            <div className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2">
                              <div className="mb-1 font-extrabold text-[#1557c2]">本次课内容</div>
                              <div className="line-clamp-3 whitespace-pre-wrap">{lesson.content.taught}</div>
                            </div>
                          )}
                          {lesson.content.homework && (
                            <div className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2">
                              <div className="mb-1 font-extrabold text-[#ff8617]">课后作业</div>
                              <div className="line-clamp-3 whitespace-pre-wrap">{lesson.content.homework}</div>
                            </div>
                          )}
                          {lesson.note && (
                            <div className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2">
                              <div className="mb-1 font-extrabold text-[#64748b]">备注</div>
                              <div className="line-clamp-3 whitespace-pre-wrap">{lesson.note}</div>
                            </div>
                          )}
                        </div>
                      )}
                      {hasActiveConflict && (
                        <div className="mt-3 rounded-[10px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs font-bold text-[#b91c1c]">
                          当前系统里已有同 ID 课节。为避免覆盖现有数据，这条记录暂不能直接恢复。
                        </div>
                      )}
                      {missingCourse && (
                        <div className="mt-3 rounded-[10px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs font-bold text-[#b91c1c]">
                          这节课对应的课程档案已不存在。请先重建或恢复课程档案，再恢复这节课。
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                      <Button type="button" size="sm" onClick={() => onRestore([item.id])} disabled={!canRestore}>
                        <RotateCcw size={14} /> 恢复
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => onPermanentDelete([item.id])}>
                        <Trash2 size={14} /> 彻底删除
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {trashLessons.length === 0 && (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-10 text-center">
                <div className="text-base font-extrabold text-[#061226]">当前筛选下没有回收站记录</div>
                <div className="mt-2 text-sm font-semibold text-[#64748b]">删除课节后会先保存在这里，确认不需要时再彻底删除。</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
