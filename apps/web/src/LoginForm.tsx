import { useState, type FormEvent } from "react";
import { supabase } from "./supabaseClient.js";

export interface LoginFormProps {
  onForgotPassword: () => void;
  externalError?: string | null;
}

export function LoginForm({ onForgotPassword, externalError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
    }
    setSubmitting(false);
  }

  const activeError = error || externalError;

  return (
    <div>
      {/* Card Header */}
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[24px] leading-tight text-[#0f172a] tracking-tight">
          Sign In
        </h1>
        <p className="text-brand-muted text-[14px] mt-1.5 font-normal">
          Enter your credentials to access your console
        </p>
      </div>

      {/* Error State Banner: full-width, background #ffdad6, text/icon #ba1a1a, rounded 8px */}
      {activeError && (
        <div className="mb-5 p-3 rounded-[8px] bg-[#ffdad6] text-[#ba1a1a] text-xs flex items-start gap-2.5 leading-snug">
          <span className="material-symbols-outlined text-[18px] flex-shrink-0 mt-0.5 text-[#ba1a1a]">
            error
          </span>
          <div>
            <span className="font-semibold block">Authentication failed</span>
            <span>{activeError}</span>
          </div>
        </div>
      )}

      {/* Sign In Form */}
      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Email Field: 44px input, 8px radius, white bg, 1px #e2e8f0 border, inset 'mail' icon, focus ring #0f172a */}
        <div>
          <label className="block text-xs font-semibold text-brand-primary mb-1.5" htmlFor="email">
            Email Address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-muted">
              <span className="material-symbols-outlined text-[20px]">mail</span>
            </div>
            <input
              className="w-full h-[44px] pl-10 pr-3.5 bg-white border border-[#e2e8f0] rounded-[8px] text-[14px] text-brand-primary placeholder:text-slate-400 focus:outline-none focus:border-[#0f172a] focus:ring-1 focus:ring-[#0f172a] transition-colors"
              id="email"
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

        {/* Password Field: 44px input with 'lock' icon, dots placeholder, clickable eye toggle */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-brand-primary" htmlFor="password">
              Password
            </label>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-muted">
              <span className="material-symbols-outlined text-[20px]">lock</span>
            </div>
            <input
              className="w-full h-[44px] pl-10 pr-11 bg-white border border-[#e2e8f0] rounded-[8px] text-[14px] text-brand-primary placeholder:text-slate-400 focus:outline-none focus:border-[#0f172a] focus:ring-1 focus:ring-[#0f172a] transition-colors tracking-wide"
              id="password"
              name="password"
              placeholder="••••••••••••"
              required
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-brand-muted hover:text-brand-primary focus:outline-none transition-colors cursor-pointer"
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              <span className="material-symbols-outlined text-[20px]">
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
        </div>

        {/* Primary CTA Button: full-width, FULLY PILL-SHAPED (rounded-full), solid #f26522, hover #d95b1e, white bold 'Sign In', trailing 'arrow_forward', 44px tall */}
        <div className="pt-2">
          <button
            className="w-full h-[44px] rounded-full bg-[#f26522] hover:bg-[#d95b1e] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-sm transition-all duration-150 active:scale-[0.99] cursor-pointer disabled:opacity-50"
            type="submit"
            disabled={submitting}
          >
            <span>{submitting ? "Signing in..." : "Sign In"}</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>

        {/* Plain centered text link 'Forgot password?' (#475569, hover #0f172a) below button */}
        <div className="text-center pt-2">
          <button
            type="button"
            className="inline-block text-[14px] font-normal text-brand-muted hover:text-[#0f172a] transition-colors focus:outline-none focus:underline cursor-pointer"
            onClick={onForgotPassword}
          >
            Forgot password?
          </button>
        </div>
      </form>
    </div>
  );
}
