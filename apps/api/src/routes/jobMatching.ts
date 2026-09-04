import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { matchJobsForTrainee } from "../jobMatchingService.js";

export const jobMatchingRouter = Router();

// Trainee-only: ranks jobs against the caller's own profile, never
// anyone else's — see jobMatchingService.ts.
jobMatchingRouter.get("/job-matches/mine", requireAuth, requireRole("trainee"), async (req, res) => {
  try {
    const result = await matchJobsForTrainee(req.user!.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
