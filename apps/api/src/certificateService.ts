import { randomBytes } from "node:crypto";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { supabaseAdmin } from "./supabaseClient.js";

const CERTIFICATE_BUCKET = "certificates";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids transcription errors

function generateCertificateCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return `NCCT-${code}`;
}

interface IssueCertificateParams {
  attemptId: string;
  assessmentId: string;
  traineeId: string;
}

/**
 * Called after a passing assessment_attempts insert. Derives the owning
 * programme/institution via assessment → module → course → programme,
 * builds a PDF (with an embedded QR linking to the public verification
 * page) and a unique certificate_code, uploads the PDF to the public
 * `certificates` Storage bucket, and inserts the certificate row.
 *
 * PRD only says "on pass" — it doesn't specify whether every passing
 * assessment (this repo's current per-module quizzes) should mint its own
 * certificate, or only a designated programme-capstone assessment. This
 * implements the literal reading (every pass certifies) since no
 * "capstone" concept exists anywhere in the schema; see docs/DATABASE.md's
 * Open Items if that turns out to be wrong.
 */
export async function issueCertificateForPassingAttempt({
  attemptId,
  assessmentId,
  traineeId,
}: IssueCertificateParams) {
  const { data: assessment, error: assessmentError } = await supabaseAdmin
    .from("assessments")
    .select("module_id, title")
    .eq("id", assessmentId)
    .single();
  if (assessmentError) throw new Error(assessmentError.message);

  const { data: module_, error: moduleError } = await supabaseAdmin
    .from("modules")
    .select("course_id")
    .eq("id", assessment.module_id)
    .single();
  if (moduleError) throw new Error(moduleError.message);

  const { data: course, error: courseError } = await supabaseAdmin
    .from("courses")
    .select("programme_id")
    .eq("id", module_.course_id)
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

  const qrPng = await QRCode.toBuffer(verificationUrl, { type: "png", width: 200 });
  const pdfBuffer = await renderCertificatePdf({
    traineeName: trainee.full_name || "Trainee",
    programmeTitle: programme.title,
    institutionName: institution.name,
    assessmentTitle: assessment.title,
    certificateCode,
    issuedAt: new Date(),
    qrPng,
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
      assessment_attempt_id: attemptId,
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
  assessmentTitle: string;
  certificateCode: string;
  issuedAt: Date;
  qrPng: Buffer;
}

function renderCertificatePdf(params: RenderCertificateParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .fontSize(10)
      .fillColor("#666")
      .text(params.institutionName, { align: "center" })
      .moveDown(2);

    doc
      .fontSize(24)
      .fillColor("#000")
      .text("Certificate of Completion", { align: "center" })
      .moveDown(1.5);

    doc
      .fontSize(12)
      .fillColor("#333")
      .text("This certifies that", { align: "center" })
      .moveDown(0.5);

    doc.fontSize(20).fillColor("#000").text(params.traineeName, { align: "center" }).moveDown(0.5);

    doc
      .fontSize(12)
      .fillColor("#333")
      .text(`has successfully passed "${params.assessmentTitle}"`, { align: "center" })
      .text(`in the programme "${params.programmeTitle}"`, { align: "center" })
      .moveDown(2);

    doc
      .fontSize(10)
      .fillColor("#666")
      .text(`Certificate ID: ${params.certificateCode}`, { align: "center" })
      .text(`Issued: ${params.issuedAt.toISOString().slice(0, 10)}`, { align: "center" })
      .moveDown(1.5);

    const qrSize = 100;
    doc.image(params.qrPng, doc.page.width / 2 - qrSize / 2, doc.y, {
      width: qrSize,
      height: qrSize,
    });

    doc.end();
  });
}
