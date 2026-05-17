import type {
  AdminSummary,
  AdminUser,
  AiProviderConfig,
  AiProviderInput,
  AiScheduleDraftRequest,
  AiScheduleDraftResponse,
  FeedbackStatus,
  Notice,
  UserFeedback
} from "@/shared/types";

export type PublicSettings = {
  registrationEnabled: boolean;
};

export type AuthLookupResponse = {
  username: string;
  passwordSalt: string;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  body?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, body?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("content-type") && options.body) {
    headers.set("content-type", "application/json");
  }
  if (options.token) {
    headers.set("authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    let code: string | undefined;
    let body: Record<string, unknown> | undefined;
    try {
      body = (await response.json()) as Record<string, unknown>;
      if (typeof body.error === "string") {
        code = body.error;
        message = translateApiError(body.error);
      }
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new ApiError(message, response.status, code, body);
  }

  return response.json() as Promise<T>;
}

function translateApiError(error: string): string {
  const messages: Record<string, string> = {
    Unauthorized: "用户名或密码不正确。",
    Forbidden: "账号当前不可用。",
    "Not found": "没有找到对应数据。",
    "Registration is closed": "当前暂未开放注册，请联系管理员。",
    "Account already exists": "账号已存在。",
    "Invalid username": "用户名请使用英文字母、数字、下划线、短横线或点，3-32 位，首尾必须是英文字母或数字。",
    "Vault version conflict": "云端已有其他设备更新，请先同步云端数据后再保存。",
    "Password confirmation required": "请先输入当前管理员密码。",
    "Password confirmation failed": "管理员密码确认失败。",
    "Target password confirmation failed": "被删除账号密码验证失败。",
    "Database migration required": "云端 D1 表结构不是最新。请在 Cloudflare D1 按顺序执行 migrations 目录下尚未执行的 SQL，然后刷新页面。",
    "Feedback content required": "请先填写反馈内容。",
    "Invalid feedback status": "反馈处理状态不正确。",
    "Missing AI provider fields": "请填写 AI 配置名称、接口地址和模型名称。",
    "Missing AI API key": "请填写 AI API Key。",
    "AI provider test failed": "AI 接口测试失败。",
    "AI instruction required": "请先填写要让 AI 处理的内容。",
    "AI provider not configured": "请先在管理员后台配置 AI 接口。",
    "AI provider disabled": "当前 AI 接口已停用。",
    "AI daily limit reached": "当前 AI 接口今天调用次数已达上限。",
    "AI schedule draft failed": "AI 生成建议失败。"
  };
  return messages[error] ?? error;
}

export async function lookupPasswordSalt(username: string): Promise<AuthLookupResponse> {
  return apiRequest<AuthLookupResponse>(`/api/auth/lookup?username=${encodeURIComponent(username)}`);
}

export async function getPublicSettings(): Promise<PublicSettings> {
  return apiRequest<PublicSettings>("/api/public/settings");
}

export async function getLoginNotice(): Promise<Notice> {
  return apiRequest<Notice>("/api/public/login-notice");
}

export async function getAdminSummary(token: string): Promise<AdminSummary> {
  return apiRequest<AdminSummary>("/api/admin/summary", { token });
}

export async function getAdminUsers(token: string): Promise<AdminUser[]> {
  return apiRequest<AdminUser[]>("/api/admin/users", { token });
}

export async function updateAdminNotice(token: string, notice: Notice): Promise<Notice> {
  return apiRequest<Notice>("/api/admin/login-notice", {
    method: "PUT",
    token,
    body: JSON.stringify(notice)
  });
}

export async function updateRegistrationEnabled(token: string, enabled: boolean): Promise<PublicSettings> {
  return apiRequest<PublicSettings>("/api/admin/registration", {
    method: "PUT",
    token,
    body: JSON.stringify({ enabled })
  });
}

export async function requestUserDeletion(token: string, userId: string, reason: string, targetPasswordVerifier?: string): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${encodeURIComponent(userId)}/delete-request`, {
    method: "POST",
    token,
    body: JSON.stringify({ reason, targetPasswordVerifier })
  });
}

export async function confirmUserDeletion(token: string, userId: string, passwordVerifier: string): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${encodeURIComponent(userId)}/delete-confirm`, {
    method: "POST",
    token,
    body: JSON.stringify({ passwordVerifier })
  });
}

export async function cancelUserDeletion(token: string, userId: string): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${encodeURIComponent(userId)}/delete-cancel`, {
    method: "POST",
    token
  });
}

export async function runDueDeletions(token: string): Promise<{ deleted: number }> {
  return apiRequest<{ deleted: number }>("/api/admin/deletions/run-due", {
    method: "POST",
    token
  });
}

export async function submitFeedback(token: string, title: string, content: string): Promise<{ ok: true; id: string; createdAt: string }> {
  return apiRequest<{ ok: true; id: string; createdAt: string }>("/api/feedback", {
    method: "POST",
    token,
    body: JSON.stringify({ title, content })
  });
}

export async function getAdminFeedback(token: string): Promise<UserFeedback[]> {
  return apiRequest<UserFeedback[]>("/api/admin/feedback", { token });
}

export async function updateAdminFeedback(
  token: string,
  feedbackId: string,
  status: FeedbackStatus,
  adminNote: string | null
): Promise<UserFeedback> {
  return apiRequest<UserFeedback>(`/api/admin/feedback/${encodeURIComponent(feedbackId)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status, adminNote })
  });
}

export async function cancelOwnDeletion(token: string): Promise<AdminUser> {
  return apiRequest<AdminUser>("/api/me/delete-cancel", {
    method: "POST",
    token
  });
}

export async function getAiProviders(token: string): Promise<AiProviderConfig[]> {
  return apiRequest<AiProviderConfig[]>("/api/admin/ai/providers", { token });
}

export async function createAiProvider(token: string, input: AiProviderInput): Promise<AiProviderConfig> {
  return apiRequest<AiProviderConfig>("/api/admin/ai/providers", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function updateAiProvider(token: string, providerId: string, input: AiProviderInput): Promise<AiProviderConfig> {
  return apiRequest<AiProviderConfig>(`/api/admin/ai/providers/${encodeURIComponent(providerId)}`, {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export async function deleteAiProvider(token: string, providerId: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/api/admin/ai/providers/${encodeURIComponent(providerId)}`, {
    method: "DELETE",
    token
  });
}

export async function testAiProvider(token: string, providerId: string): Promise<{ ok: true; provider: AiProviderConfig; response: unknown }> {
  return apiRequest<{ ok: true; provider: AiProviderConfig; response: unknown }>(
    `/api/admin/ai/providers/${encodeURIComponent(providerId)}/test`,
    {
      method: "POST",
      token
    }
  );
}

export async function generateAiScheduleDraft(token: string, request: AiScheduleDraftRequest): Promise<AiScheduleDraftResponse> {
  return apiRequest<AiScheduleDraftResponse>("/api/admin/ai/schedule-draft", {
    method: "POST",
    token,
    body: JSON.stringify(request)
  });
}
