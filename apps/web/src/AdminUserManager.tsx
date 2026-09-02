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

export function AdminUserManager({ accessToken }: AdminUserManagerProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [csv, setCsv] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("trainee");
  const [editingInstId, setEditingInstId] = useState<string | null>(null);
  const [editInstName, setEditInstName] = useState("");
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
    const role = (form.get("role") ?? "trainee") as Role;
    setError(null);
    setBusy(true);
    try {
      const created = await createUser(accessToken, {
        email: String(form.get("email") ?? "").trim(),
        role,
        full_name: String(form.get("full_name") ?? "").trim(),
        password: String(form.get("password") ?? "").trim() || undefined,
        ...(role === "employer"
          ? {
              org_name: String(form.get("org_name") ?? "").trim() || undefined,
              org_sector: String(form.get("org_sector") ?? "").trim() || undefined,
            }
          : {}),
      });
      setCreatedUsers((prev) => [
        { email: created.email, role: created.role, temp_password: created.temp_password },
        ...prev,
      ]);
      formEl.reset();
      setSelectedRole("trainee");
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
      const result = await bulkImportTrainees(accessToken, trainees);
      setImportResult(result);
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
    setBusy(true);
    try {
      // The backend only stores a single free-text `location` field (no
      // separate state/district columns) — the two inputs stay, for a more
      // structured entry experience, and get combined here rather than
      // silently dropped.
      const district = String(form.get("district") ?? "").trim();
      const state = String(form.get("state") ?? "").trim();
      await createInstitution(accessToken, {
        name: String(form.get("name") ?? "").trim(),
        location: [district, state].filter(Boolean).join(", ") || undefined,
      });
      formEl.reset();
      await refreshInstitutions();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameInstitution(id: string) {
    if (!editInstName.trim()) return;
    setError(null);
    try {
      await updateInstitution(accessToken, id, { name: editInstName.trim() });
      setEditingInstId(null);
      setEditInstName("");
      await refreshInstitutions();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteInstitution(id: string) {
    setError(null);
    try {
      await deleteInstitution(accessToken, id);
      await refreshInstitutions();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const parsedRowCount = parseTraineeCsv(csv).length;

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-8 text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant pb-4">
        <div>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface m-0">
            Users &amp; Institutions Management
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-2xl">
            Provision new accounts, manage organizational entities, and handle bulk operations for the NCCT platform.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-start gap-3 border border-error/20">
          <span className="material-symbols-outlined shrink-0 text-error">error</span>
          <p className="font-body-md text-body-md font-medium">{error}</p>
        </div>
      )}

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter">
        {/* Block 1: Account Creation & Session Overview (Spans 7 cols) */}
        <div className="xl:col-span-7 flex flex-col gap-gutter">
          {/* Create Account Form Card */}
          <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-container/5 rounded-bl-full pointer-events-none" />
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">person_add</span>
              Provision Single Account
            </h3>
            <form onSubmit={(e) => void handleCreateUser(e)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="font-label-md text-label-md text-on-surface">Full Name *</label>
                <input
                  name="full_name"
                  required
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  placeholder="e.g. Jane Doe"
                  type="text"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface">Email Address *</label>
                <input
                  name="email"
                  required
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  placeholder="jane@example.com"
                  type="email"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface">System Role</label>
                <select
                  name="role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r === "employer" ? "Employer / Partner" : r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conditional Employer Fields */}
              {selectedRole === "employer" && (
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-container/30 p-4 rounded-lg border border-outline-variant/50">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-on-surface">Organisation Name</label>
                    <input
                      name="org_name"
                      className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary outline-none"
                      placeholder="Company Ltd"
                      type="text"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-on-surface">Sector</label>
                    <input
                      name="org_sector"
                      className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary outline-none"
                      placeholder="e.g. Agriculture / Tech"
                      type="text"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="font-label-md text-label-md text-on-surface">Initial Password</label>
                <input
                  name="password"
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  placeholder="Leave blank to auto-generate secure password"
                  type="text"
                />
              </div>

              <div className="md:col-span-2 flex justify-end mt-2">
                <button
                  disabled={busy}
                  type="submit"
                  className="bg-cta text-on-primary hover:bg-cta-hover transition-colors rounded-full px-6 h-[44px] font-label-md text-label-md inline-flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  {busy ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>

          {/* Session Activity Table */}
          {createdUsers.length > 0 && (
            <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
              <div className="flex items-start justify-between mb-4 bg-status-pending/10 p-3 rounded-lg border border-status-pending/20">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-status-pending">history</span>
                    Created This Session
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Warning: Temporary passwords are only visible here once. Please distribute them securely before closing this page.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-outline-variant/50">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant/50">
                      <th className="p-3 font-label-md text-label-md text-on-surface-variant uppercase">Email</th>
                      <th className="p-3 font-label-md text-label-md text-on-surface-variant uppercase">Role</th>
                      <th className="p-3 font-label-md text-label-md text-on-surface-variant uppercase">Temp Password</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm text-body-sm text-on-surface divide-y divide-outline-variant/30">
                    {createdUsers.map((u, i) => (
                      <tr key={i} className="hover:bg-surface-bright transition-colors">
                        <td className="p-3 font-medium">{u.email}</td>
                        <td className="p-3">
                          <span className="bg-primary-container/10 text-primary-container border border-primary-container/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3">
                          {u.temp_password ? (
                            <code className="bg-surface-container font-mono px-2 py-1 rounded text-primary">
                              {u.temp_password}
                            </code>
                          ) : (
                            <span className="text-outline text-xs">(Manual password provided)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Block 2: Bulk Import & Institutions (Spans 5 cols) */}
        <div className="xl:col-span-5 flex flex-col gap-gutter">
          {/* Bulk Import Card */}
          <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">group_add</span>
              Bulk Trainee Import
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
              Paste comma-separated values. Format:{" "}
              <code className="bg-surface-container px-1.5 py-0.5 rounded text-xs">
                email, full_name, phone, affiliation
              </code>
            </p>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={`t.kelly@example.com, Tom Kelly, +919876543210, Dairy Coop\ns.jones@example.com, Sarah Jones, , Farm Union`}
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-32 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none mb-4"
            />
            <div className="flex items-center justify-between mb-4">
              <span className="font-label-md text-label-md text-on-surface-variant">
                Ready to import: {parsedRowCount} rows
              </span>
              <button
                type="button"
                disabled={busy || parsedRowCount === 0}
                onClick={() => void handleBulkImport()}
                className={`rounded-full px-6 h-[44px] font-label-md text-label-md inline-flex items-center gap-2 transition-colors ${
                  parsedRowCount > 0
                    ? "bg-cta text-on-primary hover:bg-cta-hover cursor-pointer"
                    : "bg-surface-variant text-outline cursor-not-allowed"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">upload</span>
                {busy ? "Importing..." : "Import Trainees"}
              </button>
            </div>

            {/* Import Summary State */}
            {importResult && (
              <div className="mt-4 pt-4 border-t border-outline-variant/30">
                <h4 className="font-label-md text-label-md text-on-surface mb-2">
                  Last Import Summary ({importResult.created} created, {importResult.failed} failed
                  {importResult.skipped > 0 && `, ${importResult.skipped} skipped`})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {importResult.rows
                    .filter((r) => r.status === "created")
                    .map((r) => (
                      <div
                        key={r.email}
                        className="flex items-center justify-between p-2 bg-surface-bright rounded border border-outline-variant/20 text-xs"
                      >
                        <span className="font-body-sm font-medium">{r.email}</span>
                        <div className="flex items-center gap-2">
                          <span className="bg-status-success/15 text-status-success px-2 py-0.5 rounded-full font-label-sm uppercase">
                            Success
                          </span>
                          {r.temp_password && (
                            <code className="bg-surface-container font-mono px-1.5 py-0.5 rounded">
                              {r.temp_password}
                            </code>
                          )}
                        </div>
                      </div>
                    ))}
                  {importResult.rows
                    .filter((r) => r.status === "failed" || r.status === "skipped")
                    .map((r) => (
                      <div
                        key={r.email}
                        className="flex items-center justify-between p-2 bg-surface-bright rounded border border-outline-variant/20 text-xs"
                      >
                        <span className="font-body-sm">{r.email}</span>
                        <div className="flex items-center gap-2">
                          <span className="bg-error-container text-on-error-container px-2 py-0.5 rounded-full font-label-sm uppercase">
                            {r.status === "failed" ? "Failed" : "Skipped"}
                          </span>
                          <span className="text-error text-xs max-w-[120px] truncate" title={r.reason}>
                            {r.reason}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Institutions Management */}
          <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">account_balance</span>
              Institutions ({institutions.length})
            </h3>

            {/* Compact Create Form */}
            <form
              onSubmit={(e) => void handleCreateInstitution(e)}
              className="bg-surface-container-low p-4 rounded-lg border border-outline-variant/50 mb-6 flex flex-col gap-3"
            >
              <h4 className="font-label-md text-label-md text-on-surface uppercase tracking-wider">Register New</h4>
              <input
                name="name"
                required
                className="bg-surface-container-lowest border border-outline-variant rounded-lg p-2 h-[38px] font-body-sm text-body-sm w-full"
                placeholder="Institution Name *"
                type="text"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  name="state"
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-2 h-[36px] font-body-sm text-body-sm"
                  placeholder="State"
                  type="text"
                />
                <input
                  name="district"
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-2 h-[36px] font-body-sm text-body-sm"
                  placeholder="District"
                  type="text"
                />
              </div>
              <div className="flex justify-end">
                <button
                  disabled={busy}
                  type="submit"
                  className="bg-primary text-on-primary hover:bg-primary/90 rounded-lg px-4 font-label-md text-label-md h-[36px]"
                >
                  Add Institution
                </button>
              </div>
            </form>

            {/* Existing List */}
            <h4 className="font-label-md text-label-md text-on-surface mb-3 uppercase tracking-wider">Directory</h4>
            {institutions.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant">No institutions registered yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 overflow-y-auto max-h-[300px] pr-1">
                {institutions.map((inst) => (
                  <li
                    key={inst.id}
                    className="flex items-center justify-between p-3 bg-surface-bright hover:bg-surface-container transition-colors rounded-lg border border-outline-variant/30 group"
                  >
                    {editingInstId === inst.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          value={editInstName}
                          onChange={(e) => setEditInstName(e.target.value)}
                          className="bg-surface-container-lowest border border-outline-variant rounded p-1 text-sm flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => void handleRenameInstitution(inst.id)}
                          className="text-xs bg-status-success/20 text-status-success font-bold px-2 py-1 rounded"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingInstId(null)}
                          className="text-xs text-outline px-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="font-body-sm text-body-sm font-medium text-on-surface">{inst.name}</p>
                        <p className="font-label-sm text-label-sm text-on-surface-variant">
                          {inst.location || "India"}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-1 shrink-0">
                      {editingInstId !== inst.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingInstId(inst.id);
                            setEditInstName(inst.name);
                          }}
                          className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors"
                          title="Rename"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteInstitution(inst.id)}
                        className="w-8 h-8 rounded flex items-center justify-center text-error hover:bg-error-container transition-colors"
                        title="Delete"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
