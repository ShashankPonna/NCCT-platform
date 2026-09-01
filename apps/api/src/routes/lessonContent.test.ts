import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lessonContentRouter } from "./lessonContent.js";

const {
  getUserMock,
  profilesMock,
  lessonsMock,
  fromMock,
  uploadMock,
  createSignedUrlMock,
  storageMock,
} = vi.hoisted(() => {
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

  const uploadMock = vi.fn();
  const createSignedUrlMock = vi.fn();
  const storageMock = {
    from: vi.fn(() => ({ upload: uploadMock, createSignedUrl: createSignedUrlMock })),
  };

  const getUserMock = vi.fn();
  return {
    getUserMock,
    profilesMock,
    lessonsMock,
    fromMock,
    uploadMock,
    createSignedUrlMock,
    storageMock,
  };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock, storage: storageMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", lessonContentRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  uploadMock.mockReset();
  createSignedUrlMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  lessonsMock.result.data = null;
  lessonsMock.result.error = null;
});

describe("POST /api/lessons/:id/content", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/content")
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "notes.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a trainee", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/content")
      .set("Authorization", "Bearer token")
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "notes.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(403);
  });

  it("returns 400 when no file is attached", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/content")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unsupported file type", async () => {
    authenticateAs("trainer-1", "trainer");
    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/content")
      .set("Authorization", "Bearer token")
      .attach("file", Buffer.from("not a pdf"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });
    expect(res.status).toBe(400);
  });

  it("uploads a PDF and saves storage_path on the lesson", async () => {
    authenticateAs("trainer-1", "trainer");
    uploadMock.mockResolvedValue({ data: { path: "lesson-1/1.pdf" }, error: null });
    lessonsMock.result.data = { id: "lesson-1", storage_path: "lesson-1/1.pdf" };

    const res = await request(buildApp())
      .post("/api/lessons/lesson-1/content")
      .set("Authorization", "Bearer token")
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "notes.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "lesson-1", storage_path: "lesson-1/1.pdf" });
    expect(uploadMock).toHaveBeenCalled();
  });

  it("returns 404 when the lesson does not exist", async () => {
    authenticateAs("trainer-1", "trainer");
    uploadMock.mockResolvedValue({ data: { path: "missing/1.pdf" }, error: null });
    lessonsMock.result.data = null;

    const res = await request(buildApp())
      .post("/api/lessons/missing/content")
      .set("Authorization", "Bearer token")
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "notes.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/lessons/:id/content-url", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/lessons/lesson-1/content-url");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the lesson does not exist", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = null;

    const res = await request(buildApp())
      .get("/api/lessons/missing/content-url")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(404);
  });

  it("returns a null url when the lesson has no uploaded content yet", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = { storage_path: null };

    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/content-url")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: null });
  });

  it("returns a signed url when content exists", async () => {
    authenticateAs("trainee-1", "trainee");
    lessonsMock.result.data = { storage_path: "lesson-1/1.pdf" };
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://example.com/signed" },
      error: null,
    });

    const res = await request(buildApp())
      .get("/api/lessons/lesson-1/content-url")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ url: "https://example.com/signed" });
  });
});
