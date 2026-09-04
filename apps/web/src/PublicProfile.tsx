import { getPublicProfile } from "@ncct/api-client";
import type { PublicProfileResult } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface PublicProfileProps {
  code: string;
}

// F10 — the phone-tap path (docs/DECISIONS.md #30): a trainee's NFC card
// carries a URL to this page. It is the one screen in the app guaranteed to
// be opened almost exclusively from a phone that just read an NFC tag, so
// unlike everything else here it's designed mobile-first rather than
// mobile-adapted — the narrow layout is the primary one, not an afterthought.
export function PublicProfile({ code }: PublicProfileProps) {
  const [profile, setProfile] = useState<PublicProfileResult | null | "loading">("loading");

  useEffect(() => {
    getPublicProfile(code)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [code]);

  if (profile === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin material-symbols-outlined text-[36px] text-cta">
            progress_activity
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm bg-surface-card border border-outline-variant rounded-2xl p-6 shadow-md text-center">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-3">
            person_off
          </span>
          <h1 className="font-headline-md text-headline-md text-primary m-0 mb-2">
            Profile Not Available
          </h1>
          <p className="font-body-md text-on-surface-variant">
            This card isn&apos;t linked to a published profile, or the trainee has chosen not to
            share it publicly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col items-center">
      <div className="w-full max-w-sm flex flex-col gap-4 pt-2 pb-8">
        <div className="bg-surface-card border border-outline-variant rounded-2xl p-6 shadow-md text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-headline-lg font-bold text-2xl mb-3 border-4 border-surface-container-lowest shadow-sm">
            {profile.full_name.slice(0, 2).toUpperCase()}
          </div>
          <h1 className="font-headline-md text-headline-md text-primary m-0">
            {profile.full_name}
          </h1>
          <p className="font-label-sm text-on-surface-variant m-0 mt-1 uppercase tracking-wide font-bold">
            NCCT Verified Trainee
          </p>
        </div>

        {profile.skills.length > 0 && (
          <div className="bg-surface-card border border-outline-variant rounded-2xl p-5 shadow-sm">
            <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase mb-3">
              Skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-sky-200 bg-sky-100 px-3 py-1.5 text-label-sm text-sky-800"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-surface-card border border-outline-variant rounded-2xl p-5 shadow-sm">
          <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase mb-3">
            Certifications
          </h2>
          {profile.certificates.length === 0 ? (
            <p className="font-body-sm text-on-surface-variant">No certificates issued yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {profile.certificates.map((cert) => (
                <a
                  key={cert.certificate_code}
                  href={`/?verify=${cert.certificate_code}`}
                  className="flex items-start gap-3 rounded-lg border border-outline-variant p-3 hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-status-success text-[22px] mt-0.5">
                    verified
                  </span>
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-body-md font-semibold text-primary m-0 truncate">
                      {cert.programme_title ?? "Cooperative Training Programme"}
                    </p>
                    <p className="font-body-sm text-on-surface-variant m-0">
                      {cert.institution_name ?? "NCCT"} ·{" "}
                      {new Date(cert.issued_at).toLocaleDateString()}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <p className="text-center font-label-sm text-on-surface-variant mt-2">
          National Council for Cooperative Training
        </p>
      </div>
    </div>
  );
}
