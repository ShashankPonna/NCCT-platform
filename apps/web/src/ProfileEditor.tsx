import { getProfileDetails, updateProfile } from "@ncct/api-client";
import type { Profile, Role } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";
import { NfcProfileCard } from "./trainee/NfcProfileCard.js";

interface ProfileEditorProps {
  accessToken: string;
  role: Role;
  // Sourced from the Supabase Auth session (useSession.ts), not the
  // `profiles` table — `profiles` has no email column (see DATABASE.md);
  // email lives only in Supabase Auth.
  email: string | null;
}

interface ProfileEditorText {
  roleLabel: Record<Role, string>;
  roleValue: Record<Role, string>;
  userFallback: string;
  heading: string;
  subheading: string;
  updateSuccess: string;
  loading: string;
  profileNameFallback: string;
  noEmail: string;
  accountStatus: string;
  active: string;
  systemRole: string;
  personalDetails: string;
  fullName: string;
  phoneNumber: string;
  emailAddress: string;
  readOnly: string;
  cooperativeAffiliation: string;
  cooperativePlaceholder: string;
  employerDetails: string;
  organisationName: string;
  organisationPlaceholder: string;
  sector: string;
  sectorPlaceholder: string;
  saving: string;
  saveProfile: string;
}

const content: Record<Locale, ProfileEditorText> = {
  en: {
    roleLabel: {
      admin: "Administrator Role",
      trainer: "Trainer Role",
      employer: "Employer Role",
      trainee: "Trainee Role",
    },
    roleValue: { admin: "admin", trainer: "trainer", employer: "employer", trainee: "trainee" },
    userFallback: "User",
    heading: "My Profile",
    subheading: "Manage your personal information, contact credentials, and cooperative affiliations.",
    updateSuccess: "Profile details updated successfully.",
    loading: "Loading profile details...",
    profileNameFallback: "Profile Name",
    noEmail: "No email on file",
    accountStatus: "Account Status",
    active: "Active",
    systemRole: "System Role",
    personalDetails: "Personal Details",
    fullName: "Full Name *",
    phoneNumber: "Phone Number",
    emailAddress: "Email Address",
    readOnly: "(Read-only)",
    cooperativeAffiliation: "Cooperative Affiliation",
    cooperativePlaceholder: "e.g. National Agricultural Cooperative Federation",
    employerDetails: "Employer Organisation Details",
    organisationName: "Organisation Name",
    organisationPlaceholder: "Company or Cooperative Entity",
    sector: "Sector",
    sectorPlaceholder: "e.g. Agri-Tech, Dairy Processing",
    saving: "Saving...",
    saveProfile: "Save Profile Details",
  },
  hi: {
    roleLabel: {
      admin: "प्रशासक भूमिका",
      trainer: "प्रशिक्षक भूमिका",
      employer: "नियोक्ता भूमिका",
      trainee: "प्रशिक्षणार्थी भूमिका",
    },
    roleValue: {
      admin: "प्रशासक",
      trainer: "प्रशिक्षक",
      employer: "नियोक्ता",
      trainee: "प्रशिक्षणार्थी",
    },
    userFallback: "उपयोगकर्ता",
    heading: "मेरी प्रोफ़ाइल",
    subheading: "अपनी व्यक्तिगत जानकारी, संपर्क क्रेडेंशियल और सहकारी संबद्धताओं का प्रबंधन करें।",
    updateSuccess: "प्रोफ़ाइल विवरण सफलतापूर्वक अपडेट किया गया।",
    loading: "प्रोफ़ाइल विवरण लोड हो रहा है...",
    profileNameFallback: "प्रोफ़ाइल नाम",
    noEmail: "कोई ईमेल दर्ज नहीं",
    accountStatus: "खाता स्थिति",
    active: "सक्रिय",
    systemRole: "सिस्टम भूमिका",
    personalDetails: "व्यक्तिगत विवरण",
    fullName: "पूरा नाम *",
    phoneNumber: "फ़ोन नंबर",
    emailAddress: "ईमेल पता",
    readOnly: "(केवल पढ़ने के लिए)",
    cooperativeAffiliation: "सहकारी संबद्धता",
    cooperativePlaceholder: "उदा. राष्ट्रीय कृषि सहकारी संघ",
    employerDetails: "नियोक्ता संगठन विवरण",
    organisationName: "संगठन का नाम",
    organisationPlaceholder: "कंपनी या सहकारी संस्था",
    sector: "क्षेत्र",
    sectorPlaceholder: "उदा. एग्री-टेक, डेयरी प्रोसेसिंग",
    saving: "सहेजा जा रहा है...",
    saveProfile: "प्रोफ़ाइल विवरण सहेजें",
  },
};

export function ProfileEditor({ accessToken, role, email }: ProfileEditorProps) {
  const { locale } = useLocale();
  const t = content[locale];
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
      setStatus(t.updateSuccess);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const roleLabel = t.roleLabel[role];
  const initials = (profile?.full_name ?? t.userFallback).slice(0, 2).toUpperCase();

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-8 text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-outline-variant pb-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0">
            {t.heading}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-2xl">{t.subheading}</p>
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
          <p>{t.loading}</p>
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
                {profile.full_name || t.profileNameFallback}
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant m-0 mb-4 break-all">
                {email ?? t.noEmail}
              </p>

              <div className="w-full pt-4 border-t border-outline-variant/50 space-y-2">
                <div className="flex justify-between items-center text-left">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                    {t.accountStatus}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-status-success/15 text-status-success rounded-full font-label-sm font-bold uppercase">
                    {t.active}
                  </span>
                </div>
                <div className="flex justify-between items-center text-left">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                    {t.systemRole}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                    {t.roleValue[profile.role]}
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
                  {t.personalDetails}
                </h3>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                {/* Full Name */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="font-label-md text-label-md text-on-surface" htmlFor="fullName">
                    {t.fullName}
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
                    {t.phoneNumber}
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
                    {t.emailAddress} <span className="font-normal text-xs">{t.readOnly}</span>
                  </label>
                  <input
                    id="email"
                    disabled
                    value={email ?? ""}
                    placeholder={t.noEmail}
                    className="w-full min-h-[44px] px-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface-variant cursor-not-allowed"
                    type="email"
                  />
                </div>

                {/* Cooperative Affiliation */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="font-label-md text-label-md text-on-surface" htmlFor="coop">
                    {t.cooperativeAffiliation}
                  </label>
                  <input
                    id="coop"
                    name="cooperative_affiliation"
                    defaultValue={profile.cooperative_affiliation ?? ""}
                    placeholder={t.cooperativePlaceholder}
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
                      {t.employerDetails}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label
                        className="font-label-md text-label-md text-on-surface"
                        htmlFor="orgName"
                      >
                        {t.organisationName}
                      </label>
                      <input
                        id="orgName"
                        name="org_name"
                        defaultValue={profile.org_name ?? ""}
                        placeholder={t.organisationPlaceholder}
                        className="w-full min-h-[44px] px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md"
                        type="text"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label
                        className="font-label-md text-label-md text-on-surface"
                        htmlFor="orgSector"
                      >
                        {t.sector}
                      </label>
                      <input
                        id="orgSector"
                        name="org_sector"
                        defaultValue={profile.org_sector ?? ""}
                        placeholder={t.sectorPlaceholder}
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
                  <span>{busy ? t.saving : t.saveProfile}</span>
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
