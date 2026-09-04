import { updatePublicProfileEnabledSchema, updateVisibilitySettingsSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const visibilitySettingsRouter = Router();

// Own-row read/write only (RLS `visibility_settings_own`, `for all`,
// already present from the initial migration) — same pattern as
// lessonProgress.ts, no supabaseAdmin needed.

visibilitySettingsRouter.get(
  "/visibility-settings",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await req
      .supabase!.from("visibility_settings")
      .select("*")
      .eq("trainee_id", req.user!.id)
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    // No row yet means "never opted in" — the column's own DB default is
    // false, but that default only applies once a row exists; a trainee who
    // has never touched this setting should see the same false, not null.
    res.json(
      data ?? {
        trainee_id: req.user!.id,
        visible_to_employers: false,
        public_profile_enabled: false,
        updated_at: null,
      },
    );
  },
);

visibilitySettingsRouter.put(
  "/visibility-settings",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const parsed = updateVisibilitySettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await req
      .supabase!.from("visibility_settings")
      .upsert(
        {
          trainee_id: req.user!.id,
          visible_to_employers: parsed.data.visible_to_employers,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trainee_id" },
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

// F10 — a separate consent scope from visible_to_employers, so it gets its
// own PUT rather than being folded into the route above: the trainee UI
// toggles the NFC/public-profile card independently of employer visibility
// (docs/DECISIONS.md #30).
visibilitySettingsRouter.put(
  "/visibility-settings/public-profile",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const parsed = updatePublicProfileEnabledSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await req
      .supabase!.from("visibility_settings")
      .upsert(
        {
          trainee_id: req.user!.id,
          public_profile_enabled: parsed.data.public_profile_enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trainee_id" },
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
