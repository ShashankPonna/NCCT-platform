import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nominationsRouter } from "./nominations.js";

const {
  getUserMock,
  profilesMock,
  nominationsMock,
  assignmentsMock,
  programmesMock,
  roomsMock,
  fromMock,
} = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      // Lets a chain with no terminal .single()/.maybeSingle()/.order() (the
      // hostel-assignments read in GET nominations) resolve when awaited.
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of ["select", "insert", "update", "upsert", "delete", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const nominationsMock = createTableMock();
  const assignmentsMock = createTableMock();
  const programmesMock = createTableMock();
  const roomsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    nominations: nominationsMock,
    trainee_hostel_assignments: assignmentsMock,
    programmes: programmesMock,
    hostel_rooms: roomsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return {
    getUserMock,
    profilesMock,
    nominationsMock,
    assignmentsMock,
    programmesMock,
    roomsMock,
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
  app.use("/api", nominationsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  for (const fn of Object.values(notificationMocks)) fn.mockClear();
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  nominationsMock.result.data = null;
  nominationsMock.result.error = null;
  for (const mock of [assignmentsMock, programmesMock, roomsMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
  assignmentsMock.builder.upsert.mockClear();
  nominationsMock.builder.update.mockClear();
});

const ROOM_ID = "11111111-1111-4111-8111-111111111111";

describe("POST /api/programmes/:id/nominations", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/programmes/prog-1/nominations");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee role", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(403);
  });

  it("creates a self-nomination for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    nominationsMock.result.data = {
      id: "nom-1",
      programme_id: "prog-1",
      trainee_id: "trainee-1",
      status: "pending",
    };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "pending", trainee_id: "trainee-1" });
    expect(notificationMocks.notifyNominationSubmitted).toHaveBeenCalledWith({
      programmeId: "prog-1",
      traineeId: "trainee-1",
    });
  });

  it("returns 409 when already nominated", async () => {
    authenticateAs("trainee-1", "trainee");
    nominationsMock.result.data = null;
    nominationsMock.result.error = { code: "23505", message: "duplicate key" };

    const res = await request(buildApp())
      .post("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(409);
  });
});

describe("GET /api/programmes/:id/nominations", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(403);
  });

  it("lists nominations for an admin, denormalizing the trainee's profile", async () => {
    authenticateAs("admin-1", "admin");
    nominationsMock.result.data = [
      {
        id: "nom-1",
        status: "pending",
        trainee_id: "trainee-1",
        profiles: {
          full_name: "Asha Patil",
          phone: "9876543210",
          cooperative_affiliation: "Village PACS",
        },
      },
    ];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: "nom-1",
      trainee_name: "Asha Patil",
      trainee_phone: "9876543210",
      trainee_cooperative_affiliation: "Village PACS",
      hostel_room_id: null,
      hostel_name: null,
      hostel_room_number: null,
    });
    // The raw embedded relation is never echoed back to the client.
    expect(res.body[0]).not.toHaveProperty("profiles");
  });

  it("falls back to null fields when the trainee has no profile data to show", async () => {
    authenticateAs("admin-1", "admin");
    nominationsMock.result.data = [{ id: "nom-1", status: "pending", profiles: null }];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      trainee_name: null,
      trainee_phone: null,
      trainee_cooperative_affiliation: null,
    });
  });

  it("also lists nominations for a trainer (read-only roster access)", async () => {
    authenticateAs("trainer-1", "trainer");
    nominationsMock.result.data = [{ id: "nom-1", status: "pending", profiles: null }];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/programmes/:id/nominations — hostel assignment", () => {
  it("merges a trainee's assigned hostel room onto their nomination", async () => {
    authenticateAs("admin-1", "admin");
    nominationsMock.result.data = [
      { id: "nom-1", status: "approved", trainee_id: "trainee-1", profiles: null },
      { id: "nom-2", status: "approved", trainee_id: "trainee-2", profiles: null },
    ];
    assignmentsMock.result.data = [
      {
        trainee_id: "trainee-1",
        room_id: ROOM_ID,
        hostel_rooms: { room_number: "101", hostels: { name: "Main Hostel" } },
      },
    ];

    const res = await request(buildApp())
      .get("/api/programmes/prog-1/nominations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      hostel_room_id: ROOM_ID,
      hostel_name: "Main Hostel",
      hostel_room_number: "101",
    });
    expect(res.body[1]).toMatchObject({ hostel_room_id: null, hostel_name: null });
  });
});

describe("PATCH /api/programmes/:id/nominations/:nominationId", () => {
  it("returns 400 when a room is sent with a non-approval decision", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "waitlisted", hostel_room_id: ROOM_ID });

    expect(res.status).toBe(400);
  });

  it("refuses a room from another institution without approving the nomination", async () => {
    authenticateAs("admin-1", "admin");
    programmesMock.result.data = { institution_id: "inst-1" };
    roomsMock.result.data = { id: ROOM_ID, hostels: { institution_id: "inst-OTHER" } };

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "approved", hostel_room_id: ROOM_ID });

    expect(res.status).toBe(400);
    expect(nominationsMock.builder.update).not.toHaveBeenCalled();
    expect(assignmentsMock.builder.upsert).not.toHaveBeenCalled();
  });

  it("approves and assigns the room in one action", async () => {
    authenticateAs("admin-1", "admin");
    programmesMock.result.data = { institution_id: "inst-1" };
    roomsMock.result.data = { id: ROOM_ID, hostels: { institution_id: "inst-1" } };
    nominationsMock.result.data = { id: "nom-1", status: "approved", trainee_id: "trainee-1" };
    assignmentsMock.result.data = { id: "a-1", trainee_id: "trainee-1", room_id: ROOM_ID };

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "approved", hostel_room_id: ROOM_ID, hostel_notes: "Ground floor" });

    expect(res.status).toBe(200);
    expect(assignmentsMock.builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        trainee_id: "trainee-1",
        programme_id: "prog-1",
        room_id: ROOM_ID,
        notes: "Ground floor",
        assigned_by: "admin-1",
      }),
      { onConflict: "trainee_id,programme_id" },
    );
  });

  it("approves without touching hostel assignments when no room is picked", async () => {
    authenticateAs("admin-1", "admin");
    nominationsMock.result.data = { id: "nom-1", status: "approved", trainee_id: "trainee-1" };

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "approved" });

    expect(res.status).toBe(200);
    expect(assignmentsMock.builder.upsert).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin role", async () => {
    authenticateAs("trainee-1", "trainee");

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "approved" });

    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid status", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "pending" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when the nomination doesn't exist", async () => {
    authenticateAs("admin-1", "admin");
    nominationsMock.result.data = null;

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "approved" });

    expect(res.status).toBe(404);
    expect(notificationMocks.notifyNominationDecided).not.toHaveBeenCalled();
  });

  it("approves the nomination for an admin", async () => {
    authenticateAs("admin-1", "admin");
    nominationsMock.result.data = {
      id: "nom-1",
      status: "approved",
      trainee_id: "trainee-1",
      decided_at: "2026-09-01T00:00:00.000Z",
    };

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1/nominations/nom-1")
      .set("Authorization", "Bearer token")
      .send({ status: "approved" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(notificationMocks.notifyNominationDecided).toHaveBeenCalledWith({
      programmeId: "prog-1",
      traineeId: "trainee-1",
      status: "approved",
    });
  });
});

describe("GET /api/nominations/mine", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/nominations/mine");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .get("/api/nominations/mine")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns the trainee's own nominations with the programme embedded", async () => {
    authenticateAs("trainee-1", "trainee");
    nominationsMock.result.data = [
      {
        id: "nom-1",
        programme_id: "prog-1",
        trainee_id: "trainee-1",
        status: "approved",
        nominated_at: "2026-09-01T00:00:00.000Z",
        programmes: {
          title: "Cooperative Management Basics",
          mode: "online",
          start_date: "2026-10-01",
          end_date: "2026-10-30",
        },
      },
    ];

    const res = await request(buildApp())
      .get("/api/nominations/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      status: "approved",
      programmes: { title: "Cooperative Management Basics", mode: "online" },
    });
  });

  it("returns an empty list (not 404) when the trainee has nominated for nothing", async () => {
    authenticateAs("trainee-1", "trainee");
    nominationsMock.result.data = [];

    const res = await request(buildApp())
      .get("/api/nominations/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
