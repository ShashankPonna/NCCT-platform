import { useState } from "react";
import { ChatbotPanel } from "../ChatbotPanel.js";
import { TraineeCareerCounsellor } from "./TraineeCareerCounsellor.js";
import { TraineeCareerJobs } from "./TraineeCareerJobs.js";
import { TraineeCareerSkillGap } from "./TraineeCareerSkillGap.js";

export type CareerView = "jobs" | "skill-gap" | "ask" | "faq";

interface TraineeCareerProps {
  accessToken: string;
  subView?: CareerView;
  onSubViewChange?: (view: CareerView) => void;
}

const TABS: { id: CareerView; label: string }[] = [
  { id: "jobs", label: "Open Positions" },
  { id: "skill-gap", label: "Skill-Gap Check" },
  { id: "ask", label: "Ask a Counsellor" },
  { id: "faq", label: "Programme FAQ" },
];

// Career's Stitch screens (career_open_positions, career_skill_gap_check,
// career_ask_a_counsellor) plus F7's existing chatbot, as one segmented
// sub-nav — same "don't overload the main navbar" reasoning as
// TraineeLearn.tsx. "Ask a Counsellor" (P2, personalized, tool-grounded)
// and "Programme FAQ" (F7, shared corpus, deliberately refuses personal
// advice) are kept as two clearly separate destinations, not merged — see
// docs/DECISIONS.md #19 for why that split matters.
export function TraineeCareer({ accessToken, subView, onSubViewChange }: TraineeCareerProps) {
  const [localView, setLocalView] = useState<CareerView>("jobs");
  const view = subView ?? localView;

  function handleTabClick(tabId: CareerView) {
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

      {view === "jobs" && <TraineeCareerJobs accessToken={accessToken} />}
      {view === "skill-gap" && <TraineeCareerSkillGap accessToken={accessToken} />}
      {view === "ask" && <TraineeCareerCounsellor accessToken={accessToken} />}
      {view === "faq" && (
        <div className="py-6 md:py-8">
          <ChatbotPanel accessToken={accessToken} />
        </div>
      )}
    </div>
  );
}

