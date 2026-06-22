export type AdminRouteHandlers<Env, AuthContext> = {
  notFound: () => Response;
  isAuthorizedLegacyAdminRequest: (request: Request, env: Env) => boolean;
  requireAuth: (request: Request, env: Env) => Promise<AuthContext | Response>;
  requireAdmin: (context: AuthContext) => Response | null;
  updateLoginNotice: (request: Request, env: Env) => Promise<Response>;
  updateRegistrationSetting: (request: Request, env: Env) => Promise<Response>;
  runDueDeletions: (env: Env) => Promise<Response>;
  adminSummary: (env: Env) => Promise<Response>;
  listUsers: (env: Env) => Promise<Response>;
  listLoginNotices: (env: Env) => Promise<Response>;
  createLoginNotice: (request: Request, env: Env) => Promise<Response>;
  updateLoginNoticeRecord: (request: Request, env: Env, noticeId: string) => Promise<Response>;
  listFeedback: (env: Env) => Promise<Response>;
  listAiProviders: (env: Env, actorUserId: string) => Promise<Response>;
  saveAiProvider: (request: Request, env: Env, providerId?: string) => Promise<Response>;
  generateAiScheduleDraft: (request: Request, env: Env, actor: AuthContext) => Promise<Response>;
  listUsableAiProviders: (env: Env, includeSensitive: boolean, actorUserId: string) => Promise<Response>;
  deleteAiProvider: (env: Env, providerId: string) => Promise<Response>;
  testAiProvider: (request: Request, env: Env, actor: AuthContext, providerId: string) => Promise<Response>;
  updateFeedback: (request: Request, env: Env, actor: AuthContext, feedbackId: string) => Promise<Response>;
  requestDeleteUser: (request: Request, env: Env, actor: AuthContext, targetUserId: string) => Promise<Response>;
  confirmDeleteUser: (request: Request, env: Env, actor: AuthContext, targetUserId: string) => Promise<Response>;
  cancelDeleteUser: (env: Env, actor: AuthContext, targetUserId: string) => Promise<Response>;
};

export type ApiRouteHandlers<Env, AuthContext> = AdminRouteHandlers<Env, AuthContext> & {
  json: (data: unknown, status?: number) => Response;
  getLoginNotice: (env: Env) => Promise<Response>;
  getPublicSettings: (env: Env) => Promise<Response>;
  authLookup: (request: Request, env: Env) => Promise<Response>;
  registerUser: (request: Request, env: Env) => Promise<Response>;
  loginUser: (request: Request, env: Env) => Promise<Response>;
  logout: (request: Request, env: Env) => Promise<Response>;
  me: (request: Request, env: Env) => Promise<Response>;
  selfCancelDeletion: (request: Request, env: Env) => Promise<Response>;
  submitFeedback: (request: Request, env: Env) => Promise<Response>;
  getMyVault: (request: Request, env: Env) => Promise<Response>;
  getMyVaultMeta: (request: Request, env: Env) => Promise<Response>;
  putMyVault: (request: Request, env: Env) => Promise<Response>;
  getEncryptedDocument: (pathname: string, request: Request, env: Env) => Promise<Response>;
  putEncryptedDocument: (pathname: string, request: Request, env: Env) => Promise<Response>;
};

export async function handleAdminRoutes<Env, AuthContext extends { user: { id: string } }>(
  request: Request,
  env: Env,
  handlers: AdminRouteHandlers<Env, AuthContext>
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (handlers.isAuthorizedLegacyAdminRequest(request, env)) {
    if (request.method === "PUT" && pathname === "/api/admin/login-notice") {
      return handlers.updateLoginNotice(request, env);
    }
    if (request.method === "PUT" && pathname === "/api/admin/registration") {
      return handlers.updateRegistrationSetting(request, env);
    }
    if (request.method === "POST" && pathname === "/api/admin/deletions/run-due") {
      return handlers.runDueDeletions(env);
    }
  }

  const context = await handlers.requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }
  const adminError = handlers.requireAdmin(context);
  if (adminError) {
    return adminError;
  }

  if (request.method === "GET" && pathname === "/api/admin/summary") {
    return handlers.adminSummary(env);
  }

  if (request.method === "GET" && pathname === "/api/admin/users") {
    return handlers.listUsers(env);
  }

  if (request.method === "PUT" && pathname === "/api/admin/login-notice") {
    return handlers.updateLoginNotice(request, env);
  }

  if (request.method === "GET" && pathname === "/api/admin/login-notices") {
    return handlers.listLoginNotices(env);
  }

  if (request.method === "POST" && pathname === "/api/admin/login-notices") {
    return handlers.createLoginNotice(request, env);
  }

  const noticeMatch = /^\/api\/admin\/login-notices\/([^/]+)$/.exec(pathname);
  if (noticeMatch) {
    if (request.method !== "PATCH") return handlers.notFound();
    return handlers.updateLoginNoticeRecord(request, env, decodeURIComponent(noticeMatch[1]));
  }

  if (request.method === "PUT" && pathname === "/api/admin/registration") {
    return handlers.updateRegistrationSetting(request, env);
  }

  if (request.method === "POST" && pathname === "/api/admin/deletions/run-due") {
    return handlers.runDueDeletions(env);
  }

  if (request.method === "GET" && pathname === "/api/admin/feedback") {
    return handlers.listFeedback(env);
  }

  if (request.method === "GET" && pathname === "/api/admin/ai/providers") {
    return handlers.listAiProviders(env, context.user.id);
  }

  if (request.method === "POST" && pathname === "/api/admin/ai/providers") {
    return handlers.saveAiProvider(request, env);
  }

  if (request.method === "POST" && pathname === "/api/admin/ai/schedule-draft") {
    return handlers.generateAiScheduleDraft(request, env, context);
  }

  const providerMatch = /^\/api\/admin\/ai\/providers\/([^/]+)$/.exec(pathname);
  if (providerMatch) {
    const providerId = decodeURIComponent(providerMatch[1]);
    if (request.method === "GET") {
      return handlers.listUsableAiProviders(env, true, context.user.id);
    }
    if (request.method === "PUT") {
      return handlers.saveAiProvider(request, env, providerId);
    }
    if (request.method === "DELETE") {
      return handlers.deleteAiProvider(env, providerId);
    }
    return handlers.notFound();
  }

  const aiProviderTestMatch = /^\/api\/admin\/ai\/providers\/([^/]+)\/test$/.exec(pathname);
  if (aiProviderTestMatch) {
    if (request.method !== "POST") {
      return handlers.notFound();
    }
    return handlers.testAiProvider(request, env, context, decodeURIComponent(aiProviderTestMatch[1]));
  }

  const feedbackMatch = /^\/api\/admin\/feedback\/([^/]+)$/.exec(pathname);
  if (feedbackMatch) {
    if (request.method !== "PATCH") {
      return handlers.notFound();
    }
    return handlers.updateFeedback(request, env, context, feedbackMatch[1]);
  }

  const deleteMatch = /^\/api\/admin\/users\/([^/]+)\/delete-(request|confirm|cancel)$/.exec(pathname);
  if (deleteMatch) {
    const [, userId, action] = deleteMatch;
    if (request.method !== "POST") {
      return handlers.notFound();
    }
    if (action === "request") {
      return handlers.requestDeleteUser(request, env, context, userId);
    }
    if (action === "confirm") {
      return handlers.confirmDeleteUser(request, env, context, userId);
    }
    if (action === "cancel") {
      return handlers.cancelDeleteUser(env, context, userId);
    }
  }

  return null;
}

export async function handleApiRoutes<Env, AuthContext extends { user: { id: string } }>(
  request: Request,
  env: Env,
  handlers: ApiRouteHandlers<Env, AuthContext>
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/api/health") {
    return handlers.json({ ok: true, service: "teacher-salary-tracker" });
  }

  if (request.method === "GET" && pathname === "/api/public/login-notice") {
    return handlers.getLoginNotice(env);
  }

  if (request.method === "GET" && pathname === "/api/public/settings") {
    return handlers.getPublicSettings(env);
  }

  if (request.method === "GET" && pathname === "/api/auth/lookup") {
    return handlers.authLookup(request, env);
  }

  if (request.method === "POST" && pathname === "/api/auth/register") {
    return handlers.registerUser(request, env);
  }

  if (request.method === "POST" && pathname === "/api/auth/login") {
    return handlers.loginUser(request, env);
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    return handlers.logout(request, env);
  }

  if (request.method === "GET" && pathname === "/api/auth/me") {
    return handlers.me(request, env);
  }

  if (request.method === "POST" && pathname === "/api/me/delete-cancel") {
    return handlers.selfCancelDeletion(request, env);
  }

  if (request.method === "POST" && pathname === "/api/feedback") {
    return handlers.submitFeedback(request, env);
  }

  if (pathname.startsWith("/api/ai/")) {
    const context = await handlers.requireAuth(request, env);
    if (context instanceof Response) {
      return context;
    }
    if (request.method === "GET" && pathname === "/api/ai/providers") {
      return handlers.listUsableAiProviders(env, false, context.user.id);
    }
    if (request.method === "POST" && pathname === "/api/ai/schedule-draft") {
      return handlers.generateAiScheduleDraft(request, env, context);
    }
    return handlers.notFound();
  }

  if (request.method === "GET" && pathname === "/api/me/vault") {
    return handlers.getMyVault(request, env);
  }

  if (request.method === "GET" && pathname === "/api/me/vault/meta") {
    return handlers.getMyVaultMeta(request, env);
  }

  if (request.method === "PUT" && pathname === "/api/me/vault") {
    return handlers.putMyVault(request, env);
  }

  if (pathname.startsWith("/api/admin/")) {
    const adminResponse = await handleAdminRoutes(request, env, handlers);
    return adminResponse ?? handlers.notFound();
  }

  if (pathname.startsWith("/api/encrypted-documents/")) {
    if (request.method === "GET") {
      return handlers.getEncryptedDocument(pathname, request, env);
    }
    if (request.method === "PUT") {
      return handlers.putEncryptedDocument(pathname, request, env);
    }
  }

  return handlers.notFound();
}
