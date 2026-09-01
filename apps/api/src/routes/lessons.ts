import { createLessonSchema, updateLessonSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const lessonsRouter = Router();

lessonsRouter.post(
  "/modules/:id/lessons",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = createLessonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("lessons")
      .insert({ ...parsed.data, module_id: req.params.id })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

lessonsRouter.get("/modules/:id/lessons", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("lessons")
    .select("*")
    .eq("module_id", req.params.id)
    .order("position", { ascending: true });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
});

lessonsRouter.get("/lessons/:id", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("lessons")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  res.json(data);
});

lessonsRouter.patch(
  "/lessons/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = updateLessonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("lessons")
      .update(parsed.data)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    res.json(data);
  },
);

lessonsRouter.delete(
  "/lessons/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("lessons")
      .delete()
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    res.status(204).send();
  },
);
