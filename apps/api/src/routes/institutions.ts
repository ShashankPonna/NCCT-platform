import { createInstitutionSchema, updateInstitutionSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const institutionsRouter = Router();

// Every route here uses supabaseAdmin because `institutions` has RLS enabled
// with no policy at all (default-deny), so a user-scoped client reads and
// writes nothing; the routes' own requireRole is what authorizes access, the
// same pattern as certificates.ts's /mine route.
//
// Reads are admin+trainer (a trainer needs to see which institution owns the
// content they author); writes are admin-only.
institutionsRouter.get(
  "/institutions",
  requireAuth,
  requireRole("admin", "trainer"),
  async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("institutions")
      .select("id, name, type, location")
      .order("name", { ascending: true });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);

institutionsRouter.post("/institutions", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = createInstitutionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("institutions")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

institutionsRouter.patch(
  "/institutions/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const parsed = updateInstitutionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("institutions")
      .update(parsed.data)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Institution not found" });
      return;
    }
    res.json(data);
  },
);

institutionsRouter.delete(
  "/institutions/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    // `programmes.institution_id` is ON DELETE CASCADE, and programmes cascade
    // onward to courses → modules → lessons → progress/assessments. Deleting a
    // populated institution would therefore silently destroy an entire
    // training history, so refuse it and make the caller deal with the
    // programmes explicitly. Checked before the delete, not recovered after.
    const { count, error: countError } = await supabaseAdmin
      .from("programmes")
      .select("id", { count: "exact", head: true })
      .eq("institution_id", req.params.id);

    if (countError) {
      res.status(400).json({ error: countError.message });
      return;
    }
    if ((count ?? 0) > 0) {
      res.status(409).json({
        error: `Institution still has ${count} programme(s); delete or reassign them first`,
      });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("institutions")
      .delete()
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Institution not found" });
      return;
    }
    res.status(204).send();
  },
);
