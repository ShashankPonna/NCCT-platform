import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { loadCourseStructure, summarizeCourseMarks, type AttemptRow } from "./assessmentScoring.js";
import { generateCode } from "./codeGenerator.js";
import { notify } from "./notificationService.js";
import { supabaseAdmin } from "./supabaseClient.js";

const CERTIFICATE_BUCKET = "certificates";

// assets/ is a sibling of src/ and dist/ at the apps/api root, so this
// resolves correctly whether this module runs from src (tsx) or dist (tsc
// build) without any asset-copy build step.
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");
// The EduDisha symbol (compass arrow over an open book), cropped from the
// approved logo; transparent PNG. Used for the letterhead mark and watermark.
const LOGO_SYMBOL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "images", "logo-symbol.png");

function generateCertificateCode(): string {
  return `EDU-${generateCode(8)}`;
}

/**
 * Checks whether a trainee has now completed an entire course — every lesson
 * across every module marked complete, and every graded module test (if any)
 * passed — and, if so, issues the course's certificate carrying the trainee's
 * final marks. Idempotent: a course already certified for this trainee is a
 * no-op, and this can safely be called repeatedly from every event that could
 * be the *last* one to complete a course (a lesson marked done, or a module
 * test passed).
 *
 * Practice quizzes (kind 'quiz') never gate certification and never count
 * toward the marks — only module tests do, each contributing its best
 * attempt. See docs/DECISIONS.md #37 (course-completion trigger) and #53
 * (marks and assessment kinds).
 */
export async function checkAndIssueCourseCertificate({
  traineeId,
  courseId,
}: {
  traineeId: string;
  courseId: string;
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("certificates")
    .select("id")
    .eq("trainee_id", traineeId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return null;

  const structure = await loadCourseStructure(courseId);
  if (!structure) return null;
  const moduleTests = structure.assessments.filter((a) => a.kind === "module_test");
  // Nothing to complete at all — never certify an empty course.
  if (structure.lessonIds.length === 0 && moduleTests.length === 0) return null;

  if (structure.lessonIds.length > 0) {
    const { data: completed, error: completedError } = await supabaseAdmin
      .from("lesson_progress")
      .select("lesson_id")
      .eq("trainee_id", traineeId)
      .in("lesson_id", structure.lessonIds)
      .not("completed_at", "is", null);
    if (completedError) throw new Error(completedError.message);
    if ((completed ?? []).length < structure.lessonIds.length) return null;
  }

  let lastPassingAttemptId: string | null = null;
  let marks: CertificateMarks | null = null;
  if (moduleTests.length > 0) {
    const { data: attempts, error: attemptsError } = await supabaseAdmin
      .from("assessment_attempts")
      .select(
        "id, assessment_id, trainee_id, score_percent, passed, marks_obtained, total_marks, submitted_at",
      )
      .eq("trainee_id", traineeId)
      .in(
        "assessment_id",
        moduleTests.map((a) => a.id),
      )
      .order("submitted_at", { ascending: true });
    if (attemptsError) throw new Error(attemptsError.message);
    const attemptRows = (attempts ?? []) as AttemptRow[];

    const { totals } = summarizeCourseMarks(moduleTests, attemptRows);
    if (totals.module_tests_passed < totals.module_tests_total) return null;

    const passing = attemptRows.filter((a) => a.passed);
    lastPassingAttemptId = passing.length > 0 ? passing[passing.length - 1].id : null;
    marks = {
      marksObtained: totals.marks_obtained,
      totalMarks: totals.total_marks,
      scorePercent: totals.score_percent ?? 0,
    };
  }

  return issueCertificateForCourse({ traineeId, courseId, lastPassingAttemptId, marks });
}

/** Resolves a lesson to its course, then delegates to
 * checkAndIssueCourseCertificate — called after lessonProgress.ts marks a
 * lesson complete. */
export async function checkAndIssueCourseCertificateForLesson({
  traineeId,
  lessonId,
}: {
  traineeId: string;
  lessonId: string;
}) {
  const { data: lesson, error: lessonError } = await supabaseAdmin
    .from("lessons")
    .select("module_id")
    .eq("id", lessonId)
    .single();
  if (lessonError) throw new Error(lessonError.message);

  const { data: module_, error: moduleError } = await supabaseAdmin
    .from("modules")
    .select("course_id")
    .eq("id", lesson.module_id)
    .single();
  if (moduleError) throw new Error(moduleError.message);

  return checkAndIssueCourseCertificate({ traineeId, courseId: module_.course_id });
}

/** Resolves an assessment to its course, then delegates to
 * checkAndIssueCourseCertificate — called after assessmentAttempts.ts
 * records a passing attempt. */
export async function checkAndIssueCourseCertificateForAssessment({
  traineeId,
  assessmentId,
}: {
  traineeId: string;
  assessmentId: string;
}) {
  const { data: assessment, error: assessmentError } = await supabaseAdmin
    .from("assessments")
    .select("module_id")
    .eq("id", assessmentId)
    .single();
  if (assessmentError) throw new Error(assessmentError.message);

  const { data: module_, error: moduleError } = await supabaseAdmin
    .from("modules")
    .select("course_id")
    .eq("id", assessment.module_id)
    .single();
  if (moduleError) throw new Error(moduleError.message);

  return checkAndIssueCourseCertificate({ traineeId, courseId: module_.course_id });
}

interface CertificateMarks {
  marksObtained: number;
  totalMarks: number;
  scorePercent: number;
}

async function issueCertificateForCourse({
  traineeId,
  courseId,
  lastPassingAttemptId,
  marks,
}: {
  traineeId: string;
  courseId: string;
  lastPassingAttemptId: string | null;
  marks: CertificateMarks | null;
}) {
  const { data: course, error: courseError } = await supabaseAdmin
    .from("courses")
    .select("title, programme_id")
    .eq("id", courseId)
    .single();
  if (courseError) throw new Error(courseError.message);

  const { data: programme, error: programmeError } = await supabaseAdmin
    .from("programmes")
    .select("title, institution_id")
    .eq("id", course.programme_id)
    .single();
  if (programmeError) throw new Error(programmeError.message);

  const { data: institution, error: institutionError } = await supabaseAdmin
    .from("institutions")
    .select("name")
    .eq("id", programme.institution_id)
    .single();
  if (institutionError) throw new Error(institutionError.message);

  const { data: trainee, error: traineeError } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", traineeId)
    .single();
  if (traineeError) throw new Error(traineeError.message);

  const certificateCode = generateCertificateCode();
  const pdfBuffer = await buildCertificatePdf({
    traineeName: trainee.full_name || "Trainee",
    programmeTitle: programme.title,
    institutionName: institution.name,
    courseTitle: course.title,
    certificateCode,
    issuedAt: new Date(),
    marks,
  });

  const pdfPath = `${certificateCode}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(CERTIFICATE_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data: certificate, error: insertError } = await supabaseAdmin
    .from("certificates")
    .insert({
      certificate_code: certificateCode,
      assessment_attempt_id: lastPassingAttemptId,
      course_id: courseId,
      trainee_id: traineeId,
      programme_id: course.programme_id,
      issuing_institution_id: programme.institution_id,
      pdf_storage_path: pdfPath,
      marks_obtained: marks?.marksObtained ?? null,
      total_marks: marks?.totalMarks ?? null,
      score_percent: marks?.scorePercent ?? null,
    })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);

  void notify([traineeId], "certificate_issued", {
    programme_id: course.programme_id,
    programme_title: programme.title,
    course_title: course.title,
    certificate_code: certificateCode,
  });
  return certificate;
}

function verificationUrlFor(certificateCode: string): string {
  const publicWebUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:5173";
  return `${publicWebUrl}/?verify=${certificateCode}`;
}

/** QR + PDF for one certificate — shared by first issue and re-rendering. */
async function buildCertificatePdf(
  params: Omit<RenderCertificateParams, "qrPng" | "verificationUrl">,
): Promise<Buffer> {
  const verificationUrl = verificationUrlFor(params.certificateCode);
  const qrPng = await QRCode.toBuffer(verificationUrl, { type: "png", width: 240, margin: 0 });
  return renderCertificatePdf({ ...params, qrPng, verificationUrl });
}

/**
 * Re-renders an already-issued certificate in the current design
 * (DECISIONS.md #69) without changing anything it certifies: same code,
 * same issue date, same frozen marks, same QR target. The new PDF goes to a
 * fresh versioned path rather than overwriting — public Storage URLs are
 * CDN-cached, so an overwrite could keep serving the old design for up to an
 * hour, and leaving the previous file in place doubles as a backup. Names
 * are read as they are now (e.g. a corrected spelling is picked up).
 */
export async function rerenderCertificate(
  certificateId: string,
): Promise<{ oldPath: string; newPath: string }> {
  const { data: cert, error } = await supabaseAdmin
    .from("certificates")
    .select(
      "certificate_code, issued_at, marks_obtained, total_marks, score_percent, pdf_storage_path, trainee_id, course_id, programme_id, issuing_institution_id",
    )
    .eq("id", certificateId)
    .single();
  if (error) throw new Error(error.message);

  const lookup = async (table: string, column: string, id: string | null) => {
    if (!id) return null;
    const { data, error: lookupError } = await supabaseAdmin
      .from(table)
      .select(column)
      .eq("id", id)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    return (data as Record<string, string | null> | null)?.[column] ?? null;
  };

  const [traineeName, courseTitle, programmeTitle, institutionName] = await Promise.all([
    lookup("profiles", "full_name", cert.trainee_id),
    lookup("courses", "title", cert.course_id),
    lookup("programmes", "title", cert.programme_id),
    lookup("institutions", "name", cert.issuing_institution_id),
  ]);

  const pdfBuffer = await buildCertificatePdf({
    traineeName: traineeName || "Trainee",
    courseTitle: courseTitle ?? "Course",
    programmeTitle: programmeTitle ?? "Programme",
    institutionName: institutionName ?? "EduDisha",
    certificateCode: cert.certificate_code,
    issuedAt: new Date(cert.issued_at),
    marks:
      cert.marks_obtained !== null && cert.total_marks !== null && cert.score_percent !== null
        ? {
            marksObtained: cert.marks_obtained,
            totalMarks: cert.total_marks,
            scorePercent: cert.score_percent,
          }
        : null,
  });

  const newPath = `${cert.certificate_code}-${Date.now().toString(36)}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(CERTIFICATE_BUCKET)
    .upload(newPath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await supabaseAdmin
    .from("certificates")
    .update({ pdf_storage_path: newPath })
    .eq("id", certificateId);
  if (updateError) throw new Error(updateError.message);

  return { oldPath: cert.pdf_storage_path, newPath };
}

interface RenderCertificateParams {
  traineeName: string;
  programmeTitle: string;
  institutionName: string;
  courseTitle: string;
  certificateCode: string;
  issuedAt: Date;
  qrPng: Buffer;
  verificationUrl: string;
  marks: CertificateMarks | null;
}

// Implements the approved Stitch design
// (`stitch_coop_net_certificate_of_completion (1)/code.html` + `screen.png` at
// the repo root — DECISIONS.md #69).
// The design is authored at 1123×794 CSS px (A4 landscape at 96 dpi); an A4
// landscape PDF page is 842×595 pt, so every measurement below is the
// design's px value × 0.75 (see `px()`), keeping this file checkable against
// the reference rather than hand-tuned.
const NAVY = "#0f172a";
const ORANGE = "#f26522";
const CREAM = "#fdf6ee";
const SLATE_800 = "#1e293b";
const SLATE_700 = "#334155";
const SLATE_600 = "#475569";
const SLATE_500 = "#64748b";
const SLATE_400 = "#94a3b8";
const SLATE_300 = "#cbd5e1";
const SLATE_200 = "#e2e8f0";
const SLATE_100 = "#f1f5f9";
const SLATE_50 = "#f8fafc";
const WHITE = "#ffffff";

const px = (value: number) => value * 0.75;

function registerFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont("Title", path.join(FONTS_DIR, "Cinzel-Bold.ttf"));
  doc.registerFont("Name", path.join(FONTS_DIR, "PlayfairDisplay-Bold.ttf"));
  doc.registerFont("Body", path.join(FONTS_DIR, "Roboto-Regular.ttf"));
  doc.registerFont("BodyMedium", path.join(FONTS_DIR, "Roboto-Medium.ttf"));
  doc.registerFont("BodyBold", path.join(FONTS_DIR, "Roboto-Bold.ttf"));
  doc.registerFont("Mono", path.join(FONTS_DIR, "JetBrainsMono-SemiBold.ttf"));
  // Devanagari needs its own font (Roboto has no Devanagari glyphs); PDFKit's
  // fontkit layout applies the OpenType shaping conjuncts like "र्ष" need.
  doc.registerFont("Devanagari", path.join(FONTS_DIR, "NotoSansDevanagari-Medium.ttf"));
}

interface RunStyle {
  font: string;
  size: number;
  color: string;
  characterSpacing?: number;
  oblique?: boolean;
}

/** Width of a single-line run, including letter-spacing. */
function runWidth(doc: PDFKit.PDFDocument, text: string, style: RunStyle): number {
  doc.font(style.font).fontSize(style.size);
  return doc.widthOfString(text, { characterSpacing: style.characterSpacing ?? 0 });
}

/** Draws one unwrapped run at (x, y) and returns the x where it ends. */
function drawRun(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  style: RunStyle,
): number {
  const width = runWidth(doc, text, style);
  doc.fillColor(style.color).text(text, x, y, {
    lineBreak: false,
    characterSpacing: style.characterSpacing ?? 0,
    oblique: style.oblique ?? false,
  });
  return x + width;
}

/** Lays out several differently-styled runs as one line, aligned to an anchor. */
function drawRuns(
  doc: PDFKit.PDFDocument,
  runs: { text: string; style: RunStyle }[],
  anchorX: number,
  y: number,
  align: "left" | "center" | "right",
): number {
  const total = runs.reduce((sum, run) => sum + runWidth(doc, run.text, run.style), 0);
  let x = align === "left" ? anchorX : align === "center" ? anchorX - total / 2 : anchorX - total;
  for (const run of runs) x = drawRun(doc, run.text, x, y, run.style);
  return total;
}

/** Shrinks a one-line run's font size until it fits, then ellipsises as a last resort. */
function fitRun(
  doc: PDFKit.PDFDocument,
  text: string,
  style: RunStyle,
  maxWidth: number,
  minSize: number,
) {
  let size = style.size;
  while (size > minSize && runWidth(doc, text, { ...style, size }) > maxWidth) size -= 0.25;
  let fitted = text;
  while (fitted.length > 1 && runWidth(doc, fitted, { ...style, size }) > maxWidth) {
    fitted = `${fitted.slice(0, -2)}…`;
  }
  return { text: fitted, style: { ...style, size } };
}

function drawBorder(doc: PDFKit.PDFDocument, pageW: number, pageH: number) {
  doc.save();
  doc
    .lineWidth(px(2))
    .rect(px(20), px(20), pageW - px(40), pageH - px(40))
    .stroke(NAVY);
  doc
    .lineWidth(px(1))
    .rect(px(26), px(26), pageW - px(52), pageH - px(52))
    .stroke(ORANGE);
  doc.restore();

  // Rangoli-style corner tiles — the design's 36×36 SVG, one diagonal
  // direction per corner.
  const tile = px(36);
  const corners: { x: number; y: number; diagonal: [number, number, number, number] }[] = [
    { x: px(21), y: px(21), diagonal: [2, 2, 34, 34] },
    { x: pageW - px(21) - tile, y: px(21), diagonal: [34, 2, 2, 34] },
    { x: px(21), y: pageH - px(21) - tile, diagonal: [2, 34, 34, 2] },
    { x: pageW - px(21) - tile, y: pageH - px(21) - tile, diagonal: [2, 2, 34, 34] },
  ];
  for (const { x, y, diagonal } of corners) {
    const at = (vx: number, vy: number): [number, number] => [x + px(vx), y + px(vy)];
    doc.save();
    doc
      .lineWidth(px(1))
      .rect(...at(2, 2), px(32), px(32))
      .fillAndStroke(WHITE, ORANGE);
    const [x1, y1] = at(diagonal[0], diagonal[1]);
    const [x2, y2] = at(diagonal[2], diagonal[3]);
    doc.lineWidth(px(1.5)).moveTo(x1, y1).lineTo(x2, y2).stroke(NAVY);
    doc.lineWidth(px(1)).polygon(at(2, 18), at(18, 2), at(34, 18), at(18, 34)).stroke(NAVY);
    doc.circle(...at(18, 18), px(4)).fill(NAVY);
    doc.restore();
  }
}

/** The EduDisha symbol as a faint centred watermark (420px at ~6%, as in the design). */
function drawWatermark(doc: PDFKit.PDFDocument, cx: number, cy: number) {
  const size = px(420);
  doc.save();
  doc.opacity(0.06);
  doc.image(LOGO_SYMBOL, cx - size / 2, cy - size / 2, { width: size, height: size });
  doc.restore();
}

/** The EduDisha symbol in the letterhead's 56px slot (replaces the design's placeholder tile). */
function drawEmblem(doc: PDFKit.PDFDocument, x: number, y: number) {
  const size = px(56);
  doc.image(LOGO_SYMBOL, x, y, { width: size, height: size });
}

/** A generic signature flourish (160×40 viewBox) — deliberately no real person's signature. */
function drawSignature(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  const scale = width / 160;
  const at = (vx: number, vy: number): [number, number] => [x + vx * scale, y + vy * scale];
  doc.save();
  doc
    .lineWidth(1.3 * scale)
    .strokeColor(NAVY)
    .lineCap("round")
    .lineJoin("round");
  doc
    .moveTo(...at(10, 28))
    .bezierCurveTo(...at(30, 10), ...at(45, 32), ...at(60, 18))
    .bezierCurveTo(...at(70, 8), ...at(85, 24), ...at(100, 20))
    .bezierCurveTo(...at(115, 16), ...at(125, 32), ...at(148, 14))
    .stroke();
  doc
    .moveTo(...at(42, 16))
    .bezierCurveTo(...at(50, 35), ...at(58, 5), ...at(68, 25))
    .stroke();
  doc
    .moveTo(...at(85, 26))
    .bezierCurveTo(...at(95, 38), ...at(120, 34), ...at(138, 28))
    .stroke();
  doc.restore();
}

/** Measures a centred, wrapping block (name / course / programme). */
function blockHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  size: number,
  width: number,
  lineGap = 0,
) {
  doc.font(font).fontSize(size);
  return doc.heightOfString(text, { width, align: "center", lineGap });
}

/** Largest size in [min, max] at which `text` fits on one line of `width`; `min` if none does. */
function fitSize(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  max: number,
  min: number,
  width: number,
) {
  let size = max;
  while (size > min && runWidth(doc, text, { font, size, color: NAVY }) > width) size -= 0.5;
  return size;
}

export function renderCertificatePdf(params: RenderCertificateParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    registerFonts(doc);

    doc.rect(0, 0, pageW, pageH).fill(WHITE);
    drawWatermark(doc, pageW / 2, pageH / 2);
    drawBorder(doc, pageW, pageH);

    // Inner content box: sheet padding 40px + inner px-10 / pt-4 / pb-2.
    const left = px(80);
    const right = pageW - px(80);
    const width = right - left;
    const cx = pageW / 2;
    const top = px(56);
    const bottom = pageH - px(48);

    // ---- 1. HEADER ----
    drawEmblem(doc, left, top);
    const idX = left + px(56) + px(16);
    drawRun(doc, "EDUDISHA", idX, top + px(4), {
      font: "BodyBold",
      size: px(13),
      color: NAVY,
      characterSpacing: px(13) * 0.08,
    });
    const institution = fitRun(
      doc,
      params.institutionName,
      { font: "BodyMedium", size: px(14), color: ORANGE, characterSpacing: px(14) * 0.025 },
      px(560),
      px(10),
    );
    drawRun(doc, institution.text, idX, top + px(23), institution.style);
    drawRun(doc, "UNDER MINISTRY OF COOPERATION • RICM / ICM NETWORK", idX, top + px(43), {
      font: "BodyMedium",
      size: px(9.5),
      color: SLATE_500,
      characterSpacing: px(9.5) * 0.14,
    });

    // Right: platform brand mark.
    const pill = { font: "BodyBold", size: px(10), color: ORANGE, characterSpacing: px(10) * 0.05 };
    const pillW = runWidth(doc, "LMS", pill) + px(12);
    const pillH = px(17);
    const pillX = right - pillW;
    doc
      .save()
      .lineWidth(px(1))
      .roundedRect(pillX, top + px(1), pillW, pillH, px(4))
      .fillOpacity(1)
      .fill(CREAM)
      .restore();
    doc
      .save()
      .strokeOpacity(0.3)
      .lineWidth(px(1))
      .roundedRect(pillX, top + px(1), pillW, pillH, px(4))
      .stroke(ORANGE)
      .restore();
    drawRun(doc, "LMS", pillX + px(6), top + px(4), pill);
    drawRuns(
      doc,
      [
        {
          text: "EduDisha",
          style: { font: "BodyBold", size: px(16), color: NAVY, characterSpacing: px(16) * 0.05 },
        },
      ],
      pillX - px(6),
      top - px(1),
      "right",
    );
    drawRuns(
      doc,
      [
        { text: "सत्यापित डिजिटल प्रमाणपत्र", style: { font: "Devanagari", size: px(11), color: SLATE_500 } },
        {
          text: " • Verified Digital Credential",
          style: { font: "BodyMedium", size: px(11), color: SLATE_500, oblique: true },
        },
      ],
      right,
      top + px(20),
      "right",
    );
    drawRuns(
      doc,
      [
        {
          text: "NATIONAL DIGITAL TRAINING INITIATIVE",
          style: { font: "Mono", size: px(9), color: SLATE_400, characterSpacing: px(9) * 0.05 },
        },
      ],
      right,
      top + px(40),
      "right",
    );

    const headerRuleY = top + px(56) + px(16);
    doc
      .save()
      .lineWidth(px(1))
      .moveTo(left, headerRuleY)
      .lineTo(right, headerRuleY)
      .stroke(SLATE_200)
      .restore();

    // ---- 2. TITLE ----
    const titleY = headerRuleY + px(12);
    drawRuns(
      doc,
      [
        {
          text: "CERTIFICATE OF COMPLETION",
          style: { font: "Title", size: px(26), color: NAVY, characterSpacing: px(26) * 0.25 },
        },
      ],
      cx,
      titleY,
      "center",
    );
    const accentY = titleY + px(26) * 1.35 + px(6);
    doc.save();
    doc.lineWidth(px(1)).strokeColor(SLATE_300);
    doc
      .moveTo(cx - px(32) - px(8) - px(48), accentY)
      .lineTo(cx - px(32) - px(8), accentY)
      .stroke();
    doc
      .moveTo(cx + px(32) + px(8), accentY)
      .lineTo(cx + px(32) + px(8) + px(48), accentY)
      .stroke();
    doc.rect(cx - px(32), accentY - px(1.25), px(64), px(2.5)).fill(ORANGE);
    doc.restore();

    // ---- 5. FOOTER (laid out bottom-up, so the body can centre in what's left) ----
    const disclaimerY = bottom - px(12);
    const stripY = disclaimerY - px(6);
    const rowH = px(72);
    const rowTop = stripY - px(12) - rowH;
    const footerRuleY = rowTop - px(12);

    // ---- 3 + 4. BODY, centred between the title accent and the footer ----
    const bodyWidth = px(768);
    const textWidth = px(672) - px(32);
    const nameSize = fitSize(doc, params.traineeName, "Name", px(34), px(24), bodyWidth);
    const courseSize =
      blockHeight(doc, params.courseTitle, "BodyBold", px(18), textWidth) > px(18) * 1.4 * 2
        ? px(15)
        : px(18);
    const gap = px(6);
    const heights = {
      certifies: px(12) * 1.3,
      name: blockHeight(doc, params.traineeName, "Name", nameSize, bodyWidth) + px(2),
      underline: px(4) + px(4),
      completed: px(12) * 1.3,
      course: blockHeight(doc, params.courseTitle, "BodyBold", courseSize, textWidth, px(3)),
      inProgramme: px(11.5) * 1.3,
      programme: blockHeight(doc, params.programmeTitle, "BodyMedium", px(14), textWidth),
      badge: px(8) + px(30),
    };
    const bodyHeight = Object.values(heights).reduce((a, b) => a + b, 0) + gap * 6;
    let y = (accentY + footerRuleY) / 2 - bodyHeight / 2;

    drawRuns(
      doc,
      [
        {
          text: "THIS CERTIFIES THAT",
          style: {
            font: "BodyMedium",
            size: px(12),
            color: SLATE_500,
            characterSpacing: px(12) * 0.18,
          },
        },
      ],
      cx,
      y,
      "center",
    );
    y += heights.certifies + gap;
    doc
      .font("Name")
      .fontSize(nameSize)
      .fillColor(NAVY)
      .text(params.traineeName, cx - bodyWidth / 2, y, {
        width: bodyWidth,
        align: "center",
      });
    y += heights.name;
    doc
      .save()
      .lineWidth(px(1))
      .moveTo(cx - px(88), y + px(4))
      .lineTo(cx + px(88), y + px(4))
      .stroke(SLATE_200)
      .restore();
    y += heights.underline + gap;

    drawRuns(
      doc,
      [
        {
          text: "has successfully completed the course",
          style: {
            font: "BodyMedium",
            size: px(12),
            color: SLATE_600,
            characterSpacing: px(12) * 0.12,
          },
        },
      ],
      cx,
      y,
      "center",
    );
    y += heights.completed + gap;
    doc
      .font("BodyBold")
      .fontSize(courseSize)
      .fillColor(NAVY)
      .text(params.courseTitle, cx - textWidth / 2, y, {
        width: textWidth,
        align: "center",
        lineGap: px(3),
      });
    y += heights.course + gap;
    drawRuns(
      doc,
      [
        {
          text: "in the programme",
          style: {
            font: "BodyMedium",
            size: px(11.5),
            color: SLATE_500,
            characterSpacing: px(11.5) * 0.1,
          },
        },
      ],
      cx,
      y,
      "center",
    );
    y += heights.inProgramme + gap;
    doc
      .font("BodyMedium")
      .fontSize(px(14))
      .fillColor(SLATE_800)
      .text(params.programmeTitle, cx - textWidth / 2, y, {
        width: textWidth,
        align: "center",
        characterSpacing: px(14) * 0.025,
      });
    y += heights.programme + gap + px(8);

    // Result badge: graded variant shows the marks; ungraded is just "COURSE COMPLETED".
    const badgeText: RunStyle = {
      font: "BodyBold",
      size: px(11),
      color: NAVY,
      characterSpacing: px(11) * 0.05,
    };
    const marksStyle: RunStyle = {
      font: "BodyMedium",
      size: px(11),
      color: SLATE_700,
      characterSpacing: px(11) * 0.025,
    };
    const badgeRuns: { text: string; style: RunStyle }[] = [
      { text: "COURSE COMPLETED", style: badgeText },
    ];
    if (params.marks) {
      badgeRuns.push(
        { text: "   |   ", style: { ...marksStyle, color: SLATE_300 } },
        { text: "Marks Obtained: ", style: marksStyle },
        {
          text: String(params.marks.marksObtained),
          style: { ...marksStyle, font: "BodyBold", color: NAVY },
        },
        { text: ` / ${params.marks.totalMarks} (`, style: marksStyle },
        {
          text: `${params.marks.scorePercent}%`,
          style: { ...marksStyle, font: "BodyBold", color: ORANGE },
        },
        { text: ")", style: marksStyle },
      );
    }
    const dotGap = px(8) + px(10);
    const runsW = badgeRuns.reduce((sum, run) => sum + runWidth(doc, run.text, run.style), 0);
    const badgeW = px(16) + dotGap + runsW + px(16);
    const badgeH = px(30);
    const badgeX = cx - badgeW / 2;
    doc
      .save()
      .roundedRect(badgeX, y, badgeW, badgeH, badgeH / 2)
      .fill(CREAM)
      .restore();
    doc
      .save()
      .strokeOpacity(0.4)
      .lineWidth(px(1))
      .roundedRect(badgeX, y, badgeW, badgeH, badgeH / 2)
      .stroke(ORANGE)
      .restore();
    doc.circle(badgeX + px(16) + px(4), y + badgeH / 2, px(4)).fill(ORANGE);
    drawRuns(doc, badgeRuns, badgeX + px(16) + dotGap, y + badgeH / 2 - px(11) * 0.62, "left");

    // ---- 5. FOOTER ----
    doc
      .save()
      .lineWidth(px(1))
      .moveTo(left, footerRuleY)
      .lineTo(right, footerRuleY)
      .stroke(SLATE_200)
      .restore();

    // 12-column grid with 16px gutters: verification (4) | rule (1) | ID (3) | rule (1) | signatory (3).
    const gutter = px(16);
    const unit = (width - gutter * 11) / 12;
    const span = (cols: number) => unit * cols + gutter * (cols - 1);
    const col1X = left;
    const rule1X = col1X + span(4) + gutter + unit / 2;
    const col2X = col1X + span(4) + gutter + unit + gutter;
    const rule2X = col2X + span(3) + gutter + unit / 2;
    for (const ruleX of [rule1X, rule2X]) {
      doc
        .save()
        .lineWidth(px(1))
        .moveTo(ruleX, rowTop + (rowH - px(56)) / 2)
        .lineTo(ruleX, rowTop + (rowH + px(56)) / 2)
        .stroke(SLATE_200)
        .restore();
    }

    // Column 1: QR + public verification link.
    const qrBox = px(72);
    doc
      .save()
      .lineWidth(px(1))
      .roundedRect(col1X, rowTop, qrBox, qrBox, px(4))
      .fillAndStroke(WHITE, SLATE_300)
      .restore();
    doc.image(params.qrPng, col1X + px(4), rowTop + px(4), {
      width: qrBox - px(8),
      height: qrBox - px(8),
    });
    const verifyX = col1X + qrBox + px(12);
    const verifyW = span(4) - qrBox - px(12);
    drawRun(doc, "SCAN TO VERIFY", verifyX, rowTop + px(17), {
      font: "BodyBold",
      size: px(10),
      color: NAVY,
      characterSpacing: px(10) * 0.14,
    });
    drawRun(doc, "Public verification portal", verifyX, rowTop + px(33), {
      font: "BodyMedium",
      size: px(9.5),
      color: SLATE_500,
    });
    const url = fitRun(
      doc,
      params.verificationUrl.replace(/^https?:\/\//, ""),
      { font: "Mono", size: px(8.5), color: SLATE_600 },
      verifyW,
      px(7),
    );
    drawRun(doc, url.text, verifyX, rowTop + px(49), url.style);

    // Column 2: certificate ID + issue date.
    const col2C = col2X + span(3) / 2;
    drawRuns(
      doc,
      [
        {
          text: "CERTIFICATE ID",
          style: {
            font: "BodyBold",
            size: px(9.5),
            color: SLATE_400,
            characterSpacing: px(9.5) * 0.15,
          },
        },
      ],
      col2C,
      rowTop + px(9),
      "center",
    );
    const codeStyle: RunStyle = {
      font: "Mono",
      size: px(12.5),
      color: NAVY,
      characterSpacing: px(12.5) * 0.05,
    };
    const codeW = runWidth(doc, params.certificateCode, codeStyle) + px(16);
    const codeH = px(22);
    const codeY = rowTop + px(25);
    doc
      .save()
      .lineWidth(px(1))
      .roundedRect(col2C - codeW / 2, codeY, codeW, codeH, px(4))
      .fillAndStroke(SLATE_50, SLATE_200)
      .restore();
    drawRuns(
      doc,
      [{ text: params.certificateCode, style: codeStyle }],
      col2C,
      codeY + px(4),
      "center",
    );
    const issuedOn = params.issuedAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Kolkata",
    });
    drawRuns(
      doc,
      [
        { text: "Issued: ", style: { font: "BodyMedium", size: px(9.5), color: SLATE_500 } },
        { text: issuedOn, style: { font: "BodyBold", size: px(9.5), color: SLATE_700 } },
      ],
      col2C,
      codeY + codeH + px(6),
      "center",
    );

    // Column 3: authorised signatory, right-aligned.
    const sigW = px(144);
    drawSignature(doc, right - sigW, rowTop - px(2), sigW);
    const sigLineY = rowTop + px(36);
    doc
      .save()
      .lineWidth(px(1))
      .moveTo(right - sigW, sigLineY)
      .lineTo(right, sigLineY)
      .stroke(SLATE_400)
      .restore();
    drawRuns(
      doc,
      [
        {
          text: "AUTHORIZED SIGNATORY",
          style: { font: "BodyBold", size: px(9.5), color: NAVY, characterSpacing: px(9.5) * 0.14 },
        },
      ],
      right,
      sigLineY + px(6),
      "right",
    );
    drawRuns(
      doc,
      [
        {
          text: "Director / Secretary, EduDisha",
          style: { font: "BodyMedium", size: px(9), color: SLATE_500 },
        },
      ],
      right,
      sigLineY + px(20),
      "right",
    );

    // Disclaimer strip.
    doc
      .save()
      .lineWidth(px(1))
      .moveTo(left, stripY)
      .lineTo(right, stripY)
      .stroke(SLATE_100)
      .restore();
    drawRuns(
      doc,
      [
        {
          text: "Digitally issued • Verify authenticity by scanning the QR code or entering the Certificate ID on the public verification portal.",
          style: {
            font: "Body",
            size: px(8.5),
            color: SLATE_400,
            characterSpacing: px(8.5) * 0.025,
          },
        },
      ],
      cx,
      disclaimerY,
      "center",
    );

    doc.end();
  });
}
