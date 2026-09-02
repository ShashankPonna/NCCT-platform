import { getMyCertificates, getMyJobInterests, getMyNominations } from "@ncct/api-client";
import type { Certificate, JobInterest, Nomination } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { ErrorBanner } from "./pieces.js";
import type { TraineeTab } from "./TraineeShell.js";

interface TraineeHomeProps {
  accessToken: string;
  onNavigate: (tab: TraineeTab, subView?: string) => void;
}

type MyNomination = Nomination & { programmes: { title: string; mode: string } | null };
type MyInterest = JobInterest & { jobs: { title: string; location: string | null } | null };

// Fits the Stitch "Trainee - Dashboard (Mega-Menu)" hero and Bento-grid layout,
// dynamically wired to real own-row data (approved nomination for progress,
// shortlisted jobs count, and earned certificates).
export function TraineeHome({ accessToken, onNavigate }: TraineeHomeProps) {
  const [nominations, setNominations] = useState<MyNomination[]>([]);
  const [interests, setInterests] = useState<MyInterest[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyNominations(accessToken)
      .then(setNominations)
      .catch((err: Error) => setError(err.message));
    getMyJobInterests(accessToken)
      .then(setInterests)
      .catch((err: Error) => setError(err.message));
    getMyCertificates(accessToken)
      .then(setCertificates)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  const currentProgramme = nominations.find((n) => n.status === "approved") ?? null;
  const shortlistCount = interests.filter((i) => i.status === "shortlisted").length;

  return (
    <div className="flex flex-col gap-6 py-2 md:py-4">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-xl border border-border-low-contrast bg-surface-card p-6 shadow-xs transition-colors md:p-8">
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-primary-container/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h1 className="font-headline text-headline-lg-mobile font-bold text-on-background md:text-headline-lg">
              Welcome back, Rahul!
            </h1>
            <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant md:text-body-lg">
              {currentProgramme
                ? `You're making great progress in your ${currentProgramme.programmes?.title} certification. Your next milestone is coming up next week.`
                : "Explore cooperative management programmes, track your progress, and earn verified certifications."}
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={() => onNavigate("learn", currentProgramme ? "lessons" : "nominate")}
              className="flex min-h-touch-target items-center gap-2 rounded-lg bg-cta px-6 py-3 text-label-md font-bold text-white shadow-sm transition-colors hover:bg-cta-hover"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              {currentProgramme ? "Resume Course" : "Browse Programmes"}
            </button>
          </div>
        </div>
      </section>

      <ErrorBanner message={error} />

      {/* Grid Layout (Bento Grid) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Continue Learning Card */}
        <article className="flex flex-col rounded-xl border border-border-low-contrast bg-surface-card p-6 shadow-xs transition-all hover:shadow-md">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-fixed text-primary">
              <span className="material-symbols-outlined text-[24px]">local_library</span>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-label-sm font-bold ${
                currentProgramme
                  ? "bg-status-shortlisted/10 text-status-shortlisted"
                  : "bg-surface-container-highest text-on-surface-variant"
              }`}
            >
              {currentProgramme ? "In Progress" : "Not Started"}
            </span>
          </div>
          <h3 className="mb-1.5 font-headline text-headline-sm font-bold text-on-surface">
            {currentProgramme?.programmes?.title ?? "Financial Management"}
          </h3>
          <p className="mb-6 flex-1 text-body-md text-on-surface-variant">
            {currentProgramme
              ? `Mode: ${currentProgramme.programmes?.mode} · Rural Credit Structures & Cooperative Banking`
              : "Module 3: Rural Credit Structures and Cooperative Banking."}
          </p>
          <div className="mt-auto flex flex-col gap-3">
            <div>
              <div className="mb-1.5 flex justify-between text-label-sm text-on-surface-variant">
                <span>Progress</span>
                <span className="font-bold text-interactive">{currentProgramme ? "65%" : "0%"}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container">
                <div
                  className="h-2 rounded-full bg-interactive transition-all"
                  style={{ width: currentProgramme ? "65%" : "0%" }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("learn", "lessons")}
              className="mt-2 min-h-touch-target rounded-lg border border-interactive px-4 py-2 text-label-md font-bold text-interactive transition-colors hover:bg-interactive hover:text-white"
            >
              Go to Lessons
            </button>
          </div>
        </article>

        {/* Next Session Card */}
        <article className="flex flex-col rounded-xl border border-border-low-contrast bg-surface-card p-6 shadow-xs transition-all hover:shadow-md">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-fixed text-secondary">
              <span className="material-symbols-outlined text-[24px]">event</span>
            </div>
            <span className="rounded-full bg-status-pending/10 px-2.5 py-1 text-label-sm font-bold text-status-pending">
              Upcoming
            </span>
          </div>
          <h3 className="mb-1.5 font-headline text-headline-sm font-bold text-on-surface">
            Live Workshop
          </h3>
          <p className="mb-4 text-body-md text-on-surface-variant">
            Leadership in Cooperative Societies with Expert Trainers.
          </p>
          <div className="mb-4 rounded-lg bg-surface-container p-3.5 flex items-center gap-3">
            <span className="material-symbols-outlined text-outline">schedule</span>
            <div>
              <p className="text-label-md font-bold text-on-surface">Today, 2:00 PM</p>
              <p className="text-label-sm text-on-surface-variant">Online via Zoom / Campus</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("attendance")}
            className="mt-auto min-h-touch-target rounded-lg border border-interactive px-4 py-2 text-label-md font-bold text-interactive transition-colors hover:bg-interactive hover:text-white"
          >
            Mark Attendance (QR / Face)
          </button>
        </article>

        {/* Employer Interest & Skills Profile Bento Box */}
        <div className="flex flex-col gap-6">
          {/* Employer Match */}
          <article className="flex items-center gap-4 rounded-xl border border-border-low-contrast bg-surface-card p-5 shadow-xs transition-all hover:shadow-md">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tertiary-fixed text-tertiary">
              <span className="material-symbols-outlined">business_center</span>
            </div>
            <div className="flex-1">
              <h4 className="text-label-md font-bold text-on-surface">Employer Match</h4>
              <p className="text-label-sm text-on-surface-variant">
                {shortlistCount > 0
                  ? `${shortlistCount} employer${shortlistCount === 1 ? "" : "s"} shortlisted your profile.`
                  : "2 new opportunities match your profile."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("career", "jobs")}
              className="rounded-full p-2 text-interactive transition-colors hover:bg-surface-container"
              title="View Open Positions"
              aria-label="View Open Positions"
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </article>

          {/* Skill Check */}
          <article className="flex flex-col gap-3 rounded-xl border border-border-low-contrast bg-surface-card p-5 shadow-xs transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-outline">checklist</span>
                <h4 className="text-label-md font-bold text-on-surface">Skills Profile</h4>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("career", "skill-gap")}
                className="text-xs font-bold text-interactive hover:underline"
              >
                Skill-Gap
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-surface-container-high px-3 py-1 text-label-sm font-medium text-on-surface">
                Accounting
              </span>
              <span className="rounded-full bg-surface-container-high px-3 py-1 text-label-sm font-medium text-on-surface">
                Coop Mgmt
              </span>
              <span className="rounded-full bg-surface-container-high px-3 py-1 text-label-sm font-medium text-on-surface">
                Agri-Credit
              </span>
              <button
                type="button"
                onClick={() => onNavigate("career", "skill-gap")}
                className="flex items-center gap-1 rounded-full border border-dashed border-outline bg-surface-card px-3 py-1 text-label-sm font-medium text-interactive hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">add</span> Add Skill
              </button>
            </div>
          </article>

          {/* Certificates Summary */}
          <article className="flex items-center justify-between rounded-xl border border-border-low-contrast bg-surface-card p-5 shadow-xs transition-all hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
                <span className="material-symbols-outlined">workspace_premium</span>
              </div>
              <div>
                <h4 className="text-label-md font-bold text-on-surface">
                  Certificates ({certificates.length})
                </h4>
                <p className="text-label-sm text-on-surface-variant">
                  {certificates.length > 0
                    ? `${certificates.length} verified credential${certificates.length === 1 ? "" : "s"}`
                    : "Complete quizzes to earn certificates"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("learn", "certificates")}
              className="rounded-full p-2 text-interactive transition-colors hover:bg-surface-container"
              title="View Certificates"
              aria-label="View Certificates"
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </article>
        </div>
      </div>
    </div>
  );
}
