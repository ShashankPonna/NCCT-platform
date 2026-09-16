import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { programmeSkillsRouter } from "./programmeSkills.js";

const { getUserMock, profilesMock, programmeSkillsMock, fromMock } = vi.hoisted(() => {
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
  const programmeSkillsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    programme_skills: programmeSkillsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, programmeSkillsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", programmeSkillsRouter);
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
  programmeSkillsMock.builder.insert.mockClear();
  programmeSkillsMock.builder.delete.mockClear();
  for (const mock of [profilesMock, programmeSkillsMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

describe("PUT /api/programmes/:id/skills", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .put("/api/programmes/programme-1/skills")
      .send({ skill_ids: [SKILL_ID] });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .put("/api/programmes/programme-1/skills")
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [SKILL_ID] });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid skill id", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .put("/api/programmes/programme-1/skills")
      .set("Authorization", "Bearer token")
      .send({ skill_ids: ["not-a-uuid"] });
    expect(res.status).toBe(400);
  });

  it("replaces the programme's skill set and returns the new set", async () => {
    authenticateAs("trainer-1", "trainer");
    programmeSkillsMock.result.data = [{ skills: { id: SKILL_ID, name: "Welding" } }];

    const res = await request(buildApp())
      .put("/api/programmes/programme-1/skills")
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [SKILL_ID] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: SKILL_ID, name: "Welding" }]);
    expect(programmeSkillsMock.builder.delete).toHaveBeenCalled();
    expect(programmeSkillsMock.builder.insert).toHaveBeenCalledWith([
      { programme_id: "programme-1", skill_id: SKILL_ID },
    ]);
  });

  it("skips the insert call when clearing to an empty skill set", async () => {
    authenticateAs("admin-1", "admin");
    programmeSkillsMock.result.data = [];

    const res = await request(buildApp())
      .put("/api/programmes/programme-1/skills")
      .set("Authorization", "Bearer token")
      .send({ skill_ids: [] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(programmeSkillsMock.builder.insert).not.toHaveBeenCalled();
  });
});

describe("GET /api/programmes/:id/skills", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/programmes/programme-1/skills");
    expect(res.status).toBe(401);
  });

  it("lists the programme's conferred skills for any authenticated user", async () => {
    authenticateAs("trainee-1", "trainee");
    programmeSkillsMock.result.data = [{ skills: { id: SKILL_ID, name: "Welding" } }];

    const res = await request(buildApp())
      .get("/api/programmes/programme-1/skills")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: SKILL_ID, name: "Welding" }]);
  });
});
