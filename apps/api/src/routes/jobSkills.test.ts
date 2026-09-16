import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobSkillsRouter } from "./jobSkills.js";

const { getUserMock, profilesMock, jobsMock, jobSkillsMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of ["select", "insert", "delete", "eq", "single", "maybeSingle"]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const jobsMock = createTableMock();
  const jobSkillsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    jobs: jobsMock,
    job_skills: jobSkillsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, jobsMock, jobSkillsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", jobSkillsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

const SKILL_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  getUserMock.mockReset();
  jobSkillsMock.builder.insert.mockClear();
  jobSkillsMock.builder.delete.mockClear();
  for (const mock of [profilesMock, jobsMock, jobSkillsMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

describe("PUT /api/jobs/:id/skills", () => {
  it("returns 403 for a non-employer", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .put("/api/jobs/job-1/skills")
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [SKILL_ID] });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the job isn't owned by the caller", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "someone-else" };
    const res = await request(buildApp())
      .put("/api/jobs/job-1/skills")
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [SKILL_ID] });
    expect(res.status).toBe(404);
    expect(jobSkillsMock.builder.delete).not.toHaveBeenCalled();
  });

  it("replaces the caller's own job's skill set", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "employer-1" };
    jobSkillsMock.result.data = [{ skills: { id: SKILL_ID, name: "Welding" } }];

    const res = await request(buildApp())
      .put("/api/jobs/job-1/skills")
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [SKILL_ID] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: SKILL_ID, name: "Welding" }]);
    expect(jobSkillsMock.builder.insert).toHaveBeenCalledWith([{ job_id: "job-1", skill_id: SKILL_ID }]);
  });
});

describe("GET /api/jobs/:id/skills", () => {
  it("requires no auth and lists the job's required skills", async () => {
    jobSkillsMock.result.data = [{ skills: { id: SKILL_ID, name: "Welding" } }];
    const res = await request(buildApp()).get("/api/jobs/job-1/skills");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: SKILL_ID, name: "Welding" }]);
  });
});
