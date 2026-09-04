import { getProfileDetails, updateProfile } from "@ncct/api-client";
import type { Profile, Role } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { NfcProfileCard } from "./trainee/NfcProfileCard.js";

interface ProfileEditorProps {
  accessToken: string;
  role: Role;
  // Sourced from the Supabase Auth session (useSession.ts), not the
  // `profiles` table — `profiles` has no email column (see DATABASE.md);
  // email lives only in Supabase Auth.
  email: string | null;
}

export function ProfileEditor({ accessToken, role, email }: ProfileEditorProps) {
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
      setStatus("Profile details updated successfully.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const roleLabel =
    role === "admin"
      ? "Administrator Role"
      : role === "trainer"
        ? "Trainer Role"
        : role === "employer"
          ? "Employer Role"
          : "Trainee Role";

  const initials = (profile?.full_name ?? "User").slice(0, 2).toUpperCase();

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-8 text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-outline-variant pb-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0">
            My Profile
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-2xl">
            Manage your personal information, contact credentials, and cooperative affiliations.
          </p>
        </div>
        <div className="flex items-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary-container/10 text-primary-container rounded-full font-label-md text-label-md uppercase tracking-wide border border-primary-container/20 shadow-xs font-bold">
            <span className="material-symbols-outlined text-[18px]">
              {role === "employer" ? "work" : role === "trainer" ? "school" : "verified_user"}
            </span>
            {roleLabel}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      )}

      {status && (
        <div className="bg-status-success/15 text-status-success p-4 rounded-xl flex items-center gap-3 border border-status-success/30">
          <span className="material-symbols-outlined">check_circle</span>
          <p className="font-body-md text-body-md font-semibold">{status}</p>
        </div>
      )}

      {!profile ? (
        <div className="p-12 text-center text-on-surface-variant font-body-md">
          <div className="animate-spin material-symbols-outlined text-[32px] text-cta mb-2">
            progress_activity
          </div>
          <p>Loading profile details...</p>
        </div>
      ) : (
        /* Profile Bento Grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Avatar & Summary Card */}
          <div className="md:col-span-1 flex flex-col gap-6">
            <div className="bg-surface-card border border-outline-variant rounded-xl p-6 flex flex-col items-center text-center shadow-sm">
              <div className="w-28 h-28 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-headline-lg font-bold text-3xl mb-4 border-4 border-surface-container-lowest shadow-sm relative">
                {initials}
                <div
                  aria-label="Account Avatar"
                  className="absolute bottom-0 right-0 w-8 h-8 bg-cta text-on-primary rounded-full flex items-center justify-center shadow-md border-2 border-surface-card"
                >
                  <span className="material-symbols-outlined text-[16px]">person</span>
                </div>
              </div>

              <h2 className="font-headline-sm text-headline-sm text-on-surface m-0 mb-1">
                {profile.full_name || "Profile Name"}
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant m-0 mb-4 break-all">
                {email ?? "No email on file"}
              </p>

              <div className="w-full pt-4 border-t border-outline-variant/50 space-y-2">
                <div className="flex justify-between items-center text-left">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                    Account Status
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-status-success/15 text-status-success rounded-full font-label-sm font-bold uppercase">
                    Active
                  </span>
                </div>
                <div className="flex justify-between items-center text-left">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                    System Role
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold capitalize">
                    {profile.role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Form Area */}
          <div className="md:col-span-2 flex flex-col gap-6">
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="bg-surface-card border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant/50 bg-surface-container-lowest/50">
                <h3 className="font-headline-md text-[20px] leading-[26px] font-semibold text-primary m-0">
                  Personal Details
                </h3>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                {/* Full Name */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="font-label-md text-label-md text-on-surface" htmlFor="fullName">
                    Full Name *
                  </label>
                  <input
                    id="fullName"
                    name="full_name"
                    defaultValue={profile.full_name ?? ""}
                    required
                    className="w-full min-h-[44px] px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    type="text"
                  />
                </div>

                {/* Phone */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface" htmlFor="phone">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    defaultValue={profile.phone ?? ""}
                    placeholder="+91 98765 43210"
                    className="w-full min-h-[44px] px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    type="tel"
                  />
                </div>

                {/* Email (Read Only) */}
                <div className="flex flex-col gap-1.5">
                  <label
                    className="font-label-md text-label-md text-on-surface-variant"
                    htmlFor="email"
                  >
                    Email Address <span className="font-normal text-xs">(Read-only)</span>
                  </label>
                  <input
                    id="email"
                    disabled
                    value={email ?? ""}
                    placeholder="No email on file"
                    className="w-full min-h-[44px] px-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface-variant cursor-not-allowed"
                    type="email"
                  />
                </div>

                {/* Cooperative Affiliation */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="font-label-md text-label-md text-on-surface" htmlFor="coop">
                    Cooperative Affiliation
                  </label>
                  <input
                    id="coop"
                    name="cooperative_affiliation"
                    defaultValue={profile.cooperative_affiliation ?? ""}
                    placeholder="e.g. National Agricultural Cooperative Federation"
                    className="w-full min-h-[44px] px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    type="text"
                  />
                </div>
              </div>

              {/* Employer Details Section (Conditional) */}
              {role === "employer" && (
                <div className="p-6 border-t border-outline-variant/50 bg-secondary-container/5 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-secondary-container" />
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-secondary">domain</span>
                    <h4 className="font-headline-sm text-[16px] font-semibold text-primary m-0">
                      Employer Organisation Details
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label
                        className="font-label-md text-label-md text-on-surface"
                        htmlFor="orgName"
                      >
                        Organisation Name
                      </label>
                      <input
                        id="orgName"
                        name="org_name"
                        defaultValue={profile.org_name ?? ""}
                        placeholder="Company or Cooperative Entity"
                        className="w-full min-h-[44px] px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md"
                        type="text"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label
                        className="font-label-md text-label-md text-on-surface"
                        htmlFor="orgSector"
                      >
                        Sector
                      </label>
                      <input
                        id="orgSector"
                        name="org_sector"
                        defaultValue={profile.org_sector ?? ""}
                        placeholder="e.g. Agri-Tech, Dairy Processing"
                        className="w-full min-h-[44px] px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md"
                        type="text"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="p-6 border-t border-outline-variant/50 bg-surface-container-low flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-8 h-touch-target bg-cta text-on-primary hover:bg-cta-hover rounded-full font-label-md text-label-md transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  <span>{busy ? "Saving..." : "Save Profile Details"}</span>
                </button>
              </div>
            </form>

            {role === "trainee" && (
              <NfcProfileCard
                accessToken={accessToken}
                publicProfileCode={profile.public_profile_code}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
