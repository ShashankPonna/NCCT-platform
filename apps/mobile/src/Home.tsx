import { supabase } from "./supabaseClient.js";

interface HomeProps {
  fullName: string | null;
  role: string;
}

// Deliberately minimal — this is the scaffold proving the Capacitor shell,
// build pipeline, and real auth/API round-trip all work end-to-end. The
// actual trainee screens (lessons, nominations, certificates, jobs, offline
// download/sync) are F9's remaining, much larger scope — see
// docs/IMPLEMENTATION.md's F9 entry for what's built vs. still open.
export function Home({ fullName, role }: HomeProps) {
  return (
    <div className="w-full max-w-md mx-auto text-left">
      <div className="bg-surface-card border border-outline-variant rounded-2xl p-6 shadow-md">
        <p className="font-body-sm text-body-sm text-on-surface-variant mb-1">Signed in as</p>
        <h1 className="font-headline-md text-headline-md text-on-surface m-0 font-bold">
          {fullName ?? "Trainee"}
        </h1>
        <p className="font-label-md text-label-md text-on-surface-variant uppercase mt-1">
          {role}
        </p>

        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="w-full h-touch-target mt-6 border border-outline-variant rounded-full font-label-md text-label-md text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
