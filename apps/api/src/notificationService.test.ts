import { beforeEach, describe, expect, it, vi } from "vitest";

// Each table mock has two independent results: `list` for chains awaited
// directly (inserts, multi-row selects) and `single` for .maybeSingle() —
// several helpers read the same table both ways in one call (e.g. profiles:
// the admin list and one trainee's name).
const { tables, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const list: { data: unknown; error: unknown } = { data: [], error: null };
    const single: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof list) => void) => resolve(list)),
    };
    for (const method of ["select", "insert", "eq"]) builder[method] = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(single));
    return { builder, list, single };
  }
  const tables = {
    notifications: createTableMock(),
    nominations: createTableMock(),
    profiles: createTableMock(),
    programmes: createTableMock(),
    modules: createTableMock(),
    assessments: createTableMock(),
    hostel_rooms: createTableMock(),
    jobs: createTableMock(),
  };
  const fromMock = vi.fn((table: keyof typeof tables) => tables[table].builder);
  return { tables, fromMock };
});

vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: { from: fromMock } }));

import {
  notify,
  notifyAssessmentAvailable,
  notifyHostelAssigned,
  notifyLessonPublished,
  notifyNominationDecided,
  notifyNominationSubmitted,
  notifySessionScheduled,
} from "./notificationService.js";

function insertedRows() {
  const calls = tables.notifications.builder.insert.mock.calls;
  return calls.length > 0 ? (calls[calls.length - 1][0] as Record<string, unknown>[]) : null;
}

beforeEach(() => {
  for (const table of Object.values(tables)) {
    table.list.data = [];
    table.list.error = null;
    table.single.data = null;
    table.single.error = null;
    table.builder.insert.mockClear();
  }
});

describe("notify", () => {
  it("inserts one row per distinct recipient", async () => {
    await notify(["t-1", "t-2", "t-1", null], "certificate_issued", { course_title: "Basics" });

    expect(insertedRows()).toEqual([
      { recipient_id: "t-1", type: "certificate_issued", data: { course_title: "Basics" } },
      { recipient_id: "t-2", type: "certificate_issued", data: { course_title: "Basics" } },
    ]);
  });

  it("skips the insert entirely when there's no one to notify", async () => {
    await notify([], "certificate_issued", {});
    expect(tables.notifications.builder.insert).not.toHaveBeenCalled();
  });

  it("never rejects — a failed insert is logged and swallowed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tables.notifications.list.error = { message: "db down" };

    await expect(notify(["t-1"], "certificate_issued", {})).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("certificate_issued"), "db down");
    errorSpy.mockRestore();
  });
});

describe("audience resolution", () => {
  it("tells the one trainee about their nomination decision, with the programme title", async () => {
    tables.programmes.single.data = { title: "Cooperative Basics" };

    await notifyNominationDecided({ programmeId: "prog-1", traineeId: "t-1", status: "approved" });

    expect(insertedRows()).toEqual([
      {
        recipient_id: "t-1",
        type: "nomination_decided",
        data: { programme_id: "prog-1", programme_title: "Cooperative Basics", status: "approved" },
      },
    ]);
  });

  it("tells every admin about a new nomination, naming the trainee", async () => {
    tables.programmes.single.data = { title: "Cooperative Basics" };
    tables.profiles.list.data = [{ id: "admin-1" }, { id: "admin-2" }];
    tables.profiles.single.data = { full_name: "Asha Patil" };

    await notifyNominationSubmitted({ programmeId: "prog-1", traineeId: "t-1" });

    const rows = insertedRows()!;
    expect(rows.map((r) => r.recipient_id)).toEqual(["admin-1", "admin-2"]);
    expect(rows[0].data).toMatchObject({
      trainee_name: "Asha Patil",
      programme_title: "Cooperative Basics",
    });
  });

  it("tells a programme's approved trainees about a new lesson", async () => {
    tables.modules.single.data = { courses: { title: "Foundations", programme_id: "prog-1" } };
    tables.nominations.list.data = [{ trainee_id: "t-1" }, { trainee_id: "t-2" }];

    await notifyLessonPublished({
      moduleId: "mod-1",
      lessonId: "lesson-1",
      lessonTitle: "What is a Co-op?",
    });

    const rows = insertedRows()!;
    expect(rows.map((r) => r.recipient_id)).toEqual(["t-1", "t-2"]);
    expect(rows[0]).toMatchObject({
      type: "lesson_published",
      data: {
        course_title: "Foundations",
        lesson_title: "What is a Co-op?",
        programme_id: "prog-1",
      },
    });
    // Only approved nominees are the audience, not pending/rejected ones.
    expect(tables.nominations.builder.eq).toHaveBeenCalledWith("status", "approved");
  });

  it("announces an assessment with its kind, so the client can say quiz vs. test", async () => {
    tables.assessments.single.data = {
      title: "Governance Test",
      kind: "module_test",
      modules: { courses: { title: "Foundations", programme_id: "prog-1" } },
    };
    tables.nominations.list.data = [{ trainee_id: "t-1" }];

    await notifyAssessmentAvailable("assess-1");

    expect(insertedRows()![0]).toMatchObject({
      recipient_id: "t-1",
      type: "assessment_available",
      data: { assessment_id: "assess-1", assessment_title: "Governance Test", kind: "module_test" },
    });
  });

  it("includes the hostel and room in a room-assignment notification", async () => {
    tables.programmes.single.data = { title: "Cooperative Basics" };
    tables.hostel_rooms.single.data = { room_number: "101", hostels: { name: "Sahakar Bhavan" } };

    await notifyHostelAssigned({ programmeId: "prog-1", traineeId: "t-1", roomId: "room-1" });

    expect(insertedRows()![0]).toMatchObject({
      recipient_id: "t-1",
      data: { hostel_name: "Sahakar Bhavan", room_number: "101" },
    });
  });
});

describe("notifySessionScheduled", () => {
  it("announces an upcoming session to approved trainees", async () => {
    tables.programmes.single.data = { title: "Cooperative Basics" };
    tables.nominations.list.data = [{ trainee_id: "t-1" }];
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await notifySessionScheduled({
      programmeId: "prog-1",
      sessionTitle: "Orientation",
      startsAt,
      location: "Room 1",
    });

    expect(insertedRows()![0]).toMatchObject({
      recipient_id: "t-1",
      data: { session_title: "Orientation", starts_at: startsAt, location: "Room 1" },
    });
  });

  it("stays silent for a session back-filled into the past", async () => {
    tables.nominations.list.data = [{ trainee_id: "t-1" }];
    const startsAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await notifySessionScheduled({
      programmeId: "prog-1",
      sessionTitle: null,
      startsAt,
      location: null,
    });

    expect(tables.notifications.builder.insert).not.toHaveBeenCalled();
  });
});
