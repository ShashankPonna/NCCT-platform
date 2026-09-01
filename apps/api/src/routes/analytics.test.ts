import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsRouter } from "./analytics.js";

const { getUserMock, profilesMock, fromMock, getDashboardAnalyticsMock } = vi.hoisted(() => {
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
    getDashboardAnalyticsMock: vi.fn(),
  };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

vi.mock("../analyticsService.js", () => ({ getDashboardAnalytics: getDashboardAnalyticsMock }));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", analyticsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  getDashboardAnalyticsMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
});

describe("GET /api/analytics/dashboard", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/analytics/dashboard");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainer (admin-only, unlike F3/F4's content routes)", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .get("/api/analytics/dashboard")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .get("/api/analytics/dashboard")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns the aggregated dashboard for admin", async () => {
    authenticateAs("admin-1", "admin");
    const payload = {
      programmesRun: { total: 1, byMode: [] },
      traineesByRegion: [],
      completionRates: { overall: { approvedNominations: 0, certificatesIssued: 0, rate: 0 }, byProgramme: [] },
      certificatesIssued: { total: 0, byMonth: [] },
      placements: { totalJobs: 0, byStatus: [] },
    };
    getDashboardAnalyticsMock.mockResolvedValue(payload);

    const res = await request(buildApp())
      .get("/api/analytics/dashboard")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
  });

  it("returns 400 with the underlying message when a query fails", async () => {
    authenticateAs("admin-1", "admin");
    getDashboardAnalyticsMock.mockRejectedValue(new Error("Analytics query failed (jobs): timeout"));

    const res = await request(buildApp())
      .get("/api/analytics/dashboard")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("jobs");
  });
});
