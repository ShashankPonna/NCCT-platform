import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROQ_MODEL, groqChat } from "./groqClient.js";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GROQ_API_KEY", "test-key");
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve("") };
}

describe("groqChat", () => {
  it("throws before any network call when GROQ_API_KEY is missing", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    await expect(groqChat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      "GROQ_API_KEY is not set",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the shared model and defaults with the bearer key, and returns the assistant message", async () => {
    const message = { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] };
    fetchMock.mockResolvedValue(okResponse({ choices: [{ message }] }));

    const result = await groqChat({ messages: [{ role: "user", content: "hi" }], tools: [] });

    expect(result).toEqual(message);
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: GROQ_MODEL, reasoning_effort: "low", max_tokens: 1024, tools: [] });
  });

  it("lets a caller override a default such as max_tokens", async () => {
    fetchMock.mockResolvedValue(okResponse({ choices: [{ message: { content: "x" } }] }));
    await groqChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 50 });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).max_tokens).toBe(50);
  });

  it("throws with the status and body snippet on an API error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: () => Promise.resolve("rate limited") });
    await expect(groqChat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      "Groq API error 429: rate limited",
    );
  });

  it("returns empty content when the response has no choices", async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    await expect(groqChat({ messages: [{ role: "user", content: "hi" }] })).resolves.toEqual({ content: "" });
  });
});
