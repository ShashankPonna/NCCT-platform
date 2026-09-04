import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { skillsRouter } from "./skills.js";

const {
  getUserMock,
  profilesMock,
  skillsMock,
  jobsMock,
  jobSkillsMock,
  programmeSkillsMock,
  fromMock,
  getSkillGapMock,
  embedJobBestEffortMock,
} = vi.hoisted(() => {
    function createTableMock() {
      const result: { data: unknown; error: unknown } = { data: null, error: null };
      const builder: Record<string, ReturnType<typeof vi.fn>> = {
        then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
      };
      for (const method of ["select", "insert", "update", "delete", "eq", "order", "single", "maybeSingle"]) {
        builder[method] = vi.fn(() => builder);
      }
      return { builder, result };
    }

    const profilesMock = createTableMock();
    const skillsMock = createTableMock();
    const jobsMock = createTableMock();
    const jobSkillsMock = createTableMock();
    const programmeSkillsMock = createTableMock();
    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      profiles: profilesMock,
      skills: skillsMock,
      jobs: jobsMock,
      job_skills: jobSkillsMock,
      programme_skills: programmeSkillsMock,
    };
    const fromMock = vi.fn((table: string) => tables[table].builder);
    return {
      getUserMock: vi.fn(),
      profilesMock,
      skillsMock,
      jobsMock,
      jobSkillsMock,
      programmeSkillsMock,
      fromMock,
      getSkillGapMock: vi.fn(),
      embedJobBestEffortMock: vi.fn(),
    };
  });

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

vi.mock("../skillGapService.js", () => ({ getSkillGap: getSkillGapMock }));

// Never load the real embedding model from a job-skills PUT in tests —
// same reasoning as jobs.test.ts.
vi.mock("../jobMatchingService.js", () => ({ embedJobBestEffort: embedJobBestEffortMock }));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", skillsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  getSkillGapMock.mockReset();
  embedJobBestEffortMock.mockReset();
  for (const mock of [profilesMock, skillsMock, jobsMock, jobSkillsMock, programmeSkillsMock]) {
    mock.result.data = null;
    mock.result.error = null;
    for (const key of Object.keys(mock.builder)) {
      if (key !== "then") mock.builder[key].mockClear();
    }
  }
});

const JOB_ID = "22222222-2222-2222-2222-222222222222";
const SKILL_ID = "33333333-3333-3333-3333-333333333333";
const PROGRAMME_ID = "44444444-4444-4444-4444-444444444444";

describe("POST /api/skills", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/skills").send({ name: "Bookkeeping" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/skills")
      .set("Authorization", "Bearer token")
      .send({ name: "Bookkeeping" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/skills")
      .set("Authorization", "Bearer token")
      .send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("creates a skill for an admin", async () => {
    authenticateAs("admin-1", "admin");
    skillsMock.result.data = { id: SKILL_ID, name: "Bookkeeping", category: null };
    const res = await request(buildApp())
      .post("/api/skills")
      .set("Authorization", "Bearer token")
      .send({ name: "Bookkeeping" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: SKILL_ID, name: "Bookkeeping", category: null });
  });
});

describe("GET /api/skills", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/skills");
    expect(res.status).toBe(401);
  });

  it("returns the taxonomy for any authenticated role", async () => {
    authenticateAs("trainee-1", "trainee");
    skillsMock.result.data = [{ id: SKILL_ID, name: "Bookkeeping", category: null }];
    const res = await request(buildApp()).get("/api/skills").set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/jobs/:jobId/skills", () => {
  it("returns a job's tagged skills with no auth required", async () => {
    jobSkillsMock.result.data = [
      { skill_id: SKILL_ID, skills: { id: SKILL_ID, name: "Bookkeeping", category: null } },
    ];
    const res = await request(buildApp()).get(`/api/jobs/${JOB_ID}/skills`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: SKILL_ID, name: "Bookkeeping", category: null }]);
  });

  it("returns 400 when the query fails", async () => {
    jobSkillsMock.result.error = { message: "boom" };
    const res = await request(buildApp()).get(`/api/jobs/${JOB_ID}/skills`);
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/jobs/:jobId/skills", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).put(`/api/jobs/${JOB_ID}/skills`).send({ skill_ids: [] });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-employer", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .put(`/api/jobs/${JOB_ID}/skills`)
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [] });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the job isn't owned by the caller", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "someone-else" };
    const res = await request(buildApp())
      .put(`/api/jobs/${JOB_ID}/skills`)
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [SKILL_ID] });
    expect(res.status).toBe(404);
  });

  it("replaces the tagged set for the owning employer", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "employer-1" };
    const res = await request(buildApp())
      .put(`/api/jobs/${JOB_ID}/skills`)
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [SKILL_ID] });
    expect(res.status).toBe(204);
    expect(jobSkillsMock.builder.delete).toHaveBeenCalled();
    expect(jobSkillsMock.builder.insert).toHaveBeenCalledWith([{ job_id: JOB_ID, skill_id: SKILL_ID }]);
    // P3 AI Job Matching (DECISIONS.md #28): re-tagging refreshes the job's
    // embedding, since tagged skills feed its embedding text.
    expect(embedJobBestEffortMock).toHaveBeenCalledWith(JOB_ID);
  });
});

describe("GET /api/programmes/:id/skills", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get(`/api/programmes/${PROGRAMME_ID}/skills`);
    expect(res.status).toBe(401);
  });

  it("returns the programme's granted skills", async () => {
    authenticateAs("trainee-1", "trainee");
    programmeSkillsMock.result.data = [
      { skill_id: SKILL_ID, skills: { id: SKILL_ID, name: "Bookkeeping", category: null } },
    ];
    const res = await request(buildApp())
      .get(`/api/programmes/${PROGRAMME_ID}/skills`)
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: SKILL_ID, name: "Bookkeeping", category: null }]);
  });
});

describe("PUT /api/programmes/:id/skills", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .put(`/api/programmes/${PROGRAMME_ID}/skills`)
      .send({ skill_ids: [] });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .put(`/api/programmes/${PROGRAMME_ID}/skills`)
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [] });
    expect(res.status).toBe(403);
  });

  it("replaces the granted set for an admin", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .put(`/api/programmes/${PROGRAMME_ID}/skills`)
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [SKILL_ID] });
    expect(res.status).toBe(204);
    expect(programmeSkillsMock.builder.insert).toHaveBeenCalledWith([
      { programme_id: PROGRAMME_ID, skill_id: SKILL_ID },
    ]);
  });

  it("replaces the granted set for a trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .put(`/api/programmes/${PROGRAMME_ID}/skills`)
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [] });
    expect(res.status).toBe(204);
  });
});

describe("GET /api/skill-gap/:jobId", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get(`/api/skill-gap/${JOB_ID}`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("employer-1", "employer");
    const res = await request(buildApp())
      .get(`/api/skill-gap/${JOB_ID}`)
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns the computed gap for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const payload = { acquired_skills: [], gap_skills: [], reasoning: null };
    getSkillGapMock.mockResolvedValue(payload);
    const res = await request(buildApp())
      .get(`/api/skill-gap/${JOB_ID}`)
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(getSkillGapMock).toHaveBeenCalledWith("trainee-1", JOB_ID);
  });

  it("returns 400 when the service throws", async () => {
    authenticateAs("trainee-1", "trainee");
    getSkillGapMock.mockRejectedValue(new Error("boom"));
    const res = await request(buildApp())
      .get(`/api/skill-gap/${JOB_ID}`)
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(400);
  });
});
