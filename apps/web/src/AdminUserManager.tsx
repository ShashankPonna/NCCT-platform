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
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

interface AdminUserManagerProps {
  accessToken: string;
  // Needed to grey out the two self-targeting actions the API refuses
  // anyway (changing your own role, deleting your own account) — showing a
  // control that always errors is worse than not showing it.
  currentUserId: string;
}

interface CreatedUser {
  email: string;
  role: Role;
  temp_password?: string;
}

interface AdminUserManagerText {
  heading: string;
  subheading: string;
  provisionSingleAccount: string;
  fullNameLabel: string;
  fullNamePlaceholder: string;
  emailLabel: string;
  systemRole: string;
  roleEmployerOption: string;
  organisationName: string;
  organisationPlaceholder: string;
  sector: string;
  sectorPlaceholder: string;
  initialPassword: string;
  passwordPlaceholder: string;
  creating: string;
  createAccount: string;
  createdThisSession: string;
  tempPasswordWarning: string;
  colEmail: string;
  colRole: string;
  colTempPassword: string;
  manualPasswordProvided: string;
  bulkTraineeImport: string;
  csvFormatIntro: string;
  readyToImport: (count: number) => string;
  importing: string;
  importTrainees: string;
  importSummary: (created: number, failed: number, skipped: number) => string;
  success: string;
  failed: string;
  skipped: string;
  institutionsHeading: (count: number) => string;
  registerNew: string;
  institutionNamePlaceholder: string;
  statePlaceholder: string;
  districtPlaceholder: string;
  addInstitution: string;
  directory: string;
  noInstitutions: string;
  indiaFallback: string;
  save: string;
  cancel: string;
  rename: string;
  delete: string;
  userDirectory: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  search: string;
  filterAriaLabel: string;
  allRoles: string;
  noUsersMatch: string;
  colName: string;
  colJoined: string;
  unnamed: string;
  youSuffix: string;
  cannotChangeOwnRole: string;
  roleForAriaLabel: (name: string) => string;
  cannotDeleteOwnAccount: string;
  deleteUserTitle: string;
  deleteConfirm: (name: string) => string;
  nothingToImport: string;
  role: Record<Role, string>;
}

const content: Record<Locale, AdminUserManagerText> = {
  en: {
    heading: "Users & Institutions Management",
    subheading:
      "Provision new accounts, manage organizational entities, and handle bulk operations for the NCCT platform.",
    provisionSingleAccount: "Provision Single Account",
    fullNameLabel: "Full Name *",
    fullNamePlaceholder: "e.g. Jane Doe",
    emailLabel: "Email Address *",
    systemRole: "System Role",
    roleEmployerOption: "Employer / Partner",
    organisationName: "Organisation Name",
    organisationPlaceholder: "Company Ltd",
    sector: "Sector",
    sectorPlaceholder: "e.g. Agriculture / Tech",
    initialPassword: "Initial Password",
    passwordPlaceholder: "Leave blank to auto-generate secure password",
    creating: "Creating...",
    createAccount: "Create Account",
    createdThisSession: "Created This Session",
    tempPasswordWarning:
      "Warning: Temporary passwords are only visible here once. Please distribute them securely before closing this page.",
    colEmail: "Email",
    colRole: "Role",
    colTempPassword: "Temp Password",
    manualPasswordProvided: "(Manual password provided)",
    bulkTraineeImport: "Bulk Trainee Import",
    csvFormatIntro: "Paste comma-separated values. Format:",
    readyToImport: (count) => `Ready to import: ${count} rows`,
    importing: "Importing...",
    importTrainees: "Import Trainees",
    importSummary: (created, failed, skipped) =>
      `Last Import Summary (${created} created, ${failed} failed${skipped > 0 ? `, ${skipped} skipped` : ""})`,
    success: "Success",
    failed: "Failed",
    skipped: "Skipped",
    institutionsHeading: (count) => `Institutions (${count})`,
    registerNew: "Register New",
    institutionNamePlaceholder: "Institution Name *",
    statePlaceholder: "State",
    districtPlaceholder: "District",
    addInstitution: "Add Institution",
    directory: "Directory",
    noInstitutions: "No institutions registered yet.",
    indiaFallback: "India",
    save: "Save",
    cancel: "Cancel",
    rename: "Rename",
    delete: "Delete",
    userDirectory: "User Directory",
    searchPlaceholder: "Search name or email",
    searchAriaLabel: "Search users by name or email",
    search: "Search",
    filterAriaLabel: "Filter users by role",
    allRoles: "All roles",
    noUsersMatch: "No users match the current filters.",
    colName: "Name",
    colJoined: "Joined",
    unnamed: "Unnamed",
    youSuffix: "(you)",
    cannotChangeOwnRole: "You cannot change your own role",
    roleForAriaLabel: (name) => `Role for ${name}`,
    cannotDeleteOwnAccount: "You cannot delete your own account",
    deleteUserTitle: "Delete user",
    deleteConfirm: (name) => `Delete ${name}? This cannot be undone.`,
    nothingToImport: "Nothing to import — paste at least one row.",
    role: { admin: "Admin", trainer: "Trainer", trainee: "Trainee", employer: "Employer" },
  },
  hi: {
    heading: "उपयोगकर्ता एवं संस्थान प्रबंधन",
    subheading:
      "नए खाते बनाएं, संगठनात्मक संस्थाओं का प्रबंधन करें, और NCCT प्लेटफ़ॉर्म के लिए बल्क संचालन करें।",
    provisionSingleAccount: "एकल खाता बनाएं",
    fullNameLabel: "पूरा नाम *",
    fullNamePlaceholder: "उदा. जेन डो",
    emailLabel: "ईमेल पता *",
    systemRole: "सिस्टम भूमिका",
    roleEmployerOption: "नियोक्ता / भागीदार",
    organisationName: "संगठन का नाम",
    organisationPlaceholder: "कंपनी लिमिटेड",
    sector: "क्षेत्र",
    sectorPlaceholder: "उदा. कृषि / प्रौद्योगिकी",
    initialPassword: "प्रारंभिक पासवर्ड",
    passwordPlaceholder: "सुरक्षित पासवर्ड स्वतः बनाने के लिए खाली छोड़ें",
    creating: "बनाया जा रहा है...",
    createAccount: "खाता बनाएं",
    createdThisSession: "इस सत्र में बनाए गए",
    tempPasswordWarning:
      "चेतावनी: अस्थायी पासवर्ड यहां केवल एक बार दिखाई देते हैं। इस पेज को बंद करने से पहले उन्हें सुरक्षित रूप से वितरित करें।",
    colEmail: "ईमेल",
    colRole: "भूमिका",
    colTempPassword: "अस्थायी पासवर्ड",
    manualPasswordProvided: "(मैन्युअल पासवर्ड दिया गया)",
    bulkTraineeImport: "बल्क प्रशिक्षणार्थी आयात",
    csvFormatIntro: "अल्पविराम से अलग किए गए मान पेस्ट करें। प्रारूप:",
    readyToImport: (count) => `आयात हेतु तैयार: ${count} पंक्तियां`,
    importing: "आयात हो रहा है...",
    importTrainees: "प्रशिक्षणार्थी आयात करें",
    importSummary: (created, failed, skipped) =>
      `अंतिम आयात सारांश (${created} बनाए गए, ${failed} विफल${skipped > 0 ? `, ${skipped} छोड़े गए` : ""})`,
    success: "सफल",
    failed: "विफल",
    skipped: "छोड़ा गया",
    institutionsHeading: (count) => `संस्थान (${count})`,
    registerNew: "नया पंजीकृत करें",
    institutionNamePlaceholder: "संस्थान का नाम *",
    statePlaceholder: "राज्य",
    districtPlaceholder: "जिला",
    addInstitution: "संस्थान जोड़ें",
    directory: "निर्देशिका",
    noInstitutions: "अभी तक कोई संस्थान पंजीकृत नहीं है।",
    indiaFallback: "भारत",
    save: "सहेजें",
    cancel: "रद्द करें",
    rename: "नाम बदलें",
    delete: "हटाएं",
    userDirectory: "उपयोगकर्ता निर्देशिका",
    searchPlaceholder: "नाम या ईमेल खोजें",
    searchAriaLabel: "नाम या ईमेल से उपयोगकर्ता खोजें",
    search: "खोजें",
    filterAriaLabel: "भूमिका के अनुसार फ़िल्टर करें",
    allRoles: "सभी भूमिकाएं",
    noUsersMatch: "वर्तमान फ़िल्टर से कोई उपयोगकर्ता मेल नहीं खाता।",
    colName: "नाम",
    colJoined: "शामिल हुए",
    unnamed: "अनाम",
    youSuffix: "(आप)",
    cannotChangeOwnRole: "आप अपनी खुद की भूमिका नहीं बदल सकते",
    roleForAriaLabel: (name) => `${name} के लिए भूमिका`,
    cannotDeleteOwnAccount: "आप अपना खुद का खाता नहीं हटा सकते",
    deleteUserTitle: "उपयोगकर्ता हटाएं",
    deleteConfirm: (name) => `${name} को हटाएं? इसे पूर्ववत नहीं किया जा सकता।`,
    nothingToImport: "आयात करने के लिए कुछ नहीं — कम से कम एक पंक्ति पेस्ट करें।",
    role: { admin: "प्रशासक", trainer: "प्रशिक्षक", trainee: "प्रशिक्षणार्थी", employer: "नियोक्ता" },
  },
};

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
  const { locale } = useLocale();
  const t = content[locale];
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [csv, setCsv] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("trainee");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<Role | "">("");
  const [editingInstId, setEditingInstId] = useState<string | null>(null);
  const [editInstName, setEditInstName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshInstitutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Filtering is server-side (the email half of `q` isn't a column the client
  // holds), so the directory refetches whenever a filter changes rather than
  // narrowing an already-fetched list.
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
    // Deleting an account cascades to everything hanging off it (progress,
    // attendance, certificates), so this one gets a confirm step — unlike
    // the institution delete, which the API itself guards.
    if (!window.confirm(t.deleteConfirm(row.full_name || row.email || t.unnamed))) {
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
      setError(t.nothingToImport);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await bulkImportTrainees(accessToken, trainees);
      setImportResult(result);
      setCsv("");
      await refreshUsers();
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
  const roleLabel = (role: Role) => t.role[role];

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-8 text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant pb-4">
        <div>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface m-0">
            {t.heading}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-2xl">{t.subheading}</p>
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
              {t.provisionSingleAccount}
            </h3>
            <form
              onSubmit={(e) => void handleCreateUser(e)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="font-label-md text-label-md text-on-surface">{t.fullNameLabel}</label>
                <input
                  name="full_name"
                  required
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  placeholder={t.fullNamePlaceholder}
                  type="text"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface">{t.emailLabel}</label>
                <input
                  name="email"
                  required
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  placeholder="jane@example.com"
                  type="email"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface">{t.systemRole}</label>
                <select
                  name="role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r === "employer" ? t.roleEmployerOption : roleLabel(r)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conditional Employer Fields */}
              {selectedRole === "employer" && (
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-container/30 p-4 rounded-lg border border-outline-variant/50">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-on-surface">{t.organisationName}</label>
                    <input
                      name="org_name"
                      className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary outline-none"
                      placeholder={t.organisationPlaceholder}
                      type="text"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-on-surface">{t.sector}</label>
                    <input
                      name="org_sector"
                      className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary outline-none"
                      placeholder={t.sectorPlaceholder}
                      type="text"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="font-label-md text-label-md text-on-surface">{t.initialPassword}</label>
                <input
                  name="password"
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 h-[44px] font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  placeholder={t.passwordPlaceholder}
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
                  {busy ? t.creating : t.createAccount}
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
                    {t.createdThisSession}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{t.tempPasswordWarning}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-outline-variant/50">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant/50">
                      <th className="p-3 font-label-md text-label-md text-on-surface-variant uppercase">
                        {t.colEmail}
                      </th>
                      <th className="p-3 font-label-md text-label-md text-on-surface-variant uppercase">
                        {t.colRole}
                      </th>
                      <th className="p-3 font-label-md text-label-md text-on-surface-variant uppercase">
                        {t.colTempPassword}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm text-body-sm text-on-surface divide-y divide-outline-variant/30">
                    {createdUsers.map((u, i) => (
                      <tr key={i} className="hover:bg-surface-bright transition-colors">
                        <td className="p-3 font-medium">{u.email}</td>
                        <td className="p-3">
                          <span className="bg-primary-container/10 text-primary-container border border-primary-container/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                            {roleLabel(u.role)}
                          </span>
                        </td>
                        <td className="p-3">
                          {u.temp_password ? (
                            <code className="bg-surface-container font-mono px-2 py-1 rounded text-primary">
                              {u.temp_password}
                            </code>
                          ) : (
                            <span className="text-outline text-xs">{t.manualPasswordProvided}</span>
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
              {t.bulkTraineeImport}
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
              {t.csvFormatIntro}{" "}
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
                {t.readyToImport(parsedRowCount)}
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
                {busy ? t.importing : t.importTrainees}
              </button>
            </div>

            {/* Import Summary State */}
            {importResult && (
              <div className="mt-4 pt-4 border-t border-outline-variant/30">
                <h4 className="font-label-md text-label-md text-on-surface mb-2">
                  {t.importSummary(importResult.created, importResult.failed, importResult.skipped)}
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
                            {t.success}
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
                            {r.status === "failed" ? t.failed : t.skipped}
                          </span>
                          <span
                            className="text-error text-xs max-w-[120px] truncate"
                            title={r.reason}
                          >
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
              {t.institutionsHeading(institutions.length)}
            </h3>

            {/* Compact Create Form */}
            <form
              onSubmit={(e) => void handleCreateInstitution(e)}
              className="bg-surface-container-low p-4 rounded-lg border border-outline-variant/50 mb-6 flex flex-col gap-3"
            >
              <h4 className="font-label-md text-label-md text-on-surface uppercase tracking-wider">
                {t.registerNew}
              </h4>
              <input
                name="name"
                required
                className="bg-surface-container-lowest border border-outline-variant rounded-lg p-2 h-[38px] font-body-sm text-body-sm w-full"
                placeholder={t.institutionNamePlaceholder}
                type="text"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  name="state"
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-2 h-[36px] font-body-sm text-body-sm"
                  placeholder={t.statePlaceholder}
                  type="text"
                />
                <input
                  name="district"
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-2 h-[36px] font-body-sm text-body-sm"
                  placeholder={t.districtPlaceholder}
                  type="text"
                />
              </div>
              <div className="flex justify-end">
                <button
                  disabled={busy}
                  type="submit"
                  className="bg-primary text-on-primary hover:bg-primary/90 rounded-lg px-4 font-label-md text-label-md h-[36px]"
                >
                  {t.addInstitution}
                </button>
              </div>
            </form>

            {/* Existing List */}
            <h4 className="font-label-md text-label-md text-on-surface mb-3 uppercase tracking-wider">
              {t.directory}
            </h4>
            {institutions.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant">{t.noInstitutions}</p>
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
                          {t.save}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingInstId(null)}
                          className="text-xs text-outline px-1"
                        >
                          {t.cancel}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="font-body-sm text-body-sm font-medium text-on-surface">
                          {inst.name}
                        </p>
                        <p className="font-label-sm text-label-sm text-on-surface-variant">
                          {inst.location || t.indiaFallback}
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
                          title={t.rename}
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteInstitution(inst.id)}
                        className="w-8 h-8 rounded flex items-center justify-center text-error hover:bg-error-container transition-colors"
                        title={t.delete}
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

      {/* Block 3: User Directory (full width) */}
      <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h3 className="font-headline-sm text-headline-sm text-on-surface m-0 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">group</span>
            {t.userDirectory}
            <span className="font-label-sm text-label-sm text-on-surface-variant font-normal">
              ({users.length})
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void refreshUsers();
                }}
                placeholder={t.searchPlaceholder}
                type="search"
                aria-label={t.searchAriaLabel}
                className="bg-surface-container-lowest border border-outline-variant rounded-lg p-2 h-[36px] font-body-sm text-body-sm w-56"
              />
              <button
                type="button"
                onClick={() => void refreshUsers()}
                className="bg-surface-container-high text-on-surface hover:bg-surface-container-highest rounded-lg px-3 font-label-md text-label-md h-[36px]"
              >
                {t.search}
              </button>
            </div>
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value as Role | "")}
              aria-label={t.filterAriaLabel}
              className="bg-surface-container-lowest border border-outline-variant rounded-lg p-2 h-[36px] font-body-sm text-body-sm"
            >
              <option value="">{t.allRoles}</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {users.length === 0 ? (
          <p className="font-body-sm text-on-surface-variant">{t.noUsersMatch}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-outline-variant">
                  {[t.colName, t.colEmail, t.colRole, t.colJoined, ""].map((heading, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="text-left font-label-md text-label-md text-on-surface-variant uppercase tracking-wider pb-3 px-2"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const isSelf = row.id === currentUserId;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-outline-variant/30 hover:bg-surface-bright transition-colors"
                    >
                      <td className="py-3 px-2 font-body-sm text-body-sm text-on-surface">
                        {row.full_name || (
                          <span className="text-on-surface-variant italic">{t.unnamed}</span>
                        )}
                        {isSelf && (
                          <span className="ml-2 font-label-sm text-label-sm text-primary">{t.youSuffix}</span>
                        )}
                      </td>
                      <td className="py-3 px-2 font-body-sm text-body-sm text-on-surface-variant">
                        {row.email ?? "—"}
                      </td>
                      <td className="py-3 px-2">
                        <select
                          value={row.role}
                          disabled={isSelf}
                          aria-label={t.roleForAriaLabel(row.full_name || row.email || t.unnamed)}
                          title={isSelf ? t.cannotChangeOwnRole : undefined}
                          onChange={(e) => void handleChangeRole(row.id, e.target.value as Role)}
                          className="bg-surface-container-lowest border border-outline-variant rounded-lg p-1 font-body-sm text-body-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-2 font-body-sm text-body-sm text-on-surface-variant">
                        {new Date(row.created_at).toLocaleDateString(locale === "hi" ? "hi-IN" : undefined)}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => void handleDeleteUser(row)}
                          title={isSelf ? t.cannotDeleteOwnAccount : t.deleteUserTitle}
                          className="w-8 h-8 rounded flex items-center justify-center text-error hover:bg-error-container transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
