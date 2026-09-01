import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attendanceRouter, cosineSimilarity } from "./attendance.js";

const { getUserMock, profilesMock, attendanceMock, embeddingsMock, sessionsMock, fromMock } =
  vi.hoisted(() => {
    function createTableMock() {
      const result: { data: unknown; error: unknown } = { data: null, error: null };
      const builder: Record<string, ReturnType<typeof vi.fn>> = {};
      for (const method of ["select", "insert", "update", "delete", "upsert", "eq"]) {
        builder[method] = vi.fn(() => builder);
      }
      for (const method of ["single", "maybeSingle", "order", "limit"]) {
        builder[method] = vi.fn(() => Promise.resolve(result));
      }
      return { builder, result };
    }

    const profilesMock = createTableMock();
    const attendanceMock = createTableMock();
    const embeddingsMock = createTableMock();
    const sessionsMock = createTableMock();
    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      profiles: profilesMock,
      attendance_records: attendanceMock,
      face_embeddings: embeddingsMock,
      timetable_sessions: sessionsMock,
    };
    const fromMock = vi.fn((table: string) => tables[table].builder);
    const getUserMock = vi.fn();
    return { getUserMock, profilesMock, attendanceMock, embeddingsMock, sessionsMock, fromMock };
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

beforeEach(() => {
  getUserMock.mockReset();
  for (const mock of [profilesMock, attendanceMock, embeddingsMock, sessionsMock]) {
    mock.builder.insert.mockClear();
    mock.result.data = null;
    mock.result.error = null;
  }
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

  it("records a qr check-in", async () => {
    authenticateAs("trainee-1", "trainee");
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
    attendanceMock.result.data = null;
    attendanceMock.result.error = { code: "23503", message: "fk violation" };

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

describe("GET /api/timetable/:sessionId/attendance", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get(
      "/api/timetable/11111111-1111-1111-1111-111111111111/attendance",
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/timetable/11111111-1111-1111-1111-111111111111/attendance")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns the roster for admin", async () => {
    authenticateAs("admin-1", "admin");
    attendanceMock.result.data = [{ id: "att-1", method: "qr" }];

    const res = await request(buildApp())
      .get("/api/timetable/11111111-1111-1111-1111-111111111111/attendance")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "att-1", method: "qr" }]);
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

  it("returns a QR data URL for trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    sessionsMock.result.data = { id: "11111111-1111-1111-1111-111111111111" };

    const res = await request(buildApp())
      .get("/api/timetable/11111111-1111-1111-1111-111111111111/qr")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.checkInUrl).toContain("11111111-1111-1111-1111-111111111111");
  });
});
