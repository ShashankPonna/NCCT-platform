// The one Groq chat-completions call every AI feature shares: F7's chatbot
// (chatbotService.ts, DECISIONS.md #35), P2's career counsellor and P1's
// "what to learn first" ranking (DECISIONS.md #68 moved both off Gemini so
// the platform needs a single GROQ_API_KEY). Groq's OpenAI-compatible REST
// endpoint is called directly via fetch rather than through an SDK — per
// CLAUDE.md's "don't add a dependency an existing tool already covers".
//
// Model choice (confirmed live against the real key, see #35):
// `openai/gpt-oss-120b` is the largest general chat model on this account
// and supports OpenAI-style tool calling. It's a reasoning model — without
// `reasoning_effort: "low"` a small max_tokens budget can be spent entirely
// on hidden reasoning, returning EMPTY content — so that's the default here.
const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "openai/gpt-oss-120b";

export interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type GroqMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface GroqTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface GroqChatRequest {
  messages: GroqMessage[];
  tools?: GroqTool[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" };
}

export interface GroqAssistantMessage {
  content: string | null;
  tool_calls?: GroqToolCall[];
}

export type GroqChat = (request: GroqChatRequest) => Promise<GroqAssistantMessage>;

interface GroqChatCompletionResponse {
  choices?: { message?: GroqAssistantMessage }[];
}

export const groqChat: GroqChat = async (request) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const res = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      reasoning_effort: "low",
      ...request,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as GroqChatCompletionResponse;
  return data.choices?.[0]?.message ?? { content: "" };
};
