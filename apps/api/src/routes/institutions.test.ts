import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { institutionsRouter } from "./institutions.js";

const { getUserMock, profilesMock, institutionsMock, programmesMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown; count?: number | null } = {
      data: null,
      error: null,
    };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of ["select", "insert", "update", "delete", "eq", "order", "single", "maybeSingle"]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const institutionsMock = createTableMock();
  const programmesMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    institutions: institutionsMock,
    programmes: programmesMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, institutionsMock, programmesMock, fromMock };
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
  institutionsMock.builder.delete.mockClear();
  for (const mock of [profilesMock, institutionsMock, programmesMock]) {
    mock.result.data = null;
    mock.result.error = null;
    mock.result.count = null;
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

describe("POST /api/institutions", () => {
  it("returns 403 for a trainer (reads are shared, writes are admin-only)", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/institutions")
      .set("Authorization", "Bearer token")
      .send({ name: "New Institute" });
    expect(res.status).toBe(403);
  });

  it("rejects a nameless institution", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/institutions")
      .set("Authorization", "Bearer token")
      .send({ location: "Pune" });
    expect(res.status).toBe(400);
  });

  it("creates an institution for an admin", async () => {
    authenticateAs("admin-1", "admin");
    institutionsMock.result.data = { id: "inst-9", name: "RICM Pune", location: "Pune" };

    const res = await request(buildApp())
      .post("/api/institutions")
      .set("Authorization", "Bearer token")
      .send({ name: "RICM Pune", location: "Pune" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "RICM Pune" });
  });
});

describe("PATCH /api/institutions/:id", () => {
  it("returns 404 for an unknown institution", async () => {
    authenticateAs("admin-1", "admin");
    institutionsMock.result.data = null;

    const res = await request(buildApp())
      .patch("/api/institutions/nope")
      .set("Authorization", "Bearer token")
      .send({ location: "Mumbai" });

    expect(res.status).toBe(404);
  });

  it("rejects an empty update body", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .patch("/api/institutions/inst-1")
      .set("Authorization", "Bearer token")
      .send({});
    expect(res.status).toBe(400);
  });

  it("updates an institution", async () => {
    authenticateAs("admin-1", "admin");
    institutionsMock.result.data = { id: "inst-1", name: "VAMNICOM", location: "Mumbai" };

    const res = await request(buildApp())
      .patch("/api/institutions/inst-1")
      .set("Authorization", "Bearer token")
      .send({ location: "Mumbai" });

    expect(res.status).toBe(200);
    expect(res.body.location).toBe("Mumbai");
  });
});

describe("DELETE /api/institutions/:id", () => {
  it("refuses to delete an institution that still owns programmes", async () => {
    authenticateAs("admin-1", "admin");
    // `programmes.institution_id` cascades, so deleting here would silently
    // destroy a whole training history — the route must block it.
    programmesMock.result.count = 3;

    const res = await request(buildApp())
      .delete("/api/institutions/inst-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("3 programme");
    expect(institutionsMock.builder.delete).not.toHaveBeenCalled();
  });

  it("deletes an empty institution", async () => {
    authenticateAs("admin-1", "admin");
    programmesMock.result.count = 0;
    institutionsMock.result.data = { id: "inst-1" };

    const res = await request(buildApp())
      .delete("/api/institutions/inst-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
  });

  it("returns 404 when the institution does not exist", async () => {
    authenticateAs("admin-1", "admin");
    programmesMock.result.count = 0;
    institutionsMock.result.data = null;

    const res = await request(buildApp())
      .delete("/api/institutions/nope")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });
});
