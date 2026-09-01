import {
  getJobs,
  getMyJobInterests,
  getVisibilitySettings,
  updateVisibilitySettings,
} from "@ncct/api-client";
import type { Job, JobInterest, VisibilitySettings } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface TraineeJobBoardProps {
  accessToken: string;
}

type MyInterest = JobInterest & { jobs: { title: string; location: string | null } | null };

// Bare-bones: a job board list, an opt-in visibility toggle, and a list of
// shortlist notifications — same "minimal, not gold-plated" scope as every
// other trainee-facing panel in this repo.
export function TraineeJobBoard({ accessToken }: TraineeJobBoardProps) {
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

  return (
    <section className="attendance-panel">
      <h2>Jobs</h2>

      <label>
        <input
          type="checkbox"
          checked={visibility?.visible_to_employers ?? false}
          onChange={(e) => void handleToggleVisibility(e.target.checked)}
        />
        Visible to employers (required to appear in employer searches or be shortlisted)
      </label>

      {error && <p className="form-error">{error}</p>}

      {myInterests.length > 0 && (
        <>
          <h3>You've been shortlisted for</h3>
          <ul>
            {myInterests.map((interest) => (
              <li key={interest.id}>
                {interest.jobs?.title ?? "Unknown job"}
                {interest.jobs?.location ? ` — ${interest.jobs.location}` : ""} ({interest.status})
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Open positions</h3>
      <ul>
        {jobs.map((job) => (
          <li key={job.id}>
            <strong>{job.title}</strong>
            {job.location ? ` — ${job.location}` : ""}
            {job.required_skills && job.required_skills.length > 0
              ? ` (${job.required_skills.join(", ")})`
              : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
