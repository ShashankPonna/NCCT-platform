import { AdminCourseManager } from "./AdminCourseManager.js";
import "./App.css";
import { CertificateVerification } from "./CertificateVerification.js";
import { LoginForm } from "./LoginForm.js";
import { StudentLessonView } from "./StudentLessonView.js";
import { supabase } from "./supabaseClient.js";
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
    return <p className="center-message">Loading...</p>;
  }

  if (!session) {
    return <LoginForm />;
  }

  return (
    <div className="app-shell">
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
      {session.role === "admin" || session.role === "trainer" ? (
        <AdminCourseManager accessToken={session.accessToken} />
      ) : (
        <StudentLessonView accessToken={session.accessToken} />
      )}
    </div>
  );
}

export default App;
