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
