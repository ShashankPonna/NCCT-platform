import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { certificatesRouter } from "./certificates.js";

const { certificatesMock, fromMock, getPublicUrlMock, storageMock } = vi.hoisted(() => {
  function createTableMock() {
    const result: { data: unknown; error: unknown } = { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    return { builder, result };
  }

  const certificatesMock = createTableMock();
  const tables: Record<string, ReturnType<typeof createTableMock>> = {
    certificates: certificatesMock,
  };
  const fromMock = vi.fn((table: string) => tables[table].builder);

  const getPublicUrlMock = vi.fn();
  const storageMock = { from: vi.fn(() => ({ getPublicUrl: getPublicUrlMock })) };

  return { certificatesMock, fromMock, getPublicUrlMock, storageMock };
});

vi.mock("../supabaseClient.js", () => ({
  supabaseAdmin: { from: fromMock, storage: storageMock },
  getSupabaseForUser: () => ({ from: fromMock }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", certificatesRouter);
  return app;
}

beforeEach(() => {
  certificatesMock.result.data = null;
  certificatesMock.result.error = null;
  getPublicUrlMock.mockReset();
});

describe("GET /api/certificates/:code", () => {
  it("requires no authentication at all", async () => {
    certificatesMock.result.data = null;
    const res = await request(buildApp()).get("/api/certificates/NCCT-DOESNOTEXIST");
    // No Authorization header sent, and still gets a real (404, not 401)
    // response — confirms this route never calls requireAuth.
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown code", async () => {
    certificatesMock.result.data = null;
    const res = await request(buildApp()).get("/api/certificates/NCCT-UNKNOWN1");
    expect(res.status).toBe(404);
  });

  it("returns certificate details with a public PDF url and denormalized names", async () => {
    certificatesMock.result.data = {
      id: "cert-1",
      certificate_code: "NCCT-ABC12345",
      trainee_id: "trainee-1",
      programme_id: "prog-1",
      issuing_institution_id: "inst-1",
      pdf_storage_path: "NCCT-ABC12345.pdf",
      profiles: { full_name: "Asha Patil" },
      programmes: { title: "Cooperative Management Basics" },
      institutions: { name: "VAMNICOM" },
    };
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://example.com/certificates/NCCT-ABC12345.pdf" },
    });

    const res = await request(buildApp()).get("/api/certificates/NCCT-ABC12345");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      certificate_code: "NCCT-ABC12345",
      trainee_name: "Asha Patil",
      programme_title: "Cooperative Management Basics",
      institution_name: "VAMNICOM",
      pdf_url: "https://example.com/certificates/NCCT-ABC12345.pdf",
    });
    // Raw join objects shouldn't leak into the response shape.
    expect(res.body.profiles).toBeUndefined();
  });
});
