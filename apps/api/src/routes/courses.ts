import { createCourseSchema, updateCourseSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const coursesRouter = Router();

coursesRouter.post(
  "/programmes/:id/courses",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = createCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("courses")
      .insert({ ...parsed.data, programme_id: req.params.id })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

coursesRouter.get("/programmes/:id/courses", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("courses")
    .select("*")
    .eq("programme_id", req.params.id)
    .order("created_at", { ascending: true });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
});

coursesRouter.get("/courses/:id", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("courses")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.json(data);
});

coursesRouter.patch(
  "/courses/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = updateCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("courses")
      .update(parsed.data)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(data);
  },
);

coursesRouter.delete(
  "/courses/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("courses")
      .delete()
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.status(204).send();
  },
);
