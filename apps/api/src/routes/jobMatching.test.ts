import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobMatchingRouter } from "./jobMatching.js";

const { getUserMock, profilesMock, fromMock, matchJobsForTraineeMock } = vi.hoisted(() => {
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
    matchJobsForTraineeMock: vi.fn(),
  };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

vi.mock("../jobMatchingService.js", () => ({ matchJobsForTrainee: matchJobsForTraineeMock }));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", jobMatchingRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  matchJobsForTraineeMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
});

describe("GET /api/job-matches/mine", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/job-matches/mine");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("employer-1", "employer");
    const res = await request(buildApp()).get("/api/job-matches/mine").set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns the caller's ranked matches", async () => {
    authenticateAs("trainee-1", "trainee");
    const payload = { matches: [{ id: "job-1", title: "Accounts Officer", similarity: 0.8 }], hasProfileSignal: true };
    matchJobsForTraineeMock.mockResolvedValue(payload);

    const res = await request(buildApp()).get("/api/job-matches/mine").set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(matchJobsForTraineeMock).toHaveBeenCalledWith("trainee-1");
  });

  it("returns 400 with the underlying message when the service fails", async () => {
    authenticateAs("trainee-1", "trainee");
    matchJobsForTraineeMock.mockRejectedValue(new Error("rpc exploded"));
    const res = await request(buildApp()).get("/api/job-matches/mine").set("Authorization", "Bearer token");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("rpc exploded");
  });
});
