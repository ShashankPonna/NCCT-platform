import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { employerSearchRouter } from "./employerSearch.js";

const { getUserMock, profilesTableMock, visibilityMock, certificatesMock, fromMock } = vi.hoisted(
  () => {
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
    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      profiles: profilesTableMock,
      visibility_settings: visibilityMock,
      certificates: certificatesMock,
    };
    const fromMock = vi.fn((table: string) => tables[table].builder);
    const getUserMock = vi.fn();
    return { getUserMock, profilesTableMock, visibilityMock, certificatesMock, fromMock };
  },
);

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
  for (const mock of [profilesTableMock, visibilityMock, certificatesMock]) {
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
});
