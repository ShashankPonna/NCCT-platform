import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentAttemptsRouter } from "./assessmentAttempts.js";

const { getUserMock, profilesMock, assessmentsMock, questionsMock, attemptsMock, fromMock } =
  vi.hoisted(() => {
    function createTableMock() {
      const result: { data: unknown; error: unknown } = { data: null, error: null };
      const builder: Record<string, ReturnType<typeof vi.fn>> = {};
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
    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      profiles: profilesMock,
      assessments: assessmentsMock,
      assessment_questions: questionsMock,
      assessment_attempts: attemptsMock,
    };
    const fromMock = vi.fn((table: string) => tables[table].builder);
    const getUserMock = vi.fn();
    return { getUserMock, profilesMock, assessmentsMock, questionsMock, attemptsMock, fromMock };
  });

const issueCertificateMock = vi.hoisted(() => vi.fn());

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

vi.mock("../certificateService.js", () => ({
  issueCertificateForPassingAttempt: issueCertificateMock,
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
  { id: "q-1", correct_option_id: "a" },
  { id: "q-2", correct_option_id: "b" },
];

beforeEach(() => {
  getUserMock.mockReset();
  issueCertificateMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  assessmentsMock.result.data = null;
  assessmentsMock.result.error = null;
  questionsMock.result.data = null;
  questionsMock.result.error = null;
  attemptsMock.result.data = null;
  attemptsMock.result.error = null;
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
    assessmentsMock.result.data = { id: "assess-1", pass_threshold_percent: 60 };
    questionsMock.result.data = [];

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: {} });

    expect(res.status).toBe(400);
  });

  it("grades correctly, fails below threshold, and never calls certificate issuance", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = { id: "assess-1", pass_threshold_percent: 60 };
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = {
      id: "attempt-1",
      assessment_id: "assess-1",
      trainee_id: "trainee-1",
      score_percent: 50,
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
    expect(issueCertificateMock).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied score/passed and computes its own from the correct answers", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = { id: "assess-1", pass_threshold_percent: 60 };
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = {
      id: "attempt-1",
      score_percent: 100,
      passed: true,
    };
    issueCertificateMock.mockResolvedValue({ certificate_code: "NCCT-ABC12345" });

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      // client tries to claim a failing score is actually a perfect pass
      .send({ answers: { "q-1": "a", "q-2": "b" }, score_percent: 0, passed: false });

    expect(res.status).toBe(201);
    expect(res.body.attempt).toMatchObject({ score_percent: 100, passed: true });
  });

  it("passes at exactly the threshold and issues a certificate", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = { id: "assess-1", pass_threshold_percent: 50 };
    questionsMock.result.data = twoQuestions;
    attemptsMock.result.data = {
      id: "attempt-1",
      assessment_id: "assess-1",
      trainee_id: "trainee-1",
      score_percent: 50,
      passed: true,
    };
    issueCertificateMock.mockResolvedValue({ certificate_code: "NCCT-ABC12345" });

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/attempts")
      .set("Authorization", "Bearer token")
      .send({ answers: { "q-1": "a", "q-2": "wrong" } });

    expect(res.status).toBe(201);
    expect(res.body.certificate).toMatchObject({ certificate_code: "NCCT-ABC12345" });
    expect(issueCertificateMock).toHaveBeenCalledWith({
      attemptId: "attempt-1",
      assessmentId: "assess-1",
      traineeId: "trainee-1",
    });
  });

  it("still returns 201 with the graded attempt if certificate issuance throws", async () => {
    authenticateAs("trainee-1", "trainee");
    assessmentsMock.result.data = { id: "assess-1", pass_threshold_percent: 50 };
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
