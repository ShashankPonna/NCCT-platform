import { LESSON_VIDEO_MAX_BYTES, LESSON_VIDEO_MIME_TYPES } from "@ncct/constants";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getB2BucketName, getB2Client } from "../b2Client.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const lessonVideoRouter = Router();

// Longer than PDF/slides' 60s (lessonContent.ts) — a multi-hundred-MB video
// over a slow connection can take minutes, and the URL must still be valid
// partway through the transfer, whether uploading or streaming.
const UPLOAD_URL_TTL_SECONDS = 1800;
const PLAYBACK_URL_TTL_SECONDS = 1800;

const requestUploadUrlSchema = z.object({
  filename: z.string().min(1),
  content_type: z.enum(LESSON_VIDEO_MIME_TYPES),
  size_bytes: z.number().int().positive().max(LESSON_VIDEO_MAX_BYTES),
});

// Unlike lessonContent.ts's PDF upload, the file itself never touches
// Express — buffering a multi-hundred-MB video through Node's memory (or
// even disk) for every upload doesn't scale the way a 25MB PDF does. Instead
// this mints a presigned PUT URL after checking auth/role, and the browser
// uploads straight to B2. This is the same narrow exception to "clients
// never call [storage] directly" as DECISIONS.md #13's signed-GET reads: the
// client calls B2 with a token Express minted, never with its own
// credentials, and can't get one without Express's say-so first — here it's
// just a presigned PUT instead of a GET.
//
// This route only mints the URL; it does not touch the lessons row. The
// caller uploads the bytes, then PATCHes the lesson's storage_path itself
// (the existing PATCH /lessons/:id route) once the upload succeeds — so a
// failed or abandoned upload never leaves a lesson pointing at a
// half-written object.
lessonVideoRouter.post(
  "/lessons/:id/video-upload-url",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = requestUploadUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data: lesson, error: lessonError } = await supabaseAdmin
      .from("lessons")
      .select("id, content_type")
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
    if (lesson.content_type !== "video") {
      res.status(400).json({ error: "Lesson content_type is not 'video'" });
      return;
    }

    let uploadUrl: string;
    let key: string;
    try {
      key = `${req.params.id}/${Date.now()}-${parsed.data.filename}`;
      uploadUrl = await getSignedUrl(
        getB2Client(),
        new PutObjectCommand({
          Bucket: getB2BucketName(),
          Key: key,
          ContentType: parsed.data.content_type,
          ContentLength: parsed.data.size_bytes,
        }),
        { expiresIn: UPLOAD_URL_TTL_SECONDS },
      );
    } catch (err) {
      // Most likely cause in a fresh environment: B2_* env vars unset — a
      // deployment/config problem, not a bad request, same reasoning as
      // chatbot.ts's 503 on a missing GEMINI_API_KEY.
      res.status(503).json({ error: `Video storage unavailable: ${(err as Error).message}` });
      return;
    }

    res.json({ upload_url: uploadUrl, key, expires_in: UPLOAD_URL_TTL_SECONDS });
  },
);

// Mirrors lessonContent.ts's GET /lessons/:id/content-url, against B2
// instead of Supabase Storage, and only for content_type='video' lessons
// where storage_path is set (a lesson can carry a YouTube video_id instead —
// see DECISIONS.md #20 — in which case there is no B2 object to sign, and
// this returns url: null so the client falls back to the YouTube embed).
lessonVideoRouter.get("/lessons/:id/video-url", requireAuth, async (req, res) => {
  const { data: lesson, error: lessonError } = await req
    .supabase!.from("lessons")
    .select("content_type, storage_path")
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
  if (lesson.content_type !== "video" || !lesson.storage_path) {
    res.json({ url: null });
    return;
  }

  try {
    const url = await getSignedUrl(
      getB2Client(),
      new GetObjectCommand({ Bucket: getB2BucketName(), Key: lesson.storage_path }),
      { expiresIn: PLAYBACK_URL_TTL_SECONDS },
    );
    res.json({ url, expires_in: PLAYBACK_URL_TTL_SECONDS });
  } catch (err) {
    res.status(503).json({ error: `Video storage unavailable: ${(err as Error).message}` });
  }
});
