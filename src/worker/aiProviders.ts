import {
  aiEndpointUrl,
  aiProviderProtocol,
  normalizeAiBaseUrl
} from "../shared/aiEndpoint";
import type {
  AiProviderConfig,
  AiProviderInput,
  AiProviderKind,
  AiProviderUsage,
  AiScheduleDraftRequest,
  AiScheduleDraftResponse
} from "../shared/types";
import { json, notFound, readJson } from "./runtime";
import { AiCallResult, AiProviderRow, AuthContext, ChatCompletionResponse, Env } from "./types";

function isAiProviderKind(value: string): value is AiProviderKind {
  return (
    value === "openai" ||
    value === "openai_response" ||
    value === "anthropic" ||
    value === "newapi" ||
    value === "openai_compatible" ||
    value === "deepseek" ||
    value === "gemini"
  );
}

function maskApiKey(apiKey: string): string {
  const value = apiKey.trim();
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}****${value.slice(-2)}`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function aiProviderFromRow(row: AiProviderRow): AiProviderConfig {
  return {
    id: row.id,
    name: row.name,
    provider: isAiProviderKind(row.provider) ? row.provider : "openai_compatible",
    baseUrl: row.base_url,
    model: row.model,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    dailyLimit: row.daily_limit,
    maxOutputTokens: row.max_output_tokens,
    temperature: row.temperature,
    maskedApiKey: maskApiKey(row.api_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastTestedAt: row.last_tested_at,
    lastError: row.last_error,
    lastLatencyMs: row.last_latency_ms ?? null
  };
}

async function aiProviderConfigWithUsage(env: Env, row: AiProviderRow, includeSensitive: boolean, actorUserId: string): Promise<AiProviderConfig> {
  const usedToday = await providerDailyUsage(env, row.id, actorUserId);
  const dailyLimit = Math.max(row.daily_limit, 0);
  return {
    ...aiProviderFromRow(row),
    baseUrl: includeSensitive ? row.base_url : "",
    maskedApiKey: includeSensitive ? maskApiKey(row.api_key) : "",
    usedToday,
    remainingToday: Math.max(dailyLimit - usedToday, 0)
  };
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function sanitizeAiProviderInput(body: Partial<AiProviderInput>, existing?: AiProviderRow): AiProviderInput {
  const provider = typeof body.provider === "string" && isAiProviderKind(body.provider)
    ? body.provider
    : existing && isAiProviderKind(existing.provider)
      ? existing.provider
      : "newapi";
  const name = String(body.name ?? existing?.name ?? "").trim().slice(0, 80);
  const baseUrl = normalizeAiBaseUrl(String(body.baseUrl ?? existing?.base_url ?? "").trim()).slice(0, 300);
  const model = String(body.model ?? existing?.model ?? "").trim().slice(0, 120);
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  return {
    name,
    provider,
    baseUrl,
    model,
    apiKey,
    enabled: Boolean(body.enabled ?? existing?.enabled ?? true),
    isDefault: Boolean(body.isDefault ?? existing?.is_default ?? false),
    dailyLimit: Math.round(numberInRange(body.dailyLimit, existing?.daily_limit ?? 50, 1, 2000)),
    maxOutputTokens: Math.round(numberInRange(body.maxOutputTokens, existing?.max_output_tokens ?? 1200, 256, 8000)),
    temperature: Number(numberInRange(body.temperature, existing?.temperature ?? 0.2, 0, 2).toFixed(2))
  };
}

async function getAiProviderRow(env: Env, providerId: string): Promise<AiProviderRow | null> {
  return env.DB.prepare(
    `SELECT
      id,
      name,
      provider,
      base_url,
      model,
      api_key,
      enabled,
      is_default,
      daily_limit,
      max_output_tokens,
      temperature,
      created_at,
      updated_at,
      last_tested_at,
      last_error,
      last_latency_ms
     FROM ai_provider_configs
     WHERE id = ?`
  )
    .bind(providerId)
    .first<AiProviderRow>();
}

export async function listAiProviders(env: Env, actorUserId: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT
      id,
      name,
      provider,
      base_url,
      model,
      api_key,
      enabled,
      is_default,
      daily_limit,
      max_output_tokens,
      temperature,
      created_at,
      updated_at,
      last_tested_at,
      last_error,
      last_latency_ms
     FROM ai_provider_configs
     ORDER BY is_default DESC, updated_at DESC`
  ).all<AiProviderRow>();

  const providers = await Promise.all((result.results ?? []).map((row) => aiProviderConfigWithUsage(env, row, true, actorUserId)));
  return json(providers);
}

export async function listUsableAiProviders(env: Env, includeSensitive: boolean, actorUserId: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT
      id,
      name,
      provider,
      base_url,
      model,
      api_key,
      enabled,
      is_default,
      daily_limit,
      max_output_tokens,
      temperature,
      created_at,
      updated_at,
      last_tested_at,
      last_error,
      last_latency_ms
     FROM ai_provider_configs
     WHERE enabled = 1
     ORDER BY is_default DESC, updated_at DESC`
  ).all<AiProviderRow>();

  const providers = await Promise.all((result.results ?? []).map((row) => aiProviderConfigWithUsage(env, row, includeSensitive, actorUserId)));
  return json(providers);
}

export async function saveAiProvider(request: Request, env: Env, providerId?: string): Promise<Response> {
  const body = await readJson<Partial<AiProviderInput>>(request).catch((): Partial<AiProviderInput> => ({}));
  const existing = providerId ? await getAiProviderRow(env, providerId) : null;
  if (providerId && !existing) {
    return notFound();
  }

  const input = sanitizeAiProviderInput(body, existing ?? undefined);
  if (!input.name || !input.baseUrl || !input.model) {
    return json({ error: "Missing AI provider fields" }, 400);
  }

  const apiKey = input.apiKey || existing?.api_key || "";
  if (!apiKey) {
    return json({ error: "Missing AI API key" }, 400);
  }

  const now = new Date().toISOString();
  const id = providerId ?? crypto.randomUUID();
  if (input.isDefault) {
    await env.DB.prepare("UPDATE ai_provider_configs SET is_default = 0").run();
  }

  if (existing) {
    await env.DB.prepare(
      `UPDATE ai_provider_configs
       SET
         name = ?,
         provider = ?,
         base_url = ?,
         model = ?,
         api_key = ?,
         enabled = ?,
         is_default = ?,
         daily_limit = ?,
         max_output_tokens = ?,
         temperature = ?,
         updated_at = ?
       WHERE id = ?`
    )
      .bind(
        input.name,
        input.provider,
        input.baseUrl,
        input.model,
        apiKey,
        input.enabled ? 1 : 0,
        input.isDefault ? 1 : 0,
        input.dailyLimit,
        input.maxOutputTokens,
        input.temperature,
        now,
        id
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO ai_provider_configs (
        id,
        name,
        provider,
        base_url,
        model,
        api_key,
        enabled,
        is_default,
        daily_limit,
        max_output_tokens,
        temperature,
        created_at,
        updated_at,
        last_tested_at,
        last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        input.name,
        input.provider,
        input.baseUrl,
        input.model,
        apiKey,
        input.enabled ? 1 : 0,
        input.isDefault ? 1 : 0,
        input.dailyLimit,
        input.maxOutputTokens,
        input.temperature,
        now,
        now,
        null,
        null
      )
      .run();
  }

  const saved = await getAiProviderRow(env, id);
  return saved ? json(aiProviderFromRow(saved), providerId ? 200 : 201) : notFound();
}

export async function deleteAiProvider(env: Env, providerId: string): Promise<Response> {
  await env.DB.prepare("DELETE FROM ai_provider_configs WHERE id = ?").bind(providerId).run();
  return json({ ok: true });
}

async function providerDailyUsage(env: Env, providerId: string, actorUserId: string): Promise<number> {
  const now = new Date();
  const todayBeijingMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0);
  const since = new Date(now.getTime() < todayBeijingMidnight ? todayBeijingMidnight - 24 * 60 * 60 * 1000 : todayBeijingMidnight);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM ai_usage_logs
     WHERE provider_id = ?
       AND actor_user_id = ?
       AND success = 1
       AND created_at >= ?`
  )
    .bind(providerId, actorUserId, since.toISOString())
    .first<{ total: number }>();
  return row?.total ?? 0;
}

async function addAiUsageLog(
  env: Env,
  providerId: string,
  actorUserId: string,
  action: string,
  success: boolean,
  usage?: AiScheduleDraftResponse["usage"],
  error?: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ai_usage_logs (
      id,
      provider_id,
      actor_user_id,
      action,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      success,
      error,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      providerId,
      actorUserId,
      action,
      usage?.promptTokens ?? null,
      usage?.completionTokens ?? null,
      usage?.totalTokens ?? null,
      success ? 1 : 0,
      error ? error.slice(0, 1000) : null,
      new Date().toISOString()
    )
    .run();
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(textFromUnknown).join("").trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textFromUnknown(record.text ?? record.output_text ?? record.content ?? record.reasoning_content ?? record.reasoning ?? "");
  }
  return "";
}

function chatContentText(content: unknown): string {
  return textFromUnknown(content).trim();
}

function chatChoiceText(choice: unknown): string {
  if (!choice || typeof choice !== "object") return "";
  const record = choice as Record<string, unknown>;
  const message = record.message && typeof record.message === "object" ? record.message as Record<string, unknown> : null;
  const delta = record.delta && typeof record.delta === "object" ? record.delta as Record<string, unknown> : null;
  return textFromUnknown(
    message?.content ??
      message?.reasoning_content ??
      message?.reasoning ??
      delta?.content ??
      delta?.reasoning_content ??
      delta?.reasoning ??
      record.text ??
      record.content ??
      record.output_text ??
      ""
  ).trim();
}

function parseAiPayloads(rawText: string): Array<Record<string, unknown>> {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  try {
    const payload = JSON.parse(trimmed) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? [payload as Record<string, unknown>]
      : [];
  } catch {
    // Some OpenAI-compatible gateways return SSE-style chunks even when stream is not requested.
  }

  const payloads: Array<Record<string, unknown>> = [];
  for (const line of rawText.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const dataMatch = /^data:\s*(.+)$/i.exec(trimmedLine);
    const jsonText = dataMatch?.[1]?.trim() ?? (trimmedLine.startsWith("{") ? trimmedLine : "");
    if (!jsonText || jsonText === "[DONE]") continue;

    try {
      const payload = JSON.parse(jsonText) as unknown;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        payloads.push(payload as Record<string, unknown>);
      }
    } catch {
      // Ignore non-JSON gateway log lines.
    }
  }
  return payloads;
}

function aiErrorFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "";
}

function chatPayloadsText(payloads: Array<Record<string, unknown>>): string {
  return payloads.map((payload) => {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    return choices.map(chatChoiceText).join("");
  }).join("").trim();
}

function usageFromPayloads(payloads: Array<Record<string, unknown>>): AiScheduleDraftResponse["usage"] | undefined {
  for (let index = payloads.length - 1; index >= 0; index -= 1) {
    const usage = usageFromPayload(payloads[index]);
    if (usage) return usage;
  }
  return undefined;
}

function emptyAiContentError(payload: unknown): Error {
  if (!payload || typeof payload !== "object") {
    return new Error("AI returned empty content");
  }
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : null;
  const message = firstChoice?.message && typeof firstChoice.message === "object" ? firstChoice.message as Record<string, unknown> : null;
  const detail = [
    `topLevel=${Object.keys(record).slice(0, 8).join(",") || "none"}`,
    `choices=${choices.length}`,
    firstChoice?.finish_reason ? `finish=${String(firstChoice.finish_reason)}` : "",
    message ? `messageKeys=${Object.keys(message).slice(0, 8).join(",") || "none"}` : ""
  ].filter(Boolean).join("; ");
  return new Error(`AI returned empty content (${detail})`);
}

function responseOutputText(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.map((item) => {
    if (!item || typeof item !== "object") return "";
    const content = (item as Record<string, unknown>).content;
    return textFromUnknown(content);
  }).join("").trim();
}

function anthropicContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (!part || typeof part !== "object") return "";
    const record = part as Record<string, unknown>;
    return typeof record.text === "string" ? record.text : "";
  }).join("").trim();
}

function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // Fall through to object extraction.
      }
    }
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function usageFromPayload(payload: Record<string, unknown> | null | undefined): AiScheduleDraftResponse["usage"] | undefined {
  const usage = payload?.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const promptTokens = Number(record.prompt_tokens ?? record.input_tokens ?? record.promptTokens ?? record.inputTokens);
  const completionTokens = Number(record.completion_tokens ?? record.output_tokens ?? record.completionTokens ?? record.outputTokens);
  const totalTokens = Number(record.total_tokens ?? record.totalTokens);
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : undefined,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : undefined,
    totalTokens: Number.isFinite(totalTokens)
      ? totalTokens
      : Number.isFinite(promptTokens) && Number.isFinite(completionTokens)
        ? promptTokens + completionTokens
        : undefined
  };
}

function aiErrorMessage(payload: unknown, rawText: string, status: number): string {
  if (payload && typeof payload === "object") {
    const error = (payload as Record<string, unknown>).error;
    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return rawText.slice(0, 500) || `AI request failed (${status})`;
}

function shouldRetryAiRequest(message: string): boolean {
  return /response_format|json_object|max_tokens|max_completion_tokens|max_output_tokens|temperature|unsupported|not support|不支持|unknown parameter|unsupported parameter|invalid parameter/i.test(message);
}

function scheduleAssistantSystemPrompt(): string {
  return [
    "你是一个中文教学排课系统的 AI 助手。",
    "你可以做三类事：1）把新增/修改/删除/排课请求整理成结构化 JSON 建议；2）根据 appContext 里的课程、课节、统计摘要回答数据查询问题；3）生成教学进度学习清单模板。",
    "你不能声称已经修改系统数据；涉及写入的数据只生成建议，等待用户确认。",
    "不要输出 Markdown。只输出 JSON。",
    "支持的动作类型：create_student、update_student、create_course、create_course_type、update_course、delete_course、migrate_course、delete_lesson、schedule_lessons、sync_lessons、ask_clarification。",
    "如果 taskType 是 progress_checklist，说明当前任务不是排课，而是生成“学习清单模板”。这时不要输出 actions，也不要假装写入数据库。",
    "taskType 为 progress_checklist 时，输出结构必须是：{\"summary\":\"...\",\"template\":{\"name\":\"...\",\"subject\":\"...\",\"note\":\"...\",\"items\":[{\"chapter\":\"...\",\"title\":\"...\",\"note\":\"...\"}]},\"questions\":[],\"warnings\":[]}。",
    "progress_checklist 必须优先服从用户指定的清单依据和组织方式。只有用户明确要求教材、课本、章节、单元同步时，才按教材章节生成；不要把非教材请求改写成教材目录。",
    "如果用户同时提到“教材/版本/相同教材”和“真题/试卷/中考/地区/城市”，应理解为用教材版本或地区范围筛选真题来源；清单条目仍必须按真题、试卷、城市、题型或专题组织，不要按教材章节目录组织。",
    "progress_checklist 如果用户要求中考真题、试卷、地区、城市、年份、题型、专题、实验题、压轴题或错题复盘，应按这些来源/任务维度生成可勾选条目。chapter 可写“2020年”“南京卷”“苏州卷”“力学专题”“实验探究题”“2025 江苏十三市真题”等分组；title 必须服从用户原话。",
    "progress_checklist 如果用户要求“试卷名字”“试卷名称”“目录”或“按试卷名生成”，title 只写试卷名称，不要额外添加“完成、订正、复盘、错因”等动作词。例如应写 title:\"2020年连云港中考物理试卷\"，不要写 title:\"完成2020年连云港中考物理试卷并订正错因\"。",
    "progress_checklist 的 template.items 需要按用户请求的学习/完成顺序排列。chapter 是分组标签，不一定是教材章节；title 写用户要求的清单条目本体；若用户未指定数量，默认生成 8-16 项。",
    "progress_checklist 如信息不足，可在 questions 里追问教材版本、年级、单元范围、真题来源、年份、地区、题型或是否按专题/试卷拆分；warnings 里写使用提醒。不能核实时不要编造精确题号，可用“对应真题题组/对应试卷题型”表达。",
    "create_course、update_course、migrate_course 涉及课程命名时，对用户展示和追问必须使用“课程档案名称”，不要只说“课程名称”或“课程名”；JSON 字段仍使用 courseName/newCourseName/targetCourseName。",
    "课程档案的计费模式必须沿用所选班型在后台配置的默认计费模式，不能给单个课程档案单独切换计费模式。例如后台“初三全日制”是按小时计费时，不要把该课程档案写成 class_headcount；应询问用户先修改后台班型计费或改选班课/一对二等按人数计费班型。",
    "如果用户明确要新增一个自定义班型，可以输出 create_course_type 动作；data 里写 id、label、templateMode（class 或 hourly）以及对应默认计费参数。班型新建后再用该班型创建课程档案。",
    "create_course 或 update_course 如果是班课、多人课、小组课、一对二或任意按人数计费班型，并且用户没有明确说沿用现有班型默认计费，需要确认最少人数、基础费用、每增加1人费用；JSON 可在 data.feeRule 写 {\"mode\":\"class_headcount\",\"minStudents\":1,\"baseFee\":0,\"perStudentFee\":0}，也可平铺 baseFee/perStudentFee/minStudents。",
    "班课计费里的最少人数表示从几人起收基础费用，不等于当前关联学生人数；不要因为当前关联2人就写 minStudents:2。用户未明确说明时，必须在 questions 里询问，常见默认是 minStudents:1。",
    "update_student 用于修改已有学生档案的姓名、年级、学校、校区、备注、状态或试听标记；优先在 data 里提供 studentId，其次可用 studentName/currentName/oldName 定位。若要改名，建议把新名字写在 newName；若已提供 studentId 或旧名字，也可把新名字写在 name。",
    "update_course 用于修改已有课程档案名称、科目、班型、校区、关联学生或启用/暂停状态；data 里应包含 courseId 或 courseName。",
    "update_course 修改课程班型或计费规则时，默认只影响未来待上课/草稿课节；历史课、已完成课、补课课节默认保留原课型和原费用。若用户明确要求，可用 lessonUpdateScope：future_scheduled、all_unfinished、all、none。",
    "delete_course 用于删除或暂停课程；已有课时引用时除非用户明确 forceDelete，否则系统会暂停课程以保留历史课时。",
    "delete_lesson 用于删除课节。删除单节课时 data 必须包含 lessonId，或至少包含 date 加 startTime/endTime/courseName 等能唯一定位的字段；批量删除时必须包含 dateStart/dateEnd 或 dates，并默认只删除 scheduled/draft/makeup_pending 待处理课节。不要只在 summary 里写日期范围而让 data 缺少日期字段。",
    "migrate_course 用于把已有课程迁移到新课程或目标课程；data 可包含 sourceCourseId/sourceCourseName、targetCourseId/targetCourseName、type/targetType、migrateLessons、effectiveFrom、effectiveTo、pauseSource。",
    "sync_lessons 用于复制排课：只复制课程档案、日期、时间和校区安排；复制后的课节内容、课后作业、学习清单、备注和补课关系保持为空，但系统会按目标时间线把新课节的上节课内容来源指向前面最近一节同课程课。复制后的课节状态统一为 scheduled（待上课）。已取消课节默认也要包含并同步为待上课，目标日期已有同时间课节默认覆盖。",
    "sync_lessons 复制单日时 data 写 sourceDate 和 targetDate；复制日期段时优先写 sourceDateStart、sourceDateEnd、targetDateStart、targetDateEnd，也可写一一对应的 sourceDates 和 targetDates。需要覆盖时写 overwriteExisting:true；需要包含取消课节时写 includeCancelled:true。",
    "如果用户只是询问统计、排课数量、某时间段有几节课、预计课时费、哪些日期有课等，不要输出写入动作；actions 必须为空，并用 answer 字段给出清晰回答。可引用 appContext.lessonAnalytics、appContext.analyticsLessons、appContext.timeWindowSummaries 里的数据。",
    "计算课时费时只能使用 appContext 中提供的 feeAmount、amount、totalAmount 等字段；如果对应课程缺少有效计费单价或金额为未知，必须明确说明“当前数据中缺少各课程的计费单价，无法计算课时费总额”，不要编造金额。",
    "数据问答输出结构：{\"summary\":\"...\",\"answer\":\"...\",\"actions\":[],\"questions\":[],\"warnings\":[]}。",
    "必须保留用户没有明确说明的字段为 null 或放入 questions，不要自行编造。",
    "时间使用 24 小时制 HH:mm，日期使用 YYYY-MM-DD。",
    "如果发现信息不足，actions 可以为空，并在 questions 里列出需要确认的问题。",
    "除 progress_checklist 外，默认输出结构：{\"summary\":\"...\",\"actions\":[...],\"questions\":[...],\"warnings\":[...]}"
  ].join("\n");
}

async function callOpenAiChatCompletions(
  provider: AiProviderRow,
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<AiCallResult> {
  const requestUrl = aiEndpointUrl(provider.base_url, "chat/completions");
  const requestBody = (options: { jsonMode: boolean; maxTokenField: "max_tokens" | "max_completion_tokens" | null; includeTemperature: boolean }) => ({
    model: provider.model,
    messages,
    ...(options.includeTemperature ? { temperature: provider.temperature } : {}),
    ...(options.maxTokenField ? { [options.maxTokenField]: provider.max_output_tokens } : {}),
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {})
  });
  const send = (options: { jsonMode: boolean; maxTokenField: "max_tokens" | "max_completion_tokens" | null; includeTemperature: boolean }) => fetch(requestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.api_key}`
    },
    body: JSON.stringify(requestBody(options))
  });
  const attempts = [
    { jsonMode: true, maxTokenField: "max_tokens" as const, includeTemperature: true },
    { jsonMode: false, maxTokenField: "max_tokens" as const, includeTemperature: true },
    { jsonMode: false, maxTokenField: "max_completion_tokens" as const, includeTemperature: true },
    { jsonMode: false, maxTokenField: "max_completion_tokens" as const, includeTemperature: false },
    { jsonMode: false, maxTokenField: null, includeTemperature: false }
  ];

  let lastMessage = "";
  for (const attempt of attempts) {
    const response = await send(attempt);
    const rawText = await response.text();
    const payloads = parseAiPayloads(rawText);
    const payload = payloads[0] as ChatCompletionResponse | undefined;
    const payloadError = payloads.map(aiErrorFromPayload).find(Boolean) ?? "";
    if (!response.ok) {
      lastMessage = aiErrorMessage(payload, rawText, response.status);
      if (shouldRetryAiRequest(lastMessage)) continue;
      throw new Error(lastMessage);
    }
    if (payloadError) {
      lastMessage = payloadError;
      if (shouldRetryAiRequest(lastMessage)) continue;
      throw new Error(lastMessage);
    }
    const firstChoice = payload?.choices?.[0];
    const text = chatPayloadsText(payloads) || chatChoiceText(firstChoice) || chatContentText(firstChoice?.message?.content) || firstChoice?.text || "";
    if (!text.trim()) {
      lastMessage = emptyAiContentError(payload).message;
      continue;
    }
    return {
      text,
      draft: extractJsonFromText(text),
      usage: usageFromPayloads(payloads) ?? usageFromPayload(payload as Record<string, unknown> | null)
    };
  }
  throw new Error(lastMessage || "AI request failed");
}

async function callOpenAiResponses(
  provider: AiProviderRow,
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<AiCallResult> {
  const requestUrl = aiEndpointUrl(provider.base_url, "responses");
  const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";
  const input = messages.filter((message) => message.role !== "system");
  const requestBody = (useJsonMode: boolean) => ({
    model: provider.model,
    instructions: systemMessage,
    input,
    temperature: provider.temperature,
    max_output_tokens: provider.max_output_tokens,
    ...(useJsonMode ? { text: { format: { type: "json_object" } } } : {})
  });
  const send = (useJsonMode: boolean) => fetch(requestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.api_key}`
    },
    body: JSON.stringify(requestBody(useJsonMode))
  });
  let response = await send(true);
  let rawText = await response.text();
  let payload = rawText ? JSON.parse(rawText) as Record<string, unknown> : null;
  if (!response.ok) {
    const error = payload?.error;
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : rawText.slice(0, 500);
    if (/response_format|json_object|text\.format|unsupported|not support|不支持/i.test(message)) {
      response = await send(false);
      rawText = await response.text();
      payload = rawText ? JSON.parse(rawText) as Record<string, unknown> : null;
      if (response.ok) {
        const text = responseOutputText(payload);
        if (!text.trim()) {
          throw new Error("AI returned empty content");
        }
        return {
          text,
          draft: extractJsonFromText(text),
          usage: usageFromPayload(payload)
        };
      }
    }
    throw new Error(message || `AI request failed (${response.status})`);
  }
  const text = responseOutputText(payload);
  if (!text.trim()) {
    throw new Error("AI returned empty content");
  }
  return {
    text,
    draft: extractJsonFromText(text),
    usage: usageFromPayload(payload)
  };
}

async function callAnthropicMessages(
  provider: AiProviderRow,
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<AiCallResult> {
  const requestUrl = aiEndpointUrl(provider.base_url, "messages");
  const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";
  const anthropicMessages = messages.filter((message) => message.role !== "system");
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.api_key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: provider.model,
      system: systemMessage,
      messages: anthropicMessages,
      temperature: provider.temperature,
      max_tokens: provider.max_output_tokens
    })
  });
  const rawText = await response.text();
  const payload = rawText ? JSON.parse(rawText) as Record<string, unknown> : null;
  if (!response.ok) {
    const error = payload?.error;
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : rawText.slice(0, 500);
    throw new Error(message || `AI request failed (${response.status})`);
  }
  const text = anthropicContentText(payload?.content);
  if (!text.trim()) {
    throw new Error("AI returned empty content");
  }
  return {
    text,
    draft: extractJsonFromText(text),
    usage: usageFromPayload(payload)
  };
}

async function callAiProvider(
  provider: AiProviderRow,
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<AiCallResult> {
  const protocol = aiProviderProtocol(provider);
  if (protocol === "openai_response") return callOpenAiResponses(provider, messages);
  if (protocol === "anthropic") return callAnthropicMessages(provider, messages);
  return callOpenAiChatCompletions(provider, messages);
}

export async function testAiProvider(_request: Request, env: Env, actor: AuthContext, providerId: string): Promise<Response> {
  const provider = await getAiProviderRow(env, providerId);
  if (!provider) return notFound();

  const startedAt = Date.now();
  try {
    const result = await callAiProvider(provider, [
      { role: "system", content: "只输出 JSON。" },
      { role: "user", content: "请输出 {\"ok\":true,\"message\":\"connected\"}" }
    ]);
    const latencyMs = Math.max(Date.now() - startedAt, 0);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE ai_provider_configs SET last_tested_at = ?, last_error = NULL, last_latency_ms = ?, updated_at = ? WHERE id = ?")
      .bind(now, latencyMs, now, providerId)
      .run();
    await addAiUsageLog(env, providerId, actor.user.id, "test", true, result.usage);
    return json({ ok: true, provider: aiProviderFromRow({ ...provider, last_tested_at: now, last_error: null, last_latency_ms: latencyMs }), response: result.draft ?? result.text, latencyMs });
  } catch (error) {
    const latencyMs = Math.max(Date.now() - startedAt, 0);
    const message = error instanceof Error ? error.message : "AI 测试连接失败。";
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE ai_provider_configs SET last_tested_at = ?, last_error = ?, last_latency_ms = ?, updated_at = ? WHERE id = ?")
      .bind(now, message.slice(0, 1000), latencyMs, now, providerId)
      .run();
    await addAiUsageLog(env, providerId, actor.user.id, "test", false, undefined, message);
    return json({ error: "AI provider test failed", detail: message, latencyMs }, 502);
  }
}

export async function generateAiScheduleDraft(request: Request, env: Env, actor: AuthContext): Promise<Response> {
  const body = await readJson<AiScheduleDraftRequest>(request).catch((): AiScheduleDraftRequest => ({
    providerId: "",
    taskType: "auto",
    instruction: "",
    context: null
  }));
  const instruction = String(body.instruction ?? "").trim().slice(0, 8000);
  if (!instruction) {
    return json({ error: "AI instruction required" }, 400);
  }

  const providerId = String(body.providerId ?? "").trim();
  const provider = providerId
    ? await getAiProviderRow(env, providerId)
    : await env.DB.prepare(
        `SELECT
          id,
          name,
          provider,
          base_url,
          model,
          api_key,
          enabled,
          is_default,
          daily_limit,
          max_output_tokens,
          temperature,
          created_at,
          updated_at,
          last_tested_at,
          last_error
         FROM ai_provider_configs
         WHERE enabled = 1
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`
      ).first<AiProviderRow>();

  if (!provider) {
    return json({ error: "AI provider not configured" }, 400);
  }
  if (!provider.enabled) {
    return json({ error: "AI provider disabled" }, 400);
  }

  const usedToday = await providerDailyUsage(env, provider.id, actor.user.id);
  if (usedToday >= provider.daily_limit) {
    return json({ error: "AI daily limit reached" }, 429);
  }
  const usageBeforeCall: AiProviderUsage = {
    dailyLimit: provider.daily_limit,
    usedToday,
    remainingToday: Math.max(provider.daily_limit - usedToday, 0)
  };

  const userContext = JSON.stringify(body.context ?? null).slice(0, 30000);
  try {
    const result = await callAiProvider(provider, [
      { role: "system", content: scheduleAssistantSystemPrompt() },
      {
        role: "user",
        content: JSON.stringify({
          taskType: body.taskType || "auto",
          instruction,
          appContext: userContext
        })
      }
    ]);
    const createdAt = new Date().toISOString();
    await addAiUsageLog(env, provider.id, actor.user.id, "schedule_draft", true, result.usage);
    const usageAfterCall: AiProviderUsage = {
      dailyLimit: provider.daily_limit,
      usedToday: usageBeforeCall.usedToday + 1,
      remainingToday: Math.max(provider.daily_limit - usageBeforeCall.usedToday - 1, 0)
    };
    return json({
      providerId: provider.id,
      model: provider.model,
      createdAt,
      text: result.text,
      draft: result.draft,
      providerUsage: usageAfterCall,
      usage: result.usage
    } satisfies AiScheduleDraftResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 生成建议失败。";
    await addAiUsageLog(env, provider.id, actor.user.id, "schedule_draft", false, undefined, message);
    return json({ error: "AI schedule draft failed", detail: message }, 502);
  }
}
