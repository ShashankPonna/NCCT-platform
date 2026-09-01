import { Router } from "express";
import { supabaseAdmin } from "../supabaseClient.js";

export const certificatesRouter = Router();

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
