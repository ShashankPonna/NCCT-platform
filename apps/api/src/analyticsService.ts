import {
  DROPOUT_RISK_HIGH_THRESHOLD,
  DROPOUT_RISK_LEVELS,
  DROPOUT_RISK_LOW_ATTENDANCE,
  DROPOUT_RISK_LOW_COMPLETION,
  DROPOUT_RISK_MEDIUM_THRESHOLD,
  DROPOUT_RISK_STALE_DAYS,
  JOB_INTEREST_STATUSES,
  PROGRAMME_MODES,
} from "@ncct/constants";
import type {
  DashboardAnalytics,
  DropoutRiskFlag,
  DropoutRiskLevel,
  JobInterestStatus,
  ProgrammeMode,
} from "@ncct/shared-types";
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
  nominated_at: string;
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

interface ProfileRow {
  id: string;
  full_name: string | null;
}

interface CourseRow {
  id: string;
  programme_id: string;
}

interface ModuleRow {
  id: string;
  course_id: string;
}

interface LessonRow {
  id: string;
  module_id: string;
}

interface LessonProgressRow {
  trainee_id: string;
  lesson_id: string;
  completed_at: string | null;
  updated_at: string;
}

interface TimetableSessionRow {
  id: string;
  programme_id: string;
  starts_at: string;
}

interface AttendanceRecordRow {
  session_id: string;
  trainee_id: string;
  recorded_at: string;
}

interface AssessmentRow {
  id: string;
  module_id: string;
}

interface AssessmentAttemptRow {
  assessment_id: string;
  trainee_id: string;
  passed: boolean;
  submitted_at: string;
}

// Only the top N highest-risk trainees are returned in `flagged` — this is
// an admin-facing intervention list, not a full export, and an unbounded
// list would grow linearly with every nomination ever made.
const MAX_FLAGGED = 20;

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // "YYYY-MM"
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 1000;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const [
    programmesResult,
    nominationsResult,
    institutionsResult,
    certificatesResult,
    jobsResult,
    interestsResult,
    profilesResult,
    coursesResult,
    modulesResult,
    lessonsResult,
    lessonProgressResult,
    timetableSessionsResult,
    attendanceRecordsResult,
    assessmentsResult,
    assessmentAttemptsResult,
  ] = await Promise.all([
    supabaseAdmin.from("programmes").select("id, title, mode"),
    supabaseAdmin
      .from("nominations")
      .select("programme_id, trainee_id, status, nominated_at, programmes(title, institution_id)"),
    supabaseAdmin.from("institutions").select("id, location"),
    supabaseAdmin.from("certificates").select("programme_id, issued_at"),
    supabaseAdmin.from("jobs").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("job_interests").select("status"),
    supabaseAdmin.from("profiles").select("id, full_name"),
    supabaseAdmin.from("courses").select("id, programme_id"),
    supabaseAdmin.from("modules").select("id, course_id"),
    supabaseAdmin.from("lessons").select("id, module_id"),
    supabaseAdmin.from("lesson_progress").select("trainee_id, lesson_id, completed_at, updated_at"),
    supabaseAdmin.from("timetable_sessions").select("id, programme_id, starts_at"),
    supabaseAdmin.from("attendance_records").select("session_id, trainee_id, recorded_at"),
    supabaseAdmin.from("assessments").select("id, module_id"),
    supabaseAdmin.from("assessment_attempts").select("assessment_id, trainee_id, passed, submitted_at"),
  ]);

  for (const [name, result] of [
    ["programmes", programmesResult],
    ["nominations", nominationsResult],
    ["institutions", institutionsResult],
    ["certificates", certificatesResult],
    ["jobs", jobsResult],
    ["job_interests", interestsResult],
    ["profiles", profilesResult],
    ["courses", coursesResult],
    ["modules", modulesResult],
    ["lessons", lessonsResult],
    ["lesson_progress", lessonProgressResult],
    ["timetable_sessions", timetableSessionsResult],
    ["attendance_records", attendanceRecordsResult],
    ["assessments", assessmentsResult],
    ["assessment_attempts", assessmentAttemptsResult],
  ] as const) {
    if (result.error) throw new Error(`Analytics query failed (${name}): ${result.error.message}`);
  }

  const programmes = programmesResult.data ?? [];
  const nominations = (nominationsResult.data ?? []) as unknown as NominationRow[];
  const institutions = (institutionsResult.data ?? []) as InstitutionRow[];
  const certificates = (certificatesResult.data ?? []) as CertificateRow[];
  const interests = (interestsResult.data ?? []) as JobInterestRow[];
  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const courses = (coursesResult.data ?? []) as CourseRow[];
  const modules = (modulesResult.data ?? []) as ModuleRow[];
  const lessons = (lessonsResult.data ?? []) as LessonRow[];
  const lessonProgressRows = (lessonProgressResult.data ?? []) as LessonProgressRow[];
  const timetableSessions = (timetableSessionsResult.data ?? []) as TimetableSessionRow[];
  const attendanceRecords = (attendanceRecordsResult.data ?? []) as AttendanceRecordRow[];
  const assessments = (assessmentsResult.data ?? []) as AssessmentRow[];
  const assessmentAttempts = (assessmentAttemptsResult.data ?? []) as AssessmentAttemptRow[];

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

  // --- dropoutRisk ---
  // P6 (DECISIONS.md #29). A heuristic risk *flag* per (trainee, approved
  // programme) pair, from three signals this schema already has: how much
  // of the programme's content they've completed, how many of its
  // timetable sessions (so far) they attended, and how long since any
  // activity at all. No trained model, no historical dropout data to
  // train one against — see the module-level constants' comments.
  const traineeName = new Map(profiles.map((p) => [p.id, p.full_name]));

  // programme_id chains: courses -> modules -> lessons, and courses ->
  // modules -> assessments, both needed to attribute a lesson/assessment
  // back to the programme it belongs to.
  const courseProgramme = new Map(courses.map((c) => [c.id, c.programme_id]));
  const moduleCourse = new Map(modules.map((m) => [m.id, m.course_id]));
  const moduleProgramme = new Map<string, string>();
  for (const m of modules) {
    const programmeId = courseProgramme.get(m.course_id);
    if (programmeId) moduleProgramme.set(m.id, programmeId);
  }
  const lessonProgramme = new Map<string, string>();
  for (const lesson of lessons) {
    const courseId = moduleCourse.get(lesson.module_id);
    const programmeId = courseId ? courseProgramme.get(courseId) : undefined;
    if (programmeId) lessonProgramme.set(lesson.id, programmeId);
  }
  const programmeLessonIds = new Map<string, Set<string>>();
  for (const [lessonId, programmeId] of lessonProgramme) {
    const set = programmeLessonIds.get(programmeId) ?? new Set<string>();
    set.add(lessonId);
    programmeLessonIds.set(programmeId, set);
  }
  const assessmentProgramme = new Map<string, string>();
  for (const a of assessments) {
    const programmeId = moduleProgramme.get(a.module_id);
    if (programmeId) assessmentProgramme.set(a.id, programmeId);
  }

  const now = new Date();
  const pastOrOngoingSessions = timetableSessions.filter((s) => new Date(s.starts_at) <= now);
  const sessionsByProgramme = new Map<string, string[]>();
  for (const session of pastOrOngoingSessions) {
    const list = sessionsByProgramme.get(session.programme_id) ?? [];
    list.push(session.id);
    sessionsByProgramme.set(session.programme_id, list);
  }

  const flagged: DropoutRiskFlag[] = [];
  const levelCounts = new Map<DropoutRiskLevel, number>();

  for (const nomination of nominations) {
    if (nomination.status !== "approved") continue;
    const { trainee_id: traineeId, programme_id: programmeId } = nomination;

    const lessonIds = programmeLessonIds.get(programmeId);
    let completionRate: number | null = null;
    let lastLessonActivity: string | null = null;
    if (lessonIds && lessonIds.size > 0) {
      let completedCount = 0;
      for (const row of lessonProgressRows) {
        if (row.trainee_id !== traineeId || !lessonIds.has(row.lesson_id)) continue;
        if (row.completed_at) completedCount += 1;
        if (!lastLessonActivity || row.updated_at > lastLessonActivity) lastLessonActivity = row.updated_at;
      }
      completionRate = rate(completedCount, lessonIds.size);
    }

    const sessionIds = sessionsByProgramme.get(programmeId);
    let attendanceRate: number | null = null;
    let lastAttendanceActivity: string | null = null;
    if (sessionIds && sessionIds.length > 0) {
      const sessionIdSet = new Set(sessionIds);
      let attendedCount = 0;
      for (const record of attendanceRecords) {
        if (record.trainee_id !== traineeId || !sessionIdSet.has(record.session_id)) continue;
        attendedCount += 1;
        if (!lastAttendanceActivity || record.recorded_at > lastAttendanceActivity) {
          lastAttendanceActivity = record.recorded_at;
        }
      }
      attendanceRate = rate(attendedCount, sessionIds.length);
    }

    const failedAttempts = assessmentAttempts.filter(
      (a) => a.trainee_id === traineeId && !a.passed && assessmentProgramme.get(a.assessment_id) === programmeId,
    ).length;

    // "Last activity" starts from nomination date itself if nothing else
    // has happened yet — a freshly-nominated trainee isn't stale on day 1.
    const lastActivityIso = [lastLessonActivity, lastAttendanceActivity]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1);
    const daysSinceLastActivity = daysBetween(new Date(lastActivityIso ?? nomination.nominated_at), now);

    let riskScore = 0;
    if (completionRate !== null && completionRate < DROPOUT_RISK_LOW_COMPLETION) riskScore += 40;
    if (attendanceRate !== null && attendanceRate < DROPOUT_RISK_LOW_ATTENDANCE) riskScore += 30;
    if (daysSinceLastActivity > DROPOUT_RISK_STALE_DAYS) riskScore += 20;
    riskScore += Math.min(failedAttempts, 3) * 10;

    const riskLevel: DropoutRiskLevel =
      riskScore >= DROPOUT_RISK_HIGH_THRESHOLD ? "high" : riskScore >= DROPOUT_RISK_MEDIUM_THRESHOLD ? "medium" : "low";
    levelCounts.set(riskLevel, (levelCounts.get(riskLevel) ?? 0) + 1);

    if (riskLevel !== "low") {
      flagged.push({
        traineeId,
        traineeName: traineeName.get(traineeId) ?? null,
        programmeId,
        programmeTitle: nomination.programmes?.title ?? "Untitled",
        completionRate,
        attendanceRate,
        daysSinceLastActivity,
        failedAttempts,
        riskScore,
        riskLevel,
      });
    }
  }

  const dropoutRisk = {
    byLevel: DROPOUT_RISK_LEVELS.map((level) => ({ level, count: levelCounts.get(level) ?? 0 })),
    flagged: flagged.sort((a, b) => b.riskScore - a.riskScore).slice(0, MAX_FLAGGED),
  };

  return { programmesRun, traineesByRegion, completionRates, certificatesIssued, placements, dropoutRisk };
}
