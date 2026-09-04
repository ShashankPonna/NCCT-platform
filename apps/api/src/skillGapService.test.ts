import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSkillGap, rankMissingSkills } from "./skillGapService.js";

const { fromMock, tableData } = vi.hoisted(() => {
  const tableData: Record<string, { data: unknown; error: unknown }> = {};

  function builderFor(table: string) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: unknown) => void) => {
        resolve(tableData[table] ?? { data: null, error: null });
      }),
    };
    for (const method of ["select", "eq", "in"]) {
      builder[method] = vi.fn(() => builder);
    }
    return builder;
  }

  const fromMock = vi.fn((table: string) => builderFor(table));
  return { fromMock, tableData };
});

vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: { from: fromMock } }));

// getSkillGap calls rankMissingSkills internally with no injected client
// when it isn't given one (see the tests below) — without this, that would
// construct a real GoogleGenAI client and attempt a real network call in
// every getSkillGap test, same trap chatbotService.test.ts's comment on
// mocking @huggingface/transformers already flags for the embedding model.
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: vi.fn().mockRejectedValue(new Error("no API key in test env")) },
  })),
}));

const SKILL_A = { id: "skill-a", name: "Bookkeeping", category: null };
const SKILL_B = { id: "skill-b", name: "Tally", category: null };

beforeEach(() => {
  tableData.certificates = { data: [], error: null };
  tableData.programme_skills = { data: [], error: null };
  tableData.job_skills = { data: [], error: null };
});

describe("getSkillGap", () => {
  it("puts every required skill in the gap when the trainee holds no certificates", async () => {
    tableData.job_skills = {
      data: [
        { skill_id: SKILL_A.id, skills: SKILL_A },
        { skill_id: SKILL_B.id, skills: SKILL_B },
      ],
      error: null,
    };

    const result = await getSkillGap("trainee-1", "job-1");

    expect(result.acquired_skills).toEqual([]);
    expect(result.gap_skills).toEqual([SKILL_A, SKILL_B]);
  });

  it("splits required skills into acquired vs. gap based on certified programmes", async () => {
    tableData.certificates = { data: [{ programme_id: "programme-1" }], error: null };
    tableData.programme_skills = { data: [{ skill_id: SKILL_A.id }], error: null };
    tableData.job_skills = {
      data: [
        { skill_id: SKILL_A.id, skills: SKILL_A },
        { skill_id: SKILL_B.id, skills: SKILL_B },
      ],
      error: null,
    };

    const result = await getSkillGap("trainee-1", "job-1");

    expect(result.acquired_skills).toEqual([SKILL_A]);
    expect(result.gap_skills).toEqual([SKILL_B]);
  });

  it("returns no gap when the job has no tagged skills", async () => {
    tableData.job_skills = { data: [], error: null };
    const result = await getSkillGap("trainee-1", "job-1");
    expect(result.acquired_skills).toEqual([]);
    expect(result.gap_skills).toEqual([]);
  });

  it("propagates a certificates query error", async () => {
    tableData.certificates = { data: null, error: { message: "certs exploded" } };
    await expect(getSkillGap("trainee-1", "job-1")).rejects.toThrow("certs exploded");
  });

  it("propagates a job_skills query error", async () => {
    tableData.job_skills = { data: null, error: { message: "job_skills exploded" } };
    await expect(getSkillGap("trainee-1", "job-1")).rejects.toThrow("job_skills exploded");
  });
});

describe("rankMissingSkills", () => {
  it("returns null with no gap skills, never calling the model", async () => {
    const generateContentMock = vi.fn();
    const result = await rankMissingSkills([], {
      client: { models: { generateContent: generateContentMock } } as never,
    });
    expect(result).toBeNull();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("returns a ranked list built from the model's JSON response", async () => {
    const generateContentMock = vi.fn().mockResolvedValue({
      text: JSON.stringify([
        { skill_id: SKILL_B.id, reason: "Needed before Bookkeeping" },
        { skill_id: SKILL_A.id, reason: "Builds on Tally" },
      ]),
    });

    const result = await rankMissingSkills([SKILL_A, SKILL_B], {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result).toEqual([
      { rank: 1, skill_id: SKILL_B.id, skill_name: SKILL_B.name, reason: "Needed before Bookkeeping" },
      { rank: 2, skill_id: SKILL_A.id, skill_name: SKILL_A.name, reason: "Builds on Tally" },
    ]);
  });

  it("degrades to null, not an error, when the model call fails", async () => {
    const generateContentMock = vi.fn().mockRejectedValue(new Error("no API key"));
    const result = await rankMissingSkills([SKILL_A], {
      client: { models: { generateContent: generateContentMock } } as never,
    });
    expect(result).toBeNull();
  });

  it("degrades to null when the model returns malformed JSON", async () => {
    const generateContentMock = vi.fn().mockResolvedValue({ text: "not json" });
    const result = await rankMissingSkills([SKILL_A], {
      client: { models: { generateContent: generateContentMock } } as never,
    });
    expect(result).toBeNull();
  });

  it("drops any skill_id the model invents that wasn't in the input", async () => {
    const generateContentMock = vi.fn().mockResolvedValue({
      text: JSON.stringify([
        { skill_id: "made-up-id", reason: "hallucinated" },
        { skill_id: SKILL_A.id, reason: "real" },
      ]),
    });

    const result = await rankMissingSkills([SKILL_A], {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result).toEqual([{ rank: 1, skill_id: SKILL_A.id, skill_name: SKILL_A.name, reason: "real" }]);
  });
});
