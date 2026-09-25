import {
  getJobMatches,
  getMyCertificates,
  getMyJobInterests,
  getMyNominations,
  getProgrammeProgress,
  getTimetableSessions,
} from "@ncct/api-client";
import type { Certificate, JobInterest, JobMatch, Nomination, NominationStatus, TimetableSession } from "@ncct/shared-types";
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
  subtitle: string;
  certificates: string;
  lessonsDone: string;
  shortlists: string;
  nextSession: string;
  noneScheduled: string;
  yourProgress: string;
  lessonsOf: (done: number, total: number) => string;
  noProgrammeTitle: string;
  noProgrammeBody: string;
  continueLearning: string;
  browseProgrammes: string;
  pathwayTitle: string;
  steps: { nominated: string; approved: string; learning: string; certified: string; shortlisted: string };
  myProgrammes: string;
  nominationStatus: Record<NominationStatus, string>;
  noNominations: string;
  openLearn: string;
  upcomingSession: string;
  noSessionBody: string;
  checkIn: string;
  checkInHint: string;
  scanQr: string;
  faceCheckIn: string;
  jobMatchesTitle: string;
  jobMatchesSubtitle: string;
  lowSignal: string;
  noJobs: string;
  match: (percent: number) => string;
  viewJobs: string;
  shortlistedBadge: (count: number) => string;
}

const content: Record<Locale, TraineeHomeText> = {
  en: {
    welcome: (firstName) => (firstName ? `Welcome back, ${firstName}` : "Welcome back"),
    subtitle: "Here's where you are in your training, and what's coming up next.",
    certificates: "Certificates",
    lessonsDone: "Lessons done",
    shortlists: "Employer shortlists",
    nextSession: "Next session",
    noneScheduled: "None scheduled",
    yourProgress: "Your progress",
    lessonsOf: (done, total) => `${done} of ${total} lessons completed`,
    noProgrammeTitle: "You're not enrolled in a programme yet",
    noProgrammeBody: "Browse the open programmes and nominate yourself — an admin reviews every nomination.",
    continueLearning: "Continue learning",
    browseProgrammes: "Browse programmes",
    pathwayTitle: "Your pathway",
    steps: {
      nominated: "Nominated",
      approved: "Approved",
      learning: "Learning",
      certified: "Certified",
      shortlisted: "Shortlisted",
    },
    myProgrammes: "My programmes",
    nominationStatus: { pending: "Pending", approved: "Approved", waitlisted: "Waitlisted", rejected: "Not approved" },
    noNominations: "No nominations yet.",
    openLearn: "Open",
    upcomingSession: "Upcoming session",
    noSessionBody: "Nothing is scheduled for your programme yet — sessions appear here as soon as they're added.",
    checkIn: "Check in",
    checkInHint: "Check-in opens when the session starts.",
    scanQr: "QR / session code",
    faceCheckIn: "Face check-in",
    jobMatchesTitle: "Best job matches for you",
    jobMatchesSubtitle: "Ranked against your certificates and skills.",
    lowSignal: "Earn a certificate to get more accurate matches — these are ranked on limited information.",
    noJobs: "No open job postings right now.",
    match: (percent) => `${percent}% match`,
    viewJobs: "View all jobs",
    shortlistedBadge: (count) => `${count} shortlist${count === 1 ? "" : "s"}`,
  },
  hi: {
    welcome: (firstName) => (firstName ? `फिर से स्वागत है, ${firstName}` : "फिर से स्वागत है"),
    subtitle: "आपका प्रशिक्षण कहाँ तक पहुँचा है और आगे क्या है।",
    certificates: "प्रमाणपत्र",
    lessonsDone: "पूरे पाठ",
    shortlists: "नियोक्ता शॉर्टलिस्ट",
    nextSession: "अगला सत्र",
    noneScheduled: "कोई निर्धारित नहीं",
    yourProgress: "आपकी प्रगति",
    lessonsOf: (done, total) => `${total} में से ${done} पाठ पूरे`,
    noProgrammeTitle: "आप अभी किसी कार्यक्रम में नामांकित नहीं हैं",
    noProgrammeBody: "खुले कार्यक्रम देखें और स्वयं को नामांकित करें — हर नामांकन की समीक्षा व्यवस्थापक करते हैं।",
    continueLearning: "सीखना जारी रखें",
    browseProgrammes: "कार्यक्रम देखें",
    pathwayTitle: "आपकी यात्रा",
    steps: {
      nominated: "नामांकित",
      approved: "स्वीकृत",
      learning: "सीख रहे हैं",
      certified: "प्रमाणित",
      shortlisted: "शॉर्टलिस्टेड",
    },
    myProgrammes: "मेरे कार्यक्रम",
    nominationStatus: { pending: "लंबित", approved: "स्वीकृत", waitlisted: "प्रतीक्षा सूची में", rejected: "स्वीकृत नहीं" },
    noNominations: "अभी तक कोई नामांकन नहीं।",
    openLearn: "खोलें",
    upcomingSession: "आगामी सत्र",
    noSessionBody: "आपके कार्यक्रम के लिए अभी कोई सत्र निर्धारित नहीं है — जुड़ते ही सत्र यहाँ दिखेंगे।",
    checkIn: "उपस्थिति दर्ज करें",
    checkInHint: "सत्र शुरू होने पर उपस्थिति खुलती है।",
    scanQr: "QR / सत्र कोड",
    faceCheckIn: "चेहरे से उपस्थिति",
    jobMatchesTitle: "आपके लिए सर्वश्रेष्ठ नौकरियां",
    jobMatchesSubtitle: "आपके प्रमाणपत्रों और कौशल के आधार पर क्रमबद्ध।",
    lowSignal: "अधिक सटीक मिलान के लिए प्रमाणपत्र अर्जित करें — ये सीमित जानकारी पर आधारित हैं।",
    noJobs: "अभी कोई खुली नौकरी नहीं है।",
    match: (percent) => `${percent}% मिलान`,
    viewJobs: "सभी नौकरियां देखें",
    shortlistedBadge: (count) => `${count} शॉर्टलिस्ट`,
  },
};

const NOMINATION_PILL: Record<NominationStatus, string> = {
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pending: "bg-blue-50 text-blue-800 border-blue-200",
  waitlisted: "bg-amber-50 text-amber-800 border-amber-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
};

// The trainee's landing screen. Every number and name on it comes from the
// trainee's own nominations, lesson progress, timetable, certificates,
// shortlists and AI job matches (docs/DECISIONS.md #67) — the previous
// version was a design mock-up with hardcoded stats, invented faculty,
// modules and jobs, and claims of Aadhaar/DigiLocker/stipend integrations
// the platform doesn't have.
export function TraineeHome({ accessToken, fullName, onNavigate }: TraineeHomeProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const dateLocale = locale === "hi" ? "hi-IN" : "en-IN";
  const [nominations, setNominations] = useState<MyNomination[] | null>(null);
  const [interests, setInterests] = useState<MyInterest[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [progress, setProgress] = useState<ProgrammeProgress | null>(null);
  const [nextSession, setNextSession] = useState<TimetableSession | null>(null);
  // Decided when the timetable loads, not during render (render must stay pure).
  const [nextSessionStarted, setNextSessionStarted] = useState(false);
  const [matches, setMatches] = useState<JobMatch[] | null>(null);
  const [hasProfileSignal, setHasProfileSignal] = useState(true);
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
    getJobMatches(accessToken)
      .then((result) => {
        setMatches(result.matches.slice(0, 3));
        setHasProfileSignal(result.hasProfileSignal);
      })
      .catch(() => setMatches([]));
  }, [accessToken]);

  const currentProgramme = nominations?.find((n) => n.status === "approved") ?? null;
  const currentProgrammeId = currentProgramme?.programme_id ?? null;

  useEffect(() => {
    if (!currentProgrammeId) return;
    getProgrammeProgress(accessToken, currentProgrammeId)
      .then(setProgress)
      .catch((err: Error) => setError(err.message));
    getTimetableSessions(accessToken, currentProgrammeId)
      .then((sessions) => {
        const now = Date.now();
        const upcoming = sessions
          .filter((s) => new Date(s.ends_at).getTime() > now)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        setNextSession(upcoming[0] ?? null);
        setNextSessionStarted(upcoming[0] ? new Date(upcoming[0].starts_at).getTime() <= now : false);
      })
      .catch((err: Error) => setError(err.message));
  }, [accessToken, currentProgrammeId]);

  const percent = progress?.percent ?? 0;
  const circleCircumference = 188.49; // 2π × r(30)
  const strokeOffset = circleCircumference - (percent / 100) * circleCircumference;

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });

  // Each step is reached (or not) from real records, and dated from them.
  const firstNomination = [...(nominations ?? [])].sort((a, b) => a.nominated_at.localeCompare(b.nominated_at))[0];
  const latestCertificate = [...certificates].sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0];
  const firstShortlist = [...interests].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  const steps = [
    { key: "nominated", icon: "how_to_reg", done: Boolean(firstNomination), detail: firstNomination ? formatDate(firstNomination.nominated_at) : null },
    {
      key: "approved",
      icon: "verified",
      done: Boolean(currentProgramme),
      detail: currentProgramme?.decided_at ? formatDate(currentProgramme.decided_at) : null,
    },
    { key: "learning", icon: "play_circle", done: percent >= 100, detail: currentProgramme ? `${percent}%` : null },
    { key: "certified", icon: "workspace_premium", done: certificates.length > 0, detail: latestCertificate ? formatDate(latestCertificate.issued_at) : null },
    { key: "shortlisted", icon: "handshake", done: interests.length > 0, detail: firstShortlist ? formatDate(firstShortlist.created_at) : null },
  ] as const;
  const reachedCount = steps.filter((s) => s.done).length;
  const lineFill = reachedCount <= 1 ? 0 : ((reachedCount - 1) / (steps.length - 1)) * 100;

  const statChips = [
    { icon: "workspace_premium", value: String(certificates.length), label: t.certificates },
    { icon: "menu_book", value: progress ? `${progress.completed_lessons}/${progress.total_lessons}` : "—", label: t.lessonsDone },
    { icon: "star", value: String(interests.length), label: t.shortlists },
    { icon: "event", value: nextSession ? formatDateTime(nextSession.starts_at) : t.noneScheduled, label: t.nextSession },
  ];

  return (
    <div className="flex flex-col gap-8 py-2 md:py-4 max-w-[1440px] mx-auto w-full">
      <ErrorBanner message={error} />

      {/* Greeting + progress */}
      <section className="relative w-full rounded-2xl bg-paper p-6 md:p-8 overflow-hidden shadow-sm border border-border-slate transition-colors">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-gradient-to-br from-amber-200/40 via-blue-200/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            {currentProgramme?.programmes && (
              <span className="inline-flex w-fit items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest shadow-xs border border-border-slate">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span className="font-label-md text-xs md:text-sm text-ink font-semibold tracking-wide capitalize">
                  {currentProgramme.programmes.mode}
                </span>
              </span>
            )}
            <h1 className="font-display text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
              {t.welcome(fullName ? fullName.split(" ")[0] : null)}
            </h1>
            <p className="font-body text-body-md text-slate-600 leading-relaxed">{t.subtitle}</p>

            <div className="mt-2 flex flex-wrap items-center gap-3 pt-1">
              {statChips.map((chip) => (
                <div
                  key={chip.label}
                  className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-xs border border-border-slate"
                >
                  <span className="material-symbols-outlined text-secondary text-[20px]">{chip.icon}</span>
                  <div className="flex flex-col">
                    <span className="font-label-md text-xs font-bold text-ink leading-none">{chip.value}</span>
                    <span className="font-metric-mono text-[10px] text-slate-500">{chip.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full xl:w-[400px] shrink-0 bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col gap-3 border border-border-slate">
            {currentProgramme ? (
              <>
                <span className="font-label-md text-xs font-bold text-ink uppercase tracking-wider">{t.yourProgress}</span>
                <div className="flex items-center gap-4 my-1">
                  <div className="relative w-18 h-18 shrink-0 flex items-center justify-center">
                    <svg className="w-18 h-18 transform -rotate-90" viewBox="0 0 72 72">
                      <circle className="text-slate-200" cx="36" cy="36" fill="none" r="30" stroke="currentColor" strokeWidth="6" />
                      <circle
                        className="text-secondary transition-all duration-1000 ease-out"
                        cx="36"
                        cy="36"
                        fill="none"
                        r="30"
                        stroke="currentColor"
                        strokeWidth="6"
                        strokeDasharray={circleCircumference}
                        strokeDashoffset={strokeOffset}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute font-headline text-lg font-bold text-primary">{progress ? `${percent}%` : "…"}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h2 className="font-headline text-sm md:text-base font-bold text-ink truncate">
                      {currentProgramme.programmes?.title}
                    </h2>
                    {progress && (
                      <span className="font-body text-xs text-slate-600 mt-0.5">
                        {t.lessonsOf(progress.completed_lessons, progress.total_lessons)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "lessons")}
                  className="w-full py-2.5 px-4 rounded-lg bg-secondary hover:bg-secondary-dark text-white font-label-md text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <span>{t.continueLearning}</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </>
            ) : (
              <>
                <h2 className="font-headline text-sm md:text-base font-bold text-ink">{t.noProgrammeTitle}</h2>
                <p className="font-body text-xs text-slate-600">{t.noProgrammeBody}</p>
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "nominate")}
                  className="w-full py-2.5 px-4 rounded-lg bg-secondary hover:bg-secondary-dark text-white font-label-md text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <span>{t.browseProgrammes}</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Pathway — each step reached (and dated) from real records */}
      <section className="flex flex-col gap-3 w-full">
        <h2 className="font-headline text-xl md:text-2xl text-ink font-bold">{t.pathwayTitle}</h2>
        <div className="w-full bg-surface-container-lowest p-5 md:p-6 rounded-2xl shadow-xs overflow-x-auto border border-border-slate">
          <div className="min-w-[640px] flex items-start justify-between relative py-2">
            <div className="absolute left-8 right-8 top-7 h-1 bg-border-slate z-0" />
            <div
              className="absolute left-8 top-7 h-1 bg-primary z-0 transition-all"
              style={{ width: `calc((100% - 4rem) * ${lineFill / 100})` }}
            />
            {steps.map((step) => (
              <div key={step.key} className="relative z-10 flex flex-col items-center w-24 text-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shadow-xs ${
                    step.done ? "bg-primary text-white" : "bg-paper text-slate-500 border border-border-slate"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{step.done ? "check" : step.icon}</span>
                </div>
                <span className={`font-label-md text-xs font-bold mt-2 ${step.done ? "text-ink" : "text-slate-500"}`}>
                  {t.steps[step.key]}
                </span>
                {step.detail && <span className="font-metric-mono text-[11px] text-slate-500">{step.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Programmes + upcoming session */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">menu_book</span>
            <h2 className="font-headline text-lg md:text-xl text-ink font-bold">{t.myProgrammes}</h2>
          </div>
          <div className="w-full bg-surface-container-lowest rounded-2xl shadow-xs border border-border-slate divide-y divide-border-slate/60">
            {nominations === null ? (
              <p className="p-5 font-body text-sm text-slate-500">…</p>
            ) : nominations.length === 0 ? (
              <div className="p-5 flex flex-col items-start gap-3">
                <p className="font-body text-sm text-slate-600">{t.noNominations}</p>
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "nominate")}
                  className="font-label-md text-sm text-accent font-bold hover:underline"
                >
                  {t.browseProgrammes} →
                </button>
              </div>
            ) : (
              nominations.map((nom) => (
                <div key={nom.id} className="p-4 md:p-5 flex items-center justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="font-headline text-sm md:text-base font-bold text-ink truncate">
                      {nom.programmes?.title ?? "—"}
                    </span>
                    <span className="font-metric-mono text-[11px] text-slate-500 capitalize">
                      {[nom.programmes?.mode, formatDate(nom.nominated_at)].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${NOMINATION_PILL[nom.status]}`}
                    >
                      {t.nominationStatus[nom.status]}
                    </span>
                    {nom.status === "approved" && (
                      <button
                        type="button"
                        onClick={() => onNavigate("learn", "lessons")}
                        className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90"
                      >
                        {t.openLearn}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">event_available</span>
            <h2 className="font-headline text-lg md:text-xl text-ink font-bold">{t.upcomingSession}</h2>
          </div>
          <div className="w-full bg-surface-container-lowest rounded-2xl shadow-xs p-5 md:p-6 flex flex-col gap-4 border border-border-slate">
            {nextSession ? (
              <>
                <div className="flex flex-col gap-1">
                  <span className="font-metric-mono text-xs text-secondary-dark font-semibold">
                    {formatDateTime(nextSession.starts_at)}
                  </span>
                  <h3 className="font-headline text-base md:text-lg text-ink font-bold">
                    {nextSession.title ?? currentProgramme?.programmes?.title}
                  </h3>
                  {nextSession.location && (
                    <span className="font-body text-sm text-slate-600 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-primary">location_on</span>
                      {nextSession.location}
                    </span>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-paper border border-border-slate flex flex-col gap-2.5">
                  <span className="font-label-md text-sm font-bold text-ink">{t.checkIn}</span>
                  {!nextSessionStarted && <p className="font-body text-xs text-slate-600">{t.checkInHint}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate("attendance")}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-surface-container-lowest border border-border-slate text-ink font-label-md text-xs font-bold hover:bg-surface-container"
                    >
                      <span className="material-symbols-outlined text-[17px] text-accent">qr_code_scanner</span>
                      <span>{t.scanQr}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate("attendance")}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-primary text-white font-label-md text-xs font-bold hover:bg-primary/90"
                    >
                      <span className="material-symbols-outlined text-[17px]">face</span>
                      <span>{t.faceCheckIn}</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="font-body text-sm text-slate-600">{t.noSessionBody}</p>
            )}
          </div>
        </div>
      </div>

      {/* Real AI job matches (P3, DECISIONS.md #28) */}
      <section className="flex flex-col gap-4 w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="font-headline text-xl md:text-2xl text-ink font-bold">{t.jobMatchesTitle}</h2>
              {interests.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-metric-mono text-xs font-bold border border-emerald-200">
                  {t.shortlistedBadge(interests.length)}
                </span>
              )}
            </div>
            <p className="font-body text-xs md:text-sm text-slate-600">{t.jobMatchesSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("career", "jobs")}
            className="font-label-md text-sm text-accent font-bold hover:underline self-start sm:self-auto"
          >
            {t.viewJobs} →
          </button>
        </div>
        {!hasProfileSignal && matches && matches.length > 0 && (
          <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant">
            {t.lowSignal}
          </p>
        )}
        {matches === null ? null : matches.length === 0 ? (
          <p className="font-body text-sm text-slate-600">{t.noJobs}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {matches.map((job) => (
              <div
                key={job.id}
                className="bg-surface-container-lowest p-5 rounded-2xl shadow-xs border border-border-slate flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-headline text-sm font-bold text-ink leading-tight">{job.title}</h3>
                  <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-blue-50 text-primary border border-blue-200 font-metric-mono text-xs font-bold">
                    {t.match(Math.round(job.similarity * 100))}
                  </span>
                </div>
                {job.location && (
                  <span className="flex items-center gap-1 font-metric-mono text-xs text-slate-600">
                    <span className="material-symbols-outlined text-[14px]">pin_drop</span>
                    {job.location}
                  </span>
                )}
                {job.required_skills && job.required_skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {job.required_skills.slice(0, 4).map((skill) => (
                      <span key={skill} className="px-2 py-0.5 rounded bg-paper border border-border-slate text-[11px] text-ink">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
