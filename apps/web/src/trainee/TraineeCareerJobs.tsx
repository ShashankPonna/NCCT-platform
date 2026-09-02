import { getJobs, getMyJobInterests, getVisibilitySettings, updateVisibilitySettings } from "@ncct/api-client";
import type { Job, JobInterest, VisibilitySettings } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { ErrorBanner, StatusPill } from "./pieces.js";

interface TraineeCareerJobsProps {
  accessToken: string;
}

type MyInterest = JobInterest & { jobs: { title: string; location: string | null } | null };

// Same data flow as the original TraineeJobBoard.tsx, re-skinned
// (design/stitch_ncct_trainee_portal/career_open_positions).
export function TraineeCareerJobs({ accessToken }: TraineeCareerJobsProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [visibility, setVisibility] = useState<VisibilitySettings | null>(null);
  const [myInterests, setMyInterests] = useState<MyInterest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJobs()
      .then(setJobs)
      .catch((err: Error) => setError(err.message));
    getVisibilitySettings(accessToken)
      .then(setVisibility)
      .catch((err: Error) => setError(err.message));
    getMyJobInterests(accessToken)
      .then(setMyInterests)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  async function handleToggleVisibility(visible: boolean) {
    setError(null);
    try {
      setVisibility(await updateVisibilitySettings(accessToken, visible));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const visible = visibility?.visible_to_employers ?? false;

  return (
    <div className="flex flex-col gap-8 py-6 md:py-8">
      <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-border-low-contrast bg-surface-card p-6 md:flex-row md:items-center">
        <div>
          <h1 className="font-headline text-headline-lg-mobile text-primary md:text-headline-lg">
            Open Positions
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Browse relevant jobs or let employers find you.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border-low-contrast bg-surface p-3">
          <div className="flex flex-col">
            <span className="text-label-md text-primary">Visibility Status</span>
            <span className="text-label-sm text-on-surface-variant">
              {visible ? "Let employers find me" : "Hidden from employers"}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            onClick={() => void handleToggleVisibility(!visible)}
            className={`relative h-6 w-12 flex-shrink-0 rounded-full transition-colors ${
              visible ? "bg-interactive" : "bg-outline-variant"
            }`}
          >
            <span
              className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white transition-transform ${
                visible ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          {myInterests.length > 0 && (
            <div className="rounded-xl border border-border-low-contrast bg-surface-card p-6">
              <div className="mb-4 flex items-center gap-2 border-b border-border-low-contrast pb-4">
                <span className="material-symbols-outlined text-secondary">star</span>
                <h2 className="font-headline text-headline-md text-primary">Shortlisted For</h2>
              </div>
              <div className="flex flex-col gap-4">
                {myInterests.map((interest) => (
                  <div key={interest.id} className="flex flex-col gap-2 rounded-lg p-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-label-md font-bold text-primary">
                        {interest.jobs?.title ?? "Unknown job"}
                      </h3>
                      <StatusPill status={interest.status} />
                    </div>
                    {interest.jobs?.location && (
                      <span className="text-label-sm text-on-surface-variant">{interest.jobs.location}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <h2 className="font-headline text-headline-md text-primary">Open Jobs</h2>
          {jobs.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">No open positions right now.</p>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-border-low-contrast bg-surface-card p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
                  <div className="flex-grow">
                    <h3 className="font-headline text-headline-md font-bold text-primary">{job.title}</h3>
                    {job.location && (
                      <span className="mt-1 flex items-center gap-1 text-label-md text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm">location_on</span>
                        {job.location}
                      </span>
                    )}
                  </div>
                </div>
                {job.required_skills && job.required_skills.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border-low-contrast pt-4">
                    {job.required_skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full border border-sky-200 bg-sky-100 px-3 py-1.5 text-label-sm text-sky-800"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
