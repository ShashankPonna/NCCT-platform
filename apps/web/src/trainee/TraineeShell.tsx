import { useEffect, useState } from "react";
import { LocaleToggle, useLocale, type Locale } from "../i18n/LocaleContext.js";
import { supabase } from "../supabaseClient.js";

export type TraineeTab = "home" | "learn" | "attendance" | "career" | "profile";

interface TraineeShellText {
  nav: {
    home: string;
    learn: string;
    attendance: string;
    career: string;
  };
  portalTag: string;
  tagline: string;
  skipToContent: string;
  decreaseText: string;
  normalText: string;
  increaseText: string;
  lightMode: string;
  darkMode: string;
  highContrast: string;
  searchPlaceholder: string;
  toggleTheme: string;
  notifications: string;
  myProfile: string;
  signOut: string;
  trainee: string;
  learnMenu: {
    lessonsTitle: string;
    lessonsDesc: string;
    certificatesTitle: string;
    certificatesDesc: string;
    nominateTitle: string;
    nominateDesc: string;
  };
  careerMenu: {
    jobsTitle: string;
    jobsDesc: string;
    skillGapTitle: string;
    skillGapDesc: string;
    askTitle: string;
    askDesc: string;
    faqTitle: string;
    faqDesc: string;
  };
  footerCopyright: string;
  footerPrivacy: string;
  footerTerms: string;
  footerSupport: string;
}

const content: Record<Locale, TraineeShellText> = {
  en: {
    nav: {
      home: "Home",
      learn: "Learn",
      attendance: "Attendance",
      career: "Career",
    },
    portalTag: "COOP-NET • Sahakar Utkarsh",
    tagline: "National Cooperative Digital Training & Employment Infrastructure • Govt of India",
    skipToContent: "Skip To Main Content",
    decreaseText: "Decrease text size",
    normalText: "Normal text size",
    increaseText: "Increase text size",
    lightMode: "Switch to Light Mode",
    darkMode: "Switch to Dark Mode",
    highContrast: "High Contrast Toggle",
    searchPlaceholder: "Search Courses & Modules...",
    toggleTheme: "Toggle Theme",
    notifications: "Notifications",
    myProfile: "My profile",
    signOut: "Sign Out",
    trainee: "Trainee",
    learnMenu: {
      lessonsTitle: "My Lessons",
      lessonsDesc: "Interactive modules, video player, and quizzes",
      certificatesTitle: "My Certificates",
      certificatesDesc: "Download verified certificates with QR validation",
      nominateTitle: "Nominate / Enroll",
      nominateDesc: "Explore and apply for new cooperative programmes",
    },
    careerMenu: {
      jobsTitle: "Open Positions",
      jobsDesc: "Employer listings & visibility preferences",
      skillGapTitle: "Skill-Gap Check",
      skillGapDesc: "See what a job needs that you don't have yet",
      askTitle: "Ask a Counsellor",
      askDesc: "Personalized guidance based on your own profile",
      faqTitle: "Programme FAQ",
      faqDesc: "Official guidelines and curriculum chatbot",
    },
    footerCopyright: "2026 National Council for Cooperative Training. All rights reserved.",
    footerPrivacy: "Privacy Policy",
    footerTerms: "Terms of Service",
    footerSupport: "Support",
  },
  hi: {
    nav: {
      home: "होम",
      learn: "सीखें",
      attendance: "उपस्थिति",
      career: "करियर",
    },
    portalTag: "NCCT पोर्टल",
    tagline: "सहकारी प्रशिक्षण एवं प्रमाणन",
    skipToContent: "मुख्य सामग्री पर जाएं",
    decreaseText: "फ़ॉन्ट आकार घटाएं",
    normalText: "सामान्य फ़ॉन्ट आकार",
    increaseText: "फ़ॉन्ट आकार बढ़ाएं",
    lightMode: "लाइट मोड में बदलें",
    darkMode: "डार्क मोड में बदलें",
    highContrast: "उच्च कंट्रास्ट टॉगल",
    searchPlaceholder: "पाठ्यक्रम एवं मॉड्यूल खोजें...",
    toggleTheme: "थीम टॉगल करें",
    notifications: "सूचनाएं",
    myProfile: "मेरी प्रोफ़ाइल",
    signOut: "साइन आउट",
    trainee: "प्रशिक्षणार्थी",
    learnMenu: {
      lessonsTitle: "मेरे पाठ",
      lessonsDesc: "इंटरैक्टिव मॉड्यूल, वीडियो प्लेयर और क्विज़",
      certificatesTitle: "मेरे प्रमाणपत्र",
      certificatesDesc: "QR सत्यापन के साथ सत्यापित प्रमाणपत्र डाउनलोड करें",
      nominateTitle: "नामांकन / दाखिला",
      nominateDesc: "नए सहकारी कार्यक्रमों को देखें और आवेदन करें",
    },
    careerMenu: {
      jobsTitle: "खुली रिक्तियां",
      jobsDesc: "नियोक्ता सूचियां एवं दृश्यता प्राथमिकताएं",
      skillGapTitle: "कौशल-अंतर जांच",
      skillGapDesc: "देखें कि नौकरी को किन कौशलों की आवश्यकता है जो अभी आपके पास नहीं हैं",
      askTitle: "काउंसलर से पूछें",
      askDesc: "आपकी अपनी प्रोफ़ाइल के आधार पर व्यक्तिगत मार्गदर्शन",
      faqTitle: "कार्यक्रम सामान्य प्रश्न",
      faqDesc: "आधिकारिक दिशानिर्देश एवं पाठ्यक्रम चैटबॉट",
    },
    footerCopyright: "2026 राष्ट्रीय सहकारी प्रशिक्षण परिषद। सर्वाधिकार सुरक्षित।",
    footerPrivacy: "गोपनीयता नीति",
    footerTerms: "सेवा की शर्तें",
    footerSupport: "सहायता",
  },
};

interface TraineeShellProps {
  active: TraineeTab;
  onNavigate: (tab: TraineeTab, subView?: string) => void;
  fullName: string | null;
  children: React.ReactNode;
}

// Nav shell for the trainee portal with cohesive light & dark modes, accessibility controls,
// sticky main header with search & profile, and desktop mega-menu navigation bar with dropdown sub-destinations.
export function TraineeShell({ active, onNavigate, fullName, children }: TraineeShellProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [searchQuery, setSearchQuery] = useState("");
  const [contrastHigh, setContrastHigh] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ncct-theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
      localStorage.setItem("ncct-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      localStorage.setItem("ncct-theme", "light");
    }
  }, [isDark]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      onNavigate("learn", "lessons");
    }
  }

  function adjustFontSize(delta: number) {
    const root = document.documentElement;
    if (delta === 0) {
      root.style.fontSize = "";
    } else {
      const current = parseFloat(getComputedStyle(root).fontSize) || 16;
      const next = Math.max(12, Math.min(22, current + delta * 2));
      root.style.fontSize = `${next}px`;
    }
  }

  function toggleContrast() {
    setContrastHigh((prev) => {
      const next = !prev;
      document.body.classList.toggle("high-contrast", next);
      return next;
    });
  }

  function toggleTheme() {
    setIsDark((prev) => !prev);
  }

  const NAV_ITEMS: { id: TraineeTab; label: string; icon: string }[] = [
    { id: "home", label: t.nav.home, icon: "home" },
    { id: "learn", label: t.nav.learn, icon: "menu_book" },
    { id: "attendance", label: t.nav.attendance, icon: "calendar_today" },
    { id: "career", label: t.nav.career, icon: "work" },
  ];

  return (
    <div className={`flex min-h-screen flex-col bg-background font-body text-body-md text-on-background transition-colors duration-200 ${contrastHigh ? "contrast-125" : ""}`}>
      {/* Top Utility Bar */}
      <div className="border-b border-outline-variant bg-surface-container-low py-1.5 text-xs transition-colors">
        <div className="mx-auto flex min-h-7 max-w-container-max flex-wrap items-center justify-between gap-y-1 px-margin-mobile md:h-7 md:px-margin-desktop">
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant">
            <span className="text-xs font-bold text-primary tracking-wide">{t.portalTag}</span>
            {/* See ManagementShell.tsx's identical fix and comment — this bar
                is duplicated between the two shells, not shared. */}
            <span className="hidden text-outline-variant text-[10px] sm:inline">●</span>
            <span className="hidden text-xs text-on-surface-variant sm:inline">{t.tagline}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-on-surface-variant">
            <a href="#main-content" className="hidden transition-colors hover:text-interactive sm:inline">
              {t.skipToContent}
            </a>
            <div className="hidden h-3.5 w-px bg-outline-variant sm:block" />
            <LocaleToggle className="flex items-center gap-1 transition-colors" />
            <div className="h-3.5 w-px bg-outline-variant" />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => adjustFontSize(-1)}
                className="px-1 font-bold hover:text-interactive"
                title={t.decreaseText}
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => adjustFontSize(0)}
                className="border-x border-outline-variant px-1 font-bold hover:text-interactive"
                title={t.normalText}
              >
                A
              </button>
              <button
                type="button"
                onClick={() => adjustFontSize(1)}
                className="px-1 font-bold hover:text-interactive"
                title={t.increaseText}
              >
                A+
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="material-symbols-outlined ml-1 cursor-pointer text-[16px] hover:text-interactive"
                title={isDark ? t.lightMode : t.darkMode}
              >
                {isDark ? "light_mode" : "dark_mode"}
              </button>
              <button
                type="button"
                onClick={toggleContrast}
                className="material-symbols-outlined ml-1 cursor-pointer text-[16px] hover:text-interactive"
                title={t.highContrast}
              >
                contrast
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation Header */}
      <header className="sticky top-0 z-50 border-b border-outline-variant bg-surface-card shadow-xs transition-colors">
        <div className="mx-auto flex max-w-container-max items-center justify-between gap-2 px-margin-mobile py-3.5 md:gap-6 md:px-margin-desktop">
          {/* Brand Logo & Title. See ManagementShell.tsx's identical fix and
              comment — this header is duplicated between the two shells,
              not shared, and had the same real overflow (264px logo block +
              235px actions cluster, both shrink-0, on a 375px viewport). */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onNavigate("home")}
              className="flex items-center gap-2 text-left transition-opacity hover:opacity-90 md:gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-xs md:h-10 md:w-10">
                <span className="material-symbols-outlined text-[20px] md:text-[22px]">account_balance</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-headline text-headline-sm font-bold leading-tight text-on-surface">
                    COOP-NET
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-secondary font-semibold border border-amber-200 text-[10px] md:text-[11px]">
                    Sahakar Utkarsh
                  </span>
                </div>
                <span className="hidden text-[11px] font-medium leading-tight text-on-surface-variant md:block">
                  {t.tagline}
                </span>
              </div>
            </button>
          </div>

          {/* Search Bar (Desktop) */}
          <form onSubmit={handleSearchSubmit} className="relative group mx-auto hidden max-w-md flex-1 lg:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline transition-colors group-focus-within:text-interactive">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest pl-9 pr-4 text-sm text-on-surface transition-all outline-none focus:border-interactive focus:ring-1 focus:ring-interactive placeholder:text-on-surface-variant/60"
            />
          </form>

          {/* Actions & Profile */}
          <div className="flex shrink-0 items-center gap-1 md:gap-3">
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-lowest text-on-surface shadow-xs border border-border-slate">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
              <span className="font-metric-mono text-xs text-on-surface-variant">Online (Auto-synced)</span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? t.lightMode : t.darkMode}
              aria-label={t.toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container md:h-9 md:w-9"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">
                {isDark ? "light_mode" : "dark_mode"}
              </span>
            </button>

            {/* Hidden below md: — see ManagementShell.tsx's identical
                comment: still overflowed after every other trim, and this
                isn't wired to a real notification system yet. */}
            <button
              type="button"
              aria-label={t.notifications}
              className="relative hidden h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container md:flex md:h-9 md:w-9"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">notifications</span>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cta" />
            </button>

            <button
              type="button"
              aria-label={t.myProfile}
              title={t.myProfile}
              onClick={() => onNavigate("profile")}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-surface-container md:h-9 md:w-9 ${
                active === "profile" ? "text-interactive" : "text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">settings</span>
            </button>

            <div className="ml-0.5 flex items-center gap-1.5 border-l border-outline-variant pl-1.5 md:ml-1 md:gap-2.5 md:pl-3">
              <img
                src="/assets/trainee_avatar.png"
                alt="Trainee Avatar"
                className="h-8 w-8 shrink-0 rounded-full border border-outline-variant object-cover shadow-xs md:h-9 md:w-9"
              />
              <button
                type="button"
                onClick={() => onNavigate("profile")}
                className="hidden flex-col text-left sm:flex"
              >
                <span className="text-label-md font-bold leading-tight text-on-surface hover:text-interactive">
                  {fullName || t.trainee}
                </span>
                <span className="text-[11px] leading-tight text-on-surface-variant">{t.trainee}</span>
              </button>
              <button
                type="button"
                onClick={() => void supabase.auth.signOut()}
                title={t.signOut}
                className="ml-1 rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-status-rejected"
                aria-label={t.signOut}
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mega Menu Navigation Row (Desktop) */}
        <div className="relative hidden border-t border-outline-variant bg-surface-card md:block transition-colors">
          <nav className="mx-auto flex max-w-container-max items-center gap-6 px-margin-mobile md:px-margin-desktop">
            {/* Home Tab */}
            <button
              type="button"
              onClick={() => onNavigate("home")}
              className={`relative flex h-11 items-center gap-1.5 text-label-md font-semibold transition-colors ${
                active === "home"
                  ? "text-primary font-bold after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-secondary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">home</span>
              {t.nav.home}
            </button>

            {/* Learn Mega Menu */}
            <div className="group relative flex h-11 items-center">
              <button
                type="button"
                onClick={() => onNavigate("learn")}
                className={`flex h-full items-center gap-1.5 text-label-md font-semibold transition-colors ${
                  active === "learn"
                    ? "relative text-primary font-bold after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-secondary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">local_library</span>
                {t.nav.learn}
                <span className="material-symbols-outlined ml-0.5 text-[16px] transition-transform group-hover:rotate-180">
                  expand_more
                </span>
              </button>

              {/* Mega Dropdown */}
              <div className="invisible absolute left-0 top-full z-50 flex w-[360px] flex-col gap-1 rounded-b-xl border border-outline-variant bg-surface-card p-2 opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "lessons")}
                  className="group/item flex items-center gap-3.5 rounded-lg p-3 text-left transition-colors hover:bg-surface-container"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary transition-transform group-hover/item:scale-105">
                    <span className="material-symbols-outlined text-[18px]">menu_book</span>
                  </div>
                  <div>
                    <div className="text-label-md font-bold text-on-surface group-hover/item:text-interactive">
                      {t.learnMenu.lessonsTitle}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{t.learnMenu.lessonsDesc}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "certificates")}
                  className="group/item flex items-center gap-3.5 rounded-lg p-3 text-left transition-colors hover:bg-surface-container"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary transition-transform group-hover/item:scale-105">
                    <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
                  </div>
                  <div>
                    <div className="text-label-md font-bold text-on-surface group-hover/item:text-interactive">
                      {t.learnMenu.certificatesTitle}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{t.learnMenu.certificatesDesc}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("learn", "nominate")}
                  className="group/item flex items-center gap-3.5 rounded-lg p-3 text-left transition-colors hover:bg-surface-container"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary transition-transform group-hover/item:scale-105">
                    <span className="material-symbols-outlined text-[18px]">app_registration</span>
                  </div>
                  <div>
                    <div className="text-label-md font-bold text-on-surface group-hover/item:text-interactive">
                      {t.learnMenu.nominateTitle}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{t.learnMenu.nominateDesc}</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Attendance Tab */}
            <button
              type="button"
              onClick={() => onNavigate("attendance")}
              className={`relative flex h-11 items-center gap-1.5 text-label-md font-semibold transition-colors ${
                active === "attendance"
                  ? "text-primary font-bold after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-secondary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              {t.nav.attendance}
            </button>

            {/* Career Mega Menu */}
            <div className="group relative flex h-11 items-center">
              <button
                type="button"
                onClick={() => onNavigate("career")}
                className={`flex h-full items-center gap-1.5 text-label-md font-semibold transition-colors ${
                  active === "career"
                    ? "relative text-primary font-bold after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-secondary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">work</span>
                {t.nav.career}
                <span className="material-symbols-outlined ml-0.5 text-[16px] transition-transform group-hover:rotate-180">
                  expand_more
                </span>
              </button>

              {/* Mega Dropdown — "Skill-Gap Check" (P1, docs/DECISIONS.md
                  #26) and "Ask a Counsellor" (P2, docs/DECISIONS.md #27)
                  were both promoted into scope and are included below,
                  matching TraineeCareer.tsx's TABS. */}
              <div className="invisible absolute left-0 top-full z-50 flex w-[380px] flex-col gap-1 rounded-b-xl border border-outline-variant bg-surface-card p-2 opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onNavigate("career", "jobs")}
                  className="group/item flex items-center gap-3.5 rounded-lg p-3 text-left transition-colors hover:bg-surface-container"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary transition-transform group-hover/item:scale-105">
                    <span className="material-symbols-outlined text-[18px]">work</span>
                  </div>
                  <div>
                    <div className="text-label-md font-bold text-on-surface group-hover/item:text-interactive">
                      {t.careerMenu.jobsTitle}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{t.careerMenu.jobsDesc}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("career", "skill-gap")}
                  className="group/item flex items-center gap-3.5 rounded-lg p-3 text-left transition-colors hover:bg-surface-container"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary transition-transform group-hover/item:scale-105">
                    <span className="material-symbols-outlined text-[18px]">checklist</span>
                  </div>
                  <div>
                    <div className="text-label-md font-bold text-on-surface group-hover/item:text-interactive">
                      {t.careerMenu.skillGapTitle}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{t.careerMenu.skillGapDesc}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("career", "ask")}
                  className="group/item flex items-center gap-3.5 rounded-lg p-3 text-left transition-colors hover:bg-surface-container"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary transition-transform group-hover/item:scale-105">
                    <span className="material-symbols-outlined text-[18px]">support_agent</span>
                  </div>
                  <div>
                    <div className="text-label-md font-bold text-on-surface group-hover/item:text-interactive">
                      {t.careerMenu.askTitle}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{t.careerMenu.askDesc}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("career", "faq")}
                  className="group/item flex items-center gap-3.5 rounded-lg p-3 text-left transition-colors hover:bg-surface-container"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary transition-transform group-hover/item:scale-105">
                    <span className="material-symbols-outlined text-[18px]">help_center</span>
                  </div>
                  <div>
                    <div className="text-label-md font-bold text-on-surface group-hover/item:text-interactive">
                      {t.careerMenu.faqTitle}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{t.careerMenu.faqDesc}</div>
                  </div>
                </button>
              </div>
            </div>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className="mx-auto w-full max-w-container-max flex-grow px-margin-mobile pb-20 pt-4 md:px-margin-desktop md:pb-12 md:pt-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="mt-auto w-full border-t border-outline-variant bg-surface-card px-margin-mobile py-8 md:px-margin-desktop transition-colors">
        <div className="mx-auto flex max-w-container-max flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-sm">copyright</span>
            <span className="text-label-sm">{t.footerCopyright}</span>
          </div>
          <div className="flex gap-6 text-label-sm text-interactive">
            <a href="#" className="hover:underline">
              {t.footerPrivacy}
            </a>
            <a href="#" className="hover:underline">
              {t.footerTerms}
            </a>
            <a href="#" className="hover:underline">
              {t.footerSupport}
            </a>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 z-50 flex h-14 w-full items-center justify-around border-t border-outline-variant bg-surface-card px-2 shadow-lg md:hidden transition-colors">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`relative flex h-full w-16 flex-col items-center justify-center gap-1 rounded-lg transition-transform active:scale-90 ${
              active === item.id ? "text-secondary" : "text-on-surface-variant"
            }`}
          >
            {active === item.id && (
              <span className="absolute top-0 h-1 w-12 rounded-full bg-secondary" />
            )}
            <span
              className="material-symbols-outlined"
              style={active === item.id ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {item.icon}
            </span>
            <span className="text-label-sm">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
