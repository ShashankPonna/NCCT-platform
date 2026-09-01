import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatbotRouter } from "./chatbot.js";

const { getUserMock, profilesMock, corpusMock, fromMock, embedTextMock, answerQuestionMock } =
  vi.hoisted(() => {
    function createTableMock() {
      const result: { data: unknown; error: unknown } = { data: null, error: null };
      const builder: Record<string, ReturnType<typeof vi.fn>> = {
        then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
      };
      for (const method of [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "order",
        "single",
        "maybeSingle",
      ]) {
        builder[method] = vi.fn(() => builder);
      }
      return { builder, result };
    }

    const profilesMock = createTableMock();
    const corpusMock = createTableMock();
    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      profiles: profilesMock,
      chatbot_corpus_chunks: corpusMock,
    };
    const fromMock = vi.fn((table: string) => tables[table].builder);
    return {
      getUserMock: vi.fn(),
      profilesMock,
      corpusMock,
      fromMock,
      embedTextMock: vi.fn(),
      answerQuestionMock: vi.fn(),
    };
  });

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

// Never load the real embedding model or reach the real Claude API in tests.
vi.mock("../chatbotService.js", () => ({
  embedText: embedTextMock,
  answerQuestion: answerQuestionMock,
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", chatbotRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  embedTextMock.mockReset();
  answerQuestionMock.mockReset();
  corpusMock.builder.insert.mockClear();
  for (const mock of [profilesMock, corpusMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
  embedTextMock.mockResolvedValue(new Array(384).fill(0.1));
});

describe("POST /api/chatbot/corpus", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/chatbot/corpus")
      .send({ source_type: "faq", content: "hello" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/chatbot/corpus")
      .set("Authorization", "Bearer token")
      .send({ source_type: "faq", content: "hello" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an unknown source_type", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/chatbot/corpus")
      .set("Authorization", "Bearer token")
      .send({ source_type: "not-a-type", content: "hello" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty content", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/chatbot/corpus")
      .set("Authorization", "Bearer token")
      .send({ source_type: "faq", content: "" });
    expect(res.status).toBe(400);
  });

  it("embeds the content and stores the chunk", async () => {
    authenticateAs("admin-1", "admin");
    corpusMock.result.data = {
      id: "chunk-1",
      source_type: "faq",
      source_id: null,
      content: "Eligibility requires a cooperative affiliation.",
      created_at: "2026-09-01T00:00:00.000Z",
    };

    const res = await request(buildApp())
      .post("/api/chatbot/corpus")
      .set("Authorization", "Bearer token")
      .send({ source_type: "faq", content: "Eligibility requires a cooperative affiliation." });

    expect(res.status).toBe(201);
    expect(embedTextMock).toHaveBeenCalledWith("Eligibility requires a cooperative affiliation.");
    expect(corpusMock.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: "faq", embedding: expect.any(Array) }),
    );
    // The stored vector must never come back to a client.
    expect(res.body).not.toHaveProperty("embedding");
  });

  it("returns 500 when embedding fails", async () => {
    authenticateAs("admin-1", "admin");
    embedTextMock.mockRejectedValue(new Error("model load failed"));

    const res = await request(buildApp())
      .post("/api/chatbot/corpus")
      .set("Authorization", "Bearer token")
      .send({ source_type: "faq", content: "hello" });

    expect(res.status).toBe(500);
    expect(corpusMock.builder.insert).not.toHaveBeenCalled();
  });
});

describe("GET /api/chatbot/corpus", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/chatbot/corpus")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("lists chunks for admin", async () => {
    authenticateAs("admin-1", "admin");
    corpusMock.result.data = [{ id: "chunk-1", content: "hello" }];
    const res = await request(buildApp())
      .get("/api/chatbot/corpus")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "chunk-1", content: "hello" }]);
  });
});

describe("DELETE /api/chatbot/corpus/:id", () => {
  it("returns 404 for an unknown chunk", async () => {
    authenticateAs("admin-1", "admin");
    corpusMock.result.data = null;
    const res = await request(buildApp())
      .delete("/api/chatbot/corpus/chunk-1")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(404);
  });

  it("deletes an existing chunk", async () => {
    authenticateAs("admin-1", "admin");
    corpusMock.result.data = { id: "chunk-1" };
    const res = await request(buildApp())
      .delete("/api/chatbot/corpus/chunk-1")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(204);
  });
});

describe("POST /api/chatbot/ask", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/chatbot/ask").send({ question: "hi" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an empty question", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/chatbot/ask")
      .set("Authorization", "Bearer token")
      .send({ question: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an over-long question", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/chatbot/ask")
      .set("Authorization", "Bearer token")
      .send({ question: "x".repeat(501) });
    expect(res.status).toBe(400);
  });

  it("returns a grounded answer with its sources", async () => {
    authenticateAs("trainee-1", "trainee");
    answerQuestionMock.mockResolvedValue({
      answered: true,
      answer: "Programmes are open to members of registered cooperatives.",
      sources: [{ id: "chunk-1", content: "Eligibility...", similarity: 0.82 }],
    });

    const res = await request(buildApp())
      .post("/api/chatbot/ask")
      .set("Authorization", "Bearer token")
      .send({ question: "Who can enroll?" });

    expect(res.status).toBe(200);
    expect(res.body.answered).toBe(true);
    expect(res.body.sources).toHaveLength(1);
  });

  it("returns 503 when the chatbot service is unavailable (e.g. missing API key)", async () => {
    authenticateAs("trainee-1", "trainee");
    answerQuestionMock.mockRejectedValue(new Error("Could not resolve authentication method"));

    const res = await request(buildApp())
      .post("/api/chatbot/ask")
      .set("Authorization", "Bearer token")
      .send({ question: "Who can enroll?" });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("Chatbot unavailable");
  });
});
