import { adminSummary, createLoginNotice, createUserNote, deleteUserNote, getLoginNotice, getPublicSettings, getSchoolPalExportScript, listFeedback, listLoginNotices, listUserNotes, listUsers, submitFeedback, updateFeedback, updateLoginNotice, updateLoginNoticeRecord, updateRegistrationSetting, updateSchoolPalExportScript, updateUserNote } from "./admin";
import { deleteAiProvider, generateAiScheduleDraft, listAiProviders, listUsableAiProviders, saveAiProvider, testAiProvider } from "./aiProviders";
import { authLookup, cleanupExpiredSessions, isAuthorizedLegacyAdminRequest, loginUser, logout, me, registerUser, requireAdmin, requireAuth } from "./auth";
import { handleApiRoutes, type ApiRouteHandlers } from "./router";
import { isMigrationError, json, notFound, serveStaticAsset } from "./runtime";
import { AuthContext, Env } from "./types";
import { cancelDeleteUser, confirmDeleteUser, requestDeleteUser, runDueDeletions, selfCancelDeletion } from "./userDeletion";
import { deleteEncryptedDocument, getEncryptedDocument, getMyVault, getMyVaultMeta, putEncryptedDocument, putMyVault } from "./vaultDocuments";

const apiRouteHandlers = {
  json,
  notFound,
  isAuthorizedLegacyAdminRequest,
  requireAuth,
  requireAdmin,
  updateLoginNotice,
  updateRegistrationSetting,
  runDueDeletions,
  adminSummary,
  listUsers,
  listUserNotes,
  createUserNote,
  updateUserNote,
  deleteUserNote,
  listLoginNotices,
  createLoginNotice,
  updateLoginNoticeRecord,
  updateSchoolPalExportScript,
  listFeedback,
  listAiProviders,
  saveAiProvider,
  generateAiScheduleDraft,
  listUsableAiProviders,
  deleteAiProvider,
  testAiProvider,
  updateFeedback,
  requestDeleteUser,
  confirmDeleteUser,
  cancelDeleteUser,
  getLoginNotice,
  getPublicSettings,
  getSchoolPalExportScript,
  authLookup,
  registerUser,
  loginUser,
  logout,
  me,
  selfCancelDeletion,
  submitFeedback,
  getMyVault,
  getMyVaultMeta,
  putMyVault,
  getEncryptedDocument,
  putEncryptedDocument,
  deleteEncryptedDocument
} satisfies ApiRouteHandlers<Env, AuthContext>;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        await cleanupExpiredSessions(env);
        if (request.method !== "GET" && url.pathname !== "/api/admin/deletions/run-due") {
          await runDueDeletions(env).catch(() => undefined);
        }
        return await handleApiRoutes(request, env, apiRouteHandlers);
      } catch (error) {
        if (isMigrationError(error)) {
          return json(
            {
              error: "Database migration required",
              detail: "请先在 Cloudflare D1 按顺序执行 migrations 目录下尚未执行的 SQL，然后刷新页面。"
            },
            503
          );
        }
        return json(
          {
            error: "Internal server error",
            detail: error instanceof Error ? error.message : "Unknown error"
          },
          500
        );
      }
    }

    return serveStaticAsset(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await cleanupExpiredSessions(env);
    await runDueDeletions(env);
  }
};
