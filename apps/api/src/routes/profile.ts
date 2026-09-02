import { updateProfileSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const profileRouter = Router();

// The identity endpoint the clients' session hooks call: deliberately returns
// only what auth middleware already resolved (id/role/full_name), not the
// whole row, so a session bootstrap stays one cheap lookup.
profileRouter.get("/profile", requireAuth, (req, res) => {
  res.json(req.user);
});

// The full own profile row — everything the edit form needs, including the
// employer org fields (PRD §6.1). Own-row RLS (`profiles_select_own`) makes
// req.supabase sufficient; no ownership check is needed beyond it.
profileRouter.get("/profile/details", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("profiles")
    .select("*")
    .eq("id", req.user!.id)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(data);
});

// Own-row update, backed by the pre-existing `profiles_update_own` policy.
// `role` is not accepted by updateProfileSchema, so a user cannot escalate
// their own privileges here — role changes are an admin operation only.
profileRouter.patch("/profile", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await req
    .supabase!.from("profiles")
    .update(parsed.data)
    .eq("id", req.user!.id)
    .select()
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(data);
});
