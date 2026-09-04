import { beforeEach, describe, expect, it, vi } from "vitest";
import { askCareerCounsellor } from "./careerCounsellorService.js";

const { fromMock, tableData, getSkillGapMock } = vi.hoisted(() => {
  const tableData: Record<string, { data: unknown; error: unknown }> = {};

  function builderFor(table: string) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: unknown) => void) => {
        resolve(tableData[table] ?? { data: null, error: null });
      }),
    };
    for (const method of ["select", "eq", "order", "limit", "ilike", "single"]) {
      builder[method] = vi.fn(() => builder);
    }
    return builder;
  }

  const fromMock = vi.fn((table: string) => builderFor(table));
  return { fromMock, tableData, getSkillGapMock: vi.fn() };
});

vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock("./skillGapService.js", () => ({ getSkillGap: getSkillGapMock }));

const TRAINEE_ID = "trainee-1";

beforeEach(() => {
  tableData.profiles = { data: { full_name: "Test Trainee", cooperative_affiliation: null }, error: null };
  tableData.certificates = { data: [], error: null };
  tableData.nominations = { data: [], error: null };
  tableData.programmes = { data: [], error: null };
  tableData.jobs = { data: [], error: null };
  getSkillGapMock.mockReset();
  fromMock.mockClear();
});

function textResponse(text: string) {
  return { text, functionCalls: undefined };
}

function toolCallResponse(calls: { id?: string; name: string; args?: Record<string, unknown> }[]) {
  return { text: "", functionCalls: calls };
}

describe("askCareerCounsellor", () => {
  it("answers directly with no tool calls when the model doesn't need one", async () => {
    const generateContentMock = vi.fn().mockResolvedValue(textResponse("Hello there."));

    const result = await askCareerCounsellor(TRAINEE_ID, "hi", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result).toEqual({ answer: "Hello there.", toolCalls: [] });
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("executes a requested tool scoped to the caller and reports it in toolCalls", async () => {
    const generateContentMock = vi
      .fn()
      .mockResolvedValueOnce(toolCallResponse([{ id: "call-1", name: "get_my_profile", args: {} }]))
      .mockResolvedValueOnce(textResponse("You're Test Trainee."));

    const result = await askCareerCounsellor(TRAINEE_ID, "who am I?", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result.answer).toBe("You're Test Trainee.");
    expect(result.toolCalls).toEqual([{ tool: "get_my_profile", args: {} }]);
    // The tool must have looked up the caller, not anyone the model might name.
    expect(fromMock).toHaveBeenCalledWith("profiles");
  });

  it("executes multiple tool calls requested in the same turn", async () => {
    const generateContentMock = vi
      .fn()
      .mockResolvedValueOnce(
        toolCallResponse([
          { id: "c1", name: "list_my_certificates", args: {} },
          { id: "c2", name: "list_my_nominations", args: {} },
        ]),
      )
      .mockResolvedValueOnce(textResponse("Here's your status."));

    const result = await askCareerCounsellor(TRAINEE_ID, "what's my status?", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result.toolCalls.map((c) => c.tool)).toEqual(["list_my_certificates", "list_my_nominations"]);
  });

  it("routes get_my_skill_gap_for_job through skillGapService.getSkillGap", async () => {
    getSkillGapMock.mockResolvedValue({ acquired_skills: [], gap_skills: [], reasoning: null });
    const generateContentMock = vi
      .fn()
      .mockResolvedValueOnce(
        toolCallResponse([{ id: "c1", name: "get_my_skill_gap_for_job", args: { job_id: "job-1" } }]),
      )
      .mockResolvedValueOnce(textResponse("You're missing one skill."));

    await askCareerCounsellor(TRAINEE_ID, "am I ready for job-1?", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(getSkillGapMock).toHaveBeenCalledWith(TRAINEE_ID, "job-1");
  });

  it("catches a tool execution error and continues instead of throwing", async () => {
    const generateContentMock = vi
      .fn()
      .mockResolvedValueOnce(
        // Missing required job_id — executeTool throws internally.
        toolCallResponse([{ id: "c1", name: "get_my_skill_gap_for_job", args: {} }]),
      )
      .mockResolvedValueOnce(textResponse("I need a specific job to check that."));

    const result = await askCareerCounsellor(TRAINEE_ID, "am I ready?", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result.answer).toBe("I need a specific job to check that.");
    expect(result.toolCalls).toEqual([{ tool: "get_my_skill_gap_for_job", args: {} }]);
  });

  it("stops after MAX_TOOL_TURNS and forces a final answer without tools", async () => {
    const generateContentMock = vi
      .fn()
      .mockResolvedValue(toolCallResponse([{ id: "loop", name: "get_my_profile", args: {} }]));
    // Every call keeps requesting a tool except we need a final forced call
    // to return text — override the last call specifically.
    generateContentMock.mockImplementation((params: { config?: { tools?: unknown } }) => {
      if (!params.config?.tools) {
        return Promise.resolve(textResponse("Best I can say without more tool calls."));
      }
      return Promise.resolve(toolCallResponse([{ id: "loop", name: "get_my_profile", args: {} }]));
    });

    const result = await askCareerCounsellor(TRAINEE_ID, "keep asking", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result.answer).toBe("Best I can say without more tool calls.");
    // 4 tool-bearing turns (MAX_TOOL_TURNS) + 1 final forced call, no more.
    expect(generateContentMock).toHaveBeenCalledTimes(5);
    expect(result.toolCalls).toHaveLength(4);
  });

  it("falls back to a generic answer when the model returns no text at all", async () => {
    const generateContentMock = vi.fn().mockResolvedValue(textResponse(""));

    const result = await askCareerCounsellor(TRAINEE_ID, "hi", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.answer).not.toBe("");
  });
});
