import { useState, type FormEvent } from "react";
import { supabase } from "./supabaseClient.js";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
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
    <div>
      {/* 40px circular badge next to heading */}
      <div className="flex items-center gap-3.5 mb-6">
        <div className="w-[40px] h-[40px] rounded-full bg-[#e0f2fe] flex items-center justify-center text-[#0f172a] flex-shrink-0">
          <span className="material-symbols-outlined text-[22px] text-[#0f172a]">
            {done ? "check_circle" : "password"}
          </span>
        </div>
        <div>
          <h2 className="font-heading font-bold text-[24px] leading-tight text-[#0f172a] tracking-tight">
            {done ? "Password updated" : "Set new password"}
          </h2>
          <p className="text-brand-muted text-[14px] mt-0.5 font-normal">
            {done
              ? "Your password has been changed successfully"
              : `Must be at least ${MIN_PASSWORD_LENGTH} characters long`}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-[8px] bg-[#ffdad6] text-[#ba1a1a] text-xs flex items-start gap-2.5 leading-snug">
          <span className="material-symbols-outlined text-[18px] flex-shrink-0 mt-0.5 text-[#ba1a1a]">
            error
          </span>
          <div>
            <span className="font-semibold block">Update failed</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {done ? (
        <div className="text-center py-2">
          <button
            className="w-full h-[44px] rounded-full bg-[#f26522] hover:bg-[#d95b1e] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-sm transition-all duration-150 cursor-pointer"
            onClick={onDone}
            type="button"
          >
            <span>Sign in with new password</span>
          </button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* New Password field with lock icon & show/hide toggle */}
          <div>
            <label className="block text-xs font-semibold text-brand-primary mb-1.5" htmlFor="new-password">
              New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-muted">
                <span className="material-symbols-outlined text-[20px]">lock</span>
              </div>
              <input
                className="w-full h-[44px] pl-10 pr-11 bg-white border border-[#e2e8f0] rounded-[8px] text-[14px] text-brand-primary placeholder:text-slate-400 focus:outline-none focus:border-[#0f172a] focus:ring-1 focus:ring-[#0f172a] transition-colors tracking-wide"
                id="new-password"
                placeholder="••••••••••••"
                required
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

          {/* Confirm New Password field with lock icon & show/hide toggle */}
          <div>
            <label className="block text-xs font-semibold text-brand-primary mb-1.5" htmlFor="confirm-password">
              Confirm New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-muted">
                <span className="material-symbols-outlined text-[20px]">lock</span>
              </div>
              <input
                className="w-full h-[44px] pl-10 pr-11 bg-white border border-[#e2e8f0] rounded-[8px] text-[14px] text-brand-primary placeholder:text-slate-400 focus:outline-none focus:border-[#0f172a] focus:ring-1 focus:ring-[#0f172a] transition-colors tracking-wide"
                id="confirm-password"
                placeholder="••••••••••••"
                required
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-brand-muted hover:text-brand-primary focus:outline-none transition-colors cursor-pointer"
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showConfirmPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          {/* Primary pill button: Update password */}
          <div className="pt-2">
            <button
              className="w-full h-[44px] rounded-full bg-[#f26522] hover:bg-[#d95b1e] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-sm transition-all duration-150 active:scale-[0.99] cursor-pointer disabled:opacity-50"
              type="submit"
              disabled={submitting}
            >
              <span>{submitting ? "Updating..." : "Update password"}</span>
              <span className="material-symbols-outlined text-[18px]">check</span>
            </button>
          </div>

          <div className="text-center pt-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[14px] font-normal text-brand-muted hover:text-[#0f172a] transition-colors cursor-pointer"
              onClick={onDone}
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Back to sign in</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
