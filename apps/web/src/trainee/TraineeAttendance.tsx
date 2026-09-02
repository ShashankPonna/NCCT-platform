import { checkInWithFace, checkInWithQr, type AttendanceCheckInResult } from "@ncct/api-client";
import { useEffect, useState } from "react";
import { FaceCapture } from "../FaceCapture.js";
import { FaceEnrollment } from "../FaceEnrollment.js";
import { ErrorBanner } from "./pieces.js";

interface TraineeAttendanceProps {
  accessToken: string;
  autoCheckInSessionId?: string;
}

// Same data flow as the original AttendanceCheckIn.tsx, re-skinned to the
// NCCT design system (design/stitch_ncct_trainee_portal/attendance). The
// consent gate stays exactly as load-bearing as before — FaceEnrollment
// still refuses to render FaceCapture until consent is explicitly given,
// per CLAUDE.md's DPDP Act 2023 rule; this file only changes the wrapper
// chrome around it, never the gating logic itself.
export function TraineeAttendance({ accessToken, autoCheckInSessionId }: TraineeAttendanceProps) {
  const [sessionId, setSessionId] = useState(autoCheckInSessionId ?? "");
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoCheckInSessionId) {
      void handleQrCheckIn(autoCheckInSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheckInSessionId]);

  async function handleQrCheckIn(id: string) {
    if (!id) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      setResult(await checkInWithQr(accessToken, id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFaceCapture(embedding: number[]) {
    if (!sessionId) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      setResult(await checkInWithFace(accessToken, sessionId, embedding));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 py-6 md:py-8">
      <div className="text-center">
        <h1 className="font-headline text-headline-lg-mobile text-primary md:text-headline-lg">
          Mark Attendance
        </h1>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Enter your session ID, then check in via QR code or face verification.
        </p>
      </div>

      <div className="flex w-full flex-col gap-4 rounded-xl border border-border-low-contrast bg-surface-card p-6">
        <label className="flex flex-col gap-2 text-label-md text-on-surface-variant">
          Session ID
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="session UUID"
            className="min-h-touch-target rounded border border-border-low-contrast bg-surface-container-lowest px-4 py-3 text-body-md focus:outline-none focus:ring-2 focus:ring-interactive"
          />
        </label>
        <button
          type="button"
          disabled={busy || !sessionId}
          onClick={() => void handleQrCheckIn(sessionId)}
          className="flex min-h-touch-target items-center justify-center gap-2 rounded-lg bg-cta py-3 font-bold text-white transition-colors hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="material-symbols-outlined">qr_code_scanner</span>
          Check in via QR
        </button>
      </div>

      <ErrorBanner message={error} />

      {result &&
        (result.matched === false ? (
          <p className="w-full rounded-lg border border-status-pending/30 bg-amber-50 p-4 text-body-md text-status-pending">
            Face didn't match confidently (score {result.match_score.toFixed(2)}). Please use QR check-in
            instead.
          </p>
        ) : (
          <p className="w-full rounded-lg border border-status-shortlisted/30 bg-emerald-50 p-4 text-body-md text-status-shortlisted">
            Checked in via {result.method} at {new Date(result.recorded_at).toLocaleTimeString()}.
          </p>
        ))}

      <div className="w-full">
        <h3 className="mb-4 border-b border-border-low-contrast pb-2 font-headline text-headline-md text-primary">
          Face check-in
        </h3>
        <FaceEnrollment accessToken={accessToken} />
        {sessionId ? (
          <div className="mt-4">
            <FaceCapture actionLabel="Check in via face" onCapture={handleFaceCapture} disabled={busy} />
          </div>
        ) : (
          <p className="mt-4 text-body-md text-on-surface-variant">
            Enter a session ID above to enable face check-in.
          </p>
        )}
      </div>
    </div>
  );
}
