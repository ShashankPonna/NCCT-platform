import ExcelJS from "exceljs";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { courseMarksRouter } from "./courseMarks.js";

const { getUserMock, profilesMock, coursesMock, programmeTrainersMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const coursesMock = createTableMock();
  const programmeTrainersMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    courses: coursesMock,
    programme_trainers: programmeTrainersMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, coursesMock, programmeTrainersMock, fromMock };
});

const { getCourseMarksTallyMock, getCourseGradebookMock } = vi.hoisted(() => ({
  getCourseMarksTallyMock: vi.fn(),
  getCourseGradebookMock: vi.fn(),
}));

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

// The tally/gradebook builders are their own unit-tested module
// (assessmentScoring.test.ts) — mocked here so this file only has to prove
// the route wires auth/scoping correctly and shapes the response.
vi.mock("../assessmentScoring.js", () => ({
  getCourseMarksTally: getCourseMarksTallyMock,
  getCourseGradebook: getCourseGradebookMock,
}));

// The export's DB loader is mocked; its workbook builder is the real one, so
// the export tests below download and parse a genuine .xlsx.
const { loadGradebookExportContextMock } = vi.hoisted(() => ({
  loadGradebookExportContextMock: vi.fn(),
}));
vi.mock("../gradebookExport.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../gradebookExport.js")>()),
  loadGradebookExportContext: loadGradebookExportContextMock,
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", courseMarksRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  getCourseMarksTallyMock.mockReset();
  getCourseGradebookMock.mockReset();
  loadGradebookExportContextMock.mockReset();
  for (const mock of [profilesMock, coursesMock, programmeTrainersMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

describe("GET /api/courses/:id/marks/mine", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/courses/course-1/marks/mine");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an admin (trainee-only)", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .get("/api/courses/course-1/marks/mine")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the course doesn't exist", async () => {
    authenticateAs("trainee-1", "trainee");
    getCourseMarksTallyMock.mockResolvedValue(null);

    const res = await request(buildApp())
      .get("/api/courses/course-1/marks/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns the caller's own tally, never a body-supplied trainee id", async () => {
    authenticateAs("trainee-1", "trainee");
    const tally = { course_id: "course-1", totals: { marks_obtained: 8, total_marks: 10 } };
    getCourseMarksTallyMock.mockResolvedValue(tally);

    const res = await request(buildApp())
      .get("/api/courses/course-1/marks/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(tally);
    expect(getCourseMarksTallyMock).toHaveBeenCalledWith("course-1", "trainee-1");
  });

  it("returns 400 when the tally computation throws", async () => {
    authenticateAs("trainee-1", "trainee");
    getCourseMarksTallyMock.mockRejectedValue(new Error("boom"));

    const res = await request(buildApp())
      .get("/api/courses/course-1/marks/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(400);
  });
});

describe("GET /api/courses/:id/gradebook", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a trainer not assigned to the course's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    coursesMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(403);
    expect(getCourseGradebookMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the course doesn't exist, for an admin", async () => {
    authenticateAs("admin-1", "admin");
    getCourseGradebookMock.mockResolvedValue(null);

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns the gradebook for a trainer assigned to the course's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    coursesMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = { trainer_id: "trainer-1" };
    const gradebook = { course_id: "course-1", rows: [{ trainee_id: "t-1", full_name: "Asha" }] };
    getCourseGradebookMock.mockResolvedValue(gradebook);

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(gradebook);
    expect(getCourseGradebookMock).toHaveBeenCalledWith("course-1");
  });
});

describe("GET /api/courses/:id/gradebook/export", () => {
  const gradebook = {
    course_id: "course-1",
    course_title: "Foundations",
    assessments: [
      { id: "t1", title: "Governance Test", module_title: "Governance", kind: "module_test", total_marks: 30, pass_threshold_percent: 60 },
    ],
    rows: [
      {
        trainee_id: "t-1",
        full_name: "Asha Patil",
        cells: { t1: { best_marks_obtained: 30, best_total_marks: 30, best_score_percent: 100, passed: true, attempts: 1 } },
        totals: { marks_obtained: 30, total_marks: 30, score_percent: 100, module_tests_passed: 1, module_tests_total: 1 },
        certificate_code: "EDU-ABC12345",
      },
    ],
  };

  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/courses/course-1/gradebook/export");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook/export")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a trainer not assigned to the course's programme — no file produced", async () => {
    authenticateAs("trainer-2", "trainer");
    coursesMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook/export")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(403);
    expect(getCourseGradebookMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the course doesn't exist", async () => {
    authenticateAs("admin-1", "admin");
    getCourseGradebookMock.mockResolvedValue(null);

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook/export")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("streams a real .xlsx for the assigned trainer, named after the course and prepared in their name", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "trainer-1" } }, error: null });
    profilesMock.result.data = { role: "trainer", full_name: "Rajesh Kumar" };
    coursesMock.result.data = { programme_id: "prog-1" };
    programmeTrainersMock.result.data = { trainer_id: "trainer-1" };
    getCourseGradebookMock.mockResolvedValue(gradebook);
    loadGradebookExportContextMock.mockResolvedValue({
      programmeTitle: "Cooperative Management Basics",
      institutionName: "VAMNICOM Pune",
      affiliations: { "t-1": "Village PACS" },
    });

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook/export")
      .set("Authorization", "Bearer token")
      .responseType("blob");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="Gradebook - Foundations - \d{4}-\d{2}-\d{2}\.xlsx"/);
    expect(loadGradebookExportContextMock).toHaveBeenCalledWith("course-1", ["t-1"]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Gradebook")!;
    expect(String(sheet.getCell("A3").value)).toContain("Rajesh Kumar");
    expect(sheet.getRow(6).getCell(2).value).toBe("Asha Patil");
    expect(sheet.getRow(6).getCell(3).value).toBe("Village PACS");
    expect(sheet.getRow(6).getCell(4).value).toBe(30);
  });

  it("renders Hindi labels with ?lang=hi", async () => {
    authenticateAs("admin-1", "admin");
    getCourseGradebookMock.mockResolvedValue(gradebook);
    loadGradebookExportContextMock.mockResolvedValue({ programmeTitle: null, institutionName: null, affiliations: {} });

    const res = await request(buildApp())
      .get("/api/courses/course-1/gradebook/export?lang=hi")
      .set("Authorization", "Bearer token")
      .responseType("blob");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
    expect(workbook.getWorksheet("अंक पुस्तिका")).toBeTruthy();
  });
});
