import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerQuestion, embedText, retrieveRelevantChunks } from "./chatbotService.js";

const { pipelineMock, extractorMock, rpcMock } = vi.hoisted(() => {
  const extractorMock = vi.fn();
  return {
    extractorMock,
    pipelineMock: vi.fn(() => Promise.resolve(extractorMock)),
    rpcMock: vi.fn(),
  };
});

// The real model is never loaded in tests — it downloads ~25MB and takes
// seconds to initialize.
vi.mock("@huggingface/transformers", () => ({ pipeline: pipelineMock }));
vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: { rpc: rpcMock } }));

function fakeEmbedding(dimensions = 384) {
  return { data: new Float32Array(dimensions).fill(0.1) };
}

beforeEach(() => {
  extractorMock.mockReset();
  rpcMock.mockReset();
  extractorMock.mockResolvedValue(fakeEmbedding());
});

describe("embedText", () => {
  it("returns a plain number array of the expected dimension", async () => {
    const embedding = await embedText("hello");
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding).toHaveLength(384);
  });

  it("requests mean pooling and normalization (cosine distance depends on it)", async () => {
    await embedText("hello");
    expect(extractorMock).toHaveBeenCalledWith("hello", { pooling: "mean", normalize: true });
  });

  it("throws if the model returns an unexpected dimension count", async () => {
    extractorMock.mockResolvedValue(fakeEmbedding(768));
    await expect(embedText("hello")).rejects.toThrow(/768 dimensions, expected 384/);
  });
});

describe("retrieveRelevantChunks", () => {
  it("drops chunks below the relevance floor", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: "a", content: "relevant", source_type: "faq", source_id: null, similarity: 0.8 },
        { id: "b", content: "marginal", source_type: "faq", source_id: null, similarity: 0.05 },
      ],
      error: null,
    });

    const chunks = await retrieveRelevantChunks("who can enroll?");

    expect(chunks).toHaveLength(1);
    expect(chunks[0].id).toBe("a");
  });

  it("propagates a retrieval error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc exploded" } });
    await expect(retrieveRelevantChunks("q")).rejects.toThrow("rpc exploded");
  });
});

describe("answerQuestion", () => {
  it("returns answered: false and never calls the model when nothing is relevant", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "a", content: "x", source_type: "faq", source_id: null, similarity: 0.01 }],
      error: null,
    });
    const generateContentMock = vi.fn();

    const result = await answerQuestion("what is the weather?", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result.answered).toBe(false);
    expect(result.sources).toEqual([]);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("grounds the model call in the retrieved chunks and returns them as sources", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: "a",
          content: "Programmes are open to cooperative members.",
          source_type: "faq",
          source_id: null,
          similarity: 0.9,
        },
      ],
      error: null,
    });
    const generateContentMock = vi.fn().mockResolvedValue({
      text: "Cooperative members can enroll.",
    });

    const result = await answerQuestion("Who can enroll?", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result.answered).toBe(true);
    expect(result.answer).toBe("Cooperative members can enroll.");
    expect(result.sources).toEqual([
      {
        id: "a",
        content: "Programmes are open to cooperative members.",
        similarity: 0.9,
      },
    ]);

    const callArgs = generateContentMock.mock.calls[0][0];
    expect(callArgs.model).toBe("gemini-3.1-flash-lite");
    // The retrieved chunk must actually reach the model, and the question with it.
    expect(callArgs.contents).toContain("Programmes are open to cooperative members.");
    expect(callArgs.contents).toContain("Who can enroll?");
    // The scope guardrails (PRD §6.7 informational-only) must be in the system prompt.
    expect(callArgs.config.systemInstruction).toContain("ONLY from the reference material");
    expect(callArgs.config.systemInstruction).toContain("personalised career advice");
  });

  it("falls back to the no-information answer if the model returns no text", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "a", content: "ctx", source_type: "faq", source_id: null, similarity: 0.9 }],
      error: null,
    });
    const generateContentMock = vi.fn().mockResolvedValue({ text: "" });

    const result = await answerQuestion("Who can enroll?", {
      client: { models: { generateContent: generateContentMock } } as never,
    });

    expect(result.answered).toBe(true);
    expect(result.answer).toContain("don't have information");
  });
});
