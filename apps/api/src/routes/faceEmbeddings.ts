import { enrollFaceEmbeddingSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const faceEmbeddingsRouter = Router();

// Own-row read/write only (RLS `face_embeddings_select_own`/`_insert_own`,
// docs/DECISIONS.md #9) — a trainee only ever touches their own embeddings,
// same pattern as lessonProgress.ts. Extraction itself already happened in
// the browser (docs/DECISIONS.md #16); this route only stores the result.

faceEmbeddingsRouter.post(
  "/face-embeddings",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const parsed = enrollFaceEmbeddingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await req
      .supabase!.from("face_embeddings")
      .insert({
        trainee_id: req.user!.id,
        embedding: parsed.data.embedding,
        model: parsed.data.model,
        consent_given_at: new Date().toISOString(),
      })
      .select("id, model, consent_given_at, created_at")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

faceEmbeddingsRouter.get(
  "/face-embeddings/status",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await req
      .supabase!.from("face_embeddings")
      .select("id")
      .eq("trainee_id", req.user!.id)
      .limit(1);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ enrolled: (data?.length ?? 0) > 0 });
  },
);
