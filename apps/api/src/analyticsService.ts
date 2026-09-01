import { JOB_INTEREST_STATUSES, PROGRAMME_MODES } from "@ncct/constants";
import type { DashboardAnalytics, JobInterestStatus, ProgrammeMode } from "@ncct/shared-types";
import { supabaseAdmin } from "./supabaseClient.js";

// F8 has no table of its own (docs/IMPLEMENTATION.md) — every dimension here
// is computed at request time from F2/F3/F4/F6's own tables. Grouping is
// done in Node after a plain PostgREST select, the same pattern
// employerSearch.ts already established, rather than a SQL RPC: this repo's
// data volumes are prototype-scale (docs/PRD.md §7 leaves performance
// targets `TBD`), and Node grouping keeps every aggregation right next to
// its own comment instead of hidden in a migration.

interface NominationRow {
  programme_id: string;
  trainee_id: string;
  status: string;
  programmes: { title: string; institution_id: string } | null;
}

interface InstitutionRow {
  id: string;
  location: string | null;
}

interface CertificateRow {
  programme_id: string;
  issued_at: string;
}

interface JobInterestRow {
  status: string;
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // "YYYY-MM"
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 1000;
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const [programmesResult, nominationsResult, institutionsResult, certificatesResult, jobsResult, interestsResult] =
    await Promise.all([
      supabaseAdmin.from("programmes").select("id, title, mode"),
      supabaseAdmin
        .from("nominations")
        .select("programme_id, trainee_id, status, programmes(title, institution_id)"),
      supabaseAdmin.from("institutions").select("id, location"),
      supabaseAdmin.from("certificates").select("programme_id, issued_at"),
      supabaseAdmin.from("jobs").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("job_interests").select("status"),
    ]);

  for (const [name, result] of [
    ["programmes", programmesResult],
    ["nominations", nominationsResult],
    ["institutions", institutionsResult],
    ["certificates", certificatesResult],
    ["jobs", jobsResult],
    ["job_interests", interestsResult],
  ] as const) {
    if (result.error) throw new Error(`Analytics query failed (${name}): ${result.error.message}`);
  }

  const programmes = programmesResult.data ?? [];
  const nominations = (nominationsResult.data ?? []) as unknown as NominationRow[];
  const institutions = (institutionsResult.data ?? []) as InstitutionRow[];
  const certificates = (certificatesResult.data ?? []) as CertificateRow[];
  const interests = (interestsResult.data ?? []) as JobInterestRow[];

  // --- programmesRun ---
  const modeCounts = new Map<ProgrammeMode, number>();
  for (const programme of programmes) {
    const mode = programme.mode as ProgrammeMode;
    modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
  }
  const programmesRun = {
    total: programmes.length,
    // Every mode is listed even at zero, so a chart never silently drops a
    // category just because nothing has happened in it yet.
    byMode: PROGRAMME_MODES.map((mode) => ({ mode, count: modeCounts.get(mode) ?? 0 })),
  };

  // --- traineesByRegion ---
  // "Region" has no dedicated field on a trainee (docs/DATABASE.md's Open
  // Items) — the same judgment call F6's employer search already made:
  // derive it from the institution running the programme a trainee is
  // nominated to. Counts every nomination regardless of approval status,
  // since this dimension is about geographic reach, not completion — a
  // trainee nominated at institutions in two regions is counted in both.
  const institutionLocation = new Map(institutions.map((inst) => [inst.id, inst.location ?? "Unknown"]));
  const traineesByRegionSets = new Map<string, Set<string>>();
  for (const nomination of nominations) {
    const institutionId = nomination.programmes?.institution_id;
    const region = institutionId ? (institutionLocation.get(institutionId) ?? "Unknown") : "Unknown";
    const set = traineesByRegionSets.get(region) ?? new Set<string>();
    set.add(nomination.trainee_id);
    traineesByRegionSets.set(region, set);
  }
  const traineesByRegion = [...traineesByRegionSets.entries()]
    .map(([region, trainees]) => ({ region, traineeCount: trainees.size }))
    .sort((a, b) => b.traineeCount - a.traineeCount);

  // --- completionRates ---
  // "Completion" has no first-class concept either (no programme-level
  // completion flag exists — only per-lesson progress and per-assessment
  // certificates). Read as: of the trainees actually admitted to a
  // programme (approved nominations), how many have since earned a
  // certificate issued under it. Certificates are matched by
  // `certificates.programme_id`, not by cross-referencing the trainee, so
  // this is "programme produced N certificates per M admitted trainees,"
  // not "these specific M trainees completed" — the two coincide unless a
  // trainee nominated to programme A somehow earns a certificate whose
  // programme_id is B, which the schema doesn't allow in the first place
  // (certificateService derives programme_id from the assessment itself).
  const approvedByProgramme = new Map<string, number>();
  // Seeded from `programmes` directly, not from nominations — a programme
  // can have certificates (and therefore needs a row in this table) despite
  // having zero nomination rows at all, e.g. every attempt so far happened
  // without going through nomination approval. Deriving titles only from
  // nominations left those programmes labeled "Untitled" even though their
  // real title was one query away; caught live against real data, not by
  // any of the mocked tests, since the test fixtures always included a
  // nomination for every programme they referenced.
  const programmeTitleById = new Map(programmes.map((p) => [p.id, p.title]));
  for (const nomination of nominations) {
    if (!programmeTitleById.has(nomination.programme_id)) {
      programmeTitleById.set(nomination.programme_id, nomination.programmes?.title ?? "Untitled");
    }
    if (nomination.status !== "approved") continue;
    approvedByProgramme.set(
      nomination.programme_id,
      (approvedByProgramme.get(nomination.programme_id) ?? 0) + 1,
    );
  }
  const certificatesByProgramme = new Map<string, number>();
  for (const cert of certificates) {
    certificatesByProgramme.set(
      cert.programme_id,
      (certificatesByProgramme.get(cert.programme_id) ?? 0) + 1,
    );
  }
  const programmeIdsWithActivity = new Set([
    ...approvedByProgramme.keys(),
    ...certificatesByProgramme.keys(),
  ]);
  const byProgramme = [...programmeIdsWithActivity]
    .map((programmeId) => {
      const approvedNominations = approvedByProgramme.get(programmeId) ?? 0;
      const certificatesIssuedCount = certificatesByProgramme.get(programmeId) ?? 0;
      return {
        programmeId,
        programmeTitle: programmeTitleById.get(programmeId) ?? "Untitled",
        approvedNominations,
        certificatesIssued: certificatesIssuedCount,
        rate: rate(certificatesIssuedCount, approvedNominations),
      };
    })
    .sort((a, b) => b.approvedNominations - a.approvedNominations);
  const totalApproved = [...approvedByProgramme.values()].reduce((sum, n) => sum + n, 0);
  const completionRates = {
    overall: {
      approvedNominations: totalApproved,
      certificatesIssued: certificates.length,
      rate: rate(certificates.length, totalApproved),
    },
    byProgramme,
  };

  // --- certificatesIssued ---
  const monthCounts = new Map<string, number>();
  for (const cert of certificates) {
    const key = monthKey(cert.issued_at);
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }
  const certificatesIssued = {
    total: certificates.length,
    byMonth: [...monthCounts.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };

  // --- placements ---
  const statusCounts = new Map<JobInterestStatus, number>();
  for (const interest of interests) {
    const status = interest.status as JobInterestStatus;
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }
  const placements = {
    totalJobs: jobsResult.count ?? 0,
    byStatus: JOB_INTEREST_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
  };

  return { programmesRun, traineesByRegion, completionRates, certificatesIssued, placements };
}
