import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../supabaseClient.js";

export interface KioskDevice {
  id: string;
  name: string;
  current_session_id: string | null;
  is_active: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      kiosk?: KioskDevice;
    }
  }
}

export async function requireKioskAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey =
    (req.headers["x-kiosk-api-key"] as string | undefined) ??
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);

  if (!apiKey) {
    res.status(401).json({ error: "Missing kiosk authorization" });
    return;
  }

  const { data: kiosk, error } = await supabaseAdmin
    .from("kiosk_devices")
    .select("id, name, current_session_id, is_active")
    .eq("api_key", apiKey)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !kiosk) {
    res.status(401).json({ error: "Invalid or inactive kiosk device credentials" });
    return;
  }

  req.kiosk = kiosk as KioskDevice;
  next();
}
