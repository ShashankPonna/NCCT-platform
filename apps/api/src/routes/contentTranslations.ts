import { localeSchema, upsertContentTranslationSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const contentTranslationsRouter = Router();

// Per-locale lesson content. The locale itself is validated by shape only —
// PRD §14 hasn't settled which second language the MVP ships, so the API
// deliberately accepts any well-formed locale rather than encoding a guess.

contentTranslationsRouter.get("/lessons/:id/translations", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("content_translations")
    .select("*")
    .eq("lesson_id", req.params.id)
    .order("locale", { ascending: true });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
});

contentTranslationsRouter.put(
  "/lessons/:id/translations/:locale",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsedLocale = localeSchema.safeParse(req.params.locale);
    if (!parsedLocale.success) {
      res.status(400).json({ error: parsedLocale.error.flatten() });
      return;
    }

    const parsed = upsertContentTranslationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("content_translations")
      .upsert(
        { ...parsed.data, lesson_id: req.params.id, locale: parsedLocale.data },
        { onConflict: "lesson_id,locale" },
      )
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);

contentTranslationsRouter.delete(
  "/lessons/:id/translations/:locale",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("content_translations")
      .delete()
      .eq("lesson_id", req.params.id)
      .eq("locale", req.params.locale)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Translation not found" });
      return;
    }
    res.status(204).send();
  },
);
