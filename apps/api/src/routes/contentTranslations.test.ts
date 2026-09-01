import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentTranslationsRouter } from "./contentTranslations.js";

const { getUserMock, profilesMock, translationsMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "insert", "update", "delete", "upsert", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const translationsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    content_translations: translationsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, translationsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", contentTranslationsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  translationsMock.result.data = null;
  translationsMock.result.error = null;
});

describe("GET /api/lessons/:id/translations", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/lessons/lesson-1/translations");
    expect(res.status).toBe(401);
  });

  it("lists translations for any authenticated user", async () => {
    authenticateAs("trainee-1", "trainee");
    translationsMock.result.data = [
      { id: "t-1", lesson_id: "lesson-1", locale: "en", title: "Welcome" },
      { id: "t-2", lesson_id: "lesson-1", locale: "hi", title: "स्वागत" },
    ];

    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/translations")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe("PUT /api/lessons/:id/translations/:locale", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .put("/api/lessons/lesson-1/translations/hi")
      .set("Authorization", "Bearer token")
      .send({ title: "स्वागत" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a malformed locale", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .put("/api/lessons/lesson-1/translations/not-a-locale")
      .set("Authorization", "Bearer token")
      .send({ title: "Something" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a translation with no content at all", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .put("/api/lessons/lesson-1/translations/hi")
      .set("Authorization", "Bearer token")
      .send({});
    expect(res.status).toBe(400);
  });

  it("upserts a translation for an admin", async () => {
    authenticateAs("admin-1", "admin");
    translationsMock.result.data = {
      id: "t-2",
      lesson_id: "lesson-1",
      locale: "hi",
      title: "स्वागत",
    };

    const res = await request(buildApp())
      .put("/api/lessons/lesson-1/translations/hi")
      .set("Authorization", "Bearer token")
      .send({ title: "स्वागत", body: "सहकारी प्रबंधन का परिचय" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ locale: "hi" });
  });

  it("accepts a region-qualified locale like en-IN", async () => {
    authenticateAs("admin-1", "admin");
    translationsMock.result.data = { id: "t-3", lesson_id: "lesson-1", locale: "en-IN" };

    const res = await request(buildApp())
      .put("/api/lessons/lesson-1/translations/en-IN")
      .set("Authorization", "Bearer token")
      .send({ title: "Welcome" });

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/lessons/:id/translations/:locale", () => {
  it("returns 404 when the translation does not exist", async () => {
    authenticateAs("admin-1", "admin");
    translationsMock.result.data = null;

    const res = await request(buildApp())
      .delete("/api/lessons/lesson-1/translations/hi")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("deletes the translation for an admin", async () => {
    authenticateAs("admin-1", "admin");
    translationsMock.result.data = { id: "t-2" };

    const res = await request(buildApp())
      .delete("/api/lessons/lesson-1/translations/hi")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
  });
});
