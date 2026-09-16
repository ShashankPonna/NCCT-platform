import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { computeSkillGap } from "../skillGapService.js";

export const skillGapRouter = Router();

// Trainee-only, own-row: trainee_id always comes from req.user (JWT), never
// the request/URL, per CLAUDE.md's "never trust a client-reported ..."
// security rules — a trainee can only run this analysis for themselves.
skillGapRouter.get("/skill-gap/:jobId", requireAuth, requireRole("trainee"), async (req, res) => {
  try {
    const result = await computeSkillGap(req.user!.id, req.params.jobId);
    if (!result) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to compute skill gap" });
  }
});
