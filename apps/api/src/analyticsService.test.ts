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
});
