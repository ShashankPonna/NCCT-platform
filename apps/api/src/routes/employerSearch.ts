import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const employerSearchRouter = Router();

interface CertRow {
  trainee_id: string;
  certificate_code: string;
  issued_at: string;
  programmes: { title: string } | null;
  institutions: { name: string; location: string | null } | null;
}

// PRD §6.6: "trainee search/filter by skill/certification/location" — read
// as the employer searching trainee profiles (matches the PRD §5 user story
// "As an Employer, I can search trainee profiles by skill/certification/
// location"), not trainees searching jobs. There is no dedicated skills
// taxonomy anywhere in the schema (docs/DATABASE.md's Open Items) — "skill"
// and "certification" are treated as the same thing here: a keyword match
// against the programme/institution names behind a trainee's earned
// certificates. This is the one data source that legitimately exists for
// "what is this trainee credentialed in," not an invented field.
employerSearchRouter.get(
  "/employer/trainees",
  requireAuth,
  requireRole("employer"),
  async (req, res) => {
    const { data: visible, error: visibilityError } = await supabaseAdmin
      .from("visibility_settings")
      .select("trainee_id")
      .eq("visible_to_employers", true);
    if (visibilityError) {
      res.status(400).json({ error: visibilityError.message });
      return;
    }
    const traineeIds = (visible ?? []).map((row) => row.trainee_id as string);
    if (traineeIds.length === 0) {
      res.json([]);
      return;
    }

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", traineeIds);
    if (profilesError) {
      res.status(400).json({ error: profilesError.message });
      return;
    }

    const { data: certificates, error: certificatesError } = await supabaseAdmin
      .from("certificates")
      .select("trainee_id, certificate_code, issued_at, programmes(title), institutions(name, location)")
      .in("trainee_id", traineeIds);
    if (certificatesError) {
      res.status(400).json({ error: certificatesError.message });
      return;
    }

    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const location =
      typeof req.query.location === "string" ? req.query.location.trim().toLowerCase() : "";

    const certsByTrainee = new Map<string, CertRow[]>();
    for (const cert of (certificates ?? []) as unknown as CertRow[]) {
      const matchesQ = !q || Boolean(cert.programmes?.title.toLowerCase().includes(q));
      const matchesLocation =
        !location || Boolean(cert.institutions?.location?.toLowerCase().includes(location));
      if (!matchesQ || !matchesLocation) continue;
      const list = certsByTrainee.get(cert.trainee_id) ?? [];
      list.push(cert);
      certsByTrainee.set(cert.trainee_id, list);
    }

    const filtering = Boolean(q || location);
    const results = (profiles ?? [])
      .filter((profile) => !filtering || certsByTrainee.has(profile.id))
      .map((profile) => ({
        trainee_id: profile.id,
        full_name: profile.full_name,
        certificates: (certsByTrainee.get(profile.id) ?? []).map((cert) => ({
          certificate_code: cert.certificate_code,
          programme_title: cert.programmes?.title ?? null,
          institution_name: cert.institutions?.name ?? null,
          institution_location: cert.institutions?.location ?? null,
          issued_at: cert.issued_at,
        })),
      }));

    res.json(results);
  },
);
