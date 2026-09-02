import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { institutionsRouter } from "./institutions.js";

const { getUserMock, profilesMock, institutionsMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of ["select", "eq", "order", "single", "maybeSingle"]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const institutionsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    institutions: institutionsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, institutionsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", institutionsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  for (const mock of [profilesMock, institutionsMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

describe("GET /api/institutions", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/institutions");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/institutions")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns the institution list for an admin", async () => {
    authenticateAs("admin-1", "admin");
    institutionsMock.result.data = [
      { id: "inst-1", name: "VAMNICOM", type: "national", location: "Pune" },
    ];

    const res = await request(buildApp())
      .get("/api/institutions")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: "VAMNICOM", location: "Pune" });
  });

  it("allows a trainer too (they author content under a programme)", async () => {
    authenticateAs("trainer-1", "trainer");
    institutionsMock.result.data = [];

    const res = await request(buildApp())
      .get("/api/institutions")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
