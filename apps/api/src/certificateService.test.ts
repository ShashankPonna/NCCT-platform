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

// Notification fan-out is a fire-and-forget side effect (docs/DECISIONS.md
// #65) — mocked so it can't touch this file's table mocks, and so tests can
// assert the right trigger fires.
const notificationMocks = vi.hoisted(() => ({
  notify: vi.fn(() => Promise.resolve()),
  notifyNominationDecided: vi.fn(() => Promise.resolve()),
  notifyNominationSubmitted: vi.fn(() => Promise.resolve()),
  notifyLessonPublished: vi.fn(() => Promise.resolve()),
  notifyAssessmentAvailable: vi.fn(() => Promise.resolve()),
  notifySessionScheduled: vi.fn(() => Promise.resolve()),
  notifyHostelAssigned: vi.fn(() => Promise.resolve()),
  notifyJobShortlisted: vi.fn(() => Promise.resolve()),
  notifyJobInterestUpdated: vi.fn(() => Promise.resolve()),
  notifyTrainerAssigned: vi.fn(() => Promise.resolve()),
}));
vi.mock("./notificationService.js", () => notificationMocks);

function queue(table: string, data: unknown) {
  (singleResults[table] ??= []).push({ data, error: null });
}

beforeEach(() => {
  for (const fn of Object.values(notificationMocks)) fn.mockClear();
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

// Queues what loadCourseStructure reads, in order: the course, its modules,
// then lessons and assessments (the latter with each question's marks).
function queueStructure({
  modules = [{ id: "mod-1", title: "Module 1" }],
  lessons = [],
  assessments = [],
}: {
  modules?: { id: string; title: string }[];
  lessons?: { id: string }[];
  assessments?: {
    id: string;
    module_id?: string;
    kind?: "quiz" | "module_test";
    pass_threshold_percent?: number;
    marks?: number[];
  }[];
}) {
  queue("courses", { title: "Intro to Cooperative Banking", programme_id: "prog-1" });
  queue("modules", modules);
  if (modules.length === 0) return;
  queue("lessons", lessons);
  queue(
    "assessments",
    assessments.map((a) => ({
      id: a.id,
      module_id: a.module_id ?? "mod-1",
      title: a.id,
      kind: a.kind ?? "module_test",
      pass_threshold_percent: a.pass_threshold_percent ?? 60,
      max_attempts: null,
      assessment_questions: (a.marks ?? [1]).map((marks) => ({ marks })),
    })),
  );
}

function attempt(
  id: string,
  assessmentId: string,
  scorePercent: number,
  marksObtained: number,
  totalMarks: number,
  submittedAt: string,
) {
  return {
    id,
    assessment_id: assessmentId,
    trainee_id: "trainee-1",
    score_percent: scorePercent,
    passed: scorePercent >= 60,
    marks_obtained: marksObtained,
    total_marks: totalMarks,
    submitted_at: submittedAt,
  };
}

function insertedCertificate() {
  const builder = fromMock("certificates") as unknown as { insert: ReturnType<typeof vi.fn> };
  return builder.insert.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
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
    queueStructure({ modules: [] });

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("never certifies a course whose only content is a practice quiz", async () => {
    queue("certificates", null);
    queueStructure({ assessments: [{ id: "quiz-1", kind: "quiz" }] });

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("does not issue a certificate while some lessons are still incomplete", async () => {
    queue("certificates", null);
    queueStructure({ lessons: [{ id: "lesson-1" }, { id: "lesson-2" }] });
    queue("lesson_progress", [{ lesson_id: "lesson-1" }]); // only 1 of 2 lessons done

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("issues a certificate with no marks once every lesson is complete on a course with no module tests", async () => {
    queue("certificates", null);
    queueStructure({ lessons: [{ id: "lesson-1" }, { id: "lesson-2" }] });
    queue("lesson_progress", [{ lesson_id: "lesson-1" }, { lesson_id: "lesson-2" }]);
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
    // A real PDF was actually rendered, not mocked away.
    expect(buffer.length).toBeGreaterThan(100);
    expect(options).toMatchObject({ contentType: "application/pdf" });
    expect(insertedCertificate()).toMatchObject({
      assessment_attempt_id: null,
      marks_obtained: null,
      total_marks: null,
      score_percent: null,
    });
    expect(notificationMocks.notify).toHaveBeenCalledWith(
      ["trainee-1"],
      "certificate_issued",
      expect.objectContaining({ programme_id: "prog-1", certificate_code: expect.stringMatching(/^NCCT-/) }),
    );
  }, 15000);

  it("does not issue a certificate if lessons are done but a module test hasn't been passed", async () => {
    queue("certificates", null);
    queueStructure({
      lessons: [{ id: "lesson-1" }],
      assessments: [{ id: "assess-1" }, { id: "assess-2" }],
    });
    queue("lesson_progress", [{ lesson_id: "lesson-1" }]);
    queue("assessment_attempts", [attempt("attempt-1", "assess-1", 100, 1, 1, "2026-01-01")]);

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("issues a certificate carrying the best-attempt marks of every module test, ignoring practice quizzes", async () => {
    queue("certificates", null);
    queueStructure({
      modules: [
        { id: "mod-1", title: "Module 1" },
        { id: "mod-2", title: "Module 2" },
      ],
      lessons: [{ id: "lesson-1" }, { id: "lesson-2" }],
      assessments: [
        { id: "assess-1", module_id: "mod-1", marks: [5, 5] },
        { id: "quiz-1", module_id: "mod-1", kind: "quiz" },
        { id: "assess-2", module_id: "mod-2", marks: [10, 10, 10] },
      ],
    });
    queue("lesson_progress", [{ lesson_id: "lesson-1" }, { lesson_id: "lesson-2" }]);
    queue("assessment_attempts", [
      attempt("a1-fail", "assess-1", 50, 5, 10, "2026-01-01"),
      attempt("a1-pass", "assess-1", 100, 10, 10, "2026-01-02"),
      attempt("a2-pass", "assess-2", 67, 20, 30, "2026-01-03"),
    ]);
    queueIssuanceLookups();

    const result = await checkAndIssueCourseCertificate({
      traineeId: "trainee-1",
      courseId: "course-1",
    });

    expect(result).toMatchObject({ id: "cert-1" });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    // 10/10 + 20/30 = 30/40; the unattempted practice quiz is irrelevant.
    expect(insertedCertificate()).toMatchObject({
      assessment_attempt_id: "a2-pass",
      marks_obtained: 30,
      total_marks: 40,
      score_percent: 75,
    });
  }, 15000);

  it("propagates a Storage upload failure instead of inserting a certificate row", async () => {
    queue("certificates", null);
    queueStructure({ lessons: [{ id: "lesson-1" }] });
    queue("lesson_progress", [{ lesson_id: "lesson-1" }]);
    queue("courses", { title: "Intro to Cooperative Banking", programme_id: "prog-1" });
    queue("programmes", { title: "Programme", institution_id: "inst-1" });
    queue("institutions", { name: "Institution" });
    queue("profiles", { full_name: "Trainee" });
    uploadMock.mockResolvedValueOnce({ data: null, error: { message: "bucket not found" } });

    await expect(
      checkAndIssueCourseCertificate({ traineeId: "trainee-1", courseId: "course-1" }),
    ).rejects.toThrow("bucket not found");
    expect(notificationMocks.notify).not.toHaveBeenCalled();
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
