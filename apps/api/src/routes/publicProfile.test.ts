import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicProfileRouter } from "./publicProfile.js";

const { getUserMock, profilesMock, visibilityMock, certificatesMock, fromMock } = vi.hoisted(() => {
  // `profiles` is queried twice per request on every authenticated route
  // here — once by requireAuth's own role lookup, once by the route body
  // (mint/lookup/bind) — so a single static `result` can't represent both
  // answers. `queue` holds per-call overrides, shifted off on each
  // `.then()`; once exhausted, `result` is the steady-state fallback. Same
  // pattern as users.test.ts/employerSearch.test.ts, for the same reason.
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const queue: { data: unknown; error: unknown }[] = [];
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(queue.shift() ?? result)),
    };
    for (const method of ["select", "update", "eq", "order", "single", "maybeSingle"]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result, queue };
  }

  const profilesMock = createTableMock();
  const visibilityMock = createTableMock();
  const certificatesMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    visibility_settings: visibilityMock,
    certificates: certificatesMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, visibilityMock, certificatesMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", publicProfileRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  // Queued, not set as `result`: requireAuth's lookup is always the first
  // profiles call, so queueing it leaves the route's own second call free to
  // be answered separately via `result`.
  profilesMock.queue.push({ data: { role }, error: null });
}

beforeEach(() => {
  getUserMock.mockReset();
  profilesMock.builder.eq.mockClear();
  fromMock.mockClear();
  for (const mock of [profilesMock, visibilityMock, certificatesMock]) {
    mock.queue.length = 0;
    mock.result.data = null;
    mock.result.error = null;
  }
});

const TRAINEE_ID = "11111111-1111-1111-1111-111111111111";

describe("GET /api/public-profiles/:code", () => {
  it("requires no authentication at all", async () => {
    const res = await request(buildApp()).get("/api/public-profiles/NCCT-DOESNOTEXIST");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown code", async () => {
    profilesMock.result.data = null;
    const res = await request(buildApp()).get("/api/public-profiles/NCCT-UNKNOWN");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the trainee has never opted in (no visibility_settings row)", async () => {
    profilesMock.result.data = { id: TRAINEE_ID, full_name: "Asha Patil" };
    visibilityMock.result.data = null;
    const res = await request(buildApp()).get("/api/public-profiles/NCCT-ABC");
    expect(res.status).toBe(404);
  });

  it("returns 404 when public_profile_enabled is explicitly false", async () => {
    // Same response as "never opted in" and "unknown code" — deliberately
    // indistinguishable so neither leaks which codes are real.
    profilesMock.result.data = { id: TRAINEE_ID, full_name: "Asha Patil" };
    visibilityMock.result.data = { public_profile_enabled: false };
    const res = await request(buildApp()).get("/api/public-profiles/NCCT-ABC");
    expect(res.status).toBe(404);
  });

  it("returns the profile with derived skills when opted in", async () => {
    profilesMock.result.data = { id: TRAINEE_ID, full_name: "Asha Patil" };
    visibilityMock.result.data = { public_profile_enabled: true };
    certificatesMock.result.data = [
      {
        certificate_code: "NCCT-ABC12345",
        issued_at: "2026-07-01T00:00:00.000Z",
        programmes: { title: "Cooperative Banking Operations" },
        institutions: { name: "VAMNICOM" },
      },
    ];

    const res = await request(buildApp()).get("/api/public-profiles/NCCT-A7K2M9QXB4H8W2FD");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      full_name: "Asha Patil",
      skills: ["Cooperative Banking Operations"],
      certificates: [
        {
          certificate_code: "NCCT-ABC12345",
          programme_title: "Cooperative Banking Operations",
          institution_name: "VAMNICOM",
        },
      ],
    });
  });
});

describe("POST /api/profiles/me/card", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/profiles/me/card");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/profiles/me/card")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("mints a code scoped to the caller's own id, never the request body", async () => {
    authenticateAs(TRAINEE_ID, "trainee");
    profilesMock.result.data = { public_profile_code: "NCCT-GENERATEDCODE1" };

    const res = await request(buildApp())
      .post("/api/profiles/me/card")
      .set("Authorization", "Bearer token")
      .send({ trainee_id: "someone-elses-id" });

    expect(res.status).toBe(200);
    expect(res.body.public_profile_code).toMatch(/^NCCT-/);
    expect(profilesMock.builder.eq).toHaveBeenCalledWith("id", TRAINEE_ID);
  });
});

describe("GET /api/kiosk/nfc-lookup/:uid", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/kiosk/nfc-lookup/04A22B9C");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs(TRAINEE_ID, "trainee");
    const res = await request(buildApp())
      .get("/api/kiosk/nfc-lookup/04A22B9C")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unbound uid", async () => {
    authenticateAs("trainer-1", "trainer");
    profilesMock.result.data = null;
    const res = await request(buildApp())
      .get("/api/kiosk/nfc-lookup/04A22B9C")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(404);
  });

  it("does not require public_profile_enabled — staff already see trainee records", async () => {
    authenticateAs("trainer-1", "trainer");
    profilesMock.result.data = { id: TRAINEE_ID, full_name: "Arjun Patil" };
    certificatesMock.result.data = [];

    const res = await request(buildApp())
      .get("/api/kiosk/nfc-lookup/04A22B9C")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe("Arjun Patil");
    // visibility_settings is never queried on this path.
    expect(fromMock).not.toHaveBeenCalledWith("visibility_settings");
  });

  it("normalises separators and case before looking up the uid", async () => {
    authenticateAs("trainer-1", "trainer");
    profilesMock.result.data = { id: TRAINEE_ID, full_name: "Arjun Patil" };
    certificatesMock.result.data = [];

    await request(buildApp())
      .get("/api/kiosk/nfc-lookup/04:a2:2b:9c")
      .set("Authorization", "Bearer token");

    expect(profilesMock.builder.eq).toHaveBeenCalledWith("nfc_tag_uid", "04A22B9C");
  });
});

describe("PUT /api/profiles/:traineeId/nfc-tag", () => {
  it("returns 403 for a trainee binding their own card", async () => {
    authenticateAs(TRAINEE_ID, "trainee");
    const res = await request(buildApp())
      .put(`/api/profiles/${TRAINEE_ID}/nfc-tag`)
      .set("Authorization", "Bearer token")
      .send({ nfc_tag_uid: "04A22B9C" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .put(`/api/profiles/${TRAINEE_ID}/nfc-tag`)
      .set("Authorization", "Bearer token")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown trainee id", async () => {
    authenticateAs("trainer-1", "trainer");
    profilesMock.result.data = null;
    const res = await request(buildApp())
      .put(`/api/profiles/${TRAINEE_ID}/nfc-tag`)
      .set("Authorization", "Bearer token")
      .send({ nfc_tag_uid: "04A22B9C" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the card is already bound to someone else", async () => {
    authenticateAs("trainer-1", "trainer");
    profilesMock.result.data = null;
    profilesMock.result.error = { code: "23505", message: "duplicate key" };
    const res = await request(buildApp())
      .put(`/api/profiles/${TRAINEE_ID}/nfc-tag`)
      .set("Authorization", "Bearer token")
      .send({ nfc_tag_uid: "04A22B9C" });
    expect(res.status).toBe(409);
  });

  it("binds a normalised uid to the trainee", async () => {
    authenticateAs("trainer-1", "trainer");
    profilesMock.result.data = { id: TRAINEE_ID, full_name: "Asha Patil", nfc_tag_uid: "04A22B9C" };

    const res = await request(buildApp())
      .put(`/api/profiles/${TRAINEE_ID}/nfc-tag`)
      .set("Authorization", "Bearer token")
      .send({ nfc_tag_uid: "04:a2:2b:9c" });

    expect(res.status).toBe(200);
    expect(res.body.nfc_tag_uid).toBe("04A22B9C");
  });

  it("unbinds a card when nfc_tag_uid is null", async () => {
    authenticateAs("trainer-1", "trainer");
    profilesMock.result.data = { id: TRAINEE_ID, full_name: "Asha Patil", nfc_tag_uid: null };

    const res = await request(buildApp())
      .put(`/api/profiles/${TRAINEE_ID}/nfc-tag`)
      .set("Authorization", "Bearer token")
      .send({ nfc_tag_uid: null });

    expect(res.status).toBe(200);
    expect(res.body.nfc_tag_uid).toBeNull();
  });
});
