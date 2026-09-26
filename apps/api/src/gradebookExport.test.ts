import type { CourseGradebook } from "@ncct/shared-types";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

// Only the pure builder is exercised here; the module's DB loader imports
// supabaseAdmin at load time, which would otherwise demand real env vars.
vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: {} }));

import { buildGradebookWorkbook, gradebookFileName } from "./gradebookExport.js";

const gradebook: CourseGradebook = {
  course_id: "course-1",
  course_title: "Foundations of Cooperative Principles",
  assessments: [
    {
      id: "t1",
      title: "Governance Test",
      module_title: "Governance",
      kind: "module_test",
      total_marks: 30,
      pass_threshold_percent: 60,
    },
    {
      id: "q1",
      title: "Recap Quiz",
      module_title: "History",
      kind: "quiz",
      total_marks: 2,
      pass_threshold_percent: 50,
    },
  ],
  rows: [
    {
      trainee_id: "asha",
      full_name: "Asha Patil",
      cells: {
        t1: {
          best_marks_obtained: 30,
          best_total_marks: 30,
          best_score_percent: 100,
          passed: true,
          attempts: 1,
        },
        q1: {
          best_marks_obtained: 1,
          best_total_marks: 2,
          best_score_percent: 50,
          passed: true,
          attempts: 1,
        },
      },
      totals: {
        marks_obtained: 30,
        total_marks: 30,
        score_percent: 100,
        module_tests_passed: 1,
        module_tests_total: 1,
      },
      certificate_code: "NCCT-ABC12345",
    },
    {
      trainee_id: "priya",
      full_name: "Priya Kulkarni",
      cells: {
        t1: {
          best_marks_obtained: 10,
          best_total_marks: 30,
          best_score_percent: 33,
          passed: false,
          attempts: 2,
        },
        q1: null,
      },
      totals: {
        marks_obtained: 10,
        total_marks: 30,
        score_percent: 33,
        module_tests_passed: 0,
        module_tests_total: 1,
      },
      certificate_code: null,
    },
    {
      trainee_id: "amit",
      full_name: "Amit Jadhav",
      cells: { t1: null, q1: null },
      // What the live tally API really returns for a never-attempted trainee:
      // 0 marks and 0%, not null — the export must not present that as a score.
      totals: {
        marks_obtained: 0,
        total_marks: 30,
        score_percent: 0,
        module_tests_passed: 0,
        module_tests_total: 1,
      },
      certificate_code: null,
    },
  ],
};

async function build(locale: "en" | "hi" = "en") {
  const buffer = await buildGradebookWorkbook(gradebook, {
    programmeTitle: "Cooperative Management Basics",
    institutionName: "VAMNICOM Pune",
    affiliations: { asha: "Village PACS, Baramati", priya: "Nashik Dairy Co-op", amit: null },
    preparedBy: "Rajesh Kumar",
    generatedAt: new Date("2026-09-26T06:30:00.000Z"),
    locale,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

// Header is row 5; data starts at row 6: Asha, Priya, Amit.
const HEADER = 5;

describe("buildGradebookWorkbook", () => {
  it("produces a real .xlsx with a gradebook sheet and an attempt-details sheet", async () => {
    const workbook = await build();
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual(["Gradebook", "Attempt Details"]);
  });

  it("titles the sheet and records who it was prepared for and when (IST)", async () => {
    const sheet = (await build()).getWorksheet("Gradebook")!;
    expect(sheet.getCell("A1").value).toBe("Gradebook — Foundations of Cooperative Principles");
    expect(String(sheet.getCell("A2").value)).toContain("Cooperative Management Basics");
    expect(String(sheet.getCell("A2").value)).toContain("VAMNICOM Pune");
    expect(String(sheet.getCell("A3").value)).toContain("Rajesh Kumar");
    // 06:30 UTC is 12:00 noon in India.
    expect(String(sheet.getCell("A3").value)).toMatch(/12:00/);
  });

  it("lists module tests before practice quizzes, with max marks in the header", async () => {
    const header = (await build()).getWorksheet("Gradebook")!.getRow(HEADER);
    expect(header.getCell(1).value).toBe("S.No");
    expect(header.getCell(2).value).toBe("Trainee");
    expect(header.getCell(3).value).toBe("Cooperative / PACS");
    expect(String(header.getCell(4).value)).toContain("Governance Test");
    expect(String(header.getCell(4).value)).toContain("max 30");
    expect(String(header.getCell(5).value)).toContain("Practice quiz — not counted");
    expect(header.getCell(6).value).toBe("Total Marks");
    expect(header.getCell(11).value).toBe("Certificate No.");
  });

  it("writes marks as real numbers, and 'Not attempted' where there's no attempt", async () => {
    const sheet = (await build()).getWorksheet("Gradebook")!;
    const asha = sheet.getRow(HEADER + 1);
    const priya = sheet.getRow(HEADER + 2);
    expect(asha.getCell(1).value).toBe(1);
    expect(asha.getCell(2).value).toBe("Asha Patil");
    expect(asha.getCell(3).value).toBe("Village PACS, Baramati");
    expect(asha.getCell(4).value).toBe(30);
    expect(priya.getCell(4).value).toBe(10);
    expect(priya.getCell(5).value).toBe("Not attempted");
  });

  it("colours passed marks green and failed marks red", async () => {
    const sheet = (await build()).getWorksheet("Gradebook")!;
    const passFill = sheet.getRow(HEADER + 1).getCell(4).fill as ExcelJS.FillPattern;
    const failFill = sheet.getRow(HEADER + 2).getCell(4).fill as ExcelJS.FillPattern;
    expect(passFill.fgColor?.argb).toBe("FFE6F4EA");
    expect(failFill.fgColor?.argb).toBe("FFFDE8E8");
  });

  it("summarises each trainee's totals and an honest result", async () => {
    const sheet = (await build()).getWorksheet("Gradebook")!;
    const [asha, priya, amit] = [1, 2, 3].map((i) => sheet.getRow(HEADER + i));
    expect(asha.getCell(6).value).toBe(30);
    expect(asha.getCell(8).value).toBe(100);
    expect(asha.getCell(9).value).toBe("1 / 1");
    expect(asha.getCell(10).value).toBe("Certified");
    expect(asha.getCell(11).value).toBe("NCCT-ABC12345");
    expect(priya.getCell(10).value).toBe("Not yet passed");
    expect(amit.getCell(10).value).toBe("Not started");
  });

  it("shows 'Not attempted' — not 0 / 0% — for a trainee who never sat a module test", async () => {
    const amit = (await build()).getWorksheet("Gradebook")!.getRow(HEADER + 3);
    expect(amit.getCell(6).value).toBe("Not attempted");
    expect(amit.getCell(8).value).toBeNull();
  });

  it("averages only over trainees who attempted — an unattempted test isn't a zero", async () => {
    const sheet = (await build()).getWorksheet("Gradebook")!;
    const average = sheet.getRow(HEADER + 4);
    const passRate = sheet.getRow(HEADER + 5);
    expect(average.getCell(2).value).toBe("Class average");
    expect(average.getCell(4).value).toBe(20); // (30 + 10) / 2, Amit excluded
    expect(average.getCell(5).value).toBe(1); // only Asha took the quiz
    expect(average.getCell(8).value).toBe(66.5); // (100 + 33) / 2 — Amit's reported 0% excluded
    expect(passRate.getCell(4).value).toBe("1 / 2");
  });

  it("freezes the header row and trainee columns, and adds filters", async () => {
    const sheet = (await build()).getWorksheet("Gradebook")!;
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 3, ySplit: HEADER });
    expect(sheet.autoFilter).toBeTruthy();
  });

  it("gives one details row per trainee per assessment, including unattempted ones", async () => {
    const details = (await build()).getWorksheet("Attempt Details")!;
    expect(details.rowCount).toBe(1 + 3 * 2);
    const priyaQuiz = details.getRow(5); // Asha t1, Asha q1, Priya t1, Priya q1
    expect(priyaQuiz.getCell(1).value).toBe("Priya Kulkarni");
    expect(priyaQuiz.getCell(4).value).toBe("Recap Quiz");
    expect(priyaQuiz.getCell(10).value).toBe("Not attempted");
    expect(priyaQuiz.getCell(11).value).toBe(0);
  });

  it("renders labels in Hindi when asked, without touching the data", async () => {
    const workbook = await build("hi");
    const sheet = workbook.getWorksheet("अंक पुस्तिका")!;
    expect(sheet.getRow(HEADER).getCell(2).value).toBe("प्रशिक्षणार्थी");
    expect(sheet.getRow(HEADER + 1).getCell(2).value).toBe("Asha Patil");
    expect(sheet.getRow(HEADER + 1).getCell(4).value).toBe(30);
  });

  it("still produces a valid workbook for a course with nobody on its roster", async () => {
    const buffer = await buildGradebookWorkbook(
      { ...gradebook, rows: [] },
      {
        programmeTitle: null,
        institutionName: null,
        affiliations: {},
        preparedBy: null,
        generatedAt: new Date(),
        locale: "en",
      },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(
      String(
        workbook
          .getWorksheet("Gradebook")!
          .getRow(HEADER + 1)
          .getCell(1).value,
      ),
    ).toContain("No trainees");
  });
});

describe("gradebookFileName", () => {
  it("replaces characters no filesystem allows, collapsing runs into one dash", () => {
    expect(gradebookFileName('Basics: Part 1/2 "Intro"?', new Date("2026-09-26T00:00:00Z"))).toBe(
      "Gradebook - Basics- Part 1-2 -Intro- - 2026-09-26.xlsx",
    );
  });

  it("dates the file in IST, not UTC — just after midnight in India is already the next day", () => {
    // 20:00 UTC on the 25th is 01:30 IST on the 26th.
    expect(gradebookFileName("Basics", new Date("2026-09-25T20:00:00Z"))).toBe(
      "Gradebook - Basics - 2026-09-26.xlsx",
    );
  });

  it("keeps a Hindi course title intact", () => {
    expect(gradebookFileName("सहकारी सिद्धांत", new Date("2026-09-26T00:00:00Z"))).toBe(
      "Gradebook - सहकारी सिद्धांत - 2026-09-26.xlsx",
    );
  });
});
