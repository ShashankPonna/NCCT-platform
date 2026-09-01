import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { timetableRouter } from "./timetable.js";

const { getUserMock, profilesMock, timetableMock, fromMock } = vi.hoisted(() => {
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
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    timetable_sessions: timetableMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, timetableMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

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
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  timetableMock.result.data = null;
  timetableMock.result.error = null;
});

describe("POST /api/programmes/:id/timetable", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .send(validSession);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin role", async () => {
    authenticateAs("trainee-1", "trainee");

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send(validSession);

    expect(res.status).toBe(403);
  });

  it("returns 400 when ends_at is before starts_at", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send({ ...validSession, starts_at: validSession.ends_at, ends_at: validSession.starts_at });

    expect(res.status).toBe(400);
  });

  it("creates the session for an admin", async () => {
    authenticateAs("admin-1", "admin");
    timetableMock.result.data = { id: "sess-1", programme_id: "prog-1", ...validSession };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/timetable")
      .set("Authorization", "Bearer token")
      .send(validSession);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "sess-1", programme_id: "prog-1" });
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
});
