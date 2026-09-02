import { getProfileDetails, updateProfile } from "@ncct/api-client";
import type { Profile, Role } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface ProfileEditorProps {
  accessToken: string;
  role: Role;
}

// F1 — own-profile editing for every role (PRD §6.1). The employer org
// fields (`org_name`/`org_sector`) are only shown to employers, since they
// are meaningless for the other three roles even though they live on the
// same profiles row. Role itself is intentionally not editable here — the
// API strips it, and changing a role is an admin operation.
export function ProfileEditor({ accessToken, role }: ProfileEditorProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProfileDetails(accessToken)
      .then(setProfile)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      // Empty inputs clear the column rather than writing "" — the API
      // accepts null for the optional fields, and an empty string would
      // otherwise masquerade as a real value (the exact bug that made the
      // trainee header render blank).
      const text = (key: string) => String(form.get(key) ?? "").trim() || null;
      const updated = await updateProfile(accessToken, {
        full_name: String(form.get("full_name") ?? "").trim() || undefined,
        phone: text("phone"),
        cooperative_affiliation: text("cooperative_affiliation"),
        ...(role === "employer"
          ? { org_name: text("org_name"), org_sector: text("org_sector") }
          : {}),
      });
      setProfile(updated);
      setStatus("Profile saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return (
      <section className="attendance-panel">
        <h2>My profile</h2>
        {error && <p className="form-error">{error}</p>}
        {!error && <p>Loading…</p>}
      </section>
    );
  }

  return (
    <section className="attendance-panel">
      <h2>My profile</h2>
      {error && <p className="form-error">{error}</p>}
      {status && <p>{status}</p>}

      <form className="inline-form" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Full name
          <input type="text" name="full_name" defaultValue={profile.full_name ?? ""} required />
        </label>
        <label>
          Phone
          <input type="text" name="phone" defaultValue={profile.phone ?? ""} />
        </label>
        <label>
          Cooperative affiliation
          <input
            type="text"
            name="cooperative_affiliation"
            defaultValue={profile.cooperative_affiliation ?? ""}
          />
        </label>
        {role === "employer" && (
          <>
            <label>
              Organisation name
              <input type="text" name="org_name" defaultValue={profile.org_name ?? ""} />
            </label>
            <label>
              Organisation sector
              <input type="text" name="org_sector" defaultValue={profile.org_sector ?? ""} />
            </label>
          </>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
      <p>
        Signed in as <span className="role-badge">{profile.role}</span>
      </p>
    </section>
  );
}
