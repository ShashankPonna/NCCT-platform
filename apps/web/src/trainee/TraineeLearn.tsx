import { useState } from "react";
import { TraineeLearnCertificates } from "./TraineeLearnCertificates.js";
import { TraineeLearnLessons } from "./TraineeLearnLessons.js";
import { TraineeLearnNominate } from "./TraineeLearnNominate.js";

export type LearnView = "lessons" | "certificates" | "nominate";

interface TraineeLearnProps {
  accessToken: string;
  subView?: LearnView;
  onSubViewChange?: (view: LearnView) => void;
}

const TABS: { id: LearnView; label: string }[] = [
  { id: "lessons", label: "My Lessons" },
  { id: "certificates", label: "My Certificates" },
  { id: "nominate", label: "Nominate/Enroll" },
];

// Learn's three Stitch screens (learn_my_lessons, learn_my_certificates,
// learn_nominate_enroll) presented as one segmented sub-nav rather than
// three separate top-level nav destinations — keeps the main nav at 4 items
// per the "don't overload the navbar" call made while planning this feature.
export function TraineeLearn({ accessToken, subView, onSubViewChange }: TraineeLearnProps) {
  const [localView, setLocalView] = useState<LearnView>("lessons");
  const view = subView ?? localView;

  function handleTabClick(tabId: LearnView) {
    setLocalView(tabId);
    onSubViewChange?.(tabId);
  }

  return (
    <div>
      <div className="sticky top-14 z-30 -mx-margin-mobile flex gap-1 overflow-x-auto border-b border-border-low-contrast bg-background px-margin-mobile py-2 md:static md:mx-0 md:px-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={`min-h-touch-target flex-shrink-0 rounded-full px-4 py-2 text-label-md transition-colors ${
              view === tab.id
                ? "bg-primary text-on-primary"
                : "border border-border-low-contrast text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "lessons" && <TraineeLearnLessons accessToken={accessToken} />}
      {view === "certificates" && <TraineeLearnCertificates accessToken={accessToken} />}
      {view === "nominate" && <TraineeLearnNominate accessToken={accessToken} />}
    </div>
  );
}

