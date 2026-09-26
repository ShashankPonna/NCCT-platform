import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findRelatedSkills,
  getSkillGap,
  getSkillGapAcrossJobs,
  rankMissingSkills,
} from "./skillGapService.js";

const { fromMock, tableData, embedTextMock, matchJobsForTraineeMock } = vi.hoisted(() => {
  const tableData: Record<string, { data: unknown; error: unknown }> = {};

  function builderFor(table: string) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: unknown) => void) => {
        resolve(tableData[table] ?? { data: null, error: null });
      }),
    };
    for (const method of ["select", "eq", "in", "order", "limit"]) {
      builder[method] = vi.fn(() => builder);
    }
    return builder;
  }

  const fromMock = vi.fn((table: string) => builderFor(table));
  return {
    fromMock,
    tableData,
    embedTextMock: vi.fn(),
    matchJobsForTraineeMock: vi.fn(),
  };
});

vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: { from: fromMock } }));

// getSkillGap calls rankMissingSkills internally with no injected chat
// function when it isn't given one (see the tests below) — without this,
// that would make a real Groq request in every getSkillGap test, same trap
// chatbotService.test.ts's comment on mocking @huggingface/transformers
// already flags for the embedding model.
vi.mock("./groqClient.js", () => ({
  GROQ_SMALL_MODEL: "openai/gpt-oss-20b",
  groqChat: vi.fn().mockRejectedValue(new Error("no API key in test env")),
}));

// getSkillGap also calls findRelatedSkills internally with no injected
// embed function — same reasoning as the groqClient mock above, this
// avoids loading the real local transformer model in every getSkillGap
// test. Defaults to rejecting so related_skills degrades to [] unless a
// test explicitly overrides it.
vi.mock("./chatbotService.js", () => ({ embedText: embedTextMock }));
vi.mock("./jobMatchingService.js", () => ({ matchJobsForTrainee: matchJobsForTraineeMock }));

const SKILL_A = { id: "skill-a", name: "Bookkeeping", category: null };
const SKILL_B = { id: "skill-b", name: "Tally", category: null };

beforeEach(() => {
  tableData.certificates = { data: [], error: null };
  tableData.programme_skills = { data: [], error: null };
  tableData.course_skills = { data: [], error: null };
  tableData.job_skills = { data: [], error: null };
  tableData.jobs = { data: [], error: null };
  embedTextMock.mockReset().mockRejectedValue(new Error("model not loaded in test env"));
  matchJobsForTraineeMock.mockReset();
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
    tableData.certificates = {
      data: [{ programme_id: "programme-1", course_id: null }],
      error: null,
    };
    tableData.programme_skills = { data: [{ skill_id: SKILL_A.id, skills: SKILL_A }], error: null };
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

  it("degrades a missing course_skills table (pre-migration project) to 'no course-level skills yet' instead of breaking the whole gap check", async () => {
    // Every certificate has carried a non-null course_id since #37, so this
    // is the real state of any project that hasn't applied migration
    // 20260901000017 yet — the already-shipped programme-level gap check
    // must keep working exactly as before, not start failing.
    tableData.certificates = {
      data: [{ programme_id: "programme-1", course_id: "course-1" }],
      error: null,
    };
    tableData.programme_skills = { data: [{ skill_id: SKILL_A.id, skills: SKILL_A }], error: null };
    tableData.course_skills = {
      data: null,
      error: { code: "PGRST205", message: "table not found" },
    };
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

  it("still propagates a genuine course_skills query error (not the missing-table case)", async () => {
    tableData.certificates = {
      data: [{ programme_id: "programme-1", course_id: "course-1" }],
      error: null,
    };
    tableData.course_skills = {
      data: null,
      error: { code: "42501", message: "permission denied" },
    };
    await expect(getSkillGap("trainee-1", "job-1")).rejects.toThrow("permission denied");
  });
});

describe("rankMissingSkills", () => {
  it("returns null with no gap skills, never calling the model", async () => {
    const chatMock = vi.fn();
    const result = await rankMissingSkills([], {
      chat: chatMock,
    });
    expect(result).toBeNull();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("returns a ranked list built from the model's JSON response", async () => {
    const chatMock = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        ranking: [
          { skill_id: SKILL_B.id, reason: "Needed before Bookkeeping" },
          { skill_id: SKILL_A.id, reason: "Builds on Tally" },
        ],
      }),
    });

    const result = await rankMissingSkills([SKILL_A, SKILL_B], {
      chat: chatMock,
    });

    expect(result).toEqual([
      {
        rank: 1,
        skill_id: SKILL_B.id,
        skill_name: SKILL_B.name,
        reason: "Needed before Bookkeeping",
      },
      { rank: 2, skill_id: SKILL_A.id, skill_name: SKILL_A.name, reason: "Builds on Tally" },
    ]);
  });

  it("degrades to null, not an error, when the model call fails", async () => {
    const chatMock = vi.fn().mockRejectedValue(new Error("no API key"));
    const result = await rankMissingSkills([SKILL_A], {
      chat: chatMock,
    });
    expect(result).toBeNull();
  });

  it("asks Groq for JSON mode", async () => {
    const chatMock = vi.fn().mockResolvedValue({ content: JSON.stringify({ ranking: [] }) });
    await rankMissingSkills([SKILL_A], { chat: chatMock });
    expect(chatMock.mock.calls[0][0].response_format).toEqual({ type: "json_object" });
    expect(chatMock.mock.calls[0][0].model).toBe("openai/gpt-oss-20b");
  });

  it("degrades to null when the JSON has no ranking array", async () => {
    const chatMock = vi.fn().mockResolvedValue({ content: JSON.stringify({ ranking: "nope" }) });
    const result = await rankMissingSkills([SKILL_A], { chat: chatMock });
    expect(result).toBeNull();
  });

  it("degrades to null when the model returns malformed JSON", async () => {
    const chatMock = vi.fn().mockResolvedValue({ content: "not json" });
    const result = await rankMissingSkills([SKILL_A], {
      chat: chatMock,
    });
    expect(result).toBeNull();
  });

  it("drops any skill_id the model invents that wasn't in the input", async () => {
    const chatMock = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        ranking: [
          { skill_id: "made-up-id", reason: "hallucinated" },
          { skill_id: SKILL_A.id, reason: "real" },
        ],
      }),
    });

    const result = await rankMissingSkills([SKILL_A], {
      chat: chatMock,
    });

    expect(result).toEqual([
      { rank: 1, skill_id: SKILL_A.id, skill_name: SKILL_A.name, reason: "real" },
    ]);
  });
});

const SKILL_C = { id: "skill-c", name: "Excel", category: null };

// A tiny fake embedding space, injected via findRelatedSkills' own `embed`
// option rather than mocking the module — same pattern rankMissingSkills's
// `chat` option already uses. Vectors are hand-picked 2D points so cosine
// similarity is easy to reason about: A and B point the same direction
// (similarity 1), C points perpendicular (similarity 0).
function fakeEmbed(text: string): Promise<number[]> {
  if (text === SKILL_A.name) return Promise.resolve([1, 0]);
  if (text === SKILL_B.name) return Promise.resolve([0.9, 0.1]); // close to A
  if (text === SKILL_C.name) return Promise.resolve([0, 1]); // orthogonal to A
  return Promise.resolve([0, 0]);
}

describe("findRelatedSkills", () => {
  it("returns [] with no gap skills, never calling embed", async () => {
    const embed = vi.fn();
    const result = await findRelatedSkills([], [SKILL_A], { embed });
    expect(result).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("returns [] with no acquired skills, never calling embed", async () => {
    const embed = vi.fn();
    const result = await findRelatedSkills([SKILL_B], [], { embed });
    expect(result).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("flags a gap skill whose embedding clears the similarity floor against an acquired skill", async () => {
    const result = await findRelatedSkills([SKILL_B], [SKILL_A], { embed: fakeEmbed });
    expect(result).toEqual([
      {
        gap_skill_id: SKILL_B.id,
        gap_skill_name: SKILL_B.name,
        related_acquired_skill_id: SKILL_A.id,
        related_acquired_skill_name: SKILL_A.name,
        similarity: expect.any(Number),
      },
    ]);
    expect(result[0].similarity).toBeGreaterThan(0.4);
  });

  it("does not flag a gap skill whose closest acquired skill is below the similarity floor", async () => {
    const result = await findRelatedSkills([SKILL_C], [SKILL_A], { embed: fakeEmbed });
    expect(result).toEqual([]);
  });

  it("never reclassifies a related gap skill as acquired — it's an annotation, not a promotion", async () => {
    tableData.certificates = {
      data: [{ programme_id: "programme-1", course_id: null }],
      error: null,
    };
    tableData.programme_skills = { data: [{ skill_id: SKILL_A.id, skills: SKILL_A }], error: null };
    tableData.job_skills = { data: [{ skill_id: SKILL_B.id, skills: SKILL_B }], error: null };
    embedTextMock.mockImplementation(fakeEmbed);

    const result = await getSkillGap("trainee-1", "job-1");

    expect(result.gap_skills).toEqual([SKILL_B]);
    expect(result.acquired_skills).toEqual([]);
    expect(result.related_skills).toEqual([
      expect.objectContaining({ gap_skill_id: SKILL_B.id, related_acquired_skill_id: SKILL_A.id }),
    ]);
  });

  it("degrades to [], not an error, when embedding fails", async () => {
    const result = await findRelatedSkills([SKILL_B], [SKILL_A], {
      embed: vi.fn().mockRejectedValue(new Error("model failed")),
    });
    expect(result).toEqual([]);
  });
});

describe("getSkillGapAcrossJobs", () => {
  it("uses F13's top-match jobs when there's a profile signal", async () => {
    matchJobsForTraineeMock.mockResolvedValue({
      matches: [
        { id: "job-1", title: "Job One" },
        { id: "job-2", title: "Job Two" },
      ],
      hasProfileSignal: true,
    });
    tableData.job_skills = {
      data: [
        { job_id: "job-1", skill_id: SKILL_A.id, skills: SKILL_A },
        { job_id: "job-2", skill_id: SKILL_A.id, skills: SKILL_A },
        { job_id: "job-2", skill_id: SKILL_B.id, skills: SKILL_B },
      ],
      error: null,
    };

    const result = await getSkillGapAcrossJobs("trainee-1");

    expect(result.hasProfileSignal).toBe(true);
    expect(result.jobs).toEqual([
      { id: "job-1", title: "Job One" },
      { id: "job-2", title: "Job Two" },
    ]);
    // Skill A is needed by both jobs, skill B only by one — A ranks first.
    expect(result.gap_summary).toEqual([
      {
        skill_id: SKILL_A.id,
        skill_name: SKILL_A.name,
        category: null,
        jobs_needing_it: 2,
        job_ids: ["job-1", "job-2"],
      },
      {
        skill_id: SKILL_B.id,
        skill_name: SKILL_B.name,
        category: null,
        jobs_needing_it: 1,
        job_ids: ["job-2"],
      },
    ]);
  });

  it("falls back to the newest open postings with no profile signal, and never calls that a failure", async () => {
    matchJobsForTraineeMock.mockResolvedValue({ matches: [], hasProfileSignal: false });
    tableData.jobs = { data: [{ id: "job-9", title: "Newest Job" }], error: null };
    tableData.job_skills = {
      data: [{ job_id: "job-9", skill_id: SKILL_A.id, skills: SKILL_A }],
      error: null,
    };

    const result = await getSkillGapAcrossJobs("trainee-1");

    expect(result.hasProfileSignal).toBe(false);
    expect(result.jobs).toEqual([{ id: "job-9", title: "Newest Job" }]);
    expect(result.gap_summary).toEqual([
      {
        skill_id: SKILL_A.id,
        skill_name: SKILL_A.name,
        category: null,
        jobs_needing_it: 1,
        job_ids: ["job-9"],
      },
    ]);
  });

  it("excludes a skill the trainee already holds from the gap summary", async () => {
    matchJobsForTraineeMock.mockResolvedValue({
      matches: [{ id: "job-1", title: "Job One" }],
      hasProfileSignal: true,
    });
    tableData.certificates = {
      data: [{ programme_id: "programme-1", course_id: null }],
      error: null,
    };
    tableData.programme_skills = { data: [{ skill_id: SKILL_A.id, skills: SKILL_A }], error: null };
    tableData.job_skills = {
      data: [{ job_id: "job-1", skill_id: SKILL_A.id, skills: SKILL_A }],
      error: null,
    };

    const result = await getSkillGapAcrossJobs("trainee-1");

    expect(result.gap_summary).toEqual([]);
  });

  it("returns an empty summary, not an error, when there are no jobs at all", async () => {
    matchJobsForTraineeMock.mockResolvedValue({ matches: [], hasProfileSignal: false });
    tableData.jobs = { data: [], error: null };

    const result = await getSkillGapAcrossJobs("trainee-1");

    expect(result).toEqual({ jobs: [], gap_summary: [], hasProfileSignal: false });
  });
});
