import type { HostelWithRooms, MyHostelAssignment } from "@ncct/shared-types";
import {
  assignHostelRoomSchema,
  createHostelRoomSchema,
  createHostelSchema,
  updateHostelRoomSchema,
  updateHostelSchema,
} from "@ncct/validation";
import { Router } from "express";
import { checkRoomForProgramme, upsertHostelAssignment } from "../hostelAssignment.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const hostelsRouter = Router();

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// Hostel/logistics reference data (docs/DECISIONS.md #64). `hostels` and
// `hostel_rooms` have RLS enabled with no policy (default-deny), same as
// `institutions`, so every route uses supabaseAdmin behind requireRole.
// Record-keeping only: no capacity checks, availability, or booking.

hostelsRouter.get(
  "/institutions/:id/hostels",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("hostels")
      .select("*, hostel_rooms(*)")
      .eq("institution_id", req.params.id)
      .order("name", { ascending: true });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    const hostels = ((data ?? []) as HostelWithRooms[]).map((hostel) => ({
      ...hostel,
      hostel_rooms: [...(hostel.hostel_rooms ?? [])].sort((a, b) =>
        a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
      ),
    }));
    res.json(hostels);
  },
);

hostelsRouter.post(
  "/institutions/:id/hostels",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const parsed = createHostelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("hostels")
      .insert({ ...parsed.data, institution_id: req.params.id })
      .select()
      .single();

    if (error) {
      if (error.code === FOREIGN_KEY_VIOLATION) {
        res.status(404).json({ error: "Institution not found" });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

hostelsRouter.patch("/hostels/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = updateHostelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("hostels")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Hostel not found" });
    return;
  }
  res.json(data);
});

// Deleting a hostel cascades to its rooms; a room that still has a trainee
// assigned blocks that cascade via trainee_hostel_assignments.room_id (no
// cascade by design) — surfaced as a 409 rather than silently erasing where
// trainees were recorded as staying.
hostelsRouter.delete("/hostels/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("hostels")
    .delete()
    .eq("id", req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      res
        .status(409)
        .json({ error: "Unassign every trainee from this hostel's rooms before deleting it" });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Hostel not found" });
    return;
  }
  res.status(204).send();
});

hostelsRouter.post("/hostels/:id/rooms", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = createHostelRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("hostel_rooms")
    .insert({ ...parsed.data, hostel_id: req.params.id })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      res.status(409).json({ error: "A room with that number already exists in this hostel" });
      return;
    }
    if (error.code === FOREIGN_KEY_VIOLATION) {
      res.status(404).json({ error: "Hostel not found" });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

hostelsRouter.patch("/hostel-rooms/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = updateHostelRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("hostel_rooms")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      res.status(409).json({ error: "A room with that number already exists in this hostel" });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Hostel room not found" });
    return;
  }
  res.json(data);
});

hostelsRouter.delete("/hostel-rooms/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("hostel_rooms")
    .delete()
    .eq("id", req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      res.status(409).json({ error: "Unassign every trainee from this room before deleting it" });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Hostel room not found" });
    return;
  }
  res.status(204).send();
});

// Assign or change an already-approved trainee's room for a programme. The
// same write also happens inline when a nomination is approved with a room
// picked (nominations.ts) — this route covers trainees approved earlier, or
// correcting a wrong room later.
hostelsRouter.put(
  "/programmes/:id/hostel-assignments/:traineeId",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const parsed = assignHostelRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { id: programmeId, traineeId } = req.params;

    const { data: nomination, error: nominationError } = await supabaseAdmin
      .from("nominations")
      .select("id")
      .eq("programme_id", programmeId)
      .eq("trainee_id", traineeId)
      .eq("status", "approved")
      .maybeSingle();
    if (nominationError) {
      res.status(400).json({ error: nominationError.message });
      return;
    }
    if (!nomination) {
      res.status(404).json({ error: "Trainee is not an approved nominee of this programme" });
      return;
    }

    const roomCheck = await checkRoomForProgramme(programmeId, parsed.data.room_id);
    if (!roomCheck.ok) {
      res.status(roomCheck.status).json({ error: roomCheck.error });
      return;
    }

    const result = await upsertHostelAssignment({
      programmeId,
      traineeId,
      roomId: parsed.data.room_id,
      notes: parsed.data.notes ?? null,
      assignedBy: req.user!.id,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.value);
  },
);

hostelsRouter.delete(
  "/programmes/:id/hostel-assignments/:traineeId",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("trainee_hostel_assignments")
      .delete()
      .eq("programme_id", req.params.id)
      .eq("trainee_id", req.params.traineeId)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "No hostel assignment found for this trainee" });
      return;
    }
    res.status(204).send();
  },
);

// A trainee's own assignments, shown read-only on their private profile.
// Deliberately NOT exposed on the public NFC profile (docs/DECISIONS.md
// #64): that page needs no login, and a room number there would tell any
// stranger where the trainee sleeps. supabaseAdmin is scoped by req.user.id
// here because hostels/hostel_rooms have no read policy for the embed to
// pass through — same reasoning as certificates.ts's /mine route.
hostelsRouter.get(
  "/hostel-assignments/mine",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("trainee_hostel_assignments")
      .select(
        "programme_id, assigned_on, notes, programmes(title), hostel_rooms(room_number, type, hostels(name))",
      )
      .eq("trainee_id", req.user!.id)
      .order("assigned_on", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    type Row = {
      programme_id: string;
      assigned_on: string;
      notes: string | null;
      programmes: { title: string } | null;
      hostel_rooms: {
        room_number: string;
        type: MyHostelAssignment["room_type"];
        hostels: { name: string } | null;
      } | null;
    };
    const assignments: MyHostelAssignment[] = ((data ?? []) as unknown as Row[]).map((row) => ({
      programme_id: row.programme_id,
      programme_title: row.programmes?.title ?? null,
      hostel_name: row.hostel_rooms?.hostels?.name ?? null,
      room_number: row.hostel_rooms?.room_number ?? null,
      room_type: row.hostel_rooms?.type ?? null,
      assigned_on: row.assigned_on,
      notes: row.notes,
    }));
    res.json(assignments);
  },
);
