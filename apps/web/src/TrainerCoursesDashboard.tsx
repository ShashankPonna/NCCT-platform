import {
  getCourses,
  getInstitutions,
  getMyAssignedProgrammes,
  getProgrammeNominations,
  getProgrammes,
  getTimetableSessions,
} from "@ncct/api-client";
import type { Institution, Programme, TimetableSession } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import type { ManagementTab } from "./ManagementShell.js";

interface TrainerCoursesDashboardProps {
  accessToken: string;
  onNavigate: (tab: ManagementTab) => void;
}

type ProgrammeStatus = "upcoming" | "ongoing" | "completed";

// Everything on a card is read from the real programme, its courses, its
// approved nominations and its timetable (docs/DECISIONS.md #67) — the
// previous version padded this list with invented cohorts and gave real
// programmes made-up codes, schedules, rooms and enrolment numbers.
interface ProgrammeCard {
  programme: Programme;
  institutionName: string | null;
  status: ProgrammeStatus;
  courseCount: number;
  approvedTrainees: number;
  nextSession: TimetableSession | null;
  upcomingSessionCount: number;
}

const STATUS_LABEL: Record<ProgrammeStatus, string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  completed: "Completed",
};

const MODE_LABEL: Record<Programme["mode"], string> = {
  online: "Online",
  offline: "Offline",
  hybrid: "Hybrid",
};

function statusFor(programme: Programme, today: string): ProgrammeStatus {
  if (programme.start_date && today < programme.start_date) return "upcoming";
  if (programme.end_date && today > programme.end_date) return "completed";
  return "ongoing";
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSession(session: TimetableSession): string {
  return new Date(session.starts_at).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function loadCard(
  accessToken: string,
  programme: Programme,
  institutions: Institution[],
  today: string,
): Promise<ProgrammeCard> {
  const [courses, nominations, sessions] = await Promise.all([
    getCourses(accessToken, programme.id).catch(() => []),
    getProgrammeNominations(accessToken, programme.id).catch(() => []),
    getTimetableSessions(accessToken, programme.id).catch(() => []),
  ]);
  const now = Date.now();
  const upcoming = sessions
    .filter((session) => new Date(session.ends_at).getTime() >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return {
    programme,
    institutionName:
      institutions.find((inst) => inst.id === programme.institution_id)?.name ?? null,
    status: statusFor(programme, today),
    courseCount: courses.length,
    approvedTrainees: nominations.filter((nom) => nom.status === "approved").length,
    nextSession: upcoming[0] ?? null,
    upcomingSessionCount: upcoming.length,
  };
}

export function TrainerCoursesDashboard({ accessToken, onNavigate }: TrainerCoursesDashboardProps) {
  const [cards, setCards] = useState<ProgrammeCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProgrammeStatus>("all");

  useEffect(() => {
    async function load() {
      try {
        const [institutions, allProgrammes, assignedIds] = await Promise.all([
          getInstitutions(accessToken).catch(() => [] as Institution[]),
          getProgrammes(accessToken),
          getMyAssignedProgrammes(accessToken).catch(() => null),
        ]);
        // Only programmes this trainer is allotted to (docs/DECISIONS.md #52)
        // — the API enforces this on every write. `null` means the lookup
        // itself failed, so fall back to everything rather than hiding a
        // trainer's real work.
        const assigned = assignedIds ? new Set(assignedIds) : null;
        const programmes = assigned
          ? allProgrammes.filter((p) => assigned.has(p.id))
          : allProgrammes;
        const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
        setCards(
          await Promise.all(programmes.map((p) => loadCard(accessToken, p, institutions, today))),
        );
      } catch (err) {
        setError((err as Error).message);
        setCards([]);
      }
    }
    void load();
  }, [accessToken]);

  const query = searchQuery.trim().toLowerCase();
  const filteredCards = (cards ?? []).filter((card) => {
    const matchesQuery =
      !query ||
      card.programme.title.toLowerCase().includes(query) ||
      (card.institutionName ?? "").toLowerCase().includes(query);
    return matchesQuery && (statusFilter === "all" || card.status === statusFilter);
  });

  const institutionNames = [
    ...new Set((cards ?? []).map((c) => c.institutionName).filter(Boolean)),
  ];
  const statusTabs: ("all" | ProgrammeStatus)[] = ["all", "ongoing", "upcoming", "completed"];

  return (
    <div className="flex flex-col w-full text-left gap-space-lg">
      {/* Page Header & Control Bar */}
      <section className="flex flex-col gap-space-md">
        <div className="max-w-3xl">
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
            Assigned Training Programmes
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">
            The programmes you&apos;re allotted to — their courses, enrolled trainees and upcoming
            sessions.
          </p>
        </div>

        <div className="bg-surface-container-lowest p-space-md rounded-2xl shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md border border-border-slate">
          <div className="relative flex-1 max-w-lg">
            <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by programme or institute…"
              className="w-full h-12 pl-11 pr-space-md bg-paper-light text-on-surface font-body-sm text-body-sm rounded-xl outline-none border border-border-slate/60 placeholder:text-on-surface-variant/70 focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-space-xs overflow-x-auto pb-space-xs md:pb-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant mr-space-xs shrink-0 font-bold">
              Status:
            </span>
            {statusTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-space-md py-space-xs rounded-lg font-label-sm text-label-sm uppercase tracking-wider transition-colors min-h-[40px] cursor-pointer font-bold shrink-0 ${
                  statusFilter === tab
                    ? "bg-primary text-on-primary shadow-xs"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {tab === "all" ? "All" : STATUS_LABEL[tab]}
              </button>
            ))}
          </div>
        </div>

        {cards && cards.length > 0 && (
          <div className="flex flex-wrap items-center gap-space-xs text-on-surface-variant px-1 font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-secondary text-[18px]">co_present</span>
            <span>
              Showing <strong className="text-primary font-bold">{filteredCards.length}</strong> of{" "}
              {cards.length} programme{cards.length === 1 ? "" : "s"}
            </span>
            {institutionNames.length > 0 && (
              <>
                <span className="mx-space-xs">•</span>
                <span className="text-on-surface font-medium">{institutionNames.join(", ")}</span>
              </>
            )}
          </div>
        )}
      </section>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl border border-error/20 font-body-md text-body-md">
          {error}
        </div>
      )}

      <section className="space-y-space-lg">
        {cards === null ? (
          <p className="text-on-surface-variant font-body-md text-body-md">
            Loading your programmes…
          </p>
        ) : filteredCards.length === 0 ? (
          <div className="p-space-xl bg-surface-container-lowest rounded-xl shadow-xs text-center border border-outline-variant/40">
            <span className="material-symbols-outlined text-[48px] text-on-surface-variant/40">
              menu_book
            </span>
            <p className="font-label-md text-label-md text-on-surface mt-2">
              {cards.length === 0
                ? "You haven't been assigned to any programme yet. An admin assigns trainers from Programmes → Assigned Trainers."
                : "No programmes match your search."}
            </p>
            {cards.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
                className="mt-3 px-4 py-2 bg-surface-container text-primary font-label-sm text-label-sm rounded hover:bg-surface-container-high cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          filteredCards.map((card) => {
            const { programme } = card;
            const capacity = programme.capacity;
            const enrolledPercent = capacity
              ? Math.min(100, Math.round((card.approvedTrainees / capacity) * 100))
              : null;
            return (
              <div
                key={programme.id}
                className="flex flex-col bg-surface-container-lowest rounded-2xl shadow-xs p-space-lg hover:shadow-md transition-all border border-border-slate"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-md border-b border-border-slate/40">
                  <div className="space-y-space-xs">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span className="px-space-sm py-0.5 bg-primary-container text-on-primary font-metric-mono text-label-sm rounded-lg uppercase tracking-wider font-bold">
                        {MODE_LABEL[programme.mode]}
                      </span>
                      {card.institutionName && (
                        <span className="inline-flex items-center gap-space-xs font-label-sm text-label-sm text-secondary font-semibold">
                          <span className="material-symbols-outlined text-[16px]">location_on</span>
                          {card.institutionName}
                        </span>
                      )}
                    </div>
                    <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
                      {programme.title}
                    </h2>
                    {(programme.start_date || programme.end_date) && (
                      <p className="font-label-sm text-label-sm text-on-surface-variant">
                        {programme.start_date ? formatDate(programme.start_date) : "…"} –{" "}
                        {programme.end_date ? formatDate(programme.end_date) : "…"}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 self-start lg:self-center inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-full font-label-sm text-label-sm font-bold ${
                      card.status === "ongoing"
                        ? "bg-blue-50 text-primary"
                        : card.status === "upcoming"
                          ? "bg-amber-50 text-amber-900"
                          : "bg-surface-container text-slate-700"
                    }`}
                  >
                    {card.status === "ongoing" && (
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    )}
                    {STATUS_LABEL[card.status]}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md my-space-md bg-paper-light border border-border-slate/60 rounded-xl p-space-md">
                  <div className="flex items-start gap-space-sm">
                    <div className="w-10 h-10 rounded-xl bg-surface-card border border-border-slate/60 flex items-center justify-center shrink-0 text-primary shadow-2xs">
                      <span className="material-symbols-outlined text-[20px]">layers</span>
                    </div>
                    <div className="min-w-0">
                      <span className="font-label-sm text-label-sm text-on-surface-variant block font-semibold">
                        Courses
                      </span>
                      <span className="font-metric-mono text-primary text-label-md font-bold block mt-space-xs">
                        {card.courseCount === 0
                          ? "None yet"
                          : `${card.courseCount} course${card.courseCount === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-space-sm">
                    <div className="w-10 h-10 rounded-xl bg-surface-card border border-border-slate/60 flex items-center justify-center shrink-0 text-primary shadow-2xs">
                      <span className="material-symbols-outlined text-[20px]">groups</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                          Enrolled
                        </span>
                        <span className="font-metric-mono text-primary text-label-md font-bold">
                          {card.approvedTrainees}
                          {capacity ? ` / ${capacity}` : ""}
                        </span>
                      </div>
                      {enrolledPercent !== null && (
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-space-xs">
                          <div
                            className="h-full bg-primary-container rounded-full"
                            style={{ width: `${enrolledPercent}%` }}
                          />
                        </div>
                      )}
                      <p className="font-label-sm text-label-sm text-on-surface-variant mt-space-xs">
                        Approved nominations
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-space-sm">
                    <div className="w-10 h-10 rounded-xl bg-surface-card border border-border-slate/60 flex items-center justify-center shrink-0 text-primary shadow-2xs">
                      <span className="material-symbols-outlined text-[20px]">schedule</span>
                    </div>
                    <div className="min-w-0">
                      <span className="font-label-sm text-label-sm text-on-surface-variant block font-semibold">
                        Next session
                      </span>
                      {card.nextSession ? (
                        <>
                          <span className="font-label-md text-label-md text-on-surface block mt-space-xs font-bold">
                            {formatSession(card.nextSession)}
                          </span>
                          <p className="font-label-sm text-label-sm text-on-surface-variant mt-space-xs truncate">
                            {[
                              card.nextSession.title,
                              card.nextSession.course_title,
                              card.nextSession.location,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                            {card.upcomingSessionCount > 1 &&
                              ` (+${card.upcomingSessionCount - 1} more)`}
                          </p>
                        </>
                      ) : (
                        <span className="font-label-md text-label-md text-on-surface-variant block mt-space-xs">
                          None scheduled
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-space-sm">
                  <button
                    type="button"
                    onClick={() => onNavigate("content")}
                    className="inline-flex items-center justify-center gap-space-xs min-h-[44px] px-space-md bg-paper hover:bg-slate-200 text-on-surface font-label-md text-label-md rounded-xl border border-border-slate transition-colors cursor-pointer font-bold"
                  >
                    <span className="material-symbols-outlined text-[18px]">folder_open</span>
                    <span>Manage Content</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate("attendance")}
                    className="inline-flex items-center justify-center gap-space-xs min-h-[44px] px-space-md bg-paper hover:bg-slate-200 text-on-surface font-label-md text-label-md rounded-xl border border-border-slate transition-colors cursor-pointer font-bold"
                  >
                    <span className="material-symbols-outlined text-[18px]">badge</span>
                    <span>Roster & Attendance</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate("content")}
                    className="inline-flex items-center justify-center gap-space-xs min-h-[44px] px-space-md bg-primary-container text-on-primary hover:bg-primary font-label-md text-label-md rounded-xl shadow-xs transition-all cursor-pointer font-bold"
                  >
                    <span className="material-symbols-outlined text-[18px]">fact_check</span>
                    <span>Assessments & Gradebook</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
