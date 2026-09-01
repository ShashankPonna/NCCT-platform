import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentsRouter } from "./assessments.js";

const { getUserMock, profilesMock, assessmentsMock, fromMock } = vi.hoisted(() => {
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
  const assessmentsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    assessments: assessmentsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, assessmentsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", assessmentsRouter);
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
  assessmentsMock.result.data = null;
  assessmentsMock.result.error = null;
});

describe("POST /api/modules/:id/assessments", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/modules/mod-1/assessments")
      .send({ title: "Quiz 1" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/modules/mod-1/assessments")
      .set("Authorization", "Bearer token")
      .send({ title: "Quiz 1" });
    expect(res.status).toBe(403);
  });

  it("creates the assessment for a trainer with the default pass threshold", async () => {
    authenticateAs("trainer-1", "trainer");
    assessmentsMock.result.data = {
      id: "assess-1",
      module_id: "mod-1",
      title: "Quiz 1",
      pass_threshold_percent: 60,
    };

    const res = await request(buildApp())
      .post("/api/modules/mod-1/assessments")
      .set("Authorization", "Bearer token")
      .send({ title: "Quiz 1" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "assess-1", module_id: "mod-1" });
  });
});

describe("GET /api/modules/:id/assessments", () => {
  it("lists assessments for any authenticated user", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = [{ id: "assess-1", module_id: "mod-1", title: "Quiz 1" }];

    const res = await request(buildApp())
      .get("/api/modules/mod-1/assessments")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/assessments/:id", () => {
  it("returns 404 when not found", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/assessments/missing")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/assessments/:id", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .patch("/api/assessments/assess-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });
    expect(res.status).toBe(403);
  });

  it("updates the assessment for an admin", async () => {
    authenticateAs("admin-1", "admin");
    assessmentsMock.result.data = { id: "assess-1", title: "Updated" };

    const res = await request(buildApp())
      .patch("/api/assessments/assess-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Updated" });
  });
});

describe("DELETE /api/assessments/:id", () => {
  it("deletes the assessment for an admin", async () => {
    authenticateAs("admin-1", "admin");
    assessmentsMock.result.data = { id: "assess-1" };

    const res = await request(buildApp())
      .delete("/api/assessments/assess-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
  });
});
