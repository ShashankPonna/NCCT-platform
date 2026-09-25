import {
  createHostel,
  createHostelRoom,
  deleteHostel,
  deleteHostelRoom,
  getHostels,
  updateHostel,
  updateHostelRoom,
} from "@ncct/api-client";
import { HOSTEL_ROOM_TYPES } from "@ncct/constants";
import type { HostelRoom, HostelRoomType, HostelWithRooms, Institution } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface AdminHostelManagerProps {
  accessToken: string;
  institutions: Institution[];
}

const ROOM_TYPE_LABEL: Record<HostelRoomType, string> = {
  dorm: "Dorm",
  shared: "Shared",
  single: "Single",
};

const inputClass =
  "h-9 px-3 bg-surface-card text-ink text-xs rounded-xl border border-border-slate outline-none focus:border-[#00236F]";
const smallButtonClass =
  "h-8 px-2.5 bg-paper-light hover:bg-slate-200/60 border border-border-slate text-primary text-xs rounded-lg cursor-pointer font-semibold";
const deleteButtonClass =
  "h-8 px-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs rounded-lg cursor-pointer";

// Hostel/logistics reference data per institution (docs/DECISIONS.md #64):
// plain CRUD for hostels and their rooms. Record-keeping only — no capacity
// checks or availability; rooms are assigned to trainees by hand from the
// programme's nomination review screen.
export function AdminHostelManager({ accessToken, institutions }: AdminHostelManagerProps) {
  const [institutionId, setInstitutionId] = useState("");
  const [hostels, setHostels] = useState<HostelWithRooms[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingHostelId, setEditingHostelId] = useState<string | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);

  const activeInstitutionId = institutionId || institutions[0]?.id || "";

  useEffect(() => {
    if (!activeInstitutionId) return;
    getHostels(accessToken, activeInstitutionId)
      .then(setHostels)
      .catch((err: Error) => setError(err.message));
  }, [accessToken, activeInstitutionId]);

  async function refresh() {
    setHostels(await getHostels(accessToken, activeInstitutionId));
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleCreateHostel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await createHostel(accessToken, activeInstitutionId, {
        name: String(data.get("name") ?? "").trim(),
        notes: String(data.get("notes") ?? "").trim() || null,
      });
      form.reset();
    });
  }

  function handleUpdateHostel(e: React.FormEvent<HTMLFormElement>, hostelId: string) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(async () => {
      await updateHostel(accessToken, hostelId, {
        name: String(data.get("name") ?? "").trim(),
        notes: String(data.get("notes") ?? "").trim() || null,
      });
      setEditingHostelId(null);
    });
  }

  function handleDeleteHostel(hostel: HostelWithRooms) {
    if (!window.confirm(`Delete "${hostel.name}" and all its rooms?`)) return;
    void run(() => deleteHostel(accessToken, hostel.id));
  }

  function readRoomInput(data: FormData) {
    const capacityRaw = String(data.get("capacity") ?? "").trim();
    return {
      room_number: String(data.get("room_number") ?? "").trim(),
      type: data.get("type") as HostelRoomType,
      ...(capacityRaw ? { capacity: Number(capacityRaw) } : {}),
    };
  }

  function handleCreateRoom(e: React.FormEvent<HTMLFormElement>, hostelId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await createHostelRoom(accessToken, hostelId, readRoomInput(data));
      form.reset();
    });
  }

  function handleUpdateRoom(e: React.FormEvent<HTMLFormElement>, roomId: string) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(async () => {
      await updateHostelRoom(accessToken, roomId, readRoomInput(data));
      setEditingRoomId(null);
    });
  }

  function handleDeleteRoom(room: HostelRoom) {
    if (!window.confirm(`Delete room ${room.room_number}?`)) return;
    void run(() => deleteHostelRoom(accessToken, room.id));
  }

  return (
    <div className="bg-surface-card rounded-2xl shadow-xs overflow-hidden flex flex-col border border-border-slate">
      <div className="p-5 bg-paper flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-slate/60">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#00236F] text-white flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px]">bed</span>
          </div>
          <div>
            <h2 className="font-display text-lg text-primary font-bold">Hostels & Rooms</h2>
            <p className="font-body text-xs text-slate-600 mt-0.5">
              Reference list only — assign rooms to approved trainees from a programme&apos;s
              nominations.
            </p>
          </div>
        </div>
        {institutions.length > 0 && (
          <select
            value={activeInstitutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            className={`${inputClass} self-start sm:self-center max-w-[220px]`}
            aria-label="Institution"
          >
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p className="m-4 mb-0 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          {error}
        </p>
      )}

      {institutions.length === 0 ? (
        <p className="p-4 text-xs text-slate-500">
          Add an institution first — hostels belong to an institution.
        </p>
      ) : (
        <>
          <form
            onSubmit={handleCreateHostel}
            className="p-4 bg-paper-light border-b border-border-slate/60 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2"
          >
            <input name="name" required placeholder="Hostel name *" className={inputClass} />
            <input name="notes" placeholder="Notes (optional)" className={inputClass} />
            <button
              type="submit"
              disabled={busy}
              className="h-9 px-4 rounded-xl text-xs bg-[#00236F] text-white font-bold hover:bg-[#001b54] disabled:opacity-50 cursor-pointer"
            >
              + Add Hostel
            </button>
          </form>

          {hostels.length === 0 ? (
            <p className="p-4 text-xs text-slate-500">
              No hostels recorded for this institution yet.
            </p>
          ) : (
            <div className="divide-y divide-border-slate/40 flex flex-col">
              {hostels.map((hostel) => (
                <div key={hostel.id} className="p-4 flex flex-col gap-3">
                  {editingHostelId === hostel.id ? (
                    <form
                      onSubmit={(e) => handleUpdateHostel(e, hostel.id)}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2"
                    >
                      <input
                        name="name"
                        required
                        defaultValue={hostel.name}
                        className={inputClass}
                      />
                      <input
                        name="notes"
                        defaultValue={hostel.notes ?? ""}
                        placeholder="Notes"
                        className={inputClass}
                      />
                      <button type="submit" disabled={busy} className={smallButtonClass}>
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingHostelId(null)}
                        className={smallButtonClass}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-primary text-sm truncate">
                            {hostel.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-paper-light border border-border-slate text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                            {hostel.hostel_rooms.length}{" "}
                            {hostel.hostel_rooms.length === 1 ? "room" : "rooms"}
                          </span>
                        </div>
                        {hostel.notes && (
                          <p className="text-xs text-slate-500 mt-1">{hostel.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingHostelId(hostel.id)}
                          className={smallButtonClass}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHostel(hostel)}
                          className={deleteButtonClass}
                          title="Delete hostel"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {hostel.hostel_rooms.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {hostel.hostel_rooms.map((room) =>
                        editingRoomId === room.id ? (
                          <form
                            key={room.id}
                            onSubmit={(e) => handleUpdateRoom(e, room.id)}
                            className="grid grid-cols-[1fr_1fr_80px_auto_auto] gap-2"
                          >
                            <input
                              name="room_number"
                              required
                              defaultValue={room.room_number}
                              className={inputClass}
                            />
                            <select name="type" defaultValue={room.type} className={inputClass}>
                              {HOSTEL_ROOM_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {ROOM_TYPE_LABEL[type]}
                                </option>
                              ))}
                            </select>
                            <input
                              name="capacity"
                              type="number"
                              min={1}
                              defaultValue={room.capacity}
                              className={inputClass}
                              aria-label="Capacity"
                            />
                            <button type="submit" disabled={busy} className={smallButtonClass}>
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRoomId(null)}
                              className={smallButtonClass}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <div
                            key={room.id}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-paper-light border border-border-slate/60 text-xs"
                          >
                            <span className="font-semibold text-ink">Room {room.room_number}</span>
                            <span className="text-slate-500">
                              {ROOM_TYPE_LABEL[room.type]} · {room.capacity}{" "}
                              {room.capacity === 1 ? "bed" : "beds"}
                            </span>
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                type="button"
                                onClick={() => setEditingRoomId(room.id)}
                                className={smallButtonClass}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRoom(room)}
                                className={deleteButtonClass}
                                title="Delete room"
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  delete
                                </span>
                              </button>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  <form
                    onSubmit={(e) => handleCreateRoom(e, hostel.id)}
                    className="grid grid-cols-[1fr_1fr_80px_auto] gap-2"
                  >
                    <input
                      name="room_number"
                      required
                      placeholder="Room no. *"
                      className={inputClass}
                    />
                    <select
                      name="type"
                      defaultValue="shared"
                      className={inputClass}
                      aria-label="Room type"
                    >
                      {HOSTEL_ROOM_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ROOM_TYPE_LABEL[type]}
                        </option>
                      ))}
                    </select>
                    <input
                      name="capacity"
                      type="number"
                      min={1}
                      placeholder="Beds"
                      className={inputClass}
                    />
                    <button type="submit" disabled={busy} className={smallButtonClass}>
                      + Room
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
