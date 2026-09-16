import { setSkillIdsSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const programmeSkillsRouter = Router();

// Which skills a programme confers once a trainee is certified in it
// (Phase-2 P1, docs/PRD.md §13.1) — full-replace semantics: delete the
// programme's current set, then insert the new one. Same admin+trainer
// write access as courses/modules/lessons (docs/DATABASE.md's Open Items —
// a judgment call, PRD doesn't say who authors content).
programmeSkillsRouter.put(
  "/programmes/:id/skills",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = setSkillIdsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("programme_skills")
      .delete()
      .eq("programme_id", req.params.id);
    if (deleteError) {
      res.status(400).json({ error: deleteError.message });
      return;
    }

    if (parsed.data.skill_ids.length > 0) {
      const { error: insertError } = await supabaseAdmin.from("programme_skills").insert(
        parsed.data.skill_ids.map((skillId) => ({
          programme_id: req.params.id,
          skill_id: skillId,
        })),
      );
      if (insertError) {
        res.status(400).json({ error: insertError.message });
        return;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("programme_skills")
      .select("skills(id, name, category)")
      .eq("programme_id", req.params.id);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json((data ?? []).map((row) => row.skills));
  },
);

programmeSkillsRouter.get("/programmes/:id/skills", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("programme_skills")
    .select("skills(id, name, category)")
    .eq("programme_id", req.params.id);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json((data ?? []).map((row) => row.skills));
});
