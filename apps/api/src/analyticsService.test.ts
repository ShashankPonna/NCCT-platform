import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardAnalytics } from "./analyticsService.js";

const { fromMock, tableData } = vi.hoisted(() => {
  const tableData: Record<string, { data: unknown; count?: number; error: unknown }> = {};

  function builderFor(table: string) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {
      then: vi.fn((resolve: (value: unknown) => void) => {
        const row = tableData[table] ?? { data: null, error: null };
        resolve(row);
      }),
    };
    for (const method of ["select", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    return builder;
  }

  const fromMock = vi.fn((table: string) => builderFor(table));
  return { fromMock, tableData };
});

vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: { from: fromMock } }));

function reset() {
  tableData.programmes = { data: [], error: null };
  tableData.nominations = { data: [], error: null };
  tableData.institutions = { data: [], error: null };
  tableData.certificates = { data: [], error: null };
  tableData.jobs = { data: null, count: 0, error: null };
  tableData.job_interests = { data: [], error: null };
  tableData.profiles = { data: [], error: null };
  tableData.courses = { data: [], error: null };
  tableData.modules = { data: [], error: null };
  tableData.lessons = { data: [], error: null };
  tableData.lesson_progress = { data: [], error: null };
  tableData.timetable_sessions = { data: [], error: null };
  tableData.attendance_records = { data: [], error: null };
  tableData.assessments = { data: [], error: null };
  tableData.assessment_attempts = { data: [], error: null };
  tableData.skills = { data: [], error: null };
  tableData.job_skills = { data: [], error: null };
  tableData.programme_skills = { data: [], error: null };
}

beforeEach(reset);

describe("getDashboardAnalytics", () => {
  it("returns zeroed dimensions (including every programme mode) on an empty database", async () => {
    const result = await getDashboardAnalytics();

    expect(result.programmesRun.total).toBe(0);
    expect(result.programmesRun.byMode).toEqual([
      { mode: "online", count: 0 },
      { mode: "offline", count: 0 },
      { mode: "hybrid", count: 0 },
    ]);
    expect(result.traineesByRegion).toEqual([]);
    expect(result.completionRates.overall).toEqual({
      approvedNominations: 0,
      certificatesIssued: 0,
      rate: 0,
    });
    expect(result.certificatesIssued.total).toBe(0);
    expect(result.placements).toEqual({
      totalJobs: 0,
      byStatus: [
        { status: "shortlisted", count: 0 },
        { status: "viewed", count: 0 },
        { status: "contacted", count: 0 },
      ],
    });
    expect(result.dropoutRisk).toEqual({
      byLevel: [
        { level: "low", count: 0 },
        { level: "medium", count: 0 },
        { level: "high", count: 0 },
      ],
      flagged: [],
    });
    expect(result.skillDemand).toEqual({ topShortages: [] });
  });

  it("propagates a query error with the failing table named", async () => {
    tableData.certificates = { data: null, error: { message: "boom" } };
    await expect(getDashboardAnalytics()).rejects.toThrow(/certificates.*boom/);
  });

  it("counts programmes by mode", async () => {
    tableData.programmes = {
      data: [
        { id: "p1", title: "A", mode: "online" },
        { id: "p2", title: "B", mode: "online" },
        { id: "p3", title: "C", mode: "offline" },
      ],
      error: null,
    };

    const result = await getDashboardAnalytics();

    expect(result.programmesRun.total).toBe(3);
    expect(result.programmesRun.byMode).toContainEqual({ mode: "online", count: 2 });
    expect(result.programmesRun.byMode).toContainEqual({ mode: "offline", count: 1 });
  });

  it("groups trainees by their programme's institution location, counting every nomination status", async () => {
    tableData.institutions = {
      data: [
        { id: "inst-1", location: "Pune" },
        { id: "inst-2", location: null },
      ],
      error: null,
    };
    tableData.nominations = {
      data: [
        {
          programme_id: "p1",
          trainee_id: "t1",
          status: "pending",
          programmes: { title: "A", institution_id: "inst-1" },
        },
        {
          programme_id: "p1",
          trainee_id: "t2",
          status: "approved",
          programmes: { title: "A", institution_id: "inst-1" },
        },
        {
          programme_id: "p2",
          trainee_id: "t3",
          status: "approved",
          programmes: { title: "B", institution_id: "inst-2" },
        },
      ],
      error: null,
    };

    const result = await getDashboardAnalytics();

    expect(result.traineesByRegion).toContainEqual({ region: "Pune", traineeCount: 2 });
    expect(result.traineesByRegion).toContainEqual({ region: "Unknown", traineeCount: 1 });
  });

  it("computes completion rate as certificates issued over approved nominations, per programme and overall", async () => {
    tableData.nominations = {
      data: [
        { programme_id: "p1", trainee_id: "t1", status: "approved", programmes: { title: "Dairy", institution_id: "i1" } },
        { programme_id: "p1", trainee_id: "t2", status: "approved", programmes: { title: "Dairy", institution_id: "i1" } },
        { programme_id: "p1", trainee_id: "t3", status: "rejected", programmes: { title: "Dairy", institution_id: "i1" } },
      ],
      error: null,
    };
    tableData.certificates = {
      data: [{ programme_id: "p1", issued_at: "2026-06-01T00:00:00Z" }],
      error: null,
    };

    const result = await getDashboardAnalytics();

    expect(result.completionRates.byProgramme).toEqual([
      {
        programmeId: "p1",
        programmeTitle: "Dairy",
        approvedNominations: 2,
        certificatesIssued: 1,
        rate: 0.5,
      },
    ]);
    expect(result.completionRates.overall).toEqual({
      approvedNominations: 2,
      certificatesIssued: 1,
      rate: 0.5,
    });
  });

  it("does not divide by zero when a programme has certificates but no approved nominations", async () => {
    tableData.certificates = {
      data: [{ programme_id: "p1", issued_at: "2026-06-01T00:00:00Z" }],
      error: null,
    };

    const result = await getDashboardAnalytics();

    expect(result.completionRates.byProgramme[0]).toMatchObject({
      programmeId: "p1",
      approvedNominations: 0,
      certificatesIssued: 1,
      rate: 0,
    });
  });

  it("labels a programme by its real title even with zero nomination rows at all (caught live against real data)", async () => {
    // Every attempt happened without ever going through nomination
    // approval — this genuinely occurred in the live project.
    tableData.programmes = { data: [{ id: "p1", title: "Dairy Cooperative Management", mode: "offline" }], error: null };
    tableData.nominations = { data: [], error: null };
    tableData.certificates = {
      data: [{ programme_id: "p1", issued_at: "2026-06-01T00:00:00Z" }],
      error: null,
    };

    const result = await getDashboardAnalytics();

    expect(result.completionRates.byProgramme[0]).toMatchObject({
      programmeId: "p1",
      programmeTitle: "Dairy Cooperative Management",
    });
  });

  it("buckets certificates issued by calendar month", async () => {
    tableData.certificates = {
      data: [
        { programme_id: "p1", issued_at: "2026-06-15T10:00:00Z" },
        { programme_id: "p1", issued_at: "2026-06-20T10:00:00Z" },
        { programme_id: "p1", issued_at: "2026-07-01T10:00:00Z" },
      ],
      error: null,
    };

    const result = await getDashboardAnalytics();

    expect(result.certificatesIssued.total).toBe(3);
    expect(result.certificatesIssued.byMonth).toEqual([
      { month: "2026-06", count: 2 },
      { month: "2026-07", count: 1 },
    ]);
  });

  it("reports the job-interest funnel by status alongside the total job count", async () => {
    tableData.jobs = { data: null, count: 4, error: null };
    tableData.job_interests = {
      data: [{ status: "shortlisted" }, { status: "shortlisted" }, { status: "contacted" }],
      error: null,
    };

    const result = await getDashboardAnalytics();

    expect(result.placements.totalJobs).toBe(4);
    expect(result.placements.byStatus).toEqual([
      { status: "shortlisted", count: 2 },
      { status: "viewed", count: 0 },
      { status: "contacted", count: 1 },
    ]);
  });

  describe("dropoutRisk", () => {
    const NOW_ISO = new Date().toISOString();

    function approvedNomination(overrides: Record<string, unknown> = {}) {
      return {
        programme_id: "p1",
        trainee_id: "t1",
        status: "approved",
        nominated_at: NOW_ISO,
        programmes: { title: "Dairy", institution_id: "i1" },
        ...overrides,
      };
    }

    it("ignores nominations that were never approved", async () => {
      tableData.nominations = { data: [approvedNomination({ status: "pending" })], error: null };
      const result = await getDashboardAnalytics();
      expect(result.dropoutRisk.flagged).toEqual([]);
      expect(result.dropoutRisk.byLevel).toEqual([
        { level: "low", count: 0 },
        { level: "medium", count: 0 },
        { level: "high", count: 0 },
      ]);
    });

    it("flags low lesson completion (no progress at all on an authored programme)", async () => {
      tableData.nominations = { data: [approvedNomination()], error: null };
      tableData.courses = { data: [{ id: "c1", programme_id: "p1" }], error: null };
      tableData.modules = { data: [{ id: "m1", course_id: "c1" }], error: null };
      tableData.lessons = { data: [{ id: "l1", module_id: "m1" }], error: null };
      // No lesson_progress row for t1 at all — 0/1 lessons completed.

      const result = await getDashboardAnalytics();

      expect(result.dropoutRisk.flagged).toEqual([
        expect.objectContaining({ traineeId: "t1", completionRate: 0, riskLevel: "medium", riskScore: 40 }),
      ]);
    });

    it("does not penalize completion when the programme has no lessons authored yet", async () => {
      tableData.nominations = { data: [approvedNomination()], error: null };
      const result = await getDashboardAnalytics();
      expect(result.dropoutRisk.flagged).toEqual([]);
      expect(result.dropoutRisk.byLevel).toContainEqual({ level: "low", count: 1 });
    });

    it("flags low session attendance", async () => {
      tableData.nominations = { data: [approvedNomination()], error: null };
      tableData.timetable_sessions = {
        data: [
          { id: "s1", programme_id: "p1", starts_at: "2020-01-01T00:00:00Z" },
          { id: "s2", programme_id: "p1", starts_at: "2020-01-02T00:00:00Z" },
        ],
        error: null,
      };
      // t1 attended neither session — 0/2.

      const result = await getDashboardAnalytics();

      expect(result.dropoutRisk.flagged).toEqual([
        expect.objectContaining({ traineeId: "t1", attendanceRate: 0, riskLevel: "medium", riskScore: 30 }),
      ]);
    });

    it("only counts attendance/failed-attempts against the trainee's own programme", async () => {
      tableData.nominations = { data: [approvedNomination()], error: null };
      tableData.timetable_sessions = {
        data: [{ id: "s1", programme_id: "p1", starts_at: "2020-01-01T00:00:00Z" }],
        error: null,
      };
      tableData.attendance_records = {
        // Someone else's attendance at t1's session, and t1 attending a
        // session under a *different* programme — neither should count.
        data: [
          { session_id: "s1", trainee_id: "someone-else", recorded_at: "2020-01-01T01:00:00Z" },
          { session_id: "s-other-programme", trainee_id: "t1", recorded_at: "2020-01-01T01:00:00Z" },
        ],
        error: null,
      };

      const result = await getDashboardAnalytics();

      expect(result.dropoutRisk.flagged[0]).toMatchObject({ attendanceRate: 0 });
    });

    it("adds points for failed assessment attempts under the trainee's programme, capped at 3", async () => {
      tableData.nominations = { data: [approvedNomination()], error: null };
      tableData.courses = { data: [{ id: "c1", programme_id: "p1" }], error: null };
      tableData.modules = { data: [{ id: "m1", course_id: "c1" }], error: null };
      tableData.assessments = { data: [{ id: "a1", module_id: "m1" }], error: null };
      tableData.assessment_attempts = {
        data: [
          { assessment_id: "a1", trainee_id: "t1", passed: false, submitted_at: NOW_ISO },
          { assessment_id: "a1", trainee_id: "t1", passed: false, submitted_at: NOW_ISO },
          { assessment_id: "a1", trainee_id: "t1", passed: true, submitted_at: NOW_ISO }, // a pass doesn't count
        ],
        error: null,
      };

      const result = await getDashboardAnalytics();

      // 2 failed attempts * 10 = 20 — below the medium threshold on its own.
      expect(result.dropoutRisk.byLevel).toContainEqual({ level: "low", count: 1 });
      expect(result.dropoutRisk.flagged).toEqual([]);
    });

    it("treats a freshly-nominated trainee as not stale on day one", async () => {
      tableData.nominations = { data: [approvedNomination({ nominated_at: NOW_ISO })], error: null };
      const result = await getDashboardAnalytics();
      expect(result.dropoutRisk.flagged).toEqual([]);
    });

    it("adds a staleness penalty for a long-idle nomination, but that alone stays low-risk", async () => {
      const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      tableData.nominations = { data: [approvedNomination({ nominated_at: longAgo })], error: null };

      const result = await getDashboardAnalytics();

      // Staleness alone (+20) doesn't cross the medium threshold (30) —
      // demonstrates it's one signal among several, not flagged on its own.
      expect(result.dropoutRisk.flagged).toEqual([]);
      expect(result.dropoutRisk.byLevel).toContainEqual({ level: "low", count: 1 });
    });

    it("combines staleness with low attendance to cross into medium risk", async () => {
      const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      tableData.nominations = { data: [approvedNomination({ nominated_at: longAgo })], error: null };
      tableData.timetable_sessions = {
        data: [{ id: "s1", programme_id: "p1", starts_at: "2020-01-01T00:00:00Z" }],
        error: null,
      };
      // t1 never attended s1, and the attendance table has nothing more
      // recent than nominated_at either, so staleness still applies.

      const result = await getDashboardAnalytics();

      // +30 (attendance) + 20 (staleness) = 50.
      expect(result.dropoutRisk.flagged).toEqual([
        expect.objectContaining({ traineeId: "t1", riskLevel: "medium", riskScore: 50 }),
      ]);
    });

    it("sorts flagged trainees by risk score descending", async () => {
      tableData.nominations = {
        data: [
          approvedNomination({ trainee_id: "low-risk-medium", programme_id: "p1" }),
          approvedNomination({ trainee_id: "high-risk", programme_id: "p2", programmes: { title: "Poultry", institution_id: "i1" } }),
        ],
        error: null,
      };
      tableData.timetable_sessions = {
        data: [
          { id: "s1", programme_id: "p1", starts_at: "2020-01-01T00:00:00Z" },
          { id: "s2", programme_id: "p2", starts_at: "2020-01-01T00:00:00Z" },
        ],
        error: null,
      };
      tableData.courses = { data: [{ id: "c2", programme_id: "p2" }], error: null };
      tableData.modules = { data: [{ id: "m2", course_id: "c2" }], error: null };
      tableData.lessons = { data: [{ id: "l2", module_id: "m2" }], error: null };
      // Neither trainee attended their session (both get +30 for attendance);
      // p2's trainee also has 0/1 lesson completion (+40 more) => 70, high.

      const result = await getDashboardAnalytics();

      expect(result.dropoutRisk.flagged.map((f) => f.traineeId)).toEqual(["high-risk", "low-risk-medium"]);
      expect(result.dropoutRisk.flagged[0].riskLevel).toBe("high");
      expect(result.dropoutRisk.flagged[1].riskLevel).toBe("medium");
    });
  });

  describe("skillDemand", () => {
    beforeEach(() => {
      tableData.skills = {
        data: [
          { id: "s-tally", name: "Tally Prime", category: "Accounting" },
          { id: "s-excel", name: "Excel", category: "Office" },
          { id: "s-unused", name: "Unrequested Skill", category: null },
        ],
        error: null,
      };
    });

    it("excludes a skill no job has tagged, even if trainees hold it", async () => {
      tableData.programme_skills = { data: [{ programme_id: "p1", skill_id: "s-unused" }], error: null };
      tableData.certificates = { data: [{ programme_id: "p1", trainee_id: "t1", issued_at: "2026-01-01" }], error: null };

      const result = await getDashboardAnalytics();
      expect(result.skillDemand.topShortages.map((r) => r.skillId)).not.toContain("s-unused");
    });

    it("computes demand from distinct jobs and supply from distinct trainees with a qualifying certificate", async () => {
      tableData.job_skills = {
        data: [
          { job_id: "j1", skill_id: "s-tally" },
          { job_id: "j2", skill_id: "s-tally" },
          { job_id: "j1", skill_id: "s-excel" },
        ],
        error: null,
      };
      tableData.programme_skills = {
        data: [
          { programme_id: "p1", skill_id: "s-tally" },
          { programme_id: "p2", skill_id: "s-excel" },
        ],
        error: null,
      };
      tableData.certificates = {
        data: [
          // Two trainees hold "Tally Prime" via p1; one holds "Excel" via p2.
          { programme_id: "p1", trainee_id: "t1", issued_at: "2026-01-01" },
          { programme_id: "p1", trainee_id: "t2", issued_at: "2026-01-01" },
          { programme_id: "p2", trainee_id: "t3", issued_at: "2026-01-01" },
          // Same trainee certified twice under the same programme must not
          // double-count supply — the whole point of counting distinct
          // trainee ids via a Set, not certificate rows.
          { programme_id: "p1", trainee_id: "t1", issued_at: "2026-02-01" },
        ],
        error: null,
      };

      const result = await getDashboardAnalytics();

      expect(result.skillDemand.topShortages).toEqual([
        // Tally: demand 2 (j1, j2), supply 2 (t1, t2) => shortage 0.
        { skillId: "s-tally", skillName: "Tally Prime", category: "Accounting", demand: 2, supply: 2, shortage: 0 },
        // Excel: demand 1 (j1), supply 1 (t3) => shortage 0. Tie on
        // shortage, so ranked below Tally by the demand tiebreaker.
        { skillId: "s-excel", skillName: "Excel", category: "Office", demand: 1, supply: 1, shortage: 0 },
      ]);
    });

    it("ranks a fully-unsupplied skill above a partially-supplied one at equal demand", async () => {
      tableData.job_skills = {
        data: [
          { job_id: "j1", skill_id: "s-tally" },
          { job_id: "j1", skill_id: "s-excel" },
        ],
        error: null,
      };
      tableData.programme_skills = { data: [{ programme_id: "p1", skill_id: "s-excel" }], error: null };
      tableData.certificates = { data: [{ programme_id: "p1", trainee_id: "t1", issued_at: "2026-01-01" }], error: null };

      const result = await getDashboardAnalytics();

      // Tally: demand 1, supply 0 => shortage 1. Excel: demand 1, supply 1
      // => shortage 0. Tally must rank first despite equal demand.
      expect(result.skillDemand.topShortages.map((r) => r.skillId)).toEqual(["s-tally", "s-excel"]);
    });
  });
});
