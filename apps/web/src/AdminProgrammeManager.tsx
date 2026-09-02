import {
  createProgramme,
  createTimetableSession,
  decideNomination,
  getInstitutions,
  getProgrammeNominations,
  getProgrammes,
  getTimetableSessions,
} from "@ncct/api-client";
import { PROGRAMME_MODES } from "@ncct/constants";
import type {
  Institution,
  Nomination,
  NominationDecision,
  Programme,
  ProgrammeMode,
  TimetableSession,
} from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface AdminProgrammeManagerProps {
  accessToken: string;
}

const DECISIONS: NominationDecision[] = ["approved", "waitlisted", "rejected"];

// The admin half of F2, which had API routes and tests since the F2 round but
// no UI at all — meaning nobody could create a programme, approve a
// nomination, or schedule a session without hand-writing HTTP calls, and
// every other admin/trainee screen had to ask for a raw programme UUID
// because there was nothing to pick from. Deliberately bare-bones, matching
// the rest of this repo's admin panels (see AdminCourseManager).
export function AdminProgrammeManager({ accessToken }: AdminProgrammeManagerProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | null>(null);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [sessions, setSessions] = useState<TimetableSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInstitutions(accessToken)
      .then(setInstitutions)
      .catch((err: Error) => setError(err.message));
    getProgrammes(accessToken)
      .then(setProgrammes)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  async function refreshProgrammes() {
    setProgrammes(await getProgrammes(accessToken));
  }

  async function selectProgramme(programmeId: string) {
    setSelectedProgrammeId(programmeId);
    setError(null);
    try {
      const [noms, sess] = await Promise.all([
        getProgrammeNominations(accessToken, programmeId),
        getTimetableSessions(accessToken, programmeId),
      ]);
      setNominations(noms);
      setSessions(sess);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateProgramme(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const capacityRaw = String(form.get("capacity") ?? "");
    setError(null);
    setBusy(true);
    try {
      await createProgramme(accessToken, {
        institution_id: String(form.get("institution_id") ?? ""),
        title: String(form.get("title") ?? ""),
        mode: String(form.get("mode") ?? "online") as ProgrammeMode,
        description: String(form.get("description") ?? "") || undefined,
        target_audience: String(form.get("target_audience") ?? "") || undefined,
        capacity: capacityRaw ? Number(capacityRaw) : undefined,
        start_date: String(form.get("start_date") ?? "") || undefined,
        end_date: String(form.get("end_date") ?? "") || undefined,
      });
      e.currentTarget.reset();
      await refreshProgrammes();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecide(nominationId: string, status: NominationDecision) {
    if (!selectedProgrammeId) return;
    setError(null);
    try {
      await decideNomination(accessToken, selectedProgrammeId, nominationId, status);
      setNominations(await getProgrammeNominations(accessToken, selectedProgrammeId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedProgrammeId) return;
    const form = new FormData(e.currentTarget);
    setError(null);
    setBusy(true);
    try {
      // datetime-local gives "2026-09-02T14:00" with no zone; the API's zod
      // schema wants a real ISO datetime, so normalise through Date here
      // rather than sending something the server will reject.
      const startsAt = new Date(String(form.get("starts_at") ?? "")).toISOString();
      const endsAt = new Date(String(form.get("ends_at") ?? "")).toISOString();
      await createTimetableSession(accessToken, selectedProgrammeId, {
        title: String(form.get("title") ?? "") || undefined,
        starts_at: startsAt,
        ends_at: endsAt,
        location: String(form.get("location") ?? "") || undefined,
      });
      e.currentTarget.reset();
      setSessions(await getTimetableSessions(accessToken, selectedProgrammeId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selectedProgramme = programmes.find((p) => p.id === selectedProgrammeId) ?? null;

  return (
    <section className="attendance-panel">
      <h2>Programmes</h2>
      {error && <p className="form-error">{error}</p>}

      <h3>Create a programme</h3>
      <form className="inline-form" onSubmit={(e) => void handleCreateProgramme(e)}>
        <label>
          Institution
          <select name="institution_id" required defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
                {inst.location ? ` — ${inst.location}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input type="text" name="title" required />
        </label>
        <label>
          Mode
          <select name="mode" defaultValue="online">
            {PROGRAMME_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description
          <input type="text" name="description" />
        </label>
        <label>
          Target audience
          <input type="text" name="target_audience" />
        </label>
        <label>
          Capacity
          <input type="number" name="capacity" min={1} />
        </label>
        <label>
          Starts
          <input type="date" name="start_date" />
        </label>
        <label>
          Ends
          <input type="date" name="end_date" />
        </label>
        <button type="submit" disabled={busy || institutions.length === 0}>
          Create programme
        </button>
      </form>
      {institutions.length === 0 && (
        <p className="form-error">
          No institutions exist yet — one is required before a programme can be created (institution
          authoring is still unbuilt, see F1 in docs/IMPLEMENTATION.md).
        </p>
      )}

      <h3>All programmes</h3>
      {programmes.length === 0 ? (
        <p>No programmes yet.</p>
      ) : (
        <ul>
          {programmes.map((programme) => (
            <li key={programme.id}>
              <button type="button" onClick={() => void selectProgramme(programme.id)}>
                {programme.title}
              </button>{" "}
              <span className="role-badge">{programme.mode}</span>{" "}
              <code>{programme.id}</code>
            </li>
          ))}
        </ul>
      )}

      {selectedProgramme && (
        <>
          <h3>Nominations — {selectedProgramme.title}</h3>
          {nominations.length === 0 ? (
            <p>No nominations for this programme yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Trainee</th>
                  <th>Status</th>
                  <th>Nominated</th>
                  <th>Decide</th>
                </tr>
              </thead>
              <tbody>
                {nominations.map((nomination) => (
                  <tr key={nomination.id}>
                    <td>
                      <code>{nomination.trainee_id}</code>
                    </td>
                    <td>{nomination.status}</td>
                    <td>{new Date(nomination.nominated_at).toLocaleString()}</td>
                    <td>
                      {DECISIONS.map((decision) => (
                        <button
                          key={decision}
                          type="button"
                          disabled={nomination.status === decision}
                          onClick={() => void handleDecide(nomination.id, decision)}
                        >
                          {decision}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Timetable — {selectedProgramme.title}</h3>
          <form className="inline-form" onSubmit={(e) => void handleCreateSession(e)}>
            <label>
              Title
              <input type="text" name="title" />
            </label>
            <label>
              Starts at
              <input type="datetime-local" name="starts_at" required />
            </label>
            <label>
              Ends at
              <input type="datetime-local" name="ends_at" required />
            </label>
            <label>
              Location
              <input type="text" name="location" />
            </label>
            <button type="submit" disabled={busy}>
              Add session
            </button>
          </form>
          {sessions.length === 0 ? (
            <p>No sessions scheduled.</p>
          ) : (
            <ul>
              {sessions.map((session) => (
                <li key={session.id}>
                  {session.title ?? "Session"} — {new Date(session.starts_at).toLocaleString()} to{" "}
                  {new Date(session.ends_at).toLocaleTimeString()}
                  {session.location ? ` · ${session.location}` : ""} <code>{session.id}</code>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
