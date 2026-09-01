import { createModuleSchema, updateModuleSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const modulesRouter = Router();

modulesRouter.post(
  "/courses/:id/modules",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = createModuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("modules")
      .insert({ ...parsed.data, course_id: req.params.id })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

modulesRouter.get("/courses/:id/modules", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("modules")
    .select("*")
    .eq("course_id", req.params.id)
    .order("position", { ascending: true });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json(data);
});

modulesRouter.get("/modules/:id", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("modules")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Module not found" });
    return;
  }
  res.json(data);
});

modulesRouter.patch(
  "/modules/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = updateModuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("modules")
      .update(parsed.data)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Module not found" });
      return;
    }
    res.json(data);
  },
);

modulesRouter.delete(
  "/modules/:id",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("modules")
      .delete()
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Module not found" });
      return;
    }
    res.status(204).send();
  },
);
