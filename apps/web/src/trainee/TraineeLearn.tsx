import { useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";
import { TraineeLearnCertificates } from "./TraineeLearnCertificates.js";
import { TraineeLearnLessons } from "./TraineeLearnLessons.js";
import { TraineeLearnNominate } from "./TraineeLearnNominate.js";

export type LearnView = "lessons" | "certificates" | "nominate";

interface TraineeLearnProps {
  accessToken: string;
  subView?: LearnView;
  onSubViewChange?: (view: LearnView) => void;
  /** Lifted from TraineeApp (docs/DECISIONS.md's offline-sync fix) so the
   * write-queue flush isn't tied to this screen being mounted — only the
   * banner display still lives here, in TraineeLearnLessons. */
  online: boolean;
  pendingCount: number;
}

const TAB_LABELS: Record<Locale, Record<LearnView, string>> = {
  en: {
    lessons: "My Lessons",
    certificates: "My Certificates",
    nominate: "Nominate/Enroll",
  },
  hi: {
    lessons: "मेरे पाठ",
    certificates: "मेरे प्रमाणपत्र",
    nominate: "नामांकन/दाखिला",
  },
};

const TAB_IDS: LearnView[] = ["lessons", "certificates", "nominate"];

// Learn's three Stitch screens (learn_my_lessons, learn_my_certificates,
// learn_nominate_enroll) presented as one segmented sub-nav rather than
// three separate top-level nav destinations — keeps the main nav at 4 items
// per the "don't overload the navbar" call made while planning this feature.
export function TraineeLearn({
  accessToken,
  subView,
  onSubViewChange,
  online,
  pendingCount,
}: TraineeLearnProps) {
  const { locale } = useLocale();
  const labels = TAB_LABELS[locale];
  const [localView, setLocalView] = useState<LearnView>("lessons");
  const view = subView ?? localView;

  function handleTabClick(tabId: LearnView) {
    setLocalView(tabId);
    onSubViewChange?.(tabId);
  }

  return (
    <div>
      <div className="sticky top-14 z-30 -mx-margin-mobile flex gap-1 overflow-x-auto border-b border-border-low-contrast bg-background px-margin-mobile py-2 md:static md:mx-0 md:px-0">
        {TAB_IDS.map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => handleTabClick(tabId)}
            className={`min-h-touch-target flex-shrink-0 rounded-full px-4 py-2 text-label-md transition-colors ${
              view === tabId
                ? "bg-primary text-on-primary"
                : "border border-border-low-contrast text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {labels[tabId]}
          </button>
        ))}
      </div>

      {view === "lessons" && (
        <TraineeLearnLessons accessToken={accessToken} online={online} pendingCount={pendingCount} />
      )}
      {view === "certificates" && <TraineeLearnCertificates accessToken={accessToken} />}
      {view === "nominate" && <TraineeLearnNominate accessToken={accessToken} />}
    </div>
  );
}

