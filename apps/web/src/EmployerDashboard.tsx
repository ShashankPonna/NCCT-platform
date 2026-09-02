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

export function EmployerDashboard({ accessToken }: EmployerDashboardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [interests, setInterests] = useState<InterestRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [results, setResults] = useState<TraineeSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getJobs().catch((err: Error) => setError(err.message));
    loadOwnJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOwnJobs() {
    setError(null);
    try {
      const fetchedJobs = await getJobs();
      setJobs(fetchedJobs);
      if (fetchedJobs.length > 0 && !selectedJobId) {
        void loadInterests(fetchedJobs[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    const title = String(form.get("title") ?? "").trim();
    const location = String(form.get("location") ?? "").trim() || undefined;
    const skillsRaw = String(form.get("required_skills") ?? "");
    const required_skills = skillsRaw
      ? skillsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    setError(null);
    setBusy(true);
    try {
      await createJob(accessToken, { title, location, required_skills });
      formEl.reset();
      await loadOwnJobs();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
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
    setBusy(true);
    try {
      setResults(
        await getEmployerTrainees(accessToken, {
          q: searchQuery || undefined,
          location: searchLocation || undefined,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
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

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-8 text-left">
      {/* Page Header */}
      <header className="border-b border-outline-variant pb-4">
        <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface m-0">
          Employer &amp; Placement Exchange
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Post career opportunities, review interested candidates, and search certified rural talent.
        </p>
      </header>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      )}

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
        {/* Left Column: Post Job & Active Jobs (Span 5) */}
        <div className="lg:col-span-5 flex flex-col gap-gutter">
          {/* Post a Job Card */}
          <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">add_circle</span>
              Post Opportunity
            </h3>
            <form onSubmit={(e) => void handleCreateJob(e)} className="space-y-4">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">
                  Job / Role Title *
                </label>
                <input
                  name="title"
                  required
                  placeholder="e.g. Cooperative Accounts Officer"
                  className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  type="text"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">Location</label>
                <input
                  name="location"
                  placeholder="e.g. Pune, Maharashtra / Remote"
                  className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  type="text"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">
                  Required Skills (Comma-separated)
                </label>
                <input
                  name="required_skills"
                  placeholder="e.g. Bookkeeping, Tally, Agronomy"
                  className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  type="text"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-touch-target bg-cta text-on-primary hover:bg-cta-hover rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                <span>{busy ? "Posting..." : "Post Opportunity"}</span>
              </button>
            </form>
          </div>

          {/* All Jobs List Card */}
          <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-secondary">work</span>
              Active Postings ({jobs.length})
            </h3>
            {jobs.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No jobs posted yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1 list-none p-0 m-0">
                {jobs.map((job) => {
                  const isSelected = job.id === selectedJobId;
                  return (
                    <li
                      key={job.id}
                      onClick={() => void loadInterests(job.id)}
                      className={`p-3 rounded-lg cursor-pointer border transition-all ${
                        isSelected
                          ? "bg-surface-container border-primary"
                          : "bg-surface-container-lowest border-outline-variant/40 hover:bg-surface-container-low"
                      }`}
                    >
                      <div className="font-body-md font-bold text-primary">{job.title}</div>
                      <div className="font-label-sm text-on-surface-variant flex items-center gap-2 mt-1">
                        <span className="material-symbols-outlined text-[14px]">location_on</span>
                        <span>{job.location || "Flexible"}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right Column: Candidates & Trainee Search (Span 7) */}
        <div className="lg:col-span-7 flex flex-col gap-gutter">
          {/* Candidates / Shortlist for selected job */}
          {selectedJobId && (
            <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface m-0">
                    Candidate Responses
                  </h3>
                  <p className="font-label-sm text-on-surface-variant mt-0.5">
                    for &ldquo;{selectedJob?.title}&rdquo;
                  </p>
                </div>
                <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm font-bold">
                  {interests.length} Candidates
                </span>
              </div>

              {interests.length === 0 ? (
                <div className="p-6 text-center text-on-surface-variant text-sm bg-surface-container-low rounded-lg">
                  No applicants or shortlist entries for this role yet. Search verified trainees below.
                </div>
              ) : (
                <ul className="flex flex-col gap-2 list-none p-0 m-0">
                  {interests.map((interest) => (
                    <li
                      key={interest.id}
                      className="flex items-center justify-between p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/50"
                    >
                      <div>
                        <p className="font-body-md font-semibold text-primary m-0">
                          {interest.profiles?.full_name ?? `Candidate #${interest.trainee_id.slice(0, 8)}`}
                        </p>
                        <p className="font-label-sm text-on-surface-variant m-0 mt-0.5">
                          Status: <span className="capitalize font-bold text-primary">{interest.status}</span>
                        </p>
                      </div>
                      <span className="bg-status-success/15 text-status-success px-2.5 py-1 rounded-full font-label-sm font-bold uppercase">
                        {interest.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Search Certified Trainees Card */}
          <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2 flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">person_search</span>
              Search Certified Trainees
            </h3>
            <p className="font-body-sm text-on-surface-variant mb-4">
              Explore candidates certified by NCCT / VAMNICOM / RICM cooperative institutions.
            </p>

            <form onSubmit={(e) => void handleSearch(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Skill or course keyword..."
                className="h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary outline-none"
              />
              <input
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                placeholder="Location (e.g. Pune)..."
                className="h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary outline-none"
              />
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-6 h-touch-target bg-primary text-on-primary rounded-full font-label-md text-label-md hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">search</span>
                  Search Trainees
                </button>
              </div>
            </form>

            {/* Results List */}
            {results.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-outline-variant/50 max-h-80 overflow-y-auto pr-1">
                {results.map((result) => (
                  <div
                    key={result.trainee_id}
                    className="p-4 bg-surface-container-lowest border border-outline-variant rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                  >
                    <div>
                      <h4 className="font-body-md font-bold text-primary m-0">{result.full_name}</h4>
                      <div className="mt-1 space-y-1">
                        {result.certificates.map((cert) => (
                          <p key={cert.certificate_code} className="font-label-sm text-on-surface-variant m-0">
                            • {cert.programme_title} ({cert.institution_name})
                          </p>
                        ))}
                      </div>
                    </div>

                    {selectedJobId && (
                      <button
                        type="button"
                        onClick={() => void handleShortlist(result.trainee_id)}
                        className="px-4 py-2 bg-cta text-on-primary hover:bg-cta-hover rounded-full font-label-md text-xs font-semibold shrink-0 cursor-pointer shadow-xs"
                      >
                        Shortlist Candidate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
