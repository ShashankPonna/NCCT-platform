import { getDashboardAnalytics } from "@ncct/api-client";
import type { DashboardAnalytics, DropoutRiskLevel } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

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

interface AnalyticsDashboardText {
  heading: string;
  subheading: string;
  currentQuarter: string;
  export: string;
  loading: string;
  statProgrammesRun: string;
  statCertificatesIssued: string;
  statOverallCompletion: string;
  statJobsPosted: string;
  trendUp: (percent: string) => string;
  trendStable: string;
  programmesByMode: string;
  mode: Record<string, string>;
  traineesByRegion: string;
  noDataAvailable: string;
  noRegionData: string;
  certificatesByMonth: string;
  awaitingCertData: string;
  noCertDataForPeriod: string;
  completionRateByProgramme: string;
  noApprovedNominations: string;
  colProgramme: string;
  colApprovedNominations: string;
  colCertificatesIssued: string;
  colCompletionRate: string;
  dropoutRisk: string;
  dropoutRiskSubheading: string;
  riskLevel: Record<DropoutRiskLevel, string>;
  noFlagged: string;
  noFlaggedBody: string;
  colTrainee: string;
  colRisk: string;
  colCompletion: string;
  colAttendance: string;
  colInactiveDays: string;
  traineeFallback: (idPrefix: string) => string;
  skillDemand: string;
  skillDemandSubheading: string;
  noSkillShortages: string;
  noSkillShortagesBody: string;
  colSkill: string;
  colCategory: string;
  colDemand: string;
  colSupply: string;
  colShortage: string;
  noCategory: string;
}

const content: Record<Locale, AnalyticsDashboardText> = {
  en: {
    heading: "Admin Dashboard",
    subheading: "Overview of institutional performance and programme metrics.",
    currentQuarter: "Current Quarter",
    export: "Export",
    loading: "Loading analytics...",
    statProgrammesRun: "Programmes Run",
    statCertificatesIssued: "Certificates Issued",
    statOverallCompletion: "Overall Completion",
    statJobsPosted: "Jobs Posted",
    trendUp: (percent) => `+${percent}% vs last period`,
    trendStable: "Stable vs last period",
    programmesByMode: "Programmes by Mode",
    mode: { online: "online", hybrid: "hybrid", offline: "offline" },
    traineesByRegion: "Trainees by Region",
    noDataAvailable: "No data available",
    noRegionData: "No nominations recorded yet. Regional distribution will appear here once trainees are enrolled.",
    certificatesByMonth: "Certificates Issued by Month",
    awaitingCertData: "Awaiting Certification Data",
    noCertDataForPeriod:
      "No certificates issued yet for the selected period. The monthly breakdown chart will generate automatically upon issuance.",
    completionRateByProgramme: "Completion Rate by Programme",
    noApprovedNominations: "No approved nominations or certificates yet.",
    colProgramme: "Programme",
    colApprovedNominations: "Approved Nominations",
    colCertificatesIssued: "Certificates Issued",
    colCompletionRate: "Completion Rate",
    dropoutRisk: "Dropout Risk",
    dropoutRiskSubheading:
      "Heuristic flags from lesson progress, session attendance, and failed attempts — not a trained prediction.",
    riskLevel: { low: "low", medium: "medium", high: "high" },
    noFlagged: "No trainees currently flagged",
    noFlaggedBody:
      "Every approved trainee is either progressing well or there isn't enough activity data yet to flag anyone.",
    colTrainee: "Trainee",
    colRisk: "Risk",
    colCompletion: "Completion",
    colAttendance: "Attendance",
    colInactiveDays: "Inactive (days)",
    traineeFallback: (idPrefix) => `Trainee #${idPrefix}`,
    skillDemand: "Skill Demand vs. Supply",
    skillDemandSubheading:
      "Taxonomy skills open job postings need most, versus how many trainees actually hold them — the biggest gaps are the strongest case for a new programme.",
    noSkillShortages: "No skill demand data yet",
    noSkillShortagesBody:
      "Once employers tag job postings with taxonomy skills, the biggest gaps against what trainees have earned will show up here.",
    colSkill: "Skill",
    colCategory: "Category",
    colDemand: "Jobs Requiring It",
    colSupply: "Trainees With It",
    colShortage: "Shortage",
    noCategory: "Uncategorized",
  },
  hi: {
    heading: "प्रशासक डैशबोर्ड",
    subheading: "संस्थागत प्रदर्शन और कार्यक्रम मेट्रिक्स का अवलोकन।",
    currentQuarter: "वर्तमान तिमाही",
    export: "निर्यात करें",
    loading: "एनालिटिक्स लोड हो रहा है...",
    statProgrammesRun: "चलाए गए कार्यक्रम",
    statCertificatesIssued: "जारी प्रमाणपत्र",
    statOverallCompletion: "समग्र पूर्णता",
    statJobsPosted: "पोस्ट की गई नौकरियां",
    trendUp: (percent) => `+${percent}% पिछली अवधि की तुलना में`,
    trendStable: "पिछली अवधि की तुलना में स्थिर",
    programmesByMode: "मोड के अनुसार कार्यक्रम",
    mode: { online: "ऑनलाइन", hybrid: "हाइब्रिड", offline: "ऑफ़लाइन" },
    traineesByRegion: "क्षेत्र के अनुसार प्रशिक्षणार्थी",
    noDataAvailable: "कोई डेटा उपलब्ध नहीं",
    noRegionData: "अभी तक कोई नामांकन दर्ज नहीं हुआ है। प्रशिक्षणार्थियों के नामांकन होते ही क्षेत्रीय वितरण यहां दिखाई देगा।",
    certificatesByMonth: "माह के अनुसार जारी प्रमाणपत्र",
    awaitingCertData: "प्रमाणन डेटा की प्रतीक्षा",
    noCertDataForPeriod:
      "चयनित अवधि के लिए अभी तक कोई प्रमाणपत्र जारी नहीं किया गया है। जारी होते ही मासिक विवरण चार्ट स्वचालित रूप से बन जाएगा।",
    completionRateByProgramme: "कार्यक्रम के अनुसार पूर्णता दर",
    noApprovedNominations: "अभी तक कोई स्वीकृत नामांकन या प्रमाणपत्र नहीं है।",
    colProgramme: "कार्यक्रम",
    colApprovedNominations: "स्वीकृत नामांकन",
    colCertificatesIssued: "जारी प्रमाणपत्र",
    colCompletionRate: "पूर्णता दर",
    dropoutRisk: "ड्रॉपआउट जोखिम",
    dropoutRiskSubheading:
      "पाठ प्रगति, सत्र उपस्थिति और असफल प्रयासों से ह्यूरिस्टिक फ़्लैग — यह कोई प्रशिक्षित भविष्यवाणी नहीं है।",
    riskLevel: { low: "कम", medium: "मध्यम", high: "उच्च" },
    noFlagged: "वर्तमान में कोई प्रशिक्षणार्थी फ़्लैग नहीं किया गया",
    noFlaggedBody:
      "हर स्वीकृत प्रशिक्षणार्थी या तो अच्छी प्रगति कर रहा है या किसी को फ़्लैग करने के लिए अभी पर्याप्त गतिविधि डेटा नहीं है।",
    colTrainee: "प्रशिक्षणार्थी",
    colRisk: "जोखिम",
    colCompletion: "पूर्णता",
    colAttendance: "उपस्थिति",
    colInactiveDays: "निष्क्रिय (दिन)",
    traineeFallback: (idPrefix) => `प्रशिक्षणार्थी #${idPrefix}`,
    skillDemand: "कौशल मांग बनाम आपूर्ति",
    skillDemandSubheading:
      "खुली नौकरी पोस्टिंग को सबसे ज़्यादा किन टैक्सोनॉमी कौशलों की ज़रूरत है, बनाम कितने प्रशिक्षणार्थियों के पास वास्तव में वे हैं — सबसे बड़ा अंतर नए कार्यक्रम का सबसे मजबूत आधार है।",
    noSkillShortages: "अभी तक कोई कौशल मांग डेटा नहीं",
    noSkillShortagesBody:
      "जैसे ही नियोक्ता नौकरी पोस्टिंग को टैक्सोनॉमी कौशलों से टैग करेंगे, प्रशिक्षणार्थियों के पास मौजूद कौशलों की तुलना में सबसे बड़े अंतर यहां दिखाई देंगे।",
    colSkill: "कौशल",
    colCategory: "श्रेणी",
    colDemand: "आवश्यक नौकरियां",
    colSupply: "प्रशिक्षणार्थी जिनके पास है",
    colShortage: "कमी",
    noCategory: "अवर्गीकृत",
  },
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

function formatMonth(month: string, locale: Locale): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(Number(year), Number(monthNum) - 1, 1);
  return date.toLocaleDateString(locale === "hi" ? "hi-IN" : undefined, { month: "short", year: "numeric" });
}

export function AnalyticsDashboard({ accessToken }: AnalyticsDashboardProps) {
  const { locale } = useLocale();
  const t = content[locale];
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
        <p className="font-body-md text-body-md text-on-surface-variant">{t.loading}</p>
      </div>
    );
  }

  const modeTotal = data.programmesRun.byMode.reduce((acc, curr) => acc + curr.count, 0) || 1;
  const maxRegionCount = Math.max(1, ...data.traineesByRegion.map((r) => r.traineeCount));
  const maxCertCount = Math.max(1, ...data.certificatesIssued.byMonth.map((m) => m.count));
  const modeLabel = (mode: string) => t.mode[mode.toLowerCase()] ?? mode;
  const riskLabel = (level: DropoutRiskLevel) => t.riskLevel[level];

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-6 text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-outline-variant pb-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0">
            {t.heading}
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">{t.subheading}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-surface-container-highest text-on-surface font-label-sm text-label-sm rounded-full flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            {t.currentQuarter}
          </span>
          <button
            onClick={handleExport}
            type="button"
            className="h-[44px] px-4 border border-outline text-primary rounded font-label-md text-label-md hover:bg-surface-container-high transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            {t.export}
          </button>
        </div>
      </div>

      {/* Top Row: Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1 */}
        <div className="bg-surface-card border border-border-slate rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden group shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">
              {t.statProgrammesRun}
            </p>
            <span className="material-symbols-outlined text-primary-container bg-surface-container-high rounded-xl p-1.5 text-[20px] shadow-2xs">
              school
            </span>
          </div>
          <p className="font-display font-bold text-3xl text-primary tracking-tight tabular-nums m-0">
            {data.programmesRun.total}
          </p>
          <div className="flex items-center gap-1 text-status-success font-label-sm text-label-sm font-bold mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            <span>{t.trendUp("12")}</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-container to-secondary-container transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
        </div>

        {/* Stat 2 */}
        <div className="bg-surface-card border border-border-slate rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden group shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">
              {t.statCertificatesIssued}
            </p>
            <span className="material-symbols-outlined text-primary-container bg-surface-container-high rounded-xl p-1.5 text-[20px] shadow-2xs">
              workspace_premium
            </span>
          </div>
          <p className="font-display font-bold text-3xl text-primary tracking-tight tabular-nums m-0">
            {data.certificatesIssued.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-1 text-status-success font-label-sm text-label-sm font-bold mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            <span>{t.trendUp("5.4")}</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-container to-secondary-container transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
        </div>

        {/* Stat 3 */}
        <div className="bg-surface-card border border-border-slate rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden group shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">
              {t.statOverallCompletion}
            </p>
            <span className="material-symbols-outlined text-primary-container bg-surface-container-high rounded-xl p-1.5 text-[20px] shadow-2xs">
              donut_large
            </span>
          </div>
          <p className="font-display font-bold text-3xl text-primary tracking-tight tabular-nums m-0">
            {formatPercent(data.completionRates.overall.rate)}
          </p>
          <div className="flex items-center gap-1 text-status-pending font-label-sm text-label-sm font-bold mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_flat</span>
            <span>{t.trendStable}</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-container to-secondary-container transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
        </div>

        {/* Stat 4 */}
        <div className="bg-surface-card border border-border-slate rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden group shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">
              {t.statJobsPosted}
            </p>
            <span className="material-symbols-outlined text-primary-container bg-surface-container-high rounded-xl p-1.5 text-[20px] shadow-2xs">
              work
            </span>
          </div>
          <p className="font-display font-bold text-3xl text-primary tracking-tight tabular-nums m-0">
            {data.placements.totalJobs}
          </p>
          <div className="flex items-center gap-1 text-status-success font-label-sm text-label-sm font-bold mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            <span>{t.trendUp("24")}</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-container to-secondary-container transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
        </div>
      </div>

      {/* Bento Grid Layout for Charts & Data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Block 1: Programmes by mode */}
        <div className="bg-surface-card border border-border-slate rounded-2xl p-6 flex flex-col shadow-xs">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-4 font-bold">{t.programmesByMode}</h3>
          <div className="flex-grow flex flex-col justify-center py-4">
            <div className="space-y-4">
              {data.programmesRun.byMode.map((row) => {
                const percent = Math.round((row.count / modeTotal) * 100);
                const fillColor = MODE_FILL_COLORS[row.mode.toLowerCase()] ?? "#fd7a41";
                return (
                  <div key={row.mode}>
                    <div className="flex justify-between font-label-md text-label-md mb-1 font-semibold">
                      <span>{modeLabel(row.mode)}</span>
                      <span className="font-metric-mono font-bold">
                        {row.count} ({percent}%)
                      </span>
                    </div>
                    <div className="h-4 bg-paper rounded-full overflow-hidden border border-border-slate/50">
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
          <div className="flex gap-4 mt-auto pt-4 border-t border-border-slate/60 font-label-sm text-label-sm justify-center flex-wrap">
            {data.programmesRun.byMode.map((row) => (
              <div key={row.mode} className="flex items-center gap-1.5 font-semibold">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{
                    backgroundColor: MODE_FILL_COLORS[row.mode.toLowerCase()] ?? "#fd7a41",
                  }}
                />
                {modeLabel(row.mode)}
              </div>
            ))}
          </div>
        </div>

        {/* Block 2: Trainees by region */}
        <div className="bg-surface-card border border-border-slate rounded-2xl p-6 flex flex-col shadow-xs">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-4 font-bold">{t.traineesByRegion}</h3>
          {data.traineesByRegion.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-paper-light rounded-xl border border-dashed border-border-slate min-h-[220px]">
              <span className="material-symbols-outlined text-[48px] text-outline opacity-50 mb-3">
                map
              </span>
              <h4 className="font-headline-sm text-headline-sm text-on-surface-variant mb-2">
                {t.noDataAvailable}
              </h4>
              <p className="font-body-sm text-body-sm text-outline max-w-xs">{t.noRegionData}</p>
            </div>
          ) : (
            <div className="space-y-3 py-2 flex-1">
              {data.traineesByRegion.map((row) => {
                const pct = Math.round((row.traineeCount / maxRegionCount) * 100);
                return (
                  <div key={row.region} className="space-y-1">
                    <div className="flex justify-between font-label-md text-label-md font-semibold">
                      <span>{row.region}</span>
                      <span className="font-metric-mono font-bold">{row.traineeCount}</span>
                    </div>
                    <div className="h-3 bg-paper rounded-full overflow-hidden border border-border-slate/50">
                      <div
                        className="h-full bg-secondary-container rounded-full transition-all duration-500"
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
        <div className="bg-surface-card border border-border-slate rounded-2xl p-6 flex flex-col lg:col-span-2 shadow-xs">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold">{t.certificatesByMonth}</h3>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-white border border-border-slate rounded-lg px-3 py-1 font-label-md text-label-md h-[40px] cursor-pointer"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
          </div>
          {data.certificatesIssued.byMonth.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-paper-light rounded-xl border border-dashed border-border-slate min-h-[200px]">
              <span className="material-symbols-outlined text-[48px] text-outline opacity-50 mb-3">
                bar_chart
              </span>
              <h4 className="font-headline-sm text-headline-sm text-on-surface-variant mb-2">
                {t.awaitingCertData}
              </h4>
              <p className="font-body-sm text-body-sm text-outline max-w-sm">{t.noCertDataForPeriod}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 py-4">
              {data.certificatesIssued.byMonth.map((row) => {
                const heightPct = Math.max(15, Math.round((row.count / maxCertCount) * 100));
                return (
                  <div key={row.month} className="flex flex-col items-center gap-2">
                    <div className="w-full h-36 bg-paper-light rounded-xl p-2 flex items-end justify-center border border-border-slate/50">
                      <div
                        className="w-full bg-secondary-container rounded-t-lg transition-all duration-500 shadow-xs"
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                      {formatMonth(row.month, locale)}
                    </span>
                    <span className="font-metric-mono text-sm font-bold text-primary">{row.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Block 4: Completion Rate by Programme Table */}
        <div className="bg-surface-card border border-border-slate rounded-2xl p-6 flex flex-col lg:col-span-2 shadow-xs">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-4 font-bold">{t.completionRateByProgramme}</h3>
          {data.completionRates.byProgramme.length === 0 ? (
            <p className="font-body-sm text-on-surface-variant">{t.noApprovedNominations}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border-slate">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-paper border-b border-border-slate text-on-surface-variant font-label-md">
                    <th className="p-4 uppercase font-bold tracking-wider text-xs">
                      {t.colProgramme}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-center">
                      {t.colApprovedNominations}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-center">
                      {t.colCertificatesIssued}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-right">
                      {t.colCompletionRate}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-slate/40 font-body-sm">
                  {data.completionRates.byProgramme.map((row) => (
                    <tr key={row.programmeId} className="hover:bg-paper-light/60 transition-colors">
                      <td className="p-4 font-semibold text-primary">{row.programmeTitle}</td>
                      <td className="p-4 text-center font-metric-mono font-medium">{row.approvedNominations}</td>
                      <td className="p-4 text-center font-metric-mono font-medium">{row.certificatesIssued}</td>
                      <td className="p-4 text-right">
                        <span className="inline-block px-2.5 py-1 rounded-full bg-status-success/15 text-status-success font-metric-mono text-label-sm font-bold border border-status-success/30">
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
        <div className="bg-surface-card border border-border-slate rounded-2xl p-6 flex flex-col lg:col-span-2 shadow-xs">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-1 font-bold">{t.dropoutRisk}</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">{t.dropoutRiskSubheading}</p>

          <div className="flex flex-wrap gap-3 mb-4">
            {data.dropoutRisk.byLevel.map((row) => {
              const style = RISK_LEVEL_STYLES[row.level];
              return (
                <div
                  key={row.level}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 shadow-2xs ${style.border} ${style.bg}`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${style.text}`}>{style.icon}</span>
                  <span className={`font-label-md text-label-md font-bold ${style.text}`}>
                    {riskLabel(row.level)}
                  </span>
                  <span className="font-metric-mono text-body-sm font-bold text-on-surface-variant">{row.count}</span>
                </div>
              );
            })}
          </div>

          {data.dropoutRisk.flagged.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-paper-light rounded-xl border border-dashed border-border-slate min-h-[140px]">
              <span className="material-symbols-outlined text-[48px] text-outline opacity-50 mb-3">
                task_alt
              </span>
              <h4 className="font-headline-sm text-headline-sm text-on-surface-variant mb-2 font-bold">{t.noFlagged}</h4>
              <p className="font-body-sm text-body-sm text-outline max-w-sm">{t.noFlaggedBody}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border-slate">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-paper border-b border-border-slate text-on-surface-variant font-label-md">
                    <th className="p-4 uppercase font-bold tracking-wider text-xs">
                      {t.colTrainee}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs">
                      {t.colProgramme}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-center">
                      {t.colRisk}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-center">
                      {t.colCompletion}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-center">
                      {t.colAttendance}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-center">
                      {t.colInactiveDays}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-slate/40 font-body-sm">
                  {data.dropoutRisk.flagged.map((flag) => {
                    const style = RISK_LEVEL_STYLES[flag.riskLevel];
                    return (
                      <tr
                        key={`${flag.traineeId}-${flag.programmeId}`}
                        className="hover:bg-paper-light/60 transition-colors"
                      >
                        <td className="p-4 font-semibold text-primary">
                          {flag.traineeName ?? t.traineeFallback(flag.traineeId.slice(0, 8))}
                        </td>
                        <td className="p-4">{flag.programmeTitle}</td>
                        <td className="p-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-label-sm font-bold border ${style.bg} ${style.text} ${style.border}`}
                          >
                            <span className="material-symbols-outlined text-[14px]">{style.icon}</span>
                            {riskLabel(flag.riskLevel)}
                          </span>
                        </td>
                        <td className="p-4 text-center font-metric-mono font-medium">{formatMaybePercent(flag.completionRate)}</td>
                        <td className="p-4 text-center font-metric-mono font-medium">{formatMaybePercent(flag.attendanceRate)}</td>
                        <td className="p-4 text-center font-metric-mono font-medium">{flag.daysSinceLastActivity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Block 6: Skill Demand vs. Supply */}
        <div className="bg-surface-card border border-border-slate rounded-2xl p-6 flex flex-col lg:col-span-2 shadow-xs">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-1 font-bold">{t.skillDemand}</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">{t.skillDemandSubheading}</p>

          {data.skillDemand.topShortages.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-paper-light rounded-xl border border-dashed border-border-slate min-h-[140px]">
              <span className="material-symbols-outlined text-[48px] text-outline opacity-50 mb-3">
                query_stats
              </span>
              <h4 className="font-headline-sm text-headline-sm text-on-surface-variant mb-2 font-bold">
                {t.noSkillShortages}
              </h4>
              <p className="font-body-sm text-body-sm text-outline max-w-sm">{t.noSkillShortagesBody}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border-slate">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-paper border-b border-border-slate text-on-surface-variant font-label-md">
                    <th className="p-4 uppercase font-bold tracking-wider text-xs">
                      {t.colSkill}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs">
                      {t.colCategory}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-center">
                      {t.colDemand}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-center">
                      {t.colSupply}
                    </th>
                    <th className="p-4 uppercase font-bold tracking-wider text-xs text-center">
                      {t.colShortage}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-slate/40 font-body-sm">
                  {data.skillDemand.topShortages.map((row) => {
                    const style =
                      row.shortage > 0
                        ? RISK_LEVEL_STYLES.high
                        : row.shortage === 0
                          ? RISK_LEVEL_STYLES.medium
                          : RISK_LEVEL_STYLES.low;
                    return (
                      <tr key={row.skillId} className="hover:bg-paper-light/60 transition-colors">
                        <td className="p-4 font-semibold text-primary">{row.skillName}</td>
                        <td className="p-4 text-on-surface-variant">{row.category ?? t.noCategory}</td>
                        <td className="p-4 text-center font-metric-mono font-medium">{row.demand}</td>
                        <td className="p-4 text-center font-metric-mono font-medium">{row.supply}</td>
                        <td className="p-4 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full font-metric-mono text-label-sm font-bold border ${style.bg} ${style.text} ${style.border}`}
                          >
                            {row.shortage > 0 ? `+${row.shortage}` : row.shortage}
                          </span>
                        </td>
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
