import {
  createJob,
  createSkill,
  getEmployerTrainees,
  getJobInterests,
  getJobs,
  getJobSkills,
  getSkills,
  setJobSkills,
  shortlistTrainee,
  updateJobInterestStatus,
} from "@ncct/api-client";
import type { Job, JobInterest, JobInterestStatus, Skill, TraineeSearchResult } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { saveFile } from "./saveFile.js";
import { SkillChips, SkillPicker } from "./SkillPicker.js";

interface EmployerDashboardProps {
  accessToken: string;
  // GET /jobs is the public job board (every employer's postings), so the
  // caller's id is what narrows "My Postings" to this employer's own.
  currentUserId: string;
}

type InterestRow = JobInterest & { profiles: { full_name: string | null } | null };

// One row of the talent search. Every field comes from the real search
// result — nothing is padded with invented values (docs/DECISIONS.md #67);
// a trainee with no certificate yet simply shows none.
interface CandidateItem {
  id: string;
  name: string;
  initials: string;
  certificateCount: number;
  certId: string | null;
  skills: string[];
  course: string | null;
  institute: string | null;
  location: string | null;
}

function toCandidate(result: TraineeSearchResult): CandidateItem {
  const latest = result.certificates[0];
  const name = result.full_name?.trim() || `Trainee ${result.trainee_id.slice(0, 4)}`;
  return {
    id: result.trainee_id,
    name,
    initials: name.slice(0, 2).toUpperCase(),
    certificateCount: result.certificates.length,
    certId: latest?.certificate_code ?? null,
    skills: result.skills.map((s) => s.name),
    course: latest?.programme_title ?? null,
    institute: latest?.institution_name ?? null,
    location: latest?.institution_location ?? null,
  };
}

const STATUS_LABEL: Record<JobInterestStatus, string> = {
  shortlisted: "Shortlisted",
  viewed: "Viewed",
  contacted: "Contacted",
};

function csvCell(value: string | number | null): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function EmployerDashboard({ accessToken, currentUserId }: EmployerDashboardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [interests, setInterests] = useState<InterestRow[]>([]);
  const [results, setResults] = useState<TraineeSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingTraineeId, setPendingTraineeId] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSkill, setFilterSkill] = useState("all");
  const [sortBy, setSortBy] = useState<"certificates" | "name">("certificates");

  const [showPostJobModal, setShowPostJobModal] = useState(false);
  const [showManageJobsModal, setShowManageJobsModal] = useState(false);
  const [contactToast, setContactToast] = useState<string | null>(null);

  // Skills taxonomy state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [newSkillName, setNewSkillName] = useState("");
  const [selectedJobSkills, setSelectedJobSkills] = useState<Skill[]>([]);

  useEffect(() => {
    loadOwnJobs();
    getSkills(accessToken)
      .then(setSkills)
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real, opted-in trainees only (the API starts from visible_to_employers).
  // Re-fetched whenever a taxonomy skill is picked — an exact server-side
  // match (DECISIONS.md #45).
  useEffect(() => {
    getEmployerTrainees(accessToken, filterSkill !== "all" ? { skill_id: filterSkill } : {})
      .then(setResults)
      .catch((err: Error) => setError(err.message));
  }, [accessToken, filterSkill]);

  async function loadOwnJobs() {
    setError(null);
    try {
      const ownJobs = (await getJobs()).filter((job) => job.employer_id === currentUserId);
      setJobs(ownJobs);
      if (ownJobs.length > 0 && !selectedJobId) {
        void loadInterests(ownJobs[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadInterests(jobId: string) {
    setSelectedJobId(jobId);
    setError(null);
    try {
      const [jobInterests, jobSkills] = await Promise.all([
        getJobInterests(accessToken, jobId),
        getJobSkills(jobId),
      ]);
      setInterests(jobInterests);
      setSelectedJobSkills(jobSkills);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function showToast(message: string) {
    setContactToast(message);
    setTimeout(() => setContactToast(null), 4500);
  }

  async function handleCreateJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
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
      const created = await createJob(accessToken, { title, location, required_skills });
      if (selectedSkillIds.size > 0) {
        await setJobSkills(accessToken, created.id, [...selectedSkillIds]);
      }
      setSelectedSkillIds(new Set());
      await loadOwnJobs();
      setShowPostJobModal(false);
      showToast(`Job posting "${title}" published.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleSkillSelection(skillId: string) {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  async function handleCreateSkill() {
    const name = newSkillName.trim();
    if (!name) return;
    setError(null);
    try {
      const skill = await createSkill(accessToken, { name });
      setSkills((prev) => [...prev, skill].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSkillIds((prev) => new Set(prev).add(skill.id));
      setNewSkillName("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const candidates = results.map(toCandidate);
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  const filteredCandidates = candidates
    .filter((cand) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return [cand.name, cand.certId, cand.course, cand.location, ...cand.skills].some((field) =>
        field?.toLowerCase().includes(q),
      );
    })
    .sort((a, b) =>
      sortBy === "certificates"
        ? b.certificateCount - a.certificateCount || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  // The shortlist *is* the selected job's job_interests rows — saved
  // server-side, and each one notifies the trainee (DECISIONS.md #65).
  const shortlistedIds = new Set(interests.map((interest) => interest.trainee_id));

  async function handleShortlist(traineeId: string) {
    if (!selectedJobId) {
      setError('Choose one of your job postings first ("My Postings") — a shortlist is always for a specific job.');
      return;
    }
    setError(null);
    setPendingTraineeId(traineeId);
    try {
      await shortlistTrainee(accessToken, selectedJobId, traineeId);
      await loadInterests(selectedJobId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingTraineeId(null);
    }
  }

  // "Contacted" is a real status on the shortlist entry, and changing it
  // sends the trainee an in-app notification — replacing the old buttons
  // that faked an SMS/email dispatch and showed a made-up phone number.
  async function markContacted(targets: InterestRow[]) {
    if (!selectedJobId || targets.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      await Promise.all(
        targets.map((interest) => updateJobInterestStatus(accessToken, selectedJobId, interest.id, "contacted")),
      );
      await loadInterests(selectedJobId);
      showToast(
        targets.length === 1
          ? `${targets[0].profiles?.full_name ?? "Candidate"} marked as contacted — they've been notified in the app.`
          : `${targets.length} candidates marked as contacted — each has been notified in the app.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadShortlistCsv() {
    const header = ["Candidate Name", "Certificate Code", "Programme", "Institution", "Location", "Status"];
    const rows = interests.map((interest) => {
      const cand = candidateById.get(interest.trainee_id);
      return [
        interest.profiles?.full_name ?? cand?.name ?? interest.trainee_id,
        cand?.certId ?? "",
        cand?.course ?? "",
        cand?.institute ?? "",
        cand?.location ?? "",
        STATUS_LABEL[interest.status],
      ];
    });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    // Leading BOM so Excel reads non-English names as UTF-8.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const jobPart = selectedJob ? selectedJob.title.replace(/[\\/:*?"<>|]+/g, "-") : "shortlist";
    await saveFile(blob, `Shortlist - ${jobPart}.csv`);
  }

  return (
    <div className="flex flex-col w-full text-left gap-space-lg">
      {/* Toast Alert */}
      {contactToast && (
        <div className="p-space-md bg-tertiary-fixed text-on-tertiary-fixed-variant rounded-xl flex items-center justify-between shadow-sm animate-fade-in border border-on-tertiary-container/20">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[22px] text-on-tertiary-container">check_circle</span>
            <span className="font-label-md text-label-md font-bold">{contactToast}</span>
          </div>
          <button type="button" onClick={() => setContactToast(null)} className="p-1 hover:opacity-70">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md font-medium">{error}</p>
        </div>
      )}

      {/* Top Action & Meta Header */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-lowest p-6 rounded-2xl shadow-xs border border-border-slate">
        <div className="flex flex-col gap-space-xs max-w-2xl">
          <div className="flex items-center gap-space-xs">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-primary font-label-sm text-label-sm uppercase tracking-wider font-bold border border-blue-200">
              <span className="material-symbols-outlined text-[14px] text-secondary">verified_user</span> Opted-in trainees only
            </span>
            <span className="text-outline-variant font-body-sm text-body-sm">•</span>
            <span className="font-metric-mono text-body-sm text-on-surface-variant">
              Candidates: <span className="font-bold text-primary">{candidates.length}</span>
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
            Trainee Search & Talent Pool
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Search trainees who have opted in to employer visibility, and shortlist them for your job postings.
          </p>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
          <button
            type="button"
            onClick={() => setShowManageJobsModal(true)}
            className="min-h-[48px] px-space-md py-space-sm bg-paper text-on-surface hover:bg-slate-200 border border-border-slate font-label-md text-label-md rounded-xl flex items-center gap-space-xs transition-colors shadow-2xs cursor-pointer font-bold"
          >
            <span className="material-symbols-outlined text-[20px]">work</span>
            <span>My Postings ({jobs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setShowPostJobModal(true)}
            className="min-h-[48px] px-space-lg py-space-sm bg-secondary-container hover:bg-secondary text-primary hover:text-on-primary font-label-lg text-label-lg rounded-xl flex items-center gap-space-xs transition-all shadow-xs active:translate-y-0.5 font-bold cursor-pointer"
          >
            <span className="material-symbols-outlined text-[22px]">add_circle</span>
            <span>Post a Job</span>
          </button>
        </div>
      </section>

      {/* Filter & Discovery Hub */}
      <section className="bg-surface-container-lowest p-space-md rounded-2xl shadow-xs flex flex-col gap-space-md border border-border-slate">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md">
          {/* Search Input */}
          <div className="md:col-span-7 flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1" htmlFor="search-input">
              Name, skill, or certificate code
            </label>
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                badge
              </span>
              <input
                id="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Asha, Financial Record-Keeping, EDU-JU3E8VT3"
                type="text"
                className="w-full min-h-[48px] pl-10 pr-space-md bg-paper-light text-on-surface rounded-xl font-body-sm text-body-sm focus:outline-none focus:bg-surface-card focus:ring-2 focus:ring-secondary-container border border-border-slate/60"
              />
            </div>
          </div>

          {/* Skills Dropdown — exact taxonomy match, filtered server-side */}
          <div className="md:col-span-5 flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="filter-skills">
              Skill
            </label>
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                psychology
              </span>
              <select
                id="filter-skills"
                value={filterSkill}
                onChange={(e) => setFilterSkill(e.target.value)}
                className="w-full min-h-[48px] pl-10 pr-8 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm appearance-none focus:outline-none focus:ring-2 focus:ring-secondary-container border border-outline-variant/40 cursor-pointer"
              >
                <option value="all">All skills</option>
                {skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[20px]">
                expand_more
              </span>
            </div>
          </div>
        </div>

        {(filterSkill !== "all" || searchQuery) && (
          <div className="flex items-center flex-wrap gap-space-xs pt-space-xs border-t border-outline-variant/20">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider pr-space-xs font-bold">
              Filters Applied:
            </span>
            {filterSkill !== "all" && (
              <span className="inline-flex items-center gap-1.5 px-space-sm py-1 rounded bg-surface-container text-primary font-body-sm text-body-sm font-medium">
                Skill: {skills.find((s) => s.id === filterSkill)?.name ?? filterSkill}
                <button type="button" onClick={() => setFilterSkill("all")} className="hover:text-error flex items-center">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1.5 px-space-sm py-1 rounded bg-surface-container text-primary font-body-sm text-body-sm font-medium">
                Keyword: {searchQuery}
                <button type="button" onClick={() => setSearchQuery("")} className="hover:text-error flex items-center">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFilterSkill("all");
              }}
              className="font-label-sm text-label-sm text-secondary hover:underline ml-space-sm font-bold cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </section>

      {/* 2-Column Main Layout: Candidate Roster & Shortlist Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        <section className="lg:col-span-8 flex flex-col gap-space-md">
          <div className="bg-surface-container-lowest rounded-2xl shadow-xs overflow-hidden border border-border-slate">
            {/* Table Control & Sorting Header */}
            <div className="px-space-md py-space-sm bg-paper-light flex items-center justify-between gap-space-sm flex-wrap border-b border-border-slate/60">
              <div className="flex items-center gap-space-sm">
                <span className="font-headline-sm text-headline-sm text-primary font-bold">Trainees</span>
                <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary font-metric-mono text-label-sm font-bold">
                  {filteredCandidates.length} Found
                </span>
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "certificates" | "name")}
                  className="bg-surface-container-low text-on-surface rounded-lg px-2.5 py-1 font-body-sm text-body-sm border border-border-slate focus:outline-none cursor-pointer"
                >
                  <option value="certificates">Most certificates</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </div>
            </div>

            {!selectedJob && (
              <p className="px-space-md py-space-sm bg-amber-50 text-amber-900 border-b border-amber-200 font-body-sm text-body-sm">
                {jobs.length === 0
                  ? 'Post a job first ("Post a Job") — shortlisting is always for one of your job postings.'
                  : 'Pick a job in "My Postings" to shortlist trainees for it.'}
              </p>
            )}

            {/* Trainee Candidates Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-paper text-on-surface-variant font-label-md text-label-md border-b border-border-slate">
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs">Trainee</th>
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs">Skills</th>
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs">Latest Certificate</th>
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs">Location</th>
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs text-right">Shortlist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-slate/40 font-body-sm text-body-sm">
                  {filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-on-surface-variant">
                        {candidates.length === 0
                          ? "No trainees have opted in to employer visibility yet."
                          : "No trainees match your current filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredCandidates.map((cand) => {
                      const isShortlisted = shortlistedIds.has(cand.id);
                      return (
                        <tr key={cand.id} className="hover:bg-paper-light/60 transition-colors">
                          <td className="py-space-md px-space-md">
                            <div className="flex items-center gap-space-sm">
                              <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center font-display text-headline-sm shrink-0 font-bold shadow-2xs">
                                {cand.initials}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="font-label-lg text-label-lg text-primary truncate font-bold">
                                    {cand.name}
                                  </span>
                                  {cand.certificateCount > 0 && (
                                    <span
                                      className="material-symbols-outlined text-[16px] text-on-tertiary-container shrink-0"
                                      title={`Holds ${cand.certificateCount} EduDisha certificate${cand.certificateCount === 1 ? "" : "s"} — each can be checked on the public verification page`}
                                    >
                                      verified
                                    </span>
                                  )}
                                </div>
                                <span className="font-metric-mono text-label-sm text-on-surface-variant">
                                  {cand.certId ? `Cert: ${cand.certId}` : "No certificate yet"}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-space-md px-space-md">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {cand.skills.length === 0 ? (
                                <span className="text-on-surface-variant">—</span>
                              ) : (
                                cand.skills.map((skill) => (
                                  <span
                                    key={skill}
                                    className="px-2 py-0.5 rounded-lg bg-paper text-ink font-metric-mono text-xs border border-border-slate/50"
                                  >
                                    {skill}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="py-space-md px-space-md">
                            <div className="flex flex-col">
                              <span className="font-label-md text-label-md text-primary font-bold">{cand.course ?? "—"}</span>
                              {cand.institute && (
                                <span className="font-body-sm text-body-sm text-on-surface-variant">{cand.institute}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-space-md px-space-md">
                            <div className="flex items-center gap-1 font-body-sm text-body-sm text-on-surface">
                              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">place</span>
                              {cand.location ?? "—"}
                            </div>
                          </td>
                          <td className="py-space-md px-space-md text-right">
                            <button
                              type="button"
                              onClick={() => void handleShortlist(cand.id)}
                              disabled={isShortlisted || pendingTraineeId === cand.id}
                              title={selectedJob ? `Shortlist for "${selectedJob.title}"` : "Pick a job posting first"}
                              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl inline-flex items-center gap-1 transition-all font-bold text-xs shadow-2xs ${
                                isShortlisted
                                  ? "bg-primary text-on-primary cursor-default"
                                  : "bg-paper hover:bg-secondary-container hover:text-primary text-on-surface border border-border-slate cursor-pointer disabled:opacity-50"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {isShortlisted ? "check_circle" : "bookmark_add"}
                              </span>
                              <span>{isShortlisted ? "Shortlisted" : pendingTraineeId === cand.id ? "Saving…" : "Shortlist"}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-space-md py-space-sm bg-paper-light border-t border-border-slate/60">
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Showing <strong className="text-on-surface font-metric-mono">{filteredCandidates.length}</strong> of{" "}
                <strong className="text-on-surface font-metric-mono">{candidates.length}</strong> opted-in trainee
                {candidates.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </section>

        {/* Side Panel — the selected job's real shortlist (job_interests) */}
        <aside className="lg:col-span-4 flex flex-col gap-space-md sticky top-20">
          <div className="bg-surface-container-lowest rounded-2xl shadow-xs overflow-hidden flex flex-col border border-border-slate">
            <div className="p-space-md bg-primary-container text-on-primary flex items-center justify-between gap-space-xs">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary-container text-[24px]">fact_check</span>
                  <h2 className="font-headline-sm text-headline-sm font-bold">Shortlist</h2>
                </div>
                <span className="font-body-sm text-body-sm opacity-80 truncate">
                  {selectedJob ? `For: ${selectedJob.title}` : "No job selected"}
                </span>
              </div>
              <span className="px-2.5 py-0.5 bg-secondary-container text-primary rounded-full font-metric-mono text-label-sm font-bold shadow-xs shrink-0">
                {interests.length}
              </span>
            </div>

            <div className="p-space-md flex flex-col gap-space-sm max-h-[520px] overflow-y-auto custom-scrollbar">
              {interests.length === 0 ? (
                <p className="text-center py-8 text-on-surface-variant text-sm">
                  {selectedJob
                    ? 'Nobody shortlisted for this job yet. Click "Shortlist" on a trainee.'
                    : 'Pick a job in "My Postings" to see its shortlist.'}
                </p>
              ) : (
                interests.map((interest) => {
                  const cand = candidateById.get(interest.trainee_id);
                  const name = interest.profiles?.full_name ?? cand?.name ?? `Trainee ${interest.trainee_id.slice(0, 4)}`;
                  return (
                    <div
                      key={interest.id}
                      className="p-space-sm bg-paper-light rounded-xl flex flex-col gap-space-xs border border-border-slate/60"
                    >
                      <div className="flex items-start justify-between gap-space-xs">
                        <div className="flex flex-col min-w-0">
                          <span className="font-label-md text-label-md text-primary leading-tight font-bold truncate">{name}</span>
                          {cand?.course && (
                            <span className="font-body-sm text-body-sm text-on-surface-variant text-xs truncate">{cand.course}</span>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                            interest.status === "contacted"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-blue-50 text-blue-800 border border-blue-200"
                          }`}
                        >
                          {STATUS_LABEL[interest.status]}
                        </span>
                      </div>
                      {interest.status !== "contacted" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void markContacted([interest])}
                          className="self-end min-h-[36px] px-space-md py-1 bg-primary hover:bg-primary/90 text-on-primary font-label-sm text-label-sm rounded-xl flex items-center gap-1 transition-all shadow-2xs font-bold cursor-pointer disabled:opacity-50"
                          title="Records that you've reached out, and notifies the trainee in the app"
                        >
                          <span className="material-symbols-outlined text-[16px]">mark_email_read</span>
                          <span>Mark contacted</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-space-md bg-paper-light flex flex-col gap-space-xs border-t border-border-slate/60">
              <button
                type="button"
                disabled={busy || interests.every((interest) => interest.status === "contacted")}
                onClick={() => void markContacted(interests.filter((interest) => interest.status !== "contacted"))}
                className="w-full min-h-[48px] px-space-md bg-secondary-container hover:bg-secondary text-primary hover:text-on-primary font-label-md text-label-md rounded-xl flex items-center justify-center gap-space-xs transition-all shadow-xs font-bold cursor-pointer disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">forward_to_inbox</span>
                <span>Mark all as contacted</span>
              </button>
              <button
                type="button"
                disabled={interests.length === 0}
                onClick={() => void handleDownloadShortlistCsv()}
                className="w-full min-h-[48px] px-space-md bg-surface-card hover:bg-paper text-on-surface font-label-md text-label-md rounded-xl flex items-center justify-center gap-space-xs transition-colors shadow-2xs border border-border-slate font-bold cursor-pointer disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
                <span>Download Shortlist (CSV)</span>
              </button>
            </div>
          </div>

          <div className="p-space-md bg-paper-light rounded-2xl flex items-start gap-space-sm border border-border-slate/60">
            <span className="material-symbols-outlined text-secondary text-[24px] shrink-0 mt-0.5">shield</span>
            <div className="flex flex-col gap-0.5">
              <span className="font-label-md text-label-md text-primary font-bold">About this list</span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Only trainees who have opted in to employer visibility appear here. Every certificate code can be checked on
                the platform&apos;s public certificate verification page.
              </p>
            </div>
          </div>
        </aside>
      </div>
      {/* Post Opportunity Modal */}
      {showPostJobModal && (
        <div className="fixed inset-0 bg-primary/60 backdrop-blur-xs z-50 flex items-center justify-center p-space-md animate-fade-in">
          <div className="bg-surface-container-lowest rounded-2xl max-w-xl w-full p-space-lg shadow-2xl space-y-space-md border border-border-slate max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/30">
              <div className="flex items-center gap-space-xs">
                <div className="w-8 h-8 rounded bg-secondary-container flex items-center justify-center text-primary font-bold">
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Post New Job Opening</h3>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Target EduDisha Certified Cooperative Candidates
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPostJobModal(false)}
                className="w-10 h-10 rounded flex items-center justify-center hover:bg-surface-container text-on-surface-variant cursor-pointer"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateJob(e)} className="space-y-4">
              <div>
                <label className="block font-label-md text-label-md text-primary mb-1 font-semibold">
                  Job / Role Title <span className="text-error">*</span>
                </label>
                <input
                  name="title"
                  required
                  placeholder="e.g. PACS Day-Book Accountant / Cold Storage In-charge"
                  className="w-full h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:ring-2 focus:ring-secondary-container border border-outline-variant/40"
                  type="text"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-primary mb-1 font-semibold">
                  Location (Region / Remote)
                </label>
                <input
                  name="location"
                  placeholder="e.g. Anand, Gujarat / Pune, Maharashtra"
                  className="w-full h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:ring-2 focus:ring-secondary-container border border-outline-variant/40"
                  type="text"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-primary mb-1 font-semibold">
                  Required Competencies (Comma-separated)
                </label>
                <input
                  name="required_skills"
                  placeholder="e.g. PACS Accounting, Tally Prime, Milk Fat Testing"
                  className="w-full h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:ring-2 focus:ring-secondary-container border border-outline-variant/40"
                  type="text"
                />
              </div>

              {/* Skills Taxonomy Picker */}
              <div className="pt-2 border-t border-outline-variant/20">
                <label className="block font-label-md text-label-md text-primary mb-2 font-semibold">
                  Tag Taxonomy Skills (for AI Skill-Gap Matching)
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="New taxonomy skill..."
                    className="flex-1 h-10 px-3 bg-surface-container-low border border-outline-variant/40 rounded text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateSkill()}
                    className="px-3 bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-label-sm rounded font-bold"
                  >
                    + Add
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto">
                  <SkillPicker
                    skills={skills}
                    selectedIds={selectedSkillIds}
                    onToggle={toggleSkillSelection}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-space-sm pt-space-xs border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setShowPostJobModal(false)}
                  className="min-h-[48px] px-space-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[48px] px-space-xl bg-secondary-container text-primary font-label-md text-label-md rounded shadow-xs hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5 transition-all font-bold cursor-pointer disabled:opacity-50"
                >
                  {busy ? "Publishing..." : "Publish Job Opportunity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Postings Modal */}
      {showManageJobsModal && (
        <div className="fixed inset-0 bg-primary/60 backdrop-blur-xs z-50 flex items-center justify-center p-space-md animate-fade-in">
          <div className="bg-surface-container-lowest rounded-2xl max-w-2xl w-full p-space-lg shadow-2xl space-y-space-md border border-border-slate max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/30">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[24px] text-primary">work</span>
                <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                  My Active Postings ({jobs.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManageJobsModal(false)}
                className="w-10 h-10 rounded flex items-center justify-center hover:bg-surface-container text-on-surface-variant cursor-pointer"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            <div className="space-y-3">
              {jobs.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant">
                  No active job postings. Click "Post a Job" to publish an opening.
                </div>
              ) : (
                jobs.map((j) => (
                  <div
                    key={j.id}
                    onClick={() => void loadInterests(j.id)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      selectedJobId === j.id
                        ? "bg-secondary-container/10 border-secondary"
                        : "bg-surface-container-low border-outline-variant/30 hover:bg-surface-container"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-md text-label-md text-primary font-bold">{j.title}</span>
                      <span className="text-xs text-on-surface-variant font-medium">
                        {j.location || "Pan-India"}
                      </span>
                    </div>
                    {j.required_skills && j.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {j.required_skills.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-surface-container text-xs">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {selectedJobId && (
              <div className="mt-4 pt-4 border-t border-outline-variant/30">
                {selectedJobSkills.length > 0 && (
                  <div className="mb-3">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold block mb-1">
                      Tagged Taxonomy Skills
                    </span>
                    <SkillChips skills={selectedJobSkills} />
                  </div>
                )}
                <span className="font-label-sm text-label-sm text-secondary uppercase font-bold block mb-2">
                  Applicant Responses ({interests.length})
                </span>
                {interests.length === 0 ? (
                  <p className="text-sm text-on-surface-variant italic">No candidate applications recorded yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {interests.map((ir) => (
                      <div
                        key={ir.id}
                        className="flex items-center justify-between p-2 bg-surface-container-low rounded border border-outline-variant/30 text-sm"
                      >
                        <span className="font-bold text-primary">
                          {ir.profiles?.full_name || `Candidate #${ir.trainee_id.slice(0, 4)}`}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface-container text-xs font-semibold uppercase">
                          {ir.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowManageJobsModal(false)}
                className="px-4 py-2 bg-primary text-on-primary font-label-sm text-label-sm rounded font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
