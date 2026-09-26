import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { timetableRouter } from "./timetable.js";

const { getUserMock, profilesMock, timetableMock, programmeTrainersMock, coursesMock, fromMock } =
  vi.hoisted(() => {
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
    const timetableMock = createTableMock();
    const programmeTrainersMock = createTableMock();
    const coursesMock = createTableMock();
    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      profiles: profilesMock,
      timetable_sessions: timetableMock,
      programme_trainers: programmeTrainersMock,
      courses: coursesMock,
    };
    const fromMock = vi.fn((table: string) => tables[table].builder);
    const getUserMock = vi.fn();
    return {
      getUserMock,
      profilesMock,
      timetableMock,
      programmeTrainersMock,
      coursesMock,
      fromMock,
    };
  });

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

// Notification fan-out is a fire-and-forget side effect (docs/DECISIONS.md
// #65) — mocked so it can't touch this file's table mocks, and so tests can
// assert the right trigger fires.
const notificationMocks = vi.hoisted(() => ({
  notify: vi.fn(() => Promise.resolve()),
  notifyNominationDecided: vi.fn(() => Promise.resolve()),
  notifyNominationSubmitted: vi.fn(() => Promise.resolve()),
  notifyLessonPublished: vi.fn(() => Promise.resolve()),
  notifyAssessmentAvailable: vi.fn(() => Promise.resolve()),
  notifySessionScheduled: vi.fn(() => Promise.resolve()),
  notifyHostelAssigned: vi.fn(() => Promise.resolve()),
  notifyJobShortlisted: vi.fn(() => Promise.resolve()),
  notifyJobInterestUpdated: vi.fn(() => Promise.resolve()),
  notifyTrainerAssigned: vi.fn(() => Promise.resolve()),
}));
vi.mock("../notificationService.js", () => notificationMocks);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", timetableRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

const validSession = {
  title: "Orientation",
  starts_at: "2026-10-01T09:00:00.000Z",
  ends_at: "2026-10-01T11:00:00.000Z",
};

beforeEach(() => {
  for (const fn of Object.values(notificationMocks)) fn.mockClear();
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  timetableMock.result.data = null;
  timetableMock.result.error = null;
  // A test overriding .single() directly (the check_in_code collision-retry
  // test below) must not leak its mock into later tests.
  timetableMock.builder.single = vi.fn(() => Promise.resolve(timetableMock.result));
  programmeTrainersMock.result.data = null;
  programmeTrainersMock.result.error = null;
  coursesMock.result.data = null;
  coursesMock.result.error = null;
  coursesMock.builder.eq.mockClear();
});

describe("POST /api/programmes/:id/timetable", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .send(validSession);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send(validSession);

    expect(res.status).toBe(403);
  });

  it("returns 403 for a trainer not assigned to the programme", async () => {
    authenticateAs("trainer-1", "trainer");
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send(validSession);

    expect(res.status).toBe(403);
  });

  it("creates the session for a trainer, not just an admin", async () => {
    authenticateAs("trainer-1", "trainer");
    programmeTrainersMock.result.data = { trainer_id: "trainer-1" };
    timetableMock.result.data = {
      id: "sess-2",
      programme_id: "prog-1",
      check_in_code: "601122",
      ...validSession,
    };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send(validSession);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "sess-2", programme_id: "prog-1" });
    expect(notificationMocks.notifySessionScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ programmeId: "prog-1", startsAt: validSession.starts_at }),
    );
  });

  it("returns 400 when ends_at is before starts_at", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send({ ...validSession, starts_at: validSession.ends_at, ends_at: validSession.starts_at });

    expect(res.status).toBe(400);
    expect(notificationMocks.notifySessionScheduled).not.toHaveBeenCalled();
  });

  it("creates the session for an admin, with a generated check_in_code", async () => {
    authenticateAs("admin-1", "admin");
    timetableMock.result.data = {
      id: "sess-1",
      programme_id: "prog-1",
      check_in_code: "482913",
      ...validSession,
    };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send(validSession);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "sess-1", programme_id: "prog-1" });
    expect(timetableMock.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ check_in_code: expect.stringMatching(/^\d{6}$/) }),
    );
  });

  it("creates a course-specific session when the course belongs to the programme", async () => {
    authenticateAs("admin-1", "admin");
    coursesMock.result.data = { title: "Digital Payments & UPI" };
    timetableMock.result.data = {
      id: "sess-2",
      programme_id: "prog-1",
      course_id: "11111111-1111-1111-1111-111111111111",
      check_in_code: "123456",
      ...validSession,
    };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send({ ...validSession, course_id: "11111111-1111-1111-1111-111111111111" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      course_id: "11111111-1111-1111-1111-111111111111",
      course_title: "Digital Payments & UPI",
    });
    // The course is looked up within this programme, not globally.
    expect(coursesMock.builder.eq).toHaveBeenCalledWith("programme_id", "prog-1");
    expect(timetableMock.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ course_id: "11111111-1111-1111-1111-111111111111" }),
    );
    expect(notificationMocks.notifySessionScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ courseTitle: "Digital Payments & UPI" }),
    );
  });

  it("returns 400 and creates nothing when the course belongs to a different programme", async () => {
    authenticateAs("admin-1", "admin");
    coursesMock.result.data = null;

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send({ ...validSession, course_id: "22222222-2222-2222-2222-222222222222" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't part of this programme/);
    expect(timetableMock.builder.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ course_id: "22222222-2222-2222-2222-222222222222" }),
    );
  });

  it("returns 400 for a malformed course_id", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send({ ...validSession, course_id: "not-a-uuid" });

    expect(res.status).toBe(400);
  });

  it("regenerates the code and retries on a check_in_code collision", async () => {
    authenticateAs("admin-1", "admin");
    const single = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate key" } })
      .mockResolvedValueOnce({
        data: { id: "sess-1", programme_id: "prog-1", check_in_code: "112233", ...validSession },
        error: null,
      });
    timetableMock.builder.single = single;

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send(validSession);

    expect(res.status).toBe(201);
    expect(single).toHaveBeenCalledTimes(2);
  });

  it("returns 400 immediately for a non-collision insert error", async () => {
    authenticateAs("admin-1", "admin");
    timetableMock.result.data = null;
    timetableMock.result.error = { code: "23503", message: "programme not found" };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send(validSession);

    expect(res.status).toBe(400);
  });
});

describe("GET /api/timetable-sessions/code/:code", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/timetable-sessions/code/482913");
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed code", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/timetable-sessions/code/abc")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(400);
  });

  it("returns 404 when no session matches the code", async () => {
    authenticateAs("trainee-1", "trainee");
    timetableMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/timetable-sessions/code/482913")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("resolves a valid code to its session for any authenticated role", async () => {
    authenticateAs("trainee-1", "trainee");
    timetableMock.result.data = {
      id: "sess-1",
      programme_id: "prog-1",
      check_in_code: "482913",
      ...validSession,
    };

    const res = await request(buildApp())
      .get("/api/timetable-sessions/code/482913")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "sess-1", check_in_code: "482913" });
  });
});

describe("GET /api/programmes/:id/timetable", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/programmes/prog-1/timetable");
    expect(res.status).toBe(401);
  });

  it("lists sessions for any authenticated user", async () => {
    authenticateAs("trainee-1", "trainee");
    timetableMock.result.data = [{ id: "sess-1", programme_id: "prog-1", ...validSession }];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("flattens each session's embedded course into course_title", async () => {
    authenticateAs("trainee-1", "trainee");
    timetableMock.result.data = [
      {
        id: "sess-1",
        programme_id: "prog-1",
        course_id: "c-1",
        courses: { title: "Digital Payments & UPI" },
        ...validSession,
      },
      { id: "sess-2", programme_id: "prog-1", course_id: null, courses: null, ...validSession },
    ];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token");

    expect(res.body[0]).toMatchObject({ course_title: "Digital Payments & UPI" });
    expect(res.body[0]).not.toHaveProperty("courses");
    expect(res.body[1]).toMatchObject({ course_id: null, course_title: null });
  });
});
