import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nominationsRouter } from "./nominations.js";

const { getUserMock, profilesMock, nominationsMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "insert", "update", "delete", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const nominationsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    nominations: nominationsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, nominationsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", nominationsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  nominationsMock.result.data = null;
  nominationsMock.result.error = null;
});

describe("POST /api/programmes/:id/nominations", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/programmes/prog-1/nominations");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee role", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(403);
  });

  it("creates a self-nomination for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    nominationsMock.result.data = {
      id: "nom-1",
      programme_id: "prog-1",
      trainee_id: "trainee-1",
      status: "pending",
    };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "pending", trainee_id: "trainee-1" });
  });

  it("returns 409 when already nominated", async () => {
    authenticateAs("trainee-1", "trainee");
    nominationsMock.result.data = null;
    nominationsMock.result.error = { code: "23505", message: "duplicate key" };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(409);
  });
});

describe("GET /api/programmes/:id/nominations", () => {
  it("returns 403 for a non-admin role", async () => {
    authenticateAs("trainee-1", "trainee");

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(403);
  });

  it("lists nominations for an admin", async () => {
    authenticateAs("admin-1", "admin");
    nominationsMock.result.data = [{ id: "nom-1", status: "pending" }];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("PATCH /api/programmes/:id/nominations/:nominationId", () => {
  it("returns 403 for a non-admin role", async () => {
    authenticateAs("trainee-1", "trainee");

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "approved" });

    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid status", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "pending" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when the nomination doesn't exist", async () => {
    authenticateAs("admin-1", "admin");
    nominationsMock.result.data = null;

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "approved" });

    expect(res.status).toBe(404);
  });

  it("approves the nomination for an admin", async () => {
    authenticateAs("admin-1", "admin");
    nominationsMock.result.data = {
      id: "nom-1",
      status: "approved",
      decided_at: "2026-09-01T00:00:00.000Z",
    };

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "approved" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
  });
});
