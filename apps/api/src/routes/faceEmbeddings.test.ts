import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { faceEmbeddingsRouter } from "./faceEmbeddings.js";

const { getUserMock, profilesMock, embeddingsMock, fromMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "insert", "update", "delete", "upsert", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ["single", "maybeSingle", "order", "limit"]) {
      builder[method] = vi.fn(() => Promise.resolve(result));
    }
    return { builder, result };
  }

  const profilesMock = createTableMock();
  const embeddingsMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    profiles: profilesMock,
    face_embeddings: embeddingsMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);
  const getUserMock = vi.fn();
  return { getUserMock, profilesMock, embeddingsMock, fromMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock }, from: fromMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", faceEmbeddingsRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

function validEmbedding(): number[] {
  return new Array(1024).fill(0.1);
}

beforeEach(() => {
  getUserMock.mockReset();
  profilesMock.result.data = null;
  profilesMock.result.error = null;
  embeddingsMock.result.data = null;
  embeddingsMock.result.error = null;
});

describe("POST /api/face-embeddings", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp())
      .post("/api/face-embeddings")
      .send({ embedding: validEmbedding(), model: "human", consent: true });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .post("/api/face-embeddings")
      .set("Authorization", "Bearer token")
      .send({ embedding: validEmbedding(), model: "human", consent: true });
    expect(res.status).toBe(403);
  });

  it("returns 400 without explicit consent", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/face-embeddings")
      .set("Authorization", "Bearer token")
      .send({ embedding: validEmbedding(), model: "human", consent: false });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a wrong-length embedding", async () => {
    authenticateAs("trainee-1", "trainee");
    const res = await request(buildApp())
      .post("/api/face-embeddings")
      .set("Authorization", "Bearer token")
      .send({ embedding: [0.1, 0.2], model: "human", consent: true });
    expect(res.status).toBe(400);
  });

  it("enrolls and stamps consent_given_at server-side", async () => {
    authenticateAs("trainee-1", "trainee");
    embeddingsMock.result.data = {
      id: "emb-1",
      model: "human",
      consent_given_at: "2026-09-01T00:00:00.000Z",
      created_at: "2026-09-01T00:00:00.000Z",
    };

    const res = await request(buildApp())
      .post("/api/face-embeddings")
      .set("Authorization", "Bearer token")
      .send({ embedding: validEmbedding(), model: "human", consent: true });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "emb-1", model: "human" });
    expect(res.body.consent_given_at).toBeTruthy();
  });
});

describe("GET /api/face-embeddings/status", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/face-embeddings/status");
    expect(res.status).toBe(401);
  });

  it("returns enrolled: false when no embedding exists", async () => {
    authenticateAs("trainee-1", "trainee");
    embeddingsMock.result.data = [];

    const res = await request(buildApp())
      .get("/api/face-embeddings/status")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enrolled: false });
  });

  it("returns enrolled: true when an embedding exists", async () => {
    authenticateAs("trainee-1", "trainee");
    embeddingsMock.result.data = [{ id: "emb-1" }];

    const res = await request(buildApp())
      .get("/api/face-embeddings/status")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enrolled: true });
  });
});
