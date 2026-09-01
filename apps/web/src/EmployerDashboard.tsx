import {
  createJob,
  getEmployerTrainees,
  getJobInterests,
  getJobs,
  shortlistTrainee,
} from "@ncct/api-client";
import type { Job, JobInterest, TraineeSearchResult } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface EmployerDashboardProps {
  accessToken: string;
}

type InterestRow = JobInterest & { profiles: { full_name: string | null } | null };

// Employer's own postings + trainee search/shortlist — same bare-bones
// scope as every other admin/employer panel in this repo (no job-picker
// beyond a plain list, no rich filters beyond keyword/location).
export function EmployerDashboard({ accessToken }: EmployerDashboardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [interests, setInterests] = useState<InterestRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [results, setResults] = useState<TraineeSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJobs().catch((err: Error) => setError(err.message));
    loadOwnJobs();
    // Deliberately not depending on searchQuery/searchLocation — search is
    // user-triggered (handleSearch), not live-as-you-type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOwnJobs() {
    setError(null);
    try {
      // GET /jobs has no owner filter (it's a public listing) — this repo
      // has no "my jobs" endpoint yet, so this fetches all jobs and shows
      // every one, same "no picker beyond what already exists" limitation
      // noted throughout this repo's admin UI.
      setJobs(await getJobs());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "");
    const location = String(form.get("location") ?? "") || undefined;
    const skillsRaw = String(form.get("required_skills") ?? "");
    const required_skills = skillsRaw
      ? skillsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    setError(null);
    try {
      await createJob(accessToken, { title, location, required_skills });
      e.currentTarget.reset();
      await loadOwnJobs();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadInterests(jobId: string) {
    setSelectedJobId(jobId);
    setError(null);
    try {
      setInterests(await getJobInterests(accessToken, jobId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      setResults(
        await getEmployerTrainees(accessToken, {
          q: searchQuery || undefined,
          location: searchLocation || undefined,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleShortlist(traineeId: string) {
    if (!selectedJobId) return;
    setError(null);
    try {
      await shortlistTrainee(accessToken, selectedJobId, traineeId);
      await loadInterests(selectedJobId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="attendance-panel">
      <h2>Jobs & Candidates</h2>
      {error && <p className="form-error">{error}</p>}

      <h3>Post a job</h3>
      <form className="inline-form" onSubmit={(e) => void handleCreateJob(e)}>
        <label>
          Title
          <input type="text" name="title" required />
        </label>
        <label>
          Location
          <input type="text" name="location" />
        </label>
        <label>
          Skills (comma-separated)
          <input type="text" name="required_skills" />
        </label>
        <button type="submit">Post job</button>
      </form>

      <h3>All jobs</h3>
      <ul>
        {jobs.map((job) => (
          <li key={job.id}>
            <button type="button" onClick={() => void loadInterests(job.id)}>
              {job.title}
            </button>
            {job.location ? ` — ${job.location}` : ""}
          </li>
        ))}
      </ul>

      {selectedJobId && (
        <>
          <h3>Shortlist for this job</h3>
          <ul>
            {interests.map((interest) => (
              <li key={interest.id}>
                {interest.profiles?.full_name ?? interest.trainee_id} — {interest.status}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Search trainee profiles</h3>
      <form className="inline-form" onSubmit={(e) => void handleSearch(e)}>
        <label>
          Skill / certification
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>
        <label>
          Location
          <input
            type="text"
            value={searchLocation}
            onChange={(e) => setSearchLocation(e.target.value)}
          />
        </label>
        <button type="submit">Search</button>
      </form>

      <ul>
        {results.map((result) => (
          <li key={result.trainee_id}>
            <strong>{result.full_name}</strong>
            {result.certificates.map((cert) => (
              <span key={cert.certificate_code}>
                {" "}
                — {cert.programme_title} ({cert.institution_name}, {cert.institution_location})
              </span>
            ))}
            {selectedJobId && (
              <button type="button" onClick={() => void handleShortlist(result.trainee_id)}>
                Shortlist
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
