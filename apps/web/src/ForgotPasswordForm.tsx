import { useState } from "react";
import { supabase } from "./supabaseClient.js";

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    // Deliberately shown regardless of whether the address has an account —
    // confirming non-existence here would let anyone enumerate registered
    // emails against this form.
    setSent(true);
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-surface-card border border-outline-variant rounded-2xl p-8 shadow-md text-left">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-headline-lg font-bold text-2xl mb-3 shadow-xs">
            N
          </div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0 font-bold">
            Reset your password
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            {sent
              ? "If that address has an account, a reset link is on its way."
              : "Enter the email on your account and we'll send you a reset link"}
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-error-container text-on-error-container p-3 rounded-lg text-sm flex items-center gap-2 border border-error/20">
            <span className="material-symbols-outlined text-error text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {sent ? (
          <button
            type="button"
            onClick={onBack}
            className="w-full h-touch-target bg-cta hover:bg-cta-hover text-on-primary rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 shadow-sm font-semibold cursor-pointer"
          >
            <span>Back to sign in</span>
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="name@institution.gov"
                className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-touch-target bg-cta hover:bg-cta-hover text-on-primary rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 shadow-sm font-semibold cursor-pointer disabled:opacity-50 mt-2"
            >
              <span>{submitting ? "Sending..." : "Send reset link"}</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>

            <button
              type="button"
              onClick={onBack}
              className="w-full text-center font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
