import { useMemo, useRef, useState, type FormEvent } from "react";
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
import { compareByName, findStudent, sortStudentsByName } from "@/frontend/lib/helpers";
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
  const studentOptions = sortStudentsByName(vault.students);
  const [studentId, setStudentId] = useState(studentOptions[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [examName, setExamName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [score, setScore] = useState("");
  const [fullScore, setFullScore] = useState("");
  const [rank, setRank] = useState("");
  const [note, setNote] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [trendMetric, setTrendMetric] = useState<"score" | "rank">("score");
  const [activeTrendRecordId, setActiveTrendRecordId] = useState("");
  const trendCardRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog } = useConfirmDialog();

  const records = [...(vault.gradeRecords ?? [])].sort((a, b) => `${b.date} ${b.examName}`.localeCompare(`${a.date} ${a.examName}`));
  const filteredRecords = records.filter((record) => {
    const matchesStudent = studentFilter === "all" || record.studentId === studentFilter;
    const matchesSubject = subjectFilter === "all" || record.subject === subjectFilter;
    return matchesStudent && matchesSubject;
  });
  const subjects = Array.from(new Set(records.map((record) => record.subject).filter(Boolean))).sort(compareByName);
  const selectedStudentRecords = useMemo(() => {
    const targetId = studentFilter === "all" ? studentId : studentFilter;
    return records
      .filter((record) => record.studentId === targetId && (subjectFilter === "all" || record.subject === subjectFilter))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [records, studentFilter, studentId, subjectFilter]);
  const trendRecords = useMemo(() => {
    const groups = new Map<string, GradeRecord[]>();
    selectedStudentRecords.forEach((record) => {
      const group = groups.get(record.subject) ?? [];
      group.push(record);
      groups.set(record.subject, group);
    });
    return Array.from(groups.values())
      .flatMap((group) => group.slice(-10))
      .sort((a, b) => `${a.date} ${a.examName}`.localeCompare(`${b.date} ${b.examName}`));
  }, [selectedStudentRecords]);
  const rankValues = trendRecords.map((record) => parseRankNumber(record.rank)).filter((value): value is number => value !== null);
  const maxRank = Math.max(...rankValues, 1);
  const minRank = Math.min(...rankValues, maxRank);
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

  function focusGradeRecord(record: GradeRecord) {
    setStudentId(record.studentId);
    setStudentFilter(record.studentId);
    if (subjectFilter !== "all" && subjectFilter !== record.subject) {
      setSubjectFilter(record.subject);
    }
    setActiveTrendRecordId(record.id);
    window.setTimeout(() => trendCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
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
                {studentOptions.map((student) => (
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
                  {studentOptions.map((student) => (
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
            {filteredRecords.length > 0 && (
              <div className="space-y-3 md:hidden">
                {filteredRecords.map((record) => (
                  <div
                    key={record.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => focusGradeRecord(record)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        focusGradeRecord(record);
                      }
                    }}
                    className={`cursor-pointer rounded-[14px] border p-4 transition-all hover:border-[#ff8617] hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)] ${
                      activeTrendRecordId === record.id ? "border-[#ff8617] bg-[#fff7ed]" : "border-[#dbe4ef] bg-[#f8fbff]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#64748b]">{record.date} · {record.subject}</div>
                        <div className="mt-1 break-words text-base font-extrabold text-[#061226]">{record.examName}</div>
                        <div className="mt-1 text-sm font-semibold text-[#25324a]">
                          {findStudent(vault, record.studentId)?.name ?? "未知学生"}
                        </div>
                      </div>
                      <Badge variant="sky" className="shrink-0">
                        {record.score}{record.fullScore ? ` / ${record.fullScore}` : ""}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#64748b]">
                      <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                        百分制 {normalizedScore(record).toFixed(1)}%
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                        排名 {record.rank || "未填"}
                      </span>
                    </div>
                    {record.note && (
                      <div className="mt-3 rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#64748b]">
                        {record.note}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          confirm({
                            title: "删除这条成绩记录？",
                            description: `${record.date} · ${record.examName}`,
                            confirmLabel: "删除",
                            tone: "danger",
                            onConfirm: () => onDeleteGradeRecord(record.id)
                          });
                        }}
                      >
                        <Trash2 size={14} /> 删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="hidden max-h-[520px] overflow-y-auto pr-2 md:block">
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
                    <tr
                      key={record.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => focusGradeRecord(record)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          focusGradeRecord(record);
                        }
                      }}
                      className={`cursor-pointer align-top transition-colors hover:bg-[#fff7ed] ${
                        activeTrendRecordId === record.id ? "bg-[#fff7ed]" : "bg-[#f8fbff]"
                      }`}
                    >
                      <td className="rounded-l-[12px] px-3 py-3 font-bold text-[#25324a]">{record.date}</td>
                      <td className="px-3 py-3">{findStudent(vault, record.studentId)?.name ?? "未知学生"}</td>
                      <td className="px-3 py-3">{record.subject}</td>
                      <td className="px-3 py-3">
                        <div className="font-bold text-[#061226]">{record.examName}</div>
                        {record.note && <div className="mt-1 max-w-[220px] text-xs leading-5 text-[#64748b]">{record.note}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="sky">
                            {record.score}{record.fullScore ? ` / ${record.fullScore}` : ""}
                          </Badge>
                          {record.fullScore && (
                            <span className="text-xs font-semibold text-[#64748b]">
                              {normalizedScore(record).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#475569]">{record.rank || "未填"}</td>
                      <td className="rounded-r-[12px] px-3 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={(event) => {
                            event.stopPropagation();
                            confirm({
                              title: "删除这条成绩记录？",
                              description: `${record.date} · ${record.examName}`,
                              confirmLabel: "删除",
                              tone: "danger",
                              onConfirm: () => onDeleteGradeRecord(record.id)
                            });
                          }}
                        >
                          <Trash2 size={14} /> 删除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRecords.length === 0 && (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                当前筛选下没有成绩记录
              </div>
            )}

            <div ref={trendCardRef} className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-extrabold text-[#061226]">学生成绩走势</div>
                  <div className="mt-1 text-xs font-semibold text-[#64748b]">
                    {trendMetric === "score" ? "按科目分别绘制百分制折线，便于看同一学生的阶段变化。" : "按科目分别绘制排名折线，位置越高代表排名越靠前。"}
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
              <TrendLineChart
                records={trendRecords}
                metric={trendMetric}
                maxRank={maxRank}
                minRank={minRank}
                activeRecordId={activeTrendRecordId}
                onActiveRecordChange={setActiveTrendRecordId}
              />
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

function TrendLineChart({
  records,
  metric,
  maxRank,
  minRank,
  activeRecordId,
  onActiveRecordChange
}: {
  records: GradeRecord[];
  metric: "score" | "rank";
  maxRank: number;
  minRank: number;
  activeRecordId: string;
  onActiveRecordChange: (recordId: string) => void;
}) {
  if (records.length === 0) {
    return (
      <div className="flex h-[230px] items-center justify-center rounded-[12px] border border-dashed border-[#cbd6e3] bg-white text-sm font-semibold text-[#64748b]">
        选择学生后查看走势
      </div>
    );
  }

  const width = 720;
  const height = 250;
  const plotLeft = 58;
  const plotRight = 696;
  const plotTop = 28;
  const plotBottom = 190;
  const plotHeight = plotBottom - plotTop;
  const scoreMax = niceScoreMax(Math.max(...records.map((record) => normalizedScore(record)), 100));
  const points = records.map((record, index) => {
    const rankValue = parseRankNumber(record.rank);
    const value = metric === "score" ? normalizedScore(record) : rankValue;
    const x = records.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + (index / (records.length - 1)) * (plotRight - plotLeft);
    const y = value === null ? null : valueToY(value, metric, scoreMax, minRank, maxRank, plotTop, plotBottom);
    return { record, value, rankValue, x, y };
  });
  const subjectNames = Array.from(new Set(records.map((record) => record.subject)));
  const subjectColors = ["#1557c2", "#ff8617", "#16a34a", "#7c3aed", "#dc2626", "#0891b2"];
  const subjectColor = (subject: string) => subjectColors[Math.max(subjectNames.indexOf(subject), 0) % subjectColors.length];
  const subjectLines = subjectNames.map((subject) => {
    const subjectPoints = points.filter((point) => point.record.subject === subject && point.y !== null && point.value !== null);
    return {
      subject,
      points: subjectPoints,
      line: subjectPoints.map((point) => `${point.x},${point.y ?? 0}`).join(" ")
    };
  });
  const validPoints = points.filter((point) => point.y !== null && point.value !== null);
  const activeRecord = records.find((record) => record.id === activeRecordId) ?? records.at(-1);
  const hasDrawablePoints = validPoints.length > 0;
  const axisRows = metric === "score"
    ? [
        { y: plotTop, label: `${scoreMax}` },
        { y: plotTop + plotHeight / 2, label: `${scoreMax / 2}` },
        { y: plotBottom, label: "0" }
      ]
    : maxRank === minRank
      ? [{ y: plotTop + plotHeight / 2, label: formatRankLabel(undefined, maxRank) }]
      : [
          { y: plotTop, label: formatRankLabel(undefined, minRank) },
          { y: plotTop + plotHeight / 2, label: formatRankLabel(undefined, Math.round((minRank + maxRank) / 2)) },
          { y: plotBottom, label: formatRankLabel(undefined, maxRank) }
        ];

  return (
    <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[230px] w-full overflow-visible" role="img" aria-label="学生成绩走势折线图">
        {axisRows.map((row) => (
          <g key={`${row.y}-${row.label}`}>
            <line x1={plotLeft} x2={plotRight} y1={row.y} y2={row.y} stroke="#dbe4ef" strokeDasharray="4 6" />
            <text x="4" y={row.y + 4} className="fill-[#64748b] text-[12px] font-semibold">
              {row.label}
            </text>
          </g>
        ))}
        <line x1={plotLeft} x2={plotLeft} y1={plotTop} y2={plotBottom} stroke="#dbe4ef" />
        <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="#dbe4ef" />
        {subjectLines.map((series, index) => (
          series.line ? (
            <motion.polyline
              key={series.subject}
              points={series.line}
              fill="none"
              stroke={subjectColor(series.subject)}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: index * 0.04 }}
            />
          ) : null
        ))}
        {points.map((point) => {
          const isActive = activeRecord?.id === point.record.id;
          const label = trendValueLabel(point.record, metric);
          return (
            <g
              key={point.record.id}
              className="cursor-pointer"
              onClick={() => onActiveRecordChange(point.record.id)}
            >
              {point.y !== null ? (
                <>
                  <circle cx={point.x} cy={point.y} r="15" fill="transparent" />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isActive ? "7" : "5"}
                    fill={isActive ? "#061226" : "#fff"}
                    stroke={subjectColor(point.record.subject)}
                    strokeWidth="4"
                  >
                    <title>{`${point.record.date} ${point.record.examName}: ${label}`}</title>
                  </circle>
                </>
              ) : (
                <text x={point.x} y={plotBottom - 8} textAnchor="middle" className="fill-[#94a3b8] text-[12px] font-bold">
                  未填
                </text>
              )}
              <text x={point.x} y="224" textAnchor="middle" className="fill-[#64748b] text-[11px] font-semibold">
                {point.record.date.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>

      {!hasDrawablePoints && (
        <div className="mt-2 rounded-[10px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] px-3 py-2 text-center text-xs font-semibold text-[#64748b]">
          当前记录没有可绘制的排名数值
        </div>
      )}

      {activeRecord && (
        <div className="mt-3 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {subjectNames.map((subject) => (
              <span key={subject} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#25324a] ring-1 ring-[#dbe4ef]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subjectColor(subject) }} />
                {subject}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold text-[#061226]">{activeRecord.examName}</div>
              <div className="mt-1 text-xs font-semibold text-[#64748b]">
                {activeRecord.date} · {activeRecord.subject}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="sky">{trendValueLabel(activeRecord, "score")}</Badge>
              <Badge variant="secondary">{trendValueLabel(activeRecord, "rank")}</Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function valueToY(
  value: number,
  metric: "score" | "rank",
  scoreMax: number,
  minRank: number,
  maxRank: number,
  plotTop: number,
  plotBottom: number
): number {
  if (metric === "score") {
    const ratio = Math.max(0, Math.min(value / scoreMax, 1));
    return plotBottom - ratio * (plotBottom - plotTop);
  }
  if (maxRank === minRank) {
    return plotTop + (plotBottom - plotTop) / 2;
  }
  return plotTop + ((value - minRank) / (maxRank - minRank)) * (plotBottom - plotTop);
}

function trendValueLabel(record: GradeRecord, metric: "score" | "rank"): string {
  if (metric === "score") {
    return record.fullScore
      ? `${normalizedScore(record).toFixed(1)}% · ${record.score}/${record.fullScore}`
      : `${record.score}分`;
  }
  const rankValue = parseRankNumber(record.rank);
  return rankValue !== null ? formatRankLabel(record.rank, rankValue) : "排名未填";
}

function niceScoreMax(value: number): number {
  if (value <= 100) return 100;
  return Math.ceil(value / 10) * 10;
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
