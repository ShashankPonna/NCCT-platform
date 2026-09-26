import type { Role } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import logo from "./assets/logo-badge.png";
import { LocaleToggle, useLocale, type Locale } from "./i18n/LocaleContext.js";
import { supabase } from "./supabaseClient.js";

export type ManagementTab =
  | "dashboard"
  | "users"
  | "programmes"
  | "courses"
  | "content"
  | "attendance"
  | "terminal"
  | "chatbot"
  | "profile"
  | "employer";

interface NavItem {
  id: ManagementTab;
  labelKey: keyof ManagementShellText["nav"];
  icon: string;
  roles: Role[];
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", labelKey: "dashboard", icon: "dashboard", roles: ["admin"] },
  { id: "users", labelKey: "users", icon: "domain", roles: ["admin"] },
  { id: "programmes", labelKey: "programmes", icon: "school", roles: ["admin", "trainer"] },
  { id: "courses", labelKey: "courses", icon: "menu_book", roles: ["trainer"] },
  { id: "content", labelKey: "content", icon: "description", roles: ["admin", "trainer"] },
  { id: "attendance", labelKey: "attendance", icon: "calendar_today", roles: ["admin", "trainer"] },
  { id: "terminal", labelKey: "terminal", icon: "point_of_sale", roles: ["admin", "trainer"] },
  { id: "chatbot", labelKey: "chatbot", icon: "smart_toy", roles: ["admin", "trainer"] },
  { id: "employer", labelKey: "employer", icon: "person_search", roles: ["employer"] },
  { id: "profile", labelKey: "profile", icon: "person", roles: ["admin", "trainer", "employer"] },
];

interface ManagementShellText {
  nav: {
    dashboard: string;
    users: string;
    programmes: string;
    courses: string;
    content: string;
    attendance: string;
    terminal: string;
    chatbot: string;
    employer: string;
    profile: string;
  };
  // One-word labels for the phone bottom bar — the full labels above don't
  // fit its ~60px slots, and cutting them at the first space gave "My".
  navShort: ManagementShellText["nav"];
  roles: {
    admin: string;
    trainer: string;
    employer: string;
    trainee: string;
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
  toggleTheme: string;
  myProfile: string;
  signOut: string;
  footerCopyright: string;
}

const content: Record<Locale, ManagementShellText> = {
  en: {
    nav: {
      dashboard: "Dashboard",
      users: "Users & Institutions",
      programmes: "Programmes",
      courses: "My Courses",
      content: "Content",
      attendance: "Attendance",
      terminal: "Kiosk Terminal",
      chatbot: "Chatbot Knowledge Base",
      employer: "Trainee Search & Talent Pool",
      profile: "My Profile",
    },
    navShort: {
      dashboard: "Dashboard",
      users: "Users",
      programmes: "Programmes",
      courses: "Courses",
      content: "Content",
      attendance: "Attendance",
      terminal: "Kiosk",
      chatbot: "Chatbot",
      employer: "Talent",
      profile: "Profile",
    },
    roles: {
      admin: "Administrator",
      trainer: "Trainer",
      employer: "Employer",
      trainee: "Trainee",
    },
    portalTag: "EDUDISHA PORTAL",
    tagline: "Cooperative Training & Certification",
    skipToContent: "Skip To Main Content",
    decreaseText: "Decrease text size",
    normalText: "Normal text size",
    increaseText: "Increase text size",
    lightMode: "Switch to Light Mode",
    darkMode: "Switch to Dark Mode",
    highContrast: "High Contrast Toggle",
    toggleTheme: "Toggle Theme",
    myProfile: "My profile",
    signOut: "Sign Out",
    footerCopyright: "2026 EduDisha. All rights reserved.",
  },
  hi: {
    nav: {
      dashboard: "डैशबोर्ड",
      users: "उपयोगकर्ता एवं संस्थान",
      programmes: "कार्यक्रम",
      courses: "मेरे पाठ्यक्रम",
      content: "सामग्री",
      attendance: "उपस्थिति",
      terminal: "कियोस्क टर्मिनल",
      chatbot: "चैटबॉट ज्ञान आधार",
      employer: "प्रशिक्षणार्थी खोज एवं शॉर्टलिस्ट",
      profile: "मेरी प्रोफ़ाइल",
    },
    navShort: {
      dashboard: "डैशबोर्ड",
      users: "उपयोगकर्ता",
      programmes: "कार्यक्रम",
      courses: "पाठ्यक्रम",
      content: "सामग्री",
      attendance: "उपस्थिति",
      terminal: "कियोस्क",
      chatbot: "चैटबॉट",
      employer: "खोज",
      profile: "प्रोफ़ाइल",
    },
    roles: {
      admin: "प्रशासक",
      trainer: "प्रशिक्षक",
      employer: "नियोक्ता",
      trainee: "प्रशिक्षणार्थी",
    },
    portalTag: "EduDisha पोर्टल",
    tagline: "सहकारी प्रशिक्षण एवं प्रमाणन",
    skipToContent: "मुख्य सामग्री पर जाएं",
    decreaseText: "फ़ॉन्ट आकार घटाएं",
    normalText: "सामान्य फ़ॉन्ट आकार",
    increaseText: "फ़ॉन्ट आकार बढ़ाएं",
    lightMode: "लाइट मोड में बदलें",
    darkMode: "डार्क मोड में बदलें",
    highContrast: "उच्च कंट्रास्ट टॉगल",
    toggleTheme: "थीम टॉगल करें",
    myProfile: "मेरी प्रोफ़ाइल",
    signOut: "साइन आउट",
    footerCopyright: "2026 EduDisha। सर्वाधिकार सुरक्षित।",
  },
};

interface ManagementShellProps {
  role: Role;
  fullName: string | null;
  activeTab: ManagementTab;
  onNavigate: (tab: ManagementTab) => void;
  // The real notification bell (docs/DECISIONS.md #65), passed in by the
  // caller since the shell itself has no access token.
  notificationBell?: React.ReactNode;
  children: React.ReactNode;
}

export function ManagementShell({
  role,
  fullName,
  activeTab,
  onNavigate,
  notificationBell,
  children,
}: ManagementShellProps) {
  const { locale } = useLocale();
  const t = content[locale];
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
      ? t.roles.admin
      : role === "trainer"
        ? t.roles.trainer
        : role === "employer"
          ? t.roles.employer
          : t.roles.trainee;

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
            <span className="text-xs font-bold text-primary tracking-wide">{t.portalTag}</span>
            {/* The tagline is the one thing here with no hidden/sm: treatment
                at all — unlike everything to its right, which already
                degrades gracefully. On a phone it wrapped this bar to 3
                lines and pushed the font-size/theme/contrast controls off
                the right edge. Hidden below sm:, same pattern as "Skip to
                Main Content" a few elements over. */}
            <span className="hidden text-outline-variant text-[10px] sm:inline">●</span>
            <span className="hidden text-xs text-on-surface-variant sm:inline">{t.tagline}</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-on-surface-variant">
            <a
              href="#main-content"
              className="hidden transition-colors hover:text-interactive sm:inline"
            >
              {t.skipToContent}
            </a>
            <div className="hidden h-3.5 w-px bg-outline-variant sm:block" />
            <LocaleToggle className="flex items-center gap-1 transition-colors" />
            <div className="h-3.5 w-px bg-outline-variant" />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => adjustFontSize(-1)}
                className="px-1 font-bold hover:text-interactive cursor-pointer"
                title={t.decreaseText}
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => adjustFontSize(0)}
                className="border-x border-outline-variant px-1 font-bold hover:text-interactive cursor-pointer"
                title={t.normalText}
              >
                A
              </button>
              <button
                type="button"
                onClick={() => adjustFontSize(1)}
                className="px-1 font-bold hover:text-interactive cursor-pointer"
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
              <img
                src={logo}
                alt="EduDisha"
                className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-xs md:h-10 md:w-10"
              />
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm font-bold leading-tight text-primary tracking-tight">
                  EduDisha
                </span>
              </div>
            </button>
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
              title={isDark ? t.lightMode : t.darkMode}
              aria-label={t.toggleTheme}
              className="hidden h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container cursor-pointer md:flex md:h-9 md:w-9"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">
                {isDark ? "light_mode" : "dark_mode"}
              </span>
            </button>

            {/* Real notifications (docs/DECISIONS.md #65) — shown at every
                width. To keep the 375px header from overflowing, the theme
                toggle just above is hidden below md: instead; the
                accessibility strip at the top of the page has its own theme
                toggle at every width. */}
            {notificationBell}

            <button
              type="button"
              aria-label={t.myProfile}
              title={t.myProfile}
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
                title={t.signOut}
                className="ml-1 rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-status-rejected cursor-pointer"
                aria-label={t.signOut}
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
                  className={`relative flex h-11 items-center gap-2 font-label-md text-label-md font-semibold transition-colors shrink-0 cursor-pointer ${
                    isActive
                      ? "text-primary font-bold after:absolute after:bottom-0 after:left-0 after:h-[3px] after:w-full after:bg-secondary-container"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                  >
                    {item.icon}
                  </span>
                  {t.nav[item.labelKey]}
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
            <span className="text-label-sm">{t.footerCopyright}</span>
          </div>
        </div>
      </footer>

      {/* 6. Mobile Bottom Navigation Bar (Screens < md) */}
      <nav className="fixed bottom-0 left-0 z-50 flex h-14 w-full items-center justify-around border-t border-outline-variant bg-surface-card px-2 shadow-lg md:hidden transition-colors overflow-x-auto">
        {roleNavItems.map((item) => {
          const isActive = activeTab === item.id;
          const label = t.navShort[item.labelKey];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 transition-transform active:scale-90 ${
                isActive ? "text-secondary" : "text-on-surface-variant"
              }`}
            >
              {isActive && <span className="absolute top-0 h-1 w-8 rounded-full bg-secondary" />}
              <span
                className="material-symbols-outlined text-[20px]"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-medium leading-tight truncate max-w-full">
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
