import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { profileRouter } from "./profile.js";

// Two separate clients are mocked deliberately: requireAuth resolves the
// caller's role through `supabaseAdmin`, while the profile read/update
// routes go through the caller's own RLS-scoped `req.supabase`. Both query
// the `profiles` table, so a single shared mock would make the auth lookup
// and the route's own query return the same row — hiding real bugs.
const { getUserMock, authProfileMock, ownProfileMock, adminFromMock, userFromMock } = vi.hoisted(
  () => {
    function createTableMock() {
      const result: { data: unknown; error: unknown } = { data: null, error: null };
      const builder: Record<string, ReturnType<typeof vi.fn>> = {
        then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
      };
      for (const method of ["select", "update", "eq", "single", "maybeSingle"]) {
        builder[method] = vi.fn(() => builder);
      }
      return { builder, result };
    }

    const authProfileMock = createTableMock();
    const ownProfileMock = createTableMock();
    return {
      getUserMock: vi.fn(),
      authProfileMock,
      ownProfileMock,
      adminFromMock: vi.fn(() => authProfileMock.builder),
      userFromMock: vi.fn(() => ownProfileMock.builder),
    };
  },
);

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: adminFromMock },
  getSupabaseForUser: () => ({ from: userFromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", profileRouter);
  return app;
}

function authenticateAs(userId: string, role: string, fullName: string | null = "Test User") {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  authProfileMock.result.data = { role, full_name: fullName };
  authProfileMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  ownProfileMock.builder.update.mockClear();
  ownProfileMock.builder.eq.mockClear();
  for (const mock of [authProfileMock, ownProfileMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("GET /api/profile", () => {
  it("returns 401 when no bearer token is provided", async () => {
    const res = await request(buildApp()).get("/api/profile");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is invalid", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });

    const res = await request(buildApp())
      .get("/api/profile")
      .set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
  });

  it("returns the caller's id, role, and full_name when authenticated", async () => {
    authenticateAs("user-123", "trainee", "Asha Patil");

    const res = await request(buildApp())
      .get("/api/profile")
      .set("Authorization", "Bearer good-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "user-123", role: "trainee", full_name: "Asha Patil" });
  });

  it("returns full_name: null when the profile hasn't set one", async () => {
    authenticateAs("user-123", "trainee", null);

    const res = await request(buildApp())
      .get("/api/profile")
      .set("Authorization", "Bearer good-token");

    expect(res.status).toBe(200);
    expect(res.body.full_name).toBeNull();
  });
});

describe("GET /api/profile/details", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/profile/details");
    expect(res.status).toBe(401);
  });

  it("returns the caller's full profile row", async () => {
    authenticateAs(USER_ID, "employer");
    ownProfileMock.result.data = {
      id: USER_ID,
      role: "employer",
      full_name: "Emp Owner",
      phone: "999",
      org_name: "Dairy Co-op",
      org_sector: "dairy",
    };

    const res = await request(buildApp())
      .get("/api/profile/details")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ org_name: "Dairy Co-op", org_sector: "dairy" });
    // Scoped to the caller, never a request-supplied id.
    expect(ownProfileMock.builder.eq).toHaveBeenCalledWith("id", USER_ID);
  });

  it("returns 404 when no profile row exists", async () => {
    authenticateAs(USER_ID, "trainee");
    ownProfileMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/profile/details")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/profile", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).patch("/api/profile").send({ full_name: "X" });
    expect(res.status).toBe(401);
  });

  it("rejects an empty body rather than treating a no-op as success", async () => {
    authenticateAs(USER_ID, "trainee");

    const res = await request(buildApp())
      .patch("/api/profile")
      .set("Authorization", "Bearer token")
      .send({});

    expect(res.status).toBe(400);
    expect(ownProfileMock.builder.update).not.toHaveBeenCalled();
  });

  it("ignores an attempt to change your own role", async () => {
    authenticateAs(USER_ID, "trainee");
    ownProfileMock.result.data = { id: USER_ID, role: "trainee", full_name: "Still Trainee" };

    const res = await request(buildApp())
      .patch("/api/profile")
      .set("Authorization", "Bearer token")
      .send({ full_name: "Still Trainee", role: "admin" });

    expect(res.status).toBe(200);
    // zod strips unknown keys, so `role` must never reach the update.
    expect(ownProfileMock.builder.update).toHaveBeenCalledWith({ full_name: "Still Trainee" });
  });

  it("updates employer org fields on the caller's own row", async () => {
    authenticateAs(USER_ID, "employer");
    ownProfileMock.result.data = {
      id: USER_ID,
      role: "employer",
      org_name: "New Co-op",
      org_sector: "credit",
    };

    const res = await request(buildApp())
      .patch("/api/profile")
      .set("Authorization", "Bearer token")
      .send({ org_name: "New Co-op", org_sector: "credit" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ org_name: "New Co-op", org_sector: "credit" });
    expect(ownProfileMock.builder.eq).toHaveBeenCalledWith("id", USER_ID);
  });

  it("allows clearing an optional field to null", async () => {
    authenticateAs(USER_ID, "trainee");
    ownProfileMock.result.data = { id: USER_ID, role: "trainee", phone: null };

    const res = await request(buildApp())
      .patch("/api/profile")
      .set("Authorization", "Bearer token")
      .send({ phone: null });

    expect(res.status).toBe(200);
    expect(ownProfileMock.builder.update).toHaveBeenCalledWith({ phone: null });
  });
});
