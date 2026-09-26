import type { CourseGradebook, GradebookRow } from "@ncct/shared-types";
import ExcelJS from "exceljs";
import { supabaseAdmin } from "./supabaseClient.js";

// Excel export of a course gradebook (docs/DECISIONS.md #66) — the same
// data GET /courses/:id/gradebook returns, laid out as a structured
// workbook a faculty member can file, print, filter, or sort. Built
// server-side (like certificate PDFs) so there is one source of truth for
// what the numbers mean, and gated by the exact same programme-scoped check
// as the on-screen gradebook.

export type ExportLocale = "en" | "hi";

export interface GradebookExportContext {
  programmeTitle: string | null;
  institutionName: string | null;
  /** trainee_id → cooperative/PACS affiliation, for identifying trainees. */
  affiliations: Record<string, string | null>;
}

export interface GradebookExportOptions extends GradebookExportContext {
  preparedBy: string | null;
  generatedAt: Date;
  locale: ExportLocale;
}

const LABELS = {
  en: {
    gradebookSheet: "Gradebook",
    detailsSheet: "Attempt Details",
    title: (course: string) => `Gradebook — ${course}`,
    programme: "Programme",
    institution: "Institution",
    preparedBy: "Prepared by",
    generated: "Generated",
    sNo: "S.No",
    trainee: "Trainee",
    affiliation: "Cooperative / PACS",
    maxMarks: (m: number) => `max ${m}`,
    practice: "Practice quiz — not counted",
    totalObtained: "Total Marks",
    totalMax: "Max Marks",
    scorePercent: "Score %",
    testsPassed: "Tests Passed",
    result: "Result",
    certificate: "Certificate No.",
    notAttempted: "Not attempted",
    certified: "Certified",
    testsCleared: "Tests passed",
    inProgress: "In progress",
    notYetPassed: "Not yet passed",
    notStarted: "Not started",
    classAverage: "Class average",
    passRate: "Pass rate",
    legend:
      "Marks are each trainee's best attempt. Practice quizzes are ungraded and excluded from totals. Green = passed, red = not passed. A certificate also requires every lesson to be completed.",
    module: "Module",
    assessment: "Assessment",
    type: "Type",
    moduleTest: "Graded module test",
    quiz: "Practice quiz",
    bestMarks: "Best Marks",
    passMark: "Pass Mark %",
    passed: "Passed",
    attempts: "Attempts",
    yes: "Yes",
    no: "No",
    noRoster: "No trainees on this course's roster yet.",
  },
  hi: {
    gradebookSheet: "अंक पुस्तिका",
    detailsSheet: "प्रयास विवरण",
    title: (course: string) => `अंक पुस्तिका — ${course}`,
    programme: "कार्यक्रम",
    institution: "संस्थान",
    preparedBy: "द्वारा तैयार",
    generated: "तैयार किया गया",
    sNo: "क्र.सं.",
    trainee: "प्रशिक्षणार्थी",
    affiliation: "सहकारी / PACS",
    maxMarks: (m: number) => `अधिकतम ${m}`,
    practice: "अभ्यास क्विज़ — गिनी नहीं जाती",
    totalObtained: "कुल अंक",
    totalMax: "अधिकतम अंक",
    scorePercent: "प्रतिशत",
    testsPassed: "उत्तीर्ण परीक्षाएं",
    result: "परिणाम",
    certificate: "प्रमाणपत्र सं.",
    notAttempted: "प्रयास नहीं",
    certified: "प्रमाणित",
    testsCleared: "परीक्षाएं उत्तीर्ण",
    inProgress: "प्रगति पर",
    notYetPassed: "अभी उत्तीर्ण नहीं",
    notStarted: "शुरू नहीं",
    classAverage: "कक्षा औसत",
    passRate: "उत्तीर्ण दर",
    legend:
      "अंक प्रत्येक प्रशिक्षणार्थी का सर्वश्रेष्ठ प्रयास हैं। अभ्यास क्विज़ योग में शामिल नहीं हैं। हरा = उत्तीर्ण, लाल = अनुत्तीर्ण। प्रमाणपत्र के लिए सभी पाठ पूरे होना भी आवश्यक है।",
    module: "मॉड्यूल",
    assessment: "मूल्यांकन",
    type: "प्रकार",
    moduleTest: "श्रेणीबद्ध मॉड्यूल परीक्षा",
    quiz: "अभ्यास क्विज़",
    bestMarks: "सर्वश्रेष्ठ अंक",
    passMark: "उत्तीर्ण अंक %",
    passed: "उत्तीर्ण",
    attempts: "प्रयास",
    yes: "हाँ",
    no: "नहीं",
    noRoster: "इस पाठ्यक्रम में अभी कोई प्रशिक्षणार्थी नहीं है।",
  },
} as const;

const COLORS = {
  headerFill: "FF00236F",
  headerFont: "FFFFFFFF",
  passFill: "FFE6F4EA",
  passFont: "FF1E7B34",
  failFill: "FFFDE8E8",
  failFont: "FFB42318",
  muted: "FF6B7280",
  footerFill: "FFF1F5F9",
  border: "FFD0D5DD",
};

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLORS.border } },
  left: { style: "thin", color: { argb: COLORS.border } },
  bottom: { style: "thin", color: { argb: COLORS.border } },
  right: { style: "thin", color: { argb: COLORS.border } },
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.headerFont } };
    cell.fill = solidFill(COLORS.headerFill);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });
}

function resultLabel(
  row: GradebookRow,
  moduleTestIds: string[],
  t: (typeof LABELS)[ExportLocale],
): string {
  if (row.certificate_code) return t.certified;
  const { module_tests_passed: passed, module_tests_total: total } = row.totals;
  if (total > 0 && passed >= total) return t.testsCleared;
  // A failed best attempt is the thing a faculty member most needs to spot,
  // so it outranks "in progress" (which is only: nothing failed, not done).
  if (moduleTestIds.some((id) => row.cells[id] && !row.cells[id]!.passed)) return t.notYetPassed;
  const attemptedAnything = Object.values(row.cells).some((cell) => cell !== null);
  return attemptedAnything ? t.inProgress : t.notStarted;
}

// The tally API reports 0 marks / 0% for a trainee who never attempted any
// module test — true arithmetically, but in a gradebook "0%" reads as
// "sat the test and scored nothing". Only an actual attempt counts.
function attemptedAnyModuleTest(row: GradebookRow, moduleTestIds: string[]): boolean {
  return moduleTestIds.some((id) => row.cells[id]);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Excel forbids \ / ? * [ ] : in sheet names and caps them at 31 chars.
function sheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

export async function buildGradebookWorkbook(
  gradebook: CourseGradebook,
  options: GradebookExportOptions,
): Promise<Buffer> {
  const t = LABELS[options.locale];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.preparedBy ?? "NCCT Platform";
  workbook.created = options.generatedAt;

  const moduleTests = gradebook.assessments.filter((a) => a.kind === "module_test");
  const moduleTestIds = moduleTests.map((a) => a.id);
  const quizzes = gradebook.assessments.filter((a) => a.kind === "quiz");
  const assessmentColumns = [...moduleTests, ...quizzes];
  const generatedLabel = options.generatedAt.toLocaleString(
    options.locale === "hi" ? "hi-IN" : "en-IN",
    {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    },
  );

  // ---------------------------------------------------------------- sheet 1
  const sheet = workbook.addWorksheet(sheetName(t.gradebookSheet), {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const fixedLeft = [t.sNo, t.trainee, t.affiliation];
  const fixedRight = [
    t.totalObtained,
    t.totalMax,
    t.scorePercent,
    t.testsPassed,
    t.result,
    t.certificate,
  ];
  const columnCount = fixedLeft.length + assessmentColumns.length + fixedRight.length;

  const titleRow = sheet.addRow([t.title(gradebook.course_title)]);
  titleRow.font = { bold: true, size: 14, color: { argb: COLORS.headerFill } };
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.addRow([
    [
      options.programmeTitle ? `${t.programme}: ${options.programmeTitle}` : "",
      options.institutionName ? `${t.institution}: ${options.institutionName}` : "",
    ]
      .filter(Boolean)
      .join("   ·   "),
  ]);
  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.addRow([
    [
      options.preparedBy ? `${t.preparedBy}: ${options.preparedBy}` : "",
      `${t.generated}: ${generatedLabel}`,
    ]
      .filter(Boolean)
      .join("   ·   "),
  ]);
  sheet.mergeCells(3, 1, 3, columnCount);
  sheet.getRow(2).font = { color: { argb: COLORS.muted } };
  sheet.getRow(3).font = { color: { argb: COLORS.muted } };
  sheet.addRow([]);

  const HEADER_ROW = 5;
  const header = sheet.addRow([
    ...fixedLeft,
    ...moduleTests.map((a) => `${a.title}\n${a.module_title} · ${t.maxMarks(a.total_marks)}`),
    ...quizzes.map((a) => `${a.title}\n${t.practice}`),
    ...fixedRight,
  ]);
  header.height = 42;
  styleHeaderRow(header);

  const firstDataRow = HEADER_ROW + 1;
  gradebook.rows.forEach((row, index) => {
    const excelRow = sheet.addRow([
      index + 1,
      row.full_name ?? row.trainee_id.slice(0, 8),
      options.affiliations[row.trainee_id] ?? "",
      ...assessmentColumns.map((a) => {
        const cell = row.cells[a.id];
        return cell ? cell.best_marks_obtained : t.notAttempted;
      }),
      attemptedAnyModuleTest(row, moduleTestIds) ? row.totals.marks_obtained : t.notAttempted,
      row.totals.total_marks,
      attemptedAnyModuleTest(row, moduleTestIds) ? row.totals.score_percent : null,
      `${row.totals.module_tests_passed} / ${row.totals.module_tests_total}`,
      resultLabel(row, moduleTestIds, t),
      row.certificate_code ?? "",
    ]);

    excelRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: "middle" };
    });

    assessmentColumns.forEach((a, i) => {
      const cell = row.cells[a.id];
      const excelCell = excelRow.getCell(fixedLeft.length + i + 1);
      excelCell.alignment = { horizontal: "center", vertical: "middle" };
      if (!cell) {
        excelCell.font = { italic: true, color: { argb: COLORS.muted } };
        return;
      }
      excelCell.fill = solidFill(cell.passed ? COLORS.passFill : COLORS.failFill);
      excelCell.font = { color: { argb: cell.passed ? COLORS.passFont : COLORS.failFont } };
      excelCell.note = `${cell.best_marks_obtained} / ${cell.best_total_marks} (${cell.best_score_percent}%) · ${t.attempts}: ${cell.attempts}`;
    });

    const scoreCell = excelRow.getCell(fixedLeft.length + assessmentColumns.length + 3);
    scoreCell.numFmt = '0"%"';
    for (let offset = 1; offset <= 4; offset += 1) {
      excelRow.getCell(fixedLeft.length + assessmentColumns.length + offset).alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    }
  });

  if (gradebook.rows.length === 0) {
    sheet.addRow([t.noRoster]).font = { italic: true, color: { argb: COLORS.muted } };
  } else {
    // Averages over trainees who actually attempted each assessment — an
    // unattempted test isn't a zero, it's absent.
    const averageRow = sheet.addRow([
      "",
      t.classAverage,
      "",
      ...assessmentColumns.map((a) => {
        const scores = gradebook.rows.flatMap((r) =>
          r.cells[a.id] ? [r.cells[a.id]!.best_marks_obtained] : [],
        );
        return scores.length > 0 ? round1(scores.reduce((s, v) => s + v, 0) / scores.length) : "";
      }),
      "",
      "",
      (() => {
        const percents = gradebook.rows.flatMap((r) =>
          r.totals.score_percent === null || !attemptedAnyModuleTest(r, moduleTestIds)
            ? []
            : [r.totals.score_percent],
        );
        return percents.length > 0
          ? round1(percents.reduce((s, v) => s + v, 0) / percents.length)
          : "";
      })(),
    ]);
    const passRow = sheet.addRow([
      "",
      t.passRate,
      "",
      ...assessmentColumns.map((a) => {
        const attempted = gradebook.rows.filter((r) => r.cells[a.id]);
        if (attempted.length === 0) return "";
        return `${attempted.filter((r) => r.cells[a.id]!.passed).length} / ${attempted.length}`;
      }),
    ]);
    for (const footerRow of [averageRow, passRow]) {
      footerRow.font = { bold: true };
      for (let col = 1; col <= columnCount; col += 1) {
        const cell = footerRow.getCell(col);
        cell.fill = solidFill(COLORS.footerFill);
        cell.border = thinBorder;
        if (col > fixedLeft.length) cell.alignment = { horizontal: "center" };
      }
    }
    averageRow.getCell(fixedLeft.length + assessmentColumns.length + 3).numFmt = '0.0"%"';
  }

  sheet.addRow([]);
  const legendRow = sheet.addRow([t.legend]);
  legendRow.font = { italic: true, color: { argb: COLORS.muted } };
  sheet.mergeCells(legendRow.number, 1, legendRow.number, columnCount);
  legendRow.alignment = { wrapText: true, vertical: "top" };
  legendRow.height = 30;

  sheet.columns.forEach((column, i) => {
    const col = i + 1;
    if (col === 1) column.width = 6;
    else if (col === 2) column.width = 26;
    else if (col === 3) column.width = 24;
    else if (col <= fixedLeft.length + assessmentColumns.length) column.width = 20;
    else column.width = 15;
  });
  sheet.views = [{ state: "frozen", xSplit: fixedLeft.length, ySplit: HEADER_ROW }];
  if (gradebook.rows.length > 0) {
    sheet.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: firstDataRow + gradebook.rows.length - 1, column: columnCount },
    };
  }

  // ---------------------------------------------------------------- sheet 2
  // Long format — one row per trainee per assessment — for filtering and
  // pivoting ("who hasn't attempted Test 2?"), which the wide sheet can't do.
  const details = workbook.addWorksheet(sheetName(t.detailsSheet));
  const detailsHeader = details.addRow([
    t.trainee,
    t.affiliation,
    t.module,
    t.assessment,
    t.type,
    t.bestMarks,
    t.totalMax,
    t.scorePercent,
    t.passMark,
    t.passed,
    t.attempts,
  ]);
  styleHeaderRow(detailsHeader);
  detailsHeader.height = 28;

  for (const row of gradebook.rows) {
    for (const a of assessmentColumns) {
      const cell = row.cells[a.id];
      const detailRow = details.addRow([
        row.full_name ?? row.trainee_id.slice(0, 8),
        options.affiliations[row.trainee_id] ?? "",
        a.module_title,
        a.title,
        a.kind === "module_test" ? t.moduleTest : t.quiz,
        cell ? cell.best_marks_obtained : null,
        a.total_marks,
        cell ? cell.best_score_percent : null,
        a.pass_threshold_percent,
        cell ? (cell.passed ? t.yes : t.no) : t.notAttempted,
        cell ? cell.attempts : 0,
      ]);
      detailRow.eachCell({ includeEmpty: true }, (c) => {
        c.border = thinBorder;
      });
      detailRow.getCell(8).numFmt = '0"%"';
      detailRow.getCell(9).numFmt = '0"%"';
      const passedCell = detailRow.getCell(10);
      if (cell) {
        passedCell.fill = solidFill(cell.passed ? COLORS.passFill : COLORS.failFill);
        passedCell.font = { color: { argb: cell.passed ? COLORS.passFont : COLORS.failFont } };
      } else {
        passedCell.font = { italic: true, color: { argb: COLORS.muted } };
      }
    }
  }
  [26, 24, 22, 30, 20, 12, 12, 10, 12, 14, 10].forEach((width, i) => {
    details.getColumn(i + 1).width = width;
  });
  details.views = [{ state: "frozen", ySplit: 1 }];
  if (details.rowCount > 1) {
    details.autoFilter = { from: { row: 1, column: 1 }, to: { row: details.rowCount, column: 11 } };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** The extra, non-mark context the export's header rows need. */
export async function loadGradebookExportContext(
  courseId: string,
  traineeIds: string[],
): Promise<GradebookExportContext> {
  const { data: course, error: courseError } = await supabaseAdmin
    .from("courses")
    .select("programmes(title, institutions(name))")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError) throw new Error(courseError.message);
  const programme = (
    course as { programmes: { title: string; institutions: { name: string } | null } | null } | null
  )?.programmes;

  let affiliations: Record<string, string | null> = {};
  if (traineeIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, cooperative_affiliation")
      .in("id", traineeIds);
    if (profilesError) throw new Error(profilesError.message);
    affiliations = Object.fromEntries(
      ((profiles ?? []) as { id: string; cooperative_affiliation: string | null }[]).map((p) => [
        p.id,
        p.cooperative_affiliation,
      ]),
    );
  }

  return {
    programmeTitle: programme?.title ?? null,
    institutionName: programme?.institutions?.name ?? null,
    affiliations,
  };
}

/**
 * `Gradebook - <course> - 2026-09-26.xlsx`, safe for every OS's filesystem.
 * Dated in IST like the sheet's own "Generated" line — a UTC date would name
 * anything exported between midnight and 05:30 IST after the previous day.
 */
export function gradebookFileName(courseTitle: string, date: Date): string {
  const safeTitle = courseTitle
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const istDate = date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
  return `Gradebook - ${safeTitle || "Course"} - ${istDate}.xlsx`;
}
