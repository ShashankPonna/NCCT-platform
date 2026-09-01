import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coursesRouter } from "./courses.js";

const { getUserMock, profilesMock, coursesMock, fromMock } = vi.hoisted(() => {
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
  const coursesMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    courses: coursesMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, coursesMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", coursesRouter);
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
  coursesMock.result.data = null;
  coursesMock.result.error = null;
});

describe("POST /api/programmes/:id/courses", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/programmes/prog-1/courses")
      .send({ title: "Basics" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/programmes/prog-1/courses")
      .set("Authorization", "Bearer token")
      .send({ title: "Basics" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/programmes/prog-1/courses")
      .set("Authorization", "Bearer token")
      .send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("creates the course for a trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    coursesMock.result.data = { id: "course-1", programme_id: "prog-1", title: "Basics" };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/courses")
      .set("Authorization", "Bearer token")
      .send({ title: "Basics" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "course-1", programme_id: "prog-1" });
  });
});

describe("GET /api/programmes/:id/courses", () => {
  it("lists courses for any authenticated user", async () => {
    authenticateAs("trainee-1", "trainee");
    coursesMock.result.data = [{ id: "course-1", programme_id: "prog-1", title: "Basics" }];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/courses")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/courses/:id", () => {
  it("returns 404 when not found", async () => {
    authenticateAs("trainee-1", "trainee");
    coursesMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/courses/missing")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns the course when found", async () => {
    authenticateAs("trainee-1", "trainee");
    coursesMock.result.data = { id: "course-1", programme_id: "prog-1", title: "Basics" };

    const res = await request(buildApp())
      .get("/api/courses/course-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "course-1" });
  });
});

describe("PATCH /api/courses/:id", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .patch("/api/courses/course-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });
    expect(res.status).toBe(403);
  });

  it("updates the course for an admin", async () => {
    authenticateAs("admin-1", "admin");
    coursesMock.result.data = { id: "course-1", title: "Updated" };

    const res = await request(buildApp())
      .patch("/api/courses/course-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Updated" });
  });
});

describe("DELETE /api/courses/:id", () => {
  it("returns 404 when not found", async () => {
    authenticateAs("admin-1", "admin");
    coursesMock.result.data = null;

    const res = await request(buildApp())
      .delete("/api/courses/missing")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("deletes the course for an admin", async () => {
    authenticateAs("admin-1", "admin");
    coursesMock.result.data = { id: "course-1" };

    const res = await request(buildApp())
      .delete("/api/courses/course-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
  });
});
