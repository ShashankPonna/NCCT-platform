import { checkInWithQr, type AttendanceCheckInResult } from "@ncct/api-client";
import { useEffect, useState } from "react";
import { FaceEnrollment } from "../FaceEnrollment.js";
import { useOnlineStatus } from "../offline/network.js";
import { enqueueWrite } from "../offline/syncManager.js";
import { ErrorBanner } from "./pieces.js";

interface TraineeAttendanceProps {
  accessToken: string;
  autoCheckInSessionId?: string;
}

// Check-in itself is QR-only here — see DECISIONS.md #21. Face-recognition
// attendance *matching* runs from an ESP32-CAM at an institution kiosk, not
// a trainee's own device, so FaceCapture's getUserMedia flow was removed
// from check-in specifically. Enrollment is different: it's a one-time,
// consent-gated identity action that only makes sense as trainee
// self-service (their own device, their own explicit consent per CLAUDE.md's
// DPDP Act 2023 rule) — re-added below (DECISIONS.md #32) as what a staff
// kiosk's face check-in verifies against.
export function TraineeAttendance({ accessToken, autoCheckInSessionId }: TraineeAttendanceProps) {
  const [sessionId, setSessionId] = useState(autoCheckInSessionId ?? "");
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

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
    setQueued(false);

    // A QR check-in scanned while offline (a session at a venue with no
    // signal, exactly the PRD §7 low-bandwidth context) still records the
    // moment it actually happened — queued with that timestamp — rather
    // than failing outright or silently doing nothing.
    if (!online) {
      await enqueueWrite({ type: "qr_checkin", queuedAt: new Date().toISOString(), sessionId: id });
      setQueued(true);
      return;
    }

    setBusy(true);
    try {
      setResult(await checkInWithQr(accessToken, id));
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
          Enter your session ID, then check in via QR code.
        </p>
      </div>

      {!online && (
        <div className="flex w-full items-center gap-2 rounded-lg border border-status-pending/30 bg-status-pending/10 p-3 text-label-md text-status-pending">
          <span className="material-symbols-outlined text-[18px]">cloud_off</span>
          You&apos;re offline — check-in will be saved and sent once you&apos;re back online.
        </div>
      )}

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

      <div className="flex w-full flex-col gap-4 rounded-xl border border-border-low-contrast bg-surface-card p-6">
        <div>
          <h2 className="text-headline-sm text-primary">Face ID</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Enroll once here, on your own device. Staff at an institution kiosk can then verify
            your face against this enrollment to check you in — you never need to use your own
            camera for check-in itself.
          </p>
        </div>
        <FaceEnrollment accessToken={accessToken} />
      </div>

      {queued && (
        <p className="w-full rounded-lg border border-interactive/30 bg-interactive/10 p-4 text-body-md text-interactive">
          Check-in saved — it will be sent once you&apos;re back online.
        </p>
      )}

      {result &&
        (result.matched === false ? (
          <p className="w-full rounded-lg border border-status-pending/30 bg-amber-50 p-4 text-body-md text-status-pending">
            Check-in couldn&apos;t be confirmed (score {result.match_score.toFixed(2)}). Please try QR
            check-in again.
          </p>
        ) : (
          <p className="w-full rounded-lg border border-status-shortlisted/30 bg-emerald-50 p-4 text-body-md text-status-shortlisted">
            Checked in via {result.method} at {new Date(result.recorded_at).toLocaleTimeString()}.
          </p>
        ))}
    </div>
  );
}
