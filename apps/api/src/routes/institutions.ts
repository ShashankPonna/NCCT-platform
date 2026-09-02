import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const institutionsRouter = Router();

// Read-only for now: the admin programme form needs to pick an owning
// institution, and until this existed the only way to supply one was to
// paste a raw UUID read out of the database by hand. Institution *authoring*
// (create/update/delete) is still part of F1's unbuilt "institution profile
// CRUD" — see docs/IMPLEMENTATION.md — and deliberately isn't added here.
//
// Uses supabaseAdmin because `institutions` has RLS enabled with no policy
// at all (default-deny), so a user-scoped client reads nothing; the route's
// own requireRole is what authorizes the read, same pattern as
// certificates.ts's /mine route.
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
