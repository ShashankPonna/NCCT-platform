import { Home } from "./Home.js";
import { LoginForm } from "./LoginForm.js";
import { useSession } from "./useSession.js";

function App() {
  const { session, loading, error } = useSession();

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
          <LoginForm />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Home fullName={session.fullName} role={session.role} />
    </div>
  );
}

export default App;
