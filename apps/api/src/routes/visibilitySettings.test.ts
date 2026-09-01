import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { visibilitySettingsRouter } from "./visibilitySettings.js";

const { getUserMock, profilesMock, visibilityMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of ["select", "insert", "update", "delete", "upsert", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle"]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const visibilityMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    visibility_settings: visibilityMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, visibilityMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", visibilitySettingsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  for (const mock of [profilesMock, visibilityMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

describe("GET /api/visibility-settings", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/visibility-settings");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("employer-1", "employer");
    const res = await request(buildApp())
      .get("/api/visibility-settings")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("defaults to visible_to_employers: false when no row exists yet", async () => {
    authenticateAs("trainee-1", "trainee");
    visibilityMock.result.data = null;
    const res = await request(buildApp())
      .get("/api/visibility-settings")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ visible_to_employers: false });
  });

  it("returns the caller's own row when it exists", async () => {
    authenticateAs("trainee-1", "trainee");
    visibilityMock.result.data = { trainee_id: "trainee-1", visible_to_employers: true };
    const res = await request(buildApp())
      .get("/api/visibility-settings")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ visible_to_employers: true });
  });
});

describe("PUT /api/visibility-settings", () => {
  it("returns 400 for a non-boolean value", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .put("/api/visibility-settings")
      .set("Authorization", "Bearer token")
      .send({ visible_to_employers: "yes" });
    expect(res.status).toBe(400);
  });

  it("upserts the caller's own row", async () => {
    authenticateAs("trainee-1", "trainee");
    visibilityMock.result.data = { trainee_id: "trainee-1", visible_to_employers: true };
    const res = await request(buildApp())
      .put("/api/visibility-settings")
      .set("Authorization", "Bearer token")
      .send({ visible_to_employers: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ visible_to_employers: true });
  });
});
