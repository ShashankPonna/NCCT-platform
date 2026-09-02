import { useState } from "react";
import { supabase } from "./supabaseClient.js";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }

    // The recovery link leaves the browser signed in under the temporary
    // recovery session — sign out so the next screen is a real, deliberate
    // sign-in with the password the user just chose, not a session that
    // silently carries over.
    await supabase.auth.signOut();
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-surface-card border border-outline-variant rounded-2xl p-8 shadow-md text-left">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-headline-lg font-bold text-2xl mb-3 shadow-xs">
            N
          </div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0 font-bold">
            Choose a new password
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            {done
              ? "Your password has been updated"
              : `At least ${MIN_PASSWORD_LENGTH} characters`}
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-error-container text-on-error-container p-3 rounded-lg text-sm flex items-center gap-2 border border-error/20">
            <span className="material-symbols-outlined text-error text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {done ? (
          <button
            type="button"
            onClick={onDone}
            className="w-full h-touch-target bg-cta hover:bg-cta-hover text-on-primary rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 shadow-sm font-semibold cursor-pointer"
          >
            <span>Sign in</span>
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-touch-target bg-cta hover:bg-cta-hover text-on-primary rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 shadow-sm font-semibold cursor-pointer disabled:opacity-50 mt-2"
            >
              <span>{submitting ? "Updating..." : "Update password"}</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
