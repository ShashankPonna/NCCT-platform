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

export function AdminProgrammeManager({ accessToken }: AdminProgrammeManagerProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | null>(null);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [sessions, setSessions] = useState<TimetableSession[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInstitutions(accessToken)
      .then(setInstitutions)
      .catch((err: Error) => setError(err.message));
    getProgrammes(accessToken)
      .then((progs) => {
        setProgrammes(progs);
        if (progs.length > 0 && !selectedProgrammeId) {
          void selectProgramme(progs[0].id);
        }
      })
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function refreshProgrammes() {
    const list = await getProgrammes(accessToken);
    setProgrammes(list);
    return list;
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
      const created = await createProgramme(accessToken, {
        institution_id: String(form.get("institution_id") ?? ""),
        title: String(form.get("title") ?? "").trim(),
        mode: String(form.get("mode") ?? "online") as ProgrammeMode,
        description: String(form.get("description") ?? "").trim() || undefined,
        target_audience: String(form.get("target_audience") ?? "").trim() || undefined,
        capacity: capacityRaw ? Number(capacityRaw) : undefined,
        start_date: String(form.get("start_date") ?? "") || undefined,
        end_date: String(form.get("end_date") ?? "") || undefined,
      });
      setShowCreateModal(false);
      const updatedList = await refreshProgrammes();
      await selectProgramme(created.id || (updatedList[0]?.id ?? ""));
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
    const formEl = e.currentTarget;
    setError(null);
    setBusy(true);
    try {
      const startsAt = new Date(String(form.get("starts_at") ?? "")).toISOString();
      const endsAt = new Date(String(form.get("ends_at") ?? "")).toISOString();
      await createTimetableSession(accessToken, selectedProgrammeId, {
        title: String(form.get("title") ?? "").trim() || undefined,
        starts_at: startsAt,
        ends_at: endsAt,
        location: String(form.get("location") ?? "").trim() || undefined,
      });
      formEl.reset();
      setShowSessionForm(false);
      setSessions(await getTimetableSessions(accessToken, selectedProgrammeId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selectedProg = programmes.find((p) => p.id === selectedProgrammeId);
  const selectedInst = institutions.find((i) => i.id === selectedProg?.institution_id);

  const filteredProgrammes = programmes.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingNominations = nominations.filter((n) => n.status === "pending");
  const approvedNominations = nominations.filter((n) => n.status === "approved");

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background text-left">
      {/* Header */}
      <header className="bg-surface px-6 py-4 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0">
            Programme Management
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Administer training programmes and participant nominations.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          type="button"
          className="bg-cta hover:bg-cta-hover text-on-primary px-6 py-2 rounded-lg font-label-md text-label-md min-h-[44px] transition-colors flex items-center gap-2 shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Programme
        </button>
      </header>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-error-container text-on-error-container rounded-lg flex items-center gap-2 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-sm text-body-sm">{error}</p>
        </div>
      )}

      {/* Master-Detail Dual-Pane Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Master List (Left Column) */}
        <div className="w-full md:w-80 lg:w-96 bg-surface-container-lowest border-r border-outline-variant flex flex-col overflow-hidden shrink-0">
          {/* Search Box */}
          <div className="p-4 border-b border-outline-variant bg-surface shrink-0">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                search
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search programmes..."
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-10 pr-4 py-2 font-body-md text-body-md focus:outline-none focus:border-cta focus:ring-1 focus:ring-cta min-h-[44px]"
                type="text"
              />
            </div>
          </div>

          {/* Programmes List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredProgrammes.length === 0 ? (
              <div className="p-6 text-center text-on-surface-variant font-body-sm">
                No programmes found.
              </div>
            ) : (
              filteredProgrammes.map((p) => {
                const isSelected = p.id === selectedProgrammeId;
                return (
                  <div
                    key={p.id}
                    onClick={() => void selectProgramme(p.id)}
                    className={`p-4 border-b border-outline-variant cursor-pointer transition-colors flex flex-col gap-2 relative ${
                      isSelected
                        ? "bg-surface-container-high"
                        : "bg-surface-container-lowest hover:bg-surface-container-low"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-secondary-container" />
                    )}
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-headline-sm text-[16px] leading-[22px] text-primary m-0 line-clamp-1 font-semibold">
                        {p.title}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded font-label-sm text-[10px] uppercase font-bold shrink-0 border ${
                          p.mode === "online"
                            ? "bg-primary-container/10 text-primary-container border-primary-container/20"
                            : p.mode === "hybrid"
                            ? "bg-secondary-container/15 text-secondary border-secondary-container/30"
                            : "bg-tertiary-container/10 text-tertiary-container border-tertiary-container/20"
                        }`}
                      >
                        {p.mode}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-on-surface-variant mt-1">
                      <span className="font-mono">
                        {p.start_date ? new Date(p.start_date).toLocaleDateString() : "Flexible date"}
                      </span>
                      <div className="flex items-center gap-1 font-medium">
                        <span className="material-symbols-outlined text-[16px]">group</span>
                        <span>{p.capacity ? `${p.capacity} seats` : "Open"}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail Section (Right Column) */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {selectedProg ? (
            <>
              {/* Detail Header */}
              <div className="p-6 border-b border-outline-variant bg-surface shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h2 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0">
                        {selectedProg.title}
                      </h2>
                      <span className="bg-status-success/15 text-status-success px-3 py-1 rounded-full font-label-sm text-label-sm border border-status-success/30 font-bold uppercase">
                        Active
                      </span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
                      {selectedProg.description || "No description provided."}
                    </p>
                  </div>
                </div>

                {/* Stats / Meta Info Bar */}
                <div className="flex flex-wrap gap-6 mt-6 p-4 bg-surface-container-lowest rounded-lg border border-outline-variant">
                  <div>
                    <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                      Institution
                    </p>
                    <p className="font-body-md text-body-md text-primary font-semibold mt-1">
                      {selectedInst?.name ?? "Independent / Central"}
                    </p>
                  </div>
                  <div className="hidden sm:block w-px bg-outline-variant" />
                  <div>
                    <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                      Dates
                    </p>
                    <p className="font-body-md text-body-md text-primary font-semibold mt-1">
                      {selectedProg.start_date
                        ? `${new Date(selectedProg.start_date).toLocaleDateString()} - ${
                            selectedProg.end_date ? new Date(selectedProg.end_date).toLocaleDateString() : "Ongoing"
                          }`
                        : "Self-paced"}
                    </p>
                  </div>
                  <div className="hidden sm:block w-px bg-outline-variant" />
                  <div>
                    <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                      Nominations
                    </p>
                    <p className="font-body-md text-body-md text-primary font-semibold mt-1">
                      {approvedNominations.length} Approved
                      {pendingNominations.length > 0 && ` · ${pendingNominations.length} Pending`} /{" "}
                      {nominations.length} Total
                    </p>
                  </div>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Nominations Section */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-headline-md text-headline-md text-primary m-0">
                      Nominations ({nominations.length})
                    </h3>
                  </div>

                  {nominations.length === 0 ? (
                    <div className="p-8 text-center bg-surface-container-low rounded-xl border border-dashed border-outline-variant text-on-surface-variant">
                      <span className="material-symbols-outlined text-[40px] text-outline mb-2">person_off</span>
                      <p className="font-body-md">No nominations submitted for this programme yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {nominations.map((nom) => {
                        const traineeName =
                          (nom as unknown as { trainee_name?: string }).trainee_name ??
                          nom.trainee_id.slice(0, 8);
                        const initials = traineeName.slice(0, 2).toUpperCase();

                        return (
                          <div
                            key={nom.id}
                            className="bg-surface-card rounded-xl p-4 border border-outline-variant shadow-sm flex flex-col justify-between gap-4"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-headline-sm font-bold text-sm">
                                  {initials}
                                </div>
                                <div>
                                  <h4 className="font-body-md font-semibold text-primary m-0">
                                    {traineeName}
                                  </h4>
                                  <p className="font-label-sm text-label-sm text-on-surface-variant m-0">
                                    Nominated: {new Date(nom.nominated_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded font-label-sm text-label-sm font-bold uppercase ${
                                  nom.status === "approved"
                                    ? "bg-status-success/15 text-status-success border border-status-success/30"
                                    : nom.status === "waitlisted"
                                    ? "bg-surface-container-highest text-on-surface"
                                    : nom.status === "rejected"
                                    ? "bg-error-container text-on-error-container"
                                    : "bg-status-pending/15 text-status-pending border border-status-pending/30"
                                }`}
                              >
                                {nom.status}
                              </span>
                            </div>

                            {/* Decision Buttons */}
                            <div className="flex gap-2 pt-2 border-t border-outline-variant/30">
                              <button
                                type="button"
                                onClick={() => void handleDecide(nom.id, "approved")}
                                disabled={nom.status === "approved"}
                                className="flex-1 bg-status-success/10 hover:bg-status-success/20 text-status-success disabled:opacity-40 px-3 py-2 rounded-lg font-label-md text-label-md min-h-[44px] transition-colors border border-status-success/30 font-semibold"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDecide(nom.id, "waitlisted")}
                                disabled={nom.status === "waitlisted"}
                                className="flex-1 bg-surface-container-highest hover:bg-surface-variant text-primary disabled:opacity-40 px-3 py-2 rounded-lg font-label-md text-label-md min-h-[44px] transition-colors border border-outline-variant font-semibold"
                              >
                                Waitlist
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDecide(nom.id, "rejected")}
                                disabled={nom.status === "rejected"}
                                title="Reject nomination"
                                className="w-[44px] flex items-center justify-center bg-error-container/50 hover:bg-error-container text-error disabled:opacity-40 rounded-lg transition-colors border border-error/20"
                              >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Timetable Section */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-headline-md text-headline-md text-primary m-0">
                      Timetable ({sessions.length} sessions)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowSessionForm(!showSessionForm)}
                      className="flex items-center gap-1 text-cta font-label-md text-label-md hover:underline cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {showSessionForm ? "close" : "add"}
                      </span>
                      {showSessionForm ? "Cancel" : "Add Session"}
                    </button>
                  </div>

                  {/* Create Session Form */}
                  {showSessionForm && (
                    <form
                      onSubmit={(e) => void handleCreateSession(e)}
                      className="mb-6 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm space-y-4"
                    >
                      <h4 className="font-headline-sm text-headline-sm m-0">New Timetable Session</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="block font-label-md text-label-md text-on-surface mb-1">
                            Session Title
                          </label>
                          <input
                            name="title"
                            placeholder="e.g. Introduction to Cooperative Governance"
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 font-body-md text-body-md min-h-[44px]"
                            type="text"
                          />
                        </div>
                        <div>
                          <label className="block font-label-md text-label-md text-on-surface mb-1">
                            Starts At *
                          </label>
                          <input
                            name="starts_at"
                            required
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 font-body-md text-body-md min-h-[44px]"
                            type="datetime-local"
                          />
                        </div>
                        <div>
                          <label className="block font-label-md text-label-md text-on-surface mb-1">
                            Ends At *
                          </label>
                          <input
                            name="ends_at"
                            required
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 font-body-md text-body-md min-h-[44px]"
                            type="datetime-local"
                          />
                        </div>
                        <div>
                          <label className="block font-label-md text-label-md text-on-surface mb-1">
                            Location
                          </label>
                          <input
                            name="location"
                            placeholder="e.g. Room 204 or a video-call link"
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 font-body-md text-body-md min-h-[44px]"
                            type="text"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowSessionForm(false)}
                          className="px-4 py-2 rounded-lg font-label-md text-label-md border border-outline-variant min-h-[44px] hover:bg-surface-variant"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={busy}
                          type="submit"
                          className="px-6 py-2 rounded-lg font-label-md text-label-md bg-cta text-on-primary min-h-[44px] hover:bg-cta-hover shadow-sm"
                        >
                          {busy ? "Saving..." : "Save Session"}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Sessions List */}
                  {sessions.length === 0 ? (
                    <p className="font-body-sm text-on-surface-variant">No timetable sessions scheduled yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {sessions.map((sess) => {
                        const start = new Date(sess.starts_at);
                        const end = new Date(sess.ends_at);
                        const month = start.toLocaleDateString(undefined, { month: "short" });
                        const day = String(start.getDate()).padStart(2, "0");
                        const timeStr = `${start.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} - ${end.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`;

                        return (
                          <div
                            key={sess.id}
                            className="flex items-center gap-4 p-4 bg-surface-card rounded-lg border border-outline-variant hover:bg-surface-container-lowest transition-colors shadow-sm"
                          >
                            <div className="bg-surface-container-highest p-2 rounded text-center min-w-[64px]">
                              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                                {month}
                              </div>
                              <div className="font-headline-sm text-headline-sm text-primary font-bold">
                                {day}
                              </div>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-body-md font-semibold text-primary m-0">
                                {sess.title || "Scheduled Session"}
                              </h4>
                              <p className="font-body-sm text-on-surface-variant m-0 flex items-center gap-1.5 mt-0.5">
                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                {timeStr}
                                {sess.location && <span className="ml-2">• {sess.location}</span>}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[64px] text-outline mb-4">school</span>
              <h3 className="font-headline-sm text-headline-sm mb-2">No Programme Selected</h3>
              <p className="font-body-md max-w-sm">
                Select a programme from the list on the left to review nominations, timetable schedules, and participant details.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Programme Modal Overlay */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-primary/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-card rounded-xl border border-outline-variant shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-left">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface">
              <h2 className="font-headline-md text-headline-md text-primary m-0">Create New Programme</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-[44px] h-[44px] flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={(e) => void handleCreateProgramme(e)} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">
                  Programme Title *
                </label>
                <input
                  name="title"
                  required
                  placeholder="e.g. Sustainable Agri-Cooperative Management"
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 font-body-md text-body-md min-h-[44px] focus:ring-1 focus:ring-cta focus:border-cta"
                  type="text"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">
                    Institution *
                  </label>
                  <select
                    name="institution_id"
                    required
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 font-body-md text-body-md min-h-[44px]"
                  >
                    <option value="">Select Institution...</option>
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">
                    Mode *
                  </label>
                  <select
                    name="mode"
                    defaultValue="online"
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 font-body-md text-body-md min-h-[44px]"
                  >
                    {PROGRAMME_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">Capacity</label>
                  <input
                    name="capacity"
                    placeholder="e.g. 30"
                    type="number"
                    min="1"
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 font-body-md text-body-md min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">Start Date</label>
                  <input
                    name="start_date"
                    type="date"
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 font-body-md text-body-md min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">End Date</label>
                  <input
                    name="end_date"
                    type="date"
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 font-body-md text-body-md min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">
                  Target Audience
                </label>
                <input
                  name="target_audience"
                  placeholder="e.g. Rural youth, cooperative society secretaries"
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 font-body-md text-body-md min-h-[44px]"
                  type="text"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">Description</label>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Detailed course description, prerequisites, and learning outcomes..."
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-3 font-body-md text-body-md"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-2 rounded-lg font-label-md text-label-md border border-outline-variant min-h-[44px] hover:bg-surface-variant"
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  type="submit"
                  className="px-6 py-2 rounded-lg font-label-md text-label-md bg-cta text-on-primary min-h-[44px] hover:bg-cta-hover shadow-sm"
                >
                  {busy ? "Creating..." : "Create Programme"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
