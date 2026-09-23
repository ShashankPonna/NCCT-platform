import {
  getMyCertificates,
  getMyJobInterests,
  getMyNominations,
  getProgrammeProgress,
  getTimetableSessions,
} from "@ncct/api-client";
import type { Certificate, JobInterest, Nomination, TimetableSession } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";
import { ErrorBanner } from "./pieces.js";
import type { TraineeTab } from "./TraineeShell.js";

interface TraineeHomeProps {
  accessToken: string;
  fullName: string | null;
  onNavigate: (tab: TraineeTab, subView?: string) => void;
}

type MyNomination = Nomination & { programmes: { title: string; mode: string } | null };
type MyInterest = JobInterest & { jobs: { title: string; location: string | null } | null };
type ProgrammeProgress = { total_lessons: number; completed_lessons: number; percent: number };

interface TraineeHomeText {
  welcome: (firstName: string | null) => string;
  heroWithProgramme: (title: string | undefined) => string;
  heroNoProgramme: string;
  resumeCourse: string;
  browsePogrammes: string;
  continueLearning: {
    inProgress: string;
    notStarted: string;
    noActiveProgramme: string;
    modeWithLessons: (mode: string | undefined, completed: number, total: number) => string;
    modeOnly: (mode: string | undefined) => string;
    nominatePrompt: string;
    progress: string;
    goToLessons: string;
  };
  nextSession: {
    upcoming: string;
    timetableSession: string;
    noUpcoming: string;
    scheduledCaption: string;
    noneScheduledWithProgramme: string;
    noneScheduledNoProgramme: string;
    markAttendance: string;
  };
  employerMatch: {
    title: string;
    shortlisted: (count: number) => string;
    none: string;
    view: string;
  };
  nominations: {
    title: string;
    pending: (count: number) => string;
    allCaughtUp: string;
    browse: string;
    view: string;
  };
  certificates: {
    title: (count: number) => string;
    verified: (count: number) => string;
    none: string;
    view: string;
  };
}

const content: Record<Locale, TraineeHomeText> = {
  en: {
    welcome: (firstName) => `Welcome back${firstName ? `, ${firstName}` : ""}!`,
    heroWithProgramme: (title) =>
      `You're making great progress in your ${title} certification. Your next milestone is coming up next week.`,
    heroNoProgramme:
      "Explore cooperative management programmes, track your progress, and earn verified certifications.",
    resumeCourse: "Resume Course",
    browsePogrammes: "Browse Programmes",
    continueLearning: {
      inProgress: "In Progress",
      notStarted: "Not Started",
      noActiveProgramme: "No active programme",
      modeWithLessons: (mode, completed, total) =>
        `Mode: ${mode} · ${completed}/${total} lessons complete`,
      modeOnly: (mode) => `Mode: ${mode}`,
      nominatePrompt: "Nominate for a programme to start learning.",
      progress: "Progress",
      goToLessons: "Go to Lessons",
    },
    nextSession: {
      upcoming: "Upcoming",
      timetableSession: "Timetable session",
      noUpcoming: "No upcoming sessions",
      scheduledCaption: "Your next scheduled session for this programme.",
      noneScheduledWithProgramme: "Nothing scheduled yet for your programme — check back later.",
      noneScheduledNoProgramme: "Nominate for a programme to see its timetable here.",
      markAttendance: "Mark Attendance (QR / Face)",
    },
    employerMatch: {
      title: "Employer Match",
      shortlisted: (count) =>
        `${count} employer${count === 1 ? "" : "s"} shortlisted your profile.`,
      none: "No employer interest yet — turn on visibility to be discovered.",
      view: "View Open Positions",
    },
    nominations: {
      title: "Nominations",
      pending: (count) => `${count} pending review.`,
      allCaughtUp: "All caught up — no pending nominations.",
      browse: "Browse open programmes to get started.",
      view: "View Programmes",
    },
    certificates: {
      title: (count) => `Certificates (${count})`,
      verified: (count) => `${count} verified credential${count === 1 ? "" : "s"}`,
      none: "Complete a course to earn certificates",
      view: "View Certificates",
    },
  },
  hi: {
    welcome: (firstName) => `वापसी पर स्वागत है${firstName ? `, ${firstName}` : ""}!`,
    heroWithProgramme: (title) =>
      `आप अपने ${title} प्रमाणन में अच्छी प्रगति कर रहे हैं। आपका अगला पड़ाव अगले सप्ताह आने वाला है।`,
    heroNoProgramme:
      "सहकारी प्रबंधन कार्यक्रमों को देखें, अपनी प्रगति ट्रैक करें, और सत्यापित प्रमाणपत्र अर्जित करें।",
    resumeCourse: "पाठ्यक्रम जारी रखें",
    browsePogrammes: "कार्यक्रम देखें",
    continueLearning: {
      inProgress: "प्रगति में",
      notStarted: "शुरू नहीं हुआ",
      noActiveProgramme: "कोई सक्रिय कार्यक्रम नहीं",
      modeWithLessons: (mode, completed, total) => `मोड: ${mode} · ${completed}/${total} पाठ पूर्ण`,
      modeOnly: (mode) => `मोड: ${mode}`,
      nominatePrompt: "सीखना शुरू करने के लिए किसी कार्यक्रम हेतु नामांकन करें।",
      progress: "प्रगति",
      goToLessons: "पाठों पर जाएं",
    },
    nextSession: {
      upcoming: "आगामी",
      timetableSession: "समय-सारणी सत्र",
      noUpcoming: "कोई आगामी सत्र नहीं",
      scheduledCaption: "इस कार्यक्रम के लिए आपका अगला निर्धारित सत्र।",
      noneScheduledWithProgramme:
        "आपके कार्यक्रम के लिए अभी कुछ भी निर्धारित नहीं है — बाद में फिर देखें।",
      noneScheduledNoProgramme: "यहां समय-सारणी देखने के लिए किसी कार्यक्रम हेतु नामांकन करें।",
      markAttendance: "उपस्थिति दर्ज करें (QR / चेहरा)",
    },
    employerMatch: {
      title: "नियोक्ता मिलान",
      shortlisted: (count) =>
        count === 1
          ? "1 नियोक्ता ने आपकी प्रोफ़ाइल शॉर्टलिस्ट की है।"
          : `${count} नियोक्ताओं ने आपकी प्रोफ़ाइल शॉर्टलिस्ट की है।`,
      none: "अभी तक किसी नियोक्ता की रुचि नहीं — खोजे जाने के लिए दृश्यता चालू करें।",
      view: "खुली रिक्तियां देखें",
    },
    nominations: {
      title: "नामांकन",
      pending: (count) => `${count} समीक्षा हेतु लंबित।`,
      allCaughtUp: "सब कुछ अद्यतन है — कोई लंबित नामांकन नहीं।",
      browse: "शुरू करने के लिए खुले कार्यक्रम देखें।",
      view: "कार्यक्रम देखें",
    },
    certificates: {
      title: (count) => `प्रमाणपत्र (${count})`,
      verified: (count) => `${count} सत्यापित प्रमाणपत्र`,
      none: "प्रमाणपत्र अर्जित करने के लिए एक कोर्स पूरा करें",
      view: "प्रमाणपत्र देखें",
    },
  },
};

// Fits the Stitch "Trainee - Dashboard (Mega-Menu)" hero and Bento-grid layout,
// dynamically wired to real own-row data (approved nomination for progress,
// shortlisted jobs count, and earned certificates). The progress percentage
// and "Next Session" card used to be hardcoded (65%, a fake "Live Workshop"
// at "Today, 2:00 PM") — both now come from real endpoints
// (GET /programmes/:id/progress, GET /programmes/:id/timetable); see
// docs/IMPLEMENTATION.md's change log.
export function TraineeHome({ accessToken, fullName, onNavigate }: TraineeHomeProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [nominations, setNominations] = useState<MyNomination[]>([]);
  const [interests, setInterests] = useState<MyInterest[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [progress, setProgress] = useState<ProgrammeProgress | null>(null);
  const [nextSession, setNextSession] = useState<TimetableSession | null>(null);
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
  const currentProgrammeId = currentProgramme?.programme_id ?? null;
  const shortlistCount = interests.filter((i) => i.status === "shortlisted").length;
  const pendingNominationCount = nominations.filter(
    (n) => n.status === "pending" || n.status === "waitlisted",
  ).length;

  useEffect(() => {
    // No synchronous setState on the "no programme" branch — progress/
    // nextSession already default to null, and this codebase avoids
    // set-state-in-effect cascading-render risk (see IMPLEMENTATION.md's
    // F4 change log for the same call made elsewhere).
    if (!currentProgrammeId) return;
    getProgrammeProgress(accessToken, currentProgrammeId)
      .then(setProgress)
      .catch((err: Error) => setError(err.message));
    getTimetableSessions(accessToken, currentProgrammeId)
      .then((sessions) => {
        const now = Date.now();
        const upcoming = sessions
          .filter((s) => new Date(s.starts_at).getTime() > now)
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
        setNextSession(upcoming[0] ?? null);
      })
      .catch((err: Error) => setError(err.message));
  }, [accessToken, currentProgrammeId]);

  return (
    <div className="flex flex-col gap-6 py-2 md:py-4">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-xl border border-border-low-contrast bg-surface-card p-6 shadow-xs transition-colors md:p-8">
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-primary-container/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h1 className="font-headline text-headline-lg-mobile font-bold text-on-background md:text-headline-lg">
              {t.welcome(fullName ? fullName.split(" ")[0] : null)}
            </h1>
            <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant md:text-body-lg">
              {currentProgramme
                ? t.heroWithProgramme(currentProgramme.programmes?.title)
                : t.heroNoProgramme}
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={() => onNavigate("learn", currentProgramme ? "lessons" : "nominate")}
              className="flex min-h-touch-target items-center gap-2 rounded-lg bg-cta px-6 py-3 text-label-md font-bold text-white shadow-sm transition-colors hover:bg-cta-hover"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              {currentProgramme ? t.resumeCourse : t.browsePogrammes}
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
              {currentProgramme ? t.continueLearning.inProgress : t.continueLearning.notStarted}
            </span>
          </div>
          <h3 className="mb-1.5 font-headline text-headline-sm font-bold text-on-surface">
            {currentProgramme?.programmes?.title ?? t.continueLearning.noActiveProgramme}
          </h3>
          <p className="mb-6 flex-1 text-body-md text-on-surface-variant">
            {currentProgramme
              ? progress
                ? t.continueLearning.modeWithLessons(
                    currentProgramme.programmes?.mode,
                    progress.completed_lessons,
                    progress.total_lessons,
                  )
                : t.continueLearning.modeOnly(currentProgramme.programmes?.mode)
              : t.continueLearning.nominatePrompt}
          </p>
          <div className="mt-auto flex flex-col gap-3">
            <div>
              <div className="mb-1.5 flex justify-between text-label-sm text-on-surface-variant">
                <span>{t.continueLearning.progress}</span>
                <span className="font-bold text-interactive">
                  {progress ? `${progress.percent}%` : "0%"}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container">
                <div
                  className="h-2 rounded-full bg-interactive transition-all"
                  style={{ width: `${progress?.percent ?? 0}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("learn", "lessons")}
              className="mt-2 min-h-touch-target rounded-lg border border-interactive px-4 py-2 text-label-md font-bold text-interactive transition-colors hover:bg-interactive hover:text-white"
            >
              {t.continueLearning.goToLessons}
            </button>
          </div>
        </article>

        {/* Next Session Card */}
        <article className="flex flex-col rounded-xl border border-border-low-contrast bg-surface-card p-6 shadow-xs transition-all hover:shadow-md">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-fixed text-secondary">
              <span className="material-symbols-outlined text-[24px]">event</span>
            </div>
            {nextSession && (
              <span className="rounded-full bg-status-pending/10 px-2.5 py-1 text-label-sm font-bold text-status-pending">
                {t.nextSession.upcoming}
              </span>
            )}
          </div>
          <h3 className="mb-1.5 font-headline text-headline-sm font-bold text-on-surface">
            {nextSession
              ? (nextSession.title ?? t.nextSession.timetableSession)
              : t.nextSession.noUpcoming}
          </h3>
          <p className="mb-4 flex-1 text-body-md text-on-surface-variant">
            {nextSession
              ? t.nextSession.scheduledCaption
              : currentProgramme
                ? t.nextSession.noneScheduledWithProgramme
                : t.nextSession.noneScheduledNoProgramme}
          </p>
          {nextSession && (
            <div className="mb-4 rounded-lg bg-surface-container p-3.5 flex items-center gap-3">
              <span className="material-symbols-outlined text-outline">schedule</span>
              <div>
                <p className="text-label-md font-bold text-on-surface">
                  {new Date(nextSession.starts_at).toLocaleString(
                    locale === "hi" ? "hi-IN" : undefined,
                    {
                      dateStyle: "medium",
                      timeStyle: "short",
                    },
                  )}
                </p>
                {nextSession.location && (
                  <p className="text-label-sm text-on-surface-variant">{nextSession.location}</p>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => onNavigate("attendance")}
            className="mt-auto min-h-touch-target rounded-lg border border-interactive px-4 py-2 text-label-md font-bold text-interactive transition-colors hover:bg-interactive hover:text-white"
          >
            {t.nextSession.markAttendance}
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
              <h4 className="text-label-md font-bold text-on-surface">{t.employerMatch.title}</h4>
              <p className="text-label-sm text-on-surface-variant">
                {shortlistCount > 0
                  ? t.employerMatch.shortlisted(shortlistCount)
                  : t.employerMatch.none}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("career", "jobs")}
              className="rounded-full p-2 text-interactive transition-colors hover:bg-surface-container"
              title={t.employerMatch.view}
              aria-label={t.employerMatch.view}
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </article>

          {/* Nomination Status — replaces a fully-mocked "Skills Profile" card
              (Accounting/Coop Mgmt/Agri-Credit chips with no real backing
              data, linking to the parked Phase-2 Skill-Gap screen). This
              shows real nomination data that's already fetched above. */}
          <article className="flex items-center gap-4 rounded-xl border border-border-low-contrast bg-surface-card p-5 shadow-xs transition-all hover:shadow-md">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-fixed text-secondary">
              <span className="material-symbols-outlined">app_registration</span>
            </div>
            <div className="flex-1">
              <h4 className="text-label-md font-bold text-on-surface">{t.nominations.title}</h4>
              <p className="text-label-sm text-on-surface-variant">
                {pendingNominationCount > 0
                  ? t.nominations.pending(pendingNominationCount)
                  : nominations.length > 0
                    ? t.nominations.allCaughtUp
                    : t.nominations.browse}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("learn", "nominate")}
              className="rounded-full p-2 text-interactive transition-colors hover:bg-surface-container"
              title={t.nominations.view}
              aria-label={t.nominations.view}
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </article>

          {/* Certificates Summary */}
          <article className="flex items-center justify-between rounded-xl border border-border-low-contrast bg-surface-card p-5 shadow-xs transition-all hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
                <span className="material-symbols-outlined">workspace_premium</span>
              </div>
              <div>
                <h4 className="text-label-md font-bold text-on-surface">
                  {t.certificates.title(certificates.length)}
                </h4>
                <p className="text-label-sm text-on-surface-variant">
                  {certificates.length > 0
                    ? t.certificates.verified(certificates.length)
                    : t.certificates.none}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("learn", "certificates")}
              className="rounded-full p-2 text-interactive transition-colors hover:bg-surface-container"
              title={t.certificates.view}
              aria-label={t.certificates.view}
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </article>
        </div>
      </div>
    </div>
  );
}
