import type { AdminSummary, AdminUser, Notice } from "@/shared/types";

export type PublicSettings = {
  registrationEnabled: boolean;
};

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
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = translateApiError(body.error);
      }
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function translateApiError(error: string): string {
  const messages: Record<string, string> = {
    Unauthorized: "用户名或密码不正确。",
    Forbidden: "账号当前不可用。",
    "Not found": "没有找到对应数据。",
    "Registration is closed": "当前暂未开放注册，请联系管理员。",
    "Account already exists": "账号已存在。"
  };
  return messages[error] ?? error;
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

export async function requestUserDeletion(token: string, userId: string, reason: string): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${encodeURIComponent(userId)}/delete-request`, {
    method: "POST",
    token,
    body: JSON.stringify({ reason })
  });
}

export async function confirmUserDeletion(token: string, userId: string): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${encodeURIComponent(userId)}/delete-confirm`, {
    method: "POST",
    token
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

export async function cancelOwnDeletion(token: string): Promise<AdminUser> {
  return apiRequest<AdminUser>("/api/me/delete-cancel", {
    method: "POST",
    token
  });
}
