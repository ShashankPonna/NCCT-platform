import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getProfilePhotoUrl,
  parseContentDispositionFileName,
  setApiBaseUrl,
  uploadProfilePhoto,
} from "./index.js";

describe("parseContentDispositionFileName", () => {
  it("prefers the RFC 5987 filename*, keeping a Hindi name intact", () => {
    const header = `attachment; filename="Gradebook - ___ - 2026-09-26.xlsx"; filename*=UTF-8''${encodeURIComponent(
      "Gradebook - सहकारी - 2026-09-26.xlsx",
    )}`;
    expect(parseContentDispositionFileName(header)).toBe("Gradebook - सहकारी - 2026-09-26.xlsx");
  });

  it("falls back to the plain quoted filename", () => {
    expect(parseContentDispositionFileName('attachment; filename="report.xlsx"')).toBe(
      "report.xlsx",
    );
  });

  it("falls back to the plain filename when filename* is malformed", () => {
    expect(
      parseContentDispositionFileName(`attachment; filename="safe.xlsx"; filename*=UTF-8''%E0%A4`),
    ).toBe("safe.xlsx");
  });

  it("returns null when there's no header or no filename", () => {
    expect(parseContentDispositionFileName(null)).toBeNull();
    expect(parseContentDispositionFileName("inline")).toBeNull();
  });
});

describe("profile photo helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("getProfilePhotoUrl calls GET /api/profile/photo with the bearer token", async () => {
    setApiBaseUrl("https://api.test");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ url: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProfilePhotoUrl("tok")).resolves.toEqual({ url: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/api/profile/photo");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
  });

  it("uploadProfilePhoto posts the file as 'photo' and surfaces API errors", async () => {
    setApiBaseUrl("https://api.test");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://x/signed" }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Photo must be 2 MB or smaller" }), { status: 400 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], "me.jpg", { type: "image/jpeg" });

    await expect(uploadProfilePhoto("tok", file)).resolves.toEqual({ url: "https://x/signed" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/api/profile/photo");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("photo")).toBeInstanceOf(File);

    await expect(uploadProfilePhoto("tok", file)).rejects.toThrow("Photo must be 2 MB or smaller");
  });
});
