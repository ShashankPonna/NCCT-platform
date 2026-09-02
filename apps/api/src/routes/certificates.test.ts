import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { certificatesRouter } from "./certificates.js";

const { getUserMock, profilesMock, certificatesMock, fromMock, getPublicUrlMock, storageMock } =
  vi.hoisted(() => {
    function createTableMock() {
      const result: { data: unknown; error: unknown } = { data: null, error: null };
      const builder: Record<string, ReturnType<typeof vi.fn>> = {
        then: vi.fn((resolve: (value: typeof result) => void) => resolve(result)),
      };
      for (const method of ["select", "eq", "order"]) {
        builder[method] = vi.fn(() => builder);
      }
      for (const method of ["single", "maybeSingle"]) {
        builder[method] = vi.fn(() => builder);
      }
      return { builder, result };
    }

    const profilesMock = createTableMock();
    const certificatesMock = createTableMock();
    const tables: Record<string, ReturnType<typeof createTableMock>> = {
      profiles: profilesMock,
      certificates: certificatesMock,
    };
    const fromMock = vi.fn((table: string) => tables[table].builder);
    const getUserMock = vi.fn();

    const getPublicUrlMock = vi.fn();
    const storageMock = { from: vi.fn(() => ({ getPublicUrl: getPublicUrlMock })) };

    return {
      getUserMock,
      profilesMock,
      certificatesMock,
      fromMock,
      getPublicUrlMock,
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
  app.use("/api", certificatesRouter);
  return app;
}

function authenticateAs(userId: string, role: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  profilesMock.result.data = { role };
  profilesMock.result.error = null;
}

beforeEach(() => {
  getUserMock.mockReset();
  getPublicUrlMock.mockReset();
  certificatesMock.builder.eq.mockClear();
  for (const mock of [profilesMock, certificatesMock]) {
    mock.result.data = null;
    mock.result.error = null;
  }
});

const TRAINEE_ID = "11111111-1111-1111-1111-111111111111";

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

describe("GET /api/certificates/mine", () => {
  it("returns 401 with no bearer token", async () => {
    const res = await request(buildApp()).get("/api/certificates/mine");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-trainee", async () => {
    authenticateAs("admin-1", "admin");
    const res = await request(buildApp())
      .get("/api/certificates/mine")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("is matched as its own route, not as a certificate code", async () => {
    // Regression guard for route ordering: if /certificates/:code were
    // registered first, "mine" would be read as a code and 404 instead of
    // being auth-gated. A 401 here proves the /mine route wins the match.
    const res = await request(buildApp()).get("/api/certificates/mine");
    expect(res.status).toBe(401);
    expect(res.body.error).not.toBe("Certificate not found");
  });

  it("returns only the caller's own certificates with public PDF urls", async () => {
    authenticateAs(TRAINEE_ID, "trainee");
    certificatesMock.result.data = [
      {
        id: "cert-1",
        certificate_code: "NCCT-ABC12345",
        trainee_id: TRAINEE_ID,
        programme_id: "prog-1",
        issuing_institution_id: "inst-1",
        pdf_storage_path: "NCCT-ABC12345.pdf",
        issued_at: "2026-09-01T00:00:00.000Z",
        programmes: { title: "Cooperative Management Basics" },
        institutions: { name: "VAMNICOM" },
      },
    ];
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://example.com/certificates/NCCT-ABC12345.pdf" },
    });

    const res = await request(buildApp())
      .get("/api/certificates/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      certificate_code: "NCCT-ABC12345",
      programme_title: "Cooperative Management Basics",
      institution_name: "VAMNICOM",
      pdf_url: "https://example.com/certificates/NCCT-ABC12345.pdf",
    });
    expect(res.body[0].programmes).toBeUndefined();
    // Ownership must come from the token, never the request — assert the
    // query really was scoped to the caller's own id.
    expect(certificatesMock.builder.eq).toHaveBeenCalledWith("trainee_id", TRAINEE_ID);
  });

  it("returns an empty list (not 404) when the trainee has no certificates", async () => {
    authenticateAs(TRAINEE_ID, "trainee");
    certificatesMock.result.data = [];

    const res = await request(buildApp())
      .get("/api/certificates/mine")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
