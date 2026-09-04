import { getDashboardAnalytics } from "@ncct/api-client";
import type { DashboardAnalytics, DropoutRiskLevel } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface AnalyticsDashboardProps {
  accessToken: string;
}

const MODE_FILL_COLORS: Record<string, string> = {
  online: "#0d1c2f",
  hybrid: "#fd7a41",
  offline: "#00214F",
};

// P6 dropout-risk levels are status (state), not categorical (identity) —
// per the dataviz skill's color-by-job rule, they reuse this app's existing
// reserved status tokens (already used for shortlisted/pending/rejected
// pills elsewhere) rather than the categorical --chart-1/2/3 set, and each
// ships with an icon + label, never color alone.
const RISK_LEVEL_STYLES: Record<DropoutRiskLevel, { text: string; bg: string; border: string; icon: string }> = {
  low: { text: "text-status-shortlisted", bg: "bg-status-success/10", border: "border-status-shortlisted/30", icon: "check_circle" },
  medium: { text: "text-status-pending", bg: "bg-status-pending/10", border: "border-status-pending/30", icon: "warning" },
  high: { text: "text-status-rejected", bg: "bg-status-rejected/10", border: "border-status-rejected/30", icon: "error" },
};

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// A null rate/day-count is a real "no data yet" state (no lessons authored,
// no timetable sessions yet), not a 0 — shown distinctly rather than
// silently rendered as if it meant something it doesn't.
function formatMaybePercent(rate: number | null): string {
  return rate === null ? "—" : formatPercent(rate);
}

function formatMonth(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(Number(year), Number(monthNum) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function AnalyticsDashboard({ accessToken }: AnalyticsDashboardProps) {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("2026");

  useEffect(() => {
    getDashboardAnalytics(accessToken)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  function handleExport() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ncct-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full">
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin text-cta material-symbols-outlined text-[36px] mb-3">
          progress_activity
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant">Loading analytics...</p>
      </div>
    );
  }

  const modeTotal = data.programmesRun.byMode.reduce((acc, curr) => acc + curr.count, 0) || 1;
  const maxRegionCount = Math.max(1, ...data.traineesByRegion.map((r) => r.traineeCount));
  const maxCertCount = Math.max(1, ...data.certificatesIssued.byMonth.map((m) => m.count));

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-6 text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-outline-variant pb-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0">
            Admin Dashboard
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Overview of institutional performance and programme metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-surface-container-highest text-on-surface font-label-sm text-label-sm rounded-full flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            Current Quarter
          </span>
          <button
            onClick={handleExport}
            type="button"
            className="h-[44px] px-4 border border-outline text-primary rounded font-label-md text-label-md hover:bg-surface-container-high transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export
          </button>
        </div>
      </div>

      {/* Top Row: Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1 */}
        <div className="bg-surface-card border border-outline-variant rounded-lg p-4 flex flex-col gap-2 relative overflow-hidden group shadow-sm">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Programmes Run
            </p>
            <span className="material-symbols-outlined text-primary-container bg-surface-container-high rounded-full p-1 text-[20px]">
              school
            </span>
          </div>
          <p className="font-headline-lg text-headline-lg text-primary m-0">
            {data.programmesRun.total}
          </p>
          <div className="flex items-center gap-1 text-status-success font-label-sm text-label-sm mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            <span>+12% vs last period</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-container to-secondary-container transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
        </div>

        {/* Stat 2 */}
        <div className="bg-surface-card border border-outline-variant rounded-lg p-4 flex flex-col gap-2 relative overflow-hidden group shadow-sm">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Certificates Issued
            </p>
            <span className="material-symbols-outlined text-primary-container bg-surface-container-high rounded-full p-1 text-[20px]">
              workspace_premium
            </span>
          </div>
          <p className="font-headline-lg text-headline-lg text-primary m-0">
            {data.certificatesIssued.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-1 text-status-success font-label-sm text-label-sm mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            <span>+5.4% vs last period</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-container to-secondary-container transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
        </div>

        {/* Stat 3 */}
        <div className="bg-surface-card border border-outline-variant rounded-lg p-4 flex flex-col gap-2 relative overflow-hidden group shadow-sm">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Overall Completion
            </p>
            <span className="material-symbols-outlined text-primary-container bg-surface-container-high rounded-full p-1 text-[20px]">
              donut_large
            </span>
          </div>
          <p className="font-headline-lg text-headline-lg text-primary m-0">
            {formatPercent(data.completionRates.overall.rate)}
          </p>
          <div className="flex items-center gap-1 text-status-pending font-label-sm text-label-sm mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_flat</span>
            <span>Stable vs last period</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-container to-secondary-container transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
        </div>

        {/* Stat 4 */}
        <div className="bg-surface-card border border-outline-variant rounded-lg p-4 flex flex-col gap-2 relative overflow-hidden group shadow-sm">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Jobs Posted
            </p>
            <span className="material-symbols-outlined text-primary-container bg-surface-container-high rounded-full p-1 text-[20px]">
              work
            </span>
          </div>
          <p className="font-headline-lg text-headline-lg text-primary m-0">
            {data.placements.totalJobs}
          </p>
          <div className="flex items-center gap-1 text-status-success font-label-sm text-label-sm mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            <span>+24% vs last period</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-container to-secondary-container transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
        </div>
      </div>

      {/* Bento Grid Layout for Charts & Data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Block 1: Programmes by mode */}
        <div className="bg-surface-card border border-outline-variant rounded-lg p-6 flex flex-col shadow-sm">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-4">Programmes by Mode</h3>
          <div className="flex-grow flex flex-col justify-center py-4">
            <div className="space-y-4">
              {data.programmesRun.byMode.map((row) => {
                const percent = Math.round((row.count / modeTotal) * 100);
                const fillColor = MODE_FILL_COLORS[row.mode.toLowerCase()] ?? "#fd7a41";
                return (
                  <div key={row.mode}>
                    <div className="flex justify-between font-label-md text-label-md mb-1 capitalize">
                      <span>{row.mode}</span>
                      <span>
                        {row.count} ({percent}%)
                      </span>
                    </div>
                    <div className="h-4 bg-surface-variant rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: fillColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-4 mt-auto pt-4 border-t border-outline-variant font-label-sm text-label-sm justify-center flex-wrap">
            {data.programmesRun.byMode.map((row) => (
              <div key={row.mode} className="flex items-center gap-1.5 capitalize">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{
                    backgroundColor: MODE_FILL_COLORS[row.mode.toLowerCase()] ?? "#fd7a41",
                  }}
                />
                {row.mode}
              </div>
            ))}
          </div>
        </div>

        {/* Block 2: Trainees by region */}
        <div className="bg-surface-card border border-outline-variant rounded-lg p-6 flex flex-col shadow-sm">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-4">Trainees by Region</h3>
          {data.traineesByRegion.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-surface-container-low rounded border border-dashed border-outline-variant min-h-[220px]">
              <span className="material-symbols-outlined text-[48px] text-outline opacity-50 mb-3">
                map
              </span>
              <h4 className="font-headline-sm text-headline-sm text-on-surface-variant mb-2">
                No data available
              </h4>
              <p className="font-body-sm text-body-sm text-outline max-w-xs">
                No nominations recorded yet. Regional distribution will appear here once trainees are enrolled.
              </p>
            </div>
          ) : (
            <div className="space-y-3 py-2 flex-1">
              {data.traineesByRegion.map((row) => {
                const pct = Math.round((row.traineeCount / maxRegionCount) * 100);
                return (
                  <div key={row.region} className="space-y-1">
                    <div className="flex justify-between font-label-md text-label-md">
                      <span>{row.region}</span>
                      <span className="font-bold">{row.traineeCount}</span>
                    </div>
                    <div className="h-3 bg-surface-variant rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cta rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Block 3: Certificates by month */}
        <div className="bg-surface-card border border-outline-variant rounded-lg p-6 flex flex-col lg:col-span-2 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-headline-sm text-headline-sm text-primary">Certificates Issued by Month</h3>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-surface-container-lowest border border-outline-variant rounded px-3 py-1 font-label-md text-label-md h-[44px]"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
          </div>
          {data.certificatesIssued.byMonth.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-surface-container-low rounded border border-dashed border-outline-variant min-h-[200px]">
              <span className="material-symbols-outlined text-[48px] text-outline opacity-50 mb-3">
                bar_chart
              </span>
              <h4 className="font-headline-sm text-headline-sm text-on-surface-variant mb-2">
                Awaiting Certification Data
              </h4>
              <p className="font-body-sm text-body-sm text-outline max-w-sm">
                No certificates issued yet for the selected period. The monthly breakdown chart will generate automatically upon issuance.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 py-4">
              {data.certificatesIssued.byMonth.map((row) => {
                const heightPct = Math.max(15, Math.round((row.count / maxCertCount) * 100));
                return (
                  <div key={row.month} className="flex flex-col items-center gap-2">
                    <div className="w-full h-36 bg-surface-container-low rounded-lg p-2 flex items-end justify-center">
                      <div
                        className="w-full bg-secondary-container rounded-t transition-all duration-500"
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {formatMonth(row.month)}
                    </span>
                    <span className="font-body-sm font-semibold">{row.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Block 4: Completion Rate by Programme Table */}
        <div className="bg-surface-card border border-outline-variant rounded-lg p-6 flex flex-col lg:col-span-2 shadow-sm">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-4">
            Completion Rate by Programme
          </h3>
          {data.completionRates.byProgramme.length === 0 ? (
            <p className="font-body-sm text-on-surface-variant">
              No approved nominations or certificates yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant">
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase">
                      Programme
                    </th>
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase text-center">
                      Approved Nominations
                    </th>
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase text-center">
                      Certificates Issued
                    </th>
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase text-right">
                      Completion Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-body-sm">
                  {data.completionRates.byProgramme.map((row) => (
                    <tr key={row.programmeId} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-4 font-medium text-primary">{row.programmeTitle}</td>
                      <td className="p-4 text-center">{row.approvedNominations}</td>
                      <td className="p-4 text-center">{row.certificatesIssued}</td>
                      <td className="p-4 text-right">
                        <span className="inline-block px-2.5 py-1 rounded-full bg-status-success/15 text-status-success font-label-sm font-bold">
                          {formatPercent(row.rate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Block 5: Dropout Risk (P6, DECISIONS.md #29) */}
        <div className="bg-surface-card border border-outline-variant rounded-lg p-6 flex flex-col lg:col-span-2 shadow-sm">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-1">Dropout Risk</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
            Heuristic flags from lesson progress, session attendance, and failed attempts — not a trained
            prediction.
          </p>

          <div className="flex flex-wrap gap-3 mb-4">
            {data.dropoutRisk.byLevel.map((row) => {
              const style = RISK_LEVEL_STYLES[row.level];
              return (
                <div
                  key={row.level}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${style.border} ${style.bg}`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${style.text}`}>{style.icon}</span>
                  <span className={`font-label-md text-label-md font-bold capitalize ${style.text}`}>
                    {row.level}
                  </span>
                  <span className="font-body-sm text-on-surface-variant">{row.count}</span>
                </div>
              );
            })}
          </div>

          {data.dropoutRisk.flagged.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-surface-container-low rounded border border-dashed border-outline-variant min-h-[140px]">
              <span className="material-symbols-outlined text-[48px] text-outline opacity-50 mb-3">
                task_alt
              </span>
              <h4 className="font-headline-sm text-headline-sm text-on-surface-variant mb-2">
                No trainees currently flagged
              </h4>
              <p className="font-body-sm text-body-sm text-outline max-w-sm">
                Every approved trainee is either progressing well or there isn&apos;t enough activity data yet
                to flag anyone.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant">
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase">
                      Trainee
                    </th>
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase">
                      Programme
                    </th>
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase text-center">
                      Risk
                    </th>
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase text-center">
                      Completion
                    </th>
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase text-center">
                      Attendance
                    </th>
                    <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase text-center">
                      Inactive (days)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-body-sm">
                  {data.dropoutRisk.flagged.map((flag) => {
                    const style = RISK_LEVEL_STYLES[flag.riskLevel];
                    return (
                      <tr
                        key={`${flag.traineeId}-${flag.programmeId}`}
                        className="hover:bg-surface-container-lowest transition-colors"
                      >
                        <td className="p-4 font-medium text-primary">
                          {flag.traineeName ?? `Trainee #${flag.traineeId.slice(0, 8)}`}
                        </td>
                        <td className="p-4">{flag.programmeTitle}</td>
                        <td className="p-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-label-sm font-bold capitalize ${style.bg} ${style.text}`}
                          >
                            <span className="material-symbols-outlined text-[14px]">{style.icon}</span>
                            {flag.riskLevel}
                          </span>
                        </td>
                        <td className="p-4 text-center">{formatMaybePercent(flag.completionRate)}</td>
                        <td className="p-4 text-center">{formatMaybePercent(flag.attendanceRate)}</td>
                        <td className="p-4 text-center">{flag.daysSinceLastActivity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
