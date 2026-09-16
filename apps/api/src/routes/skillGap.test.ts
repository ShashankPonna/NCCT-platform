import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { skillGapRouter } from "./skillGap.js";

const { getUserMock, profilesMock, fromMock, computeSkillGapMock } = vi.hoisted(() => {
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
  const fromMock = vi.fn((table: string) => (table === "profiles" ? profilesMock.builder : profilesMock.builder));
  const getUserMock = vi.fn();
  const computeSkillGapMock = vi.fn();
  return { getUserMock, profilesMock, fromMock, computeSkillGapMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

vi.mock("../skillGapService.js", () => ({ computeSkillGap: computeSkillGapMock }));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", skillGapRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  computeSkillGapMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
});

describe("GET /api/skill-gap/:jobId", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/skill-gap/job-1");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("employer-1", "employer");
    const res = await request(buildApp()).get("/api/skill-gap/job-1").set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the job doesn't exist", async () => {
    authenticateAs("trainee-1", "trainee");
    computeSkillGapMock.mockResolvedValue(null);
    const res = await request(buildApp()).get("/api/skill-gap/job-1").set("Authorization", "Bearer token");
    expect(res.status).toBe(404);
  });

  it("computes the gap for the caller's own trainee id, never a client-supplied one", async () => {
    authenticateAs("trainee-1", "trainee");
    computeSkillGapMock.mockResolvedValue({
      job_id: "job-1",
      required_skills: [],
      acquired_skills: [],
      gap_skills: [],
      reasoning: null,
      reasoning_source: "fallback",
    });

    const res = await request(buildApp()).get("/api/skill-gap/job-1").set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(computeSkillGapMock).toHaveBeenCalledWith("trainee-1", "job-1");
  });

  it("returns 400 if the service throws", async () => {
    authenticateAs("trainee-1", "trainee");
    computeSkillGapMock.mockRejectedValue(new Error("boom"));
    const res = await request(buildApp()).get("/api/skill-gap/job-1").set("Authorization", "Bearer token");
    expect(res.status).toBe(400);
  });
});
