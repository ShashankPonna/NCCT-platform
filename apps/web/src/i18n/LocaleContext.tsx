import { createContext, useContext, useState, type ReactNode } from "react";

export type Locale = "en" | "hi";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "ncct-locale";

// One global toggle for every authenticated dashboard (admin/trainer/employer
// via ManagementShell, trainee via TraineeShell), so switching language in
// either shell's header changes every screen underneath it instead of being
// a per-page setting. The marketing landing page (HomePage.tsx) predates
// this and keeps its own local toggle — it's a separate, pre-login surface.
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    return window.localStorage.getItem(STORAGE_KEY) === "hi" ? "hi" : "en";
  });

  function setLocale(next: Locale) {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — locale still works for this session.
    }
  }

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}

export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div className={className}>
      <span className="material-symbols-outlined text-[16px]">language</span>
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={`cursor-pointer ${locale === "en" ? "font-bold text-interactive" : "hover:text-interactive"}`}
      >
        English
      </button>
      <span>/</span>
      <button
        type="button"
        onClick={() => setLocale("hi")}
        aria-pressed={locale === "hi"}
        className={`cursor-pointer ${locale === "hi" ? "font-bold text-interactive" : "hover:text-interactive"}`}
      >
        हिन्दी
      </button>
    </div>
  );
}
