import { getInstitutions, getMyAssignedProgrammes, getProgrammes } from "@ncct/api-client";
import type { Institution, Programme } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import type { ManagementTab } from "./ManagementShell.js";

interface TrainerCoursesDashboardProps {
  accessToken: string;
  onNavigate: (tab: ManagementTab) => void;
}

interface AssignedCohort {
  id: string;
  code: string;
  batch: string;
  title: string;
  institute: string;
  status: "Active / In Session" | "Final Assessment Phase" | "Upcoming";
  term: "q3" | "q4";
  modulesCount: number;
  totalModules: number;
  moduleDetails: string;
  enrolledStudents: number;
  capacity: number;
  schedule: string;
  room: string;
  syncNote: string;
  syncIcon: string;
}

const DEFAULT_COHORTS: AssignedCohort[] = [
  {
    id: "cohort-1",
    code: "PACS-DIGI-101",
    batch: "B-2024-NW-892",
    title: "Primary Agricultural Credit Society (PACS) Digitalization & Accounts",
    institute: "RICM Gandhinagar",
    status: "Active / In Session",
    term: "q3",
    modulesCount: 6,
    totalModules: 6,
    moduleDetails: "24 Lessons, 18 Video Lectures, 12 Practical Guides",
    enrolledStudents: 45,
    capacity: 45,
    schedule: "Mon, Wed, Fri • 10:00 AM - 12:30 PM",
    room: "Lecture Hall 2A / Hybrid Room",
    syncNote: "Last curriculum synced 2 hours ago",
    syncIcon: "sync",
  },
  {
    id: "cohort-2",
    code: "DAIRY-LOG-204",
    batch: "B-2024-NW-887",
    title: "Dairy Cooperative Management & Cold Chain Logistics",
    institute: "ICM Patna / Gandhinagar",
    status: "Active / In Session",
    term: "q3",
    modulesCount: 4,
    totalModules: 5,
    moduleDetails: "16 Lessons, 8 Case Studies",
    enrolledStudents: 38,
    capacity: 40,
    schedule: "Tue, Thu • 02:00 PM - 04:30 PM",
    room: "Virtual Lab 04 / Dairy Unit Wing",
    syncNote: "Module 5 scheduled for publication on 28th Nov",
    syncIcon: "pending_actions",
  },
  {
    id: "cohort-3",
    code: "BANK-GOV-302",
    batch: "B-2024-NC-741",
    title: "Cooperative Banking Statutory Audits & Financial Governance",
    institute: "RICM Lucknow",
    status: "Final Assessment Phase",
    term: "q4",
    modulesCount: 8,
    totalModules: 8,
    moduleDetails: "32 Lessons, NABARD Guidelines",
    enrolledStudents: 50,
    capacity: 50,
    schedule: "Sat Intensive • 09:30 AM - 01:30 PM",
    room: "Executive Seminar Hall A",
    syncNote: "Online End-Term Examination scheduled for Saturday",
    syncIcon: "priority_high",
  },
  {
    id: "cohort-4",
    code: "FPO-LEGAL-108",
    batch: "B-2024-NE-512",
    title: "Rural Producer Org (FPO) Legal Compliance & GST Filing",
    institute: "ICM Dehradun",
    status: "Active / In Session",
    term: "q4",
    modulesCount: 3,
    totalModules: 4,
    moduleDetails: "12 Lessons, 6 Compliance Checklists",
    enrolledStudents: 32,
    capacity: 35,
    schedule: "Mon, Thu • 11:00 AM - 01:00 PM",
    room: "Room 108 / Compliance Training Hub",
    syncNote: "GST compliance portal sandbox active",
    syncIcon: "verified",
  },
];

export function TrainerCoursesDashboard({ accessToken, onNavigate }: TrainerCoursesDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<"all" | "q3" | "q4">("all");
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [cohorts, setCohorts] = useState<AssignedCohort[]>(DEFAULT_COHORTS);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [proposalSubmitted, setProposalSubmitted] = useState(false);

  // Proposal form state
  const [propDiscipline, setPropDiscipline] = useState("PACS Digital Accounting & Ledger Automation");
  const [propInstitute, setPropInstitute] = useState("RICM Gandhinagar (Gujarat)");
  const [propCapacity, setPropCapacity] = useState(40);
  const [propMode, setPropMode] = useState<"hybrid" | "field">("hybrid");
  const [propJustification, setPropJustification] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [insts, allProgs, assignedIds] = await Promise.all([
          getInstitutions(accessToken).catch(() => []),
          getProgrammes(accessToken).catch(() => []),
          getMyAssignedProgrammes(accessToken).catch(() => null),
        ]);
        if (insts.length > 0) setInstitutions(insts);

        // Only show programmes this trainer is actually allotted to
        // (docs/DECISIONS.md #52) — the API now enforces this on every
        // write, so a card for a programme the trainer can't touch would
        // just be a dead end. `assignedIds === null` means the lookup
        // itself failed (not "assigned to nothing"), so fall back to
        // showing everything rather than hiding a trainer's real work.
        const assignedIdSet = assignedIds ? new Set(assignedIds) : null;
        const progs = assignedIdSet ? allProgs.filter((p) => assignedIdSet.has(p.id)) : allProgs;

        if (progs.length > 0) {
          const apiCohorts: AssignedCohort[] = progs.map((prog: Programme, idx: number) => {
            const inst = insts.find((i) => i.id === prog.institution_id);
            return {
              id: prog.id,
              code: `NCCT-PRG-${100 + idx}`,
              batch: `B-2024-FAC-${idx + 1}`,
              title: prog.title,
              institute: inst?.name || "RICM Regional Center",
              status: "Active / In Session",
              term: idx % 2 === 0 ? "q3" : "q4",
              modulesCount: 4,
              totalModules: 4,
              moduleDetails: "Curriculum modules published & synced",
              enrolledStudents: Math.min(prog.capacity || 40, 32),
              capacity: prog.capacity || 40,
              schedule: "Mon, Wed • 10:00 AM - 12:00 PM",
              room: "Academic Block 1",
              syncNote: "Curriculum active in national repository",
              syncIcon: "sync",
            };
          });
          setCohorts([...apiCohorts, ...DEFAULT_COHORTS]);
        }
      } catch {
        // Fallback to default mock cohorts
      }
    }
    void loadData();
  }, [accessToken]);

  const filteredCohorts = cohorts.filter((cohort) => {
    const matchQuery =
      searchQuery.trim() === "" ||
      cohort.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cohort.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cohort.institute.toLowerCase().includes(searchQuery.toLowerCase());

    const matchTerm = selectedTerm === "all" || cohort.term === selectedTerm;
    return matchQuery && matchTerm;
  });

  function handleProposalSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newCohort: AssignedCohort = {
      id: `prop-${Date.now()}`,
      code: `PROP-${Math.floor(100 + Math.random() * 900)}`,
      batch: `B-2025-PROP`,
      title: propDiscipline,
      institute: propInstitute,
      status: "Upcoming",
      term: "q4",
      modulesCount: 0,
      totalModules: 4,
      moduleDetails: "Proposed batch awaiting Academic Council approval",
      enrolledStudents: 0,
      capacity: propCapacity,
      schedule: "TBD upon council authorization",
      room: propMode === "hybrid" ? "Hybrid / Virtual Hall" : "Field Kiosk Center",
      syncNote: "Batch proposal submitted successfully",
      syncIcon: "pending",
    };
    setCohorts([newCohort, ...cohorts]);
    setShowProposalModal(false);
    setProposalSubmitted(true);
    setTimeout(() => setProposalSubmitted(false), 5000);
  }

  return (
    <div className="flex flex-col w-full text-left gap-space-lg">
      {/* Toast Notification on Proposal Submission */}
      {proposalSubmitted && (
        <div className="p-space-md bg-tertiary-fixed text-on-tertiary-fixed-variant rounded-xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[22px] text-on-tertiary-container">
              check_circle
            </span>
            <span className="font-label-md text-label-md">
              Batch proposal successfully lodged for NCCT Academic Council review.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setProposalSubmitted(false)}
            className="p-1 hover:opacity-70"
            aria-label="Dismiss"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Page Header & Utilitarian Control Bar */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
          <div className="max-w-3xl">
            <div className="flex items-center gap-space-xs text-secondary mb-space-xs">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
              <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold">
                National Council for Cooperative Training (NCCT)
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
              Assigned Training Programmes
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">
              Manage curriculum schedules, module publications, and active student cohorts across
              regional training institutes.
            </p>
          </div>

          {/* Quick Action: Primary Propose Batch */}
          <div className="shrink-0 flex items-center gap-space-sm">
            <button
              type="button"
              onClick={() => setShowProposalModal(true)}
              className="inline-flex items-center justify-center gap-space-sm min-h-[48px] px-space-lg bg-secondary-container text-primary font-label-md text-label-md rounded-xl font-bold shadow-sm hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              <span>+ Propose New Batch / Programme</span>
            </button>
          </div>
        </div>

        {/* Filter & Query Command Strip */}
        <div className="bg-surface-container-lowest p-space-md rounded-2xl shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md border border-border-slate">
          {/* Search Box */}
          <div className="relative flex-1 max-w-lg">
            <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by Course Code, Subject or Regional Institute..."
              className="w-full h-12 pl-11 pr-space-md bg-paper-light text-on-surface font-body-sm text-body-sm rounded-xl outline-none border border-border-slate/60 placeholder:text-on-surface-variant/60 focus:bg-white focus:ring-2 focus:ring-secondary-container transition-all"
            />
          </div>

          {/* Academic Term Filter Tabs */}
          <div className="flex items-center gap-space-xs overflow-x-auto pb-space-xs md:pb-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant mr-space-xs shrink-0 font-bold">
              Academic Term:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTerm("all")}
              className={`px-space-md py-space-xs rounded-lg font-label-sm text-label-sm uppercase tracking-wider transition-colors min-h-[40px] cursor-pointer font-bold ${
                selectedTerm === "all"
                  ? "bg-primary text-on-primary shadow-xs"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              All Active
            </button>
            <button
              type="button"
              onClick={() => setSelectedTerm("q3")}
              className={`px-space-md py-space-xs rounded-lg font-label-sm text-label-sm uppercase tracking-wider transition-colors min-h-[40px] cursor-pointer font-bold ${
                selectedTerm === "q3"
                  ? "bg-primary text-on-primary shadow-xs"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              Q3 (Oct–Dec)
            </button>
            <button
              type="button"
              onClick={() => setSelectedTerm("q4")}
              className={`px-space-md py-space-xs rounded-lg font-label-sm text-label-sm uppercase tracking-wider transition-colors min-h-[40px] cursor-pointer font-bold ${
                selectedTerm === "q4"
                  ? "bg-primary text-on-primary shadow-xs"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              Q4 (Jan–Mar)
            </button>
          </div>
        </div>

        {/* Active Cohorts Count Meta */}
        <div className="flex flex-wrap items-center justify-between text-on-surface-variant px-1">
          <div className="flex items-center gap-space-xs font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-secondary text-[18px]">co_present</span>
            <span>
              Showing{" "}
              <strong className="text-primary font-bold">{filteredCohorts.length}</strong> Assigned
              Cohorts
            </span>
            <span className="mx-space-xs">•</span>
            <span className="text-on-surface font-medium">
              RICM Gandhinagar, ICM Patna, RICM Lucknow, ICM Dehradun
            </span>
          </div>
          <div className="font-tabular-data text-label-sm text-on-surface-variant">
            Academic Session FY 2024-25
          </div>
        </div>
      </section>

      {/* Main Programme Card Stack */}
      <section className="space-y-space-lg">
        {filteredCohorts.length === 0 ? (
          <div className="p-space-xl bg-surface-container-lowest rounded-xl shadow-xs text-center border border-outline-variant/40">
            <span className="material-symbols-outlined text-[48px] text-on-surface-variant/40">
              menu_book
            </span>
            <p className="font-label-md text-label-md text-on-surface mt-2">
              No training programmes match your search criteria.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedTerm("all");
              }}
              className="mt-3 px-4 py-2 bg-surface-container text-primary font-label-sm text-label-sm rounded hover:bg-surface-container-high cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredCohorts.map((cohort) => {
            const modulePercent = Math.min(
              100,
              Math.round((cohort.modulesCount / (cohort.totalModules || 1)) * 100),
            );
            const studentPercent = Math.min(
              100,
              Math.round((cohort.enrolledStudents / (cohort.capacity || 1)) * 100),
            );

            return (
              <div
                key={cohort.id}
                className="flex flex-col bg-surface-container-lowest rounded-2xl shadow-xs p-space-lg hover:shadow-md transition-all border border-border-slate"
              >
                {/* Card Top Ribbon: Identity, Batch, Badges */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-md border-b border-border-slate/40">
                  <div className="space-y-space-xs">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span className="px-space-sm py-0.5 bg-primary-container text-on-primary font-metric-mono text-label-sm rounded-lg uppercase tracking-wider font-bold">
                        {cohort.code}
                      </span>
                      <span className="px-space-sm py-0.5 bg-paper text-ink font-metric-mono text-label-sm rounded-lg font-medium border border-border-slate/50">
                        Batch: {cohort.batch}
                      </span>
                      <span className="inline-flex items-center gap-space-xs font-label-sm text-label-sm text-secondary font-semibold">
                        <span className="material-symbols-outlined text-[16px]">location_on</span>
                        {cohort.institute}
                      </span>
                    </div>
                    <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
                      {cohort.title}
                    </h2>
                  </div>

                  <div className="shrink-0 flex items-center gap-space-sm">
                    {cohort.status === "Final Assessment Phase" ? (
                      <span className="inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm font-bold border border-secondary/20">
                        <span className="material-symbols-outlined text-[16px] text-secondary">
                          assignment_late
                        </span>
                        Final Assessment Phase
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-full bg-blue-50 text-primary font-label-sm text-label-sm font-bold border border-blue-200">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        {cohort.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Core Teaching Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md my-space-md bg-paper-light border border-border-slate/60 rounded-xl p-space-md">
                  {/* Modules Status */}
                  <div className="flex items-start gap-space-sm">
                    <div className="w-10 h-10 rounded-xl bg-white border border-border-slate/60 flex items-center justify-center shrink-0 text-primary shadow-2xs">
                      <span className="material-symbols-outlined text-[20px]">layers</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between">
                        <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                          Modules Published
                        </span>
                        <span className="font-metric-mono text-primary text-label-md font-bold">
                          {cohort.modulesCount} of {cohort.totalModules} Active
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-space-xs">
                        <div
                          className="h-full bg-secondary-container rounded-full"
                          style={{ width: `${modulePercent}%` }}
                        />
                      </div>
                      <p className="font-label-sm text-label-sm text-on-surface-variant mt-space-xs truncate">
                        {cohort.moduleDetails}
                      </p>
                    </div>
                  </div>

                  {/* Trainees Enrolled */}
                  <div className="flex items-start gap-space-sm">
                    <div className="w-10 h-10 rounded-xl bg-white border border-border-slate/60 flex items-center justify-center shrink-0 text-primary shadow-2xs">
                      <span className="material-symbols-outlined text-[20px]">groups</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between">
                        <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                          Students Enrolled
                        </span>
                        <span className="font-metric-mono text-primary text-label-md font-bold">
                          {cohort.enrolledStudents} Trainees
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-space-xs">
                        <div
                          className="h-full bg-primary-container rounded-full"
                          style={{ width: `${studentPercent}%` }}
                        />
                      </div>
                      <p className="font-label-sm text-label-sm text-on-surface-variant mt-space-xs">
                        {cohort.enrolledStudents === cohort.capacity
                          ? "100% Cohort Capacity (Full)"
                          : `${cohort.enrolledStudents} Enrolled (${cohort.capacity} Cohort Capacity)`}
                      </p>
                    </div>
                  </div>

                  {/* Weekly Schedule */}
                  <div className="flex items-start gap-space-sm">
                    <div className="w-10 h-10 rounded-xl bg-white border border-border-slate/60 flex items-center justify-center shrink-0 text-primary shadow-2xs">
                      <span className="material-symbols-outlined text-[20px]">schedule</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-label-sm text-label-sm text-on-surface-variant block font-semibold">
                        Schedule & Timings
                      </span>
                      <span className="font-label-md text-label-md text-on-surface block mt-space-xs font-bold">
                        {cohort.schedule}
                      </span>
                      <p className="font-label-sm text-label-sm text-on-surface-variant mt-space-xs">
                        {cohort.room}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Hooks Bar */}
                <div className="pt-space-xs flex flex-wrap items-center justify-between gap-space-md">
                  <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-[16px] text-secondary">
                      {cohort.syncIcon}
                    </span>
                    <span>{cohort.syncNote}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-space-sm">
                    <button
                      type="button"
                      onClick={() => onNavigate("content")}
                      className="inline-flex items-center justify-center gap-space-xs min-h-[44px] px-space-md bg-paper hover:bg-slate-200 text-on-surface font-label-md text-label-md rounded-xl border border-border-slate/60 transition-colors cursor-pointer font-bold"
                    >
                      <span className="material-symbols-outlined text-[18px]">folder_open</span>
                      <span>Manage Content</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate("attendance")}
                      className="inline-flex items-center justify-center gap-space-xs min-h-[44px] px-space-md bg-paper hover:bg-slate-200 text-on-surface font-label-md text-label-md rounded-xl border border-border-slate/60 transition-colors cursor-pointer font-bold"
                    >
                      <span className="material-symbols-outlined text-[18px]">badge</span>
                      <span>Roster & Attendance</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate("content")}
                      className={`inline-flex items-center justify-center gap-space-xs min-h-[44px] px-space-md font-label-md text-label-md rounded-xl shadow-xs transition-all cursor-pointer font-bold ${
                        cohort.status === "Final Assessment Phase"
                          ? "bg-secondary-container text-primary hover:brightness-105"
                          : "bg-primary-container text-on-primary hover:bg-primary"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">fact_check</span>
                      <span>
                        {cohort.status === "Final Assessment Phase"
                          ? "View Assessments (Grading Open)"
                          : "View Assessments"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Propose New Batch Modal */}
      {showProposalModal && (
        <div className="fixed inset-0 bg-primary/60 backdrop-blur-xs z-50 flex items-center justify-center p-space-md animate-fade-in">
          <div className="bg-surface-container-lowest rounded-2xl max-w-xl w-full p-space-lg shadow-2xl space-y-space-md border border-border-slate">
            <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/30">
              <div className="flex items-center gap-space-xs">
                <div className="w-8 h-8 rounded bg-secondary-container flex items-center justify-center text-primary font-bold">
                  <span className="material-symbols-outlined text-[20px]">add_box</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                    Propose New Batch / Programme
                  </h3>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Submit for NCCT Academic Council Review
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProposalModal(false)}
                className="w-10 h-10 rounded flex items-center justify-center hover:bg-surface-container text-on-surface-variant cursor-pointer"
                aria-label="Close dialog"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            <form onSubmit={handleProposalSubmit} className="space-y-space-md">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-space-xs font-semibold">
                  Course Curriculum Discipline <span className="text-error">*</span>
                </label>
                <select
                  value={propDiscipline}
                  onChange={(e) => setPropDiscipline(e.target.value)}
                  className="w-full h-12 px-space-md bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded outline-none focus:ring-2 focus:ring-secondary-container cursor-pointer"
                >
                  <option value="PACS Digital Accounting & Ledger Automation">
                    PACS Digital Accounting & Ledger Automation
                  </option>
                  <option value="Cooperative Societies Act & Bye-Laws Harmonization">
                    Cooperative Societies Act & Bye-Laws Harmonization
                  </option>
                  <option value="Agritech Cold Chain Logistics & Post-Harvest Credit">
                    Agritech Cold Chain Logistics & Post-Harvest Credit
                  </option>
                  <option value="Urban Cooperative Banking Statutory Liquidity">
                    Urban Cooperative Banking Statutory Liquidity
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-space-xs font-semibold">
                    Host Training Institute <span className="text-error">*</span>
                  </label>
                  <select
                    value={propInstitute}
                    onChange={(e) => setPropInstitute(e.target.value)}
                    className="w-full h-12 px-space-md bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded outline-none focus:ring-2 focus:ring-secondary-container cursor-pointer"
                  >
                    <option value="RICM Gandhinagar (Gujarat)">RICM Gandhinagar (Gujarat)</option>
                    <option value="ICM Patna (Bihar)">ICM Patna (Bihar)</option>
                    <option value="RICM Lucknow (Uttar Pradesh)">RICM Lucknow (Uttar Pradesh)</option>
                    <option value="ICM Dehradun (Uttarakhand)">ICM Dehradun (Uttarakhand)</option>
                    <option value="VAMNICOM Pune (National Centre)">VAMNICOM Pune (National Centre)</option>
                    {institutions.map((inst) => (
                      <option key={inst.id} value={inst.name}>
                        {inst.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-space-xs font-semibold">
                    Anticipated Batch Capacity <span className="text-error">*</span>
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={60}
                    value={propCapacity}
                    onChange={(e) => setPropCapacity(Number(e.target.value))}
                    className="w-full h-12 px-space-md bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded outline-none focus:ring-2 focus:ring-secondary-container"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-space-xs font-semibold">
                  Proposed Delivery Mode & Cohort Target <span className="text-error">*</span>
                </label>
                <div className="grid grid-cols-2 gap-space-sm">
                  <label
                    className={`flex items-center gap-space-xs p-space-sm rounded cursor-pointer border ${
                      propMode === "hybrid"
                        ? "bg-surface-container-highest border-secondary text-primary font-bold"
                        : "bg-surface-container border-transparent text-on-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="propMode"
                      checked={propMode === "hybrid"}
                      onChange={() => setPropMode("hybrid")}
                      className="text-secondary focus:ring-secondary"
                    />
                    <span className="font-label-sm text-label-sm">Hybrid (Classroom + LMS)</span>
                  </label>
                  <label
                    className={`flex items-center gap-space-xs p-space-sm rounded cursor-pointer border ${
                      propMode === "field"
                        ? "bg-surface-container-highest border-secondary text-primary font-bold"
                        : "bg-surface-container border-transparent text-on-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="propMode"
                      checked={propMode === "field"}
                      onChange={() => setPropMode("field")}
                      className="text-secondary focus:ring-secondary"
                    />
                    <span className="font-label-sm text-label-sm">Field Intensive Kiosk</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-space-xs font-semibold">
                  Faculty Justification & Objectives
                </label>
                <textarea
                  rows={3}
                  value={propJustification}
                  onChange={(e) => setPropJustification(e.target.value)}
                  placeholder="Outline specific skilling outcomes or state cooperative department requests..."
                  className="w-full p-space-md bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded outline-none focus:ring-2 focus:ring-secondary-container placeholder:text-on-surface-variant/60"
                />
              </div>

              <div className="flex items-center justify-end gap-space-sm pt-space-xs border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setShowProposalModal(false)}
                  className="min-h-[48px] px-space-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[48px] px-space-xl bg-secondary-container text-primary font-label-md text-label-md rounded shadow-xs hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5 transition-all font-bold cursor-pointer"
                >
                  Submit Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
