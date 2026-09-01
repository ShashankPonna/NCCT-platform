import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";
import type { Role } from "@ncct/shared-types";
import { getSupabaseForUser, supabaseAdmin } from "../supabaseClient.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
      supabase?: SupabaseClient;
    }
  }
}

/**
 * Verifies the Supabase JWT on the Authorization header, looks up the
 * caller's role, and attaches `req.user` plus a request-scoped Supabase
 * client (`req.supabase`) that authenticates as that user so RLS applies.
 * See docs/DECISIONS.md #9 for why this exists instead of always using the
 * service-role client.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) {
    res.status(401).json({ error: "No profile found for authenticated user" });
    return;
  }

  req.user = { id: authData.user.id, role: profile.role as Role };
  req.supabase = getSupabaseForUser(token);
  next();
}

/**
 * Role-check middleware factory. Must run after requireAuth. Enforces the
 * role check in Express in addition to Postgres RLS (defense in depth, see
 * CLAUDE.md Security Rules), not as a substitute for it.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
}
