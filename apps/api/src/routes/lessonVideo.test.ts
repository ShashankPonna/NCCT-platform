import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lessonVideoRouter } from "./lessonVideo.js";

const { getUserMock, profilesMock, lessonsMock, fromMock, getSignedUrlMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
    };
    for (const method of ["select", "eq", "maybeSingle", "single"]) {
      builder[method] = vi.fn(() => builder);
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
  return {
    getUserMock: vi.fn(),
    profilesMock,
    lessonsMock,
    fromMock,
    getSignedUrlMock: vi.fn(),
  };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn((input: unknown) => ({ input })),
  GetObjectCommand: vi.fn((input: unknown) => ({ input })),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", lessonVideoRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  getSignedUrlMock.mockReset();
  lessonsMock.builder.eq.mockClear();
  for (const mock of [profilesMock, lessonsMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
  delete process.env.B2_ENDPOINT;
  delete process.env.B2_KEY_ID;
  delete process.env.B2_APPLICATION_KEY;
  delete process.env.B2_BUCKET_NAME;
});

function configureB2Env() {
  process.env.B2_ENDPOINT = "https://s3.us-west-004.backblazeb2.com";
  process.env.B2_KEY_ID = "key-1";
  process.env.B2_APPLICATION_KEY = "secret-1";
  process.env.B2_BUCKET_NAME = "ncct-lesson-videos";
}

describe("POST /api/lessons/:id/video-upload-url", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).post("/api/lessons/lesson-1/video-upload-url").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/video-upload-url")
      .set("Authorization", "Bearer token")
      .send({ filename: "a.mp4", content_type: "video/mp4", size_bytes: 1000 });
    expect(res.status).toBe(403);
  });

  it("rejects an unsupported mime type", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/video-upload-url")
      .set("Authorization", "Bearer token")
      .send({ filename: "a.exe", content_type: "application/octet-stream", size_bytes: 1000 });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown lesson", async () => {
    authenticateAs("admin-1", "admin");
    lessonsMock.result.data = null;
    const res = await request(buildApp())
      .post("/api/lessons/nope/video-upload-url")
      .set("Authorization", "Bearer token")
      .send({ filename: "a.mp4", content_type: "video/mp4", size_bytes: 1000 });
    expect(res.status).toBe(404);
  });

  it("rejects a lesson whose content_type is not video", async () => {
    authenticateAs("admin-1", "admin");
    lessonsMock.result.data = { id: "lesson-1", content_type: "pdf" };
    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/video-upload-url")
      .set("Authorization", "Bearer token")
      .send({ filename: "a.mp4", content_type: "video/mp4", size_bytes: 1000 });
    expect(res.status).toBe(400);
  });

  it("returns 503 with a clear reason when B2 env vars are unset", async () => {
    authenticateAs("admin-1", "admin");
    lessonsMock.result.data = { id: "lesson-1", content_type: "video" };
    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/video-upload-url")
      .set("Authorization", "Bearer token")
      .send({ filename: "a.mp4", content_type: "video/mp4", size_bytes: 1000 });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("Video storage unavailable");
  });

  it("mints a presigned PUT url and does not touch the lessons row", async () => {
    configureB2Env();
    authenticateAs("admin-1", "admin");
    lessonsMock.result.data = { id: "lesson-1", content_type: "video" };
    getSignedUrlMock.mockResolvedValue("https://r2.example.com/presigned-put");

    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/video-upload-url")
      .set("Authorization", "Bearer token")
      .send({ filename: "intro.mp4", content_type: "video/mp4", size_bytes: 5_000_000 });

    expect(res.status).toBe(200);
    expect(res.body.upload_url).toBe("https://r2.example.com/presigned-put");
    expect(res.body.key).toContain("lesson-1/");
    expect(res.body.key).toContain("intro.mp4");
    // This route only mints the URL — it must never write storage_path
    // itself, since the upload could still fail after this response.
    expect(lessonsMock.builder.eq).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/lessons/:id/video-url", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/lessons/lesson-1/video-url");
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown lesson", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = null;
    const res = await request(buildApp())
      .get("/api/lessons/nope/video-url")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(404);
  });

  it("returns url: null for a video lesson with no storage_path (YouTube-hosted)", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = { content_type: "video", storage_path: null };
    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/video-url")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body.url).toBeNull();
  });

  it("returns url: null for a non-video lesson", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = { content_type: "pdf", storage_path: "some/path.pdf" };
    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/video-url")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
    expect(res.body.url).toBeNull();
  });

  it("returns a signed playback url for a B2-hosted video lesson", async () => {
    configureB2Env();
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = { content_type: "video", storage_path: "lesson-1/123-intro.mp4" };
    getSignedUrlMock.mockResolvedValue("https://r2.example.com/presigned-get");

    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/video-url")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://r2.example.com/presigned-get");
  });

  it("returns 503 with a clear reason when B2 env vars are unset", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = { content_type: "video", storage_path: "lesson-1/123-intro.mp4" };
    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/video-url")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(503);
  });
});
