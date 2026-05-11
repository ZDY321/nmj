import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { BarChart3, CalendarDays, GraduationCap, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { makeId } from "@/frontend/lib/crypto";
import { findStudent } from "@/frontend/lib/helpers";
import { todayIso } from "@/frontend/lib/calculations";
import type { GradeRecord, TeacherVault } from "@/shared/types";

export function GradesView({
  vault,
  onAddGradeRecord,
  onDeleteGradeRecord
}: {
  vault: TeacherVault;
  onAddGradeRecord: (record: GradeRecord) => void;
  onDeleteGradeRecord: (recordId: string) => void;
}) {
  const [studentId, setStudentId] = useState(vault.students[0]?.id ?? "");
  const [subject, setSubject] = useState("数学");
  const [examName, setExamName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [score, setScore] = useState("");
  const [fullScore, setFullScore] = useState("100");
  const [rank, setRank] = useState("");
  const [note, setNote] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [trendMetric, setTrendMetric] = useState<"score" | "rank">("score");
  const [scoreLabelModes, setScoreLabelModes] = useState<Record<string, "ratio" | "raw">>({});
  const { confirm, dialog } = useConfirmDialog();

  const records = [...(vault.gradeRecords ?? [])].sort((a, b) => `${b.date} ${b.examName}`.localeCompare(`${a.date} ${a.examName}`));
  const filteredRecords = records.filter((record) => {
    const matchesStudent = studentFilter === "all" || record.studentId === studentFilter;
    const matchesSubject = subjectFilter === "all" || record.subject === subjectFilter;
    return matchesStudent && matchesSubject;
  });
  const subjects = Array.from(new Set(records.map((record) => record.subject).filter(Boolean)));
  const selectedStudentRecords = useMemo(() => {
    const targetId = studentFilter === "all" ? studentId : studentFilter;
    return records
      .filter((record) => record.studentId === targetId && (subjectFilter === "all" || record.subject === subjectFilter))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [records, studentFilter, studentId, subjectFilter]);
  const trendRecords = selectedStudentRecords.slice(-10);
  const rankValues = trendRecords.map((record) => parseRankNumber(record.rank)).filter((value): value is number => value !== null);
  const maxRank = Math.max(...rankValues, 1);
  const average =
    filteredRecords.length > 0
      ? filteredRecords.reduce((sum, record) => sum + normalizedScore(record), 0) / filteredRecords.length
      : 0;

  function addRecord(event: FormEvent) {
    event.preventDefault();
    const numericScore = Number(score);
    const numericFullScore = Number(fullScore);
    if (!studentId || !subject.trim() || !examName.trim() || !Number.isFinite(numericScore)) return;
    onAddGradeRecord({
      id: makeId("grade"),
      studentId,
      subject: subject.trim(),
      examName: examName.trim(),
      date,
      score: numericScore,
      fullScore: Number.isFinite(numericFullScore) && numericFullScore > 0 ? numericFullScore : undefined,
      rank: rank.trim() || undefined,
      note: note.trim() || undefined
    });
    setExamName("");
    setScore("");
    setRank("");
    setNote("");
  }

  function toggleScoreLabelMode(recordId: string) {
    setScoreLabelModes((current) => ({
      ...current,
      [recordId]: current[recordId] === "raw" ? "ratio" : "raw"
    }));
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="记录数量" value={`${filteredRecords.length} 条`} hint="当前筛选" icon={BarChart3} />
        <Metric label="平均分" value={filteredRecords.length ? `${average.toFixed(1)}` : "-"} hint="折算百分制" icon={GraduationCap} />
        <Metric label="涉及学生" value={`${new Set(filteredRecords.map((record) => record.studentId)).size} 人`} hint="成绩档案" icon={CalendarDays} />
      </div>

      <div className="space-y-6">
        <Card className="h-fit overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <Plus size={14} /> 成绩录入
            </div>
            <CardTitle>新增成绩记录</CardTitle>
            <CardDescription>记录考试、测验、满分、排名和备注，后续可按学生查看变化。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={addRecord} className="space-y-3">
              <Select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
                {vault.students.map((student) => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </Select>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="科目" />
                <Input value={examName} onChange={(event) => setExamName(event.target.value)} placeholder="考试/测验名称" />
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                <Input type="number" value={score} onChange={(event) => setScore(event.target.value)} placeholder="得分" />
                <Input type="number" value={fullScore} onChange={(event) => setFullScore(event.target.value)} placeholder="满分" />
                <Input value={rank} onChange={(event) => setRank(event.target.value)} placeholder="排名，可选" />
              </div>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="错题、知识点、家长反馈等备注" />
              <Button type="submit" className="w-full" disabled={!studentId || !examName.trim() || !score}>
                <Plus size={15} /> 添加成绩
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                  <BarChart3 size={14} /> 成绩列表
                </div>
                <CardTitle>成绩记录</CardTitle>
                <CardDescription>按学生和科目筛选，百分制用于横向对比。</CardDescription>
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[420px]">
                <Select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}>
                  <option value="all">全部学生</option>
                  {vault.students.map((student) => (
                    <option key={student.id} value={student.id}>{student.name}</option>
                  ))}
                </Select>
                <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
                  <option value="all">全部科目</option>
                  {subjects.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[520px] overflow-y-auto pr-2">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-xs font-extrabold text-[#64748b]">
                    <th className="px-3 py-2">日期</th>
                    <th className="px-3 py-2">学生</th>
                    <th className="px-3 py-2">科目</th>
                    <th className="px-3 py-2">考试</th>
                    <th className="px-3 py-2">分数</th>
                    <th className="px-3 py-2">排名</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="bg-[#f8fbff] align-top">
                      <td className="rounded-l-[12px] px-3 py-3 font-bold text-[#25324a]">{record.date}</td>
                      <td className="px-3 py-3">{findStudent(vault, record.studentId)?.name ?? "未知学生"}</td>
                      <td className="px-3 py-3">{record.subject}</td>
                      <td className="px-3 py-3">
                        <div className="font-bold text-[#061226]">{record.examName}</div>
                        {record.note && <div className="mt-1 max-w-[220px] text-xs leading-5 text-[#64748b]">{record.note}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="sky">
                          {record.score}{record.fullScore ? ` / ${record.fullScore}` : ""}
                        </Badge>
                        {record.fullScore && <div className="mt-1 text-xs font-semibold text-[#64748b]">{normalizedScore(record).toFixed(1)}%</div>}
                      </td>
                      <td className="px-3 py-3 text-[#475569]">{record.rank || "未填"}</td>
                      <td className="rounded-r-[12px] px-3 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            confirm({
                              title: "删除这条成绩记录？",
                              description: `${record.date} · ${record.examName}`,
                              confirmLabel: "删除",
                              tone: "danger",
                              onConfirm: () => onDeleteGradeRecord(record.id)
                            })
                          }
                        >
                          <Trash2 size={14} /> 删除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRecords.length === 0 && (
                <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                  当前筛选下没有成绩记录
                </div>
              )}
            </div>

            <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-extrabold text-[#061226]">学生成绩走势</div>
                  <div className="mt-1 text-xs font-semibold text-[#64748b]">
                    {trendMetric === "score" ? "按百分制折算显示，越高越好。" : "按排名数值显示，数值越小越靠前。"}
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 rounded-[12px] border border-[#dbe4ef] bg-white p-1 sm:w-[180px]">
                  <button
                    type="button"
                    onClick={() => setTrendMetric("score")}
                    className={`rounded-[9px] px-3 py-2 text-xs font-bold ${trendMetric === "score" ? "bg-[#1557c2] text-white" : "text-[#25324a]"}`}
                  >
                    成绩
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendMetric("rank")}
                    className={`rounded-[9px] px-3 py-2 text-xs font-bold ${trendMetric === "rank" ? "bg-[#1557c2] text-white" : "text-[#25324a]"}`}
                  >
                    排名
                  </button>
                </div>
              </div>
              <div className="flex h-[190px] items-end gap-2">
                {trendRecords.map((record, index) => {
                  const rankValue = parseRankNumber(record.rank);
                  const value = trendMetric === "score" ? normalizedScore(record) : rankValue;
                  const scoreMode = scoreLabelModes[record.id] ?? "ratio";
                  const ratioLabel = `${normalizedScore(record).toFixed(1)}%`;
                  const rawScoreLabel = record.fullScore ? `${record.score}/${record.fullScore}` : `${record.score}分`;
                  const height =
                    trendMetric === "score"
                      ? Math.max(Math.min(normalizedScore(record), 100), 4)
                        : rankValue
                          ? Math.max(((maxRank - rankValue + 1) / maxRank) * 100, 8)
                          : 4;
                  const label = trendMetric === "score"
                    ? scoreMode === "raw" ? rawScoreLabel : ratioLabel
                    : rankValue
                      ? formatRankLabel(record.rank, rankValue)
                      : "未填";
                  const chartTitle = trendMetric === "score"
                    ? `${record.examName}: ${ratioLabel} · ${rawScoreLabel}`
                    : `${record.examName}: ${label}`;
                  return (
                    <div key={record.id} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                      <div className="truncate text-center text-[11px] font-extrabold text-[#25324a]" title={chartTitle}>
                        {label}
                      </div>
                      <motion.button
                        type="button"
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ delay: index * 0.04 }}
                        onClick={() => {
                          if (trendMetric === "score") {
                            toggleScoreLabelMode(record.id);
                          }
                        }}
                        className={`mx-auto w-full max-w-[34px] rounded-t-[6px] border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8617] focus-visible:ring-offset-2 ${
                          trendMetric === "score" ? "cursor-pointer" : "cursor-default"
                        } ${
                          value === null ? "bg-[#cbd5e1]" : trendMetric === "score" ? "bg-[#1557c2]" : "bg-[#ff8617]"
                        }`}
                        title={chartTitle}
                        aria-label={chartTitle}
                      />
                      <span className="truncate text-center text-[10px] font-semibold text-[#64748b]">{record.date.slice(5)}</span>
                    </div>
                  );
                })}
                {trendRecords.length === 0 && (
                  <div className="flex h-full flex-1 items-center justify-center text-sm font-semibold text-[#64748b]">
                    选择学生后查看走势
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function normalizedScore(record: GradeRecord): number {
  if (!record.fullScore || record.fullScore <= 0) return record.score;
  return (record.score / record.fullScore) * 100;
}

function parseRankNumber(rank?: string): number | null {
  if (!rank) return null;
  const match = rank.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function formatRankLabel(rank: string | undefined, value: number): string {
  const trimmed = rank?.trim();
  if (!trimmed) return `第${value}名`;
  if (trimmed.includes("%") || /[名前]/.test(trimmed)) return trimmed;
  return `第${value}名`;
}

function Metric({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof BarChart3;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf2ff] text-[#1557c2]">
          <Icon size={21} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#64748b]">{label}</div>
          <div className="mt-1 text-2xl font-extrabold text-[#061226]">{value}</div>
          <div className="mt-1 text-xs font-bold text-[#94a3b8]">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}
