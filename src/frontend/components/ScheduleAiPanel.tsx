import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AiProviderConfig, AiProviderUsage, AiScheduleDraftResponse, AiScheduleSession, AiScheduleTaskType } from "@/shared/types";
import {
  aiActionLabel,
  aiFieldLabel,
  formatAiValue,
  textValue
} from "@/frontend/lib/scheduleViewHelpers";

type ScheduleAiPanelProps = {
  aiActiveCourseCount: number;
  aiActiveStudentCount: number;
  aiApplyResult: { ok: boolean; message: string } | null;
  aiContextSummary: {
    activeCourses: number;
    activeStudents: number;
  };
  aiDraft: AiScheduleDraftResponse | null;
  aiDraftActions: Record<string, unknown>[];
  aiDraftAnswer: string;
  aiDraftCanApply: boolean;
  aiDraftQuestions: unknown[];
  aiDraftRecord: Record<string, unknown> | null;
  aiDraftSummary: string;
  aiDraftWarnings: unknown[];
  aiFollowupAnswer: string;
  aiInstruction: string;
  aiLoading: boolean;
  aiMessage: string;
  aiPendingLessonCount: number;
  aiProviderId: string;
  aiRawResultText: string;
  aiTaskType: AiScheduleTaskType;
  aiTodayLessonCount: number;
  aiUsageText: string;
  canClearAiWork: boolean;
  canShowAiProviderEndpoint: boolean;
  enabledAiProviders: AiProviderConfig[];
  isAdmin: boolean;
  onApplyAiDraft: () => void;
  onClearAiWork: () => void;
  onCopyAiRawResult: () => void | Promise<void>;
  onPatchSession: (patch: Partial<AiScheduleSession>) => void;
  onRefreshAiProviders: () => void | Promise<void>;
  onSubmitAiDraft: () => void | Promise<void>;
  onSubmitAiFollowup: () => void | Promise<void>;
  selectedAiEndpoint: string;
  selectedAiProvider: AiProviderConfig | undefined;
  selectedAiUsage: AiProviderUsage | null;
  aiApplying: boolean;
};

export function ScheduleAiPanel({
  aiActiveCourseCount,
  aiActiveStudentCount,
  aiApplyResult,
  aiContextSummary,
  aiDraft,
  aiDraftActions,
  aiDraftAnswer,
  aiDraftCanApply,
  aiDraftQuestions,
  aiDraftRecord,
  aiDraftSummary,
  aiDraftWarnings,
  aiFollowupAnswer,
  aiInstruction,
  aiLoading,
  aiMessage,
  aiPendingLessonCount,
  aiProviderId,
  aiRawResultText,
  aiTaskType,
  aiTodayLessonCount,
  aiUsageText,
  canClearAiWork,
  canShowAiProviderEndpoint,
  enabledAiProviders,
  isAdmin,
  onApplyAiDraft,
  onClearAiWork,
  onCopyAiRawResult,
  onPatchSession,
  onRefreshAiProviders,
  onSubmitAiDraft,
  onSubmitAiFollowup,
  selectedAiEndpoint,
  selectedAiProvider,
  selectedAiUsage,
  aiApplying
}: ScheduleAiPanelProps) {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-2 border-[#bfdbfe]">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <Sparkles size={14} /> AI 排课助手
            </div>
            <CardTitle>自然语言转排课操作</CardTitle>
            <CardDescription>AI 会返回结构化建议，确认写入前需要人工核对，原有手动排课功能不受影响。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="sky">
              <ShieldCheck size={12} /> {isAdmin ? "管理员" : "普通用户"}
            </Badge>
            <Badge variant={enabledAiProviders.length > 0 ? "sage" : "amber"}>
              {enabledAiProviders.length > 0 ? `${enabledAiProviders.length} 个可用接口` : "未配置接口"}
            </Badge>
            <Badge variant={selectedAiUsage && selectedAiUsage.remainingToday > 0 ? "sage" : "amber"}>
              {selectedAiUsage ? `剩余 ${selectedAiUsage.remainingToday} 次` : "次数待加载"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "可用学生", value: `${aiActiveStudentCount} 人` },
              { label: "可用课程", value: `${aiActiveCourseCount} 个` },
              { label: "待处理课时", value: `${aiPendingLessonCount} 节` },
              { label: "今日课程", value: `${aiTodayLessonCount} 节` },
              { label: "AI 今日次数", value: selectedAiUsage ? `${selectedAiUsage.usedToday}/${selectedAiUsage.dailyLimit}` : "未选择" }
            ].map((item) => (
              <div key={item.label} className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3">
                <div className="text-xs font-semibold text-[#64748b]">{item.label}</div>
                <div className="mt-1 text-lg font-extrabold text-[#061226]">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-4 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">AI 接口配置</label>
                  <Select value={aiProviderId} onChange={(event) => onPatchSession({ providerId: event.target.value, draft: null, message: "" })} disabled={aiLoading || enabledAiProviders.length === 0}>
                    <option value="">选择已保存配置</option>
                    {enabledAiProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} · {provider.model}{provider.isDefault ? " · 默认" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">操作类型</label>
                  <Select value={aiTaskType} onChange={(event) => onPatchSession({ taskType: event.target.value as AiScheduleTaskType, draft: null, message: "" })} disabled={aiLoading}>
                    <option value="auto">智能识别</option>
                    <option value="data_query">数据问答</option>
                    <option value="student_course">新增或修改学生和课程</option>
                    <option value="schedule_lessons">新增排课</option>
                    <option value="sync_lessons">同步排课</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">自然语言输入</label>
                <Textarea
                  rows={8}
                  value={aiInstruction}
                  onChange={(event) => onPatchSession({ instruction: event.target.value, draft: null, followupAnswer: "", message: "" })}
                  placeholder="例如：本周一共有几节课？本月 08:00-10:00 有哪些课？或：新增学生张三，三年级，A校区，语文一对一。"
                  className="min-h-[180px] bg-white"
                  disabled={aiLoading}
                />
                <div className="grid grid-cols-1 gap-2 text-xs font-semibold leading-5 text-[#64748b] md:grid-cols-2">
                  {[
                    "描述尽量准确详细，写清学生姓名、校区、年级、科目、课程档案名称、日期和时间。",
                    "可以直接询问统计问题，例如本周/本月课节数量、某时间段哪几天有课、预计课时费。",
                    "涉及课时费时，AI 只能根据系统已有金额回答；缺少单价时会提示无法计算总额。",
                    "可以按日常说法输入，例如“本周日上午9点、下午2点”；如果跨周或容易混淆，再补充完整日期或24小时制时间。",
                    "创建班课或多人课时，请写清最少人数、基础费用、每增加1人费用；最少人数不是当前关联学生人数。",
                    "修改学生档案时，请写清原姓名或学生ID，以及新姓名、年级、校区、学校或备注。",
                    "涉及修改或删除时，请写清原课程日期、时间、科目和学生，避免 AI 匹配到相近课程。",
                    "同步排课时，请写清来源日期/日期段、目标日期/日期段、是否覆盖已有课节、是否包含已取消课节；系统只复制课程安排，新课节的上节课内容会按目标时间线指向前面最近一节同课程课。",
                    "AI 只生成建议，点击确认写入前请核对摘要、操作建议和风险提醒。"
                  ].map((text) => (
                    <div key={text} className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                      {text}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-semibold leading-5 text-[#64748b]">
                  会发送当前可用学生、课程、校区、科目和近 14 天到未来 45 天课程，用于识别重复和时间关系。
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="outline" disabled={aiLoading || !canClearAiWork} onClick={onClearAiWork}>
                    <Trash2 size={15} /> 清空
                  </Button>
                  <Button type="button" variant="outline" disabled={aiLoading} onClick={() => void onRefreshAiProviders()}>
                    <RefreshCw size={15} /> 刷新配置
                  </Button>
                  <Button type="button" disabled={aiLoading || !aiProviderId || !aiInstruction.trim()} onClick={() => void onSubmitAiDraft()}>
                    <WandSparkles size={15} /> {aiLoading ? "生成中" : "生成建议"}
                  </Button>
                </div>
              </div>
              {selectedAiProvider && (
                <div className="space-y-1 rounded-[12px] border border-[#bfdbfe] bg-[#eaf2ff] px-3 py-2 text-xs font-bold leading-5 text-[#1557c2]">
                  <div>
                    当前使用：{selectedAiProvider.name} · {selectedAiProvider.model}
                    {canShowAiProviderEndpoint && selectedAiProvider.maskedApiKey ? ` · ${selectedAiProvider.maskedApiKey}` : ""}
                  </div>
                  <div>{aiUsageText}</div>
                  {canShowAiProviderEndpoint && (
                    <>
                      <div className="break-all">接口地址：{selectedAiProvider.baseUrl}</div>
                      <div className="break-all">实际调用：{selectedAiEndpoint}</div>
                    </>
                  )}
                </div>
              )}
              {aiMessage && (
                <div className="rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-sm font-bold text-[#25324a]">
                  {aiMessage}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#061226]">
                  <Bot size={16} className="text-[#1557c2]" /> 当前能力范围
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm font-semibold text-[#25324a]">
                  {[
                    "回答本周、本月、某时间段课节数量和日期分布",
                    "按当前课节金额汇总已知课时费，缺少单价时明确提示无法计算",
                    "录入新学生和课程 / 班课信息",
                    "修改学生档案（姓名、年级、校区、学校、备注）",
                    "新增自定义班型并设置默认计费",
                    "修改课程班型、校区、关联学生，或迁移到新课程",
                    "按指定日期或星期批量新增排课",
                    "同步某一天或某几天的排课",
                    "生成结果必须预览并确认后写入"
                  ].map((text) => (
                    <div key={text} className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2">
                      {text}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-4">
                <div className="mb-2 text-sm font-extrabold text-[#9a3412]">不让 AI 直接处理的内容</div>
                <div className="text-sm font-semibold leading-6 text-[#9a3412]">
                  今日提醒、补课状态、课程记录详情和冲突判断继续由系统代码处理；涉及写入的数据必须先生成建议并由人工确认。
                </div>
              </div>

              <div className="rounded-[14px] border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                <div className="mb-2 text-sm font-extrabold text-[#15803d]">使用次数说明</div>
                <div className="text-sm font-semibold leading-6 text-[#166534]">
                  每日上限按当前用户统计，每个人各自计算次数；只有成功生成建议才会计入次数，生成失败不会扣次数。
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-extrabold text-[#061226]">建议结果预览</div>
                <div className="mt-1 text-xs font-semibold text-[#64748b]">
                  这里会把 AI 返回内容整理成可核对的摘要、操作建议和提醒。正式写入前仍需要系统校验和人工确认。
                </div>
              </div>
              <Button
                type="button"
                variant={aiDraftCanApply ? "default" : "outline"}
                disabled={!aiDraftCanApply || aiLoading || aiApplying}
                onClick={onApplyAiDraft}
                className="shrink-0 disabled:border-[#e5e7eb] disabled:bg-[#f3f4f6] disabled:text-[#9ca3af] disabled:shadow-none"
              >
                {aiApplying ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {aiApplying ? "写入中" : "确认写入"}
              </Button>
            </div>
            {aiDraft ? (
              <div className="mt-4 space-y-4">
                {aiApplyResult && (
                  <div className={`rounded-[12px] border px-4 py-3 text-sm font-extrabold leading-6 ${
                    aiApplyResult.ok
                      ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
                      : "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]"
                  }`}>
                    {aiApplyResult.message}
                  </div>
                )}
                <div className="rounded-[12px] border border-[#bfdbfe] bg-[#eaf2ff] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#1557c2]">
                    <Sparkles size={16} /> 摘要
                  </div>
                  <div className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#25324a]">
                    {aiDraftSummary || "AI 没有返回摘要，请查看下方操作建议或原始内容。"}
                  </div>
                </div>

                {aiDraftAnswer && (
                  <div className="rounded-[12px] border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#15803d]">
                      <Bot size={16} /> AI 回答
                    </div>
                    <div className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#166534]">
                      {aiDraftAnswer}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-extrabold text-[#061226]">操作建议</div>
                    <Badge variant={aiDraftActions.length > 0 ? "sky" : "secondary"}>{aiDraftActions.length} 项</Badge>
                  </div>
                  {aiDraftActions.map((action, index) => {
                    const actionType = textValue(action.type, "unknown");
                    const fields = Object.entries(action).filter(([key]) => key !== "type");
                    return (
                      <div key={`${actionType}-${index}`} className="rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="sky">{aiActionLabel(actionType)}</Badge>
                          <span className="text-sm font-extrabold text-[#061226]">建议 {index + 1}</span>
                        </div>
                        {fields.length > 0 ? (
                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                            {fields.map(([key, value]) => (
                              <div key={key} className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                                <div className="text-xs font-bold uppercase text-[#64748b]">{aiFieldLabel(key)}</div>
                                <div className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#25324a]">
                                  {formatAiValue(value)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2 text-sm font-semibold text-[#64748b]">
                            这条建议没有附加字段。
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {aiDraftActions.length === 0 && (
                    <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                      暂无可直接执行的操作建议，可能需要先补充信息。
                    </div>
                  )}
                </div>

                {(aiDraftQuestions.length > 0 || aiDraftWarnings.length > 0) && (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {aiDraftQuestions.length > 0 && (
                      <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] p-4">
                        <div className="mb-2 text-sm font-extrabold text-[#9a3412]">需要确认的问题</div>
                        <div className="space-y-2">
                          {aiDraftQuestions.map((question, index) => (
                            <div key={index} className="rounded-[10px] border border-[#fed7aa] bg-white/80 px-3 py-2 text-sm font-semibold leading-6 text-[#9a3412]">
                              {formatAiValue(question)}
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 space-y-2 rounded-[12px] border border-[#fed7aa] bg-white/80 p-3">
                          <label className="text-sm font-extrabold text-[#9a3412]">补充信息后继续生成</label>
                          <Textarea
                            rows={4}
                            value={aiFollowupAnswer}
                            onChange={(event) => onPatchSession({ followupAnswer: event.target.value })}
                            placeholder="例如：校区选延安；李雨泽初三、顾延泽初二；课程档案名称用“李雨泽、顾延泽化学”。"
                            className="bg-white"
                            disabled={aiLoading}
                          />
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-xs font-semibold leading-5 text-[#9a3412]">
                              会把原始需求、上方问题和你的补充答案一起发给 AI，重新生成完整建议。
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={aiLoading || !aiFollowupAnswer.trim()}
                              onClick={() => void onSubmitAiFollowup()}
                            >
                              <WandSparkles size={14} /> 继续生成
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    {aiDraftWarnings.length > 0 && (
                      <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#b91c1c]">
                          <AlertTriangle size={15} /> 风险提醒
                        </div>
                        <div className="space-y-2">
                          {aiDraftWarnings.map((warning, index) => (
                            <div key={index} className="rounded-[10px] border border-[#fecaca] bg-white/80 px-3 py-2 text-sm font-semibold leading-6 text-[#b91c1c]">
                              {formatAiValue(warning)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!aiDraftRecord && (
                  <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-sm font-bold leading-6 text-[#9a3412]">
                    AI 没有返回标准结构，下面保留原始内容用于人工查看。
                  </div>
                )}

                <div className="relative rounded-[12px] border border-[#e8eef6] bg-white">
                  <details>
                    <summary className="cursor-pointer px-4 py-3 pr-32 text-sm font-extrabold text-[#25324a]">
                      查看原始返回内容
                    </summary>
                    <pre className="max-h-[260px] overflow-auto border-t border-[#e8eef6] bg-[#f8fbff] p-4 text-xs font-semibold leading-6 text-[#25324a]">
{aiRawResultText}
                    </pre>
                  </details>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="absolute right-3 top-2"
                    onClick={() => void onCopyAiRawResult()}
                  >
                    <Copy size={14} /> 复制结果
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5">
                <div className="text-sm font-extrabold text-[#061226]">
                  {aiLoading ? "正在生成新的建议..." : enabledAiProviders.length > 0 ? "等待生成建议" : "需要先配置 AI 接口"}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-sm font-semibold text-[#64748b] sm:grid-cols-2">
                  <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                    当前角色：{isAdmin ? "管理员" : "普通用户"}
                  </div>
                  <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                    当前接口：{selectedAiProvider ? `${selectedAiProvider.name} / ${selectedAiProvider.model}` : "未选择"}
                  </div>
                  <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                    可用学生：{aiContextSummary.activeStudents} 人
                  </div>
                  <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                    可用课程：{aiContextSummary.activeCourses} 个
                  </div>
                </div>
              </div>
            )}
            {aiDraft && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{aiDraft.model}</Badge>
                {aiDraft.usage?.totalTokens !== undefined && (
                  <Badge variant="sky">tokens {aiDraft.usage.totalTokens}</Badge>
                )}
                <Badge variant="secondary">{aiDraft.createdAt}</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
