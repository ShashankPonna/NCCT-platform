import { useState } from "react";
import { ProfileEditor } from "../ProfileEditor.js";
import { TraineeAttendance } from "./TraineeAttendance.js";
import { TraineeCareer, type CareerView } from "./TraineeCareer.js";
import { TraineeHome } from "./TraineeHome.js";
import { TraineeLearn, type LearnView } from "./TraineeLearn.js";
import { TraineeShell, type TraineeTab } from "./TraineeShell.js";

interface TraineeAppProps {
  accessToken: string;
  fullName: string | null;
  /** From App.tsx's `?checkin=` query param — see docs/DECISIONS.md #16. */
  autoCheckInSessionId?: string;
}

// Replaces the old flat stack of StudentLessonView/AttendanceCheckIn/
// TraineeJobBoard/ChatbotPanel in App.tsx's trainee branch with the new NCCT
// design system (design/stitch_ncct_trainee_portal) — four top-level
// destinations (Home/Learn/Attendance/Career) with full Mega-Menu dropdown support.
// A `?checkin=` link jumps straight to the Attendance tab so the QR
// auto-check-in flow still fires exactly as before.
export function TraineeApp({ accessToken, fullName, autoCheckInSessionId }: TraineeAppProps) {
  const [tab, setTab] = useState<TraineeTab>(autoCheckInSessionId ? "attendance" : "home");
  const [learnSubView, setLearnSubView] = useState<LearnView>("lessons");
  const [careerSubView, setCareerSubView] = useState<CareerView>("jobs");

  function handleNavigate(destination: TraineeTab, subView?: string) {
    setTab(destination);
    if (destination === "learn" && subView) {
      setLearnSubView(subView as LearnView);
    } else if (destination === "career" && subView) {
      setCareerSubView(subView as CareerView);
    }
  }

  return (
    <TraineeShell active={tab} onNavigate={handleNavigate} fullName={fullName}>
      {tab === "home" && (
        <TraineeHome accessToken={accessToken} fullName={fullName} onNavigate={handleNavigate} />
      )}
      {tab === "learn" && (
        <TraineeLearn
          accessToken={accessToken}
          subView={learnSubView}
          onSubViewChange={setLearnSubView}
        />
      )}
      {tab === "attendance" && (
        <TraineeAttendance accessToken={accessToken} autoCheckInSessionId={autoCheckInSessionId} />
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
          <ProfileEditor accessToken={accessToken} role="trainee" />
        </div>
      )}
    </TraineeShell>
  );
}

