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
} from "@ncct/api-client";
import type { Job, JobInterest, Skill, TraineeSearchResult } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { SkillChips, SkillPicker } from "./SkillPicker.js";

interface EmployerDashboardProps {
  accessToken: string;
}

type InterestRow = JobInterest & { profiles: { full_name: string | null } | null };

interface CandidateItem {
  id: string;
  name: string;
  certId: string;
  avatarBg: string;
  initials: string;
  skills: string[];
  // Real taxonomy skill ids (DECISIONS.md #45) — absent/empty for the
  // hardcoded demo rows below, which aren't real, verifiable trainees and
  // so correctly never match a real skill_id filter.
  skillIds?: string[];
  course: string;
  institute: string;
  location: string;
  region: string;
  specialization: string;
  availability: "Immediate" | "Within 7 Days" | "Within 15 Days" | "Next Month";
  verifiedScore: number;
}

const DEFAULT_CANDIDATES: CandidateItem[] = [
  {
    id: "cand-1",
    name: "Ramesh V. Patel",
    certId: "NCCT-2024-GJ-89",
    avatarBg: "bg-primary-container text-on-primary",
    initials: "RP",
    skills: ["PACS Accounting", "Tally Prime", "GST Day-Book"],
    course: "PACS Digitalization & Accounts",
    institute: "ICM Gandhinagar",
    location: "Anand, Gujarat",
    region: "gujarat",
    specialization: "pacs",
    availability: "Immediate",
    verifiedScore: 92,
  },
  {
    id: "cand-2",
    name: "Pooja M. Deshmukh",
    certId: "NCCT-2024-MH-41",
    avatarBg: "bg-secondary text-on-secondary",
    initials: "PD",
    skills: ["Cold Storage Logistics", "Milk Fat Testing"],
    course: "Dairy Co-op Cold Chain (ICM)",
    institute: "VAMNICOM Pune",
    location: "Surat, Gujarat",
    region: "gujarat",
    specialization: "coldchain",
    availability: "Within 7 Days",
    verifiedScore: 88,
  },
  {
    id: "cand-3",
    name: "Anand Kumar Shukla",
    certId: "NCCT-2024-UP-11",
    avatarBg: "bg-primary-container text-on-primary",
    initials: "AK",
    skills: ["NABARD Credit Norms", "PACS Accounting"],
    course: "NABARD Cooperative Credit L-1",
    institute: "ICM Lucknow",
    location: "Lucknow, UP",
    region: "up",
    specialization: "pacs",
    availability: "Immediate",
    verifiedScore: 94,
  },
  {
    id: "cand-4",
    name: "Manish Soren",
    certId: "NCCT-2024-BR-62",
    avatarBg: "bg-surface-tint text-on-primary",
    initials: "MS",
    skills: ["GST & Audit", "Society Day-Book"],
    course: "GST & Society Auditing",
    institute: "ICM Patna",
    location: "Patna, Bihar",
    region: "bihar",
    specialization: "tally",
    availability: "Within 15 Days",
    verifiedScore: 86,
  },
  {
    id: "cand-5",
    name: "Bhavna C. Chaudhari",
    certId: "NCCT-2024-GJ-94",
    avatarBg: "bg-primary text-on-primary",
    initials: "BC",
    skills: ["Milk Testing", "Co-op Governance"],
    course: "Dairy Co-op Cold Chain (ICM)",
    institute: "ICM Gandhinagar",
    location: "Gandhinagar, Gujarat",
    region: "gujarat",
    specialization: "milk",
    availability: "Immediate",
    verifiedScore: 91,
  },
  {
    id: "cand-6",
    name: "Dharmesh K. Rathod",
    certId: "NCCT-2024-GJ-102",
    avatarBg: "bg-primary-container text-on-primary",
    initials: "DK",
    skills: ["PACS Accounting", "By-law Compliance"],
    course: "PACS Digitalization & Accounts",
    institute: "ICM Gandhinagar",
    location: "Mehsana, Gujarat",
    region: "gujarat",
    specialization: "governance",
    availability: "Immediate",
    verifiedScore: 85,
  },
];

export function EmployerDashboard({ accessToken }: EmployerDashboardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [interests, setInterests] = useState<InterestRow[]>([]);
  const [results, setResults] = useState<TraineeSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterSkill, setFilterSkill] = useState("all");
  const [filterAvailability, setFilterAvailability] = useState("all");
  const [sortBy, setSortBy] = useState("merit");

  // Shortlist state
  const [shortlistedIds, setShortlistedIds] = useState<Set<string>>(
    new Set(["cand-2", "cand-3", "cand-5", "cand-6"]),
  );
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

  // Fetches real trainees from the backend on mount and re-fetches whenever
  // a real taxonomy skill is selected (DECISIONS.md #45) — an exact
  // server-side match, not just filtering whatever page of `results`
  // happened to load initially. Reverts to the unfiltered fetch when "all"
  // is chosen again. Failures here stay silent (`.catch(() => {})`,
  // matching the original "if available" fetch this replaces) — the mock
  // candidates below still render either way, this only affects the real
  // rows merged in alongside them.
  useEffect(() => {
    getEmployerTrainees(accessToken, filterSkill !== "all" ? { skill_id: filterSkill } : {})
      .then(setResults)
      .catch(() => {});
  }, [accessToken, filterSkill]);

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
      setContactToast(`Job posting "${title}" published successfully!`);
      setTimeout(() => setContactToast(null), 4000);
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

  // Merge default candidates with real backend trainees if present
  const allCandidates: CandidateItem[] = [
    ...DEFAULT_CANDIDATES,
    ...results.map((r, idx) => ({
      id: r.trainee_id,
      name: r.full_name || `Candidate #${r.trainee_id.slice(0, 4)}`,
      certId: r.certificates[0]?.certificate_code || `NCCT-2024-CERT-${100 + idx}`,
      avatarBg: "bg-primary-container text-on-primary",
      initials: (r.full_name || "CA").slice(0, 2).toUpperCase(),
      // Real taxonomy skills (DECISIONS.md #45) — falls back to a plain
      // label only when this trainee genuinely has none tagged yet, rather
      // than a fake placeholder claiming a skill that was never verified.
      skills: r.skills.length > 0 ? r.skills.map((s) => s.name) : ["Certified Co-op Trainee"],
      skillIds: r.skills.map((s) => s.id),
      course: r.certificates[0]?.programme_title || "NCCT Cooperative Certificate",
      institute: r.certificates[0]?.institution_name || "RICM Regional Center",
      location: r.certificates[0]?.institution_location || "National",
      region: "all",
      specialization: "all",
      availability: "Immediate" as const,
      verifiedScore: 90,
    })),
  ];

  const filteredCandidates = allCandidates
    .filter((cand) => {
      const q = searchQuery.toLowerCase();
      const matchQ =
        !q ||
        cand.name.toLowerCase().includes(q) ||
        cand.certId.toLowerCase().includes(q) ||
        cand.skills.some((s) => s.toLowerCase().includes(q)) ||
        cand.location.toLowerCase().includes(q);

      const matchReg = filterRegion === "all" || cand.region === filterRegion;
      const matchSkill = filterSkill === "all" || (cand.skillIds ?? []).includes(filterSkill);
      const matchAvail =
        filterAvailability === "all" ||
        (filterAvailability === "immediate" && cand.availability === "Immediate") ||
        (filterAvailability === "15days" && (cand.availability === "Within 15 Days" || cand.availability === "Within 7 Days"));

      return matchQ && matchReg && matchSkill && matchAvail;
    })
    .sort((a, b) => {
      if (sortBy === "merit") return b.verifiedScore - a.verifiedScore;
      if (sortBy === "availability") return a.availability === "Immediate" ? -1 : 1;
      return a.location.localeCompare(b.location);
    });

  function toggleShortlist(id: string) {
    setShortlistedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        // Call backend API if active job selected
        if (selectedJobId) {
          void shortlistTrainee(accessToken, selectedJobId, id).catch(() => {});
        }
      }
      return next;
    });
  }

  const shortlistedCandidates = allCandidates.filter((c) => shortlistedIds.has(c.id));

  function handleDownloadShortlistCsv() {
    const headers = ["Candidate Name", "Certification ID", "Course", "Institution", "Location", "Score", "Availability"];
    const rows = shortlistedCandidates.map((c) => [
      `"${c.name}"`,
      `"${c.certId}"`,
      `"${c.course}"`,
      `"${c.institute}"`,
      `"${c.location}"`,
      `"${c.verifiedScore}%"`,
      `"${c.availability}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ncct_shortlisted_trainees_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleSendBulkInvite() {
    setContactToast(`Interview invitations dispatched to ${shortlistedCandidates.length} shortlisted candidates via NCCT SMS & Email.`);
    setTimeout(() => setContactToast(null), 5000);
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
              <span className="material-symbols-outlined text-[14px] text-secondary">verified_user</span> NCCT Verified Roster
            </span>
            <span className="text-outline-variant font-body-sm text-body-sm">•</span>
            <span className="font-metric-mono text-body-sm text-on-surface-variant">
              Active Candidates: <span className="font-bold text-primary">1,482</span>
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
            Trainee Search & Talent Pool
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Search verified NCCT-certified candidates and manage shortlisted talent for cooperative society postings.
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
            <span>+ Post a Job</span>
          </button>
        </div>
      </section>

      {/* Filter & Discovery Hub */}
      <section className="bg-surface-container-lowest p-space-md rounded-2xl shadow-xs flex flex-col gap-space-md border border-border-slate">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md">
          {/* Search Input */}
          <div className="md:col-span-4 flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1" htmlFor="search-input">
              Candidate or Certification ID
            </label>
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                badge
              </span>
              <input
                id="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Ramesh Patel, NCCT-2024-GJ-89"
                type="text"
                className="w-full min-h-[48px] pl-10 pr-space-md bg-paper-light text-on-surface rounded-xl font-body-sm text-body-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-secondary-container border border-border-slate/60"
              />
            </div>
          </div>

          {/* Location Dropdown */}
          <div className="md:col-span-3 flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="filter-location">
              Target State / Region
            </label>
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                location_on
              </span>
              <select
                id="filter-location"
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                className="w-full min-h-[48px] pl-10 pr-8 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm appearance-none focus:outline-none focus:ring-2 focus:ring-secondary-container border border-outline-variant/40 cursor-pointer"
              >
                <option value="all">All Regions (Pan India)</option>
                <option value="gujarat">Gujarat (Anand, Mehsana, Surat)</option>
                <option value="up">Uttar Pradesh (Lucknow, Varanasi)</option>
                <option value="bihar">Bihar (Patna, Muzaffarpur)</option>
                <option value="maharashtra">Maharashtra (Pune, Kolhapur)</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[20px]">
                expand_more
              </span>
            </div>
          </div>

          {/* Skills Dropdown */}
          <div className="md:col-span-3 flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="filter-skills">
              Cooperative Trade / Skill
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
                <option value="all">All Trade Specializations</option>
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

          {/* Availability Dropdown */}
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="filter-availability">
              Availability
            </label>
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                calendar_today
              </span>
              <select
                id="filter-availability"
                value={filterAvailability}
                onChange={(e) => setFilterAvailability(e.target.value)}
                className="w-full min-h-[48px] pl-10 pr-8 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm appearance-none focus:outline-none focus:ring-2 focus:ring-secondary-container border border-outline-variant/40 cursor-pointer"
              >
                <option value="all">Any Availability</option>
                <option value="immediate">Immediate</option>
                <option value="15days">Within 15 Days</option>
                <option value="nextmonth">Next Month</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[20px]">
                expand_more
              </span>
            </div>
          </div>
        </div>

        {/* Active Filter Tags */}
        <div className="flex items-center flex-wrap gap-space-xs pt-space-xs border-t border-outline-variant/20">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider pr-space-xs font-bold">
            Filters Applied:
          </span>
          {filterRegion !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-space-sm py-1 rounded bg-surface-container text-primary font-body-sm text-body-sm font-medium">
              State: {filterRegion.toUpperCase()}
              <button type="button" onClick={() => setFilterRegion("all")} className="hover:text-error flex items-center">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </span>
          )}
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
              setFilterRegion("all");
              setFilterSkill("all");
              setFilterAvailability("all");
            }}
            className="font-label-sm text-label-sm text-secondary hover:underline ml-space-sm font-bold cursor-pointer"
          >
            Reset All Filters
          </button>
        </div>
      </section>

      {/* 2-Column Main Layout: Candidate Roster (68%) & Shortlist Drawer (32%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* Candidate Roster Table Column (approx 68% -> col-span-8) */}
        <section className="lg:col-span-8 flex flex-col gap-space-md">
          <div className="bg-surface-container-lowest rounded-2xl shadow-xs overflow-hidden border border-border-slate">
            {/* Table Control & Sorting Header */}
            <div className="px-space-md py-space-sm bg-paper-light flex items-center justify-between border-b border-border-slate/60">
              <div className="flex items-center gap-space-sm">
                <span className="font-headline-sm text-headline-sm text-primary font-bold">
                  Certified Trainees
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary font-metric-mono text-label-sm font-bold">
                  {filteredCandidates.length} Found
                </span>
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-white text-on-surface rounded-lg px-2.5 py-1 font-body-sm text-body-sm border border-border-slate focus:outline-none cursor-pointer"
                >
                  <option value="merit">NCCT Exam Merit (High to Low)</option>
                  <option value="availability">Availability (Immediate First)</option>
                  <option value="proximity">Proximity to Dairy Hubs</option>
                </select>
              </div>
            </div>

            {/* Trainee Candidates Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-paper text-on-surface-variant font-label-md text-label-md border-b border-border-slate">
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs">Trainee Candidate</th>
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs">Verified Competencies</th>
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs">NCCT Certification</th>
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs">Location</th>
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs">Availability</th>
                    <th className="py-space-sm px-space-md uppercase font-bold tracking-wider text-xs text-right">Shortlist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-slate/40 font-body-sm text-body-sm">
                  {filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-on-surface-variant">
                        No candidates match your current filter selection.
                      </td>
                    </tr>
                  ) : (
                    filteredCandidates.map((cand) => {
                      const isShortlisted = shortlistedIds.has(cand.id);
                      return (
                        <tr key={cand.id} className="hover:bg-paper-light/60 transition-colors">
                          <td className="py-space-md px-space-md">
                            <div className="flex items-center gap-space-sm">
                              <div
                                className={`w-10 h-10 rounded-xl ${cand.avatarBg} flex items-center justify-center font-display text-headline-sm shrink-0 font-bold shadow-2xs`}
                              >
                                {cand.initials}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="font-label-lg text-label-lg text-primary truncate font-bold">
                                    {cand.name}
                                  </span>
                                  <span
                                    className="material-symbols-outlined text-[16px] text-on-tertiary-container shrink-0"
                                    title="NCCT Certified Biometric"
                                  >
                                    verified
                                  </span>
                                </div>
                                <span className="font-metric-mono text-label-sm text-on-surface-variant">
                                  ID: {cand.certId}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-space-md px-space-md">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {cand.skills.map((skill, si) => (
                                <span
                                  key={si}
                                  className="px-2 py-0.5 rounded-lg bg-paper text-ink font-metric-mono text-xs border border-border-slate/50"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-space-md px-space-md">
                            <div className="flex flex-col">
                              <span className="font-label-md text-label-md text-primary font-bold">
                                {cand.course}
                              </span>
                              <span className="font-body-sm text-body-sm text-on-surface-variant">
                                Inst: {cand.institute}
                              </span>
                            </div>
                          </td>
                          <td className="py-space-md px-space-md">
                            <div className="flex items-center gap-1 font-body-sm text-body-sm text-on-surface">
                              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                                place
                              </span>
                              {cand.location}
                            </div>
                          </td>
                          <td className="py-space-md px-space-md">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-bold border ${
                                cand.availability === "Immediate"
                                  ? "bg-blue-50 text-primary border-blue-200"
                                  : "bg-secondary-fixed text-on-secondary-fixed border-secondary/20"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  cand.availability === "Immediate"
                                    ? "bg-primary"
                                    : "bg-secondary"
                                }`}
                              />
                              {cand.availability}
                            </span>
                          </td>
                          <td className="py-space-md px-space-md text-right">
                            <button
                              type="button"
                              onClick={() => toggleShortlist(cand.id)}
                              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl inline-flex items-center gap-1 transition-all cursor-pointer font-bold text-xs shadow-2xs ${
                                isShortlisted
                                  ? "bg-primary text-on-primary"
                                  : "bg-paper hover:bg-secondary-container hover:text-primary text-on-surface border border-border-slate"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {isShortlisted ? "check_circle" : "bookmark_add"}
                              </span>
                              <span>{isShortlisted ? "Shortlisted" : "Shortlist"}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Pagination */}
            <div className="px-space-md py-space-sm bg-paper-light flex items-center justify-between border-t border-border-slate/60">
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Showing <strong className="text-on-surface font-metric-mono">1–{filteredCandidates.length}</strong> of{" "}
                <strong className="text-on-surface font-metric-mono">1,482</strong> qualified profiles
              </span>
              <div className="flex items-center gap-space-xs">
                <button
                  type="button"
                  disabled
                  className="min-h-[36px] px-2.5 bg-white border border-border-slate text-on-surface-variant rounded-lg opacity-40 cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <span className="px-3 py-1 bg-primary text-on-primary rounded-lg font-label-sm text-label-sm font-bold shadow-xs">
                  1
                </span>
                <button
                  type="button"
                  className="px-3 py-1 bg-white border border-border-slate text-on-surface hover:bg-paper rounded-lg font-label-sm text-label-sm cursor-pointer"
                >
                  2
                </button>
                <button
                  type="button"
                  className="min-h-[36px] px-2.5 bg-white border border-border-slate text-on-surface hover:bg-paper rounded-lg cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            </div>
          </div>

          {/* Cooperative Skill Metrics Visual Block */}
          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-space-md border border-border-slate">
            <div className="flex flex-col gap-1 max-w-sm">
              <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider font-bold">
                Placement Metric
              </span>
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                PACS Certified Candidates
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                82% of available candidates hold hands-on validation in computerized society day-book management.
              </p>
            </div>
            <div className="w-full md:w-auto flex items-center gap-space-md bg-paper-light p-3.5 rounded-xl border border-border-slate/60">
              <svg className="w-36 h-12 text-primary" fill="none" viewBox="0 0 144 48" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4 36L30 24L56 30L82 12L108 18L134 6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                />
                <circle cx="134" cy="6" r="4" className="fill-secondary-container" />
              </svg>
              <div className="flex flex-col">
                <span className="font-metric-mono text-headline-md text-headline-md text-primary font-bold">
                  +24.6%
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                  Demand this cycle
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Side Panel — Candidate Shortlist Drawer (approx 32% -> col-span-4) */}
        <aside className="lg:col-span-4 flex flex-col gap-space-md sticky top-20">
          <div className="bg-surface-container-lowest rounded-2xl shadow-xs overflow-hidden flex flex-col border border-border-slate">
            {/* Drawer Header */}
            <div className="p-space-md bg-primary-container text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-secondary-container text-[24px]">
                  fact_check
                </span>
                <h2 className="font-headline-sm text-headline-sm font-bold">Shortlisted Candidates</h2>
              </div>
              <span className="px-2.5 py-0.5 bg-secondary-container text-primary rounded-full font-metric-mono text-label-sm font-bold shadow-xs">
                {shortlistedCandidates.length} Selected
              </span>
            </div>

            {/* Shortlisted Items Container */}
            <div className="p-space-md flex flex-col gap-space-sm max-h-[520px] overflow-y-auto custom-scrollbar">
              {shortlistedCandidates.length === 0 ? (
                <p className="text-center py-8 text-on-surface-variant text-sm">
                  No candidates shortlisted yet. Click "Shortlist" on any candidate from the roster.
                </p>
              ) : (
                shortlistedCandidates.map((cand) => (
                  <div
                    key={cand.id}
                    className="p-space-sm bg-paper-light rounded-xl flex flex-col gap-space-xs relative group transition-all hover:bg-paper border border-border-slate/60"
                  >
                    <div className="flex items-start justify-between gap-space-xs">
                      <div className="flex items-center gap-space-xs">
                        <div
                          className={`w-8 h-8 rounded-lg ${cand.avatarBg} flex items-center justify-center font-display text-label-md shrink-0 font-bold shadow-2xs`}
                        >
                          {cand.initials}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-label-md text-label-md text-primary leading-tight font-bold">
                            {cand.name}
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant text-xs">
                            {cand.location}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleShortlist(cand.id)}
                        className="text-on-surface-variant hover:text-error p-1 rounded transition-colors cursor-pointer"
                        title="Remove candidate"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>

                    <div className="pt-1">
                      <span className="inline-block px-2 py-0.5 rounded-lg bg-white border border-border-slate/50 text-on-surface font-label-sm text-label-sm truncate max-w-full font-medium">
                        {cand.course}
                      </span>
                    </div>

                    <div className="pt-space-xs flex items-center justify-between gap-space-xs">
                      <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">
                          check_circle
                        </span>{" "}
                        Score: <strong className="font-metric-mono">{cand.verifiedScore}%</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setContactToast(`Direct line for ${cand.name} opened. Contact: +91 98765 43210`);
                          setTimeout(() => setContactToast(null), 4000);
                        }}
                        className="min-h-[36px] px-space-md py-1 bg-primary hover:bg-primary/90 text-on-primary font-label-sm text-label-sm rounded-xl flex items-center gap-1 transition-all active:translate-y-0.5 shadow-2xs font-bold cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">call</span>
                        <span>Contact</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Shortlist Side Actions Block */}
            <div className="p-space-md bg-paper-light flex flex-col gap-space-xs border-t border-border-slate/60">
              <button
                type="button"
                disabled={shortlistedCandidates.length === 0}
                onClick={handleSendBulkInvite}
                className="w-full min-h-[48px] px-space-md bg-secondary-container hover:bg-secondary text-primary hover:text-on-primary font-label-md text-label-md rounded-xl flex items-center justify-center gap-space-xs transition-all shadow-xs active:translate-y-0.5 font-bold cursor-pointer disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">forward_to_inbox</span>
                <span>Send Bulk Interview Invitation</span>
              </button>
              <button
                type="button"
                disabled={shortlistedCandidates.length === 0}
                onClick={handleDownloadShortlistCsv}
                className="w-full min-h-[48px] px-space-md bg-white hover:bg-paper text-on-surface font-label-md text-label-md rounded-xl flex items-center justify-center gap-space-xs transition-colors shadow-2xs border border-border-slate font-bold cursor-pointer disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
                <span>Download Shortlist Summary (CSV)</span>
              </button>
            </div>
          </div>

          {/* Cooperative Guidance Note */}
          <div className="p-space-md bg-paper-light rounded-2xl flex items-start gap-space-sm border border-border-slate/60">
            <span className="material-symbols-outlined text-secondary text-[24px] shrink-0 mt-0.5">
              shield
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-label-md text-label-md text-primary font-bold">
                NCCT Placement Protocol
              </span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Candidate certifications are digitally signed by regional ICM directors and validated for immediate
                cooperative federation placement under Ministry of Cooperation guidelines.
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
                    Target NCCT Certified Cooperative Candidates
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
                  No active job postings. Click "+ Post a Job" to publish an opening.
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
