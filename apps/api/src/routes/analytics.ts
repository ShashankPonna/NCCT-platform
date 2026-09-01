import { Router } from "express";
import { getDashboardAnalytics } from "../analyticsService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analyticsRouter = Router();

// Admin-only, not admin+trainer: PRD §6.8 frames this specifically as an
// "Admin view", unlike F3/F4's content-authoring routes where "who can
// write this" was an unstated judgment call. Read-only aggregation over
// other features' tables, so no supabaseAdmin-vs-req.supabase choice to
// make here — it's all supabaseAdmin, inside analyticsService.
analyticsRouter.get("/analytics/dashboard", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const data = await getDashboardAnalytics();
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
