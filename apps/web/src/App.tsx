import { AdminCourseManager } from "./AdminCourseManager.js";
import { AdminProgrammeManager } from "./AdminProgrammeManager.js";
import { AdminUserManager } from "./AdminUserManager.js";
import { AnalyticsDashboard } from "./AnalyticsDashboard.js";
import "./App.css";
import { AttendanceManager } from "./AttendanceManager.js";
import { CertificateVerification } from "./CertificateVerification.js";
import { ChatbotCorpusManager } from "./ChatbotCorpusManager.js";
import { EmployerDashboard } from "./EmployerDashboard.js";
import { LoginForm } from "./LoginForm.js";
import { ProfileEditor } from "./ProfileEditor.js";
import { supabase } from "./supabaseClient.js";
import { TraineeApp } from "./trainee/TraineeApp.js";
import { useSession } from "./useSession.js";

function App() {
  const { session, loading, error } = useSession();

  // Checked before the auth gate below, not after: certificate verification
  // is explicitly no-login (PRD §6.4), so it must never depend on — or wait
  // on — a Supabase session existing at all.
  const verifyCode = new URLSearchParams(window.location.search).get("verify");
  if (verifyCode) {
    return <CertificateVerification code={verifyCode} />;
  }

  if (loading) {
    return <p className="legacy-ui center-message">Loading...</p>;
  }

  if (!session) {
    // A Supabase sign-in can succeed while the follow-up role lookup
    // (GET /api/profile) still fails — e.g. the API isn't running. Session
    // stays null in that case, so this error must be shown here, not only
    // in the post-login shell below (which never mounts without a session).
    return (
      <div className="legacy-ui">
        {error && <p className="form-error">{error}</p>}
        <LoginForm />
      </div>
    );
  }

  // Unlike `?verify=` above, a QR check-in genuinely needs an authenticated
  // trainee, so this is only read once a session exists — see
  // docs/DECISIONS.md #16's QR-as-URL approach.
  const checkinSessionId = new URLSearchParams(window.location.search).get("checkin") ?? undefined;

  // The trainee portal brings its own full-page shell (header + nav —
  // design/stitch_ncct_trainee_portal) rather than nesting inside the
  // admin/employer app-shell below, which has no equivalent navigation.
  if (session.role === "trainee") {
    return (
      <>
        {error && <p className="form-error">{error}</p>}
        <TraineeApp
          accessToken={session.accessToken}
          fullName={session.fullName}
          autoCheckInSessionId={checkinSessionId}
        />
      </>
    );
  }

  return (
    <div className="legacy-ui app-shell">
      <header className="app-header">
        <h1>NCCT Platform</h1>
        <div>
          <span className="role-badge">{session.role}</span>
          <button type="button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      {error && <p className="form-error">{error}</p>}
      <ProfileEditor accessToken={session.accessToken} role={session.role} />
      {session.role === "admin" || session.role === "trainer" ? (
        <>
          {/* Programme/nomination/timetable writes are all admin-only at the
              route level (F2), so this panel is too — a trainer would just
              get 403s from every control in it. */}
          {session.role === "admin" && (
            <>
              <AdminUserManager accessToken={session.accessToken} />
              <AdminProgrammeManager accessToken={session.accessToken} />
            </>
          )}
          <AdminCourseManager accessToken={session.accessToken} />
          <AttendanceManager accessToken={session.accessToken} />
          <ChatbotCorpusManager accessToken={session.accessToken} />
          {/* Admin-only, not trainer — PRD §6.8 frames this specifically as
              an "Admin view", unlike the content-authoring panels above it. */}
          {session.role === "admin" && <AnalyticsDashboard accessToken={session.accessToken} />}
        </>
      ) : (
        <EmployerDashboard accessToken={session.accessToken} />
      )}
    </div>
  );
}

export default App;
