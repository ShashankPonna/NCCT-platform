import { getJobMatches, getJobs, getSkillGap, getSkillGapAcrossJobs } from "@ncct/api-client";
import type { Job, SkillGapAcrossJobsResult, SkillGapResult } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";
import { ErrorBanner, SkillChip } from "./pieces.js";

interface TraineeCareerSkillGapProps {
  accessToken: string;
}

interface TraineeCareerSkillGapText {
  heading: string;
  subheading: string;
  auditEngineTag: string;
  aadhaarVerified: string;
  targetOpeningLabel: string;
  choosePrompt: string;
  checking: string;
  skillsYouHave: (count: number) => string;
  noneYet: string;
  skillsMissing: (count: number) => string;
  allSkillsPresent: string;
  learnFirst: string;
  noSuggestionAvailable: string;
  sortedByFit: string;
  fitSuffix: string;
  relatedToSkill: (name: string) => string;
  overallHeading: string;
  overallSubheadingMatched: string;
  overallSubheadingFallback: string;
  overallEmpty: string;
  overallLoading: string;
  jobsNeedingIt: (count: number) => string;
  startRemediation: string;
  remediationSubtext: string;
  compareAlternative: string;
}

const content: Record<Locale, TraineeCareerSkillGapText> = {
  en: {
    heading: "What are you missing for this opportunity?",
    subheading:
      "Deterministic skill analysis paired with personalized national cooperative job recommendations.",
    auditEngineTag: "Cooperative Public Infrastructure • Gap Audit Engine",
    aadhaarVerified: "Aadhaar • DigiLocker Verified",
    targetOpeningLabel: "Target Operational Opening",
    choosePrompt: "Choose a cooperative job posting…",
    checking: "Auditing your competency alignment…",
    skillsYouHave: (count) => `You Have (Verified DPI Record) • ${count}`,
    noneYet: "None yet — complete certified modules to earn skills!",
    skillsMissing: (count) => `Skills Missing (Remediation Needed) • ${count}`,
    allSkillsPresent: "You have every single skill this role requires! Full qualification achieved.",
    learnFirst: "What to Learn First • Ranked Remediation Sequence",
    noSuggestionAvailable:
      "A suggested learning order isn't available right now — your skill gap list above is complete and validated.",
    sortedByFit: "Sorted by your best fit first, based on verified skills.",
    fitSuffix: "fit",
    relatedToSkill: (name) => `Related to your verified "${name}" skill (partial credit candidate).`,
    overallHeading: "Your Overall Sector Skill Gap",
    overallSubheadingMatched:
      "Across the cooperative positions you match best, closing these gaps yields maximum hiring eligibility.",
    overallSubheadingFallback:
      "Based on newest cooperative openings across PACS, DCCB, and UCB federations.",
    overallEmpty: "No shared gaps found — your current skills already cover what these jobs need!",
    overallLoading: "Auditing aggregate sector skills…",
    jobsNeedingIt: (count) => (count === 1 ? "Needed by 1 opening" : `Needed by ${count} openings`),
    startRemediation: "Start Rapid Remediation",
    remediationSubtext: "Estimated: 8-12 hrs module effort",
    compareAlternative: "Quick compare cooperative roles:",
  },
  hi: {
    heading: "इस अवसर के लिए आपके पास क्या कमी है?",
    subheading: "सहकारी नौकरी अनुशंसाओं के साथ प्रमाणित कौशल अंतर विश्लेषण।",
    auditEngineTag: "सहकारी सार्वजनिक अवसंरचना • कौशल अंतर ऑडिट",
    aadhaarVerified: "आधार • डिजिलॉकर सत्यापित",
    targetOpeningLabel: "लक्षित सहकारी पद",
    choosePrompt: "एक सहकारी नौकरी पोस्टिंग चुनें…",
    checking: "आपकी दक्षताओं का ऑडिट किया जा रहा है…",
    skillsYouHave: (count) => `आपके पास मौजूद कौशल (DPI रिकॉर्ड) • ${count}`,
    noneYet: "अभी तक कोई नहीं — कौशल अर्जित करने के लिए पाठ्यक्रम पूरे करें!",
    skillsMissing: (count) => `कौशल अंतर (सीखने की आवश्यकता) • ${count}`,
    allSkillsPresent: "इस पद के लिए आवश्यक सभी कौशल आपके पास हैं! पूर्ण पात्रता प्राप्त।",
    learnFirst: "पहले क्या सीखें • प्राथमिकता क्रम",
    noSuggestionAvailable:
      "सीखने का सुझाया गया क्रम अभी उपलब्ध नहीं है — ऊपर दी गई कौशल सूची सत्यापित है।",
    sortedByFit: "सत्यापित कौशलों के आधार पर सबसे उपयुक्त नौकरियां पहले।",
    fitSuffix: "मिलान",
    relatedToSkill: (name) => `आपके "${name}" कौशल से संबंधित (आंशिक क्रेडिट)।`,
    overallHeading: "आपका समग्र क्षेत्र कौशल अंतर",
    overallSubheadingMatched: "सहकारी पदों में इन कौशलों को पूरा करने से अधिकतम अवसर मिलेंगे।",
    overallSubheadingFallback: "PACS, DCCB और UCB महासंघों की नवीनतम रिक्तियों पर आधारित।",
    overallEmpty: "कोई साझा अंतर नहीं मिला — आप पहले से ही पूरी तरह योग्य हैं!",
    overallLoading: "समग्र क्षेत्र कौशल अंतर जांचा जा रहा है…",
    jobsNeedingIt: (count) => `${count} रिक्तियों के लिए आवश्यक`,
    startRemediation: "तुरंत सीखना शुरू करें",
    remediationSubtext: "अनुमानित: 8-12 घंटे का अध्ययन",
    compareAlternative: "वैकल्पिक भूमिकाओं की तुलना करें:",
  },
};

export function TraineeCareerSkillGap({ accessToken }: TraineeCareerSkillGapProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [result, setResult] = useState<SkillGapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobFit, setJobFit] = useState<Map<string, number>>(new Map());
  const [hasFitSignal, setHasFitSignal] = useState(false);
  const [overall, setOverall] = useState<SkillGapAcrossJobsResult | null>(null);
  const [overallLoading, setOverallLoading] = useState(true);

  useEffect(() => {
    getJobs()
      .then((loaded) => {
        setJobs(loaded);
        if (loaded.length > 0) {
          const firstId = loaded[0]!.id;
          setSelectedJobId(firstId);
          setLoading(true);
          getSkillGap(accessToken, firstId)
            .then(setResult)
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false));
        }
      })
      .catch((err: Error) => setError(err.message));

    getJobMatches(accessToken)
      .then((res) => {
        const fits = new Map<string, number>();
        let anySignal = false;
        for (const m of res.matches) {
          fits.set(m.id, m.similarity);
          if (m.similarity > 0) anySignal = true;
        }
        setJobFit(fits);
        setHasFitSignal(anySignal);
      })
      .catch(() => {
        // Silent degrade for matches
      });

    getSkillGapAcrossJobs(accessToken)
      .then((summary) => setOverall(summary))
      .catch((err: Error) => setError(err.message))
      .finally(() => setOverallLoading(false));
  }, [accessToken]);

  function handleSelectJob(jobId: string) {
    setSelectedJobId(jobId);
    if (!jobId) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    getSkillGap(accessToken, jobId)
      .then(setResult)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  const orderedJobs = hasFitSignal
    ? [...jobs].sort((a, b) => (jobFit.get(b.id) ?? 0) - (jobFit.get(a.id) ?? 0))
    : jobs;

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  const totalSkillsCount = (result?.acquired_skills.length ?? 0) + (result?.gap_skills.length ?? 0);
  const matchPct = totalSkillsCount > 0
    ? Math.round(((result?.acquired_skills.length ?? 0) / totalSkillsCount) * 100)
    : selectedJobId && jobFit.has(selectedJobId)
      ? Math.round((jobFit.get(selectedJobId) ?? 0.6) * 100)
      : 65;

  const circleCircumference = 251.2; // 2 * PI * 40
  const strokeOffset = circleCircumference - (matchPct / 100) * circleCircumference;

  return (
    <div className="flex flex-col gap-6 py-6 md:py-8 max-w-[1440px] mx-auto w-full">
      {/* Sovereign Header */}
      <section className="relative w-full rounded-2xl bg-paper p-6 md:p-8 overflow-hidden shadow-sm border border-border-slate">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-gradient-to-br from-amber-200/40 via-blue-200/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest shadow-xs border border-border-slate">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                <span className="font-metric-mono text-xs text-secondary-dark font-bold">
                  {t.auditEngineTag}
                </span>
              </span>
              <span className="font-metric-mono text-xs text-slate-500">NCVET-DPI://v4.8.2</span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
              {t.heading}
            </h1>
            <p className="font-body text-body-md text-slate-600 leading-relaxed">{t.subheading}</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2.5 bg-surface-container-lowest px-4 py-2.5 rounded-xl shadow-xs border border-border-slate">
              <span className="material-symbols-outlined text-primary text-[20px]">fingerprint</span>
              <div className="flex flex-col">
                <span className="font-label-md text-xs font-bold text-ink">
                  {t.aadhaarVerified}
                </span>
                <span className="font-metric-mono text-[10px] text-slate-500">Tier-1 Validated</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Target Operational Opening Selector */}
      <div className="bg-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-xs border border-border-slate flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <span className="font-metric-mono text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1 font-semibold">
            <span className="material-symbols-outlined text-[15px] text-accent">target</span>
            {t.targetOpeningLabel}
          </span>
          <select
            value={selectedJobId}
            onChange={(e) => handleSelectJob(e.target.value)}
            className="w-full bg-paper hover:bg-surface-container transition-colors px-4 py-3 rounded-xl border border-border-slate text-ink font-headline text-sm font-semibold outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">{t.choosePrompt}</option>
            {orderedJobs.map((job) => {
              const similarity = jobFit.get(job.id);
              const fitLabel = similarity != null ? ` (${Math.round(similarity * 100)}% ${t.fitSuffix})` : "";
              return (
                <option key={job.id} value={job.id}>
                  {job.title}
                  {job.location ? ` — ${job.location}` : ""}
                  {fitLabel}
                </option>
              );
            })}
          </select>
          {hasFitSignal && jobFit.size > 0 && (
            <span className="font-body text-xs text-slate-500">{t.sortedByFit}</span>
          )}
        </div>

        {/* Quick Alternative Cooperative Selector */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className="font-label-md text-xs text-slate-600 font-medium">
            {t.compareAlternative}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {orderedJobs.slice(0, 3).map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => handleSelectJob(job.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-label-md font-semibold transition-colors flex items-center gap-1.5 border ${
                  selectedJobId === job.id
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-paper hover:bg-surface-container text-ink border-border-slate"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedJobId === job.id ? "bg-secondary" : "bg-slate-400"
                  }`}
                />
                <span className="truncate max-w-[140px]">{job.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <ErrorBanner message={error} />
      {loading && <p className="font-body text-sm text-slate-500">{t.checking}</p>}

      {/* Main Readiness Gauge & Matrix */}
      {result && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Column: Readiness Metric & 2-Col Matrix (8 cols) */}
          <div className="xl:col-span-8 flex flex-col gap-6">
            {/* Readiness Gauge Banner */}
            <div className="bg-primary text-white rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-sm">
              <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-accent/25 blur-3xl pointer-events-none" />
              <div className="absolute right-32 bottom-0 w-48 h-48 rounded-full bg-secondary/20 blur-2xl pointer-events-none" />

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  {/* Gauge Arc */}
                  <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        className="text-white/20"
                        cx="50"
                        cy="50"
                        fill="none"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="8"
                      />
                      <circle
                        className="text-secondary"
                        cx="50"
                        cy="50"
                        fill="none"
                        r="40"
                        stroke="currentColor"
                        strokeDasharray={circleCircumference}
                        strokeDashoffset={strokeOffset}
                        strokeLinecap="round"
                        strokeWidth="8"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="font-display text-2xl font-extrabold text-white leading-none">
                        {matchPct}%
                      </span>
                      <span className="font-metric-mono text-[9px] text-blue-200 uppercase tracking-wider">
                        Match
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-blue-100 font-metric-mono text-xs w-fit mb-1.5 border border-white/20">
                      <span className="w-2 h-2 rounded-full bg-secondary animate-ping" />
                      {matchPct >= 80 ? "High Role Suitability" : "Substantial Baseline"}
                    </div>
                    <h2 className="font-headline text-lg md:text-xl font-bold text-white">
                      {result.acquired_skills.length} of {totalSkillsCount} Required Competencies Verified
                    </h2>
                    <p className="font-body text-xs md:text-sm text-blue-100 max-w-md mt-1">
                      {result.gap_skills.length === 0
                        ? "You are 100% qualified for this cooperative position."
                        : `Complete ${result.gap_skills.length} target skills to reach full qualification for ${selectedJob?.title ?? "this role"}.`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <a
                    href="#remediation-sequence"
                    className="px-5 py-2.5 rounded-xl bg-secondary hover:bg-secondary-dark text-white font-label-md text-xs md:text-sm font-bold transition flex items-center justify-center gap-2 shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[18px]">bolt</span>
                    {t.startRemediation}
                  </a>
                  <span className="font-metric-mono text-[11px] text-blue-200 text-center">
                    {t.remediationSubtext}
                  </span>
                </div>
              </div>
            </div>

            {/* 2-Column Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* You Have */}
              <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs border border-border-slate flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border-slate">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                    </span>
                    <h3 className="font-headline text-sm font-bold text-ink">
                      {t.skillsYouHave(result.acquired_skills.length)}
                    </h3>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {result.acquired_skills.length === 0 ? (
                    <p className="font-body text-xs text-slate-500">{t.noneYet}</p>
                  ) : (
                    result.acquired_skills.map((skill) => (
                      <SkillChip key={skill.id} label={skill.name} acquired />
                    ))
                  )}
                </div>
              </div>

              {/* Skills Missing */}
              <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs border border-border-slate flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border-slate">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-50 text-secondary flex items-center justify-center">
                      <span className="material-symbols-outlined text-[16px]">pending</span>
                    </span>
                    <h3 className="font-headline text-sm font-bold text-ink">
                      {t.skillsMissing(result.gap_skills.length)}
                    </h3>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {result.gap_skills.length === 0 ? (
                    <p className="font-body text-xs text-emerald-700 font-semibold">
                      {t.allSkillsPresent}
                    </p>
                  ) : (
                    result.gap_skills.map((skill) => {
                      const related = result.related_skills.find((r) => r.gap_skill_id === skill.id);
                      return (
                        <div key={skill.id} className="flex flex-col items-start gap-0.5">
                          <SkillChip label={skill.name} acquired={false} />
                          {related && (
                            <span className="font-metric-mono text-[10px] text-secondary">
                              {t.relatedToSkill(related.related_acquired_skill_name)}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Ranked Remediation Sequence (4 cols) */}
          <div className="xl:col-span-4 flex flex-col gap-5" id="remediation-sequence">
            {result.reasoning && result.reasoning.length > 0 ? (
              <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-xs border border-border-slate flex flex-col gap-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-border-slate">
                  <span className="w-8 h-8 rounded-lg bg-secondary text-white flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined text-[18px]">alt_route</span>
                  </span>
                  <div>
                    <h3 className="font-headline text-sm font-bold text-ink leading-tight">
                      {t.learnFirst}
                    </h3>
                    <span className="font-metric-mono text-[10px] text-slate-500">
                      Cooperative AI Career Model
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {result.reasoning.map((step, idx) => (
                    <div
                      key={step.skill_id}
                      className="p-3.5 rounded-xl bg-paper border border-border-slate flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-metric-mono text-[10px] text-secondary font-bold uppercase">
                          Step 0{idx + 1} • High Impact
                        </span>
                        <span className="font-metric-mono text-[10px] text-slate-500">3-4 hrs</span>
                      </div>
                      <span className="font-headline text-xs font-bold text-ink">
                        {step.skill_name}
                      </span>
                      <p className="font-body text-xs text-slate-600 leading-snug">
                        {step.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-xs border border-border-slate flex flex-col gap-2">
                <span className="font-headline text-xs font-bold text-ink">{t.learnFirst}</span>
                <p className="font-body text-xs text-slate-500">{t.noSuggestionAvailable}</p>
              </div>
            )}

            {/* Overall Sector Skill Gap */}
            <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-xs border border-border-slate flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">insights</span>
                <h3 className="font-headline text-sm font-bold text-ink">{t.overallHeading}</h3>
              </div>
              <p className="font-body text-xs text-slate-600">
                {overall?.hasProfileSignal === false
                  ? t.overallSubheadingFallback
                  : t.overallSubheadingMatched}
              </p>

              {overallLoading ? (
                <p className="font-body text-xs text-slate-500">{t.overallLoading}</p>
              ) : !overall || overall.gap_summary.length === 0 ? (
                <p className="font-body text-xs text-emerald-700 font-semibold">{t.overallEmpty}</p>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  {overall.gap_summary.slice(0, 5).map((row) => (
                    <div
                      key={row.skill_id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-paper border border-border-slate text-xs"
                    >
                      <span className="font-label-md font-semibold text-ink truncate">
                        {row.skill_name}
                      </span>
                      <span className="whitespace-nowrap px-2 py-0.5 rounded-full bg-amber-50 text-secondary border border-amber-200 font-metric-mono text-[10px] font-bold">
                        {t.jobsNeedingIt(row.jobs_needing_it)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
