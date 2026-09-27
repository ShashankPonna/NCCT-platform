import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_MIME_TYPES } from "@ncct/constants";
import { updateProfileSchema } from "@ncct/validation";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const profileRouter = Router();

// The identity endpoint the clients' session hooks call: deliberately returns
// only what auth middleware already resolved (id/role/full_name), not the
// whole row, so a session bootstrap stays one cheap lookup.
profileRouter.get("/profile", requireAuth, (req, res) => {
  res.json(req.user);
});

// The full own profile row — everything the edit form needs, including the
// employer org fields (PRD §6.1). Own-row RLS (`profiles_select_own`) makes
// req.supabase sufficient; no ownership check is needed beyond it.
profileRouter.get("/profile/details", requireAuth, async (req, res) => {
  const { data, error } = await req
    .supabase!.from("profiles")
    .select("*")
    .eq("id", req.user!.id)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(data);
});

// Own-row update, backed by the pre-existing `profiles_update_own` policy.
// `role` is not accepted by updateProfileSchema, so a user cannot escalate
// their own privileges here — role changes are an admin operation only.
profileRouter.patch("/profile", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await req
    .supabase!.from("profiles")
    .update(parsed.data)
    .eq("id", req.user!.id)
    .select()
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(data);
});

// Profile photo (DECISIONS.md #77). One object per user at a fixed path in
// the private `profile-photos` bucket, so no profiles column is needed:
// "has a photo" is simply "the object exists". Uploads upsert over it; reads
// are a short-lived signed URL, same pattern as lesson content.
const PHOTO_BUCKET = "profile-photos";
const PHOTO_URL_TTL_SECONDS = 60 * 60;
const photoPath = (userId: string) => `${userId}/avatar`;

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_PHOTO_MAX_BYTES },
}).single("photo");

async function signedPhotoUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(photoPath(userId), PHOTO_URL_TTL_SECONDS);
  if (error) {
    if (/not found/i.test(error.message)) return null;
    throw error;
  }
  return data.signedUrl;
}

profileRouter.get("/profile/photo", requireAuth, async (req, res) => {
  try {
    res.json({ url: await signedPhotoUrl(req.user!.id) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

profileRouter.post("/profile/photo", requireAuth, (req, res) => {
  photoUpload(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      const tooLarge =
        uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE";
      res.status(400).json({
        error: tooLarge ? "Photo must be 2 MB or smaller" : (uploadError as Error).message,
      });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No photo uploaded" });
      return;
    }
    if (
      !PROFILE_PHOTO_MIME_TYPES.includes(
        req.file.mimetype as (typeof PROFILE_PHOTO_MIME_TYPES)[number],
      )
    ) {
      res.status(400).json({ error: "Photo must be a JPEG, PNG or WebP image" });
      return;
    }

    const { error } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .upload(photoPath(req.user!.id), req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    try {
      res.status(201).json({ url: await signedPhotoUrl(req.user!.id) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
});
