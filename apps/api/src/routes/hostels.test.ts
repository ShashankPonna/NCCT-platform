import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hostelsRouter } from "./hostels.js";

const { getUserMock, fromMock, mocks } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "insert", "update", "upsert", "delete", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const mocks = {
    profiles: createTableMock(),
    hostels: createTableMock(),
    hostel_rooms: createTableMock(),
    trainee_hostel_assignments: createTableMock(),
    programmes: createTableMock(),
    nominations: createTableMock(),
  };
  const fromMock = vi.fn((table: keyof typeof mocks) => mocks[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, fromMock, mocks };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", hostelsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.profiles.result.data = { role };
}

const ROOM_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  getUserMock.mockReset();
  for (const mock of Object.values(mocks)) {
    mock.result.data = null;
    mock.result.error = null;
  }
  mocks.trainee_hostel_assignments.builder.upsert.mockClear();
});

describe("GET /api/institutions/:id/hostels", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/institutions/inst-1/hostels")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(403);
  });

  it("lists hostels with rooms sorted by room number for an admin", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostels.result.data = [
      {
        id: "h-1",
        name: "Main Hostel",
        hostel_rooms: [
          { id: "r-10", room_number: "10" },
          { id: "r-2", room_number: "2" },
        ],
      },
    ];

    const res = await request(buildApp())
      .get("/api/institutions/inst-1/hostels")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(200);
    expect(res.body[0].hostel_rooms.map((r: { room_number: string }) => r.room_number)).toEqual([
      "2",
      "10",
    ]);
  });
});

describe("POST /api/institutions/:id/hostels", () => {
  it("returns 400 for a missing name", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/institutions/inst-1/hostels")
      .set("Authorization", "Bearer t")
      .send({ notes: "no name" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the institution doesn't exist", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostels.result.error = { code: "23503", message: "fk" };
    const res = await request(buildApp())
      .post("/api/institutions/missing/hostels")
      .set("Authorization", "Bearer t")
      .send({ name: "Main Hostel" });
    expect(res.status).toBe(404);
  });

  it("creates a hostel for an admin", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostels.result.data = { id: "h-1", institution_id: "inst-1", name: "Main Hostel" };
    const res = await request(buildApp())
      .post("/api/institutions/inst-1/hostels")
      .set("Authorization", "Bearer t")
      .send({ name: "Main Hostel" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Main Hostel");
  });
});

describe("PATCH/DELETE /api/hostels/:id", () => {
  it("returns 400 for an empty update", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .patch("/api/hostels/h-1")
      .set("Authorization", "Bearer t")
      .send({});
    expect(res.status).toBe(400);
  });

  it("renames a hostel", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostels.result.data = { id: "h-1", name: "Renamed" };
    const res = await request(buildApp())
      .patch("/api/hostels/h-1")
      .set("Authorization", "Bearer t")
      .send({ name: "Renamed" });
    expect(res.status).toBe(200);
  });

  it("returns 404 renaming a hostel that doesn't exist", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .patch("/api/hostels/missing")
      .set("Authorization", "Bearer t")
      .send({ name: "Renamed" });
    expect(res.status).toBe(404);
  });

  it("returns 409 deleting a hostel whose rooms still have trainees assigned", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostels.result.error = { code: "23503", message: "still referenced" };
    const res = await request(buildApp())
      .delete("/api/hostels/h-1")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(409);
  });

  it("deletes an empty hostel", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostels.result.data = { id: "h-1" };
    const res = await request(buildApp())
      .delete("/api/hostels/h-1")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(204);
  });
});

describe("rooms", () => {
  it("returns 400 for an invalid room type", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/hostels/h-1/rooms")
      .set("Authorization", "Bearer t")
      .send({ room_number: "101", type: "penthouse" });
    expect(res.status).toBe(400);
  });

  it("returns 409 for a duplicate room number in the same hostel", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostel_rooms.result.error = { code: "23505", message: "duplicate" };
    const res = await request(buildApp())
      .post("/api/hostels/h-1/rooms")
      .set("Authorization", "Bearer t")
      .send({ room_number: "101", type: "shared" });
    expect(res.status).toBe(409);
  });

  it("creates a room", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostel_rooms.result.data = { id: "r-1", room_number: "101", type: "shared", capacity: 2 };
    const res = await request(buildApp())
      .post("/api/hostels/h-1/rooms")
      .set("Authorization", "Bearer t")
      .send({ room_number: "101", type: "shared", capacity: 2 });
    expect(res.status).toBe(201);
  });

  it("returns 409 deleting a room that still has a trainee assigned", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostel_rooms.result.error = { code: "23503", message: "still referenced" };
    const res = await request(buildApp())
      .delete("/api/hostel-rooms/r-1")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(409);
  });

  it("updates a room", async () => {
    authenticateAs("admin-1", "admin");
    mocks.hostel_rooms.result.data = { id: "r-1", capacity: 4 };
    const res = await request(buildApp())
      .patch("/api/hostel-rooms/r-1")
      .set("Authorization", "Bearer t")
      .send({ capacity: 4 });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/programmes/:id/hostel-assignments/:traineeId", () => {
  it("returns 403 for a trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .put("/api/programmes/prog-1/hostel-assignments/trainee-1")
      .set("Authorization", "Bearer t")
      .send({ room_id: ROOM_ID });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the trainee isn't an approved nominee", async () => {
    authenticateAs("admin-1", "admin");
    mocks.nominations.result.data = null;
    const res = await request(buildApp())
      .put("/api/programmes/prog-1/hostel-assignments/trainee-1")
      .set("Authorization", "Bearer t")
      .send({ room_id: ROOM_ID });
    expect(res.status).toBe(404);
    expect(mocks.trainee_hostel_assignments.builder.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 when the room belongs to another institution's hostel", async () => {
    authenticateAs("admin-1", "admin");
    mocks.nominations.result.data = { id: "nom-1" };
    mocks.programmes.result.data = { institution_id: "inst-1" };
    mocks.hostel_rooms.result.data = { id: ROOM_ID, hostels: { institution_id: "inst-OTHER" } };
    const res = await request(buildApp())
      .put("/api/programmes/prog-1/hostel-assignments/trainee-1")
      .set("Authorization", "Bearer t")
      .send({ room_id: ROOM_ID });
    expect(res.status).toBe(400);
    expect(mocks.trainee_hostel_assignments.builder.upsert).not.toHaveBeenCalled();
  });

  it("assigns the room for an approved nominee in the same institution", async () => {
    authenticateAs("admin-1", "admin");
    mocks.nominations.result.data = { id: "nom-1" };
    mocks.programmes.result.data = { institution_id: "inst-1" };
    mocks.hostel_rooms.result.data = { id: ROOM_ID, hostels: { institution_id: "inst-1" } };
    mocks.trainee_hostel_assignments.result.data = {
      id: "a-1",
      room_id: ROOM_ID,
      trainee_id: "trainee-1",
    };

    const res = await request(buildApp())
      .put("/api/programmes/prog-1/hostel-assignments/trainee-1")
      .set("Authorization", "Bearer t")
      .send({ room_id: ROOM_ID, notes: "Ground floor" });

    expect(res.status).toBe(200);
    expect(mocks.trainee_hostel_assignments.builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        trainee_id: "trainee-1",
        room_id: ROOM_ID,
        assigned_by: "admin-1",
      }),
      { onConflict: "trainee_id,programme_id" },
    );
  });
});

describe("DELETE /api/programmes/:id/hostel-assignments/:traineeId", () => {
  it("returns 404 when nothing was assigned", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .delete("/api/programmes/prog-1/hostel-assignments/trainee-1")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(404);
  });

  it("unassigns a room", async () => {
    authenticateAs("admin-1", "admin");
    mocks.trainee_hostel_assignments.result.data = { id: "a-1" };
    const res = await request(buildApp())
      .delete("/api/programmes/prog-1/hostel-assignments/trainee-1")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(204);
  });
});

describe("GET /api/hostel-assignments/mine", () => {
  it("returns 403 for an admin", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .get("/api/hostel-assignments/mine")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(403);
  });

  it("flattens the trainee's own assignments", async () => {
    authenticateAs("trainee-1", "trainee");
    mocks.trainee_hostel_assignments.result.data = [
      {
        programme_id: "prog-1",
        assigned_on: "2026-09-25T00:00:00.000Z",
        notes: null,
        programmes: { title: "Cooperative Management Basics" },
        hostel_rooms: { room_number: "101", type: "shared", hostels: { name: "Main Hostel" } },
      },
    ];

    const res = await request(buildApp())
      .get("/api/hostel-assignments/mine")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
      programme_id: "prog-1",
      programme_title: "Cooperative Management Basics",
      hostel_name: "Main Hostel",
      room_number: "101",
      room_type: "shared",
      assigned_on: "2026-09-25T00:00:00.000Z",
      notes: null,
    });
  });
});
