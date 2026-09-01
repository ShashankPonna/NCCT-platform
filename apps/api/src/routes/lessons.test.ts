import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lessonsRouter } from "./lessons.js";

const { getUserMock, profilesMock, lessonsMock, fromMock } = vi.hoisted(() => {
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
  const lessonsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    lessons: lessonsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, lessonsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", lessonsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

const validVideoLesson = {
  title: "Intro video",
  content_type: "video",
  video_id: "dQw4w9WgXcQ",
};

beforeEach(() => {
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  lessonsMock.result.data = null;
  lessonsMock.result.error = null;
});

describe("POST /api/modules/:id/lessons", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/modules/mod-1/lessons").send(validVideoLesson);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/modules/mod-1/lessons")
      .set("Authorization", "Bearer token")
      .send(validVideoLesson);
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid content_type", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/modules/mod-1/lessons")
      .set("Authorization", "Bearer token")
      .send({ title: "Bad", content_type: "audio" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a video_id that is a full URL instead of an ID", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/modules/mod-1/lessons")
      .set("Authorization", "Bearer token")
      .send({
        title: "Bad",
        content_type: "video",
        video_id: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
    expect(res.status).toBe(400);
  });

  it("creates a video lesson with a valid video_id for a trainer", async () => {
    authenticateAs("trainer-1", "trainer");
    lessonsMock.result.data = { id: "lesson-1", module_id: "mod-1", ...validVideoLesson };

    const res = await request(buildApp())
      .post("/api/modules/mod-1/lessons")
      .set("Authorization", "Bearer token")
      .send(validVideoLesson);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "lesson-1", video_id: "dQw4w9WgXcQ" });
  });

  it("creates a lesson without a video_id", async () => {
    authenticateAs("admin-1", "admin");
    lessonsMock.result.data = {
      id: "lesson-2",
      module_id: "mod-1",
      title: "Reading",
      content_type: "text",
    };

    const res = await request(buildApp())
      .post("/api/modules/mod-1/lessons")
      .set("Authorization", "Bearer token")
      .send({ title: "Reading", content_type: "text" });

    expect(res.status).toBe(201);
    expect(res.body.video_id).toBeUndefined();
  });
});

describe("interactive lessons", () => {
  it("rejects a matching exercise with fewer than 2 pairs", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/modules/mod-1/lessons")
      .set("Authorization", "Bearer token")
      .send({
        title: "Match the terms",
        content_type: "interactive",
        interactive_config: {
          type: "matching",
          pairs: [{ term: "PACS", match: "Village society" }],
        },
      });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown interactive exercise type", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/modules/mod-1/lessons")
      .set("Authorization", "Bearer token")
      .send({
        title: "Mystery",
        content_type: "interactive",
        interactive_config: { type: "crossword", pairs: [] },
      });
    expect(res.status).toBe(400);
  });

  it("creates an interactive lesson with a valid matching config", async () => {
    authenticateAs("trainer-1", "trainer");
    const config = {
      type: "matching",
      prompt: "Match each body to what it does",
      pairs: [
        { term: "PACS", match: "Primary village-level credit society" },
        { term: "NCCT", match: "Apex cooperative training body" },
      ],
    };
    lessonsMock.result.data = {
      id: "lesson-3",
      module_id: "mod-1",
      content_type: "interactive",
      interactive_config: config,
    };

    const res = await request(buildApp())
      .post("/api/modules/mod-1/lessons")
      .set("Authorization", "Bearer token")
      .send({ title: "Match the terms", content_type: "interactive", interactive_config: config });

    expect(res.status).toBe(201);
    expect(res.body.interactive_config.pairs).toHaveLength(2);
  });
});

describe("GET /api/modules/:id/lessons", () => {
  it("lists lessons for any authenticated user", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = [{ id: "lesson-1", module_id: "mod-1", ...validVideoLesson }];

    const res = await request(buildApp())
      .get("/api/modules/mod-1/lessons")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/lessons/:id", () => {
  it("returns 404 when not found", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/lessons/missing")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns the lesson with its video_id when found", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = { id: "lesson-1", module_id: "mod-1", ...validVideoLesson };

    const res = await request(buildApp())
      .get("/api/lessons/lesson-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ video_id: "dQw4w9WgXcQ" });
  });
});

describe("PATCH /api/lessons/:id", () => {
  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .patch("/api/lessons/lesson-1")
      .set("Authorization", "Bearer token")
      .send({ video_id: "dQw4w9WgXcQ" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a malformed video_id", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .patch("/api/lessons/lesson-1")
      .set("Authorization", "Bearer token")
      .send({ video_id: "too-short" });
    expect(res.status).toBe(400);
  });

  it("allows clearing video_id back to null", async () => {
    authenticateAs("trainer-1", "trainer");
    lessonsMock.result.data = { id: "lesson-1", video_id: null };

    const res = await request(buildApp())
      .patch("/api/lessons/lesson-1")
      .set("Authorization", "Bearer token")
      .send({ video_id: null });

    expect(res.status).toBe(200);
    expect(res.body.video_id).toBeNull();
  });

  it("updates video_id for an admin", async () => {
    authenticateAs("admin-1", "admin");
    lessonsMock.result.data = { id: "lesson-1", video_id: "dQw4w9WgXcQ" };

    const res = await request(buildApp())
      .patch("/api/lessons/lesson-1")
      .set("Authorization", "Bearer token")
      .send({ video_id: "dQw4w9WgXcQ" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ video_id: "dQw4w9WgXcQ" });
  });
});

describe("DELETE /api/lessons/:id", () => {
  it("deletes the lesson for an admin", async () => {
    authenticateAs("admin-1", "admin");
    lessonsMock.result.data = { id: "lesson-1" };

    const res = await request(buildApp())
      .delete("/api/lessons/lesson-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(204);
  });
});
