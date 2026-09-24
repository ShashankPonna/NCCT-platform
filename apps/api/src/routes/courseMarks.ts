import { Router } from "express";
import { getCourseGradebook, getCourseMarksTally } from "../assessmentScoring.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getProgrammeIdForCourse, requireProgrammeAccess } from "../programmeAccess.js";

export const courseMarksRouter = Router();

// A trainee's own marks tally for one course (DECISIONS.md #53): best result
// per assessment, module-test totals, lesson completion and certificate
// status. trainee_id comes from req.user only, so this can never read
// another trainee's marks.
courseMarksRouter.get(
  "/courses/:id/marks/mine",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    try {
      const tally = await getCourseMarksTally(req.params.id, req.user!.id);
      if (!tally) {
        res.status(404).json({ error: "Course not found" });
        return;
      }
      res.json(tally);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

// Staff gradebook: every roster trainee's best marks per assessment and
// module-test totals. Scoped to trainers assigned to the course's programme
// (DECISIONS.md #52), same as every other staff course route.
courseMarksRouter.get(
  "/courses/:id/gradebook",
  requireAuth,
  requireRole("admin", "trainer"),
  requireProgrammeAccess((req) => getProgrammeIdForCourse(req.params.id)),
  async (req, res) => {
    try {
      const gradebook = await getCourseGradebook(req.params.id);
      if (!gradebook) {
        res.status(404).json({ error: "Course not found" });
        return;
      }
      res.json(gradebook);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);
