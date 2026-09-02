import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { profileRouter } from "./profile.js";

const { getUserMock, singleMock, fromMock } = vi.hoisted(() => {
  const singleMock = vi.fn();
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const getUserMock = vi.fn();
  return { getUserMock, singleMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
  getSupabaseForUser: vi.fn(() => ({})),
}));

function buildApp() {
  const app = express();
  app.use("/api", profileRouter);
  return app;
}

beforeEach(() => {
  getUserMock.mockReset();
  singleMock.mockReset();
});

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
    getUserMock.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    singleMock.mockResolvedValue({ data: { role: "trainee", full_name: "Asha Patil" }, error: null });

    const res = await request(buildApp())
      .get("/api/profile")
      .set("Authorization", "Bearer good-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "user-123", role: "trainee", full_name: "Asha Patil" });
  });

  it("returns full_name: null when the profile hasn't set one", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    singleMock.mockResolvedValue({ data: { role: "trainee", full_name: null }, error: null });

    const res = await request(buildApp())
      .get("/api/profile")
      .set("Authorization", "Bearer good-token");

    expect(res.status).toBe(200);
    expect(res.body.full_name).toBeNull();
  });
});
