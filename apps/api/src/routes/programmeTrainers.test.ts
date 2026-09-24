import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { programmeTrainersRouter } from "./programmeTrainers.js";

const { getUserMock, profilesMock, programmeTrainersMock, fromMock } = vi.hoisted(() => {
  // `then` on the builder itself, plus a `queue` of per-call overrides
  // (shifted off on each await, `result` as the steady-state fallback once
  // it's empty) — needed for `profiles`, which this router queries twice per
  // request for two different reasons: once by requireAuth (the caller's own
  // role) and once inside POST's handler (whether trainer_id names a real
  // trainer). Same pattern as attendance.test.ts.
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const queue: { data: unknown; error: unknown }[] = [];
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(queue.shift() ?? result)),
    };
    for (const method of ["select", "insert", "delete", "eq", "order", "single", "maybeSingle"]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result, queue };
  }

  const profilesMock = createTableMock();
  const programmeTrainersMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    programme_trainers: programmeTrainersMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, programmeTrainersMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", programmeTrainersRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  // Consumed by requireAuth's own profile read — the queue's first entry.
  profilesMock.queue.push({ data: { role }, error: null });
}

beforeEach(() => {
  getUserMock.mockReset();
  for (const mock of [profilesMock, programmeTrainersMock]) {
    mock.result.data = null;
    mock.result.error = null;
    mock.queue.length = 0;
  }
});

describe("POST /api/programmes/:id/trainers", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/programmes/prog-1/trainers")
      .send({ trainer_id: "22222222-2222-2222-2222-222222222222" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainer (admin-only)", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/programmes/prog-1/trainers")
      .set("Authorization", "Bearer token")
      .send({ trainer_id: "22222222-2222-2222-2222-222222222222" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a malformed trainer_id", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/programmes/prog-1/trainers")
      .set("Authorization", "Bearer token")
      .send({ trainer_id: "not-a-uuid" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when trainer_id isn't an existing trainer account", async () => {
    authenticateAs("admin-1", "admin");
    profilesMock.queue.push({ data: { role: "trainee" }, error: null });

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/trainers")
      .set("Authorization", "Bearer token")
      .send({ trainer_id: "22222222-2222-2222-2222-222222222222" });
    expect(res.status).toBe(400);
  });

  it("assigns the trainer for an admin", async () => {
    authenticateAs("admin-1", "admin");
    profilesMock.queue.push({ data: { role: "trainer" }, error: null });
    programmeTrainersMock.result.data = {
      programme_id: "prog-1",
      trainer_id: "22222222-2222-2222-2222-222222222222",
      assigned_by: "admin-1",
      assigned_at: "2026-09-24T00:00:00.000Z",
    };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/trainers")
      .set("Authorization", "Bearer token")
      .send({ trainer_id: "22222222-2222-2222-2222-222222222222" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ programme_id: "prog-1" });
  });

  it("returns 409 when the trainer is already assigned", async () => {
    authenticateAs("admin-1", "admin");
    profilesMock.queue.push({ data: { role: "trainer" }, error: null });
    programmeTrainersMock.result.data = null;
    programmeTrainersMock.result.error = { code: "23505", message: "duplicate key" };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/trainers")
      .set("Authorization", "Bearer token")
      .send({ trainer_id: "22222222-2222-2222-2222-222222222222" });

    expect(res.status).toBe(409);
  });

  it("returns 404 when the programme doesn't exist", async () => {
    authenticateAs("admin-1", "admin");
    profilesMock.queue.push({ data: { role: "trainer" }, error: null });
    programmeTrainersMock.result.data = null;
    programmeTrainersMock.result.error = { code: "23503", message: "fk violation" };

    const res = await request(buildApp())
      .post("/api/programmes/missing/trainers")
      .set("Authorization", "Bearer token")
      .send({ trainer_id: "22222222-2222-2222-2222-222222222222" });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/programmes/:id/trainers", () => {
  it("returns 403 for a trainer (admin-only)", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .get("/api/programmes/prog-1/trainers")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("lists assigned trainers with their display name for an admin", async () => {
    authenticateAs("admin-1", "admin");
    programmeTrainersMock.result.data = [
      {
        programme_id: "prog-1",
        trainer_id: "trainer-1",
        assigned_by: "admin-1",
        assigned_at: "2026-09-24T00:00:00.000Z",
        profiles: { full_name: "Asha Patil" },
      },
    ];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/trainers")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        programme_id: "prog-1",
        trainer_id: "trainer-1",
        assigned_by: "admin-1",
        assigned_at: "2026-09-24T00:00:00.000Z",
        full_name: "Asha Patil",
      },
    ]);
  });
});

describe("DELETE /api/programmes/:id/trainers/:trainerId", () => {
  it("returns 403 for a trainer (admin-only)", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .delete("/api/programmes/prog-1/trainers/trainer-1")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 when no such assignment exists", async () => {
    authenticateAs("admin-1", "admin");
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .delete("/api/programmes/prog-1/trainers/trainer-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("unassigns the trainer for an admin", async () => {
    authenticateAs("admin-1", "admin");
    programmeTrainersMock.result.data = { programme_id: "prog-1", trainer_id: "trainer-1" };

    const res = await request(buildApp())
      .delete("/api/programmes/prog-1/trainers/trainer-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
  });
});

describe("GET /api/trainers/me/programmes", () => {
  it("returns 403 for an admin (trainer-only)", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .get("/api/trainers/me/programmes")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns the caller's own assigned programme ids", async () => {
    authenticateAs("trainer-1", "trainer");
    programmeTrainersMock.result.data = [{ programme_id: "prog-1" }, { programme_id: "prog-2" }];

    const res = await request(buildApp())
      .get("/api/trainers/me/programmes")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(["prog-1", "prog-2"]);
  });
});
