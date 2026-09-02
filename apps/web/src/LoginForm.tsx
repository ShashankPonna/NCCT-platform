import { useState } from "react";
import { supabase } from "./supabaseClient.js";

export function LoginForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
    }
    setSubmitting(false);
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-surface-card border border-outline-variant rounded-2xl p-8 shadow-md text-left">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-headline-lg font-bold text-2xl mb-3 shadow-xs">
            N
          </div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0 font-bold">
            NCCT Portal
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Sign in to access your administrative and training console
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-error-container text-on-error-container p-3 rounded-lg text-sm flex items-center gap-2 border border-error/20">
            <span className="material-symbols-outlined text-error text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

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

          <div>
            <label className="block font-label-md text-label-md text-on-surface mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-touch-target bg-cta hover:bg-cta-hover text-on-primary rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 shadow-sm font-semibold cursor-pointer disabled:opacity-50 mt-2"
          >
            <span>{submitting ? "Signing in..." : "Sign In"}</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>

          <button
            type="button"
            onClick={onForgotPassword}
            className="w-full text-center font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
          >
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  );
}
