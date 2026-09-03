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
import { ForgotPasswordForm } from "./ForgotPasswordForm.js";
import { LoginForm } from "./LoginForm.js";
import { ManagementShell, type ManagementTab } from "./ManagementShell.js";
import { ProfileEditor } from "./ProfileEditor.js";
import { ResetPasswordForm } from "./ResetPasswordForm.js";
import { TraineeApp } from "./trainee/TraineeApp.js";
import { usePasswordRecovery } from "./usePasswordRecovery.js";
import { useSession } from "./useSession.js";

function App() {
  const { session, loading, error } = useSession();
  const { isRecovery, clearRecovery } = usePasswordRecovery();
  const [activeTab, setActiveTab] = useState<ManagementTab | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Checked before the auth gate below, not after: certificate verification
  // is explicitly no-login (PRD §6.4), so it must never depend on — or wait
  // on — a Supabase session existing at all.
  const verifyCode = new URLSearchParams(window.location.search).get("verify");
  if (verifyCode) {
    return <CertificateVerification code={verifyCode} />;
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          {error && (
            <div className="mb-4 bg-error-container text-on-error-container p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {showForgotPassword ? (
            <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
          ) : (
            <LoginForm onForgotPassword={() => setShowForgotPassword(true)} />
          )}
        </div>
      </div>
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
        ? "content"
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
        {currentTab === "programmes" && <AdminProgrammeManager accessToken={session.accessToken} />}
        {currentTab === "content" && <AdminCourseManager accessToken={session.accessToken} />}
        {currentTab === "attendance" && <AttendanceManager accessToken={session.accessToken} />}
        {currentTab === "chatbot" && <ChatbotCorpusManager accessToken={session.accessToken} />}
        {currentTab === "profile" && (
          <ProfileEditor
            accessToken={session.accessToken}
            role={session.role}
            email={session.email}
          />
        )}
        {currentTab === "employer" && <EmployerDashboard accessToken={session.accessToken} />}
      </div>
    </ManagementShell>
  );
}

export default App;
