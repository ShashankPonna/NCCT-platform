import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkAndIssueCourseCertificate,
  checkAndIssueCourseCertificateForAssessment,
  checkAndIssueCourseCertificateForLesson,
} from "./certificateService.js";

// Every .from(table) call consumes the next queued result for that table,
// in the exact order the code under test issues its queries — mirrors real
// supabase-js in one important way this test relies on: a filter chain
// (.eq()/.in()/.not()/.order()) is itself awaitable without a trailing
// .single()/.maybeSingle(), same as the real PostgrestFilterBuilder.
const { fromMock, uploadMock, storageMock, singleResults } = vi.hoisted(() => {
  const singleResults: Record<string, { data: unknown; error: unknown }[]> = {};

  function nextResult(table: string) {
    const queue = singleResults[table];
    return queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
  }

  function createTableMock(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "insert", "eq", "in", "not", "order"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => Promise.resolve(nextResult(table)));
    builder.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
    // Makes the builder itself awaitable for chains with no trailing
    // .single()/.maybeSingle() (e.g. `.select("id").in("module_id", ids)`).
    builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(nextResult(table)).then(resolve, reject);
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

// Queues the chain issueCertificateForCourse walks once completion is
// detected: courses → programmes → institutions → profiles, then the
// certificates insert.
function queueIssuanceLookups() {
  queue("courses", { title: "Intro to Cooperative Banking", programme_id: "prog-1" });
  queue("programmes", { title: "Cooperative Management Basics", institution_id: "inst-1" });
  queue("institutions", { name: "VAMNICOM" });
  queue("profiles", { full_name: "Asha Patil" });
  queue("certificates", {
    id: "cert-1",
    certificate_code: "NCCT-XXXXXXXX",
    course_id: "course-1",
    trainee_id: "trainee-1",
    programme_id: "prog-1",
    issuing_institution_id: "inst-1",
    pdf_storage_path: "NCCT-XXXXXXXX.pdf",
  });
}

describe("checkAndIssueCourseCertificate", () => {
  it("is a no-op if this trainee is already certified for the course", async () => {
    queue("certificates", { id: "existing-cert" }); // existence check finds one

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
    // Only the existence check should have run — nothing else looked up.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op if the course has no modules at all", async () => {
    queue("certificates", null);
    queue("modules", []);

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("does not issue a certificate while some lessons are still incomplete", async () => {
    queue("certificates", null);
    queue("modules", [{ id: "mod-1" }]);
    queue("lessons", [{ id: "lesson-1" }, { id: "lesson-2" }]);
    queue("lesson_progress", [{ lesson_id: "lesson-1" }]); // only 1 of 2 lessons done

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("issues a certificate once every lesson is complete on a course with no assessments", async () => {
    queue("certificates", null);
    queue("modules", [{ id: "mod-1" }]);
    queue("lessons", [{ id: "lesson-1" }, { id: "lesson-2" }]);
    queue("lesson_progress", [{ lesson_id: "lesson-1" }, { lesson_id: "lesson-2" }]);
    queue("assessments", []); // no assessments on this course — nothing to pass
    queueIssuanceLookups();

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toMatchObject({ id: "cert-1", course_id: "course-1" });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, buffer, options] = uploadMock.mock.calls[0];
    expect(path).toMatch(/^NCCT-[A-Z0-9]{8}\.pdf$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    // A real PDF was actually rendered, not mocked away — catches a real
    // pdfkit/qrcode wiring mistake, same reasoning the old test had.
    expect(buffer.length).toBeGreaterThan(100);
    expect(options).toMatchObject({ contentType: "application/pdf" });
  }, 15000);

  it("does not issue a certificate if lessons are done but an assessment hasn't been passed", async () => {
    queue("certificates", null);
    queue("modules", [{ id: "mod-1" }]);
    queue("lessons", [{ id: "lesson-1" }]);
    queue("lesson_progress", [{ lesson_id: "lesson-1" }]);
    queue("assessments", [{ id: "assess-1" }, { id: "assess-2" }]);
    queue("assessment_attempts", [
      { id: "attempt-1", assessment_id: "assess-1", submitted_at: "2026-01-01" },
    ]); // only 1 of 2 passed

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("issues a certificate once every lesson is complete and every assessment is passed", async () => {
    queue("certificates", null);
    queue("modules", [{ id: "mod-1" }, { id: "mod-2" }]);
    queue("lessons", [{ id: "lesson-1" }, { id: "lesson-2" }]);
    queue("lesson_progress", [{ lesson_id: "lesson-1" }, { lesson_id: "lesson-2" }]);
    queue("assessments", [{ id: "assess-1" }, { id: "assess-2" }]);
    queue("assessment_attempts", [
      { id: "attempt-1", assessment_id: "assess-1", submitted_at: "2026-01-01" },
      { id: "attempt-2", assessment_id: "assess-2", submitted_at: "2026-01-02" },
    ]);
    queueIssuanceLookups();

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toMatchObject({ id: "cert-1" });
    expect(uploadMock).toHaveBeenCalledTimes(1);
  }, 15000);

  it("propagates a Storage upload failure instead of inserting a certificate row", async () => {
    // A course with lessons complete and no assessments, but Storage fails.
    queue("certificates", null);
    queue("modules", [{ id: "mod-1" }]);
    queue("lessons", [{ id: "lesson-1" }]);
    queue("lesson_progress", [{ lesson_id: "lesson-1" }]);
    queue("assessments", []);
    queue("courses", { title: "Intro to Cooperative Banking", programme_id: "prog-1" });
    queue("programmes", { title: "Programme", institution_id: "inst-1" });
    queue("institutions", { name: "Institution" });
    queue("profiles", { full_name: "Trainee" });
    uploadMock.mockResolvedValueOnce({ data: null, error: { message: "bucket not found" } });

    await expect(
      checkAndIssueCourseCertificate({ traineeId: "trainee-1", courseId: "course-1" }),
    ).rejects.toThrow("bucket not found");
  }, 15000);
});

describe("checkAndIssueCourseCertificateForLesson", () => {
  it("resolves the lesson's course and delegates to checkAndIssueCourseCertificate", async () => {
    queue("lessons", { module_id: "mod-1" });
    queue("modules", { course_id: "course-1" });
    queue("certificates", { id: "existing-cert" }); // already certified — short-circuits cleanly

    const result = await checkAndIssueCourseCertificateForLesson({
      traineeId: "trainee-1",
      lessonId: "lesson-1",
    });

    expect(result).toBeNull();
  });
});

describe("checkAndIssueCourseCertificateForAssessment", () => {
  it("resolves the assessment's course and delegates to checkAndIssueCourseCertificate", async () => {
    queue("assessments", { module_id: "mod-1" });
    queue("modules", { course_id: "course-1" });
    queue("certificates", { id: "existing-cert" }); // already certified — short-circuits cleanly

    const result = await checkAndIssueCourseCertificateForAssessment({
      traineeId: "trainee-1",
      assessmentId: "assess-1",
    });

    expect(result).toBeNull();
  });
});
