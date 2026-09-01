import "dotenv/config";
import cors from "cors";
import express from "express";
import { assessmentAttemptsRouter } from "./routes/assessmentAttempts.js";
import { assessmentQuestionsRouter } from "./routes/assessmentQuestions.js";
import { assessmentsRouter } from "./routes/assessments.js";
import { certificatesRouter } from "./routes/certificates.js";
import { contentTranslationsRouter } from "./routes/contentTranslations.js";
import { coursesRouter } from "./routes/courses.js";
import { lessonContentRouter } from "./routes/lessonContent.js";
import { lessonProgressRouter } from "./routes/lessonProgress.js";
import { lessonsRouter } from "./routes/lessons.js";
import { modulesRouter } from "./routes/modules.js";
import { nominationsRouter } from "./routes/nominations.js";
import { profileRouter } from "./routes/profile.js";
import { programmesRouter } from "./routes/programmes.js";
import { timetableRouter } from "./routes/timetable.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", profileRouter);
app.use("/api", programmesRouter);
app.use("/api", nominationsRouter);
app.use("/api", timetableRouter);
app.use("/api", coursesRouter);
app.use("/api", modulesRouter);
app.use("/api", lessonsRouter);
app.use("/api", lessonProgressRouter);
app.use("/api", lessonContentRouter);
app.use("/api", contentTranslationsRouter);
app.use("/api", assessmentsRouter);
app.use("/api", assessmentQuestionsRouter);
app.use("/api", assessmentAttemptsRouter);
app.use("/api", certificatesRouter);
