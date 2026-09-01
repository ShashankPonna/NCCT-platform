import { getAttendanceQr, getAttendanceRoster } from "@ncct/api-client";
import type { AttendanceRecord } from "@ncct/shared-types";
import { useState } from "react";

interface AttendanceManagerProps {
  accessToken: string;
}

type RosterRow = AttendanceRecord & { profiles: { full_name: string | null } | null };

// Bare-bones session-id input, same limitation noted in AttendanceCheckIn.tsx
// — no session picker exists yet since F2 has no browsing UI.
export function AttendanceManager({ accessToken }: AttendanceManagerProps) {
  const [sessionId, setSessionId] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [checkInUrl, setCheckInUrl] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateQr() {
    setError(null);
    try {
      const result = await getAttendanceQr(accessToken, sessionId);
      setQrDataUrl(result.qrDataUrl);
      setCheckInUrl(result.checkInUrl);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleLoadRoster() {
    setError(null);
    try {
      setRoster(await getAttendanceRoster(accessToken, sessionId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="attendance-panel">
      <h2>Attendance</h2>
      <div className="inline-form">
        <label>
          Session ID
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="session UUID"
          />
        </label>
        <button type="button" onClick={handleGenerateQr} disabled={!sessionId}>
          Generate QR
        </button>
        <button type="button" onClick={handleLoadRoster} disabled={!sessionId}>
          Load roster
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {qrDataUrl && (
        <div>
          <img src={qrDataUrl} alt="Session check-in QR code" width={200} height={200} />
          <p>{checkInUrl}</p>
        </div>
      )}

      {roster && (
        <table>
          <thead>
            <tr>
              <th>Trainee</th>
              <th>Method</th>
              <th>Match score</th>
              <th>Recorded at</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((row) => (
              <tr key={row.id}>
                <td>{row.profiles?.full_name ?? row.trainee_id}</td>
                <td>{row.method}</td>
                <td>{row.match_score?.toFixed(2) ?? "—"}</td>
                <td>{new Date(row.recorded_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
