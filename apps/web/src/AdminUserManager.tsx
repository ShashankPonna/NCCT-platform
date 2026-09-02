import {
  bulkImportTrainees,
  createInstitution,
  createUser,
  deleteInstitution,
  getInstitutions,
  updateInstitution,
} from "@ncct/api-client";
import { ROLES } from "@ncct/constants";
import type { BulkImportResult, Institution, Role } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface AdminUserManagerProps {
  accessToken: string;
}

interface CreatedUser {
  email: string;
  role: Role;
  temp_password?: string;
}

// Parses the pasted CSV client-side so the API can stay JSON-only and the
// repo avoids a CSV-parsing dependency for one screen. Accepts an optional
// header row and ignores blank lines.
function parseTraineeCsv(text: string) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));

  const startsWithHeader = rows[0]?.[0]?.toLowerCase() === "email";
  return rows.slice(startsWithHeader ? 1 : 0).map(([email, full_name, phone, affiliation]) => ({
    email: email ?? "",
    full_name: full_name ?? "",
    ...(phone ? { phone } : {}),
    ...(affiliation ? { cooperative_affiliation: affiliation } : {}),
  }));
}

// F1's admin surface (PRD §6.1): account provisioning for all four roles,
// bulk trainee intake, and institution profile CRUD.
export function AdminUserManager({ accessToken }: AdminUserManagerProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshInstitutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function refreshInstitutions() {
    try {
      setInstitutions(await getInstitutions(accessToken));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    const role = String(form.get("role") ?? "trainee") as Role;
    setError(null);
    setBusy(true);
    try {
      const created = await createUser(accessToken, {
        email: String(form.get("email") ?? ""),
        role,
        full_name: String(form.get("full_name") ?? ""),
        password: String(form.get("password") ?? "") || undefined,
        ...(role === "employer"
          ? {
              org_name: String(form.get("org_name") ?? "") || undefined,
              org_sector: String(form.get("org_sector") ?? "") || undefined,
            }
          : {}),
      });
      setCreatedUsers((prev) => [
        { email: created.email, role: created.role, temp_password: created.temp_password },
        ...prev,
      ]);
      formEl.reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkImport() {
    const trainees = parseTraineeCsv(csv);
    if (trainees.length === 0) {
      setError("Nothing to import — paste at least one row.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      setImportResult(await bulkImportTrainees(accessToken, trainees));
      setCsv("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateInstitution(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    setError(null);
    try {
      await createInstitution(accessToken, {
        name: String(form.get("name") ?? ""),
        type: String(form.get("type") ?? "") || undefined,
        location: String(form.get("location") ?? "") || undefined,
      });
      formEl.reset();
      await refreshInstitutions();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRenameInstitution(institution: Institution) {
    const name = window.prompt("Institution name", institution.name);
    if (!name || name === institution.name) return;
    setError(null);
    try {
      await updateInstitution(accessToken, institution.id, { name });
      await refreshInstitutions();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteInstitution(institution: Institution) {
    if (!window.confirm(`Delete "${institution.name}"?`)) return;
    setError(null);
    try {
      await deleteInstitution(accessToken, institution.id);
      await refreshInstitutions();
    } catch (err) {
      // The API refuses (409) when programmes still reference it, rather
      // than cascading a whole training history away — surface that reason.
      setError((err as Error).message);
    }
  }

  return (
    <section className="attendance-panel">
      <h2>Users &amp; institutions</h2>
      {error && <p className="form-error">{error}</p>}

      <h3>Create an account</h3>
      <form className="inline-form" onSubmit={(e) => void handleCreateUser(e)}>
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Full name
          <input type="text" name="full_name" required />
        </label>
        <label>
          Role
          <select name="role" defaultValue="trainee">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          Password (optional)
          <input type="text" name="password" placeholder="leave blank to generate" />
        </label>
        <label>
          Org name (employers)
          <input type="text" name="org_name" />
        </label>
        <label>
          Org sector (employers)
          <input type="text" name="org_sector" />
        </label>
        <button type="submit" disabled={busy}>
          Create account
        </button>
      </form>

      {createdUsers.length > 0 && (
        <>
          <h4>Created this session</h4>
          <p>
            Temporary passwords are shown once, here, and are not stored or retrievable later —
            copy them before leaving this page.
          </p>
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Temporary password</th>
              </tr>
            </thead>
            <tbody>
              {createdUsers.map((u) => (
                <tr key={u.email}>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <code>{u.temp_password ?? "(set by you)"}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Bulk trainee import</h3>
      <p>
        One trainee per line: <code>email, full name, phone, cooperative affiliation</code>. Phone
        and affiliation are optional; a header row starting with &quot;email&quot; is ignored.
        Maximum 200 rows per import.
      </p>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={6}
        placeholder={"email,full_name,phone,cooperative_affiliation\nasha@example.com,Asha Patil,9990001111,Pune Dairy PACS"}
      />
      <button type="button" onClick={() => void handleBulkImport()} disabled={busy || !csv.trim()}>
        {busy ? "Importing…" : "Import trainees"}
      </button>

      {importResult && (
        <>
          <h4>
            Import result — {importResult.created} created, {importResult.skipped} skipped,{" "}
            {importResult.failed} failed
          </h4>
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Temporary password / reason</th>
              </tr>
            </thead>
            <tbody>
              {importResult.rows.map((row) => (
                <tr key={row.email}>
                  <td>{row.email}</td>
                  <td>{row.status}</td>
                  <td>
                    <code>{row.temp_password ?? row.reason ?? ""}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Institutions</h3>
      <form className="inline-form" onSubmit={(e) => void handleCreateInstitution(e)}>
        <label>
          Name
          <input type="text" name="name" required />
        </label>
        <label>
          Type
          <input type="text" name="type" placeholder="e.g. RICM" />
        </label>
        <label>
          Location
          <input type="text" name="location" />
        </label>
        <button type="submit">Add institution</button>
      </form>

      {institutions.length === 0 ? (
        <p>No institutions yet.</p>
      ) : (
        <ul>
          {institutions.map((institution) => (
            <li key={institution.id}>
              {institution.name}
              {institution.location ? ` — ${institution.location}` : ""}{" "}
              <button type="button" onClick={() => void handleRenameInstitution(institution)}>
                Rename
              </button>{" "}
              <button type="button" onClick={() => void handleDeleteInstitution(institution)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
