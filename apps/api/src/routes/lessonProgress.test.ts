import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lessonProgressRouter } from "./lessonProgress.js";

const { getUserMock, profilesMock, progressMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "insert", "update", "delete", "upsert", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const progressMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    lesson_progress: progressMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, progressMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", lessonProgressRouter);
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
  progressMock.result.data = null;
  progressMock.result.error = null;
});

describe("GET /api/lessons/:id/progress", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/lessons/lesson-1/progress");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/progress")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns null when the trainee has no progress row yet", async () => {
    authenticateAs("trainee-1", "trainee");
    progressMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/progress")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns the trainee's own progress row", async () => {
    authenticateAs("trainee-1", "trainee");
    progressMock.result.data = {
      id: "prog-1",
      trainee_id: "trainee-1",
      lesson_id: "lesson-1",
      progress_percent: 40,
    };

    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/progress")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ progress_percent: 40 });
  });
});

describe("PATCH /api/lessons/:id/progress", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .patch("/api/lessons/lesson-1/progress")
      .send({ progress_percent: 50 });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .patch("/api/lessons/lesson-1/progress")
      .set("Authorization", "Bearer token")
      .send({ progress_percent: 50 });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an out-of-range progress_percent", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .patch("/api/lessons/lesson-1/progress")
      .set("Authorization", "Bearer token")
      .send({ progress_percent: 150 });
    expect(res.status).toBe(400);
  });

  it("upserts progress for the caller's own row", async () => {
    authenticateAs("trainee-1", "trainee");
    progressMock.result.data = {
      id: "prog-1",
      trainee_id: "trainee-1",
      lesson_id: "lesson-1",
      progress_percent: 100,
      completed_at: "2026-09-01T00:00:00.000Z",
    };

    const res = await request(buildApp())
      .patch("/api/lessons/lesson-1/progress")
      .set("Authorization", "Bearer token")
      .send({ progress_percent: 100, completed_at: "2026-09-01T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ progress_percent: 100, trainee_id: "trainee-1" });
  });
});
