import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const certificatesRouter = Router();

// MUST stay registered before GET /certificates/:code below — Express matches
// in registration order, so the `:code` route would otherwise swallow "mine"
// as a certificate code and always 404.
//
// Uses supabaseAdmin rather than req.supabase (unlike the other own-row
// "/mine" routes) for one specific reason: `institutions` has RLS enabled
// with no policy at all, so the institutions(name) embed returns null under
// the caller's own client. Ownership is still enforced here, just in code —
// trainee_id always comes from req.user, never the request body, the same
// approach assessmentAttempts uses.
certificatesRouter.get(
  "/certificates/mine",
  requireAuth,
  requireRole("trainee"),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("certificates")
      .select("*, programmes(title), institutions(name)")
      .eq("trainee_id", req.user!.id)
      .order("issued_at", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json(
      (data ?? []).map((row) => {
        const { programmes, institutions, ...certificate } = row;
        const { data: publicUrl } = supabaseAdmin.storage
          .from("certificates")
          .getPublicUrl(certificate.pdf_storage_path);
        return {
          ...certificate,
          pdf_url: publicUrl.publicUrl,
          programme_title: programmes?.title ?? null,
          institution_name: institutions?.name ?? null,
        };
      }),
    );
  },
);

// Deliberately the one route in this API with no requireAuth — PRD §6.4
// explicitly requires "public, no-login certificate verification." Backed
// by the certificates_public_read RLS policy (see DATABASE.md), which
// already makes this table fully public; this route just exposes that
// lookup by the human-facing code instead of by row id, and derives a
// public URL for the PDF from the (also public) `certificates` bucket.
certificatesRouter.get("/certificates/:code", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("certificates")
    .select("*, profiles(full_name), programmes(title), institutions(name)")
    .eq("certificate_code", req.params.code)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Certificate not found" });
    return;
  }

  const { data: publicUrl } = supabaseAdmin.storage
    .from("certificates")
    .getPublicUrl(data.pdf_storage_path);

  const { profiles, programmes, institutions, ...certificate } = data;
  res.json({
    ...certificate,
    pdf_url: publicUrl.publicUrl,
    trainee_name: profiles?.full_name ?? null,
    programme_title: programmes?.title ?? null,
    institution_name: institutions?.name ?? null,
  });
});
