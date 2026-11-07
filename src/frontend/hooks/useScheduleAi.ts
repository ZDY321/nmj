import { useEffect, useState } from "react";
import type { AiProviderConfig, AiScheduleDraftResponse, AiScheduleSession, TeacherVault, WeekStart } from "@/shared/types";
import { todayIso } from "@/frontend/lib/calculations";
import { generateAiScheduleDraft, getAiProviders, getUsableAiProviders } from "@/frontend/lib/cloud";
import { courseHasActiveStudent, subjectOptionsForVault } from "@/frontend/lib/helpers";
import { aiChatEndpoint, arrayValue, buildScheduleAiContext, formatAiValue, isPlainRecord, textValue } from "@/frontend/lib/scheduleViewHelpers";

interface ScheduleAiOptions {
  vault: TeacherVault;
  token: string;
  isAdmin: boolean;
  aiSession: AiScheduleSession | null;
  onAiSessionChange: (session: AiScheduleSession | null) => void;
  onApplyAiDraft: (session: AiScheduleSession | null) => { ok: boolean; message: string };
  calendarMonth: string;
  selectedCalendarDate: string;
  weekStartPreference: WeekStart;
}

export function useScheduleAi({ vault, token, isAdmin, aiSession, onAiSessionChange, onApplyAiDraft, calendarMonth, selectedCalendarDate, weekStartPreference }: ScheduleAiOptions) {
  const [aiProviders, setAiProviders] = useState<AiProviderConfig[]>([]);
  const aiProviderId = aiSession?.providerId ?? "";
  const aiTaskType = aiSession?.taskType ?? "auto";
  const aiInstruction = aiSession?.instruction ?? "";
  const aiFollowupAnswer = aiSession?.followupAnswer ?? "";
  const aiDraft = aiSession?.draft ?? null;
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiApplyResult, setAiApplyResult] = useState<{ ok: boolean; message: string } | null>(null);
  const aiMessage = aiSession?.message ?? "";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const loadProviders = isAdmin ? getAiProviders : getUsableAiProviders;
    loadProviders(token)
      .then((providers) => {
        if (cancelled) return;
        setAiProviders(providers);
        const nextProviderId = aiProviderId && providers.some((provider) => provider.id === aiProviderId && provider.enabled)
          ? aiProviderId
          : providers.find((provider) => provider.enabled && provider.isDefault)?.id ?? providers.find((provider) => provider.enabled)?.id ?? "";
        if (nextProviderId !== aiProviderId) {
          patchAiSession({ providerId: nextProviderId });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setAiProviders([]);
        patchAiSession({ message: error instanceof Error ? error.message : "AI 配置加载失败。" });
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, token]);

  const aiActiveStudentCount = vault.students.filter((student) => student.status === "active").length;
  const aiActiveCourseCount = vault.courseGroups.filter((course) => course.status === "active" && courseHasActiveStudent(vault, course)).length;
  const aiPendingLessonCount = vault.lessons.filter((lesson) => lesson.status === "scheduled" || lesson.status === "makeup_pending").length;
  const today = todayIso();
  const aiTodayLessonCount = vault.lessons.filter((lesson) => lesson.date === today).length;
  const aiContextSummary = {
    activeStudents: aiActiveStudentCount,
    activeCourses: aiActiveCourseCount,
    pendingLessons: aiPendingLessonCount,
    todayLessons: aiTodayLessonCount,
    campuses: vault.campuses.length,
    subjects: subjectOptionsForVault(vault)
  };
  const enabledAiProviders = aiProviders.filter((provider) => provider.enabled);
  const selectedAiProvider = aiProviders.find((provider) => provider.id === aiProviderId);
  const canShowAiProviderEndpoint = isAdmin;
  const selectedAiEndpoint = selectedAiProvider ? aiChatEndpoint(selectedAiProvider.baseUrl, selectedAiProvider) : "";
  const aiDraftRecord = isPlainRecord(aiDraft?.draft) ? aiDraft.draft : null;
  const aiDraftActions = arrayValue(aiDraftRecord?.actions).filter(isPlainRecord);
  const aiDraftQuestions = arrayValue(aiDraftRecord?.questions);
  const aiDraftWarnings = arrayValue(aiDraftRecord?.warnings);
  const aiDraftSummary = textValue(aiDraftRecord?.summary, aiDraft ? "AI 已生成建议，请按下方内容核对。" : "");
  const aiDraftAnswer = textValue(aiDraftRecord?.answer ?? aiDraftRecord?.result ?? aiDraftRecord?.analysis, "");
  const aiRawResultText = aiDraft ? JSON.stringify(aiDraft.draft ?? aiDraft.text, null, 2) : "";
  const canClearAiWork = Boolean(aiInstruction || aiFollowupAnswer || aiDraft || aiMessage || aiApplyResult);
  const aiDraftCanApply = !aiLoading && !aiApplying && aiApplyResult?.ok !== true && aiDraftActions.length > 0 && aiDraftQuestions.length === 0;
  const selectedAiUsage = selectedAiProvider
    ? {
        dailyLimit: selectedAiProvider.dailyLimit,
        usedToday: selectedAiProvider.usedToday ?? 0,
        remainingToday: selectedAiProvider.remainingToday ?? Math.max(selectedAiProvider.dailyLimit - (selectedAiProvider.usedToday ?? 0), 0)
      }
    : null;
  const aiUsageText = selectedAiUsage
    ? `今日已用 ${selectedAiUsage.usedToday} 次 / 剩余 ${selectedAiUsage.remainingToday} 次 / 每人上限 ${selectedAiUsage.dailyLimit} 次`
    : "未选择接口，暂无法显示今日次数";

  function patchAiSession(patch: Partial<AiScheduleSession>) {
    if ("draft" in patch) {
      setAiApplyResult(null);
    }
    onAiSessionChange({
      providerId: aiProviderId,
      taskType: aiTaskType,
      instruction: aiInstruction,
      followupAnswer: aiFollowupAnswer,
      draft: aiDraft,
      message: aiMessage,
      ...patch
    });
  }

  function patchSelectedAiProviderUsage(result: AiScheduleDraftResponse) {
    if (!result.providerUsage) return;
    setAiProviders((current) =>
      current.map((provider) =>
        provider.id === result.providerId
          ? {
              ...provider,
              dailyLimit: result.providerUsage?.dailyLimit ?? provider.dailyLimit,
              usedToday: result.providerUsage?.usedToday,
              remainingToday: result.providerUsage?.remainingToday
            }
          : provider
      )
    );
  }

  async function copyAiRawResult() {
    if (!aiRawResultText) {
      patchAiSession({ message: "暂无可复制的原始返回内容。" });
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(aiRawResultText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = aiRawResultText;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!copied) throw new Error("copy failed");
      }
      patchAiSession({ message: "原始返回内容已复制。" });
    } catch {
      patchAiSession({ message: "复制失败，请手动选中原始内容复制。" });
    }
  }

  function clearAiWork() {
    setAiApplyResult(null);
    patchAiSession({ instruction: "", followupAnswer: "", draft: null, message: "" });
  }

  async function refreshAiProviders() {
    if (!token) return;
    patchAiSession({ message: "" });
    try {
      const providers = await (isAdmin ? getAiProviders(token) : getUsableAiProviders(token));
      setAiProviders(providers);
      const nextProviderId = aiProviderId && providers.some((provider) => provider.id === aiProviderId && provider.enabled)
        ? aiProviderId
        : providers.find((provider) => provider.enabled && provider.isDefault)?.id ?? providers.find((provider) => provider.enabled)?.id ?? "";
      patchAiSession({ providerId: nextProviderId });
    } catch (error) {
      patchAiSession({ message: error instanceof Error ? error.message : "AI 配置加载失败。" });
    }
  }

  async function submitAiDraft() {
    if (!token || !aiProviderId || !aiInstruction.trim()) {
      patchAiSession({ message: !aiProviderId ? "请先选择可用的 AI 接口配置。" : "请先填写要让 AI 处理的内容。" });
      return;
    }
    setAiLoading(true);
    patchAiSession({ draft: null, followupAnswer: "", message: "正在生成新的 AI 建议..." });
    try {
      const result = await generateAiScheduleDraft(token, {
        providerId: aiProviderId,
        taskType: aiTaskType,
        instruction: aiInstruction.trim(),
        context: buildScheduleAiContext(vault, { calendarMonth, selectedCalendarDate, weekStartPreference })
      });
      patchSelectedAiProviderUsage(result);
      patchAiSession({ draft: result, message: "AI 建议已生成，请先人工核对。" });
    } catch (error) {
      patchAiSession({ draft: null, message: error instanceof Error ? error.message : "AI 生成建议失败。" });
    } finally {
      setAiLoading(false);
    }
  }

  async function submitAiFollowup() {
    if (!aiFollowupAnswer.trim()) {
      patchAiSession({ message: "请先填写补充信息。" });
      return;
    }
    const questionsText = aiDraftQuestions.map((question, index) => `${index + 1}. ${formatAiValue(question)}`).join("\n");
    const nextInstruction = [
      aiInstruction.trim(),
      "",
      "以下是 AI 上一次提出的需要确认的问题：",
      questionsText || "无",
      "",
      "我补充确认的信息如下，请结合原始需求重新生成完整、可执行的结构化建议：",
      aiFollowupAnswer.trim()
    ].join("\n");
    setAiLoading(true);
    patchAiSession({ instruction: nextInstruction, followupAnswer: "", draft: null, message: "正在根据补充信息重新生成建议..." });
    try {
      const result = await generateAiScheduleDraft(token, {
        providerId: aiProviderId,
        taskType: aiTaskType,
        instruction: nextInstruction,
        context: buildScheduleAiContext(vault, { calendarMonth, selectedCalendarDate, weekStartPreference })
      });
      patchSelectedAiProviderUsage(result);
      patchAiSession({ instruction: nextInstruction, followupAnswer: "", draft: result, message: "已带着补充信息重新生成建议，请继续核对。" });
    } catch (error) {
      patchAiSession({ instruction: nextInstruction, followupAnswer: "", draft: null, message: error instanceof Error ? error.message : "AI 生成建议失败。" });
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiDraft() {
    if (aiApplying) return;
    setAiApplying(true);
    setAiApplyResult(null);
    patchAiSession({ message: "正在写入 AI 建议..." });
    const result = onApplyAiDraft({
      providerId: aiProviderId,
      taskType: aiTaskType,
      instruction: aiInstruction,
      followupAnswer: aiFollowupAnswer,
      draft: aiDraft,
      message: aiMessage
    });
    const displayResult = result.ok ? result : { ...result, message: `AI 建议写入失败：${result.message}` };
    setAiApplyResult(displayResult);
    patchAiSession({ message: displayResult.message });
    window.setTimeout(() => setAiApplying(false), 250);
  }

  return {
    aiActiveCourseCount,
    aiActiveStudentCount,
    aiApplyResult,
    aiApplying,
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
    onApplyAiDraft: applyAiDraft,
    onClearAiWork: clearAiWork,
    onCopyAiRawResult: copyAiRawResult,
    onPatchSession: patchAiSession,
    onRefreshAiProviders: refreshAiProviders,
    onSubmitAiDraft: submitAiDraft,
    onSubmitAiFollowup: submitAiFollowup,
    selectedAiEndpoint,
    selectedAiProvider,
    selectedAiUsage
  };
}
