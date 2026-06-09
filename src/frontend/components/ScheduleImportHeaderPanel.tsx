import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, MapPin, RefreshCw, Save, Upload, X } from "lucide-react";
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
  rowCount,
  loading,
  summary,
  needsAttention,
  resolvedAsMatchedCount,
  reviewedCount,
  fileSummaries,
  monthCount,
  campusOptions,
  fileCampusOverrides,
  message,
  onFilesSelected,
  onSave,
  onExport,
  onClear,
  onFileCampusChange
}: {
  rawLessonCount: number;
  rowCount: number;
  loading: boolean;
  summary: ScheduleImportSummary;
  needsAttention: number;
  resolvedAsMatchedCount: number;
  reviewedCount: number;
  fileSummaries: ScheduleImportFileSummary[];
  monthCount: number;
  campusOptions: Campus[];
  fileCampusOverrides: ScheduleImportMapping;
  message: string;
  onFilesSelected: (files: FileList | null) => void;
  onSave: () => void;
  onExport: () => void;
  onClear: () => void;
  onFileCampusChange: (fileName: string, campusId: string) => void;
}) {
  const fileSummaryKey = useMemo(
    () => fileSummaries.map((file) => `${file.fileName}:${fileCampusOverrides[file.fileName] ?? ""}`).join("|"),
    [fileCampusOverrides, fileSummaries]
  );
  const hasUnmappedFiles = fileSummaries.some((file) => !fileCampusOverrides[file.fileName]);
  const allFilesMapped = fileSummaries.length > 0 && !hasUnmappedFiles;
  const [importSetupExpanded, setImportSetupExpanded] = useState(() => !allFilesMapped);

  useEffect(() => {
    setImportSetupExpanded(!allFilesMapped);
  }, [allFilesMapped, fileSummaryKey]);

  return (
    <>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <FileSpreadsheet size={14} /> 教务课表对账
          </div>
          <CardTitle>教务 Excel 与云端课表核对</CardTitle>
          <CardDescription>教务 Excel 只作为外部对账来源；Excel 节数与对账行数分开统计。</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="sky">Excel {rawLessonCount} 节</Badge>
          <Badge variant="secondary">对账行 {summary.total} 条</Badge>
          <Badge variant="sage">已对应 {summary.matched} 条</Badge>
          <Badge variant={needsAttention > 0 ? "amber" : "secondary"}>待核对 {needsAttention} 条</Badge>
          {resolvedAsMatchedCount > 0 && <Badge variant="sage">人工确认 {resolvedAsMatchedCount} 条</Badge>}
          {reviewedCount > 0 && <Badge variant="sky">已标注 {reviewedCount} 条</Badge>}
        </div>
      </CardHeader>

      <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
        <button
          type="button"
          onClick={() => setImportSetupExpanded((current) => !current)}
          className="flex w-full items-center justify-between gap-3 text-left"
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

        {!importSetupExpanded && (
          <div className="mt-3 rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#64748b]">
            已导入 {fileSummaries.length} 个文件，文件校区已对应。展开后可继续导入、保存、导出、清空或修改文件校区。
          </div>
        )}

        {importSetupExpanded && (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
            <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#061226]">
                <FileSpreadsheet size={16} className="text-[#1557c2]" /> 教务 Excel 文件
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border border-[#bfdbfe] bg-white px-3 py-3 text-xs font-extrabold text-[#1557c2] transition-colors hover:bg-[#eaf2ff] sm:px-4 sm:text-sm">
                    {loading ? <RefreshCw size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                    导入 Excel
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
                  <Button type="button" variant="outline" disabled={rowCount === 0} onClick={onSave}>
                    <Save size={15} /> 保存对账
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" disabled={rawLessonCount === 0} onClick={onExport}>
                    <Download size={15} /> 合并导出所有校区
                  </Button>
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
                <div>校区名写在中文或英文括号里，并和“档案信息”的校区名称一致，例如“2026-05-课表（城南校区）.xlsx”或“校宝课表(城南校区)-2026.xlsx”。</div>
                <div>文件名建议包含年份，例如“2026”；没有年份时会按当前年份解析。多个括号同时存在时，优先识别带“校区、中心、分校、教学点”的括号内容。</div>
              </div>
            </div>

            <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#061226]">
                <MapPin size={16} className="text-[#1557c2]" /> 文件对应校区
              </div>
              <div className="space-y-2">
                {fileSummaries.map((file) => (
                  <div key={file.fileName} className="grid grid-cols-1 gap-2 rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-3 md:grid-cols-[minmax(0,1fr)_240px]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-[#061226]">{file.fileName}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-[#64748b]">
                        <Badge variant="secondary" className="text-[10px]">{file.count} 节</Badge>
                        <Badge variant="secondary" className="text-[10px]">{file.months.join("、") || "未知月份"}</Badge>
                        <Badge variant={file.sourceCampus ? "sky" : "amber"} className="text-[10px]">{file.sourceCampus || "文件名未识别校区"}</Badge>
                      </div>
                    </div>
                    <Select value={fileCampusOverrides[file.fileName] ?? ""} onChange={(event) => onFileCampusChange(file.fileName, event.target.value)}>
                      <option value="">选择校区</option>
                      {campusOptions.map((campus) => (
                        <option key={campus.id} value={campus.id}>{campus.name}</option>
                      ))}
                    </Select>
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
