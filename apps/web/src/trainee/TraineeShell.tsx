import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";

export type TraineeTab = "home" | "learn" | "attendance" | "career" | "profile";

const NAV_ITEMS: { id: TraineeTab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "learn", label: "Learn", icon: "menu_book" },
  { id: "attendance", label: "Attendance", icon: "calendar_today" },
  { id: "career", label: "Career", icon: "work" },
];

interface TraineeShellProps {
  active: TraineeTab;
  onNavigate: (tab: TraineeTab, subView?: string) => void;
  fullName: string | null;
  children: React.ReactNode;
}

// Nav shell for the trainee portal with cohesive light & dark modes, accessibility controls,
// sticky main header with search & profile, and desktop mega-menu navigation bar with dropdown sub-destinations.
export function TraineeShell({ active, onNavigate, fullName, children }: TraineeShellProps) {
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

  return (
    <div className={`flex min-h-screen flex-col bg-background font-body text-body-md text-on-background transition-colors duration-200 ${contrastHigh ? "contrast-125" : ""}`}>
      {/* Top Utility Bar */}
      <div className="border-b border-outline-variant bg-surface-container-low py-1.5 text-xs transition-colors">
        <div className="mx-auto flex min-h-7 max-w-container-max flex-wrap items-center justify-between gap-y-1 px-margin-mobile md:h-7 md:px-margin-desktop">
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant">
            <span className="text-xs font-bold text-primary tracking-wide">NCCT PORTAL</span>
            {/* See ManagementShell.tsx's identical fix and comment — this bar
                is duplicated between the two shells, not shared. */}
            <span className="hidden text-outline-variant text-[10px] sm:inline">●</span>
            <span className="hidden text-xs text-on-surface-variant sm:inline">
              Cooperative Training &amp; Certification
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-on-surface-variant">
            <a href="#main-content" className="hidden transition-colors hover:text-interactive sm:inline">
              Skip To Main Content
            </a>
            <div className="hidden h-3.5 w-px bg-outline-variant sm:block" />
            <div className="flex cursor-pointer items-center gap-1 transition-colors hover:text-interactive">
              <span className="material-symbols-outlined text-[16px]">language</span>
              <span>English / हिन्दी</span>
            </div>
            <div className="h-3.5 w-px bg-outline-variant" />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => adjustFontSize(-1)}
                className="px-1 font-bold hover:text-interactive"
                title="Decrease text size"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => adjustFontSize(0)}
                className="border-x border-outline-variant px-1 font-bold hover:text-interactive"
                title="Normal text size"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => adjustFontSize(1)}
                className="px-1 font-bold hover:text-interactive"
                title="Increase text size"
              >
                A+
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="material-symbols-outlined ml-1 cursor-pointer text-[16px] hover:text-interactive"
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDark ? "light_mode" : "dark_mode"}
              </button>
              <button
                type="button"
                onClick={toggleContrast}
                className="material-symbols-outlined ml-1 cursor-pointer text-[16px] hover:text-interactive"
                title="High Contrast Toggle"
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary shadow-xs md:h-10 md:w-10">
                <span className="material-symbols-outlined text-[20px] md:text-[22px]">school</span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline text-headline-sm font-bold leading-tight text-on-surface">
                  NCCT Platform
                </span>
                <span className="hidden text-[11px] font-medium leading-tight text-on-surface-variant md:block">
                  National Council for Cooperative Training
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
              placeholder="Search Courses & Modules..."
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest pl-9 pr-4 text-sm text-on-surface transition-all outline-none focus:border-interactive focus:ring-1 focus:ring-interactive placeholder:text-on-surface-variant/60"
            />
          </form>

          {/* Actions & Profile — sizes trimmed below md:, see
              ManagementShell.tsx's identical comment. */}
          <div className="flex shrink-0 items-center gap-1 md:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle Theme"
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
              aria-label="Notifications"
              className="relative hidden h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container md:flex md:h-9 md:w-9"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">notifications</span>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cta" />
            </button>

            <button
              type="button"
              aria-label="My profile"
              title="My profile"
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
                  {fullName || "Trainee"}
                </span>
                <span className="text-[11px] leading-tight text-on-surface-variant">Trainee</span>
              </button>
              <button
                type="button"
                onClick={() => void supabase.auth.signOut()}
                title="Sign Out"
                className="ml-1 rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-status-rejected"
                aria-label="Sign Out"
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
                  ? "text-interactive after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-interactive"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">home</span>
              Home
            </button>

            {/* Learn Mega Menu */}
            <div className="group relative flex h-11 items-center">
              <button
                type="button"
                onClick={() => onNavigate("learn")}
                className={`flex h-full items-center gap-1.5 text-label-md font-semibold transition-colors ${
                  active === "learn"
                    ? "relative text-interactive after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-interactive"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">local_library</span>
                Learn
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
                      My Lessons
                    </div>
                    <div className="text-[11px] text-on-surface-variant">
                      Interactive modules, video player, and quizzes
                    </div>
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
                      My Certificates
                    </div>
                    <div className="text-[11px] text-on-surface-variant">
                      Download verified certificates with QR validation
                    </div>
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
                      Nominate / Enroll
                    </div>
                    <div className="text-[11px] text-on-surface-variant">
                      Explore and apply for new cooperative programmes
                    </div>
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
                  ? "text-interactive after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-interactive"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              Attendance
            </button>

            {/* Career Mega Menu */}
            <div className="group relative flex h-11 items-center">
              <button
                type="button"
                onClick={() => onNavigate("career")}
                className={`flex h-full items-center gap-1.5 text-label-md font-semibold transition-colors ${
                  active === "career"
                    ? "relative text-interactive after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-interactive"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">work</span>
                Career
                <span className="material-symbols-outlined ml-0.5 text-[16px] transition-transform group-hover:rotate-180">
                  expand_more
                </span>
              </button>

              {/* Mega Dropdown — "Skill-Gap Check" and "Ask a Counsellor" are
                  Phase-2 (PRD §13) and intentionally absent: their screens
                  are parked pending a scope decision, see
                  docs/IMPLEMENTATION.md. Restore alongside TraineeCareer.tsx's
                  TABS once that's resolved. */}
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
                      Open Positions
                    </div>
                    <div className="text-[11px] text-on-surface-variant">
                      Employer listings & visibility preferences
                    </div>
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
                      Programme FAQ
                    </div>
                    <div className="text-[11px] text-on-surface-variant">
                      Official guidelines and curriculum chatbot
                    </div>
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
            <span className="text-label-sm">
              2026 National Council for Cooperative Training. All rights reserved.
            </span>
          </div>
          <div className="flex gap-6 text-label-sm text-interactive">
            <a href="#" className="hover:underline">
              Privacy Policy
            </a>
            <a href="#" className="hover:underline">
              Terms of Service
            </a>
            <a href="#" className="hover:underline">
              Support
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
