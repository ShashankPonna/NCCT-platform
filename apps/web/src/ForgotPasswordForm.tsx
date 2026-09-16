import { useState, type FormEvent } from "react";
import { supabase } from "./supabaseClient.js";

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
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
    setSent(true);
  }

  return (
    <div>
      {sent ? (
        /* Confirmation State */
        <div className="text-center py-3">
          <div className="w-[48px] h-[48px] rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 mx-auto mb-4">
            <span className="material-symbols-outlined text-[26px]">mark_email_read</span>
          </div>
          <h3 className="font-heading font-bold text-[22px] text-[#0f172a] tracking-tight">
            Check your email
          </h3>
          <p className="text-brand-muted text-[14px] mt-2 mb-6 leading-relaxed max-w-[280px] mx-auto font-normal">
            We have sent password recovery instructions to your registered email address.
          </p>
          <button
            className="w-full h-[44px] rounded-full bg-[#f26522] hover:bg-[#d95b1e] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-sm transition-all duration-150 cursor-pointer"
            onClick={onBack}
            type="button"
          >
            <span>Back to sign in</span>
          </button>
        </div>
      ) : (
        /* Initial Form State */
        <div>
          {/* 40px circular badge next to heading */}
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-[40px] h-[40px] rounded-full bg-[#e0f2fe] flex items-center justify-center text-[#0f172a] flex-shrink-0">
              <span className="material-symbols-outlined text-[22px] text-[#0f172a]">lock_reset</span>
            </div>
            <div>
              <h2 className="font-heading font-bold text-[24px] leading-tight text-[#0f172a] tracking-tight">
                Forgot password
              </h2>
              <p className="text-brand-muted text-[14px] mt-0.5 font-normal">
                We'll send you instructions to reset it
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-[8px] bg-[#ffdad6] text-[#ba1a1a] text-xs flex items-start gap-2.5 leading-snug">
              <span className="material-symbols-outlined text-[18px] flex-shrink-0 mt-0.5 text-[#ba1a1a]">
                error
              </span>
              <div>
                <span className="font-semibold block">Password reset failed</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-brand-primary mb-1.5" htmlFor="forgot-email">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-muted">
                  <span className="material-symbols-outlined text-[20px]">mail</span>
                </div>
                <input
                  className="w-full h-[44px] pl-10 pr-3.5 bg-white border border-[#e2e8f0] rounded-[8px] text-[14px] text-brand-primary placeholder:text-slate-400 focus:outline-none focus:border-[#0f172a] focus:ring-1 focus:ring-[#0f172a] transition-colors"
                  id="forgot-email"
                  name="email"
                  placeholder="name@institution.gov"
                  required
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                className="w-full h-[44px] rounded-full bg-[#f26522] hover:bg-[#d95b1e] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-sm transition-all duration-150 active:scale-[0.99] cursor-pointer disabled:opacity-50"
                type="submit"
                disabled={submitting}
              >
                <span>{submitting ? "Sending..." : "Send reset link"}</span>
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[14px] font-normal text-brand-muted hover:text-[#0f172a] transition-colors cursor-pointer"
                onClick={onBack}
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Back to sign in</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
