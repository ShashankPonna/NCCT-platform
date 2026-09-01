import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { programmesRouter } from "./programmes.js";

// The table-mock builder (below, inside vi.hoisted) covers the chain shapes
// this route uses (select/insert/update/delete/eq chain to a single
// terminal call). It's defined inline rather than imported because
// vi.mock's factory is hoisted above regular imports — an imported helper
// referenced from vi.hoisted would be undefined when the factory runs.
const { getUserMock, profilesMock, programmesMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "insert", "update", "delete", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const programmesMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    programmes: programmesMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, programmesMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", programmesRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

const validProgramme = {
  institution_id: "11111111-1111-1111-1111-111111111111",
  title: "Cooperative Management Basics",
  mode: "online",
};

beforeEach(() => {
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  programmesMock.result.data = null;
  programmesMock.result.error = null;
});

describe("POST /api/programmes", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/programmes").send(validProgramme);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin role", async () => {
    authenticateAs("trainee-1", "trainee");

    const res = await request(buildApp())
      .post("/api/programmes")
      .set("Authorization", "Bearer token")
      .send(validProgramme);

    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .post("/api/programmes")
      .set("Authorization", "Bearer token")
      .send({ title: "Missing required fields" });

    expect(res.status).toBe(400);
  });

  it("creates the programme for an admin with a valid body", async () => {
    authenticateAs("admin-1", "admin");
    programmesMock.result.data = { id: "prog-1", ...validProgramme, created_by: "admin-1" };

    const res = await request(buildApp())
      .post("/api/programmes")
      .set("Authorization", "Bearer token")
      .send(validProgramme);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "prog-1", title: validProgramme.title });
  });
});

describe("GET /api/programmes", () => {
  it("lists programmes for any authenticated user", async () => {
    authenticateAs("trainee-1", "trainee");
    programmesMock.result.data = [{ id: "prog-1", ...validProgramme }];

    const res = await request(buildApp())
      .get("/api/programmes")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/programmes/:id", () => {
  it("returns 404 when the programme doesn't exist", async () => {
    authenticateAs("trainee-1", "trainee");
    programmesMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/programmes/does-not-exist")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns the programme when found", async () => {
    authenticateAs("trainee-1", "trainee");
    programmesMock.result.data = { id: "prog-1", ...validProgramme };

    const res = await request(buildApp())
      .get("/api/programmes/prog-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("prog-1");
  });
});

describe("PATCH /api/programmes/:id", () => {
  it("returns 403 for a non-admin role", async () => {
    authenticateAs("trainee-1", "trainee");

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });

    expect(res.status).toBe(403);
  });

  it("updates the programme for an admin", async () => {
    authenticateAs("admin-1", "admin");
    programmesMock.result.data = { id: "prog-1", ...validProgramme, title: "Updated" };

    const res = await request(buildApp())
      .patch("/api/programmes/prog-1")
      .set("Authorization", "Bearer token")
      .send({ title: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated");
  });
});

describe("DELETE /api/programmes/:id", () => {
  it("returns 404 when the programme doesn't exist", async () => {
    authenticateAs("admin-1", "admin");
    programmesMock.result.data = null;

    const res = await request(buildApp())
      .delete("/api/programmes/does-not-exist")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("deletes the programme for an admin", async () => {
    authenticateAs("admin-1", "admin");
    programmesMock.result.data = { id: "prog-1" };

    const res = await request(buildApp())
      .delete("/api/programmes/prog-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
  });
});
