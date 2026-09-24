import type { Skill } from "@ncct/shared-types";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isMissingCourseSkillsTable } from "../skillGapService.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const employerSearchRouter = Router();

interface CertRow {
  trainee_id: string;
  certificate_code: string;
  issued_at: string;
  programme_id: string;
  course_id: string | null;
  programmes: { title: string } | null;
  institutions: { name: string; location: string | null } | null;
}

interface SkillJoinRow {
  skill_id: string;
  skills: Skill | null;
}

// PRD §6.6: "trainee search/filter by skill/certification/location" — read
// as the employer searching trainee profiles (matches the PRD §5 user story
// "As an Employer, I can search trainee profiles by skill/certification/
// location"), not trainees searching jobs. Unified with the F11 skills
// taxonomy (docs/DECISIONS.md #45, resolving the gap docs/DATABASE.md had
// flagged): `skill_id` is an exact match against a trainee's real acquired
// skills (same union-of-programme-and-course acquisition rule
// skillGapService.getAcquiredSkills uses), and free-text `q` now matches
// against those same acquired skill names *in addition to* the original
// programme-title match — kept, not replaced, since not every certified
// programme is taxonomy-tagged yet, and dropping the text match would
// silently lose real results for those.
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
      .select(
        "trainee_id, certificate_code, issued_at, programme_id, course_id, programmes(title), institutions(name, location)",
      )
      .in("trainee_id", traineeIds);
    if (certificatesError) {
      res.status(400).json({ error: certificatesError.message });
      return;
    }
    const certRows = (certificates ?? []) as unknown as CertRow[];

    // Same union-of-programme-and-course acquisition rule as
    // skillGapService.getAcquiredSkills, applied across every visible
    // trainee at once rather than one at a time.
    const programmeIds = [...new Set(certRows.map((c) => c.programme_id))];
    const courseIds = [...new Set(certRows.map((c) => c.course_id).filter((id): id is string => id != null))];

    const [programmeSkillsResult, courseSkillsResult] = await Promise.all([
      programmeIds.length > 0
        ? supabaseAdmin
            .from("programme_skills")
            .select("programme_id, skill_id, skills(id, name, category)")
            .in("programme_id", programmeIds)
        : Promise.resolve({ data: [], error: null }),
      courseIds.length > 0
        ? supabaseAdmin
            .from("course_skills")
            .select("course_id, skill_id, skills(id, name, category)")
            .in("course_id", courseIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (programmeSkillsResult.error) {
      res.status(400).json({ error: programmeSkillsResult.error.message });
      return;
    }
    // course_skills doesn't exist yet on a project that hasn't applied
    // migration 20260901000017 — every certificate has carried a non-null
    // course_id since #37, so treating this the same as any other query
    // error would break this already-shipped search the moment this code
    // deploys, pre-migration. See skillGapService.ts's identical reasoning.
    if (courseSkillsResult.error && !isMissingCourseSkillsTable(courseSkillsResult.error)) {
      res.status(400).json({ error: courseSkillsResult.error.message });
      return;
    }

    const skillsByProgramme = new Map<string, Skill[]>();
    for (const row of (programmeSkillsResult.data ?? []) as unknown as (SkillJoinRow & {
      programme_id: string;
    })[]) {
      if (!row.skills) continue;
      const list = skillsByProgramme.get(row.programme_id) ?? [];
      list.push(row.skills);
      skillsByProgramme.set(row.programme_id, list);
    }
    const skillsByCourse = new Map<string, Skill[]>();
    for (const row of (courseSkillsResult.error ? [] : (courseSkillsResult.data ?? [])) as unknown as (SkillJoinRow & {
      course_id: string;
    })[]) {
      if (!row.skills) continue;
      const list = skillsByCourse.get(row.course_id) ?? [];
      list.push(row.skills);
      skillsByCourse.set(row.course_id, list);
    }

    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const location =
      typeof req.query.location === "string" ? req.query.location.trim().toLowerCase() : "";
    const skillId = typeof req.query.skill_id === "string" ? req.query.skill_id.trim() : "";

    const certsByTrainee = new Map<string, CertRow[]>();
    const skillsByTrainee = new Map<string, Map<string, Skill>>();
    for (const cert of certRows) {
      const acquiredHere = [
        ...(skillsByProgramme.get(cert.programme_id) ?? []),
        ...(cert.course_id ? (skillsByCourse.get(cert.course_id) ?? []) : []),
      ];
      const skillMap = skillsByTrainee.get(cert.trainee_id) ?? new Map<string, Skill>();
      for (const skill of acquiredHere) skillMap.set(skill.id, skill);
      skillsByTrainee.set(cert.trainee_id, skillMap);

      const matchesQ =
        !q ||
        Boolean(cert.programmes?.title.toLowerCase().includes(q)) ||
        acquiredHere.some((skill) => skill.name.toLowerCase().includes(q));
      const matchesLocation =
        !location || Boolean(cert.institutions?.location?.toLowerCase().includes(location));
      if (!matchesQ || !matchesLocation) continue;
      const list = certsByTrainee.get(cert.trainee_id) ?? [];
      list.push(cert);
      certsByTrainee.set(cert.trainee_id, list);
    }

    const textFiltering = Boolean(q || location);
    const results = (profiles ?? [])
      .filter((profile) => {
        const matchesSkillFilter = !skillId || (skillsByTrainee.get(profile.id)?.has(skillId) ?? false);
        const matchesTextFilter = !textFiltering || certsByTrainee.has(profile.id);
        return matchesSkillFilter && matchesTextFilter;
      })
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
        skills: [...(skillsByTrainee.get(profile.id)?.values() ?? [])],
      }));

    res.json(results);
  },
);
