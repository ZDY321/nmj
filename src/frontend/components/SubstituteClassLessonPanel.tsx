import { Banknote, CalendarCheck, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimeTextInput } from "@/components/ui/time-text-input";
import type { Campus, SalaryGradeStage } from "@/shared/types";
import { formatPrivateMoney } from "@/frontend/lib/helpers";
import { salaryGradeStageLabels, salaryGradeStageOrder } from "@/frontend/lib/calculations";

type SubstituteClassLessonPanelProps = {
  amountsVisible: boolean;
  campusOptions: Campus[];
  subjectOptions: string[];
  date: string;
  startTime: string;
  endTime: string;
  billingHours: string;
  campusId: string;
  subject: string;
  title: string;
  externalClassName: string;
  originalTeacherName: string;
  salaryGradeStage: SalaryGradeStage;
  presentStudentCount: string;
  studentNamesText: string;
  note: string;
  status: "scheduled" | "completed";
  isTimeValid: boolean;
  estimatedAmount: number;
  estimatedHours: number;
  estimatedPerStudentFee: number;
  salaryGradeLabel: string;
  onAdd: () => void;
  setDate: (value: string) => void;
  setStartTime: (value: string) => void;
  setEndTime: (value: string) => void;
  setBillingHours: (value: string) => void;
  setCampusId: (value: string) => void;
  setSubject: (value: string) => void;
  setTitle: (value: string) => void;
  setExternalClassName: (value: string) => void;
  setOriginalTeacherName: (value: string) => void;
  setSalaryGradeStage: (value: SalaryGradeStage) => void;
  setPresentStudentCount: (value: string) => void;
  setStudentNamesText: (value: string) => void;
  setNote: (value: string) => void;
  setStatus: (value: "scheduled" | "completed") => void;
};

export function SubstituteClassLessonPanel({
  amountsVisible,
  campusOptions,
  subjectOptions,
  date,
  startTime,
  endTime,
  billingHours,
  campusId,
  subject,
  title,
  externalClassName,
  originalTeacherName,
  salaryGradeStage,
  presentStudentCount,
  studentNamesText,
  note,
  status,
  isTimeValid,
  estimatedAmount,
  estimatedHours,
  estimatedPerStudentFee,
  salaryGradeLabel,
  onAdd,
  setDate,
  setStartTime,
  setEndTime,
  setBillingHours,
  setCampusId,
  setSubject,
  setTitle,
  setExternalClassName,
  setOriginalTeacherName,
  setSalaryGradeStage,
  setPresentStudentCount,
  setStudentNamesText,
  setNote,
  setStatus
}: SubstituteClassLessonPanelProps) {
  const presentCount = Math.max(Math.floor(Number(presentStudentCount)), 0);
  const canAdd = Boolean(date && isTimeValid && presentCount > 0);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.82fr]">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
            <Users size={14} /> 代班补课
          </div>
          <CardTitle>添加代班补课记录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">日期</label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">状态</label>
              <Select value={status} onChange={(event) => setStatus(event.target.value as "scheduled" | "completed")}>
                <option value="completed">已完成</option>
                <option value="scheduled">待上课</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">开始时间</label>
              <TimeTextInput value={startTime} onValueChange={setStartTime} className={!isTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">结束时间</label>
              <TimeTextInput value={endTime} onValueChange={setEndTime} className={!isTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              {!isTimeValid && <div className="text-xs font-bold text-[#b91c1c]">结束时间必须晚于开始时间。</div>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">计费课时</label>
              <Input type="number" min={0} step={0.5} value={billingHours} onChange={(event) => setBillingHours(event.target.value)} placeholder={`自动 ${estimatedHours.toFixed(1)} 小时`} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">校区</label>
              <Select value={campusId} onChange={(event) => setCampusId(event.target.value)}>
                <option value="">未设置校区</option>
                {campusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">科目</label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} list="substitute-subject-options" placeholder="例如：数学" />
              <datalist id="substitute-subject-options">
                {subjectOptions.map((item) => <option key={item} value={item} />)}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">年级阶段</label>
              <Select value={salaryGradeStage} onChange={(event) => setSalaryGradeStage(event.target.value as SalaryGradeStage)}>
                {salaryGradeStageOrder.map((stage) => (
                  <option key={stage} value={stage}>{salaryGradeStageLabels[stage]}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">课程标题</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：初三数学代班补课 7月6日" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">外部班级</label>
              <Input value={externalClassName} onChange={(event) => setExternalClassName(event.target.value)} placeholder="例如：初三数学临时代班" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">原老师</label>
              <Input value={originalTeacherName} onChange={(event) => setOriginalTeacherName(event.target.value)} placeholder="可选" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">到课人数</label>
              <Input type="number" min={0} step={1} value={presentStudentCount} onChange={(event) => setPresentStudentCount(event.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">学生备注</label>
              <Textarea value={studentNamesText} onChange={(event) => setStudentNamesText(event.target.value)} placeholder="可填写学生姓名、班级来源或名单摘要" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">记录备注</label>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：替某老师带班、临时合班、教务确认方式" />
            </div>
          </div>
          <Button type="button" onClick={onAdd} disabled={!canAdd} className="w-full sm:w-auto">
            <Plus size={16} /> 添加代班补课
          </Button>
        </CardContent>
      </Card>

      <Card className="h-fit overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <Banknote size={14} /> 计费预览
          </div>
          <CardTitle>人头费预览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "老师等级", value: salaryGradeLabel },
            { label: "年级阶段", value: salaryGradeStageLabels[salaryGradeStage] },
            { label: "到课人数", value: `${presentCount} 人` },
            { label: "每人费用", value: formatPrivateMoney(estimatedPerStudentFee, amountsVisible) },
            { label: "计费课时", value: `${estimatedHours.toFixed(1)} 小时` },
            { label: "预计金额", value: formatPrivateMoney(estimatedAmount, amountsVisible) }
          ].map((item) => (
            <div key={item.label} className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2">
              <div className="text-xs font-semibold text-[#64748b]">{item.label}</div>
              <div className="mt-1 break-words text-base font-extrabold text-[#061226]">{item.value}</div>
            </div>
          ))}
          <div className="rounded-[12px] border border-[#bfdbfe] bg-[#eaf2ff] px-3 py-2 text-xs font-semibold leading-5 text-[#1557c2]">
            <CalendarCheck size={13} className="mr-1 inline" /> 按教师档案默认等级的对应年级人头费计算，不进入正式课程档案学生名单。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}