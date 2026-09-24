import { decideNominationSchema } from "@ncct/validation";
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const nominationsRouter = Router();

const UNIQUE_VIOLATION = "23505";

nominationsRouter.post(
  "/programmes/:id/nominations",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await req
      .supabase!.from("nominations")
      .insert({ programme_id: req.params.id, trainee_id: req.user!.id })
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        res.status(409).json({ error: "Already nominated for this programme" });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  },
);

// A trainee's own nominations across all programmes — own-row RLS
// (`nominations_own`), so req.supabase suffices, no ownership check needed.
// Mirrors GET /api/job-interests/mine. The programmes embed is readable
// under the caller's own client via `programmes_read_authenticated`.
nominationsRouter.get(
  "/nominations/mine",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await req
      .supabase!.from("nominations")
      .select("*, programmes(title, mode, start_date, end_date)")
      .order("nominated_at", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  },
);

// Admin+trainer read (not admin-only): a trainer needs to see who's coming
// to their own sessions — the widening this same request also asked for on
// the timetable-creation route above, see timetable.ts. *Deciding* a
// nomination (PATCH below) stays admin-only per PRD's role table; this is
// read access only.
//
// Denormalizes the trainee's profile (docs/DECISIONS.md #54) — the previous
// version returned bare nomination rows with no name, phone, or
// affiliation, so the review screen had nothing to actually identify a
// trainee by beyond a raw UUID.
nominationsRouter.get(
  "/programmes/:id/nominations",
  requireAuth,
  requireRole("admin", "trainer"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("nominations")
      .select("*, profiles(full_name, phone, cooperative_affiliation)")
      .eq("programme_id", req.params.id)
      .order("nominated_at", { ascending: true });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json(
      (
        (data ?? []) as unknown as {
          profiles: {
            full_name: string | null;
            phone: string | null;
            cooperative_affiliation: string | null;
          } | null;
        }[]
      ).map(({ profiles, ...nomination }) => ({
        ...nomination,
        trainee_name: profiles?.full_name ?? null,
        trainee_phone: profiles?.phone ?? null,
        trainee_cooperative_affiliation: profiles?.cooperative_affiliation ?? null,
      })),
    );
  },
);

nominationsRouter.patch(
  "/programmes/:id/nominations/:nominationId",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const parsed = decideNominationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("nominations")
      .update({ status: parsed.data.status, decided_at: new Date().toISOString() })
      .eq("id", req.params.nominationId)
      .eq("programme_id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Nomination not found" });
      return;
    }
    res.json(data);
  },
);
