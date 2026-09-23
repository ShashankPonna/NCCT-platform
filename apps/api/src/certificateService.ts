import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { generateCode } from "./codeGenerator.js";
import { supabaseAdmin } from "./supabaseClient.js";

const CERTIFICATE_BUCKET = "certificates";

// assets/ is a sibling of src/ and dist/ at the apps/api root, so this
// resolves correctly whether this module runs from src (tsx) or dist (tsc
// build) without any asset-copy build step.
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");

function generateCertificateCode(): string {
  return `NCCT-${generateCode(8)}`;
}

/**
 * Checks whether a trainee has now completed an entire course — every lesson
 * across every module marked complete, and every module assessment (if any)
 * passed — and, if so, issues the course's certificate. Idempotent: a course
 * already certified for this trainee is a no-op, and this can safely be
 * called repeatedly from every event that could be the *last* one to
 * complete a course (a lesson marked done, or an assessment passed).
 *
 * Replaces the previous per-assessment-pass trigger (one certificate per
 * passed quiz) per direct user request — see docs/DECISIONS.md #37, which
 * also resolves the open question docs/DATABASE.md's certificates entry
 * used to flag about this.
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

  const { data: modules, error: modulesError } = await supabaseAdmin
    .from("modules")
    .select("id")
    .eq("course_id", courseId);
  if (modulesError) throw new Error(modulesError.message);
  const moduleIds = (modules ?? []).map((m) => m.id as string);
  if (moduleIds.length === 0) return null;

  const { data: lessons, error: lessonsError } = await supabaseAdmin
    .from("lessons")
    .select("id")
    .in("module_id", moduleIds);
  if (lessonsError) throw new Error(lessonsError.message);
  const lessonIds = (lessons ?? []).map((l) => l.id as string);

  if (lessonIds.length > 0) {
    const { data: completed, error: completedError } = await supabaseAdmin
      .from("lesson_progress")
      .select("lesson_id")
      .eq("trainee_id", traineeId)
      .in("lesson_id", lessonIds)
      .not("completed_at", "is", null);
    if (completedError) throw new Error(completedError.message);
    if ((completed ?? []).length < lessonIds.length) return null;
  }

  const { data: assessments, error: assessmentsError } = await supabaseAdmin
    .from("assessments")
    .select("id")
    .in("module_id", moduleIds);
  if (assessmentsError) throw new Error(assessmentsError.message);
  const assessmentIds = (assessments ?? []).map((a) => a.id as string);

  let lastPassingAttemptId: string | null = null;
  if (assessmentIds.length > 0) {
    const { data: attempts, error: attemptsError } = await supabaseAdmin
      .from("assessment_attempts")
      .select("id, assessment_id, submitted_at")
      .eq("trainee_id", traineeId)
      .eq("passed", true)
      .in("assessment_id", assessmentIds)
      .order("submitted_at", { ascending: true });
    if (attemptsError) throw new Error(attemptsError.message);
    const passedAssessmentIds = new Set((attempts ?? []).map((a) => a.assessment_id as string));
    if (passedAssessmentIds.size < assessmentIds.length) return null;
    lastPassingAttemptId =
      attempts && attempts.length > 0 ? (attempts[attempts.length - 1].id as string) : null;
  }

  return issueCertificateForCourse({ traineeId, courseId, lastPassingAttemptId });
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

async function issueCertificateForCourse({
  traineeId,
  courseId,
  lastPassingAttemptId,
}: {
  traineeId: string;
  courseId: string;
  lastPassingAttemptId: string | null;
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
  const publicWebUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:5173";
  const verificationUrl = `${publicWebUrl}/?verify=${certificateCode}`;

  const qrPng = await QRCode.toBuffer(verificationUrl, { type: "png", width: 240, margin: 0 });
  const pdfBuffer = await renderCertificatePdf({
    traineeName: trainee.full_name || "Trainee",
    programmeTitle: programme.title,
    institutionName: institution.name,
    courseTitle: course.title,
    certificateCode,
    issuedAt: new Date(),
    qrPng,
    verificationUrl,
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
    })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);

  return certificate;
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
}

// Palette matches the approved certificate design
// (docs/Certification Web REf/code.html): deep navy ink on white, with a
// single cooperative-sector orange accent. Kept as named constants so the
// draw helpers below read like the design spec rather than hex soup.
const NAVY = "#0f172a";
const ORANGE = "#f26522";
const SLATE_400 = "#94a3b8";
const SLATE_500 = "#64748b";
const SLATE_600 = "#475569";
const SLATE_700 = "#334155";
const SLATE_300 = "#cbd5e1";
const SLATE_200 = "#e2e8f0";
const SLATE_100 = "#f1f5f9";
const SLATE_50 = "#f8fafc";
const WHITE = "#ffffff";

function registerFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont("Title", path.join(FONTS_DIR, "Cinzel-ExtraBold.ttf"));
  doc.registerFont("TitleAlt", path.join(FONTS_DIR, "Cinzel-Bold.ttf"));
  doc.registerFont("Name", path.join(FONTS_DIR, "PlayfairDisplay-Bold.ttf"));
  doc.registerFont("NameLight", path.join(FONTS_DIR, "PlayfairDisplay-SemiBold.ttf"));
  doc.registerFont("Body", path.join(FONTS_DIR, "Roboto-Regular.ttf"));
  doc.registerFont("BodyMedium", path.join(FONTS_DIR, "Roboto-Medium.ttf"));
  doc.registerFont("BodyBold", path.join(FONTS_DIR, "Roboto-Bold.ttf"));
}

/** Faint diagonal cross-hatch across the whole page — the "guilloche /
 * security background" texture from the reference design, simulated with
 * plain strokes rather than an actual anti-counterfeiting pattern. */
function drawSecurityPattern(doc: PDFKit.PDFDocument, pageW: number, pageH: number) {
  const step = 14;
  doc.save();
  doc.opacity(0.05).lineWidth(0.5);
  for (let x = -pageH; x < pageW; x += step) {
    doc
      .moveTo(x, 0)
      .lineTo(x + pageH, pageH)
      .stroke(ORANGE);
  }
  for (let x = 0; x < pageW + pageH; x += step) {
    doc
      .moveTo(x, 0)
      .lineTo(x - pageH, pageH)
      .stroke(NAVY);
  }
  doc.restore();
}

function drawBorderFrame(doc: PDFKit.PDFDocument, pageW: number, pageH: number) {
  doc.save();
  doc
    .lineWidth(2)
    .rect(18, 18, pageW - 36, pageH - 36)
    .stroke(NAVY);
  doc
    .opacity(0.4)
    .lineWidth(1)
    .rect(26, 26, pageW - 52, pageH - 52)
    .stroke(ORANGE);
  doc
    .opacity(0.3)
    .lineWidth(0.75)
    .rect(32, 32, pageW - 64, pageH - 64)
    .stroke(NAVY);
  doc.restore();

  const size = 26;
  const inset = 24;
  const lw = 2;
  doc.save().lineWidth(lw).strokeColor(ORANGE);
  // top-left
  doc
    .moveTo(inset, inset + size)
    .lineTo(inset, inset)
    .lineTo(inset + size, inset)
    .stroke();
  // top-right
  doc
    .moveTo(pageW - inset - size, inset)
    .lineTo(pageW - inset, inset)
    .lineTo(pageW - inset, inset + size)
    .stroke();
  // bottom-left
  doc
    .moveTo(inset, pageH - inset - size)
    .lineTo(inset, pageH - inset)
    .lineTo(inset + size, pageH - inset)
    .stroke();
  // bottom-right
  doc
    .moveTo(pageW - inset - size, pageH - inset)
    .lineTo(pageW - inset, pageH - inset)
    .lineTo(pageW - inset, pageH - inset - size)
    .stroke();
  doc.restore();
}

/** The large, near-invisible central emblem behind the body text. */
function drawWatermark(doc: PDFKit.PDFDocument, cx: number, cy: number, diameter: number) {
  const scale = diameter / 200; // reference viewBox was 200x200, r=92 outer
  doc.save();
  doc.opacity(0.04);

  doc
    .lineWidth(2 * scale)
    .circle(cx, cy, 92 * scale)
    .stroke(NAVY);
  doc.dash(3 * scale, { space: 3 * scale });
  doc
    .lineWidth(1 * scale)
    .circle(cx, cy, 84 * scale)
    .stroke(ORANGE);
  doc.undash();
  doc
    .lineWidth(1.5 * scale)
    .circle(cx, cy, 68 * scale)
    .stroke(NAVY);

  const starPoints: [number, number][] = [
    [100, 28],
    [118, 78],
    [172, 78],
    [128, 110],
    [145, 162],
    [100, 130],
    [55, 162],
    [72, 110],
    [28, 78],
    [82, 78],
  ];
  const mapped: [number, number][] = starPoints.map(([px, py]) => [
    cx + (px - 100) * scale,
    cy + (py - 100) * scale,
  ]);
  doc
    .lineWidth(1.5 * scale)
    .polygon(...mapped)
    .stroke(NAVY);

  doc
    .lineWidth(1.5 * scale)
    .circle(cx, cy, 28 * scale)
    .stroke(NAVY);
  doc.restore();
}

/** The small circular institutional crest shown beside the letterhead text. */
function drawCrest(doc: PDFKit.PDFDocument, cx: number, cy: number, diameter: number) {
  const scale = diameter / 100; // reference viewBox was 100x100
  const map = (px: number, py: number): [number, number] => [
    cx + (px - 50) * scale,
    cy + (py - 50) * scale,
  ];

  doc.save();
  doc
    .circle(cx, cy, diameter / 2)
    .lineWidth(1.5)
    .stroke(SLATE_700)
    .fill(WHITE);

  doc
    .lineWidth(2 * scale)
    .circle(cx, cy, 44 * scale)
    .stroke(NAVY);
  doc.dash(2 * scale, { space: 2 * scale });
  doc
    .lineWidth(1.5 * scale)
    .circle(cx, cy, 39 * scale)
    .stroke(ORANGE);
  doc.undash();
  doc
    .lineWidth(2.5 * scale)
    .circle(cx, cy, 16 * scale)
    .stroke(NAVY);
  doc.circle(cx, cy, 6 * scale).fill(ORANGE);

  // 4 full-diameter lines through the centre = 8 spokes
  const spokes: [number, number, number, number][] = [
    [50, 6, 50, 94],
    [6, 50, 94, 50],
    [19, 19, 81, 81],
    [19, 81, 81, 19],
  ];
  doc.lineWidth(1.2 * scale).strokeColor(NAVY);
  for (const [x1, y1, x2, y2] of spokes) {
    const [mx1, my1] = map(x1, y1);
    const [mx2, my2] = map(x2, y2);
    doc.moveTo(mx1, my1).lineTo(mx2, my2).stroke();
  }

  // wheat / leaf garland hints
  doc
    .lineWidth(1.8 * scale)
    .strokeColor(ORANGE)
    .lineCap("round");
  const [lx0, ly0] = map(22, 65);
  const [lc1x, lc1y] = map(18, 50);
  const [lc2x, lc2y] = map(22, 35);
  const [lx1, ly1] = map(32, 25);
  doc.moveTo(lx0, ly0).bezierCurveTo(lc1x, lc1y, lc2x, lc2y, lx1, ly1).stroke();
  const [rx0, ry0] = map(78, 65);
  const [rc1x, rc1y] = map(82, 50);
  const [rc2x, rc2y] = map(78, 35);
  const [rx1, ry1] = map(68, 25);
  doc.moveTo(rx0, ry0).bezierCurveTo(rc1x, rc1y, rc2x, rc2y, rx1, ry1).stroke();
  doc.restore();
}

function drawRibbonDivider(doc: PDFKit.PDFDocument, cx: number, cy: number, width: number) {
  doc.save();
  doc.lineWidth(1).strokeColor(SLATE_300);
  doc
    .moveTo(cx - width, cy)
    .lineTo(cx - 6, cy)
    .stroke();
  doc
    .moveTo(cx + 6, cy)
    .lineTo(cx + width, cy)
    .stroke();
  doc.save();
  doc.translate(cx, cy).rotate(45);
  doc.rect(-3, -3, 6, 6).fill(ORANGE);
  doc.restore();
  doc.restore();
}

/** A stylised fountain-pen signature flourish (no real individual is
 * depicted — this is a generic authorised-signatory mark, matching the
 * approved design). */
function drawSignatureFlourish(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  const scale = width / 160; // reference viewBox was 160x50
  const map = (px: number, py: number): [number, number] => [x + px * scale, y + py * scale];
  doc.save();
  doc
    .opacity(0.85)
    .lineWidth(1.8 * scale)
    .strokeColor(SLATE_700)
    .lineCap("round")
    .lineJoin("round");
  const pts = [
    [15, 35],
    [30, 20, 25, 10, 40, 18],
    [55, 26, 45, 42, 60, 30],
    [75, 18, 70, 38, 85, 24],
    [100, 10, 95, 32, 110, 26],
    [120, 22, 135, 15, 145, 28],
  ];
  const [startX, startY] = map(pts[0][0], pts[0][1]);
  doc.moveTo(startX, startY);
  for (let i = 1; i < pts.length; i++) {
    const [c1x, c1y, c2x, c2y, ex, ey] = pts[i];
    const [mc1x, mc1y] = map(c1x, c1y);
    const [mc2x, mc2y] = map(c2x, c2y);
    const [mex, mey] = map(ex, ey);
    doc.bezierCurveTo(mc1x, mc1y, mc2x, mc2y, mex, mey);
  }
  doc.stroke();
  const [ux1, uy1] = map(45, 28);
  const [ux2, uy2] = map(140, 28);
  doc.moveTo(ux1, uy1).lineTo(ux2, uy2).stroke();
  doc.restore();
}

function drawSeal(doc: PDFKit.PDFDocument, cx: number, cy: number, diameter: number) {
  doc.save();
  doc.opacity(0.9);
  doc.dash(3, { space: 2 });
  doc
    .lineWidth(1.5)
    .circle(cx, cy, diameter / 2)
    .stroke(ORANGE);
  doc.undash();
  doc
    .lineWidth(1)
    .circle(cx, cy, diameter / 2 - 5)
    .stroke(SLATE_400);

  doc.font("BodyBold").fontSize(6.5).fillColor(NAVY);
  doc.text("NCCT", cx - diameter / 2, cy - 10, { width: diameter, align: "center" });
  doc.font("BodyBold").fontSize(6).fillColor(ORANGE);
  doc.text("★ SEAL ★", cx - diameter / 2, cy - 1, { width: diameter, align: "center" });
  doc.font("BodyBold").fontSize(6.5).fillColor(NAVY);
  doc.text("OFFICIAL", cx - diameter / 2, cy + 8, { width: diameter, align: "center" });
  doc.restore();
}

function renderCertificatePdf(params: RenderCertificateParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 50, bottom: 30, left: 76, right: 76 },
    });
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentX = 76;
    const contentWidth = pageW - contentX * 2;

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    registerFonts(doc);

    // Background + security layers first, so all text/shapes draw on top.
    doc.rect(0, 0, pageW, pageH).fill(WHITE);
    drawSecurityPattern(doc, pageW, pageH);
    drawWatermark(doc, pageW / 2, pageH / 2, 300);
    drawBorderFrame(doc, pageW, pageH);

    // ---- HEADER ----
    const crestDiameter = 56;
    const headerTopY = 40;

    doc.font("BodyBold").fontSize(8);
    const topLine = "NATIONAL COUNCIL FOR COOPERATIVE TRAINING (NCCT)";
    doc.font("BodyBold").fontSize(13);
    const nameLineWidth = Math.min(doc.widthOfString(params.institutionName.toUpperCase()), 460);
    const topLineWidth = Math.min(doc.font("BodyBold").fontSize(8).widthOfString(topLine), 460);
    const subLine1 =
      "AN AUTONOMOUS INSTITUTION PROMOTED BY MINISTRY OF COOPERATION, GOVT. OF INDIA";
    doc.font("Body").fontSize(7);
    const subLineWidth = Math.min(doc.widthOfString(subLine1), 460);

    const textBlockWidth = Math.max(nameLineWidth, topLineWidth, subLineWidth, 260);
    const gap = 16;
    const groupWidth = crestDiameter + gap + textBlockWidth;
    const groupStartX = pageW / 2 - groupWidth / 2;
    const crestCx = groupStartX + crestDiameter / 2;
    const crestCy = headerTopY + crestDiameter / 2;
    const textBlockX = groupStartX + crestDiameter + gap;

    drawCrest(doc, crestCx, crestCy, crestDiameter);

    let ty = headerTopY;
    doc
      .font("BodyBold")
      .fontSize(8)
      .fillColor(SLATE_500)
      .text(topLine, textBlockX, ty, { width: textBlockWidth, characterSpacing: 1 });
    ty += 13;
    doc
      .font("BodyBold")
      .fontSize(14)
      .fillColor(NAVY)
      .text(params.institutionName.toUpperCase(), textBlockX, ty, { width: textBlockWidth });
    ty = doc.y + 2;
    doc
      .font("Body")
      .fontSize(7)
      .fillColor(SLATE_600)
      .text(subLine1 + "  ", textBlockX, ty, { width: textBlockWidth, continued: true })
      .font("BodyBold")
      .fillColor(ORANGE)
      .text("• RICM / ICM NETWORK");

    const headerBottomY = Math.max(doc.y, crestCy + crestDiameter / 2) + 10;
    drawRibbonDivider(doc, pageW / 2, headerBottomY, 90);

    doc
      .font("Title")
      .fontSize(26)
      .fillColor(NAVY)
      .text("CERTIFICATE OF COMPLETION", contentX, headerBottomY + 10, {
        width: contentWidth,
        align: "center",
        characterSpacing: 3,
      });

    // ---- BODY ----
    let by = doc.y + 18;
    doc
      .font("BodyMedium")
      .fontSize(11)
      .fillColor(SLATE_600)
      .text("THIS CERTIFIES THAT", contentX, by, {
        width: contentWidth,
        align: "center",
        characterSpacing: 1.5,
      });

    by = doc.y + 10;
    doc
      .font("Name")
      .fontSize(34)
      .fillColor(NAVY)
      .text(params.traineeName.toUpperCase(), contentX, by, {
        width: contentWidth,
        align: "center",
      });
    by = doc.y + 8;
    drawRibbonDivider(doc, pageW / 2, by, 70);

    by += 20;
    doc.font("Body").fontSize(11).fillColor(SLATE_700);
    doc.text("has successfully completed the course", contentX, by, {
      width: contentWidth,
      align: "center",
    });
    doc
      .font("BodyBold")
      .fillColor(NAVY)
      .text(params.courseTitle, contentX, doc.y, { width: contentWidth, align: "center" });
    doc
      .font("Body")
      .fillColor(SLATE_700)
      .text("in the programme", contentX, doc.y + 4, {
        width: contentWidth,
        align: "center",
      });
    doc
      .font("BodyMedium")
      .fillColor(NAVY)
      .text(params.programmeTitle, contentX, doc.y, { width: contentWidth, align: "center" });

    const badgeY = doc.y + 14;
    const badgeLabel = "Credential Status: COURSE COMPLETED";
    doc.font("BodyBold").fontSize(9);
    // widthOfString ignores characterSpacing, so the render call below must
    // not use it either — otherwise the box is sized too small and the
    // label wraps to a second line (caught by rendering and inspecting a
    // real PDF, not just asserting a byte count).
    const badgeTextWidth = doc.widthOfString(badgeLabel.toUpperCase());
    const badgeWidth = badgeTextWidth + 56;
    const badgeX = pageW / 2 - badgeWidth / 2;
    doc.roundedRect(badgeX, badgeY, badgeWidth, 22, 4).fillAndStroke(SLATE_50, SLATE_200);
    doc.circle(badgeX + 16, badgeY + 11, 3).fill(ORANGE);
    doc
      .font("BodyBold")
      .fontSize(9)
      .fillColor(NAVY)
      .text(badgeLabel.toUpperCase(), badgeX + 26, badgeY + 6, {
        width: badgeWidth - 40,
        lineBreak: false,
      });

    // ---- FOOTER ----
    // Every y-coordinate below is an explicit fixed offset from colY, not a
    // chained doc.y — chaining across three side-by-side columns previously
    // let the centre column's accumulated height push the last line (and
    // everything drawn after it, in later columns) past the bottom margin,
    // which silently spilled onto a second page. Caught by actually
    // rendering the PDF and looking at it, not by the byte-length test.
    // The whole footer (column row + legal footnote) is laid out as one
    // stack measured from colY downward, rather than two blocks each
    // independently anchored to the bottom margin — that previously let the
    // footnote's full-width divider land at a fixed distance from the
    // bottom that, for a given colY, cut straight through the certificate
    // code text above it. Caught by rendering a real PDF and looking at it.
    const colW = contentWidth / 3;
    const colY = pageH - 40 - 105;
    const footerDividerY = colY - 14;
    const footnoteDividerY = colY + 91;
    const footnoteY = footnoteDividerY + 6;
    doc
      .save()
      .lineWidth(0.75)
      .moveTo(contentX, footerDividerY)
      .lineTo(pageW - contentX, footerDividerY)
      .stroke(SLATE_200)
      .restore();

    // Left column: QR + verification info
    const qrSize = 52;
    doc.image(params.qrPng, contentX, colY, { width: qrSize, height: qrSize });
    const leftTextX = contentX + qrSize + 12;
    const leftTextWidth = colW - qrSize - 12;
    doc
      .font("BodyBold")
      .fontSize(8)
      .fillColor(NAVY)
      .text("SCAN TO VERIFY", leftTextX, colY + 2, { width: leftTextWidth, characterSpacing: 0.5 });
    doc
      .font("Body")
      .fontSize(7)
      .fillColor(SLATE_500)
      .text("Public verification portal", leftTextX, colY + 15, { width: leftTextWidth });
    doc
      .font("BodyMedium")
      .fontSize(6.5)
      .fillColor(ORANGE)
      .text(
        new URL(params.verificationUrl).host + new URL(params.verificationUrl).pathname,
        leftTextX,
        colY + 26,
        {
          width: leftTextWidth,
        },
      );

    // Centre column: seal + certificate ID + issue date
    const centerCx = contentX + colW + colW / 2;
    drawSeal(doc, centerCx, colY + 20, 40);
    doc
      .font("BodyMedium")
      .fontSize(7.5)
      .fillColor(SLATE_500)
      .text("Certificate ID", contentX + colW, colY + 48, { width: colW, align: "center" });
    doc
      .font("BodyBold")
      .fontSize(8.5)
      .fillColor(NAVY)
      .text(params.certificateCode, contentX + colW, colY + 59, { width: colW, align: "center" });
    doc
      .font("Body")
      .fontSize(7)
      .fillColor(SLATE_500)
      .text(
        `Issued ${params.issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
        contentX + colW,
        colY + 73,
        { width: colW, align: "center" },
      );

    // Right column: signature
    const rightColX = contentX + colW * 2;
    drawSignatureFlourish(doc, rightColX + colW / 2 - 50, colY - 2, 100);
    doc
      .save()
      .lineWidth(0.75)
      .moveTo(rightColX + 8, colY + 32)
      .lineTo(rightColX + colW - 8, colY + 32)
      .stroke(NAVY)
      .restore();
    doc
      .font("BodyBold")
      .fontSize(8.5)
      .fillColor(NAVY)
      .text("AUTHORIZED SIGNATORY", rightColX, colY + 38, {
        width: colW,
        align: "center",
        characterSpacing: 0.5,
      });
    doc
      .font("Body")
      .fontSize(7)
      .fillColor(SLATE_500)
      .text("Director / Secretary, NCCT", rightColX, colY + 50, { width: colW, align: "center" });

    // Legal footnote
    doc
      .save()
      .lineWidth(0.5)
      .moveTo(contentX, footnoteDividerY)
      .lineTo(pageW - contentX, footnoteDividerY)
      .stroke(SLATE_100)
      .restore();
    doc
      .font("Body")
      .fontSize(6.5)
      .fillColor(SLATE_400)
      .text(
        "National Council for Cooperative Training (NCCT) • Ministry of Cooperation, Government of India",
        contentX,
        footnoteY,
        {
          width: contentWidth / 2,
        },
      );
    doc
      .font("Body")
      .fontSize(6.5)
      .fillColor(SLATE_400)
      .text(
        "Digitally Issued • Verifiable via QR / Certificate ID",
        contentX + contentWidth / 2,
        footnoteY,
        {
          width: contentWidth / 2,
          align: "right",
        },
      );

    doc.end();
  });
}
