import { beforeEach, describe, expect, it, vi } from "vitest";
import { embedJobBestEffort, matchJobsForTrainee } from "./jobMatchingService.js";

const { fromMock, tableData, updateMock, embedTextMock, rpcMock, consoleErrorSpy } = vi.hoisted(() => {
  const tableData: Record<string, { data: unknown; error: unknown }> = {};
  const updateMock = { calls: [] as unknown[] };

  function builderFor(table: string) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: unknown) => void) => {
        resolve(tableData[table] ?? { data: null, error: null });
      }),
      update: vi.fn((payload: unknown) => {
        updateMock.calls.push(payload);
        return builder;
      }),
    };
    for (const method of ["select", "eq", "in", "single", "maybeSingle"]) {
      builder[method] = vi.fn(() => builder);
    }
    return builder;
  }

  const fromMock = vi.fn((table: string) => builderFor(table));
  const rpcMock = vi.fn();
  return {
    fromMock,
    tableData,
    updateMock,
    embedTextMock: vi.fn(),
    rpcMock,
    consoleErrorSpy: vi.fn(),
  };
});

vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: { from: fromMock, rpc: rpcMock } }));
vi.mock("./chatbotService.js", () => ({ embedText: embedTextMock }));

beforeEach(() => {
  tableData.jobs = { data: { title: "Warehouse hand", description: null, required_skills: null }, error: null };
  tableData.job_skills = { data: [], error: null };
  tableData.profiles = { data: { cooperative_affiliation: null }, error: null };
  tableData.certificates = { data: [], error: null };
  tableData.programme_skills = { data: [], error: null };
  updateMock.calls = [];
  embedTextMock.mockReset();
  rpcMock.mockReset();
  embedTextMock.mockResolvedValue(new Array(384).fill(0.1));
  vi.spyOn(console, "error").mockImplementation(consoleErrorSpy);
});

describe("embedJobBestEffort", () => {
  it("embeds the job's title/description/skills and stores the result", async () => {
    tableData.jobs = {
      data: { title: "Accounts Officer", description: "Handles books", required_skills: ["Tally"] },
      error: null,
    };
    tableData.job_skills = { data: [{ skills: { name: "Bookkeeping" } }], error: null };

    await embedJobBestEffort("job-1");

    expect(embedTextMock).toHaveBeenCalledWith(
      "Accounts Officer. Handles books. Required skills: Tally, Bookkeeping.",
    );
    expect(updateMock.calls).toEqual([{ embedding: new Array(384).fill(0.1) }]);
  });

  it("swallows a failure instead of throwing", async () => {
    embedTextMock.mockRejectedValue(new Error("model not ready"));
    await expect(embedJobBestEffort("job-1")).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe("matchJobsForTrainee", () => {
  it("reports hasProfileSignal: false with no certificates or skills", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const result = await matchJobsForTrainee("trainee-1");

    expect(result.hasProfileSignal).toBe(false);
    expect(result.matches).toEqual([]);
  });

  it("reports hasProfileSignal: true and ranks jobs when the trainee has real signal", async () => {
    tableData.certificates = {
      data: [{ programme_id: "programme-1", programmes: { title: "Dairy Cooperative Management" } }],
      error: null,
    };
    tableData.programme_skills = { data: [{ skills: { name: "Bookkeeping" } }], error: null };
    rpcMock.mockResolvedValue({
      data: [{ id: "job-1", title: "Accounts Officer", similarity: 0.82 }],
      error: null,
    });

    const result = await matchJobsForTrainee("trainee-1");

    expect(result.hasProfileSignal).toBe(true);
    expect(result.matches).toEqual([{ id: "job-1", title: "Accounts Officer", similarity: 0.82 }]);
    expect(rpcMock).toHaveBeenCalledWith("match_jobs", {
      query_embedding: new Array(384).fill(0.1),
      match_count: 10,
    });
    const embeddedText = embedTextMock.mock.calls[0][0] as string;
    expect(embeddedText).toContain("Dairy Cooperative Management");
    expect(embeddedText).toContain("Bookkeeping");
  });

  it("propagates an RPC error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc exploded" } });
    await expect(matchJobsForTrainee("trainee-1")).rejects.toThrow("rpc exploded");
  });
});
