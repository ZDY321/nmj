import { describe, expect, it, vi } from "vitest";
import { handleApiRoutes, type ApiRouteHandlers } from "./router";

type TestAuthContext = { user: { id: string } };
type TestHandlers = ApiRouteHandlers<Record<string, never>, TestAuthContext>;

function makeHandlers(overrides: Partial<TestHandlers> = {}): TestHandlers {
  return {
    json: (data, status = 200) => Response.json(data, { status }),
    notFound: () => Response.json({ error: "Not found" }, { status: 404 }),
    isAuthorizedLegacyAdminRequest: vi.fn(() => false),
    requireAuth: vi.fn(async () => ({ user: { id: "admin_1" } })),
    requireAdmin: vi.fn(() => null),
    listUserNotes: vi.fn(async () => Response.json([])),
    createUserNote: vi.fn(async () => Response.json({ id: "note_1" }, { status: 201 })),
    updateUserNote: vi.fn(async () => Response.json({ id: "note_1" })),
    deleteUserNote: vi.fn(async () => Response.json({ ok: true })),
    getSchoolPalExportScript: vi.fn(async () => Response.json({ content: "script", updatedAt: null })),
    updateSchoolPalExportScript: vi.fn(async () => Response.json({ content: "updated", updatedAt: "2026-08-04T00:00:00.000Z" })),
    ...overrides
  } as TestHandlers;
}

describe("schoolpal export script routes", () => {
  it("allows public script reads", async () => {
    const handlers = makeHandlers();
    const response = await handleApiRoutes(
      new Request("https://example.com/api/public/schoolpal-export-script"),
      {},
      handlers
    );

    expect(response.status).toBe(200);
    expect(handlers.getSchoolPalExportScript).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({ content: "script", updatedAt: null });
  });

  it("rejects non-admin script updates", async () => {
    const updateSchoolPalExportScript = vi.fn(async () => Response.json({ ok: true }));
    const handlers = makeHandlers({
      requireAdmin: vi.fn(() => Response.json({ error: "Forbidden" }, { status: 403 })),
      updateSchoolPalExportScript
    });
    const response = await handleApiRoutes(
      new Request("https://example.com/api/admin/schoolpal-export-script", { method: "PUT" }),
      {},
      handlers
    );

    expect(response.status).toBe(403);
    expect(updateSchoolPalExportScript).not.toHaveBeenCalled();
  });

  it("allows admin script updates", async () => {
    const handlers = makeHandlers();
    const response = await handleApiRoutes(
      new Request("https://example.com/api/admin/schoolpal-export-script", { method: "PUT" }),
      {},
      handlers
    );

    expect(response.status).toBe(200);
    expect(handlers.updateSchoolPalExportScript).toHaveBeenCalledOnce();
  });
});

describe("admin user note routes", () => {
  it("lists notes for admins", async () => {
    const handlers = makeHandlers();
    const response = await handleApiRoutes(
      new Request("https://example.com/api/admin/user-notes"),
      {},
      handlers
    );

    expect(response.status).toBe(200);
    expect(handlers.listUserNotes).toHaveBeenCalledOnce();
  });

  it("routes note creation to the target user", async () => {
    const handlers = makeHandlers();
    const response = await handleApiRoutes(
      new Request("https://example.com/api/admin/users/user%2F1/notes", { method: "POST" }),
      {},
      handlers
    );

    expect(response.status).toBe(201);
    expect(handlers.createUserNote).toHaveBeenCalledWith(
      expect.any(Request),
      {},
      expect.objectContaining({ user: { id: "admin_1" } }),
      "user/1"
    );
  });

  it("routes note deletion by note id", async () => {
    const handlers = makeHandlers();
    const response = await handleApiRoutes(
      new Request("https://example.com/api/admin/user-notes/note-1", { method: "DELETE" }),
      {},
      handlers
    );

    expect(response.status).toBe(200);
    expect(handlers.deleteUserNote).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ user: { id: "admin_1" } }),
      "note-1"
    );
  });
});
