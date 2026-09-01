import { getDashboardAnalytics } from "@ncct/api-client";
import type { DashboardAnalytics } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface AnalyticsDashboardProps {
  accessToken: string;
}

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"] as const;

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatMonth(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(Number(year), Number(monthNum) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

interface BarChartProps {
  rows: { label: string; value: number }[];
  colorFor?: (index: number) => string;
  formatValue?: (value: number) => string;
}

// One reusable horizontal-bar primitive for every chart on this page — bar
// length is the only encoding that actually varies per row, and every bar
// carries its own text label and value (dataviz skill: never color-alone
// identity). `colorFor` defaults to a single accent hue, which is correct
// for a single-series magnitude chart (region counts, certificates/month);
// pass CHART_COLORS explicitly only for genuinely categorical rows (mode,
// funnel status) where each row is its own named category.
function BarChart({ rows, colorFor, formatValue }: BarChartProps) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="bar-chart">
      {rows.map((row, index) => (
        <div className="bar-row" key={row.label}>
          <span className="bar-row-label">{row.label}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{
                width: `${(row.value / max) * 100}%`,
                background: colorFor ? colorFor(index) : "var(--accent)",
              }}
            />
          </span>
          <span className="bar-row-value">{formatValue ? formatValue(row.value) : row.value}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span className="chart-legend-item" key={item.label}>
          <span className="chart-swatch" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// PRD §6.8 / §9: "dashboard-dense, table/chart-heavy" admin view over what
// F2/F3/F4/F6 already produce — F8 has no table of its own (see
// docs/IMPLEMENTATION.md). "Placements" here is the job_interests
// shortlist-funnel breakdown, not outcome/hire tracking — that's PRD §13's
// Phase-2 "Employer Outcome Analysis", out of scope for the MVP label.
export function AnalyticsDashboard({ accessToken }: AnalyticsDashboardProps) {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardAnalytics(accessToken)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="center-message">Loading analytics...</p>;

  return (
    <section className="attendance-panel analytics-section">
      <h2>Analytics</h2>

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="stat-tile-value">{data.programmesRun.total}</div>
          <div className="stat-tile-label">Programmes run</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{data.certificatesIssued.total}</div>
          <div className="stat-tile-label">Certificates issued</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{formatPercent(data.completionRates.overall.rate)}</div>
          <div className="stat-tile-label">Overall completion rate</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{data.placements.totalJobs}</div>
          <div className="stat-tile-label">Jobs posted</div>
        </div>
      </div>

      <h3>Programmes by mode</h3>
      <Legend
        items={data.programmesRun.byMode.map((row, index) => ({
          label: row.mode,
          color: CHART_COLORS[index % CHART_COLORS.length],
        }))}
      />
      <BarChart
        rows={data.programmesRun.byMode.map((row) => ({ label: row.mode, value: row.count }))}
        colorFor={(index) => CHART_COLORS[index % CHART_COLORS.length]}
      />

      <h3>Trainees by region</h3>
      {data.traineesByRegion.length === 0 ? (
        <p>No nominations recorded yet.</p>
      ) : (
        <BarChart
          rows={data.traineesByRegion.map((row) => ({ label: row.region, value: row.traineeCount }))}
        />
      )}

      <h3>Certificates issued by month</h3>
      {data.certificatesIssued.byMonth.length === 0 ? (
        <p>No certificates issued yet.</p>
      ) : (
        <BarChart
          rows={data.certificatesIssued.byMonth.map((row) => ({
            label: formatMonth(row.month),
            value: row.count,
          }))}
        />
      )}

      <h3>Placements (shortlist funnel)</h3>
      <p>Employer shortlist activity by stage — not hire/outcome tracking.</p>
      <Legend
        items={data.placements.byStatus.map((row, index) => ({
          label: row.status,
          color: CHART_COLORS[index % CHART_COLORS.length],
        }))}
      />
      <BarChart
        rows={data.placements.byStatus.map((row) => ({ label: row.status, value: row.count }))}
        colorFor={(index) => CHART_COLORS[index % CHART_COLORS.length]}
      />

      <h3>Completion rate by programme</h3>
      {data.completionRates.byProgramme.length === 0 ? (
        <p>No approved nominations or certificates yet.</p>
      ) : (
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Programme</th>
              <th>Approved nominations</th>
              <th>Certificates issued</th>
              <th>Completion rate</th>
            </tr>
          </thead>
          <tbody>
            {data.completionRates.byProgramme.map((row) => (
              <tr key={row.programmeId}>
                <td>{row.programmeTitle}</td>
                <td>{row.approvedNominations}</td>
                <td>{row.certificatesIssued}</td>
                <td>{formatPercent(row.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
