import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { kioskRouter } from "./kiosk.js";

const { getUserMock, cardsMock, kiosksMock, sessionsMock, attendanceMock, fromMock } = vi.hoisted(
  () => {
    function createTableMock() {
      const result: { data: unknown; error: unknown } = { data: null, error: null };
      const builder: Record<string, ReturnType<typeof vi.fn>> = {};
      for (const method of ["select", "insert", "update", "delete", "upsert", "eq", "in", "order"]) {
        builder[method] = vi.fn(() => builder);
      }
      for (const method of ["single", "maybeSingle", "limit"]) {
        builder[method] = vi.fn(() => Promise.resolve(result));
      }
      return { builder, result };
    }

    const cardsMock = createTableMock();
    const kiosksMock = createTableMock();
    const sessionsMock = createTableMock();
    const attendanceMock = createTableMock();
    const profilesMock = createTableMock();

    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      trainee_nfc_cards: cardsMock,
      kiosk_devices: kiosksMock,
      timetable_sessions: sessionsMock,
      attendance_records: attendanceMock,
      profiles: profilesMock,
    };

    const fromMock = vi.fn((table: string) => tables[table]?.builder);
    const getUserMock = vi.fn();
    return { getUserMock, cardsMock, kiosksMock, sessionsMock, attendanceMock, profilesMock, fromMock };
  },
);

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", kioskRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  kiosksMock.result.data = null;
  kiosksMock.result.error = null;
  cardsMock.result.data = null;
  cardsMock.result.error = null;
  sessionsMock.result.data = null;
  sessionsMock.result.error = null;
  attendanceMock.result.data = null;
  attendanceMock.result.error = null;
});

describe("Kiosk NFC Attendance Routes", () => {
  const app = buildApp();
  const validKioskKey = "kiosk-test-secret-key-1234";

  it("rejects unauthenticated kiosk attendance tap check-in", async () => {
    const res = await request(app)
      .post("/api/kiosk/attendance/nfc-tap")
      .send({ card_uid: "04A1B2C3D4E5" });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Missing kiosk authorization");
  });

  it("handles valid kiosk NFC tap check-in", async () => {
    kiosksMock.result.data = {
      id: "kiosk-1",
      name: "Main Hall Reader",
      current_session_id: "session-uuid-1",
      is_active: true,
    };

    cardsMock.result.data = {
      trainee_id: "trainee-uuid-1",
      profiles: { full_name: "Aman Sharma" },
    };

    sessionsMock.result.data = {
      id: "session-uuid-1",
      programme_id: "prog-1",
      programmes: { title: "PACS Management 101" },
    };

    attendanceMock.result.data = {
      id: "record-uuid-1",
      recorded_at: "2026-09-13T10:00:00.000Z",
    };

    const res = await request(app)
      .post("/api/kiosk/attendance/nfc-tap")
      .set("x-kiosk-api-key", validKioskKey)
      .send({ card_uid: "04A1B2C3D4E5" });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe("ATTENDANCE_RECORDED");
    expect(res.body.data.trainee_name).toBe("Aman Sharma");
  });

  it("returns 404 when card UID is not bound to a trainee", async () => {
    kiosksMock.result.data = {
      id: "kiosk-1",
      name: "Main Hall Reader",
      current_session_id: "session-uuid-1",
      is_active: true,
    };

    cardsMock.result.data = null;

    const res = await request(app)
      .post("/api/kiosk/attendance/nfc-tap")
      .set("x-kiosk-api-key", validKioskKey)
      .send({ card_uid: "UNKNOWN_UID" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CARD_NOT_BOUND");
  });

  it("fetches active session information for a registered kiosk", async () => {
    kiosksMock.result.data = {
      id: "kiosk-1",
      name: "Main Hall Reader",
      current_session_id: "session-uuid-1",
      is_active: true,
    };

    sessionsMock.result.data = {
      id: "session-uuid-1",
      title: "Cooperative Banking Basics",
      start_time: "2026-09-13T10:00:00Z",
      end_time: "2026-09-13T12:00:00Z",
      programmes: { title: "Diploma in Cooperative Management" },
    };

    const res = await request(app)
      .get("/api/kiosk/session")
      .set("x-kiosk-api-key", validKioskKey);

    expect(res.status).toBe(200);
    expect(res.body.kiosk_name).toBe("Main Hall Reader");
    expect(res.body.active_session.title).toBe("Cooperative Banking Basics");
  });
});
