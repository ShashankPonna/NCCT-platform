import type { TraineeHostelAssignment } from "@ncct/shared-types";
import { notifyHostelAssigned } from "./notificationService.js";
import { supabaseAdmin } from "./supabaseClient.js";

// Shared by nominations.ts (assign while approving) and hostels.ts (assign or
// change a room for an already-approved trainee) — docs/DECISIONS.md #64.
// Deliberately no capacity/availability logic: the admin manages occupancy
// by hand, the system only records what they chose.

export type HostelResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/**
 * A room must belong to a hostel of the same institution that runs the
 * programme — an integrity check against picking another institute's hostel
 * by mistake, not an availability check.
 */
export async function checkRoomForProgramme(
  programmeId: string,
  roomId: string,
): Promise<HostelResult<null>> {
  const { data: programme, error: programmeError } = await supabaseAdmin
    .from("programmes")
    .select("institution_id")
    .eq("id", programmeId)
    .maybeSingle();
  if (programmeError) return { ok: false, status: 400, error: programmeError.message };
  if (!programme) return { ok: false, status: 404, error: "Programme not found" };

  const { data: room, error: roomError } = await supabaseAdmin
    .from("hostel_rooms")
    .select("id, hostels(institution_id)")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) return { ok: false, status: 400, error: roomError.message };
  if (!room) return { ok: false, status: 404, error: "Hostel room not found" };

  const hostel = (room as unknown as { hostels: { institution_id: string } | null }).hostels;
  if (hostel?.institution_id !== programme.institution_id) {
    return {
      ok: false,
      status: 400,
      error: "That room belongs to a hostel of a different institution than this programme",
    };
  }
  return { ok: true, value: null };
}

/** Creates or replaces the trainee's one room assignment for this programme. */
export async function upsertHostelAssignment(input: {
  programmeId: string;
  traineeId: string;
  roomId: string;
  notes: string | null;
  assignedBy: string;
}): Promise<HostelResult<TraineeHostelAssignment>> {
  const { data, error } = await supabaseAdmin
    .from("trainee_hostel_assignments")
    .upsert(
      {
        programme_id: input.programmeId,
        trainee_id: input.traineeId,
        room_id: input.roomId,
        notes: input.notes,
        assigned_by: input.assignedBy,
        assigned_on: new Date().toISOString(),
      },
      { onConflict: "trainee_id,programme_id" },
    )
    .select()
    .single();
  if (error) return { ok: false, status: 400, error: error.message };
  void notifyHostelAssigned({
    programmeId: input.programmeId,
    traineeId: input.traineeId,
    roomId: input.roomId,
  });
  return { ok: true, value: data as TraineeHostelAssignment };
}
