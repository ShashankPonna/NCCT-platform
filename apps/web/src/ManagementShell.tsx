import type { Role } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";

export type ManagementTab =
  | "dashboard"
  | "users"
  | "programmes"
  | "content"
  | "attendance"
  | "chatbot"
  | "profile"
  | "employer";

interface NavItem {
  id: ManagementTab;
  label: string;
  icon: string;
  roles: Role[];
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", roles: ["admin"] },
  { id: "users", label: "Users & Institutions", icon: "domain", roles: ["admin"] },
  { id: "programmes", label: "Programmes", icon: "school", roles: ["admin"] },
  { id: "content", label: "Content", icon: "description", roles: ["admin", "trainer"] },
  { id: "attendance", label: "Attendance", icon: "calendar_today", roles: ["admin", "trainer"] },
  { id: "chatbot", label: "Chatbot Knowledge Base", icon: "smart_toy", roles: ["admin", "trainer"] },
  { id: "employer", label: "Jobs & Candidates", icon: "work", roles: ["employer"] },
  { id: "profile", label: "My Profile", icon: "person", roles: ["admin", "trainer", "employer"] },
];

interface ManagementShellProps {
  role: Role;
  fullName: string | null;
  activeTab: ManagementTab;
  onNavigate: (tab: ManagementTab) => void;
  children: React.ReactNode;
}

export function ManagementShell({
  role,
  fullName,
  activeTab,
  onNavigate,
  children,
}: ManagementShellProps) {
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

  const roleNavItems = ALL_NAV_ITEMS.filter((item) => item.roles.includes(role));

  const roleDisplayName =
    role === "admin"
      ? "Administrator"
      : role === "trainer"
      ? "Trainer"
      : role === "employer"
      ? "Employer"
      : "Trainee";

  return (
    <div
      className={`flex min-h-screen flex-col bg-background font-body text-body-md text-on-background transition-colors duration-200 ${
        contrastHigh ? "contrast-125" : ""
      }`}
    >
      {/* 1. Top Utility Bar (Matching Trainee Top Bar) */}
      <div className="border-b border-outline-variant bg-surface-container-low py-1.5 text-xs transition-colors">
        <div className="mx-auto flex min-h-7 max-w-container-max flex-wrap items-center justify-between gap-y-1 px-margin-mobile md:h-7 md:px-margin-desktop">
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant">
            <span className="text-xs font-bold text-primary tracking-wide">NCCT PORTAL</span>
            {/* The tagline is the one thing here with no hidden/sm: treatment
                at all — unlike everything to its right, which already
                degrades gracefully. On a phone it wrapped this bar to 3
                lines and pushed the font-size/theme/contrast controls off
                the right edge. Hidden below sm:, same pattern as "Skip to
                Main Content" a few elements over. */}
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
                className="px-1 font-bold hover:text-interactive cursor-pointer"
                title="Decrease text size"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => adjustFontSize(0)}
                className="border-x border-outline-variant px-1 font-bold hover:text-interactive cursor-pointer"
                title="Normal text size"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => adjustFontSize(1)}
                className="px-1 font-bold hover:text-interactive cursor-pointer"
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

      {/* 2. Main Navigation Header (Sticky) */}
      <header className="sticky top-0 z-50 border-b border-outline-variant bg-surface-card shadow-xs transition-colors">
        <div className="mx-auto flex max-w-container-max items-center justify-between gap-2 px-margin-mobile py-3.5 md:gap-6 md:px-margin-desktop">
          {/* Brand Logo & Title. Both this block and the actions cluster
              below are `shrink-0` — deliberately, so the logo/icons never
              get squashed — but that means their combined natural width has
              to actually fit 375px on its own. It didn't: with the
              institution subtitle always shown, this block alone measured
              264px, and 264 + the actions cluster's 235px overflowed the
              viewport by 164px, real and confirmed via a real DOM
              measurement, not a visual guess. Hiding the subtitle below
              md: is what actually closes that gap. */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onNavigate(roleNavItems[0]?.id ?? "profile")}
              className="flex items-center gap-2 text-left transition-opacity hover:opacity-90 cursor-pointer md:gap-3"
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
          <div className="relative group mx-auto hidden max-w-md flex-1 lg:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline transition-colors group-focus-within:text-interactive">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Programmes, Content, Users..."
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest pl-9 pr-4 text-sm text-on-surface transition-all outline-none focus:border-interactive focus:ring-1 focus:ring-interactive placeholder:text-on-surface-variant/60"
            />
          </div>

          {/* Actions & Profile. Icon buttons trimmed from 36px to 32px and
              gaps tightened below md: — this cluster measured 235px on its
              own at 375px width, `shrink-0` (deliberately, so icons don't
              visually squash), which is most of why the header overflowed;
              full size returns at md:. */}
          <div className="flex shrink-0 items-center gap-1 md:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle Theme"
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container cursor-pointer md:h-9 md:w-9"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">
                {isDark ? "light_mode" : "dark_mode"}
              </span>
            </button>

            {/* Hidden below md: — the header still overflowed 375px by
                ~28px even after every other trim here, and this button
                isn't wired to a real notification system yet (the red dot
                is unconditional, not driven by actual state), making it the
                lowest-cost thing left to drop on the smallest screens. */}
            <button
              type="button"
              aria-label="Notifications"
              className="relative hidden h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container cursor-pointer md:flex md:h-9 md:w-9"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">notifications</span>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cta" />
            </button>

            <button
              type="button"
              aria-label="My profile"
              title="My profile"
              onClick={() => onNavigate("profile")}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-surface-container cursor-pointer md:h-9 md:w-9 ${
                activeTab === "profile" ? "text-interactive" : "text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">settings</span>
            </button>

            <div className="ml-0.5 flex items-center gap-1.5 border-l border-outline-variant pl-1.5 md:ml-1 md:gap-2.5 md:pl-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold text-xs border border-outline-variant shadow-xs md:h-9 md:w-9">
                {(fullName || roleDisplayName).slice(0, 2).toUpperCase()}
              </div>
              <button
                type="button"
                onClick={() => onNavigate("profile")}
                className="hidden flex-col text-left sm:flex cursor-pointer"
              >
                <span className="text-label-md font-bold leading-tight text-on-surface hover:text-interactive">
                  {fullName || roleDisplayName}
                </span>
                <span className="text-[11px] leading-tight text-on-surface-variant">
                  {roleDisplayName}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void supabase.auth.signOut()}
                title="Sign Out"
                className="ml-1 rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-status-rejected cursor-pointer"
                aria-label="Sign Out"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Horizontal Navigation Row (Desktop) */}
        <div className="relative hidden border-t border-outline-variant bg-surface-card md:block transition-colors">
          <nav className="mx-auto flex max-w-container-max items-center gap-6 px-margin-mobile md:px-margin-desktop overflow-x-auto custom-scrollbar">
            {roleNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`relative flex h-11 items-center gap-2 text-label-md font-semibold transition-colors shrink-0 cursor-pointer ${
                    isActive
                      ? "text-interactive after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-interactive"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* 4. Main Content Area */}
      <main
        id="main-content"
        className="mx-auto w-full max-w-container-max flex-grow px-margin-mobile pb-20 pt-4 md:px-margin-desktop md:pb-12 md:pt-6"
      >
        {children}
      </main>

      {/* 5. Footer */}
      <footer className="mt-auto w-full border-t border-outline-variant bg-surface-card px-margin-mobile py-8 md:px-margin-desktop transition-colors text-left">
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

      {/* 6. Mobile Bottom Navigation Bar (Screens < md) */}
      <nav className="fixed bottom-0 left-0 z-50 flex h-14 w-full items-center justify-around border-t border-outline-variant bg-surface-card px-2 shadow-lg md:hidden transition-colors overflow-x-auto">
        {roleNavItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`relative flex h-full flex-1 flex-col items-center justify-center gap-1 transition-transform active:scale-90 ${
                isActive ? "text-secondary" : "text-on-surface-variant"
              }`}
            >
              {isActive && (
                <span className="absolute top-0 h-1 w-8 rounded-full bg-secondary" />
              )}
              <span
                className="material-symbols-outlined text-[20px]"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-medium leading-tight truncate max-w-[60px]">
                {item.label.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
