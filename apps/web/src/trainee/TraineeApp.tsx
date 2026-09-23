import { useState } from "react";
import { ChatbotPanel } from "../ChatbotPanel.js";
import { useAutoSync } from "../offline/syncManager.js";
import { ProfileEditor } from "../ProfileEditor.js";
import { TraineeAttendance } from "./TraineeAttendance.js";
import { TraineeCareer, type CareerView } from "./TraineeCareer.js";
import { TraineeHome } from "./TraineeHome.js";
import { TraineeLearn, type LearnView } from "./TraineeLearn.js";
import { TraineeShell, type TraineeTab } from "./TraineeShell.js";

interface TraineeAppProps {
  accessToken: string;
  fullName: string | null;
  email: string | null;
  /** From App.tsx's `?checkin=` query param — see docs/DECISIONS.md #16. */
  autoCheckInSessionId?: string;
}

// Replaces the old flat stack of StudentLessonView/AttendanceCheckIn/
// TraineeJobBoard/ChatbotPanel in App.tsx's trainee branch with the new NCCT
// design system (design/stitch_ncct_trainee_portal) — four top-level
// destinations (Home/Learn/Attendance/Career) with full Mega-Menu dropdown support.
// A `?checkin=` link jumps straight to the Attendance tab so the QR
// auto-check-in flow still fires exactly as before.
export function TraineeApp({
  accessToken,
  fullName,
  email,
  autoCheckInSessionId,
}: TraineeAppProps) {
  const [tab, setTab] = useState<TraineeTab>(autoCheckInSessionId ? "attendance" : "home");
  const [learnSubView, setLearnSubView] = useState<LearnView>("lessons");
  const [careerSubView, setCareerSubView] = useState<CareerView>("jobs");
  const [chatOpen, setChatOpen] = useState(false);
  // Mounted once here, not inside TraineeLearnLessons, so a write queued
  // from the Attendance or Learn>Quiz screens still auto-flushes on
  // reconnect even if the trainee has since navigated away from Lessons —
  // previously the flush only fired while that one screen happened to be
  // mounted. `online`/`pendingCount` are threaded down to TraineeLearn only
  // because that's the one screen with a visible sync-status banner today;
  // the flush itself now runs regardless of which tab is active.
  const { online, pendingCount } = useAutoSync(accessToken);

  function handleNavigate(destination: TraineeTab, subView?: string) {
    setTab(destination);
    if (destination === "learn" && subView) {
      setLearnSubView(subView as LearnView);
    } else if (destination === "career" && subView) {
      setCareerSubView(subView as CareerView);
    }
  }

  return (
    <>
      <TraineeShell active={tab} onNavigate={handleNavigate} fullName={fullName}>
        {tab === "home" && (
          <TraineeHome accessToken={accessToken} fullName={fullName} onNavigate={handleNavigate} />
        )}
        {tab === "learn" && (
          <TraineeLearn
            accessToken={accessToken}
            subView={learnSubView}
            onSubViewChange={setLearnSubView}
            online={online}
            pendingCount={pendingCount}
          />
        )}
        {tab === "attendance" && (
          <TraineeAttendance
            accessToken={accessToken}
            autoCheckInSessionId={autoCheckInSessionId}
          />
        )}
        {tab === "career" && (
          <TraineeCareer
            accessToken={accessToken}
            subView={careerSubView}
            onSubViewChange={setCareerSubView}
          />
        )}
        {/* Reuses the same ProfileEditor the admin/employer shell renders —
          own-profile editing is identical for every role (F1, PRD §6.1), so
          this is shared logic rather than a trainee-specific rewrite. */}
        {tab === "profile" && (
          <div className="legacy-ui py-6">
            <ProfileEditor accessToken={accessToken} role="trainee" email={email} />
          </div>
        )}
      </TraineeShell>

      {/* Floating chatbot launcher — reachable from every trainee screen,
          not just Career > FAQ. `position: fixed` positions relative to the
          viewport, so this is a plain sibling of TraineeShell rather than
          something threaded through its props. Reuses ChatbotPanel/
          askChatbot exactly as-is (PRD §6.7's informational chatbot,
          docs/DECISIONS.md #35 for its Groq-backed generation) — this is a
          new access point, not a second bot with its own logic. */}
      {chatOpen && (
        <div
          role="dialog"
          aria-label="Programme chatbot"
          className="fixed bottom-24 right-4 z-50 flex max-h-[70vh] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-card shadow-2xl md:right-6"
        >
          <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <span className="text-label-lg font-semibold text-on-surface">Programme Chatbot</span>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Close chatbot"
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <ChatbotPanel accessToken={accessToken} />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setChatOpen((open) => !open)}
        aria-label={chatOpen ? "Close chatbot" : "Open chatbot"}
        className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition-transform hover:scale-105 md:right-6"
      >
        <span className="material-symbols-outlined text-2xl">{chatOpen ? "close" : "chat"}</span>
      </button>
    </>
  );
}
