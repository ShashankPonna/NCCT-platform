import { getJobs, getSkillGap } from "@ncct/api-client";
import type { Job, SkillGapResult } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { ErrorBanner, SkillChip } from "./pieces.js";

interface TraineeCareerSkillGapProps {
  accessToken: string;
}

// P1 Skill-Gap Analysis (docs/PRD.md §6.11, promoted from Phase-2 — see
// docs/DECISIONS.md #26), re-skinned
// (design/stitch_ncct_trainee_portal/career_skill_gap_check). The gap
// itself is always deterministic (required − acquired skills); the ranked
// "what to learn first" panel is the optional LLM reasoning layer and is
// rendered only when the API actually returned it — see docs/DECISIONS.md
// #26 for why that fallback exists and must stay visible as a distinct,
// non-error state, not hidden.
export function TraineeCareerSkillGap({ accessToken }: TraineeCareerSkillGapProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [result, setResult] = useState<SkillGapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJobs()
      .then(setJobs)
      .catch((err: Error) => setError(err.message));
  }, []);

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

  return (
    <div className="flex flex-col gap-6 py-6 md:py-8">
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-primary md:text-headline-lg">
          Skill-Gap Check
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Pick a job to see which of its required skills you already have.
        </p>
      </div>

      <label className="flex flex-col gap-2 text-label-md text-on-surface-variant">
        Job
        <select
          value={selectedJobId}
          onChange={(e) => handleSelectJob(e.target.value)}
          className="min-h-touch-target rounded border border-border-low-contrast bg-surface-container-lowest px-4 py-3 text-body-md focus:outline-none focus:ring-2 focus:ring-interactive"
        >
          <option value="">Choose a job posting…</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
              {job.location ? ` — ${job.location}` : ""}
            </option>
          ))}
        </select>
      </label>

      <ErrorBanner message={error} />

      {loading && <p className="text-body-md text-on-surface-variant">Checking your skill gap…</p>}

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
                Skills You Have ({result.acquired_skills.length})
              </h3>
              <div className="flex flex-wrap gap-3">
                {result.acquired_skills.length === 0 ? (
                  <p className="text-body-md text-on-surface-variant">None yet — keep learning!</p>
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
                Skills Missing ({result.gap_skills.length})
              </h3>
              <div className="flex flex-wrap gap-3">
                {result.gap_skills.length === 0 ? (
                  <p className="text-body-md text-status-shortlisted">
                    You have every skill this job requires!
                  </p>
                ) : (
                  result.gap_skills.map((skill) => (
                    <SkillChip key={skill.id} label={skill.name} acquired={false} />
                  ))
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
                  <h3 className="font-headline text-headline-md">What to learn first</h3>
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
                  A suggested learning order isn't available right now — your skill list above is still
                  complete and correct.
                </section>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
