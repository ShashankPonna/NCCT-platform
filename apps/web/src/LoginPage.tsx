import { useState } from "react";
import logo from "./assets/logo-badge.png";
import { ForgotPasswordForm } from "./ForgotPasswordForm.js";
import { LoginForm } from "./LoginForm.js";

export interface LoginPageProps {
  error?: string | null;
  /** Omit on native (Capacitor) builds — there's no marketing landing page to return to there. */
  onBack?: () => void;
}

export function LoginPage({ error, onBack }: LoginPageProps) {
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8fafc] to-[#ffffff] font-body text-brand-primary flex flex-col justify-between antialiased p-4 sm:p-6 md:p-8">
      {/* Top bar: subtle back link (14px, #475569, hover #0f172a) */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between py-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[14px] font-normal text-brand-muted hover:text-brand-primary transition-colors duration-150 group cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] transition-transform group-hover:-translate-x-0.5">
              arrow_back
            </span>
            <span>Back to home</span>
          </button>
        ) : (
          <div />
        )}
      </header>

      {/* Main Centered Authentication Column */}
      <main className="w-full flex-1 flex flex-col items-center justify-center my-6">
        {/* Centered Brand Lockup: 36px rounded-square logo next to bold 'EduDisha' */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={logo} alt="EduDisha" className="w-[36px] h-[36px] rounded-[8px] object-cover shadow-xs flex-shrink-0" />
          <span className="font-heading font-bold text-[22px] tracking-tight text-brand-primary">
            EduDisha
          </span>
        </div>

        {/* The 420px Card Container: white bg, 1px #e2e8f0 border, 16px corner radius, shadow-md, 32px padding */}
        <div className="w-full max-w-[420px] bg-white border border-[#e2e8f0] rounded-[16px] shadow-md p-[32px] transition-all text-left">
          {showForgotPassword ? (
            <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
          ) : (
            <LoginForm
              onForgotPassword={() => setShowForgotPassword(true)}
              externalError={error}
            />
          )}
        </div>
      </main>

      {/* Clean, minimal footer. The Security Policy / Help / Privacy links
          that used to sit here all pointed at "#help" and went nowhere, so
          they were removed (same rule as DECISIONS.md #67). */}
      <footer className="w-full max-w-5xl mx-auto py-4 text-center text-xs text-brand-muted border-t border-slate-100">
        © {new Date().getFullYear()} EduDisha. All rights reserved.
      </footer>
    </div>
  );
}
