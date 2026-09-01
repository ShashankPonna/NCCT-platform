import { LESSON_FILE_MAX_BYTES, LESSON_FILE_MIME_TYPES } from "@ncct/constants";
import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const lessonContentRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LESSON_FILE_MAX_BYTES },
});

const CONTENT_BUCKET = "lesson-content";
const SIGNED_URL_TTL_SECONDS = 60;

// PDF/slides lessons: the file goes through Express to Supabase Storage
// (never a direct client upload), per ARCHITECTURE.md §8. Reads are a
// short-lived signed URL Express issues after its own auth check — the
// bytes then flow straight from Supabase's CDN to the client rather than
// proxying through Express, the same reasoning already applied to lesson
// video (see DECISIONS.md #12's "don't proxy the video" note).

lessonContentRouter.post(
  "/lessons/:id/content",
  requireAuth,
  requireRole("admin", "trainer"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    if (
      !LESSON_FILE_MIME_TYPES.includes(req.file.mimetype as (typeof LESSON_FILE_MIME_TYPES)[number])
    ) {
      res.status(400).json({ error: `Unsupported file type: ${req.file.mimetype}` });
      return;
    }

    const path = `${req.params.id}/${Date.now()}-${req.file.originalname}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(CONTENT_BUCKET)
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (uploadError) {
      res.status(400).json({ error: uploadError.message });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("lessons")
      .update({ storage_path: path })
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    res.status(201).json(data);
  },
);

lessonContentRouter.get("/lessons/:id/content-url", requireAuth, async (req, res) => {
  const { data: lesson, error: lessonError } = await req
    .supabase!.from("lessons")
    .select("storage_path")
    .eq("id", req.params.id)
    .maybeSingle();

  if (lessonError) {
    res.status(400).json({ error: lessonError.message });
    return;
  }
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  if (!lesson.storage_path) {
    res.json({ url: null });
    return;
  }

  const { data, error } = await supabaseAdmin.storage
    .from(CONTENT_BUCKET)
    .createSignedUrl(lesson.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json({ url: data.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
});
