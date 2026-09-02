import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usersRouter } from "./users.js";

const { getUserMock, createUserMock, profilesMock, fromMock } = vi.hoisted(() => {
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

  const profilesMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = { profiles: profilesMock };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  return {
    getUserMock: vi.fn(),
    createUserMock: vi.fn(),
    profilesMock,
    fromMock,
  };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: {
    auth: { getUser: getUserMock, admin: { createUser: createUserMock } },
    from: fromMock,
  },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", usersRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  createUserMock.mockReset();
  profilesMock.builder.update.mockClear();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
});

describe("POST /api/users", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/users").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/users")
      .set("Authorization", "Bearer token")
      .send({ email: "x@example.com", role: "trainee", full_name: "X" });
    expect(res.status).toBe(403);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid role", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/users")
      .set("Authorization", "Bearer token")
      .send({ email: "x@example.com", role: "superuser", full_name: "X" });
    expect(res.status).toBe(400);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("creates a user and returns a generated temp password", async () => {
    authenticateAs("admin-1", "admin");
    createUserMock.mockResolvedValue({ data: { user: { id: "new-1" } }, error: null });

    const res = await request(buildApp())
      .post("/api/users")
      .set("Authorization", "Bearer token")
      .send({ email: "trainer@example.com", role: "trainer", full_name: "New Trainer" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "new-1", role: "trainer" });
    expect(typeof res.body.temp_password).toBe("string");
    expect(res.body.temp_password.length).toBeGreaterThan(8);
    // Role must come from the validated body, not from anything else.
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_metadata: { role: "trainer", full_name: "New Trainer" } }),
    );
  });

  it("does not echo a password the admin supplied themselves", async () => {
    authenticateAs("admin-1", "admin");
    createUserMock.mockResolvedValue({ data: { user: { id: "new-2" } }, error: null });

    const res = await request(buildApp())
      .post("/api/users")
      .set("Authorization", "Bearer token")
      .send({
        email: "e@example.com",
        role: "employer",
        full_name: "Emp",
        password: "chosen-password-123",
      });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("temp_password");
  });

  it("writes the extra profile fields the signup trigger does not copy", async () => {
    authenticateAs("admin-1", "admin");
    createUserMock.mockResolvedValue({ data: { user: { id: "new-3" } }, error: null });

    await request(buildApp())
      .post("/api/users")
      .set("Authorization", "Bearer token")
      .send({
        email: "e2@example.com",
        role: "employer",
        full_name: "Emp Two",
        org_name: "Dairy Co-op",
        org_sector: "dairy",
      });

    expect(profilesMock.builder.update).toHaveBeenCalledWith({
      org_name: "Dairy Co-op",
      org_sector: "dairy",
    });
  });

  it("maps an existing email to 409 rather than a generic 400", async () => {
    authenticateAs("admin-1", "admin");
    createUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });

    const res = await request(buildApp())
      .post("/api/users")
      .set("Authorization", "Bearer token")
      .send({ email: "dupe@example.com", role: "trainee", full_name: "Dupe" });

    expect(res.status).toBe(409);
  });
});

describe("POST /api/users/bulk-trainees", () => {
  it("returns 403 for a non-admin", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/users/bulk-trainees")
      .set("Authorization", "Bearer token")
      .send({ trainees: [{ email: "a@example.com", full_name: "A" }] });
    expect(res.status).toBe(403);
  });

  it("rejects an empty list", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/users/bulk-trainees")
      .set("Authorization", "Bearer token")
      .send({ trainees: [] });
    expect(res.status).toBe(400);
  });

  it("imports every valid row and reports per-row outcomes", async () => {
    authenticateAs("admin-1", "admin");
    createUserMock
      .mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: "u2" } }, error: null });

    const res = await request(buildApp())
      .post("/api/users/bulk-trainees")
      .set("Authorization", "Bearer token")
      .send({
        trainees: [
          { email: "a@example.com", full_name: "A" },
          { email: "b@example.com", full_name: "B", phone: "999" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, skipped: 0, failed: 0 });
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0]).toMatchObject({ email: "a@example.com", status: "created" });
    expect(typeof res.body.rows[0].temp_password).toBe("string");
  });

  it("keeps going after a duplicate, reporting it as skipped (partial success)", async () => {
    authenticateAs("admin-1", "admin");
    createUserMock
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: "already been registered" },
      })
      .mockResolvedValueOnce({ data: { user: { id: "u2" } }, error: null });

    const res = await request(buildApp())
      .post("/api/users/bulk-trainees")
      .set("Authorization", "Bearer token")
      .send({
        trainees: [
          { email: "dupe@example.com", full_name: "Dupe" },
          { email: "ok@example.com", full_name: "Ok" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, skipped: 1, failed: 0 });
    expect(res.body.rows[0].status).toBe("skipped");
    expect(res.body.rows[1].status).toBe("created");
  });

  it("always creates trainees, never a role the payload asks for", async () => {
    authenticateAs("admin-1", "admin");
    createUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await request(buildApp())
      .post("/api/users/bulk-trainees")
      .set("Authorization", "Bearer token")
      // A crafted row trying to smuggle in an elevated role.
      .send({ trainees: [{ email: "a@example.com", full_name: "A", role: "admin" }] });

    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_metadata: { role: "trainee", full_name: "A" } }),
    );
  });
});
