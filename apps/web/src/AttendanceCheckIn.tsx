import { checkInWithFace, checkInWithQr, type AttendanceCheckInResult } from "@ncct/api-client";
import { useEffect, useState } from "react";
import { FaceCapture } from "./FaceCapture.js";
import { FaceEnrollment } from "./FaceEnrollment.js";

interface AttendanceCheckInProps {
  accessToken: string;
  /** Set when the page was opened via a session's `?checkin=` QR link — see
   * docs/DECISIONS.md's F5 QR approach (a URL, not just a raw session id). */
  autoCheckInSessionId?: string;
}

// Bare-bones session-id input, same "no programme/session picker exists yet"
// limitation as the rest of this repo's web UI (F2 has no browsing UI) — see
// docs/IMPLEMENTATION.md's F3/F4 entries for the same noted gap.
export function AttendanceCheckIn({ accessToken, autoCheckInSessionId }: AttendanceCheckInProps) {
  const [sessionId, setSessionId] = useState(autoCheckInSessionId ?? "");
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoCheckInSessionId) {
      void handleQrCheckIn(autoCheckInSessionId);
    }
    // Only ever auto-run once, for the session id the page was opened with.
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
    <section className="attendance-panel">
      <h2>Attendance</h2>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void handleQrCheckIn(sessionId);
        }}
      >
        <label>
          Session ID
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="session UUID"
          />
        </label>
        <button type="submit" disabled={busy || !sessionId}>
          Check in via QR
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      {result &&
        (result.matched === false ? (
          <p className="attendance-result">
            Face didn't match confidently (score {result.match_score.toFixed(2)}). Please use QR
            check-in instead.
          </p>
        ) : (
          <p className="attendance-result">
            Checked in via {result.method} at {new Date(result.recorded_at).toLocaleTimeString()}.
          </p>
        ))}

      <h3>Face check-in</h3>
      <FaceEnrollment accessToken={accessToken} />
      {sessionId ? (
        <FaceCapture actionLabel="Check in via face" onCapture={handleFaceCapture} disabled={busy} />
      ) : (
        <p>Enter a session ID above to enable face check-in.</p>
      )}
    </section>
  );
}
