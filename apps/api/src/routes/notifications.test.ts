import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationsRouter } from "./notifications.js";

const { getUserMock, profilesMock, notificationsMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown; count?: number | null } = {
      data: null,
      error: null,
      count: null,
    };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      // The unread count and the mark-read updates have no terminal call.
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of ["select", "update", "eq", "is", "order"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "limit"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }
  const profilesMock = createTableMock();
  const notificationsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    notifications: notificationsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, notificationsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", notificationsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
}

beforeEach(() => {
  getUserMock.mockReset();
  profilesMock.result.data = null;
  notificationsMock.result.data = null;
  notificationsMock.result.error = null;
  notificationsMock.result.count = null;
  for (const fn of Object.values(notificationsMock.builder)) fn.mockClear();
});

describe("GET /api/notifications/unread-count", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/notifications/unread-count");
    expect(res.status).toBe(401);
  });

  it("counts only unread rows, for any role", async () => {
    authenticateAs("employer-1", "employer");
    notificationsMock.result.count = 3;

    const res = await request(buildApp())
      .get("/api/notifications/unread-count")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unread_count: 3 });
    expect(notificationsMock.builder.is).toHaveBeenCalledWith("read_at", null);
  });
});

describe("GET /api/notifications/mine", () => {
  it("returns the newest notifications plus the unread count", async () => {
    authenticateAs("trainee-1", "trainee");
    notificationsMock.result.data = [
      {
        id: "n-1",
        type: "lesson_published",
        data: { lesson_title: "Intro" },
        read_at: null,
        created_at: "2026-09-25",
      },
    ];
    notificationsMock.result.count = 1;

    const res = await request(buildApp())
      .get("/api/notifications/mine")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.unread_count).toBe(1);
    expect(notificationsMock.builder.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("caps an oversized limit at the server maximum", async () => {
    authenticateAs("trainee-1", "trainee");
    notificationsMock.result.data = [];

    await request(buildApp())
      .get("/api/notifications/mine?limit=5000")
      .set("Authorization", "Bearer t");

    expect(notificationsMock.builder.limit).toHaveBeenCalledWith(30);
  });

  it("returns 400 when the read fails", async () => {
    authenticateAs("trainee-1", "trainee");
    notificationsMock.result.error = { message: "boom" };

    const res = await request(buildApp())
      .get("/api/notifications/mine")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(400);
  });
});

describe("marking read", () => {
  it("marks one notification read, scoped to the caller", async () => {
    authenticateAs("trainee-1", "trainee");

    const res = await request(buildApp())
      .post("/api/notifications/n-1/read")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(204);
    expect(notificationsMock.builder.eq).toHaveBeenCalledWith("id", "n-1");
    // The recipient filter is what stops anyone marking someone else's row.
    expect(notificationsMock.builder.eq).toHaveBeenCalledWith("recipient_id", "trainee-1");
  });

  it("marks all of the caller's unread notifications read", async () => {
    authenticateAs("admin-1", "admin");

    const res = await request(buildApp())
      .post("/api/notifications/read-all")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(204);
    expect(notificationsMock.builder.eq).toHaveBeenCalledWith("recipient_id", "admin-1");
    expect(notificationsMock.builder.is).toHaveBeenCalledWith("read_at", null);
  });

  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/notifications/read-all");
    expect(res.status).toBe(401);
  });
});
