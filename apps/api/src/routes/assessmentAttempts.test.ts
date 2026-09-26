import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentAttemptsRouter } from "./assessmentAttempts.js";

const {
  getUserMock,
  profilesMock,
  assessmentsMock,
  questionsMock,
  attemptsMock,
  programmeTrainersMock,
  fromMock,
} = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown; count?: number | null } = {
      data: null,
      error: null,
      count: null,
    };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      // Lets a chain with no terminal .single()/.maybeSingle()/.order() call
      // (the attempt-count query below) still resolve when awaited directly
      // — same {data,error} shape, plus `count` for that one query.
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of ["select", "insert", "update", "delete", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const assessmentsMock = createTableMock();
  const questionsMock = createTableMock();
  const attemptsMock = createTableMock();
  const programmeTrainersMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    assessments: assessmentsMock,
    assessment_questions: questionsMock,
    assessment_attempts: attemptsMock,
    programme_trainers: programmeTrainersMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return {
    getUserMock,
    profilesMock,
    assessmentsMock,
    questionsMock,
    attemptsMock,
    programmeTrainersMock,
    fromMock,
  };
});

const issueCertificateMock = vi.hoisted(() => vi.fn());

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

vi.mock("../certificateService.js", () => ({
  checkAndIssueCourseCertificateForAssessment: issueCertificateMock,
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", assessmentAttemptsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

const twoQuestions = [
  { id: "q-1", correct_option_id: "a", marks: 1 },
  { id: "q-2", correct_option_id: "b", marks: 1 },
];

function moduleTestFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "assess-1",
    kind: "module_test",
    pass_threshold_percent: 60,
    max_attempts: null,
    ...overrides,
  };
}

beforeEach(() => {
  getUserMock.mockReset();
  issueCertificateMock.mockReset();
  for (const mock of [profilesMock, assessmentsMock, questionsMock, attemptsMock, programmeTrainersMock]) {
    mock.result.data = null;
    mock.result.error = null;
    mock.result.count = null;
    mock.builder.insert.mockClear();
  }
});

describe("POST /api/assessments/:id/attempts", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .send({ answers: {} });
    expect(res.status).toBe(401);
  });

  it("returns 403 for an admin (only trainees take assessments)", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: {} });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the assessment does not exist", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = null;

    const res = await request(buildApp())
      .post("/api/assessments/missing/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: {} });

    expect(res.status).toBe(404);
  });

  it("returns 400 when the assessment has no questions", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture();
    questionsMock.result.data = [];

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: {} });

    expect(res.status).toBe(400);
  });

  it("returns 409 once the trainee has used up their attempt limit", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture({ max_attempts: 2 });
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.count = 2;

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "b" } });

    expect(res.status).toBe(409);
    expect(res.body.attemptLimitReached).toBe(true);
    expect(attemptsMock.builder.insert).not.toHaveBeenCalled();
    expect(issueCertificateMock).not.toHaveBeenCalled();
  });

  it("allows the attempt exactly at the limit boundary (used count below max)", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture({ max_attempts: 2 });
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.count = 1;
    attemptsMock.result.data = { id: "attempt-1", score_percent: 100, passed: true };

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "b" } });

    expect(res.status).toBe(201);
  });

  it("grades correctly by marks, fails below threshold, and never calls certificate issuance", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture();
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = {
      id: "attempt-1",
      assessment_id: "assess-1",
      trainee_id: "trainee-1",
      score_percent: 50,
      marks_obtained: 1,
      total_marks: 2,
      passed: false,
    };

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "wrong" } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      attempt: { score_percent: 50, passed: false },
      certificate: null,
    });
    // Correct answers are never handed back on a graded module test, even
    // in the per-question breakdown.
    expect(res.body.breakdown).toHaveLength(2);
    expect(res.body.breakdown[0]).not.toHaveProperty("correct_option_id");
    expect(res.body.breakdown).toMatchObject([
      { question_id: "q-1", is_correct: true, marks: 1, marks_awarded: 1 },
      { question_id: "q-2", is_correct: false, marks: 1, marks_awarded: 0 },
    ]);
    expect(issueCertificateMock).not.toHaveBeenCalled();
  });

  it("reveals correct answers in the breakdown for a practice quiz", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture({ kind: "quiz" });
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = { id: "attempt-1", score_percent: 100, passed: true };

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "b" } });

    expect(res.status).toBe(201);
    expect(res.body.breakdown[0]).toMatchObject({ correct_option_id: "a" });
  });

  it("never triggers certificate issuance for a passed practice quiz, even at 100%", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture({ kind: "quiz" });
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = { id: "attempt-1", score_percent: 100, passed: true };

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "b" } });

    expect(res.status).toBe(201);
    expect(res.body.certificate).toBeNull();
    expect(issueCertificateMock).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied score/passed and computes its own from the correct answers", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture();
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = {
      id: "attempt-1",
      score_percent: 100,
      passed: true,
    };
    issueCertificateMock.mockResolvedValue({ certificate_code: "EDU-ABC12345" });

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      // client tries to claim a failing score is actually a perfect pass
      .send({ answers: { "q-1": "a", "q-2": "b" }, score_percent: 0, passed: false });

    expect(res.status).toBe(201);
    expect(res.body.attempt).toMatchObject({ score_percent: 100, passed: true });
  });

  it("passes at exactly the threshold and checks course completion, which issues a certificate here", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture({ pass_threshold_percent: 50 });
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = {
      id: "attempt-1",
      assessment_id: "assess-1",
      trainee_id: "trainee-1",
      score_percent: 50,
      passed: true,
    };
    issueCertificateMock.mockResolvedValue({ certificate_code: "EDU-ABC12345" });

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "wrong" } });

    expect(res.status).toBe(201);
    expect(res.body.certificate).toMatchObject({ certificate_code: "EDU-ABC12345" });
    expect(issueCertificateMock).toHaveBeenCalledWith({
      assessmentId: "assess-1",
      traineeId: "trainee-1",
    });
  });

  it("passes but the certificate stays null when the rest of the course isn't complete yet", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture({ pass_threshold_percent: 50 });
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = {
      id: "attempt-1",
      assessment_id: "assess-1",
      trainee_id: "trainee-1",
      score_percent: 50,
      passed: true,
    };
    // checkAndIssueCourseCertificateForAssessment resolving null is the
    // normal, expected outcome of a pass that doesn't complete the course.
    issueCertificateMock.mockResolvedValue(null);

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "wrong" } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ attempt: { passed: true }, certificate: null });
    expect(res.body.certificateError).toBeUndefined();
  });

  it("still returns 201 with the graded attempt if certificate issuance throws", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = moduleTestFixture({ pass_threshold_percent: 50 });
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = { id: "attempt-1", score_percent: 100, passed: true };
    issueCertificateMock.mockRejectedValue(new Error("Storage upload failed"));

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "b" } });

    expect(res.status).toBe(201);
    expect(res.body.certificate).toBeNull();
    expect(res.body.certificateError).toContain("Storage upload failed");
  });
});

describe("POST /api/assessments/:id/preview", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/preview")
      .send({ answers: {} });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee (staff-only)", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/preview")
      .set("Authorization", "Bearer token")
      .send({ answers: {} });
    expect(res.status).toBe(403);
  });

  it("grades like a real attempt, reveals the answer key, and records nothing", async () => {
    authenticateAs("admin-1", "admin");
    assessmentsMock.result.data = moduleTestFixture({ pass_threshold_percent: 50 });
    questionsMock.result.data = twoQuestions;

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/preview")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "wrong" } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      marks_obtained: 1,
      total_marks: 2,
      score_percent: 50,
      passed: true,
    });
    expect(res.body.breakdown[1]).toMatchObject({ correct_option_id: "b", is_correct: false });
    expect(attemptsMock.builder.insert).not.toHaveBeenCalled();
    expect(issueCertificateMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a trainer not assigned to the assessment's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    assessmentsMock.result.data = { modules: { courses: { programme_id: "prog-1" } } };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/preview")
      .set("Authorization", "Bearer token")
      .send({ answers: {} });

    expect(res.status).toBe(403);
  });

  it("grades for a trainer assigned to the assessment's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    programmeTrainersMock.result.data = { trainer_id: "trainer-1" };
    // Shared mock: requireProgrammeAccess's resolver read and this route's
    // own grading-context read both go through the `assessments` table, so
    // one object has to satisfy both.
    assessmentsMock.result.data = {
      ...moduleTestFixture(),
      modules: { courses: { programme_id: "prog-1" } },
    };
    questionsMock.result.data = twoQuestions;

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/preview")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "b" } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ marks_obtained: 2, total_marks: 2, score_percent: 100 });
  });
});

describe("GET /api/assessments/:id/attempts", () => {
  it("returns 403 for an admin", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .get("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("lists the trainee's own attempts", async () => {
    authenticateAs("trainee-1", "trainee");
    attemptsMock.result.data = [{ id: "attempt-1", score_percent: 80, passed: true }];

    const res = await request(buildApp())
      .get("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
