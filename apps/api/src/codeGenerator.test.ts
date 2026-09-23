import { describe, expect, it } from "vitest";
import { generateNumericCode } from "./codeGenerator.js";

describe("generateNumericCode", () => {
  it("returns a string of the requested length", () => {
    expect(generateNumericCode(6)).toHaveLength(6);
    expect(generateNumericCode(4)).toHaveLength(4);
  });

  it("only contains digits", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateNumericCode(6)).toMatch(/^\d+$/);
    }
  });

  it("varies across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateNumericCode(6)));
    expect(codes.size).toBeGreaterThan(1);
  });
});
