import Anthropic from "@anthropic-ai/sdk";
import {
  CHATBOT_MIN_SIMILARITY,
  CHATBOT_RETRIEVAL_COUNT,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "@ncct/constants";
import type { ChatbotAnswer, RetrievedChunk } from "@ncct/shared-types";
import { pipeline } from "@huggingface/transformers";
import { supabaseAdmin } from "./supabaseClient.js";

// Embeddings are generated locally rather than through a hosted embedding
// API — see docs/DECISIONS.md #17. Loading the model is expensive (~15s cold,
// downloads ~25MB once then caches on disk), so it's a lazily-initialized
// module singleton: the first question pays for it, every later one doesn't.
let embedderPromise: Promise<
  Awaited<ReturnType<typeof pipeline<"feature-extraction">>>
> | null = null;

function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return embedderPromise;
}

/**
 * Mean-pooled, L2-normalized sentence embedding. Normalization is what makes
 * cosine distance (the `<=>` operator the retrieval index and RPC use) the
 * correct similarity measure.
 */
export async function embedText(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: "mean", normalize: true });
  const values = Array.from(output.data as Float32Array, (v) => Number(v));
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding model returned ${values.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
  return values;
}

/**
 * Top-K corpus chunks for a question, filtered by a relevance floor. The
 * floor is the important half: `match_corpus_chunks` always returns the K
 * nearest chunks, so without it an unrelated question still comes back with
 * the "closest" (but irrelevant) content and the model would ground an
 * answer in it.
 */
export async function retrieveRelevantChunks(question: string): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedText(question);

  const { data, error } = await supabaseAdmin.rpc("match_corpus_chunks", {
    query_embedding: queryEmbedding,
    match_count: CHATBOT_RETRIEVAL_COUNT,
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as RetrievedChunk[]).filter(
    (chunk) => chunk.similarity >= CHATBOT_MIN_SIMILARITY,
  );
}

// PRD §6.7 scopes this to informational Q&A, explicitly *not* open-ended
// career advice — that's Phase-2 (P2 AI Career Counsellor, P3 AI Job
// Matching), which CLAUDE.md forbids shipping under the MVP label. The
// grounding rules and the advice-refusal rule below are what keep this
// feature on the MVP side of that line, so they aren't stylistic prompt
// polish — changing them changes the feature's scope.
const SYSTEM_PROMPT = `You answer questions about the NCCT cooperative training platform for trainees and prospective trainees.

Rules:
- Answer ONLY from the reference material given in the user message. It is the single source of truth.
- If the reference material does not contain the answer, say you don't have that information and suggest contacting the training institution. Never fill a gap with general knowledge, and never guess.
- Never invent programme names, dates, fees, durations, or eligibility criteria.
- Keep answers short and factual — 2 to 4 sentences, plain language suitable for a first-time trainee.
- You give informational answers only: what programmes exist, who is eligible, how certification works. If asked for personalised career advice, what someone should study or apply for, or help matching to jobs, say that is outside what you can help with and point them to the programme information instead.`;

const NO_CONTEXT_ANSWER =
  "I don't have information about that in the programme material available to me. Please contact your training institution for help with this question.";

interface AnswerOptions {
  /** Injectable for tests so they never reach the real Claude API. */
  client?: Anthropic;
}

/**
 * Full RAG turn: embed the question, retrieve grounding chunks, then ask
 * Claude to answer from them. When retrieval finds nothing above the
 * relevance floor this returns early WITHOUT calling the model at all —
 * cheaper, and it makes "no grounding" a structurally different outcome
 * than "the model decided it didn't know", which the caller can tell apart
 * via `answered`.
 */
export async function answerQuestion(
  question: string,
  options: AnswerOptions = {},
): Promise<ChatbotAnswer> {
  const chunks = await retrieveRelevantChunks(question);

  if (chunks.length === 0) {
    return { answered: false, answer: NO_CONTEXT_ANSWER, sources: [] };
  }

  const client = options.client ?? new Anthropic();
  const referenceMaterial = chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    // Grounded FAQ answering is a light task — low effort keeps latency and
    // cost down without hurting quality here (see the claude-api skill's
    // cost guidance on chat-shaped routes).
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Reference material:\n\n${referenceMaterial}\n\nQuestion: ${question}`,
      },
    ],
  });

  const answer = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return {
    answered: true,
    answer: answer || NO_CONTEXT_ANSWER,
    sources: chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      similarity: chunk.similarity,
    })),
  };
}
