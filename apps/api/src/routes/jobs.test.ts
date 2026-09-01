import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobsRouter } from "./jobs.js";

const { getUserMock, profilesMock, jobsMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    // Every chain method returns the same builder (real supabase-js filter
    // builders stay chainable regardless of call order — e.g. GET /jobs
    // calls .order() and then conditionally .ilike()/.contains() after it),
    // and the builder itself is thenable so `await` works at any point in
    // the chain, not just after a fixed set of "terminal" methods.
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of [
      "select",
      "insert",
      "update",
      "delete",
      "upsert",
      "eq",
      "ilike",
      "contains",
      "order",
      "single",
      "maybeSingle",
    ]) {
      builder[method] = vi.fn(() => builder);
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const jobsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    jobs: jobsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, jobsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", jobsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  jobsMock.builder.insert.mockClear();
  for (const mock of [profilesMock, jobsMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

describe("POST /api/jobs", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/jobs").send({ title: "Warehouse hand" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-employer", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/jobs")
      .set("Authorization", "Bearer token")
      .send({ title: "Warehouse hand" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a missing title", async () => {
    authenticateAs("employer-1", "employer");
    const res = await request(buildApp())
      .post("/api/jobs")
      .set("Authorization", "Bearer token")
      .send({});
    expect(res.status).toBe(400);
  });

  it("creates a job owned by the caller", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { id: "job-1", employer_id: "employer-1", title: "Warehouse hand" };

    const res = await request(buildApp())
      .post("/api/jobs")
      .set("Authorization", "Bearer token")
      .send({ title: "Warehouse hand", location: "Pune" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ employer_id: "employer-1", title: "Warehouse hand" });
    expect(jobsMock.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ employer_id: "employer-1", title: "Warehouse hand" }),
    );
  });
});

describe("GET /api/jobs", () => {
  it("requires no auth and lists jobs", async () => {
    jobsMock.result.data = [{ id: "job-1", title: "Warehouse hand" }];

    const res = await request(buildApp()).get("/api/jobs");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "job-1", title: "Warehouse hand" }]);
  });

  it("applies location/skill filters when provided", async () => {
    jobsMock.result.data = [];

    const res = await request(buildApp()).get("/api/jobs?location=Pune&skill=welding");

    expect(res.status).toBe(200);
    expect(jobsMock.builder.ilike).toHaveBeenCalledWith("location", "%Pune%");
    expect(jobsMock.builder.contains).toHaveBeenCalledWith("required_skills", ["welding"]);
  });
});

describe("GET /api/jobs/:id", () => {
  it("returns 404 for a nonexistent job", async () => {
    jobsMock.result.data = null;
    const res = await request(buildApp()).get("/api/jobs/job-1");
    expect(res.status).toBe(404);
  });

  it("returns the job", async () => {
    jobsMock.result.data = { id: "job-1", title: "Warehouse hand" };
    const res = await request(buildApp()).get("/api/jobs/job-1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "job-1" });
  });
});

describe("PATCH /api/jobs/:id", () => {
  it("returns 403 for a non-employer", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .patch("/api/jobs/job-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when RLS excludes a non-owned job (0 rows matched)", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = null;
    const res = await request(buildApp())
      .patch("/api/jobs/job-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });
    expect(res.status).toBe(404);
  });

  it("updates the caller's own job", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { id: "job-1", employer_id: "employer-1", title: "Updated" };
    const res = await request(buildApp())
      .patch("/api/jobs/job-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Updated" });
  });
});

describe("DELETE /api/jobs/:id", () => {
  it("returns 404 when RLS excludes a non-owned job", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = null;
    const res = await request(buildApp())
      .delete("/api/jobs/job-1")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(404);
  });

  it("deletes the caller's own job", async () => {
    authenticateAs("employer-1", "employer");
    jobsMock.result.data = { id: "job-1", employer_id: "employer-1" };
    const res = await request(buildApp())
      .delete("/api/jobs/job-1")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(204);
  });
});
