import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { careerCounsellorRouter } from "./careerCounsellor.js";

const { getUserMock, profilesMock, fromMock, askCareerCounsellorMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of ["select", "eq", "single", "maybeSingle"]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const fromMock = vi.fn((table: string) => (table === "profiles" ? profilesMock.builder : createTableMock().builder));
  return {
    getUserMock: vi.fn(),
    profilesMock,
    fromMock,
    askCareerCounsellorMock: vi.fn(),
  };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

vi.mock("../careerCounsellorService.js", () => ({ askCareerCounsellor: askCareerCounsellorMock }));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", careerCounsellorRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  askCareerCounsellorMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
});

describe("POST /api/career-counsellor/ask", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/career-counsellor/ask").send({ question: "hi" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("employer-1", "employer");
    const res = await request(buildApp())
      .post("/api/career-counsellor/ask")
      .set("Authorization", "Bearer token")
      .send({ question: "hi" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an empty question", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/career-counsellor/ask")
      .set("Authorization", "Bearer token")
      .send({ question: "" });
    expect(res.status).toBe(400);
  });

  it("returns the counsellor's answer for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const payload = { answer: "You should take the Bookkeeping programme.", toolCalls: [] };
    askCareerCounsellorMock.mockResolvedValue(payload);

    const res = await request(buildApp())
      .post("/api/career-counsellor/ask")
      .set("Authorization", "Bearer token")
      .send({ question: "what should I learn next?" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(askCareerCounsellorMock).toHaveBeenCalledWith("trainee-1", "what should I learn next?");
  });

  it("returns 503 with the real reason when the service fails", async () => {
    authenticateAs("trainee-1", "trainee");
    askCareerCounsellorMock.mockRejectedValue(new Error("GEMINI_API_KEY is not set"));

    const res = await request(buildApp())
      .post("/api/career-counsellor/ask")
      .set("Authorization", "Bearer token")
      .send({ question: "hi" });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("GEMINI_API_KEY");
  });
});
