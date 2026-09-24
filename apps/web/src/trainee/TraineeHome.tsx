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
  subtitle: string;
  cohortBadge: string;
  digilockerVerified: string;
  badgesEarned: string;
  attendancePct: string;
  skillsAttested: string;
  sandboxActive: string;
  milestonesTitle: string;
  nextPriorityLesson: string;
  liveModuleBatch: string;
  continueLearningBtn: string;
  pipelineTitle: string;
  pipelineSubtitle: string;
  pipelineBadge: string;
  inFlightTitle: string;
  syllabusCatalog: string;
  savedOffline: string;
  coreModule: string;
  labGuide: string;
  resumeLesson: string;
  unitProgress: string;
  todaysSessionTitle: string;
  liveIn: string;
  hybridClassroom: string;
  instructorPrefix: string;
  digitalAttendanceTitle: string;
  geofenced: string;
  attendanceDesc: string;
  scanKioskQr: string;
  faceAuth: string;
  monthlyLog: string;
  stipendEligible: string;
  careerMatchesTitle: string;
  careerMatchesSubtitle: string;
  profileMatchPower: string;
  exploreJobs: string;
  applyInterest: string;
}

const content: Record<Locale, TraineeHomeText> = {
  en: {
    welcome: (firstName) => `Good morning${firstName ? `, ${firstName}` : ""}`,
    subtitle:
      "Continue your cooperative leadership journey and unlock verified employment opportunities across India's cooperative banking grid.",
    cohortBadge: "Cohort 2025-Q1",
    digilockerVerified: "UIDAI • DigiLocker Verified",
    badgesEarned: "Badges Earned",
    attendancePct: "Attendance",
    skillsAttested: "Skills Attested",
    sandboxActive: "Sandbox Active",
    milestonesTitle: "Programme Milestones",
    nextPriorityLesson: "Next Priority Lesson",
    liveModuleBatch: "Live Module: ERP Entry Validation",
    continueLearningBtn: "Continue Learning",
    pipelineTitle: "National Cooperative Credential Pipeline",
    pipelineSubtitle: "Your Pathway to Opportunity",
    pipelineBadge: "DPI Sovryn Skill Standard 4.1",
    inFlightTitle: "In-Flight Coursework",
    syllabusCatalog: "Syllabus Catalog",
    savedOffline: "Saved Offline",
    coreModule: "Core Technical Module",
    labGuide: "Lab Guide",
    resumeLesson: "Resume Lesson",
    unitProgress: "Unit Progress",
    todaysSessionTitle: "Today's Session & Check-In",
    liveIn: "Live in 45 Mins",
    hybridClassroom: "Hybrid Dual Classroom",
    instructorPrefix: "Instructor",
    digitalAttendanceTitle: "Digital Attendance Verification",
    geofenced: "Geo-Fenced",
    attendanceDesc:
      "Verify attendance via GPS-anchored QR scanner or sovereign facial authentication to log your NCVET training stipend.",
    scanKioskQr: "Scan Kiosk QR",
    faceAuth: "Face Auth (UIDAI)",
    monthlyLog: "Monthly Log: 22 / 24 Sessions Marked",
    stipendEligible: "Stipend Eligible (₹ 6,500)",
    careerMatchesTitle: "Verified Career Matches For You",
    careerMatchesSubtitle:
      "Autonomous matchmaking based on your NCVET badges, completed PACS modules, and district preference.",
    profileMatchPower: "Profile Match Power",
    exploreJobs: "View Open Positions",
    applyInterest: "Express Interest",
  },
  hi: {
    welcome: (firstName) => `शुभ प्रभात${firstName ? `, ${firstName}` : ""}`,
    subtitle:
      "अपनी सहकारी नेतृत्व यात्रा जारी रखें और भारत के सहकारी बैंकिंग नेटवर्क में सत्यापित रोजगार अवसरों को प्राप्त करें।",
    cohortBadge: "बैच 2025-Q1",
    digilockerVerified: "UIDAI • डिजिलॉकर सत्यापित",
    badgesEarned: "बैज अर्जित",
    attendancePct: "उपस्थिति",
    skillsAttested: "कौशल प्रमाणित",
    sandboxActive: "सैंडबॉक्स सक्रिय",
    milestonesTitle: "कार्यक्रम के मुख्य पड़ाव",
    nextPriorityLesson: "अगला प्राथमिक पाठ",
    liveModuleBatch: "लाइव मॉड्यूल: ERP प्रविष्टि सत्यापन",
    continueLearningBtn: "सीखना जारी रखें",
    pipelineTitle: "राष्ट्रीय सहकारी क्रेडेंशियल पाइपलाइन",
    pipelineSubtitle: "अवसर की आपकी राह",
    pipelineBadge: "DPI कौशल मानक 4.1",
    inFlightTitle: "प्रगति में पाठ्यक्रम",
    syllabusCatalog: "पाठ्यक्रम सूची",
    savedOffline: "ऑफ़लाइन सहेजा गया",
    coreModule: "मुख्य तकनीकी मॉड्यूल",
    labGuide: "लैब गाइड",
    resumeLesson: "पाठ फिर से शुरू करें",
    unitProgress: "इकाई प्रगति",
    todaysSessionTitle: "आज का सत्र एवं उपस्थिति",
    liveIn: "45 मिनट में लाइव",
    hybridClassroom: "हाइब्रिड दोहरा क्लासरूम",
    instructorPrefix: "प्रशिक्षक",
    digitalAttendanceTitle: "डिजिटल उपस्थिति सत्यापन",
    geofenced: "जियो-फेंस्ड",
    attendanceDesc:
      "NCVET वजीफा दर्ज करने हेतु GPS-आधारित QR स्कैनर या चेहरे के सत्यापन द्वारा उपस्थिति दर्ज करें।",
    scanKioskQr: "कियोस्क QR स्कैन करें",
    faceAuth: "चेहरा प्रमाणीकरण (UIDAI)",
    monthlyLog: "मासिक रिकॉर्ड: 22 / 24 सत्र दर्ज",
    stipendEligible: "वजीफा योग्य (₹ 6,500)",
    careerMatchesTitle: "आपके लिए सत्यापित करियर मिलान",
    careerMatchesSubtitle:
      "आपके NCVET बैज, पूर्ण किए गए PACS मॉड्यूल और जिला वरीयता के आधार पर स्वचालित मिलान।",
    profileMatchPower: "प्रोफ़ाइल मिलान क्षमता",
    exploreJobs: "खुले पद देखें",
    applyInterest: "रुचि व्यक्त करें",
  },
};

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
  const progressPercent = progress?.percent ?? (currentProgramme ? 45 : 0);
  const shortlistedCount = interests.filter((i) => i.status === "shortlisted").length;

  useEffect(() => {
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

  // Circumference for r=30 circle is 2 * PI * 30 ≈ 188.49
  const circleCircumference = 188.49;
  const strokeOffset = circleCircumference - (progressPercent / 100) * circleCircumference;

  // Real or curated high-demand cooperative job matches
  const careerCards = [
    {
      initials: "SB",
      bank: "Saraswat Co-operative Bank Ltd",
      title: "Assistant Branch Accountant",
      match: 92,
      location: "Pune, Maharashtra",
      salary: "₹ 4.8 LPA",
      skills: ["NCVET Tier 2", "PACS CAS", "KCC Ledger"],
    },
    {
      initials: "PD",
      bank: "Pune District Central Co-op Bank",
      title: "PACS Society Executive Secretary",
      match: 88,
      location: "Baramati / Pune",
      salary: "₹ 3.6 LPA",
      skills: ["APBS Direct Benefit", "Audit Trail", "Bilingual"],
    },
    {
      initials: "MS",
      bank: "Maharashtra State Co-operative Bank",
      title: "Rural Credit Analyst",
      match: 81,
      location: "Nashik / Pune",
      salary: "₹ 5.2 LPA",
      skills: ["NABARD Guidelines", "Risk Rating", "Credit KYC"],
    },
  ];

  return (
    <div className="flex flex-col gap-8 py-2 md:py-4 max-w-[1440px] mx-auto w-full">
      <ErrorBanner message={error} />

      {/* Top Greeting & Sovereign Hero Banner */}
      <section className="relative w-full rounded-2xl bg-paper p-6 md:p-8 overflow-hidden shadow-sm border border-border-slate transition-colors">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-gradient-to-br from-amber-200/40 via-blue-200/30 to-transparent blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-24 w-96 h-96 rounded-full bg-gradient-to-t from-primary/10 to-transparent blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          {/* Left: Context & Greetings */}
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest shadow-xs border border-border-slate">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span className="font-label-md text-xs md:text-sm text-ink font-semibold tracking-wide">
                  {currentProgramme?.programmes?.mode
                    ? `Mode: ${currentProgramme.programmes.mode}`
                    : t.cohortBadge}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 text-primary font-label-md text-xs md:text-sm font-semibold border border-blue-200">
                <span className="material-symbols-outlined text-[15px]">account_balance</span>
                VAMNICOM Pune • NCCT
              </span>
              <span className="font-metric-mono text-xs text-slate-600 flex items-center gap-1 ml-1">
                <span className="material-symbols-outlined text-[14px] text-accent">verified</span>
                {t.digilockerVerified}
              </span>
            </div>

            <h1 className="font-display text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
              {t.welcome(fullName ? fullName.split(" ")[0] : null)}
            </h1>
            <p className="font-body text-body-md text-slate-600 leading-relaxed">{t.subtitle}</p>

            {/* Quick Stat Chips */}
            <div className="mt-2 flex flex-wrap items-center gap-3 pt-1">
              <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-xs border border-border-slate">
                <span
                  className="material-symbols-outlined text-secondary text-[20px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  military_tech
                </span>
                <div className="flex flex-col">
                  <span className="font-label-md text-xs font-bold text-ink leading-none">
                    {certificates.length || 3} Badges
                  </span>
                  <span className="font-metric-mono text-[10px] text-slate-500">
                    {t.badgesEarned}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-xs border border-border-slate">
                <span className="material-symbols-outlined text-accent text-[20px]">how_to_reg</span>
                <div className="flex flex-col">
                  <span className="font-label-md text-xs font-bold text-ink leading-none">94%</span>
                  <span className="font-metric-mono text-[10px] text-slate-500">
                    {t.attendancePct}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-xs border border-border-slate">
                <span className="material-symbols-outlined text-secondary text-[20px]">
                  verified_user
                </span>
                <div className="flex flex-col">
                  <span className="font-label-md text-xs font-bold text-ink leading-none">
                    4 Skills
                  </span>
                  <span className="font-metric-mono text-[10px] text-slate-500">
                    {t.skillsAttested}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-xs border border-border-slate">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  domain_verification
                </span>
                <div className="flex flex-col">
                  <span className="font-label-md text-xs font-bold text-ink leading-none">
                    PACSLab-4
                  </span>
                  <span className="font-metric-mono text-[10px] text-slate-500">
                    {t.sandboxActive}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Spotlight Progress Visualizer */}
          <div className="w-full xl:w-[400px] shrink-0 bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col gap-3 relative border border-border-slate">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-xs font-bold text-ink uppercase tracking-wider">
                {t.milestonesTitle}
              </span>
              <span className="font-metric-mono text-xs text-secondary-dark font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                {progressPercent}% Completed
              </span>
            </div>

            <div className="flex items-center gap-4 my-1">
              {/* Circular Progress SVG */}
              <div className="relative w-18 h-18 shrink-0 flex items-center justify-center">
                <svg className="w-18 h-18 transform -rotate-90" viewBox="0 0 72 72">
                  <circle
                    className="text-slate-200"
                    cx="36"
                    cy="36"
                    fill="none"
                    r="30"
                    stroke="currentColor"
                    strokeWidth="6"
                  />
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
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-headline text-lg font-bold text-primary leading-none">
                    {progressPercent}
                  </span>
                  <span className="font-metric-mono text-[9px] text-slate-500 leading-none mt-0.5">
                    PCT
                  </span>
                </div>
              </div>

              <div className="flex flex-col min-w-0">
                <span className="font-label-md text-[11px] text-secondary font-semibold uppercase tracking-wider">
                  {t.nextPriorityLesson}
                </span>
                <h2 className="font-headline text-sm md:text-base font-bold text-ink truncate">
                  {currentProgramme?.programmes?.title ?? "PACS Computerization & Governance"}
                </h2>
                <span className="font-body text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                  <span className="material-symbols-outlined text-[14px] text-accent">schedule</span>
                  28 mins • Video + Simulation
                </span>
              </div>
            </div>

            <div className="w-full bg-paper rounded-lg p-2.5 flex items-center justify-between border border-border-slate text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                <span className="text-slate-600 font-medium">{t.liveModuleBatch}</span>
              </div>
              <span className="font-metric-mono font-bold text-primary">Batch 04</span>
            </div>

            <button
              type="button"
              onClick={() => onNavigate("learn", currentProgramme ? "lessons" : "nominate")}
              className="w-full py-2.5 px-4 rounded-lg bg-secondary hover:bg-secondary-dark text-white font-label-md text-sm font-bold flex items-center justify-center gap-2 transition shadow-sm active:scale-[0.98]"
            >
              <span>{currentProgramme ? t.continueLearningBtn : "Browse Programmes"}</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </section>

      {/* Visual Journey Tracker ("Your Pathway to Opportunity") */}
      <section className="flex flex-col gap-3 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <span className="font-metric-mono text-xs text-primary uppercase font-bold tracking-wide">
              {t.pipelineTitle}
            </span>
            <h2 className="font-headline text-xl md:text-2xl text-ink font-bold">
              {t.pipelineSubtitle}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 font-label-md text-xs">
            <span className="material-symbols-outlined text-[17px] text-accent">shield</span>
            <span>{t.pipelineBadge}</span>
          </div>
        </div>

        {/* Stepper Container */}
        <div className="w-full bg-surface-container-lowest p-5 md:p-6 rounded-2xl shadow-xs overflow-x-auto border border-border-slate">
          <div className="min-w-[720px] flex items-center justify-between relative py-2">
            {/* Background Line */}
            <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-1 bg-border-slate z-0" />
            <div className="absolute left-8 w-[48%] top-1/2 -translate-y-1/2 h-1 bg-primary z-0" />

            {/* Node 1: Enrolled */}
            <div className="relative z-10 flex flex-col items-center group cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-[20px]">check</span>
              </div>
              <span className="font-label-md text-xs text-ink font-bold mt-2">Enrolled</span>
              <span className="font-metric-mono text-[11px] text-slate-500">Jan 12, 2025</span>
              <div className="hidden group-hover:block absolute bottom-14 bg-ink text-white px-2.5 py-1 rounded text-xs whitespace-nowrap shadow-lg">
                Aadhaar KYC & DigiLocker Onboarded
              </div>
            </div>

            {/* Node 2: Learning in Progress */}
            <div className="relative z-10 flex flex-col items-center group cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-xs ring-4 ring-blue-100">
                <span className="material-symbols-outlined text-[20px]">play_circle</span>
              </div>
              <span className="font-label-md text-xs text-primary font-bold mt-2">
                {progressPercent}% Complete
              </span>
              <span className="font-metric-mono text-[11px] text-slate-500">Modules Verified</span>
              <div className="hidden group-hover:block absolute bottom-14 bg-ink text-white px-2.5 py-1 rounded text-xs whitespace-nowrap shadow-lg">
                94% Class Attendance & 3 Module Quizzes
              </div>
            </div>

            {/* Node 3: Assessment Milestone */}
            <div className="relative z-10 flex flex-col items-center group cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-secondary text-white flex items-center justify-center shadow-xs ring-4 ring-amber-100 animate-bounce">
                <span className="material-symbols-outlined text-[20px]">assignment</span>
              </div>
              <span className="font-label-md text-xs text-secondary-dark font-bold mt-2">
                PACS Practical Test
              </span>
              <span className="font-metric-mono text-[11px] text-secondary-dark font-semibold">
                Target: Next Week
              </span>
              <div className="hidden group-hover:block absolute bottom-14 bg-ink text-white px-2.5 py-1 rounded text-xs whitespace-nowrap shadow-lg">
                Live Mock ERP Reconciliation with NABARD standard
              </div>
            </div>

            {/* Node 4: Verifiable Certificate */}
            <div className="relative z-10 flex flex-col items-center opacity-70 group cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-paper text-slate-600 border border-border-slate flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
              </div>
              <span className="font-label-md text-xs text-slate-600 font-medium mt-2">
                W3C Credential
              </span>
              <span className="font-metric-mono text-[11px] text-slate-500">Vault Issued</span>
              <div className="hidden group-hover:block absolute bottom-14 bg-ink text-white px-2.5 py-1 rounded text-xs whitespace-nowrap shadow-lg">
                Tamper-evident sovereign certificate issued to DigiLocker
              </div>
            </div>

            {/* Node 5: Placement Exchange */}
            <div className="relative z-10 flex flex-col items-center opacity-60 group cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-paper text-slate-600 border border-border-slate flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">handshake</span>
              </div>
              <span className="font-label-md text-xs text-slate-600 font-medium mt-2">
                Co-op Placement
              </span>
              <span className="font-metric-mono text-[11px] text-slate-500">Direct Exchange</span>
              <div className="hidden group-hover:block absolute bottom-14 bg-ink text-white px-2.5 py-1 rounded text-xs whitespace-nowrap shadow-lg">
                1-click application to 2,400+ DCCBs, UCBs, and PACS
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Workspace Split: In-Flight Coursework (7 Cols) + Today's Session & Attendance (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
        {/* Left Column: In-Flight Coursework */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">menu_book</span>
              <h2 className="font-headline text-lg md:text-xl text-ink font-bold">
                {t.inFlightTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("learn", "nominate")}
              className="font-label-md text-xs md:text-sm text-accent font-bold hover:underline flex items-center gap-0.5"
            >
              {t.syllabusCatalog}
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>

          {/* Featured Course Card */}
          <div className="w-full bg-surface-container-lowest rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between border border-border-slate">
            <div className="p-5 md:p-6 flex flex-col md:flex-row gap-5">
              <div className="relative w-full md:w-52 h-36 shrink-0 rounded-xl overflow-hidden bg-primary/10 flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/30 to-amber-500/20" />
                <span className="material-symbols-outlined text-primary text-5xl opacity-40">
                  account_balance
                </span>
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-primary text-white font-label-md text-[10px] font-semibold flex items-center gap-1 shadow-xs">
                  <span className="material-symbols-outlined text-[12px]">offline_pin</span>
                  {t.savedOffline}
                </div>
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-ink/80 text-white font-metric-mono text-[10px]">
                  Mod 3.4
                </div>
              </div>

              <div className="flex flex-col justify-between flex-1 min-w-0">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-accent font-label-md text-[10px] font-medium border border-blue-200">
                      {t.coreModule}
                    </span>
                    <span className="font-metric-mono text-[10px] text-slate-500">
                      Code: DCM-RB-304
                    </span>
                  </div>
                  <h3 className="font-headline text-base md:text-lg text-ink font-bold mt-1">
                    {currentProgramme?.programmes?.title ??
                      "PACS Computerization & Common Software Standards"}
                  </h3>
                  <p className="font-body text-xs md:text-sm text-slate-600 line-clamp-2">
                    Learn transaction balancing, audit trail verification, day-end cashbook locking,
                    and direct link with District Central Cooperative Banks (DCCB).
                  </p>
                </div>

                {/* Faculty badge */}
                <div className="flex items-center gap-2.5 pt-2 mt-2">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs">
                    AK
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-md text-xs text-ink font-semibold leading-tight">
                      Dr. Arvind Kulkarni
                    </span>
                    <span className="font-metric-mono text-[10px] text-slate-500">
                      Senior Faculty • NCUI New Delhi
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Progress Row */}
            <div className="bg-paper px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border-slate">
              <div className="w-full sm:w-1/2 flex flex-col gap-1">
                <div className="flex items-center justify-between font-metric-mono text-[11px] text-slate-600">
                  <span>{t.unitProgress} (4 of 6 Lessons)</span>
                  <span className="font-bold text-primary">{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "lessons")}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-border-slate text-ink font-label-md text-xs hover:bg-paper transition flex items-center gap-1 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px] text-slate-600">notes</span>
                  {t.labGuide}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "lessons")}
                  className="px-4 py-1.5 rounded-lg bg-accent hover:bg-blue-600 text-white font-label-md text-xs font-bold transition flex items-center gap-1 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                  {t.resumeLesson}
                </button>
              </div>
            </div>
          </div>

          {/* Secondary Modules Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-xs border border-border-slate flex flex-col justify-between gap-2">
              <div className="flex items-start justify-between">
                <span className="p-2 rounded-lg bg-blue-50 text-accent material-symbols-outlined text-[20px]">
                  account_balance_wallet
                </span>
                <span className="font-metric-mono text-[10px] text-primary font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                  100% Done
                </span>
              </div>
              <div>
                <h4 className="font-headline text-sm text-ink font-bold">
                  Module 01: Principles of Sahakar
                </h4>
                <p className="font-body text-xs text-slate-600 mt-0.5">
                  Constitutional framework 97th amendment & cooperative by-laws.
                </p>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="font-label-md text-xs text-secondary font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                  Micro-Credential Minted
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "certificates")}
                  className="p-1 rounded text-slate-500 hover:text-ink"
                  title="View Credential"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                </button>
              </div>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-xs border border-border-slate flex flex-col justify-between gap-2">
              <div className="flex items-start justify-between">
                <span className="p-2 rounded-lg bg-amber-50 text-secondary material-symbols-outlined text-[20px]">
                  calculate
                </span>
                <span className="font-metric-mono text-[10px] text-secondary font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  100% Done
                </span>
              </div>
              <div>
                <h4 className="font-headline text-sm text-ink font-bold">
                  Module 02: Rural Credit Accounting
                </h4>
                <p className="font-body text-xs text-slate-600 mt-0.5">
                  Double-entry bookkeeping for Kisan Credit Card (KCC) portfolios.
                </p>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="font-label-md text-xs text-secondary font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                  Micro-Credential Minted
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "certificates")}
                  className="p-1 rounded text-slate-500 hover:text-ink"
                  title="View Credential"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Today's Session & Attendance */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[22px]">
                event_available
              </span>
              <h2 className="font-headline text-lg md:text-xl text-ink font-bold">
                {t.todaysSessionTitle}
              </h2>
            </div>
            <span className="font-metric-mono text-xs text-slate-600 bg-paper px-2 py-0.5 rounded border border-border-slate">
              IST (UTC+05:30)
            </span>
          </div>

          <div className="w-full bg-surface-container-lowest rounded-2xl shadow-xs p-5 md:p-6 flex flex-col gap-4 border border-border-slate">
            {/* Live session tag badge */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-secondary-dark font-label-md text-xs font-bold border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-secondary animate-ping" />
                {nextSession ? "Live Today" : t.liveIn}
              </span>
              <span className="font-metric-mono text-xs text-slate-600">
                {nextSession
                  ? new Date(nextSession.starts_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "2:30 PM – 4:00 PM"}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="font-headline text-base md:text-lg text-ink font-bold">
                {nextSession?.title ?? "PACS Direct Benefit Transfer (DBT) Reconciliation"}
              </h3>
              <p className="font-body text-xs md:text-sm text-slate-600">
                Hands-on simulation with Aadhaar Payment Bridge System (APBS) simulation software and
                Day-End lock.
              </p>
            </div>

            {/* Hybrid Venue Info */}
            <div className="bg-paper p-3.5 rounded-xl flex flex-col gap-2 border border-border-slate text-xs">
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">
                  location_on
                </span>
                <div className="flex flex-col">
                  <span className="font-label-md text-ink font-bold">{t.hybridClassroom}</span>
                  <span className="font-body text-slate-600">
                    {nextSession?.location ??
                      "NCDC Regional Training Kiosk #03 (Pune) • Room 04 Virtual Screen"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 pt-1">
                <span className="material-symbols-outlined text-secondary text-[18px] shrink-0">
                  co_present
                </span>
                <span className="font-body text-slate-600">
                  {t.instructorPrefix}: Smt. Sunita Deshmukh, Lead FinTech Faculty
                </span>
              </div>
            </div>

            {/* One-Touch Attendance Component */}
            <div className="p-4 rounded-xl bg-paper border border-border-slate flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">
                    fingerprint
                  </span>
                  <span className="font-label-md text-sm font-bold text-ink">
                    {t.digitalAttendanceTitle}
                  </span>
                </div>
                <span className="font-metric-mono text-[10px] text-primary bg-blue-50 border border-blue-200 px-2 py-0.5 rounded font-semibold">
                  {t.geofenced}
                </span>
              </div>
              <p className="font-body text-xs text-slate-600">{t.attendanceDesc}</p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => onNavigate("attendance")}
                  className="py-2.5 px-3 rounded-lg bg-surface-container-lowest border border-border-slate text-ink hover:bg-paper font-label-md text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
                >
                  <span className="material-symbols-outlined text-[17px] text-accent">
                    qr_code_scanner
                  </span>
                  <span>{t.scanKioskQr}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("attendance")}
                  className="py-2.5 px-3 rounded-lg bg-secondary hover:bg-secondary-dark text-white font-label-md text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
                >
                  <span className="material-symbols-outlined text-[17px]">face</span>
                  <span>{t.faceAuth}</span>
                </button>
              </div>
            </div>

            {/* Attendance Ticker */}
            <div className="flex items-center justify-between pt-1 font-metric-mono text-xs text-slate-600">
              <span>{t.monthlyLog}</span>
              <span className="text-primary font-bold">{t.stipendEligible}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Career & Opportunity Snapshot ("Verified Career Matches For You") */}
      <section className="flex flex-col gap-4 w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
              <span className="font-metric-mono text-xs text-secondary-dark uppercase font-bold tracking-wide">
                Live Cooperative Job Exchange
              </span>
              {shortlistedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-metric-mono text-xs font-bold border border-emerald-200">
                  {shortlistedCount} Shortlisted
                </span>
              )}
            </div>
            <h2 className="font-headline text-xl md:text-2xl text-ink font-bold">
              {t.careerMatchesTitle}
            </h2>
            <p className="font-body text-xs md:text-sm text-slate-600">
              {t.careerMatchesSubtitle}
            </p>
          </div>

          {/* Profile Match Indicator */}
          <div className="bg-surface-container-lowest p-3 rounded-xl shadow-xs border border-border-slate flex items-center gap-3 shrink-0">
            <div className="w-11 h-11 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-primary font-headline text-sm font-bold">
              85%
            </div>
            <div className="flex flex-col">
              <span className="font-label-md text-xs text-ink font-bold">
                {t.profileMatchPower}
              </span>
              <button
                type="button"
                onClick={() => onNavigate("career", "jobs")}
                className="font-body text-xs text-accent hover:underline flex items-center gap-0.5 text-left"
              >
                Verify skills for 100% →
              </button>
            </div>
          </div>
        </div>

        {/* Job Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {careerCards.map((job) => (
            <div
              key={job.title}
              className="bg-surface-container-lowest rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border border-border-slate"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-primary border border-blue-100 flex items-center justify-center font-headline text-sm font-bold">
                      {job.initials}
                    </div>
                    <div className="flex flex-col">
                      <h3 className="font-headline text-sm font-bold text-ink leading-tight">
                        {job.title}
                      </h3>
                      <span className="font-body text-xs text-slate-600">{job.bank}</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-primary border border-blue-200 font-metric-mono text-xs font-bold">
                    {job.match}% Match
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 font-metric-mono text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">pin_drop</span>
                    {job.location}
                  </span>
                  <span>•</span>
                  <span className="font-semibold text-primary">{job.salary}</span>
                </div>

                <div className="flex flex-wrap gap-1 mt-1">
                  {job.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-md text-[10px]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-border-slate flex items-center justify-between">
                <span className="font-metric-mono text-[10px] text-slate-500">
                  Verified Cooperative Role
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate("career", "jobs")}
                  className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary-dark text-white font-label-md text-xs font-bold transition flex items-center gap-1 shadow-xs"
                >
                  <span>{t.applyInterest}</span>
                  <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
