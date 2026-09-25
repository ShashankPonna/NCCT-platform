import { Router } from "express";
import { getCourseGradebook, getCourseMarksTally } from "../assessmentScoring.js";
import {
  buildGradebookWorkbook,
  gradebookFileName,
  loadGradebookExportContext,
} from "../gradebookExport.js";
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

// The same gradebook as a structured Excel workbook (docs/DECISIONS.md #66)
// — identical data and identical access rule to the route above, so a
// trainer can only ever export their own assigned programmes' courses.
// `?lang=hi` renders the sheet's labels in Hindi; the marks never change.
courseMarksRouter.get(
  "/courses/:id/gradebook/export",
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
      const context = await loadGradebookExportContext(
        req.params.id,
        gradebook.rows.map((row) => row.trainee_id),
      );
      const generatedAt = new Date();
      const buffer = await buildGradebookWorkbook(gradebook, {
        ...context,
        preparedBy: req.user!.full_name,
        generatedAt,
        locale: req.query.lang === "hi" ? "hi" : "en",
      });

      const fileName = gradebookFileName(gradebook.course_title, generatedAt);
      // ASCII fallback for old clients plus RFC 5987 filename* so a Hindi
      // course title survives intact in modern browsers.
      const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.send(buffer);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);
