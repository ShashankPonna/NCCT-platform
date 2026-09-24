import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { employerSearchRouter } from "./employerSearch.js";

const {
  getUserMock,
  profilesTableMock,
  visibilityMock,
  certificatesMock,
  programmeSkillsMock,
  courseSkillsMock,
  fromMock,
} = vi.hoisted(() => {
  // `profiles` is queried twice per successful request in this route's
  // tests — once by requireAuth's own role lookup, once by the route body
  // itself — so a single static `result` (as every other test file uses)
  // can't represent both answers. `queue` holds per-call overrides,
  // shifted off on each `.then()`; once exhausted, `result` is the
  // steady-state fallback, matching every other file's simpler usage.
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const queue: { data: unknown; error: unknown }[] = [];
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(queue.shift() ?? result)),
    };
    for (const method of ["select", "eq", "in", "order", "single", "maybeSingle"]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result, queue };
  }

  const profilesTableMock = createTableMock();
  const visibilityMock = createTableMock();
  const certificatesMock = createTableMock();
  // DECISIONS.md #45's taxonomy unification — empty by default in every
  // test unless a test explicitly populates one, same as every other
  // table here.
  const programmeSkillsMock = createTableMock();
  const courseSkillsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesTableMock,
    visibility_settings: visibilityMock,
    certificates: certificatesMock,
    programme_skills: programmeSkillsMock,
    course_skills: courseSkillsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return {
    getUserMock,
    profilesTableMock,
    visibilityMock,
    certificatesMock,
    programmeSkillsMock,
    courseSkillsMock,
    fromMock,
  };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", employerSearchRouter);
  return app;
}

// profilesTableMock doubles as both the auth-role lookup table (requireAuth
// always queries "profiles") and the search route's own trainee-profile
// query — both hit the same table, so one mock is correct, not a shortcut.
// The role lookup is always the *first* call, so it's queued; a route that
// gets past requireRole then makes its own second call, resolved by
// whatever's queued next (see queueTraineeProfiles) or the `result` fallback.
function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesTableMock.queue.push({ data: { role }, error: null });
}

function queueTraineeProfiles(profiles: unknown) {
  profilesTableMock.queue.push({ data: profiles, error: null });
}

beforeEach(() => {
  getUserMock.mockReset();
  for (const mock of [profilesTableMock, visibilityMock, certificatesMock, programmeSkillsMock, courseSkillsMock]) {
    mock.result.data = null;
    mock.result.error = null;
    mock.queue.length = 0;
  }
});

describe("GET /api/employer/trainees", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/employer/trainees");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-employer", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/employer/trainees")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns an empty list when no trainee has opted into visibility", async () => {
    authenticateAs("employer-1", "employer");
    visibilityMock.result.data = [];
    const res = await request(buildApp())
      .get("/api/employer/trainees")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns visible trainees with their certificates when unfiltered", async () => {
    authenticateAs("employer-1", "employer");
    visibilityMock.result.data = [{ trainee_id: "trainee-1" }];
    queueTraineeProfiles([{ id: "trainee-1", full_name: "Asha Patil" }]);
    certificatesMock.result.data = [
      {
        trainee_id: "trainee-1",
        certificate_code: "NCCT-ABC12345",
        issued_at: "2026-09-01T00:00:00.000Z",
        programmes: { title: "Dairy Cooperative Management" },
        institutions: { name: "VAMNICOM", location: "Pune" },
      },
    ];

    const res = await request(buildApp())
      .get("/api/employer/trainees")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        trainee_id: "trainee-1",
        full_name: "Asha Patil",
        certificates: [
          {
            certificate_code: "NCCT-ABC12345",
            programme_title: "Dairy Cooperative Management",
            institution_name: "VAMNICOM",
            institution_location: "Pune",
            issued_at: "2026-09-01T00:00:00.000Z",
          },
        ],
        skills: [],
      },
    ]);
  });

  it("excludes a visible trainee whose certificates don't match the q filter", async () => {
    authenticateAs("employer-1", "employer");
    visibilityMock.result.data = [{ trainee_id: "trainee-1" }];
    queueTraineeProfiles([{ id: "trainee-1", full_name: "Asha Patil" }]);
    certificatesMock.result.data = [
      {
        trainee_id: "trainee-1",
        certificate_code: "NCCT-ABC12345",
        issued_at: "2026-09-01T00:00:00.000Z",
        programmes: { title: "Dairy Cooperative Management" },
        institutions: { name: "VAMNICOM", location: "Pune" },
      },
    ];

    const res = await request(buildApp())
      .get("/api/employer/trainees?q=welding")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("includes a trainee whose certificate matches the q filter (case-insensitive)", async () => {
    authenticateAs("employer-1", "employer");
    visibilityMock.result.data = [{ trainee_id: "trainee-1" }];
    queueTraineeProfiles([{ id: "trainee-1", full_name: "Asha Patil" }]);
    certificatesMock.result.data = [
      {
        trainee_id: "trainee-1",
        certificate_code: "NCCT-ABC12345",
        issued_at: "2026-09-01T00:00:00.000Z",
        programmes: { title: "Dairy Cooperative Management" },
        institutions: { name: "VAMNICOM", location: "Pune" },
      },
    ];

    const res = await request(buildApp())
      .get("/api/employer/trainees?q=dairy&location=pune")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].trainee_id).toBe("trainee-1");
  });

  // DECISIONS.md #45: unifying this search with the F11 taxonomy.
  const SKILL = { id: "skill-1", name: "Tally Prime", category: "Accounting" };

  it("includes a trainee's real acquired skills in the response, from both programme- and course-level tags", async () => {
    authenticateAs("employer-1", "employer");
    visibilityMock.result.data = [{ trainee_id: "trainee-1" }];
    queueTraineeProfiles([{ id: "trainee-1", full_name: "Asha Patil" }]);
    certificatesMock.result.data = [
      {
        trainee_id: "trainee-1",
        certificate_code: "NCCT-ABC12345",
        issued_at: "2026-09-01T00:00:00.000Z",
        programme_id: "programme-1",
        course_id: "course-1",
        programmes: { title: "Dairy Cooperative Management" },
        institutions: { name: "VAMNICOM", location: "Pune" },
      },
    ];
    programmeSkillsMock.result.data = [{ programme_id: "programme-1", skills: SKILL }];
    courseSkillsMock.result.data = [
      { course_id: "course-1", skills: { id: "skill-2", name: "GST Filing", category: "Accounting" } },
    ];

    const res = await request(buildApp())
      .get("/api/employer/trainees")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body[0].skills).toEqual(
      expect.arrayContaining([SKILL, { id: "skill-2", name: "GST Filing", category: "Accounting" }]),
    );
  });

  it("exact-filters by skill_id, excluding a visible trainee who doesn't hold it", async () => {
    authenticateAs("employer-1", "employer");
    visibilityMock.result.data = [
      { trainee_id: "trainee-1" },
      { trainee_id: "trainee-2" },
    ];
    queueTraineeProfiles([
      { id: "trainee-1", full_name: "Asha Patil" },
      { id: "trainee-2", full_name: "Rakesh Kumar" },
    ]);
    certificatesMock.result.data = [
      {
        trainee_id: "trainee-1",
        certificate_code: "NCCT-ABC12345",
        issued_at: "2026-09-01T00:00:00.000Z",
        programme_id: "programme-1",
        course_id: null,
        programmes: { title: "Dairy Cooperative Management" },
        institutions: { name: "VAMNICOM", location: "Pune" },
      },
      {
        trainee_id: "trainee-2",
        certificate_code: "NCCT-XYZ98765",
        issued_at: "2026-09-01T00:00:00.000Z",
        programme_id: "programme-2",
        course_id: null,
        programmes: { title: "Poultry Management" },
        institutions: { name: "RICM", location: "Lucknow" },
      },
    ];
    programmeSkillsMock.result.data = [{ programme_id: "programme-1", skills: SKILL }];

    const res = await request(buildApp())
      .get(`/api/employer/trainees?skill_id=${SKILL.id}`)
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].trainee_id).toBe("trainee-1");
  });

  it("q matches an acquired skill name even when the programme title doesn't mention it", async () => {
    authenticateAs("employer-1", "employer");
    visibilityMock.result.data = [{ trainee_id: "trainee-1" }];
    queueTraineeProfiles([{ id: "trainee-1", full_name: "Asha Patil" }]);
    certificatesMock.result.data = [
      {
        trainee_id: "trainee-1",
        certificate_code: "NCCT-ABC12345",
        issued_at: "2026-09-01T00:00:00.000Z",
        programme_id: "programme-1",
        course_id: null,
        programmes: { title: "Dairy Cooperative Management" },
        institutions: { name: "VAMNICOM", location: "Pune" },
      },
    ];
    programmeSkillsMock.result.data = [{ programme_id: "programme-1", skills: SKILL }];

    const res = await request(buildApp())
      .get("/api/employer/trainees?q=tally")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].trainee_id).toBe("trainee-1");
  });

  it("degrades a missing course_skills table (pre-migration project) instead of breaking the whole search", async () => {
    authenticateAs("employer-1", "employer");
    visibilityMock.result.data = [{ trainee_id: "trainee-1" }];
    queueTraineeProfiles([{ id: "trainee-1", full_name: "Asha Patil" }]);
    certificatesMock.result.data = [
      {
        trainee_id: "trainee-1",
        certificate_code: "NCCT-ABC12345",
        issued_at: "2026-09-01T00:00:00.000Z",
        programme_id: "programme-1",
        course_id: "course-1",
        programmes: { title: "Dairy Cooperative Management" },
        institutions: { name: "VAMNICOM", location: "Pune" },
      },
    ];
    programmeSkillsMock.result.data = [{ programme_id: "programme-1", skills: SKILL }];
    courseSkillsMock.result.error = { code: "PGRST205", message: "table not found" };

    const res = await request(buildApp())
      .get("/api/employer/trainees")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body[0].skills).toEqual([SKILL]);
  });
});
