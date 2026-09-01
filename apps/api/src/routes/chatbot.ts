import { askChatbotSchema, createCorpusChunkSchema } from "@ncct/validation";
import { Router } from "express";
import { answerQuestion, embedText } from "../chatbotService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const chatbotRouter = Router();

// Every route here uses supabaseAdmin: `chatbot_corpus_chunks` has no RLS
// policy at all (see the F7 migration), because no client ever reads the
// corpus directly — the ask route returns only the answer plus the snippets
// it actually grounded that answer in.

chatbotRouter.post(
  "/chatbot/corpus",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = createCorpusChunkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    let embedding: number[];
    try {
      embedding = await embedText(parsed.data.content);
    } catch (err) {
      res.status(500).json({ error: `Embedding failed: ${(err as Error).message}` });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("chatbot_corpus_chunks")
      .insert({
        source_type: parsed.data.source_type,
        source_id: parsed.data.source_id ?? null,
        content: parsed.data.content,
        embedding,
      })
      .select("id, source_type, source_id, content, created_at")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

// Deliberately never selects `embedding` — a 384-number vector is useless to
// a client and would bloat every response.
chatbotRouter.get(
  "/chatbot/corpus",
  requireAuth,
  requireRole("admin", "trainer"),
  async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("chatbot_corpus_chunks")
      .select("id, source_type, source_id, content, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);

chatbotRouter.delete(
  "/chatbot/corpus/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("chatbot_corpus_chunks")
      .delete()
      .eq("id", req.params.id)
      .select("id")
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Corpus chunk not found" });
      return;
    }
    res.status(204).send();
  },
);

// Any authenticated user can ask — PRD §6.7 frames this as a trainee-facing
// feature, but there's nothing role-specific about asking an informational
// question, so it isn't gated further.
chatbotRouter.post("/chatbot/ask", requireAuth, async (req, res) => {
  const parsed = askChatbotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await answerQuestion(parsed.data.question);
    res.json(result);
  } catch (err) {
    // The most likely failure in a fresh environment is a missing
    // ANTHROPIC_API_KEY, which is a deployment/config problem rather than a
    // bad request — surface it as 503 with the real reason instead of a
    // generic 500, so it's obvious what to fix.
    res.status(503).json({ error: `Chatbot unavailable: ${(err as Error).message}` });
  }
});
