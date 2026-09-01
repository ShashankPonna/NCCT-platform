import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentQuestionsRouter } from "./assessmentQuestions.js";

const { getUserMock, profilesMock, questionsMock, fromMock } = vi.hoisted(() => {
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
  const questionsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    assessment_questions: questionsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, questionsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", assessmentQuestionsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

const validQuestion = {
  question_text: "What does PACS stand for?",
  options: [
    { id: "a", text: "Primary Agricultural Credit Society" },
    { id: "b", text: "Public Agricultural Cooperative Scheme" },
  ],
  correct_option_id: "a",
};

beforeEach(() => {
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  questionsMock.result.data = null;
  questionsMock.result.error = null;
});

describe("POST /api/assessments/:id/questions", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token")
      .send(validQuestion);
    expect(res.status).toBe(403);
  });

  it("returns 400 when correct_option_id doesn't match any option", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token")
      .send({ ...validQuestion, correct_option_id: "z" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate option ids", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token")
      .send({
        ...validQuestion,
        options: [
          { id: "a", text: "One" },
          { id: "a", text: "Two" },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("creates the question for a trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    questionsMock.result.data = { id: "q-1", assessment_id: "assess-1", ...validQuestion };

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token")
      .send(validQuestion);

    expect(res.status).toBe(201);
    expect(res.body.correct_option_id).toBe("a");
  });
});

describe("GET /api/assessments/:id/questions (authoring view)", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("includes correct_option_id for an admin", async () => {
    authenticateAs("admin-1", "admin");
    questionsMock.result.data = [{ id: "q-1", assessment_id: "assess-1", ...validQuestion }];

    const res = await request(buildApp())
      .get("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body[0].correct_option_id).toBe("a");
  });
});

describe("GET /api/assessments/:id/take (trainee view)", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/assessments/assess-1/take");
    expect(res.status).toBe(401);
  });

  it("strips correct_option_id for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    questionsMock.result.data = [{ id: "q-1", assessment_id: "assess-1", ...validQuestion }];

    const res = await request(buildApp())
      .get("/api/assessments/assess-1/take")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body[0].options).toHaveLength(2);
    expect(res.body[0]).not.toHaveProperty("correct_option_id");
  });
});

describe("PATCH /api/questions/:id", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .patch("/api/questions/q-1")
      .set("Authorization", "Bearer token")
      .send({ question_text: "Updated?" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when the updated correct_option_id doesn't match the updated options", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .patch("/api/questions/q-1")
      .set("Authorization", "Bearer token")
      .send({
        options: [
          { id: "x", text: "Only option" },
          { id: "y", text: "Second" },
        ],
        correct_option_id: "z",
      });
    expect(res.status).toBe(400);
  });

  it("updates the question for a trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    questionsMock.result.data = { id: "q-1", question_text: "Updated?" };

    const res = await request(buildApp())
      .patch("/api/questions/q-1")
      .set("Authorization", "Bearer token")
      .send({ question_text: "Updated?" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ question_text: "Updated?" });
  });
});

describe("DELETE /api/questions/:id", () => {
  it("deletes the question for an admin", async () => {
    authenticateAs("admin-1", "admin");
    questionsMock.result.data = { id: "q-1" };

    const res = await request(buildApp())
      .delete("/api/questions/q-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
  });
});
