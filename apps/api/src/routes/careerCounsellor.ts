import { askCareerCounsellorSchema } from "@ncct/validation";
import { Router } from "express";
import { askCareerCounsellor } from "../careerCounsellorService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const careerCounsellorRouter = Router();

// Trainee-only: this is personalized advice grounded in the caller's own
// data (certificates, nominations, skill gaps), unlike F7's chatbot which
// any authenticated role can ask.
careerCounsellorRouter.post(
  "/career-counsellor/ask",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const parsed = askCareerCounsellorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const result = await askCareerCounsellor(req.user!.id, parsed.data.question);
      res.json(result);
    } catch (err) {
      // Same reasoning as chatbot.ts: the likeliest failure in a fresh
      // environment is a missing GEMINI_API_KEY — a config problem, not a
      // bad request.
      res.status(503).json({ error: `Career counsellor unavailable: ${(err as Error).message}` });
    }
  },
);
