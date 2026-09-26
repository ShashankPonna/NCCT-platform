import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentQuestionsRouter } from "./assessmentQuestions.js";

const {
  getUserMock,
  profilesMock,
  questionsMock,
  assessmentsMock,
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
      // (the bulk-import count query and the bulk insert itself) still
      // resolve when awaited directly.
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
  const questionsMock = createTableMock();
  const assessmentsMock = createTableMock();
  const programmeTrainersMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    assessment_questions: questionsMock,
    assessments: assessmentsMock,
    programme_trainers: programmeTrainersMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return {
    getUserMock,
    profilesMock,
    questionsMock,
    assessmentsMock,
    programmeTrainersMock,
    fromMock,
  };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
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
vi.mock("../notificationService.js", () => notificationMocks);

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

// requireProgrammeAccess's resolver reads a question/assessment's programme
// separately from the table each handler itself writes — this sets up
// whichever half a given trainer-facing test needs.
function assignTrainerToAssessment() {
  assessmentsMock.result.data = { modules: { courses: { programme_id: "prog-1" } } };
  programmeTrainersMock.result.data = { trainer_id: "trainer-1" };
}

beforeEach(() => {
  for (const fn of Object.values(notificationMocks)) fn.mockClear();
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  questionsMock.result.data = null;
  questionsMock.result.error = null;
  questionsMock.result.count = null;
  assessmentsMock.result.data = null;
  assessmentsMock.result.error = null;
  programmeTrainersMock.result.data = null;
  programmeTrainersMock.result.error = null;
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

  it("returns 403 for a trainer not assigned to the assessment's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    assessmentsMock.result.data = { modules: { courses: { programme_id: "prog-1" } } };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token")
      .send(validQuestion);
    expect(res.status).toBe(403);
  });

  it("returns 400 when correct_option_id doesn't match any option", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToAssessment();
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token")
      .send({ ...validQuestion, correct_option_id: "z" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate option ids", async () => {
    authenticateAs("trainer-1", "trainer");
    assignTrainerToAssessment();
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
    assignTrainerToAssessment();
    questionsMock.result.data = { id: "q-1", assessment_id: "assess-1", ...validQuestion };

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token")
      .send(validQuestion);

    expect(res.status).toBe(201);
    expect(res.body.correct_option_id).toBe("a");
    // count mock defaults to null (= 0 existing) → this was the first question
    expect(notificationMocks.notifyAssessmentAvailable).toHaveBeenCalledWith("assess-1");
  });

  it("does not re-announce the assessment when adding a later question", async () => {
    authenticateAs("admin-1", "admin");
    questionsMock.result.count = 2;
    questionsMock.result.data = { id: "q-3", assessment_id: "assess-1", ...validQuestion };

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions")
      .set("Authorization", "Bearer token")
      .send(validQuestion);

    expect(res.status).toBe(201);
    expect(notificationMocks.notifyAssessmentAvailable).not.toHaveBeenCalled();
  });
});

describe("POST /api/assessments/:id/questions/bulk", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions/bulk")
      .set("Authorization", "Bearer token")
      .send({ questions: [validQuestion] });
    expect(res.status).toBe(403);
  });

  it("returns 403 for a trainer not assigned to the assessment's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    assessmentsMock.result.data = { modules: { courses: { programme_id: "prog-1" } } };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions/bulk")
      .set("Authorization", "Bearer token")
      .send({ questions: [validQuestion] });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an empty questions array", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions/bulk")
      .set("Authorization", "Bearer token")
      .send({ questions: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 when any row fails validation", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions/bulk")
      .set("Authorization", "Bearer token")
      .send({ questions: [validQuestion, { ...validQuestion, correct_option_id: "z" }] });
    expect(res.status).toBe(400);
  });

  it("inserts every row for an admin, appending after the existing question count", async () => {
    authenticateAs("admin-1", "admin");
    questionsMock.result.count = 3;
    questionsMock.result.data = [
      { id: "q-10", assessment_id: "assess-1", position: 3, ...validQuestion },
      { id: "q-11", assessment_id: "assess-1", position: 4, ...validQuestion },
    ];

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions/bulk")
      .set("Authorization", "Bearer token")
      .send({ questions: [validQuestion, validQuestion] });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    expect(notificationMocks.notifyAssessmentAvailable).not.toHaveBeenCalled();
  });

  it("announces the assessment exactly once when a bulk import fills an empty one", async () => {
    authenticateAs("admin-1", "admin");
    questionsMock.result.count = 0;
    questionsMock.result.data = [
      { id: "q-1", assessment_id: "assess-1", ...validQuestion },
      { id: "q-2", assessment_id: "assess-1", ...validQuestion },
      { id: "q-3", assessment_id: "assess-1", ...validQuestion },
    ];

    const res = await request(buildApp())
      .post("/api/assessments/assess-1/questions/bulk")
      .set("Authorization", "Bearer token")
      .send({ questions: [validQuestion, validQuestion, validQuestion] });

    expect(res.status).toBe(201);
    expect(notificationMocks.notifyAssessmentAvailable).toHaveBeenCalledTimes(1);
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

  it("returns 403 for a trainer not assigned to the assessment's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    assessmentsMock.result.data = { modules: { courses: { programme_id: "prog-1" } } };
    programmeTrainersMock.result.data = null;

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

  it("strips correct_option_id but keeps marks for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    questionsMock.result.data = [
      { id: "q-1", assessment_id: "assess-1", marks: 5, ...validQuestion },
    ];

    const res = await request(buildApp())
      .get("/api/assessments/assess-1/take")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body[0].options).toHaveLength(2);
    expect(res.body[0]).not.toHaveProperty("correct_option_id");
    expect(res.body[0].marks).toBe(5);
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

  it("returns 403 for a trainer not assigned to the question's programme", async () => {
    authenticateAs("trainer-1", "trainer");
    questionsMock.result.data = {
      id: "q-1",
      assessments: { modules: { courses: { programme_id: "prog-1" } } },
    };
    programmeTrainersMock.result.data = null;

    const res = await request(buildApp())
      .patch("/api/questions/q-1")
      .set("Authorization", "Bearer token")
      .send({ question_text: "Updated?" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when the updated correct_option_id doesn't match the updated options", async () => {
    authenticateAs("trainer-1", "trainer");
    questionsMock.result.data = {
      id: "q-1",
      assessments: { modules: { courses: { programme_id: "prog-1" } } },
    };
    programmeTrainersMock.result.data = { trainer_id: "trainer-1" };
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
    programmeTrainersMock.result.data = { trainer_id: "trainer-1" };
    // Shared mock: requireProgrammeAccess's resolver read and the PATCH
    // handler's update both go through this same `assessment_questions`
    // table mock, so one object satisfies both.
    questionsMock.result.data = {
      id: "q-1",
      question_text: "Updated?",
      assessments: { modules: { courses: { programme_id: "prog-1" } } },
    };

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
