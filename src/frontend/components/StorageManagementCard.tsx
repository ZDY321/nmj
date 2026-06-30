import type { ReactNode } from "react";
import { Archive, CalendarDays, Database, FileText, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LessonStatus, TeacherVault } from "@/shared/types";
import { buildStorageRetentionStats, formatStorageSize } from "@/frontend/lib/storageRetention";

const lessonStatusLabels: Record<LessonStatus, string> = {
  draft: "草稿",
  scheduled: "待上课",
  completed: "已完成",
  cancelled: "已取消",
  makeup_pending: "待补课",
  makeup_completed: "已补课"
};

export function StorageManagementCard({
  vault,
  onPurgeOldTrash
}: {
  vault: TeacherVault;
  onPurgeOldTrash: (ids: string[]) => void;
}) {
  const stats = buildStorageRetentionStats(vault);
  const visibleYears = stats.lessons.byYear.slice(0, 4);
  const hiddenYearCount = Math.max(stats.lessons.byYear.length - visibleYears.length, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <Database size={14} /> 存储管理
          </div>
          <CardTitle>当前账号容量概览</CardTitle>
          <CardDescription>按解密后的档案 JSON 估算，用于判断历史课节、回收站和长内容占用。</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="sky">档案 {formatStorageSize(stats.estimatedJsonBytes)}</Badge>
          <Badge variant={stats.trash.olderThanRetentionCount > 0 ? "amber" : "secondary"}>
            可清理 {stats.trash.olderThanRetentionCount} 条
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StorageMetric
            icon={<Archive size={16} />}
            label="学生档案"
            value={`${stats.students.total}`}
            detail={`在读 ${stats.students.active} · 过渡 ${stats.students.transition} · 归档 ${stats.students.archived}`}
          />
          <StorageMetric
            icon={<FileText size={16} />}
            label="课程档案"
            value={`${stats.courses.total}`}
            detail={`启用 ${stats.courses.active} · 暂停 ${stats.courses.paused}`}
          />
          <StorageMetric
            icon={<CalendarDays size={16} />}
            label="课节明细"
            value={`${stats.lessons.total}`}
            detail={`长备注/内容 ${stats.longContentLessonCount} 节`}
          />
          <StorageMetric
            icon={<Trash2 size={16} />}
            label="回收站"
            value={`${stats.trash.total}`}
            detail={`${formatStorageSize(stats.trash.estimatedJsonBytes)} · 90 天前 ${stats.trash.olderThanRetentionCount}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-extrabold text-[#061226]">课节年度分布</div>
              <Badge variant="secondary">{stats.lessons.byYear.length} 年</Badge>
            </div>
            <div className="space-y-2">
              {visibleYears.map((item) => (
                <div key={item.year} className="rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-extrabold text-[#061226]">{item.year}</div>
                    <Badge variant="sky">{item.total} 节</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(item.statuses).map(([status, count]) => (
                      <span key={status} className="rounded-full bg-[#eef4fb] px-2 py-1 text-xs font-bold text-[#475569]">
                        {lessonStatusLabels[status as LessonStatus]} {count}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {visibleYears.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-6 text-center text-sm font-semibold text-[#64748b]">
                  暂无课节明细
                </div>
              )}
              {hiddenYearCount > 0 && (
                <div className="text-xs font-bold text-[#64748b]">另有 {hiddenYearCount} 个更早年份未展开。</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
              <div className="mb-3 text-sm font-extrabold text-[#061226]">教务核对与映射</div>
              <div className="grid grid-cols-2 gap-2 text-sm font-semibold text-[#25324a]">
                <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                  <div className="text-xs font-bold text-[#64748b]">保存现场</div>
                  <div className="mt-1 text-xl font-extrabold text-[#061226]">{stats.scheduleImport.reviewCount}</div>
                </div>
                <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                  <div className="text-xs font-bold text-[#64748b]">课程映射</div>
                  <div className="mt-1 text-xl font-extrabold text-[#061226]">{stats.scheduleImport.mappingCount}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#9a3412]">
                <Trash2 size={15} /> 回收站清理
              </div>
              <div className="text-sm font-semibold leading-6 text-[#9a3412]">
                默认保留最近 90 天删除记录；清理会永久移除更早的回收站课节。
              </div>
              <Button
                type="button"
                variant="destructive"
                className="mt-3 w-full"
                disabled={stats.trash.olderThanRetentionIds.length === 0}
                onClick={() => onPurgeOldTrash(stats.trash.olderThanRetentionIds)}
              >
                <Trash2 size={15} /> 清理 90 天前回收站
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StorageMetric({
  detail,
  icon,
  label,
  value
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#64748b]">
        {icon} {label}
      </div>
      <div className="text-2xl font-extrabold text-[#061226]">{value}</div>
      <div className="mt-1 text-sm font-semibold text-[#64748b]">{detail}</div>
    </div>
  );
}
