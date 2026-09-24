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
  jobLabel: string;
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
}

const content: Record<Locale, TraineeCareerSkillGapText> = {
  en: {
    heading: "Skill-Gap Check",
    subheading: "Pick a job to see which of its required skills you already have.",
    jobLabel: "Job",
    choosePrompt: "Choose a job posting…",
    checking: "Checking your skill gap…",
    skillsYouHave: (count) => `Skills You Have (${count})`,
    noneYet: "None yet — keep learning!",
    skillsMissing: (count) => `Skills Missing (${count})`,
    allSkillsPresent: "You have every skill this job requires!",
    learnFirst: "What to learn first",
    noSuggestionAvailable:
      "A suggested learning order isn't available right now — your skill list above is still complete and correct.",
    sortedByFit: "Sorted by your best fit first, based on your certified skills.",
    fitSuffix: "fit",
    relatedToSkill: (name) => `Related to your "${name}" skill — may already partly cover this.`,
    overallHeading: "Your Overall Skill Gap",
    overallSubheadingMatched:
      "Across the jobs you're currently the best fit for, learning these would close the most gaps at once.",
    overallSubheadingFallback:
      "You don't have any certified skills yet, so this is based on the newest open postings instead of a personalized match.",
    overallEmpty: "No shared gaps found — you already cover what these jobs need, or none are tagged with skills yet.",
    overallLoading: "Checking your overall skill gap…",
    jobsNeedingIt: (count) => (count === 1 ? "Needed by 1 job" : `Needed by ${count} jobs`),
  },
  hi: {
    heading: "कौशल-अंतर जांच",
    subheading: "यह देखने के लिए एक नौकरी चुनें कि उसके आवश्यक कौशलों में से आपके पास पहले से कौन-से हैं।",
    jobLabel: "नौकरी",
    choosePrompt: "एक नौकरी पोस्टिंग चुनें…",
    checking: "आपका कौशल-अंतर जांचा जा रहा है…",
    skillsYouHave: (count) => `आपके पास मौजूद कौशल (${count})`,
    noneYet: "अभी तक कोई नहीं — सीखते रहें!",
    skillsMissing: (count) => `अनुपस्थित कौशल (${count})`,
    allSkillsPresent: "इस नौकरी के लिए आवश्यक सभी कौशल आपके पास हैं!",
    learnFirst: "पहले क्या सीखें",
    noSuggestionAvailable:
      "अभी सुझाया गया सीखने का क्रम उपलब्ध नहीं है — ऊपर आपकी कौशल सूची फिर भी पूर्ण और सही है।",
    sortedByFit: "आपके प्रमाणित कौशलों के आधार पर, आपके लिए सबसे उपयुक्त नौकरियां पहले क्रमबद्ध हैं।",
    fitSuffix: "उपयुक्तता",
    relatedToSkill: (name) => `आपके "${name}" कौशल से संबंधित — यह इसे आंशिक रूप से पहले से ही पूरा कर सकता है।`,
    overallHeading: "आपका समग्र कौशल-अंतर",
    overallSubheadingMatched:
      "जिन नौकरियों के लिए आप वर्तमान में सबसे उपयुक्त हैं, उनमें ये कौशल सीखने से एक साथ सबसे ज़्यादा अंतर दूर होंगे।",
    overallSubheadingFallback:
      "आपके पास अभी तक कोई प्रमाणित कौशल नहीं है, इसलिए यह व्यक्तिगत मिलान के बजाय नवीनतम खुली नौकरी पोस्टिंग पर आधारित है।",
    overallEmpty: "कोई साझा अंतर नहीं मिला — या तो आप इन नौकरियों की ज़रूरतें पहले से पूरी करते हैं, या अभी तक किसी में कौशल टैग नहीं किए गए हैं।",
    overallLoading: "आपका समग्र कौशल-अंतर जांचा जा रहा है…",
    jobsNeedingIt: (count) => `${count} नौकरियों के लिए आवश्यक`,
  },
};

// P1 Skill-Gap Analysis (docs/PRD.md §6.11, promoted from Phase-2 — see
// docs/DECISIONS.md #26), re-skinned
// (design/stitch_ncct_trainee_portal/career_skill_gap_check). The gap
// itself is always deterministic (required − acquired skills); the ranked
// "what to learn first" panel is the optional LLM reasoning layer and is
// rendered only when the API actually returned it — see docs/DECISIONS.md
// #26 for why that fallback exists and must stay visible as a distinct,
// non-error state, not hidden.
export function TraineeCareerSkillGap({ accessToken }: TraineeCareerSkillGapProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [result, setResult] = useState<SkillGapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // F13 AI Job Matching (DECISIONS.md #28) re-embeds the trainee's own
  // certified-skill profile — reused here purely to order the job picker,
  // best-fit first, instead of leaving it in whatever order the API
  // happened to return jobs in. A failure here is never surfaced as an
  // error: the job picker still works, just unsorted, same "optional
  // enrichment degrades silently" pattern as the ranked panel below.
  const [jobFit, setJobFit] = useState<Map<string, number>>(new Map());
  const [hasFitSignal, setHasFitSignal] = useState(false);

  // F11's multi-job counterpart (DECISIONS.md #45) — independent of the
  // one-job picker below, fetched once on mount.
  const [overall, setOverall] = useState<SkillGapAcrossJobsResult | null>(null);
  const [overallLoading, setOverallLoading] = useState(true);

  useEffect(() => {
    getSkillGapAcrossJobs(accessToken)
      .then(setOverall)
      .catch(() => {
        // Best-effort summary — the per-job check below is the feature
        // PRD §6.11 actually requires; this degrades to simply not showing.
      })
      .finally(() => setOverallLoading(false));
  }, [accessToken]);

  useEffect(() => {
    getJobs()
      .then(setJobs)
      .catch((err: Error) => setError(err.message));
    getJobMatches(accessToken)
      .then((matches) => {
        setHasFitSignal(matches.hasProfileSignal);
        setJobFit(new Map(matches.matches.map((m) => [m.id, m.similarity])));
      })
      .catch(() => {
        // Best-effort ordering only — the core skill-gap check works fine
        // without it.
      });
  }, [accessToken]);

  useEffect(() => {
    if (!selectedJobId) return;
    getSkillGap(accessToken, selectedJobId)
      .then(setResult)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, selectedJobId]);

  function handleSelectJob(jobId: string) {
    setSelectedJobId(jobId);
    setResult(null);
    setError(null);
    setLoading(Boolean(jobId));
  }

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  // Only reorder once there's an actual fit signal to sort by — a fresh
  // trainee with no certificates yet gets the plain, unsorted list rather
  // than a misleading "sorted" order with nothing behind it. Jobs outside
  // F13's own top-N match set (packages/constants' JOB_MATCH_COUNT) simply
  // keep their original relative order, appended after every matched job.
  const orderedJobs =
    hasFitSignal && jobFit.size > 0
      ? [...jobs].sort((a, b) => (jobFit.get(b.id) ?? -1) - (jobFit.get(a.id) ?? -1))
      : jobs;

  return (
    <div className="flex flex-col gap-6 py-6 md:py-8">
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-primary md:text-headline-lg">
          {t.heading}
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t.subheading}</p>
      </div>

      {/* F11's multi-job counterpart (DECISIONS.md #45) — "what should I
          learn next across every job I'm a fit for," distinct from the
          one-job picker below, which answers "am I ready for this job." */}
      <section className="rounded-xl border border-border-low-contrast bg-surface-card p-6">
        <h2 className="mb-1 flex items-center gap-2 font-headline text-headline-md text-primary">
          <span className="material-symbols-outlined text-secondary">insights</span>
          {t.overallHeading}
        </h2>
        <p className="mb-4 text-body-sm text-on-surface-variant">
          {overall?.hasProfileSignal === false ? t.overallSubheadingFallback : t.overallSubheadingMatched}
        </p>
        {overallLoading ? (
          <p className="text-body-md text-on-surface-variant">{t.overallLoading}</p>
        ) : !overall || overall.gap_summary.length === 0 ? (
          <p className="text-body-md text-status-shortlisted">{t.overallEmpty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {overall.gap_summary.slice(0, 5).map((row) => (
              <div
                key={row.skill_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-low-contrast bg-surface-container-lowest px-4 py-3"
              >
                <span className="text-label-md font-semibold text-on-surface">{row.skill_name}</span>
                <span className="whitespace-nowrap rounded-full bg-secondary-container px-3 py-1 text-label-sm font-bold text-on-secondary-container">
                  {t.jobsNeedingIt(row.jobs_needing_it)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <label className="flex flex-col gap-2 text-label-md text-on-surface-variant">
        {t.jobLabel}
        <select
          value={selectedJobId}
          onChange={(e) => handleSelectJob(e.target.value)}
          className="min-h-touch-target rounded border border-border-low-contrast bg-surface-container-lowest px-4 py-3 text-body-md focus:outline-none focus:ring-2 focus:ring-interactive"
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
          <span className="text-body-sm text-on-surface-variant">{t.sortedByFit}</span>
        )}
      </label>

      <ErrorBanner message={error} />

      {loading && <p className="text-body-md text-on-surface-variant">{t.checking}</p>}

      {result && (
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-12">
          <div className="flex flex-col gap-6 md:col-span-7">
            <section className="rounded-xl border border-border-low-contrast bg-surface-card p-6">
              <h2 className="mb-1 font-headline text-headline-md text-primary">{selectedJob?.title}</h2>
              {selectedJob?.location && (
                <p className="text-body-md text-on-surface-variant">{selectedJob.location}</p>
              )}
            </section>

            <section className="rounded-xl border border-border-low-contrast bg-surface-card p-6">
              <h3 className="mb-4 flex items-center gap-2 font-headline text-headline-md text-primary">
                <span className="material-symbols-outlined text-status-shortlisted">check_circle</span>
                {t.skillsYouHave(result.acquired_skills.length)}
              </h3>
              <div className="flex flex-wrap gap-3">
                {result.acquired_skills.length === 0 ? (
                  <p className="text-body-md text-on-surface-variant">{t.noneYet}</p>
                ) : (
                  result.acquired_skills.map((skill) => (
                    <SkillChip key={skill.id} label={skill.name} acquired />
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-border-low-contrast bg-surface-card p-6">
              <h3 className="mb-4 flex items-center gap-2 font-headline text-headline-md text-primary">
                <span className="material-symbols-outlined text-secondary">pending</span>
                {t.skillsMissing(result.gap_skills.length)}
              </h3>
              <div className="flex flex-wrap gap-3">
                {result.gap_skills.length === 0 ? (
                  <p className="text-body-md text-status-shortlisted">{t.allSkillsPresent}</p>
                ) : (
                  result.gap_skills.map((skill) => {
                    // Semantic partial-credit layer (DECISIONS.md #45) — an
                    // annotation on the chip, never a promotion to
                    // acquired: the trainee still genuinely lacks this
                    // exact skill, just has something close to it.
                    const related = result.related_skills.find((r) => r.gap_skill_id === skill.id);
                    return (
                      <div key={skill.id} className="flex flex-col items-start gap-1">
                        <SkillChip label={skill.name} acquired={false} />
                        {related && (
                          <p className="max-w-[16rem] text-label-sm text-on-surface-variant">
                            {t.relatedToSkill(related.related_acquired_skill_name)}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <div className="md:col-span-5">
            {result.reasoning && result.reasoning.length > 0 ? (
              <section className="sticky top-24 overflow-hidden rounded-xl bg-primary p-6 text-on-primary shadow-lg">
                <div className="mb-6 flex items-center gap-3 border-b border-primary-container pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                    <span className="material-symbols-outlined text-white">psychology</span>
                  </div>
                  <h3 className="font-headline text-headline-md">{t.learnFirst}</h3>
                </div>
                <div className="flex flex-col gap-6">
                  {[...result.reasoning]
                    .sort((a, b) => a.rank - b.rank)
                    .map((item) => (
                      <div key={item.skill_id} className="flex gap-4">
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-sm font-bold text-on-secondary-container">
                          {item.rank}
                        </span>
                        <div>
                          <h4 className="mb-1 text-label-md font-bold">{item.skill_name}</h4>
                          <p className="text-body-md text-inverse-primary opacity-90">{item.reason}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            ) : (
              result.gap_skills.length > 0 && (
                <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-center text-body-md text-on-surface-variant">
                  {t.noSuggestionAvailable}
                </section>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
