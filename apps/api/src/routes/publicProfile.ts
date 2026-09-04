import { bindNfcTagSchema } from "@ncct/validation";
import { Router } from "express";
import type { PublicProfileResult } from "@ncct/shared-types";
import { generateCode } from "../codeGenerator.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const publicProfileRouter = Router();

const UNIQUE_VIOLATION = "23505";

// 16 chars (vs. certificates' 8) because this code is never hand-transcribed
// — it only ever travels inside an NFC-written URL — so it can afford to be
// long enough that guessing one is computationally infeasible even without
// rate limiting. See docs/DECISIONS.md #30.
function generatePublicProfileCode(): string {
  return `NCCT-${generateCode(16)}`;
}

interface CertRow {
  certificate_code: string;
  issued_at: string;
  programmes: { title: string } | null;
  institutions: { name: string } | null;
}

// Shared by the public route and the kiosk route — same underlying lookup,
// different auth gate. Skills are derived from programme titles, not a
// dedicated taxonomy (matches employerSearch.ts's reasoning — see its
// comment for why "skill" and "certification" are treated as the same
// thing here).
async function buildProfileResult(
  traineeId: string,
  fullName: string,
): Promise<PublicProfileResult> {
  const { data: certificates, error } = await supabaseAdmin
    .from("certificates")
    .select("certificate_code, issued_at, programmes(title), institutions(name)")
    .eq("trainee_id", traineeId)
    .order("issued_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (certificates ?? []) as unknown as CertRow[];
  const skills = [
    ...new Set(rows.map((row) => row.programmes?.title).filter((t): t is string => Boolean(t))),
  ];

  return {
    full_name: fullName,
    certificates: rows.map((row) => ({
      certificate_code: row.certificate_code,
      programme_title: row.programmes?.title ?? null,
      institution_name: row.institutions?.name ?? null,
      issued_at: row.issued_at,
    })),
    skills,
  };
}

// Deliberately one of only two unauthenticated routes in the whole API
// (certificates.ts's GET /certificates/:code is the other) — PRD-adjacent
// requirement per docs/DECISIONS.md #6/#30: tap an NFC card with any phone,
// no app, no login. Opted-out and unknown codes both 404 identically so
// neither response leaks which codes are real.
publicProfileRouter.get("/public-profiles/:code", async (req, res) => {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .eq("public_profile_code", req.params.code)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  // Two explicit queries rather than an embed: visibility_settings has no
  // row at all until a trainee first touches either consent toggle (same
  // "no row yet" case visibilitySettings.ts's own GET route documents), so
  // this has to tolerate a missing row exactly like that route does.
  const { data: visibility, error: visibilityError } = await supabaseAdmin
    .from("visibility_settings")
    .select("public_profile_enabled")
    .eq("trainee_id", profile.id)
    .maybeSingle();

  if (visibilityError) {
    res.status(400).json({ error: visibilityError.message });
    return;
  }
  if (!visibility?.public_profile_enabled) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  try {
    res.json(await buildProfileResult(profile.id, profile.full_name));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Trainee mints or rotates their own code. Rotating is the revocation lever
// for a lost card: the old URL 404s the instant this runs, with no need to
// touch the physical object. Own-row only — the id always comes from
// req.user, matching how nominations.ts/assessmentAttempts.ts scope writes.
publicProfileRouter.post(
  "/profiles/me/card",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    let code = generatePublicProfileCode();

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({ public_profile_code: code })
        .eq("id", req.user!.id)
        .select("public_profile_code")
        .single();

      if (!error) {
        res.json(data);
        return;
      }
      if (error.code !== UNIQUE_VIOLATION) {
        res.status(400).json({ error: error.message });
        return;
      }
      code = generatePublicProfileCode(); // collision — retry with a fresh code
    }

    res.status(500).json({ error: "Could not generate a unique profile code" });
  },
);

// Staff-only UID → profile lookup for the kiosk terminal (docs/DECISIONS.md
// #21, #30). Deliberately behind auth unlike the route above: a factory UID
// is only 4-7 bytes — far more guessable than the 16-char public code — so
// an unauthenticated version of this route would be a scraping surface for
// the whole trainee register. Does NOT check public_profile_enabled: that
// flag gates the open internet, and staff already see trainee records
// through the admin UI, so gating an internal kiosk on it would be theatre.
publicProfileRouter.get(
  "/kiosk/nfc-lookup/:uid",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const uid = req.params.uid.replace(/[^0-9a-fA-F]/g, "").toUpperCase();

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("nfc_tag_uid", uid)
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!profile) {
      res.status(404).json({ error: "Card not registered to any trainee" });
      return;
    }

    try {
      res.json(await buildProfileResult(profile.id, profile.full_name));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

// Staff binds (or, with a null body, unbinds) a scanned UID to a trainee at
// the issuance desk. Normalises again server-side regardless of what the
// client sends, same defensive re-normalise as the lookup route above.
publicProfileRouter.put(
  "/profiles/:traineeId/nfc-tag",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const parsed = bindNfcTagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const uid = parsed.data.nfc_tag_uid
      ? parsed.data.nfc_tag_uid.replace(/[^0-9a-fA-F]/g, "").toUpperCase()
      : null;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ nfc_tag_uid: uid })
      .eq("id", req.params.traineeId)
      .select("id, full_name, nfc_tag_uid")
      .maybeSingle();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        res.status(409).json({ error: "This card is already bound to another trainee" });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Trainee not found" });
      return;
    }
    res.json(data);
  },
);
