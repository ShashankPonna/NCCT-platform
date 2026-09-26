import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProgrammeIdForAssessment,
  getProgrammeIdForAssessmentQuestion,
  getProgrammeIdForCourse,
  getProgrammeIdForLesson,
  getProgrammeIdForModule,
  getProgrammeIdForSession,
  isTrainerAssignedToProgramme,
  requireProgrammeAccess,
} from "./programmeAccess.js";

const { getTableMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    return { builder, result };
  }

  const tables = new Map<string, ReturnType<typeof createTableMock>>();
  function getTableMock(table: string) {
    if (!tables.has(table)) tables.set(table, createTableMock());
    return tables.get(table)!;
  }
  const fromMock = vi.fn((table: string) => getTableMock(table).builder);
  return { getTableMock, fromMock };
});

vi.mock("./supabaseClient.js", () => ({
  supabaseAdmin: { from: fromMock },
}));

beforeEach(() => {
  fromMock.mockClear();
});

describe("isTrainerAssignedToProgramme", () => {
  it("is true when a row exists", async () => {
    getTableMock("programme_trainers").result.data = { trainer_id: "trainer-1" };
    expect(await isTrainerAssignedToProgramme("trainer-1", "prog-1")).toBe(true);
  });

  it("is false when no row exists", async () => {
    getTableMock("programme_trainers").result.data = null;
    expect(await isTrainerAssignedToProgramme("trainer-1", "prog-1")).toBe(false);
  });
});

describe("getProgrammeIdForCourse", () => {
  it("returns the course's programme_id", async () => {
    getTableMock("courses").result.data = { programme_id: "prog-1" };
    expect(await getProgrammeIdForCourse("course-1")).toBe("prog-1");
  });

  it("returns null when the course doesn't exist", async () => {
    getTableMock("courses").result.data = null;
    expect(await getProgrammeIdForCourse("missing")).toBeNull();
  });
});

describe("getProgrammeIdForModule", () => {
  it("walks the embedded courses.programme_id", async () => {
    getTableMock("modules").result.data = { courses: { programme_id: "prog-1" } };
    expect(await getProgrammeIdForModule("mod-1")).toBe("prog-1");
  });

  it("returns null when the module doesn't exist", async () => {
    getTableMock("modules").result.data = null;
    expect(await getProgrammeIdForModule("missing")).toBeNull();
  });
});

describe("getProgrammeIdForLesson", () => {
  it("walks modules.courses.programme_id", async () => {
    getTableMock("lessons").result.data = { modules: { courses: { programme_id: "prog-1" } } };
    expect(await getProgrammeIdForLesson("lesson-1")).toBe("prog-1");
  });

  it("returns null when the lesson doesn't exist", async () => {
    getTableMock("lessons").result.data = null;
    expect(await getProgrammeIdForLesson("missing")).toBeNull();
  });
});

describe("getProgrammeIdForAssessment", () => {
  it("walks modules.courses.programme_id", async () => {
    getTableMock("assessments").result.data = { modules: { courses: { programme_id: "prog-1" } } };
    expect(await getProgrammeIdForAssessment("assess-1")).toBe("prog-1");
  });

  it("returns null when the assessment doesn't exist", async () => {
    getTableMock("assessments").result.data = null;
    expect(await getProgrammeIdForAssessment("missing")).toBeNull();
  });
});

describe("getProgrammeIdForAssessmentQuestion", () => {
  it("walks assessments.modules.courses.programme_id", async () => {
    getTableMock("assessment_questions").result.data = {
      assessments: { modules: { courses: { programme_id: "prog-1" } } },
    };
    expect(await getProgrammeIdForAssessmentQuestion("q-1")).toBe("prog-1");
  });

  it("returns null when the question doesn't exist", async () => {
    getTableMock("assessment_questions").result.data = null;
    expect(await getProgrammeIdForAssessmentQuestion("missing")).toBeNull();
  });
});

describe("getProgrammeIdForSession", () => {
  it("returns the session's programme_id", async () => {
    getTableMock("timetable_sessions").result.data = { programme_id: "prog-1" };
    expect(await getProgrammeIdForSession("sess-1")).toBe("prog-1");
  });

  it("returns null when the session doesn't exist", async () => {
    getTableMock("timetable_sessions").result.data = null;
    expect(await getProgrammeIdForSession("missing")).toBeNull();
  });
});

describe("requireProgrammeAccess", () => {
  function mockReqRes(role: "admin" | "trainer", userId = "trainer-1") {
    const req = { user: { id: userId, role, full_name: null } } as unknown as Request;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status } as unknown as Response;
    const next = vi.fn();
    return { req, res, status, json, next };
  }

  it("lets an admin through without resolving a programme id at all", async () => {
    const resolve = vi.fn();
    const { req, res, next } = mockReqRes("admin");

    await requireProgrammeAccess(resolve)(req, res, next);

    expect(resolve).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("404s when the resolver can't find the underlying resource", async () => {
    const resolve = vi.fn().mockResolvedValue(null);
    const { req, res, status, next } = mockReqRes("trainer");

    await requireProgrammeAccess(resolve)(req, res, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s a trainer who isn't assigned to the resolved programme", async () => {
    getTableMock("programme_trainers").result.data = null;
    const resolve = vi.fn().mockResolvedValue("prog-1");
    const { req, res, status, next } = mockReqRes("trainer");

    await requireProgrammeAccess(resolve)(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("lets a trainer through once assigned to the resolved programme", async () => {
    getTableMock("programme_trainers").result.data = { trainer_id: "trainer-1" };
    const resolve = vi.fn().mockResolvedValue("prog-1");
    const { req, res, next } = mockReqRes("trainer");

    await requireProgrammeAccess(resolve)(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
