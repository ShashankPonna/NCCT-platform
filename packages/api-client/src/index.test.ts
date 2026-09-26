import { describe, expect, it } from "vitest";
import { parseContentDispositionFileName } from "./index.js";

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
