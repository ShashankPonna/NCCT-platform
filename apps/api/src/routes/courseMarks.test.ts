import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { courseMarksRouter } from "./courseMarks.js";

const { getUserMock, profilesMock, coursesMock, programmeTrainersMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const coursesMock = createTableMock();
  const programmeTrainersMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    courses: coursesMock,
    programme_trainers: programmeTrainersMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, coursesMock, programmeTrainersMock, fromMock };
});

const { getCourseMarksTallyMock, getCourseGradebookMock } = vi.hoisted(() => ({
  getCourseMarksTallyMock: vi.fn(),
  getCourseGradebookMock: vi.fn(),
}));

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

// The tally/gradebook builders are their own unit-tested module
// (assessmentScoring.test.ts) — mocked here so this file only has to prove
// the route wires auth/scoping correctly and shapes the response.
vi.mock("../assessmentScoring.js", () => ({
  getCourseMarksTally: getCourseMarksTallyMock,
  getCourseGradebook: getCourseGradebookMock,
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", courseMarksRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  getCourseMarksTallyMock.mockReset();
  getCourseGradebookMock.mockReset();
  for (const mock of [profilesMock, coursesMock, programmeTrainersMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

describe("GET /api/courses/:id/marks/mine", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/courses/course-1/marks/mine");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an admin (trainee-only)", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .get("/api/courses/course-1/marks/mine")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the course doesn't exist", async () => {
    authenticateAs("trainee-1", "trainee");
    getCourseMarksTallyMock.mockResolvedValue(null);

    const res = await request(buildApp())
      .get("/api/courses/course-1/marks/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns the caller's own tally, never a body-supplied trainee id", async () => {
    authenticateAs("trainee-1", "trainee");
    const tally = { course_id: "course-1", totals: { marks_obtained: 8, total_marks: 10 } };
    getCourseMarksTallyMock.mockResolvedValue(tally);

    const res = await request(buildApp())
      .get("/api/courses/course-1/marks/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(tally);
    expect(getCourseMarksTallyMock).toHaveBeenCalledWith("course-1", "trainee-1");
  });

  it("returns 400 when the tally computation throws", async () => {
    authenticateAs("trainee-1", "trainee");
    getCourseMarksTallyMock.mockRejectedValue(new Error("boom"));

    const res = await request(buildApp())
      .get("/api/courses/course-1/marks/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(400);
  });
});

describe("GET /api/courses/:id/gradebook", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a trainer not assigned to the course's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    coursesMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(403);
    expect(getCourseGradebookMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the course doesn't exist, for an admin", async () => {
    authenticateAs("admin-1", "admin");
    getCourseGradebookMock.mockResolvedValue(null);

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns the gradebook for a trainer assigned to the course's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    coursesMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = { trainer_id: "trainer-1" };
    const gradebook = { course_id: "course-1", rows: [{ trainee_id: "t-1", full_name: "Asha" }] };
    getCourseGradebookMock.mockResolvedValue(gradebook);

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(gradebook);
    expect(getCourseGradebookMock).toHaveBeenCalledWith("course-1");
  });
});
