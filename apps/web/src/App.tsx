import { Capacitor } from "@capacitor/core";
import { useState } from "react";
import { AdminCourseManager } from "./AdminCourseManager.js";
import { AdminProgrammeManager } from "./AdminProgrammeManager.js";
import { AdminUserManager } from "./AdminUserManager.js";
import { AnalyticsDashboard } from "./AnalyticsDashboard.js";
import "./App.css";
import { AttendanceManager } from "./AttendanceManager.js";
import { CertificateVerification } from "./CertificateVerification.js";
import { ChatbotCorpusManager } from "./ChatbotCorpusManager.js";
import { EmployerDashboard } from "./EmployerDashboard.js";
import { HomePage } from "./HomePage.js";
import { KioskTerminal } from "./KioskTerminal.js";
import { LoginPage } from "./LoginPage.js";
import { ManagementShell, type ManagementTab } from "./ManagementShell.js";
import { ProfileEditor } from "./ProfileEditor.js";
import { PublicProfile } from "./PublicProfile.js";
import { ResetPasswordForm } from "./ResetPasswordForm.js";
import { TraineeApp } from "./trainee/TraineeApp.js";
import { NotificationBell } from "./notifications/NotificationBell.js";
import { TrainerCoursesDashboard } from "./TrainerCoursesDashboard.js";
import { usePasswordRecovery } from "./usePasswordRecovery.js";
import { useSession } from "./useSession.js";

// The native (Capacitor) shell has no marketing landing page to show — its
// users are already-enrolled people opening an app to log in, not first-time
// visitors browsing programme info — so it skips straight to the login page.
// See docs/ARCHITECTURE.md: apps/mobile wraps this exact web build, so this
// is the only place that distinguishes the two targets.
const IS_NATIVE = Capacitor.isNativePlatform();

function App() {
  const { session, loading, error } = useSession();
  const { isRecovery, clearRecovery } = usePasswordRecovery();
  const [activeTab, setActiveTab] = useState<ManagementTab | null>(null);
  const [view, setView] = useState<"home" | "login">(() =>
    IS_NATIVE ||
    window.location.hash === "#signin" ||
    new URLSearchParams(window.location.search).get("login") === "true"
      ? "login"
      : "home",
  );
  // Tracks an `error` string the user has already dismissed, so a stale-session
  // failure takes them to the login page once but going back to home still
  // works (otherwise the login page would immediately reopen on every re-render).
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // Checked before the auth gate below, not after: certificate verification
  // is explicitly no-login (PRD §6.4), so it must never depend on — or wait
  // on — a Supabase session existing at all.
  const verifyCode = new URLSearchParams(window.location.search).get("verify");
  if (verifyCode) {
    return <CertificateVerification code={verifyCode} />;
  }

  // Same reasoning as ?verify= above, and checked at the same point: F10's
  // NFC card opens this URL (docs/DECISIONS.md #30) with no Supabase
  // session — a stranger tapping a trainee's card at a job fair has no
  // account. Placed after ?verify= only because that's the established
  // convention; the two are mutually exclusive params so order is
  // otherwise arbitrary.
  const profileCode = new URLSearchParams(window.location.search).get("profile");
  if (profileCode) {
    return <PublicProfile code={profileCode} />;
  }

  // Also checked ahead of the loading/session gates: a password-reset link
  // establishes a real (temporary) session, which would otherwise satisfy
  // `session` below and drop the user straight into their dashboard instead
  // of letting them set a new password.
  if (isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <ResetPasswordForm onDone={clearRecovery} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin material-symbols-outlined text-[36px] text-cta">
            progress_activity
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    const showLogin = IS_NATIVE || view === "login" || Boolean(error && error !== dismissedError);

    if (showLogin) {
      return (
        <LoginPage
          error={error}
          onBack={
            IS_NATIVE
              ? undefined
              : () => {
                  setView("home");
                  setDismissedError(error);
                }
          }
        />
      );
    }

    return (
      <HomePage
        onSignIn={() => setView("login")}
        onVerify={(code: string) => {
          window.location.search = `?verify=${encodeURIComponent(code)}`;
        }}
      />
    );
  }

  const checkinSessionId = new URLSearchParams(window.location.search).get("checkin") ?? undefined;

  // The trainee portal brings its own full-page shell (header + nav)
  if (session.role === "trainee") {
    return (
      <>
        {error && <p className="form-error">{error}</p>}
        <TraineeApp
          accessToken={session.accessToken}
          fullName={session.fullName}
          email={session.email}
          autoCheckInSessionId={checkinSessionId}
        />
      </>
    );
  }

  const defaultTab: ManagementTab =
    session.role === "admin"
      ? "dashboard"
      : session.role === "trainer"
        ? "courses"
        : session.role === "employer"
          ? "employer"
          : "profile";

  const currentTab = activeTab ?? defaultTab;

  return (
    <ManagementShell
      role={session.role}
      fullName={session.fullName}
      activeTab={currentTab}
      onNavigate={(tab) => setActiveTab(tab)}
      notificationBell={
        <NotificationBell
          accessToken={session.accessToken}
          onNavigate={(target) => {
            // Staff notifications are about programmes (a nomination to
            // review, a programme newly assigned); anything else just
            // opens the list without navigating.
            if (target === "programmes") setActiveTab("programmes");
            else if (target === "profile") setActiveTab("profile");
          }}
        />
      }
    >
      {error && (
        <div className="mb-4 p-3 bg-error-container text-on-error-container rounded-lg text-sm text-left">
          {error}
        </div>
      )}

      {/* Active Tab View */}
      <div className="w-full">
        {currentTab === "dashboard" && <AnalyticsDashboard accessToken={session.accessToken} />}
        {currentTab === "users" && (
          <AdminUserManager accessToken={session.accessToken} currentUserId={session.userId} />
        )}
        {currentTab === "programmes" && (
          <AdminProgrammeManager
            accessToken={session.accessToken}
            role={session.role === "trainer" ? "trainer" : "admin"}
          />
        )}
        {currentTab === "courses" && (
          <TrainerCoursesDashboard
            accessToken={session.accessToken}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}
        {currentTab === "content" && <AdminCourseManager accessToken={session.accessToken} />}
        {currentTab === "attendance" && <AttendanceManager accessToken={session.accessToken} />}
        {currentTab === "terminal" && <KioskTerminal accessToken={session.accessToken} />}
        {currentTab === "chatbot" && <ChatbotCorpusManager accessToken={session.accessToken} />}
        {currentTab === "profile" && (
          <ProfileEditor
            accessToken={session.accessToken}
            role={session.role}
            email={session.email}
          />
        )}
        {currentTab === "employer" && (
          <EmployerDashboard accessToken={session.accessToken} currentUserId={session.userId} />
        )}
      </div>
    </ManagementShell>
  );
}

export default App;
