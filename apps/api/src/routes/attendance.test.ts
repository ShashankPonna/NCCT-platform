import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attendanceRouter, cosineSimilarity } from "./attendance.js";

const {
  getUserMock,
  profilesMock,
  attendanceMock,
  embeddingsMock,
  sessionsMock,
  nominationsMock,
  programmeTrainersMock,
  fromMock,
} = vi.hoisted(() => {
  // `then` on the builder itself (not a per-method terminal resolver) means
  // any chain, however it ends (`.order()`, `.single()`, `.maybeSingle()`,
  // or nothing extra at all), resolves the same way — matching how a real
  // supabase-js query builder is itself a thenable. `queue` holds per-call
  // overrides, shifted off on each await, for a route that queries the same
  // table more than once with different expected answers (e.g. the manual
  // mark route's existing-row check, then its insert) — `result` is the
  // steady-state fallback once the queue is empty, same pattern as
  // employerSearch.test.ts.
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const queue: { data: unknown; error: unknown }[] = [];
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(queue.shift() ?? result)),
    };
    for (const method of [
      "select",
      "insert",
      "update",
      "delete",
      "upsert",
      "eq",
      "order",
      "limit",
      "single",
      "maybeSingle",
    ]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result, queue };
  }

  const profilesMock = createTableMock();
  const attendanceMock = createTableMock();
  const embeddingsMock = createTableMock();
  const sessionsMock = createTableMock();
  const nominationsMock = createTableMock();
  const programmeTrainersMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    attendance_records: attendanceMock,
    face_embeddings: embeddingsMock,
    timetable_sessions: sessionsMock,
    nominations: nominationsMock,
    programme_trainers: programmeTrainersMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return {
    getUserMock,
    profilesMock,
    attendanceMock,
    embeddingsMock,
    sessionsMock,
    nominationsMock,
    programmeTrainersMock,
    fromMock,
  };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", attendanceRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

function embeddingOf(value: number): number[] {
  return new Array(1024).fill(value);
}

// Session start times for the "not before start" checks below — comfortably
// in the past/future so there's no flakiness near the boundary.
const PAST_STARTS_AT = "2020-01-01T00:00:00.000Z";
const FUTURE_STARTS_AT = "2099-01-01T00:00:00.000Z";

// requireProgrammeAccess now gates every admin/trainer route below via a
// session→programme lookup on `timetable_sessions` (the same table several
// handlers already query themselves) plus an assignment check on
// `programme_trainers` — this sets up both for a trainer's success path.
// Defaults to an already-started session since most of these tests are
// about role/assignment, not timing.
function assignTrainerToSession(sessionFields: Record<string, unknown> = {}) {
  sessionsMock.result.data = {
    programme_id: "prog-1",
    starts_at: PAST_STARTS_AT,
    ...sessionFields,
  };
  programmeTrainersMock.result.data = { trainer_id: "trainer-1" };
}

beforeEach(() => {
  getUserMock.mockReset();
  for (const mock of [
    profilesMock,
    attendanceMock,
    embeddingsMock,
    sessionsMock,
    nominationsMock,
    programmeTrainersMock,
  ]) {
    mock.builder.insert.mockClear();
    mock.result.data = null;
    mock.result.error = null;
    mock.queue.length = 0;
  }
  // Every check-in path now requires an approved nomination; default to
  // "enrolled" so tests about other rules aren't tripped by this one. The
  // not-enrolled tests below set it back to null explicitly.
  nominationsMock.result.data = { trainee_id: "trainee-1" };
});

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is 0 for a zero-magnitude vector rather than dividing by zero", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("POST /api/attendance", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/attendance")
      .send({ session_id: "11111111-1111-1111-1111-111111111111", method: "qr" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({ session_id: "11111111-1111-1111-1111-111111111111", method: "qr" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a malformed session_id", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({ session_id: "not-a-uuid", method: "qr" });
    expect(res.status).toBe(400);
  });

  it("returns 400 and never writes a record when checking in before the session starts", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: FUTURE_STARTS_AT };

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({ session_id: "11111111-1111-1111-1111-111111111111", method: "qr" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't open yet/);
    expect(attendanceMock.builder.insert).not.toHaveBeenCalled();
  });

  it("allows a qr check-in exactly at or after the session's start time", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT };
    attendanceMock.result.data = {
      id: "att-1",
      session_id: "11111111-1111-1111-1111-111111111111",
      trainee_id: "trainee-1",
      method: "qr",
      match_score: null,
    };

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({ session_id: "11111111-1111-1111-1111-111111111111", method: "qr" });

    expect(res.status).toBe(201);
  });

  it("returns 403 and never writes a record when the trainee isn't enrolled in the session's programme", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT, programme_id: "prog-1" };
    nominationsMock.result.data = null;

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({ session_id: "11111111-1111-1111-1111-111111111111", method: "qr" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not enrolled/);
    expect(attendanceMock.builder.insert).not.toHaveBeenCalled();
  });

  it("refuses a face check-in too when the trainee isn't enrolled", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT, programme_id: "prog-1" };
    nominationsMock.result.data = null;
    embeddingsMock.result.data = [{ embedding: embeddingOf(1) }];

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({
        session_id: "11111111-1111-1111-1111-111111111111",
        method: "face",
        embedding: embeddingOf(1),
      });

    expect(res.status).toBe(403);
    expect(attendanceMock.builder.insert).not.toHaveBeenCalled();
  });

  it("checks enrolment against the session's own programme and the caller's own id", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT, programme_id: "prog-9" };
    attendanceMock.result.data = { id: "att-1", trainee_id: "trainee-1", method: "qr" };

    await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({ session_id: "11111111-1111-1111-1111-111111111111", method: "qr" });

    expect(nominationsMock.builder.eq).toHaveBeenCalledWith("programme_id", "prog-9");
    expect(nominationsMock.builder.eq).toHaveBeenCalledWith("trainee_id", "trainee-1");
    expect(nominationsMock.builder.eq).toHaveBeenCalledWith("status", "approved");
  });

  it("records a qr check-in", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT };
    attendanceMock.result.data = {
      id: "att-1",
      session_id: "11111111-1111-1111-1111-111111111111",
      trainee_id: "trainee-1",
      method: "qr",
      match_score: null,
    };

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({ session_id: "11111111-1111-1111-1111-111111111111", method: "qr" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ method: "qr", trainee_id: "trainee-1" });
  });

  it("returns 409 on a duplicate qr check-in", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT };
    attendanceMock.result.data = null;
    attendanceMock.result.error = { code: "23505", message: "duplicate" };

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({ session_id: "11111111-1111-1111-1111-111111111111", method: "qr" });

    expect(res.status).toBe(409);
  });

  it("returns 404 for a qr check-in against a nonexistent session", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = null; // the proactive session lookup itself finds nothing

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({ session_id: "11111111-1111-1111-1111-111111111111", method: "qr" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for a wrong-length embedding on a face check-in", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({
        session_id: "11111111-1111-1111-1111-111111111111",
        method: "face",
        embedding: [0.1, 0.2],
      });
    expect(res.status).toBe(400);
  });

  it("falls back to QR when the trainee has no enrolled embedding", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT };
    embeddingsMock.result.data = [];

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({
        session_id: "11111111-1111-1111-1111-111111111111",
        method: "face",
        embedding: embeddingOf(0.5),
      });

    expect(res.status).toBe(400);
    expect(res.body.fallbackToQr).toBe(true);
  });

  it("falls back to QR without writing a record when the match score is below threshold", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT };
    embeddingsMock.result.data = [{ embedding: embeddingOf(1) }];

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({
        session_id: "11111111-1111-1111-1111-111111111111",
        method: "face",
        embedding: embeddingOf(-1),
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matched: false, fallbackToQr: true });
    expect(attendanceMock.builder.insert).not.toHaveBeenCalled();
  });

  it("records a face check-in with a server-computed match_score when above threshold", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT };
    embeddingsMock.result.data = [{ embedding: embeddingOf(1) }];
    attendanceMock.result.data = {
      id: "att-1",
      session_id: "11111111-1111-1111-1111-111111111111",
      trainee_id: "trainee-1",
      method: "face",
      match_score: 1,
    };

    const res = await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({
        session_id: "11111111-1111-1111-1111-111111111111",
        method: "face",
        embedding: embeddingOf(1),
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ matched: true, method: "face" });
    expect(attendanceMock.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ method: "face", match_score: expect.any(Number) }),
    );
  });

  it("ignores a client-supplied match_score entirely (never trusted)", async () => {
    authenticateAs("trainee-1", "trainee");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT };
    embeddingsMock.result.data = [{ embedding: embeddingOf(1) }];
    attendanceMock.result.data = {
      id: "att-1",
      session_id: "11111111-1111-1111-1111-111111111111",
      trainee_id: "trainee-1",
      method: "face",
      match_score: 1,
    };

    await request(buildApp())
      .post("/api/attendance")
      .set("Authorization", "Bearer token")
      .send({
        session_id: "11111111-1111-1111-1111-111111111111",
        method: "face",
        embedding: embeddingOf(1),
        match_score: 0.01,
        matched: false,
      });

    expect(attendanceMock.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ match_score: expect.closeTo(1) }),
    );
  });
});

describe("POST /api/timetable/:sessionId/kiosk-face-checkin", () => {
  const url = "/api/timetable/11111111-1111-1111-1111-111111111111/kiosk-face-checkin";
  const traineeId = "22222222-2222-2222-2222-222222222222";

  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post(url)
      .send({ trainee_id: traineeId, embedding: embeddingOf(1) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee (staff-only, no self-service)", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: traineeId, embedding: embeddingOf(1) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a malformed trainee_id", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: "not-a-uuid", embedding: embeddingOf(1) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a trainer not assigned to the session's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    sessionsMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: traineeId, embedding: embeddingOf(1) });
    expect(res.status).toBe(403);
  });

  it("falls back to QR when the named trainee has no enrolled embedding", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToSession();
    embeddingsMock.result.data = [];

    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: traineeId, embedding: embeddingOf(0.5) });

    expect(res.status).toBe(400);
    expect(res.body.fallbackToQr).toBe(true);
  });

  it("falls back to QR without writing a record when the match score is below threshold", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToSession();
    embeddingsMock.result.data = [{ embedding: embeddingOf(1) }];

    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: traineeId, embedding: embeddingOf(-1) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matched: false, fallbackToQr: true });
    expect(attendanceMock.builder.insert).not.toHaveBeenCalled();
  });

  it("returns 404 and never writes a record when the named trainee isn't enrolled in the programme", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToSession();
    nominationsMock.result.data = null;
    embeddingsMock.result.data = [{ embedding: embeddingOf(1) }];

    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: traineeId, embedding: embeddingOf(1) });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not an approved nominee/);
    expect(attendanceMock.builder.insert).not.toHaveBeenCalled();
  });

  it("records a face check-in for the named trainee_id, not the caller", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToSession();
    embeddingsMock.result.data = [{ embedding: embeddingOf(1) }];
    attendanceMock.result.data = {
      id: "att-1",
      session_id: "11111111-1111-1111-1111-111111111111",
      trainee_id: traineeId,
      method: "face",
      match_score: 1,
    };

    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: traineeId, embedding: embeddingOf(1) });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ matched: true, method: "face", trainee_id: traineeId });
    expect(attendanceMock.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ trainee_id: traineeId, method: "face" }),
    );
  });

  it("returns 409 on a duplicate check-in for the same session", async () => {
    authenticateAs("admin-1", "admin");
    sessionsMock.result.data = { starts_at: PAST_STARTS_AT };
    embeddingsMock.result.data = [{ embedding: embeddingOf(1) }];
    attendanceMock.result.data = null;
    attendanceMock.result.error = { code: "23505", message: "duplicate" };

    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: traineeId, embedding: embeddingOf(1) });

    expect(res.status).toBe(409);
  });

  it("returns 400 and never writes a record when checking in before the session starts", async () => {
    authenticateAs("admin-1", "admin");
    sessionsMock.result.data = { starts_at: FUTURE_STARTS_AT };

    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: traineeId, embedding: embeddingOf(1) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't open yet/);
    expect(attendanceMock.builder.insert).not.toHaveBeenCalled();
  });

  it("returns 404 against a nonexistent session", async () => {
    authenticateAs("admin-1", "admin");
    embeddingsMock.result.data = [{ embedding: embeddingOf(1) }];
    attendanceMock.result.data = null;
    attendanceMock.result.error = { code: "23503", message: "fk violation" };

    const res = await request(buildApp())
      .post(url)
      .set("Authorization", "Bearer token")
      .send({ trainee_id: traineeId, embedding: embeddingOf(1) });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/timetable/:sessionId/qr", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/timetable/11111111-1111-1111-1111-111111111111/qr")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 for a nonexistent session", async () => {
    authenticateAs("trainer-1", "trainer");
    sessionsMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/timetable/11111111-1111-1111-1111-111111111111/qr")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns a QR data URL and the session's check-in code for trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToSession({
      id: "11111111-1111-1111-1111-111111111111",
      check_in_code: "482913",
    });

    const res = await request(buildApp())
      .get("/api/timetable/11111111-1111-1111-1111-111111111111/qr")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.checkInUrl).toContain("11111111-1111-1111-1111-111111111111");
    expect(res.body.checkInCode).toBe("482913");
  });
});

const SESSION_URL = "/api/timetable/11111111-1111-1111-1111-111111111111";
const ROSTER_TRAINEE = "22222222-2222-2222-2222-222222222222";

describe("GET /api/timetable/:sessionId/roster", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get(`${SESSION_URL}/roster`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get(`${SESSION_URL}/roster`)
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 for a nonexistent session", async () => {
    authenticateAs("admin-1", "admin");
    sessionsMock.result.data = null;

    const res = await request(buildApp())
      .get(`${SESSION_URL}/roster`)
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns 403 for a trainer not assigned to the session's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    sessionsMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .get(`${SESSION_URL}/roster`)
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("lists every approved nominee, marking an unchecked-in trainee's attendance as null", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToSession();
    nominationsMock.result.data = [
      { trainee_id: "trainee-present", profiles: { full_name: "Asha Patil" } },
      { trainee_id: "trainee-absent", profiles: { full_name: "Rakesh Kumar" } },
    ];
    attendanceMock.result.data = [
      {
        id: "att-1",
        session_id: "s1",
        trainee_id: "trainee-present",
        method: "qr",
        match_score: null,
        recorded_at: "t",
      },
    ];

    const res = await request(buildApp())
      .get(`${SESSION_URL}/roster`)
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        trainee_id: "trainee-present",
        full_name: "Asha Patil",
        attendance: {
          id: "att-1",
          session_id: "s1",
          trainee_id: "trainee-present",
          method: "qr",
          match_score: null,
          recorded_at: "t",
        },
      },
      { trainee_id: "trainee-absent", full_name: "Rakesh Kumar", attendance: null },
    ]);
  });
});

describe("PUT /api/timetable/:sessionId/attendance/:traineeId", () => {
  const url = `${SESSION_URL}/attendance/${ROSTER_TRAINEE}`;

  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).put(url);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp()).put(url).set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 for a nonexistent session", async () => {
    authenticateAs("admin-1", "admin");
    sessionsMock.result.data = null;

    const res = await request(buildApp()).put(url).set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns 403 for a trainer not assigned to the session's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    sessionsMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp()).put(url).set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the trainee is not an approved nominee for the session's programme", async () => {
    authenticateAs("admin-1", "admin");
    sessionsMock.result.data = { programme_id: "prog-1" };
    nominationsMock.result.data = null;

    const res = await request(buildApp()).put(url).set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not an approved nominee/);
  });

  it("creates a manual mark, recording who marked it, when the trainee isn't already present", async () => {
    authenticateAs("admin-1", "admin");
    sessionsMock.result.data = { programme_id: "prog-1" };
    nominationsMock.result.data = { trainee_id: ROSTER_TRAINEE };
    attendanceMock.queue.push(
      { data: null, error: null }, // no existing row
      {
        data: {
          id: "att-new",
          session_id: "11111111-1111-1111-1111-111111111111",
          trainee_id: ROSTER_TRAINEE,
          method: "manual",
          match_score: null,
          marked_by: "admin-1",
        },
        error: null,
      },
    );

    const res = await request(buildApp()).put(url).set("Authorization", "Bearer token");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      method: "manual",
      trainee_id: ROSTER_TRAINEE,
      marked_by: "admin-1",
    });
    expect(attendanceMock.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: "11111111-1111-1111-1111-111111111111",
        trainee_id: ROSTER_TRAINEE,
        method: "manual",
        marked_by: "admin-1",
      }),
    );
  });

  // Unlike the self/kiosk check-in routes, a manual mark is deliberately
  // never time-gated — staff must be able to manage the roster regardless
  // of whether the slot is in the future, ongoing, or long over.
  it("succeeds for a session scheduled in the future, unlike the self/kiosk check-in routes", async () => {
    authenticateAs("admin-1", "admin");
    sessionsMock.result.data = { programme_id: "prog-1", starts_at: FUTURE_STARTS_AT };
    nominationsMock.result.data = { trainee_id: ROSTER_TRAINEE };
    attendanceMock.queue.push(
      { data: null, error: null },
      {
        data: {
          id: "att-new",
          session_id: "11111111-1111-1111-1111-111111111111",
          trainee_id: ROSTER_TRAINEE,
          method: "manual",
          marked_by: "admin-1",
        },
        error: null,
      },
    );

    const res = await request(buildApp()).put(url).set("Authorization", "Bearer token");

    expect(res.status).toBe(201);
  });

  it("is idempotent — marking an already-present trainee returns the existing row unchanged, never overwriting its method", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToSession();
    nominationsMock.result.data = { trainee_id: ROSTER_TRAINEE };
    attendanceMock.result.data = {
      id: "att-existing",
      session_id: "11111111-1111-1111-1111-111111111111",
      trainee_id: ROSTER_TRAINEE,
      method: "face",
      match_score: 0.91,
      marked_by: null,
    };

    const res = await request(buildApp()).put(url).set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ method: "face", id: "att-existing" });
    expect(attendanceMock.builder.insert).not.toHaveBeenCalled();
  });

  it("resolves a concurrent-mark race by returning the winning row instead of erroring", async () => {
    authenticateAs("admin-1", "admin");
    sessionsMock.result.data = { programme_id: "prog-1" };
    nominationsMock.result.data = { trainee_id: ROSTER_TRAINEE };
    attendanceMock.queue.push(
      { data: null, error: null }, // no existing row seen
      { data: null, error: { code: "23505", message: "duplicate" } }, // insert lost the race
      { data: { id: "att-winner", method: "manual", trainee_id: ROSTER_TRAINEE }, error: null }, // re-fetch
    );

    const res = await request(buildApp()).put(url).set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "att-winner" });
  });
});

describe("DELETE /api/timetable/:sessionId/attendance/:traineeId", () => {
  const url = `${SESSION_URL}/attendance/${ROSTER_TRAINEE}`;

  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).delete(url);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp()).delete(url).set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a trainer not assigned to the session's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    sessionsMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp()).delete(url).set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("unmarks (deletes) whatever attendance row exists, regardless of its original method", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToSession();

    const res = await request(buildApp()).delete(url).set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
    expect(attendanceMock.builder.delete).toHaveBeenCalled();
    expect(attendanceMock.builder.eq).toHaveBeenCalledWith(
      "session_id",
      "11111111-1111-1111-1111-111111111111",
    );
    expect(attendanceMock.builder.eq).toHaveBeenCalledWith("trainee_id", ROSTER_TRAINEE);
  });

  it("returns 400 on a query error", async () => {
    authenticateAs("admin-1", "admin");
    attendanceMock.result.error = { message: "boom" };

    const res = await request(buildApp()).delete(url).set("Authorization", "Bearer token");

    expect(res.status).toBe(400);
  });
});
