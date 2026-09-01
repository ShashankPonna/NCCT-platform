import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobInterestsRouter } from "./jobInterests.js";

const { getUserMock, profilesMock, jobsMock, interestsMock, visibilityMock, fromMock } = vi.hoisted(
  () => {
    function createTableMock() {
      const result: { data: unknown; error: unknown } = { data: null, error: null };
      const builder: Record<string, ReturnType<typeof vi.fn>> = {
        then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
      };
      for (const method of ["select", "insert", "update", "delete", "eq", "order"]) {
        builder[method] = vi.fn(() => builder);
      }
      for (const method of ["single", "maybeSingle"]) {
        builder[method] = vi.fn(() => builder);
      }
      return { builder, result };
    }

    const profilesMock = createTableMock();
    const jobsMock = createTableMock();
    const interestsMock = createTableMock();
    const visibilityMock = createTableMock();
    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      profiles: profilesMock,
      jobs: jobsMock,
      job_interests: interestsMock,
      visibility_settings: visibilityMock,
    };
    const fromMock = vi.fn((table: string) => tables[table].builder);
    const getUserMock = vi.fn();
    return { getUserMock, profilesMock, jobsMock, interestsMock, visibilityMock, fromMock };
  },
);

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", jobInterestsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  interestsMock.builder.insert.mockClear();
  for (const mock of [profilesMock, jobsMock, interestsMock, visibilityMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

const TRAINEE_ID = "11111111-1111-1111-1111-111111111111";

describe("POST /api/jobs/:jobId/interests", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/jobs/job-1/interests")
      .send({ trainee_id: TRAINEE_ID });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-employer", async () => {
    authenticateAs("trainee-2", "trainee");
    const res = await request(buildApp())
      .post("/api/jobs/job-1/interests")
      .set("Authorization", "Bearer token")
      .send({ trainee_id: TRAINEE_ID });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the job isn't owned by the caller", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "someone-else" };
    const res = await request(buildApp())
      .post("/api/jobs/job-1/interests")
      .set("Authorization", "Bearer token")
      .send({ trainee_id: TRAINEE_ID });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the trainee has not opted into visibility", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "employer-1" };
    visibilityMock.result.data = { visible_to_employers: false };
    const res = await request(buildApp())
      .post("/api/jobs/job-1/interests")
      .set("Authorization", "Bearer token")
      .send({ trainee_id: TRAINEE_ID });
    expect(res.status).toBe(403);
    expect(interestsMock.builder.insert).not.toHaveBeenCalled();
  });

  it("shortlists a visible trainee for the caller's own job", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "employer-1" };
    visibilityMock.result.data = { visible_to_employers: true };
    interestsMock.result.data = { id: "interest-1", job_id: "job-1", trainee_id: TRAINEE_ID };

    const res = await request(buildApp())
      .post("/api/jobs/job-1/interests")
      .set("Authorization", "Bearer token")
      .send({ trainee_id: TRAINEE_ID });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ trainee_id: TRAINEE_ID });
  });

  it("returns 409 on a duplicate shortlist", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "employer-1" };
    visibilityMock.result.data = { visible_to_employers: true };
    interestsMock.result.data = null;
    interestsMock.result.error = { code: "23505", message: "duplicate" };

    const res = await request(buildApp())
      .post("/api/jobs/job-1/interests")
      .set("Authorization", "Bearer token")
      .send({ trainee_id: TRAINEE_ID });

    expect(res.status).toBe(409);
  });
});

describe("GET /api/jobs/:jobId/interests", () => {
  it("returns 404 when the job isn't owned by the caller", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = null;
    const res = await request(buildApp())
      .get("/api/jobs/job-1/interests")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(404);
  });

  it("lists interests for the caller's own job", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "employer-1" };
    interestsMock.result.data = [{ id: "interest-1", status: "shortlisted" }];
    const res = await request(buildApp())
      .get("/api/jobs/job-1/interests")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "interest-1", status: "shortlisted" }]);
  });
});

describe("PATCH /api/jobs/:jobId/interests/:interestId", () => {
  it("returns 400 for an invalid status", async () => {
    authenticateAs("employer-1", "employer");
    const res = await request(buildApp())
      .patch("/api/jobs/job-1/interests/interest-1")
      .set("Authorization", "Bearer token")
      .send({ status: "not-a-status" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the job isn't owned by the caller", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = null;
    const res = await request(buildApp())
      .patch("/api/jobs/job-1/interests/interest-1")
      .set("Authorization", "Bearer token")
      .send({ status: "viewed" });
    expect(res.status).toBe(404);
  });

  it("updates the interest status", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { employer_id: "employer-1" };
    interestsMock.result.data = { id: "interest-1", status: "viewed" };
    const res = await request(buildApp())
      .patch("/api/jobs/job-1/interests/interest-1")
      .set("Authorization", "Bearer token")
      .send({ status: "viewed" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "viewed" });
  });
});

describe("GET /api/job-interests/mine", () => {
  it("returns 403 for a non-trainee", async () => {
    authenticateAs("employer-1", "employer");
    const res = await request(buildApp())
      .get("/api/job-interests/mine")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns the caller's own shortlist entries", async () => {
    authenticateAs("trainee-1", "trainee");
    interestsMock.result.data = [{ id: "interest-1", jobs: { title: "Warehouse hand" } }];
    const res = await request(buildApp())
      .get("/api/job-interests/mine")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "interest-1", jobs: { title: "Warehouse hand" } }]);
  });
});
