import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { modulesRouter } from "./modules.js";

const { getUserMock, profilesMock, modulesMock, fromMock } = vi.hoisted(() => {
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
  const modulesMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    modules: modulesMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, modulesMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", modulesRouter);
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
  modulesMock.result.data = null;
  modulesMock.result.error = null;
});

describe("POST /api/courses/:id/modules", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/courses/course-1/modules")
      .send({ title: "Module 1" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/courses/course-1/modules")
      .set("Authorization", "Bearer token")
      .send({ title: "Module 1" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/courses/course-1/modules")
      .set("Authorization", "Bearer token")
      .send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("creates the module for a trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    modulesMock.result.data = { id: "mod-1", course_id: "course-1", title: "Module 1" };

    const res = await request(buildApp())
      .post("/api/courses/course-1/modules")
      .set("Authorization", "Bearer token")
      .send({ title: "Module 1" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "mod-1", course_id: "course-1" });
  });
});

describe("GET /api/courses/:id/modules", () => {
  it("lists modules for any authenticated user", async () => {
    authenticateAs("trainee-1", "trainee");
    modulesMock.result.data = [{ id: "mod-1", course_id: "course-1", title: "Module 1" }];

    const res = await request(buildApp())
      .get("/api/courses/course-1/modules")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/modules/:id", () => {
  it("returns 404 when not found", async () => {
    authenticateAs("trainee-1", "trainee");
    modulesMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/modules/missing")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/modules/:id", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .patch("/api/modules/mod-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });
    expect(res.status).toBe(403);
  });

  it("updates the module for a trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    modulesMock.result.data = { id: "mod-1", title: "Updated" };

    const res = await request(buildApp())
      .patch("/api/modules/mod-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Updated" });
  });
});

describe("DELETE /api/modules/:id", () => {
  it("deletes the module for an admin", async () => {
    authenticateAs("admin-1", "admin");
    modulesMock.result.data = { id: "mod-1" };

    const res = await request(buildApp())
      .delete("/api/modules/mod-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
  });
});
