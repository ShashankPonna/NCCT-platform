import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueCertificateForPassingAttempt } from "./certificateService.js";

const { fromMock, uploadMock, storageMock, singleResults } = vi.hoisted(() => {
  // Each call to supabaseAdmin.from(table)... .single() resolves with the
  // next entry queued for that table — lets each test set up the exact
  // chain of lookups issueCertificateForPassingAttempt makes (assessment →
  // module → course → programme → institution → profile) independently.
  const singleResults: Record<string, { data: unknown; error: unknown }[]> = {};

  function nextResult(table: string) {
    const queue = singleResults[table];
    return queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
  }

  function createTableMock(table: string) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "insert", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => Promise.resolve(nextResult(table)));
    return builder;
  }

  const tableBuilders: Record<string, ReturnType<typeof createTableMock>> = {};
  const fromMock = vi.fn((table: string) => {
    tableBuilders[table] ??= createTableMock(table);
    return tableBuilders[table];
  });

  type UploadResult = { data: { path: string } | null; error: { message: string } | null };
  const uploadMock = vi.fn(
    (
      ...args: [string, Buffer, { contentType: string; upsert: boolean }]
    ): Promise<UploadResult> => {
      void args;
      return Promise.resolve({ data: { path: "x" }, error: null });
    },
  );
  const storageMock = { from: vi.fn(() => ({ upload: uploadMock })) };

  return { fromMock, uploadMock, storageMock, singleResults };
});

vi.mock("./supabaseClient.js", () => ({
  supabaseAdmin: { from: fromMock, storage: storageMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function queue(table: string, data: unknown) {
  (singleResults[table] ??= []).push({ data, error: null });
}

beforeEach(() => {
  fromMock.mockClear();
  uploadMock.mockClear();
  for (const key of Object.keys(singleResults)) delete singleResults[key];
});

describe("issueCertificateForPassingAttempt", () => {
  it("derives programme/institution via the assessment→module→course→programme chain and inserts a certificate", async () => {
    queue("assessments", { module_id: "mod-1", title: "Quiz 1" });
    queue("modules", { course_id: "course-1" });
    queue("courses", { programme_id: "prog-1" });
    queue("programmes", { title: "Cooperative Management Basics", institution_id: "inst-1" });
    queue("institutions", { name: "VAMNICOM" });
    queue("profiles", { full_name: "Asha Patil" });
    queue("certificates", {
      id: "cert-1",
      certificate_code: "NCCT-XXXXXXXX",
      assessment_attempt_id: "attempt-1",
      trainee_id: "trainee-1",
      programme_id: "prog-1",
      issuing_institution_id: "inst-1",
      pdf_storage_path: "NCCT-XXXXXXXX.pdf",
    });

    const certificate = await issueCertificateForPassingAttempt({
      attemptId: "attempt-1",
      assessmentId: "assess-1",
      traineeId: "trainee-1",
    });

    expect(certificate).toMatchObject({ id: "cert-1", programme_id: "prog-1" });
    // A real PDF was actually rendered and handed to Storage — not mocked
    // away — so this also catches a pdfkit/qrcode wiring mistake.
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, buffer, options] = uploadMock.mock.calls[0];
    expect(path).toMatch(/^NCCT-[A-Z0-9]{8}\.pdf$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(options).toMatchObject({ contentType: "application/pdf" });
  }, 15000);

  it("propagates a Storage upload failure instead of inserting a certificate row", async () => {
    queue("assessments", { module_id: "mod-1", title: "Quiz 1" });
    queue("modules", { course_id: "course-1" });
    queue("courses", { programme_id: "prog-1" });
    queue("programmes", { title: "Programme", institution_id: "inst-1" });
    queue("institutions", { name: "Institution" });
    queue("profiles", { full_name: "Trainee" });
    uploadMock.mockResolvedValueOnce({ data: null, error: { message: "bucket not found" } });

    await expect(
      issueCertificateForPassingAttempt({
        attemptId: "attempt-1",
        assessmentId: "assess-1",
        traineeId: "trainee-1",
      }),
    ).rejects.toThrow("bucket not found");
  }, 15000);
});
