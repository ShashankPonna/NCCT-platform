import { bulkImportTraineesSchema, createUserSchema } from "@ncct/validation";
import { Router } from "express";
import { randomBytes } from "node:crypto";
import type { BulkImportRow } from "@ncct/shared-types";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";

export const usersRouter = Router();

// Admin account provisioning (PRD §6.1). Creating an auth user is inherently
// a service-role operation, so everything here goes through supabaseAdmin —
// but note the role is always taken from the validated body by an
// admin-gated route, never from anything a prospective user supplies about
// themselves.
//
// Password handling, stated plainly rather than glossed: when no password is
// supplied the API generates a temporary one and RETURNS it, so an admin can
// hand credentials to trainees who often have no working email address (the
// PRD's rural intake context). That is a deliberate prototype-grade choice —
// a production deployment should switch to Supabase's invite/magic-link flow
// so a password never transits the API at all. The generated value is random
// per user and never logged.
function generateTempPassword(): string {
  // Suffix guarantees the mixed-case/digit/symbol shape Supabase's default
  // password policy expects, regardless of what base64url produced.
  return `${randomBytes(15).toString("base64url")}aA1!`;
}

// The signup trigger (`handle_new_user`) creates the profiles row from user
// metadata, but only copies role/full_name. Anything else the admin supplied
// has to be written directly afterwards.
async function applyExtraProfileFields(
  userId: string,
  fields: Record<string, string | undefined>,
): Promise<void> {
  const extras = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(extras).length === 0) return;
  await supabaseAdmin.from("profiles").update(extras).eq("id", userId);
}

usersRouter.post("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, role, full_name, password, ...profileFields } = parsed.data;
  const tempPassword = password ?? generateTempPassword();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role, full_name },
  });

  if (error || !data.user) {
    // Supabase reports an existing address as a 422-ish error; surface it as
    // a 409 so a client can distinguish "already exists" from "bad input".
    const alreadyExists = /already|exists|registered/i.test(error?.message ?? "");
    res.status(alreadyExists ? 409 : 400).json({ error: error?.message ?? "Could not create user" });
    return;
  }

  await applyExtraProfileFields(data.user.id, profileFields);

  res.status(201).json({
    id: data.user.id,
    email,
    role,
    full_name,
    // Only echoed back when the API generated it — never when the admin
    // chose the password themselves.
    ...(password ? {} : { temp_password: tempPassword }),
  });
});

// Bulk trainee import (PRD §6.1). Partial success is the norm for a
// spreadsheet paste — a couple of duplicate or malformed addresses shouldn't
// discard the other 198 — so this always returns 200 with a per-row outcome
// rather than failing the whole request on the first bad row.
usersRouter.post("/users/bulk-trainees", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = bulkImportTraineesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const rows: BulkImportRow[] = [];

  for (const trainee of parsed.data.trainees) {
    const tempPassword = generateTempPassword();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: trainee.email,
      password: tempPassword,
      email_confirm: true,
      // Role is hardcoded, not read from the row — see the schema comment.
      user_metadata: { role: "trainee", full_name: trainee.full_name },
    });

    if (error || !data.user) {
      const alreadyExists = /already|exists|registered/i.test(error?.message ?? "");
      rows.push({
        email: trainee.email,
        status: alreadyExists ? "skipped" : "failed",
        reason: error?.message ?? "Could not create user",
      });
      continue;
    }

    await applyExtraProfileFields(data.user.id, {
      phone: trainee.phone,
      cooperative_affiliation: trainee.cooperative_affiliation,
    });

    rows.push({
      email: trainee.email,
      status: "created",
      user_id: data.user.id,
      temp_password: tempPassword,
    });
  }

  res.json({
    created: rows.filter((r) => r.status === "created").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    failed: rows.filter((r) => r.status === "failed").length,
    rows,
  });
});
