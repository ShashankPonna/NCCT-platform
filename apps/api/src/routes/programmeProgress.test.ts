import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { programmeProgressRouter } from "./programmeProgress.js";

const { getUserMock, profilesMock, coursesMock, modulesMock, lessonsMock, progressMock, fromMock } =
  vi.hoisted(() => {
    function createTableMock() {
      const result: { data: unknown; error: unknown } = { data: null, error: null };
      const builder: Record<string, ReturnType<typeof vi.fn>> = {
        then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
      };
      for (const method of ["select", "eq", "in", "not", "single", "maybeSingle"]) {
        builder[method] = vi.fn(() => builder);
      }
      return { builder, result };
    }

    const profilesMock = createTableMock();
    const coursesMock = createTableMock();
    const modulesMock = createTableMock();
    const lessonsMock = createTableMock();
    const progressMock = createTableMock();
    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      profiles: profilesMock,
      courses: coursesMock,
      modules: modulesMock,
      lessons: lessonsMock,
      lesson_progress: progressMock,
    };
    const fromMock = vi.fn((table: string) => tables[table].builder);
    const getUserMock = vi.fn();
    return { getUserMock, profilesMock, coursesMock, modulesMock, lessonsMock, progressMock, fromMock };
  });

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", programmeProgressRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  for (const mock of [profilesMock, coursesMock, modulesMock, lessonsMock, progressMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

const TRAINEE_ID = "11111111-1111-1111-1111-111111111111";

describe("GET /api/programmes/:id/progress", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/programmes/prog-1/progress");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .get("/api/programmes/prog-1/progress")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns zeroed-out progress for a programme with no courses yet", async () => {
    authenticateAs(TRAINEE_ID, "trainee");
    coursesMock.result.data = [];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/progress")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      programme_id: "prog-1",
      total_lessons: 0,
      completed_lessons: 0,
      percent: 0,
    });
  });

  it("returns zeroed-out progress for courses with no lessons anywhere", async () => {
    authenticateAs(TRAINEE_ID, "trainee");
    coursesMock.result.data = [{ id: "course-1" }];
    modulesMock.result.data = [];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/progress")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.total_lessons).toBe(0);
  });

  it("computes a real percent from completed lesson_progress rows, not a hardcoded value", async () => {
    authenticateAs(TRAINEE_ID, "trainee");
    coursesMock.result.data = [{ id: "course-1" }];
    modulesMock.result.data = [{ id: "module-1" }];
    lessonsMock.result.data = [{ id: "lesson-1" }, { id: "lesson-2" }, { id: "lesson-3" }, { id: "lesson-4" }];
    progressMock.result.data = [{ lesson_id: "lesson-1" }, { lesson_id: "lesson-2" }];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/progress")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      programme_id: "prog-1",
      total_lessons: 4,
      completed_lessons: 2,
      percent: 50,
    });
  });

  it("scopes the lesson_progress query to the caller's own id, never the request", async () => {
    authenticateAs(TRAINEE_ID, "trainee");
    coursesMock.result.data = [{ id: "course-1" }];
    modulesMock.result.data = [{ id: "module-1" }];
    lessonsMock.result.data = [{ id: "lesson-1" }];
    progressMock.result.data = [];

    await request(buildApp())
      .get("/api/programmes/prog-1/progress")
      .set("Authorization", "Bearer token");

    expect(progressMock.builder.eq).toHaveBeenCalledWith("trainee_id", TRAINEE_ID);
  });
});
