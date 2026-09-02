import { getMyCertificates } from "@ncct/api-client";
import type { Certificate } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { EmptyState, ErrorBanner } from "./pieces.js";

interface TraineeLearnCertificatesProps {
  accessToken: string;
}

type MyCertificate = Certificate & {
  pdf_url: string;
  programme_title: string | null;
  institution_name: string | null;
};

// design/stitch_ncct_trainee_portal/learn_my_certificates — new screen,
// backed by the new own-row GET /api/certificates/mine route.
export function TraineeLearnCertificates({ accessToken }: TraineeLearnCertificatesProps) {
  const [certificates, setCertificates] = useState<MyCertificate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyCertificates(accessToken)
      .then(setCertificates)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  return (
    <div className="flex flex-col gap-6 py-6 md:py-8">
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-on-background md:text-headline-lg">
          My Certificates
        </h1>
        <p className="mt-2 text-body-md text-on-surface-variant">Your earned, verifiable credentials.</p>
      </div>

      <ErrorBanner message={error} />

      {certificates === null ? null : certificates.length === 0 ? (
        <EmptyState
          icon="workspace_premium"
          title="No certificates yet"
          body="Complete a programme's assessment to earn your first verifiable certificate."
        />
      ) : (
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="flex flex-col overflow-hidden rounded-xl border border-border-low-contrast bg-surface-card transition-shadow hover:shadow-md"
            >
              <div className="relative flex h-32 items-center justify-center bg-primary-container">
                <span
                  className="material-symbols-outlined text-[48px] text-inverse-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  workspace_premium
                </span>
                <span className="absolute top-4 right-4 flex items-center gap-1 rounded-full border border-status-shortlisted/20 bg-status-shortlisted/10 px-2 py-1 text-label-sm text-status-shortlisted">
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    verified
                  </span>
                  Verified
                </span>
              </div>
              <div className="flex flex-grow flex-col p-6">
                <h3 className="mb-1 font-headline text-headline-md text-on-background">
                  {cert.programme_title ?? "Certificate"}
                </h3>
                <p className="text-body-md text-on-surface-variant">{cert.institution_name ?? "NCCT"}</p>

                <div className="mt-auto flex flex-col gap-4">
                  <div className="flex items-center justify-between border-t border-border-low-contrast pt-4 text-sm">
                    <div className="flex flex-col">
                      <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                        Issued On
                      </span>
                      <span className="text-label-md text-on-background">
                        {new Date(cert.issued_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                        Credential ID
                      </span>
                      <span className="font-mono text-label-md text-on-background">
                        {cert.certificate_code}
                      </span>
                    </div>
                  </div>
                  <a
                    href={cert.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-touch-target flex-1 items-center justify-center gap-2 rounded-lg bg-cta px-4 py-3 text-label-md text-white transition-colors hover:bg-cta-hover"
                  >
                    <span className="material-symbols-outlined">download</span>
                    Download PDF
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
