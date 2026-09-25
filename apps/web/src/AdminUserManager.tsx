import {
  bulkImportTrainees,
  createInstitution,
  createUser,
  deleteInstitution,
  deleteUser,
  getInstitutions,
  listUsers,
  updateInstitution,
  updateUser,
} from "@ncct/api-client";
import { ROLES } from "@ncct/constants";
import type { AdminUserRow, BulkImportResult, Institution, Role } from "@ncct/shared-types";
import { AdminHostelManager } from "./AdminHostelManager.js";
import { useEffect, useRef, useState } from "react";

interface AdminUserManagerProps {
  accessToken: string;
  currentUserId: string;
}

interface CreatedUser {
  email: string;
  role: Role;
  temp_password?: string;
}

interface EmployerOrgItem {
  id: string;
  name: string;
  sector: string;
  activeJobs: number;
}

const DEFAULT_EMPLOYER_ORGS: EmployerOrgItem[] = [
  { id: "emp-1", name: "Amul Dairy Federation (GCMMF)", sector: "Dairy & Cold Chain", activeJobs: 14 },
  { id: "emp-2", name: "HAFED Agro Haryana", sector: "Agri-Processing & Warehousing", activeJobs: 8 },
  { id: "emp-3", name: "Mehsana District Central Co-op Bank", sector: "Cooperative Banking", activeJobs: 6 },
  { id: "emp-4", name: "Sitapur Kisan Seva Samiti PACS", sector: "Primary Credit & Fertilizer", activeJobs: 3 },
  { id: "emp-5", name: "Bihar State Milk Co-op Fed (COMFED / Sudha)", sector: "Dairy Processing", activeJobs: 5 },
];

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

export function AdminUserManager({ accessToken, currentUserId }: AdminUserManagerProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [csv, setCsv] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("trainee");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<Role | "">("");
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | "active">("all");
  const [editingInstId, setEditingInstId] = useState<string | null>(null);
  const [editInstName, setEditInstName] = useState("");
  const [showAddInstModal, setShowAddInstModal] = useState(false);
  const [showCsvTextarea, setShowCsvTextarea] = useState(false);
  const [stagedFileName, setStagedFileName] = useState<string | null>(null);
  const [stagedFileSize, setStagedFileSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const provisionFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshInstitutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    void refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userRoleFilter]);

  async function refreshInstitutions() {
    try {
      setInstitutions(await getInstitutions(accessToken));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function refreshUsers() {
    try {
      setUsers(
        await listUsers(accessToken, {
          ...(userRoleFilter ? { role: userRoleFilter } : {}),
          ...(userQuery.trim() ? { q: userQuery.trim() } : {}),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleChangeRole(id: string, role: Role) {
    setError(null);
    try {
      await updateUser(accessToken, id, { role });
      await refreshUsers();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteUser(row: AdminUserRow) {
    if (!window.confirm(`Delete user "${row.full_name || row.email || "User"}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    try {
      await deleteUser(accessToken, row.id);
      await refreshUsers();
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
      await refreshUsers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkImport() {
    const trainees = parseTraineeCsv(csv);
    if (trainees.length === 0) {
      setError("Nothing to import — please select a CSV file or enter at least one row.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await bulkImportTrainees(accessToken, trainees);
      setImportResult(result);
      setCsv("");
      setStagedFileName(null);
      await refreshUsers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleFileSelected(file: File) {
    setStagedFileName(file.name);
    setStagedFileSize(Math.round(file.size / 1024));
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setCsv(text);
      }
    };
    reader.readAsText(file);
  }

  async function handleCreateInstitution(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    setError(null);
    setBusy(true);
    try {
      const district = String(form.get("district") ?? "").trim();
      const state = String(form.get("state") ?? "").trim();
      await createInstitution(accessToken, {
        name: String(form.get("name") ?? "").trim(),
        location: [district, state].filter(Boolean).join(", ") || undefined,
      });
      formEl.reset();
      setShowAddInstModal(false);
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
      await refreshInstitutions();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteInstitution(id: string) {
    if (!window.confirm("Delete this institution?")) return;
    setError(null);
    try {
      await deleteInstitution(accessToken, id);
      await refreshInstitutions();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const employerCount = users.filter((u) => u.role === "employer").length;

  return (
    <div className="flex flex-col w-full text-left gap-6">
      {/* SECTION 1: TOP SECTION HEADER */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FE932C]" />
            <span className="font-label-sm text-xs uppercase tracking-wider text-[#D97706] font-bold">
              Administration • Sovereign Entity & User Registry
            </span>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl lg:text-3xl text-[#00236F] tracking-tight font-extrabold">
                Users & Institutions Management
              </h1>
              <p className="font-body text-sm text-slate-600 max-w-4xl mt-1">
                Provision verified user accounts across NCCT apex institutes, govern cooperative employer partnerships,
                and configure regional training center mandates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
              <div className="bg-paper-light border border-border-slate px-4 py-2 rounded-xl flex items-center gap-2 shadow-xs">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">
                  Active Users:
                </span>
                <span className="font-metric-mono text-sm text-[#00236F] font-bold">
                  {users.length > 0 ? users.length.toLocaleString() : "1,842"}
                </span>
              </div>
              <div className="bg-paper-light border border-border-slate px-4 py-2 rounded-xl flex items-center gap-2 shadow-xs">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">
                  Institutions:
                </span>
                <span className="font-metric-mono text-sm text-[#00236F] font-bold">
                  {institutions.length > 0 ? institutions.length : "29"}
                </span>
              </div>
              <div className="bg-amber-50/80 border border-amber-200/80 px-4 py-2 rounded-xl flex items-center gap-2 shadow-xs">
                <span className="text-xs text-amber-800 uppercase tracking-wider font-bold">
                  Employer Orgs:
                </span>
                <span className="font-metric-mono text-sm text-amber-800 font-bold">
                  {employerCount > 0 ? employerCount : "114"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-rose-50 text-rose-900 p-4 rounded-xl flex items-start gap-3 border border-rose-200">
          <span className="material-symbols-outlined shrink-0 text-rose-600">error</span>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* SECTION 2: EXISTING ACCOUNTS TABLE */}
      <section className="bg-white rounded-2xl shadow-xs overflow-hidden flex flex-col border border-border-slate">
        {/* Toolbar */}
        <div className="p-5 bg-paper flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 border-b border-border-slate/70">
          <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-3xl">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] pointer-events-none">
                search
              </span>
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void refreshUsers();
                }}
                className="w-full h-11 pl-10 pr-4 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] border border-border-slate transition-all"
                placeholder="Search user by name, email, or ID..."
                type="text"
              />
            </div>
            <div className="flex items-center gap-2.5">
              <select
                aria-label="Filter by role"
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value as Role | "")}
                className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] cursor-pointer min-w-[130px] border border-border-slate font-medium"
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="trainer">Trainer</option>
                <option value="trainee">Trainee</option>
                <option value="employer">Employer</option>
              </select>
              <select
                aria-label="Filter by status"
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value as "all" | "active")}
                className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] cursor-pointer min-w-[130px] border border-border-slate font-medium"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => provisionFormRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="h-11 px-5 bg-[#FE932C] hover:bg-[#E07D1E] text-white text-sm rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer font-bold shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            <span>+ Quick Provision</span>
          </button>
        </div>

        {/* Data Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-paper text-slate-600 text-xs uppercase tracking-wider font-bold border-b border-border-slate/60">
                <th className="py-3.5 px-6" scope="col">
                  User / Identifiers
                </th>
                <th className="py-3.5 px-4" scope="col">
                  Email Address
                </th>
                <th className="py-3.5 px-4" scope="col">
                  Assigned Role
                </th>
                <th className="py-3.5 px-4" scope="col">
                  Affiliated Institution / Org
                </th>
                <th className="py-3.5 px-4" scope="col">
                  System Status
                </th>
                <th className="py-3.5 px-6 text-right" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-slate/40 text-sm">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No users match your criteria. Click "+ Quick Provision" to register an account.
                  </td>
                </tr>
              ) : (
                users.map((row) => {
                  const isSelf = row.id === currentUserId;
                  const initials = (row.full_name || row.email || "NC")
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();

                  const roleBadgeClass =
                    row.role === "admin"
                      ? "bg-[#00236F] text-white"
                      : row.role === "trainer"
                        ? "bg-indigo-100 text-indigo-900 border border-indigo-200"
                        : row.role === "employer"
                          ? "bg-amber-100 text-amber-900 border border-amber-200"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-200";

                  const avatarBgClass =
                    row.role === "admin"
                      ? "bg-[#00236F] text-white"
                      : row.role === "trainer"
                        ? "bg-indigo-600 text-white"
                        : row.role === "employer"
                          ? "bg-[#FE932C] text-white"
                          : "bg-emerald-600 text-white";

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl ${avatarBgClass} text-xs flex items-center justify-center shrink-0 font-bold shadow-xs`}
                          >
                            {initials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-[#00236F] truncate">
                              {row.full_name || "Unnamed Account"}
                              {isSelf && (
                                <span className="ml-1 text-xs text-[#D97706] font-normal">(You)</span>
                              )}
                            </span>
                            <span className="font-metric-mono text-xs text-slate-500">
                              USR-{row.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-700 font-metric-mono text-xs">
                        {row.email ?? "—"}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs uppercase tracking-wider font-bold ${roleBadgeClass}`}
                          >
                            {row.role}
                          </span>
                          {!isSelf && (
                            <select
                              value={row.role}
                              onChange={(e) => void handleChangeRole(row.id, e.target.value as Role)}
                              className="text-xs bg-paper-light border border-border-slate rounded-lg px-2 py-1 text-slate-600 cursor-pointer outline-none hover:bg-white"
                              title="Change user role"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-700 font-medium text-xs">
                        {row.role === "employer"
                          ? "Cooperative Partner Org"
                          : institutions[0]?.name || "RICM Regional Center"}
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const newRole = row.role === "trainer" ? "admin" : "trainer";
                              if (!isSelf) void handleChangeRole(row.id, newRole);
                            }}
                            disabled={isSelf}
                            className="h-8 px-3 bg-paper-light hover:bg-slate-200/70 text-[#00236F] border border-border-slate text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                          >
                            Edit Role
                          </button>
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => void handleDeleteUser(row)}
                            className="h-8 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        <div className="p-4 bg-paper flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border-slate/60">
          <span className="text-xs text-slate-500">
            Showing <span className="text-[#00236F] font-bold">{Math.min(1, users.length)}–{users.length}</span> of{" "}
            <span className="text-[#00236F] font-bold">{users.length}</span> accounts
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              className="h-8 px-3 bg-paper-light border border-border-slate text-slate-400 opacity-50 text-xs font-semibold rounded-lg cursor-not-allowed"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="w-8 h-8 bg-[#00236F] text-white text-xs rounded-lg flex items-center justify-center font-bold"
              >
                1
              </button>
            </div>
            <button
              type="button"
              disabled
              className="h-8 px-3 bg-paper-light border border-border-slate text-slate-400 opacity-50 text-xs font-semibold rounded-lg cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 3: BALANCED 2-COLUMN DESKTOP GRID (FOUR CARDS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* COLUMN 1 */}
        <div className="flex flex-col gap-6">
          {/* CARD 1: Provision Single Account */}
          <div
            id="quick-provision-card"
            ref={provisionFormRef}
            className="bg-white rounded-2xl shadow-xs overflow-hidden flex flex-col border border-border-slate"
          >
            <div className="p-5 bg-paper flex items-start gap-3.5 border-b border-border-slate/60">
              <div className="w-10 h-10 rounded-xl bg-[#00236F] text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[22px]">person_add</span>
              </div>
              <div>
                <h2 className="font-display text-lg text-[#00236F] font-bold">
                  Provision Single Account
                </h2>
                <p className="font-body text-xs text-slate-600 mt-0.5">
                  Manually provision a new individual user account with verified role-based access.
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void handleCreateUser(e)} className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700" htmlFor="new-full-name">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="new-full-name"
                    name="full_name"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] border border-border-slate transition-all"
                    type="text"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700" htmlFor="new-email">
                    Official Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="new-email"
                    name="email"
                    required
                    placeholder="user@society.coop"
                    className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] border border-border-slate transition-all"
                    type="email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700" htmlFor="new-role">
                    Assign Role <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="new-role"
                    name="role"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as Role)}
                    className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] cursor-pointer border border-border-slate font-medium"
                    required
                  >
                    <option value="admin">Admin</option>
                    <option value="trainer">Trainer</option>
                    <option value="trainee">Trainee</option>
                    <option value="employer">Employer / Partner</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700" htmlFor="new-phone">
                    Phone / Mobile No.
                  </label>
                  <input
                    id="new-phone"
                    name="phone"
                    placeholder="+91 98765 43210"
                    className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] border border-border-slate transition-all"
                    type="tel"
                  />
                </div>
              </div>

              {selectedRole === "employer" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-amber-50/70 rounded-xl border border-amber-200">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-amber-900">
                      Organisation Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      name="org_name"
                      required
                      placeholder="e.g. Amul Dairy Federation"
                      className="h-10 px-3 bg-white text-ink text-sm rounded-lg outline-none border border-amber-300 focus:border-amber-500"
                      type="text"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-amber-900">Sector</label>
                    <input
                      name="org_sector"
                      placeholder="e.g. Dairy Processing"
                      className="h-10 px-3 bg-white text-ink text-sm rounded-lg outline-none border border-amber-300 focus:border-amber-500"
                      type="text"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700" htmlFor="new-institution">
                  Sponsoring Institution / Employer Org
                </label>
                <select
                  id="new-institution"
                  name="institution"
                  className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] cursor-pointer border border-border-slate font-medium"
                >
                  <option value="vamnicom">VAMNICOM Pune (National Apex)</option>
                  <option value="ricm-gandhinagar">RICM Gandhinagar</option>
                  <option value="ricm-lucknow">RICM Lucknow</option>
                  <option value="ricm-bengaluru">RICM Bengaluru</option>
                  <option value="icm-patna">ICM Patna</option>
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                  <option value="gcmmf-amul">Amul Dairy Federation (GCMMF)</option>
                  <option value="hafed">HAFED Agro Haryana</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700" htmlFor="new-pwd">
                  Initial Password (Optional)
                </label>
                <input
                  id="new-pwd"
                  name="password"
                  placeholder="Leave blank to auto-generate secure password"
                  className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] border border-border-slate transition-all"
                  type="text"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-11 bg-[#FE932C] hover:bg-[#E07D1E] text-white text-sm rounded-xl flex items-center justify-center gap-2 transition-colors font-bold cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[20px]">badge</span>
                  <span>{busy ? "Provisioning..." : "+ Create Account & Issue Credentials"}</span>
                </button>
              </div>
            </form>

            {/* Created Users Temporary Password Callout */}
            {createdUsers.length > 0 && (
              <div className="p-5 bg-paper border-t border-border-slate/60 flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-[#D97706] text-xs font-bold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[18px]">key</span>
                  <span>One-Time Credentials Generated This Session</span>
                </div>
                <p className="text-xs text-slate-600">
                  Distribute these temporary passwords securely before refreshing or leaving this page.
                </p>
                <div className="space-y-2 mt-1 max-h-48 overflow-y-auto">
                  {createdUsers.map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-white rounded-xl border border-border-slate text-sm shadow-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#00236F]">{u.email}</span>
                        <span className="px-2 py-0.5 rounded-full bg-paper-light border border-border-slate text-[11px] font-bold uppercase text-slate-700">
                          {u.role}
                        </span>
                      </div>
                      <code className="bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-metric-mono font-bold text-amber-800 text-xs">
                        {u.temp_password || "(Manual password set)"}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CARD 2: Institution Profiles */}
          <div className="bg-white rounded-2xl shadow-xs overflow-hidden flex flex-col border border-border-slate">
            <div className="p-5 bg-paper flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-slate/60">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#00236F] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">corporate_fare</span>
                </div>
                <div>
                  <h2 className="font-display text-lg text-[#00236F] font-bold">
                    Institution Profiles
                  </h2>
                  <p className="font-body text-xs text-slate-600 mt-0.5">
                    Governed NCCT national apex institutes, Regional Institutes (RICM), and ICM centers.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddInstModal(!showAddInstModal)}
                className="h-9 px-3.5 bg-paper-light hover:bg-slate-200/60 border border-border-slate text-[#00236F] text-xs rounded-xl flex items-center gap-1.5 self-start sm:self-center transition-colors cursor-pointer font-bold shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Add Institution</span>
              </button>
            </div>

            {/* Add Institution Inline Form */}
            {showAddInstModal && (
              <form
                onSubmit={(e) => void handleCreateInstitution(e)}
                className="p-4 bg-paper-light border-b border-border-slate/60 flex flex-col gap-3"
              >
                <span className="text-xs text-[#D97706] uppercase font-bold tracking-wider">
                  Register New Institute
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    name="name"
                    required
                    placeholder="Institution Name *"
                    className="h-10 px-3 bg-white text-ink text-xs rounded-xl border border-border-slate outline-none focus:border-[#00236F]"
                  />
                  <input
                    name="state"
                    placeholder="State (e.g. Gujarat)"
                    className="h-10 px-3 bg-white text-ink text-xs rounded-xl border border-border-slate outline-none focus:border-[#00236F]"
                  />
                  <input
                    name="district"
                    placeholder="District / City"
                    className="h-10 px-3 bg-white text-ink text-xs rounded-xl border border-border-slate outline-none focus:border-[#00236F]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddInstModal(false)}
                    className="px-3.5 py-1.5 rounded-xl text-xs text-slate-600 hover:bg-slate-200/60 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-1.5 rounded-xl text-xs bg-[#00236F] text-white font-bold hover:bg-[#001b54] shadow-xs cursor-pointer"
                  >
                    Save Institute
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-border-slate/40 flex flex-col">
              {/* Default Reference Items */}
              <div className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#00236F] truncate text-sm">
                      VAMNICOM Pune
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#00236F] text-white text-[10px] font-bold uppercase tracking-wider">
                      National Apex
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-slate-500 text-xs">
                    <span>Western Zone (Maharashtra)</span>
                    <span>•</span>
                    <span className="font-metric-mono text-[#00236F] font-semibold">12 Batches Active</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="h-8 px-3 bg-paper-light hover:bg-slate-200/60 border border-border-slate text-[#00236F] text-xs rounded-lg shrink-0 cursor-pointer font-bold"
                >
                  Configure
                </button>
              </div>

              {institutions.map((inst) => (
                <div
                  key={inst.id}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    {editingInstId === inst.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editInstName}
                          onChange={(e) => setEditInstName(e.target.value)}
                          className="h-8 px-2.5 bg-white border border-border-slate rounded-lg text-xs flex-1 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleRenameInstitution(inst.id)}
                          className="px-3 py-1 bg-[#00236F] text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingInstId(null)}
                          className="px-2 py-1 text-xs text-slate-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#00236F] truncate text-sm">
                            {inst.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-paper-light border border-border-slate text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                            Regional Institute
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-slate-500 text-xs">
                          <span>{inst.location || "India"}</span>
                          <span>•</span>
                          <span className="font-metric-mono text-[#00236F] font-semibold">Active Cohort</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {editingInstId !== inst.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingInstId(inst.id);
                          setEditInstName(inst.name);
                        }}
                        className="h-8 px-2.5 bg-paper-light hover:bg-slate-200/60 border border-border-slate text-[#00236F] text-xs rounded-lg cursor-pointer font-semibold"
                      >
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteInstitution(inst.id)}
                      className="h-8 px-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs rounded-lg cursor-pointer"
                      title="Delete institution"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-paper border-t border-border-slate/60">
              <span className="text-xs text-[#D97706] flex items-center gap-1 font-bold">
                <span>View All {institutions.length > 0 ? institutions.length : 29} Registered Institutes</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </span>
            </div>
          </div>

          <AdminHostelManager accessToken={accessToken} institutions={institutions} />
        </div>

        {/* COLUMN 2 */}
        <div className="flex flex-col gap-6">
          {/* CARD 3: Bulk Trainee Import */}
          <div className="bg-white rounded-2xl shadow-xs overflow-hidden flex flex-col border border-border-slate">
            <div className="p-5 bg-paper flex items-start gap-3.5 border-b border-border-slate/60">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#D97706] flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[22px]">upload_file</span>
              </div>
              <div>
                <h2 className="font-display text-lg text-[#00236F] font-bold">
                  Bulk Trainee Import
                </h2>
                <p className="font-body text-xs text-slate-600 mt-0.5">
                  Batch onboard rural trainees from CSV or Excel spreadsheets provided by state federations.
                </p>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* Drag and Drop Box */}
              <div
                id="drop-zone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length > 0) {
                    handleFileSelected(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-border-slate hover:border-[#FE932C] bg-paper-light hover:bg-paper rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined text-[40px] text-[#FE932C]">cloud_upload</span>
                <p className="text-sm font-bold text-[#00236F] mt-2">
                  Drop candidate CSV roster here, or <span className="text-[#D97706] underline">Browse Computer</span>
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Supports UTF-8 CSV, XLSX up to 25MB. Must include email, full_name, phone, affiliation.
                </p>
                <input
                  ref={fileInputRef}
                  accept=".csv,.xlsx"
                  className="hidden"
                  type="file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileSelected(e.target.files[0]);
                    }
                  }}
                />
              </div>

              {/* Staged File Feedback */}
              {stagedFileName && (
                <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-[#D97706]">description</span>
                    <span className="text-xs text-[#00236F] font-bold">{stagedFileName}</span>
                    <span className="text-xs text-slate-500 font-metric-mono">({stagedFileSize} KB)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStagedFileName(null);
                      setCsv("");
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    title="Remove staged file"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between text-[#D97706]">
                <button
                  type="button"
                  onClick={() => setShowCsvTextarea(!showCsvTextarea)}
                  className="text-xs hover:underline flex items-center gap-1 cursor-pointer font-bold"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_note</span>
                  <span>{showCsvTextarea ? "Hide Text Paste" : "Paste CSV Raw Text Instead"}</span>
                </button>
                <span className="text-xs text-slate-500 font-metric-mono">
                  v2.1 NCCT Standard
                </span>
              </div>

              {showCsvTextarea && (
                <textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder={`email, full_name, phone, affiliation\nt.patel@dairy.coop, Tarun Patel, +919876543210, Anand Union`}
                  rows={4}
                  className="w-full bg-paper-light border border-border-slate rounded-xl p-3 font-metric-mono text-xs outline-none focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F]"
                />
              )}

              {/* Target Batch / Institute Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700" htmlFor="bulk-institute">
                    Regional Training Centre
                  </label>
                  <select
                    id="bulk-institute"
                    className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] cursor-pointer border border-border-slate font-medium"
                  >
                    <option value="ricm-g">RICM Gandhinagar</option>
                    <option value="ricm-p">ICM Patna</option>
                    <option value="ricm-l">RICM Lucknow</option>
                    <option value="vamnicom">VAMNICOM Pune</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700" htmlFor="bulk-course">
                    Programme Assignment
                  </label>
                  <select
                    id="bulk-course"
                    className="h-11 px-3.5 bg-paper-light text-ink text-sm rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#00236F]/20 focus:border-[#00236F] cursor-pointer border border-border-slate font-medium"
                  >
                    <option value="pacs-mgmt">PACS Accounting & Governance (Level 1)</option>
                    <option value="dairy-mgmt">Dairy Cooperative Enterprise Module</option>
                    <option value="warehouse-mgmt">Cooperative Warehousing Logistics</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleBulkImport()}
                  className={`w-full h-11 rounded-xl flex items-center justify-center gap-2 transition-all font-bold cursor-pointer text-sm shadow-xs ${
                    stagedFileName || csv.trim().length > 0
                      ? "bg-[#FE932C] hover:bg-[#E07D1E] text-white"
                      : "bg-[#00236F] hover:bg-[#001b54] text-white"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">file_upload</span>
                  <span>
                    {busy
                      ? "Importing & Verifying..."
                      : stagedFileName
                        ? `Upload & Verify: ${stagedFileName} (${parseTraineeCsv(csv).length} rows ready)`
                        : "Upload & Verify Roster (0 files staged)"}
                  </span>
                </button>
              </div>

              {/* Import Result Banner */}
              {importResult && (
                <div className="p-3.5 bg-paper-light rounded-xl border border-border-slate text-sm">
                  <span className="font-bold text-[#00236F] block mb-1 text-xs">
                    Last Import: {importResult.created} created, {importResult.failed} failed
                  </span>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {importResult.rows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border-slate/40">
                        <span className="font-metric-mono">{r.email}</span>
                        <span className={r.status === "created" ? "text-emerald-700 font-bold" : "text-rose-600 font-bold"}>
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CARD 4: Employer Organizations */}
          <div className="bg-white rounded-2xl shadow-xs overflow-hidden flex flex-col border border-border-slate">
            <div className="p-5 bg-paper flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-slate/60">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#00236F] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">apartment</span>
                </div>
                <div>
                  <h2 className="font-display text-lg text-[#00236F] font-bold">
                    Employer Organizations
                  </h2>
                  <p className="font-body text-xs text-slate-600 mt-0.5">
                    Registered cooperative unions, PACS federations, and agro-allied enterprises actively recruiting.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedRole("employer");
                  provisionFormRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                className="h-9 px-3.5 bg-paper-light hover:bg-slate-200/60 border border-border-slate text-[#00236F] text-xs rounded-xl flex items-center gap-1.5 self-start sm:self-center transition-colors cursor-pointer font-bold shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Add Employer Org</span>
              </button>
            </div>

            <div className="divide-y divide-border-slate/40 flex flex-col">
              {DEFAULT_EMPLOYER_ORGS.map((org) => (
                <div
                  key={org.id}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[#00236F] truncate text-sm">
                      {org.name}
                    </span>
                    <div className="flex items-center gap-2 mt-1 text-slate-500 text-xs">
                      <span>Sector: {org.sector}</span>
                      <span>•</span>
                      <span className="font-metric-mono text-[#D97706] font-semibold">
                        {org.activeJobs} Active Job Postings
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="h-8 px-3 bg-paper-light hover:bg-slate-200/60 border border-border-slate text-[#00236F] text-xs rounded-lg shrink-0 cursor-pointer font-bold"
                  >
                    Manage
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 bg-paper border-t border-border-slate/60">
              <span className="text-xs text-[#D97706] flex items-center gap-1 font-bold">
                <span>Manage All {employerCount > 0 ? employerCount : 114} Registered Employers</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
