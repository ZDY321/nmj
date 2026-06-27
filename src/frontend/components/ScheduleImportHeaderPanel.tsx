import { useEffect, useMemo, useState, type DragEvent } from "react";
import { BookOpen, ChevronDown, Download, FileSpreadsheet, MapPin, RefreshCw, Save, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { Campus } from "@/shared/types";
import type { ScheduleImportMapping, ScheduleImportSummary } from "@/frontend/lib/scheduleImport";

export type ScheduleImportFileSummary = {
  fileName: string;
  sourceCampus: string;
  count: number;
  months: string[];
};

export function ScheduleImportHeaderPanel({
  rawLessonCount,
  importedLessonCount,
  excludedImportedLessonCount,
  cancelledImportedLessonCount,
  rowCount,
  loading,
  summary,
  needsAttention,
  importedLessonHours,
  systemLessonCount,
  systemLessonHours,
  systemCompletedLessonCount,
  systemCompletedLessonHours,
  needsAttentionHours,
  fileSummaries,
  monthCount,
  campusOptions,
  fileCampusOverrides,
  message,
  onFilesSelected,
  onSave,
  onExport,
  onClear,
  onRemoveFile,
  onFileCampusChange,
  onOpenGuide
}: {
  rawLessonCount: number;
  importedLessonCount: number;
  excludedImportedLessonCount: number;
  cancelledImportedLessonCount: number;
  rowCount: number;
  loading: boolean;
  summary: ScheduleImportSummary;
  needsAttention: number;
  importedLessonHours: number;
  systemLessonCount: number;
  systemLessonHours: number;
  systemCompletedLessonCount: number;
  systemCompletedLessonHours: number;
  needsAttentionHours: number;
  fileSummaries: ScheduleImportFileSummary[];
  monthCount: number;
  campusOptions: Campus[];
  fileCampusOverrides: ScheduleImportMapping;
  message: string;
  onFilesSelected: (files: FileList | null) => void;
  onSave: () => void;
  onExport: () => void;
  onClear: () => void;
  onRemoveFile: (fileName: string) => void;
  onFileCampusChange: (fileName: string, campusId: string) => void;
  onOpenGuide?: () => void;
}) {
  const fileSummaryKey = useMemo(
    () => fileSummaries.map((file) => `${file.fileName}:${fileCampusOverrides[file.fileName] ?? ""}`).join("|"),
    [fileCampusOverrides, fileSummaries]
  );
  const hasUnmappedFiles = fileSummaries.some((file) => !fileCampusOverrides[file.fileName]);
  const allFilesMapped = fileSummaries.length > 0 && !hasUnmappedFiles;
  const [importSetupExpanded, setImportSetupExpanded] = useState(() => !allFilesMapped);
  const [draggingFiles, setDraggingFiles] = useState(false);

  useEffect(() => {
    setImportSetupExpanded(!allFilesMapped);
  }, [allFilesMapped, fileSummaryKey]);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!loading) setDraggingFiles(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = loading ? "none" : "copy";
    if (!loading) setDraggingFiles(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDraggingFiles(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingFiles(false);
    if (loading || event.dataTransfer.files.length === 0) return;
    onFilesSelected(event.dataTransfer.files);
  }

  return (
    <>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <FileSpreadsheet size={14} /> 教务课表对账
          </div>
          <CardTitle>教务 Excel 与云端课表核对</CardTitle>
          <CardDescription>教务 Excel 只作为外部对账来源；Excel 节数与对账行数分开统计。</CardDescription>
          <div className="mt-2 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-xs font-bold leading-5 text-[#475569]">
            教务 Excel 来自校宝；校宝查看与导出助手脚本已内置在右侧“导出指引”页，可一键复制到 Tampermonkey。
          </div>
          {onOpenGuide && (
            <Button type="button" size="sm" variant="outline" className="mt-3 h-8 border-[#bfdbfe] bg-[#eaf2ff] text-[#1557c2] hover:bg-[#dbeafe]" onClick={onOpenGuide}>
              <BookOpen size={14} /> 查看导出与脚本安装指引
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="sky">教务导入 {importedLessonCount} 节 / {importedLessonHours.toFixed(1)}h</Badge>
          {excludedImportedLessonCount > 0 && <Badge variant="secondary">未到日期不计 {excludedImportedLessonCount} 节</Badge>}
          {cancelledImportedLessonCount > 0 && <Badge variant="secondary">取消/未开课不计 {cancelledImportedLessonCount} 节</Badge>}
          <Badge variant="secondary">云端排课总课时(含未完成，未抵扣前) {systemLessonCount} 节 / {systemLessonHours.toFixed(1)}h</Badge>
          <Badge variant="sage">云端已完成课时(已完成，未抵扣前) {systemCompletedLessonCount} 节 / {systemCompletedLessonHours.toFixed(1)}h</Badge>
          <Badge variant={needsAttention > 0 ? "amber" : "sage"}>待核对 {needsAttention} 节 / {needsAttentionHours.toFixed(1)}h</Badge>
        </div>
      </CardHeader>

      <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            onClick={() => setImportSetupExpanded((current) => !current)}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-[#061226]">
              <Upload size={16} className="text-[#1557c2]" /> 教务 Excel 文件与对应校区
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{fileSummaries.length} 个文件</Badge>
              {allFilesMapped && <Badge variant="sage" className="text-[10px]">校区已对应</Badge>}
              {hasUnmappedFiles && <Badge variant="amber" className="text-[10px]">待选择校区</Badge>}
              <ChevronDown size={16} className={`text-[#64748b] transition-transform ${importSetupExpanded ? "rotate-180" : ""}`} />
            </span>
          </button>
          <div className="flex flex-wrap gap-2 lg:shrink-0">
            <Button type="button" size="sm" className="h-8 text-xs" disabled={rowCount === 0} onClick={onSave}>
              <Save size={14} /> 保存对账
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-[#1557c2] bg-[#1557c2] text-xs text-white shadow-[0_10px_18px_rgba(21,87,194,0.18)] hover:border-[#0f4ba8] hover:bg-[#0f4ba8]"
              disabled={rawLessonCount === 0}
              onClick={onExport}
            >
              <Download size={14} /> 合并导出所有校区
            </Button>
          </div>
        </div>

        {!importSetupExpanded && (
          <div className="mt-3 rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#64748b]">
            已导入 {fileSummaries.length} 个文件，文件校区已对应。展开后可继续导入、保存、导出、清空或修改文件校区。
          </div>
        )}

        {importSetupExpanded && (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
            <div
              className={`rounded-[14px] border bg-[#f8fbff] p-4 transition-colors ${draggingFiles ? "border-[#1557c2] ring-2 ring-[#bfdbfe]" : "border-[#dbe4ef]"}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#061226]">
                <FileSpreadsheet size={16} className="text-[#1557c2]" /> 教务 Excel 文件
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                  <label className={`flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed px-3 py-3 text-center text-xs font-extrabold transition-colors sm:px-4 sm:text-sm ${draggingFiles ? "border-[#1557c2] bg-[#eaf2ff] text-[#1557c2]" : "border-[#bfdbfe] bg-white text-[#1557c2] hover:bg-[#eaf2ff]"}`}>
                    {loading ? <RefreshCw size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                    <span>{draggingFiles ? "松开导入 Excel" : "拖拽或选择 Excel"}</span>
                    <span className="text-[11px] font-bold text-[#64748b]">支持 .xls / .xlsx 多文件</span>
                    <input
                      type="file"
                      accept=".xls,.xlsx"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        onFilesSelected(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <Button type="button" variant="outline" disabled={rawLessonCount === 0} onClick={onClear}>
                    <X size={15} /> 清空
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {[
                  ["文件", fileSummaries.length],
                  ["月份", monthCount],
                  ["云端缺少", summary.systemMissing],
                  ["教务缺少", summary.importMissing]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2">
                    <div className="text-xs font-semibold text-[#64748b]">{label}</div>
                    <div className="mt-1 text-lg font-extrabold text-[#061226]">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-[12px] border border-[#bfdbfe] bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#1557c2]">
                <div className="font-extrabold text-[#061226]">文件名识别规则</div>
                <div>文件名中包含“档案信息”里的校区名称关键词即可自动识别，例如“2026-05-课表-延安校区.xlsx”“校宝课表导出2026-06-20（外国语校区鹏成教育）.xlsx”或“2026-05-课表延安.xlsx”。</div>
              </div>
            </div>

            <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#061226]">
                <MapPin size={16} className="text-[#1557c2]" /> 文件对应校区
              </div>
              <div className="space-y-2">
                {fileSummaries.map((file) => (
                  <div key={file.fileName} className="grid grid-cols-1 gap-2 rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-3 md:grid-cols-[minmax(0,1fr)_240px_76px]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-[#061226]">{file.fileName}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-[#64748b]">
                        <Badge variant="secondary" className="text-[10px]">{file.count} 节</Badge>
                        <Badge variant="secondary" className="text-[10px]">{file.months.join("、") || "未知月份"}</Badge>
                        <Badge variant={file.sourceCampus ? "sky" : "amber"} className="text-[10px]">{file.sourceCampus || "文件名未识别校区"}</Badge>
                        <Badge variant={fileCampusOverrides[file.fileName] ? "sage" : "amber"} className="text-[10px]">
                          {fileCampusOverrides[file.fileName]
                            ? `已对应 ${campusOptions.find((campus) => campus.id === fileCampusOverrides[file.fileName])?.name ?? "校区"}`
                            : "未对应校区"}
                        </Badge>
                      </div>
                    </div>
                    <Select value={fileCampusOverrides[file.fileName] ?? ""} onChange={(event) => onFileCampusChange(file.fileName, event.target.value)}>
                      <option value="">选择校区</option>
                      {campusOptions.map((campus) => (
                        <option key={campus.id} value={campus.id}>{campus.name}</option>
                      ))}
                    </Select>
                    <Button type="button" variant="outline" className="h-10 md:h-full" onClick={() => onRemoveFile(file.fileName)}>
                      <X size={14} /> 移除
                    </Button>
                  </div>
                ))}
                {fileSummaries.length === 0 && (
                  <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                    暂无教务 Excel 文件
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {message && (
        <div className="rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-sm font-bold text-[#25324a]">{message}</div>
      )}
    </>
  );
}
