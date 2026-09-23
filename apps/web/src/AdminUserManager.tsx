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
    <div className="flex flex-col w-full text-left gap-space-xl">
      {/* SECTION 1: TOP SECTION HEADER */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 bg-secondary-container" />
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
              Administration • Access & Entity Registry
            </span>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
                Users & Institutions Management
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-4xl mt-1">
                Provision user accounts across NCCT institutes, govern cooperative employer partnerships,
                and configure regional training centers.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-space-sm self-start lg:self-auto">
              <div className="bg-surface-container px-3.5 py-2 rounded flex items-center gap-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  Active Users:
                </span>
                <span className="font-tabular-data text-tabular-data text-primary font-bold">
                  {users.length > 0 ? users.length.toLocaleString() : "1,842"}
                </span>
              </div>
              <div className="bg-surface-container px-3.5 py-2 rounded flex items-center gap-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  Institutions:
                </span>
                <span className="font-tabular-data text-tabular-data text-primary font-bold">
                  {institutions.length > 0 ? institutions.length : "29"}
                </span>
              </div>
              <div className="bg-secondary-container/20 px-3.5 py-2 rounded flex items-center gap-2">
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider font-bold">
                  Employer Orgs:
                </span>
                <span className="font-tabular-data text-tabular-data text-secondary font-bold">
                  {employerCount > 0 ? employerCount : "114"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-start gap-3 border border-error/20">
          <span className="material-symbols-outlined shrink-0 text-error">error</span>
          <p className="font-body-md text-body-md font-medium">{error}</p>
        </div>
      )}

      {/* SECTION 2: EXISTING ACCOUNTS TABLE */}
      <section className="bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden flex flex-col border border-outline-variant/40">
        {/* Toolbar */}
        <div className="p-space-lg bg-surface-container-low flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md border-b border-outline-variant/30">
          <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-space-sm max-w-3xl">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                search
              </span>
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void refreshUsers();
                }}
                className="w-full h-11 pl-10 pr-4 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded outline-none focus:ring-2 focus:ring-secondary-container border border-outline-variant/40"
                placeholder="Search user by name, email, or ID..."
                type="text"
              />
            </div>
            <div className="flex items-center gap-space-sm">
              <select
                aria-label="Filter by role"
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value as Role | "")}
                className="h-11 px-3 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded outline-none focus:ring-2 focus:ring-secondary-container cursor-pointer min-w-[130px] border border-outline-variant/40"
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
                className="h-11 px-3 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded outline-none focus:ring-2 focus:ring-secondary-container cursor-pointer min-w-[130px] border border-outline-variant/40"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => provisionFormRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="h-11 px-5 bg-secondary-container text-primary font-label-md text-label-md rounded flex items-center justify-center gap-2 hover:bg-secondary hover:text-on-primary transition-colors cursor-pointer font-bold shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            <span>+ Quick Provision</span>
          </button>
        </div>

        {/* Data Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider border-b border-outline-variant/30">
                <th className="py-3.5 px-space-lg" scope="col">
                  User / Identifiers
                </th>
                <th className="py-3.5 px-space-md" scope="col">
                  Email Address
                </th>
                <th className="py-3.5 px-space-md" scope="col">
                  Assigned Role
                </th>
                <th className="py-3.5 px-space-md" scope="col">
                  Affiliated Institution / Org
                </th>
                <th className="py-3.5 px-space-md" scope="col">
                  System Status
                </th>
                <th className="py-3.5 px-space-lg text-right" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-on-surface-variant">
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
                      ? "bg-primary-container text-on-primary"
                      : row.role === "trainer"
                        ? "bg-surface-container-highest text-primary-container"
                        : row.role === "employer"
                          ? "bg-secondary-fixed text-on-secondary-fixed-variant"
                          : "bg-tertiary-fixed-dim/40 text-on-tertiary-fixed-variant";

                  const avatarBgClass =
                    row.role === "admin"
                      ? "bg-primary text-on-primary"
                      : row.role === "trainer"
                        ? "bg-primary-container text-on-primary"
                        : row.role === "employer"
                          ? "bg-secondary-container text-primary"
                          : "bg-tertiary-fixed text-on-tertiary-fixed-variant";

                  return (
                    <tr key={row.id} className="hover:bg-surface-container-low/60 transition-colors">
                      <td className="py-4 px-space-lg">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded ${avatarBgClass} font-label-md text-label-md flex items-center justify-center shrink-0 font-bold`}
                          >
                            {initials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-label-md text-label-md text-primary truncate font-bold">
                              {row.full_name || "Unnamed Account"}
                              {isSelf && (
                                <span className="ml-1 text-xs text-secondary font-normal">(You)</span>
                              )}
                            </span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant">
                              ID: USR-{row.id.slice(0, 6).toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-space-md text-on-surface font-tabular-data font-medium">
                        {row.email ?? "—"}
                      </td>
                      <td className="py-4 px-space-md">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded font-label-sm text-label-sm uppercase tracking-wider font-bold ${roleBadgeClass}`}
                          >
                            {row.role}
                          </span>
                          {!isSelf && (
                            <select
                              value={row.role}
                              onChange={(e) => void handleChangeRole(row.id, e.target.value as Role)}
                              className="text-xs bg-surface-container-low border border-outline-variant/40 rounded px-1.5 py-0.5 text-on-surface-variant cursor-pointer outline-none"
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
                      <td className="py-4 px-space-md font-body-md text-primary font-medium">
                        {row.role === "employer"
                          ? "Cooperative Partner Org"
                          : institutions[0]?.name || "RICM Regional Center"}
                      </td>
                      <td className="py-4 px-space-md">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-sm text-label-sm font-bold">
                          <span className="w-2 h-2 rounded-full bg-on-tertiary-container" />
                          Active
                        </span>
                      </td>
                      <td className="py-4 px-space-lg text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const newRole = row.role === "trainer" ? "admin" : "trainer";
                              if (!isSelf) void handleChangeRole(row.id, newRole);
                            }}
                            disabled={isSelf}
                            className="h-9 px-3 bg-surface-container-low hover:bg-surface-container text-primary font-label-sm text-label-sm rounded transition-colors disabled:opacity-40 cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => void handleDeleteUser(row)}
                            className="h-9 px-3 bg-error-container hover:bg-error/20 text-on-error-container font-label-sm text-label-sm rounded transition-colors disabled:opacity-40 cursor-pointer"
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
        <div className="p-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-sm border-t border-outline-variant/30">
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Showing <span className="text-primary font-semibold">{Math.min(1, users.length)}–{users.length}</span> of{" "}
            <span className="text-primary font-semibold">{users.length}</span> accounts
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              className="h-9 px-3 bg-surface-container text-on-surface-variant opacity-50 font-label-sm text-label-sm rounded cursor-not-allowed"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="w-9 h-9 bg-primary text-on-primary font-label-sm text-label-sm rounded flex items-center justify-center font-bold"
              >
                1
              </button>
            </div>
            <button
              type="button"
              disabled
              className="h-9 px-3 bg-surface-container text-on-surface-variant opacity-50 font-label-sm text-label-sm rounded cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 3: BALANCED 2-COLUMN DESKTOP GRID (FOUR CARDS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-xl items-start">
        {/* COLUMN 1 */}
        <div className="flex flex-col gap-space-xl">
          {/* CARD 1: Provision Single Account */}
          <div
            id="quick-provision-card"
            ref={provisionFormRef}
            className="bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden flex flex-col border border-outline-variant/40"
          >
            <div className="p-space-lg bg-surface-container-low flex items-start gap-3 border-b border-outline-variant/30">
              <div className="w-10 h-10 rounded bg-primary-container text-on-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">person_add</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
                  Provision Single Account
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Manually provision a new individual user account with role-based permissions.
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void handleCreateUser(e)} className="p-space-lg flex flex-col gap-space-md">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-primary font-semibold" htmlFor="new-full-name">
                    Full Name <span className="text-error">*</span>
                  </label>
                  <input
                    id="new-full-name"
                    name="full_name"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    className="h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary-container border border-outline-variant/40"
                    type="text"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-primary font-semibold" htmlFor="new-email">
                    Official Email Address <span className="text-error">*</span>
                  </label>
                  <input
                    id="new-email"
                    name="email"
                    required
                    placeholder="user@society.coop"
                    className="h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary-container border border-outline-variant/40"
                    type="email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-primary font-semibold" htmlFor="new-role">
                    Assign Role <span className="text-error">*</span>
                  </label>
                  <select
                    id="new-role"
                    name="role"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as Role)}
                    className="h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary-container cursor-pointer border border-outline-variant/40"
                    required
                  >
                    <option value="admin">Admin</option>
                    <option value="trainer">Trainer</option>
                    <option value="trainee">Trainee</option>
                    <option value="employer">Employer / Partner</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-primary font-semibold" htmlFor="new-phone">
                    Phone / Aadhaar Linked No. <span className="text-error">*</span>
                  </label>
                  <input
                    id="new-phone"
                    name="phone"
                    placeholder="+91 98765 43210"
                    className="h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary-container border border-outline-variant/40"
                    type="tel"
                  />
                </div>
              </div>

              {selectedRole === "employer" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md p-3 bg-secondary-container/10 rounded border border-secondary/20">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Organisation Name <span className="text-error">*</span>
                    </label>
                    <input
                      name="org_name"
                      required
                      placeholder="e.g. Amul Dairy Federation"
                      className="h-11 px-3 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded outline-none border border-outline-variant/40"
                      type="text"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-md text-label-md text-primary font-semibold">Sector</label>
                    <input
                      name="org_sector"
                      placeholder="e.g. Dairy Processing"
                      className="h-11 px-3 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded outline-none border border-outline-variant/40"
                      type="text"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md text-primary font-semibold" htmlFor="new-institution">
                  Sponsoring Institution / Employer Org <span className="text-error">*</span>
                </label>
                <select
                  id="new-institution"
                  name="institution"
                  className="h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary-container cursor-pointer border border-outline-variant/40"
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
                <label className="font-label-md text-label-md text-primary font-semibold" htmlFor="new-pwd">
                  Initial Password (Optional)
                </label>
                <input
                  id="new-pwd"
                  name="password"
                  placeholder="Leave blank to auto-generate secure password"
                  className="h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary-container border border-outline-variant/40"
                  type="text"
                />
              </div>

              <div className="pt-space-xs">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-12 bg-secondary-container text-primary font-label-md text-label-md rounded flex items-center justify-center gap-2 hover:bg-secondary hover:text-on-primary transition-colors font-bold cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px]">badge</span>
                  <span>{busy ? "Provisioning..." : "+ Create Account & Issue Credentials"}</span>
                </button>
              </div>
            </form>

            {/* Created Users Temporary Password Callout */}
            {createdUsers.length > 0 && (
              <div className="p-space-lg bg-surface-container-low border-t border-outline-variant/30 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-secondary font-label-sm text-label-sm font-bold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[18px]">key</span>
                  <span>One-Time Credentials Generated This Session</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Distribute these temporary passwords securely before refreshing or leaving this page.
                </p>
                <div className="space-y-1.5 mt-1 max-h-48 overflow-y-auto">
                  {createdUsers.map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 bg-surface-container-lowest rounded border border-outline-variant/30 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">{u.email}</span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-xs font-semibold uppercase">
                          {u.role}
                        </span>
                      </div>
                      <code className="bg-surface-container px-2 py-0.5 rounded font-mono font-bold text-secondary">
                        {u.temp_password || "(Manual password set)"}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CARD 2: Institution Profiles */}
          <div className="bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden flex flex-col border border-outline-variant/40">
            <div className="p-space-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded bg-primary-container text-on-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px]">corporate_fare</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
                    Institution Profiles
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Governed NCCT national apex institutes, Regional Institutes (RICM), and ICM centers.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddInstModal(!showAddInstModal)}
                className="h-9 px-3 bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-label-sm rounded flex items-center gap-1.5 self-start sm:self-center transition-colors cursor-pointer font-bold shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Add Institution</span>
              </button>
            </div>

            {/* Add Institution Inline Form */}
            {showAddInstModal && (
              <form
                onSubmit={(e) => void handleCreateInstitution(e)}
                className="p-space-md bg-surface-container/30 border-b border-outline-variant/30 flex flex-col gap-3"
              >
                <span className="font-label-sm text-label-sm text-secondary uppercase font-bold">
                  Register New Institute
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    name="name"
                    required
                    placeholder="Institution Name *"
                    className="h-10 px-3 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded border border-outline-variant/40 outline-none"
                  />
                  <input
                    name="state"
                    placeholder="State (e.g. Gujarat)"
                    className="h-10 px-3 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded border border-outline-variant/40 outline-none"
                  />
                  <input
                    name="district"
                    placeholder="District / City"
                    className="h-10 px-3 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded border border-outline-variant/40 outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddInstModal(false)}
                    className="px-3 py-1.5 rounded text-sm text-on-surface-variant hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-1.5 rounded text-sm bg-primary text-on-primary font-bold hover:bg-primary/90"
                  >
                    Save Institute
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-surface-container flex flex-col">
              {/* Default Reference Items */}
              <div className="p-space-md flex items-center justify-between gap-space-md hover:bg-surface-container-low/50 transition-colors">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-label-lg text-label-lg text-primary truncate font-bold">
                      VAMNICOM Pune
                    </span>
                    <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary font-label-sm text-label-sm font-bold">
                      National Apex
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-on-surface-variant font-body-sm text-body-sm">
                    <span>Western Zone (Maharashtra)</span>
                    <span>•</span>
                    <span className="font-tabular-data text-primary font-semibold">12 Batches Active</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="h-8 px-2.5 bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-label-sm rounded shrink-0 cursor-pointer font-bold"
                >
                  Configure
                </button>
              </div>

              {institutions.map((inst) => (
                <div
                  key={inst.id}
                  className="p-space-md flex items-center justify-between gap-space-md hover:bg-surface-container-low/50 transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    {editingInstId === inst.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editInstName}
                          onChange={(e) => setEditInstName(e.target.value)}
                          className="h-8 px-2 bg-surface-container-lowest border border-outline-variant rounded text-sm flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => void handleRenameInstitution(inst.id)}
                          className="px-2 py-1 bg-primary text-on-primary rounded text-xs font-bold"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingInstId(null)}
                          className="px-2 py-1 text-xs text-on-surface-variant hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-label-lg text-label-lg text-primary truncate font-bold">
                            {inst.name}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-label-sm font-medium">
                            Regional Institute
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-on-surface-variant font-body-sm text-body-sm">
                          <span>{inst.location || "India"}</span>
                          <span>•</span>
                          <span className="font-tabular-data text-primary font-semibold">Active Cohort</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {editingInstId !== inst.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingInstId(inst.id);
                          setEditInstName(inst.name);
                        }}
                        className="h-8 px-2.5 bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-label-sm rounded cursor-pointer font-bold"
                      >
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteInstitution(inst.id)}
                      className="h-8 px-2 bg-error-container hover:bg-error/20 text-on-error-container font-label-sm text-label-sm rounded cursor-pointer"
                      title="Delete institution"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-space-md bg-surface-container-low border-t border-outline-variant/30">
              <span className="font-label-md text-label-md text-secondary flex items-center gap-1 font-bold">
                <span>View All {institutions.length > 0 ? institutions.length : 29} Institutes</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </span>
            </div>
          </div>
        </div>

        {/* COLUMN 2 */}
        <div className="flex flex-col gap-space-xl">
          {/* CARD 3: Bulk Trainee Import */}
          <div className="bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden flex flex-col border border-outline-variant/40">
            <div className="p-space-lg bg-surface-container-low flex items-start gap-3 border-b border-outline-variant/30">
              <div className="w-10 h-10 rounded bg-secondary-container/30 text-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">upload_file</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
                  Bulk Trainee Import
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Batch onboard rural trainees from CSV or Excel spreadsheets provided by state federations.
                </p>
              </div>
            </div>

            <div className="p-space-lg flex flex-col gap-space-md">
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
                className="border-2 border-dashed border-outline-variant bg-surface-container-low rounded-lg p-space-lg flex flex-col items-center justify-center text-center cursor-pointer hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[40px] text-secondary">cloud_upload</span>
                <p className="font-label-md text-label-md text-primary mt-2 font-bold">
                  Drop candidate CSV roster here, or <span className="text-secondary underline">Browse Computer</span>
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
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
                <div className="p-3 bg-secondary-container/15 rounded-lg border border-secondary/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-secondary">description</span>
                    <span className="font-label-sm text-label-sm text-primary font-bold">{stagedFileName}</span>
                    <span className="text-xs text-on-surface-variant">({stagedFileSize} KB)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStagedFileName(null);
                      setCsv("");
                    }}
                    className="p-1 hover:text-error"
                    title="Remove staged file"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between text-secondary">
                <button
                  type="button"
                  onClick={() => setShowCsvTextarea(!showCsvTextarea)}
                  className="font-label-sm text-label-sm hover:underline flex items-center gap-1 cursor-pointer font-bold"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_note</span>
                  <span>{showCsvTextarea ? "Hide Text Paste" : "Paste CSV Raw Text Instead"}</span>
                </button>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                  v2.1 NCCT Standard
                </span>
              </div>

              {showCsvTextarea && (
                <textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder={`email, full_name, phone, affiliation\nt.patel@dairy.coop, Tarun Patel, +919876543210, Anand Union`}
                  rows={4}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-secondary-container"
                />
              )}

              {/* Target Batch / Institute Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-space-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-primary font-semibold" htmlFor="bulk-institute">
                    Regional Training Centre <span className="text-error">*</span>
                  </label>
                  <select
                    id="bulk-institute"
                    className="h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary-container cursor-pointer border border-outline-variant/40"
                  >
                    <option value="ricm-g">RICM Gandhinagar</option>
                    <option value="ricm-p">ICM Patna</option>
                    <option value="ricm-l">RICM Lucknow</option>
                    <option value="vamnicom">VAMNICOM Pune</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-primary font-semibold" htmlFor="bulk-course">
                    Programme Assignment <span className="text-error">*</span>
                  </label>
                  <select
                    id="bulk-course"
                    className="h-12 px-3.5 bg-surface-container-low text-on-surface font-body-md text-body-md rounded outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary-container cursor-pointer border border-outline-variant/40"
                  >
                    <option value="pacs-mgmt">PACS Accounting & Governance (Level 1)</option>
                    <option value="dairy-mgmt">Dairy Cooperative Enterprise Module</option>
                    <option value="warehouse-mgmt">Cooperative Warehousing Logistics</option>
                  </select>
                </div>
              </div>

              <div className="pt-space-xs">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleBulkImport()}
                  className={`w-full h-12 rounded flex items-center justify-center gap-2 transition-colors font-bold cursor-pointer ${
                    stagedFileName || csv.trim().length > 0
                      ? "bg-secondary-container text-primary hover:bg-secondary hover:text-on-primary"
                      : "bg-primary-container text-on-primary hover:bg-primary"
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
                <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/30 text-sm">
                  <span className="font-bold text-primary block mb-1">
                    Last Import: {importResult.created} created, {importResult.failed} failed
                  </span>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {importResult.rows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-outline-variant/20">
                        <span>{r.email}</span>
                        <span className={r.status === "created" ? "text-secondary font-bold" : "text-error"}>
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
          <div className="bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden flex flex-col border border-outline-variant/40">
            <div className="p-space-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded bg-primary-container text-on-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px]">apartment</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
                    Employer Organizations
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
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
                className="h-9 px-3 bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-label-sm rounded flex items-center gap-1.5 self-start sm:self-center transition-colors cursor-pointer font-bold shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Add Employer Org</span>
              </button>
            </div>

            <div className="divide-y divide-surface-container flex flex-col">
              {DEFAULT_EMPLOYER_ORGS.map((org) => (
                <div
                  key={org.id}
                  className="p-space-md flex items-center justify-between gap-space-md hover:bg-surface-container-low/50 transition-colors"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-lg text-label-lg text-primary truncate font-bold">
                      {org.name}
                    </span>
                    <div className="flex items-center gap-2 mt-1 text-on-surface-variant font-body-sm text-body-sm">
                      <span>Sector: {org.sector}</span>
                      <span>•</span>
                      <span className="font-tabular-data text-secondary font-semibold">
                        {org.activeJobs} Active Job Postings
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="h-8 px-2.5 bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-label-sm rounded shrink-0 cursor-pointer font-bold"
                  >
                    Manage
                  </button>
                </div>
              ))}
            </div>

            <div className="p-space-md bg-surface-container-low border-t border-outline-variant/30">
              <span className="font-label-md text-label-md text-secondary flex items-center gap-1 font-bold">
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
