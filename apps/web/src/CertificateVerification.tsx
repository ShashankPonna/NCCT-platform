import { getCertificate } from "@ncct/api-client";
import type { Certificate } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface CertificateVerificationProps {
  code: string;
}

type CertificateDisplay = Certificate & {
  pdf_url: string;
  trainee_name: string | null;
  programme_title: string | null;
  institution_name: string | null;
};

export function CertificateVerification({ code }: CertificateVerificationProps) {
  const [certificate, setCertificate] = useState<CertificateDisplay | null | "loading">("loading");

  useEffect(() => {
    getCertificate(code)
      .then((result) => setCertificate(result as CertificateDisplay | null))
      .catch(() => setCertificate(null));
  }, [code]);

  if (certificate === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin material-symbols-outlined text-[36px] text-cta">
            progress_activity
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Verifying certificate #{code}...
          </p>
        </div>
      </div>
    );
  }

  if (!certificate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-surface-card border border-outline-variant rounded-2xl p-8 shadow-md text-center">
          <span className="material-symbols-outlined text-[56px] text-error mb-3">
            cancel
          </span>
          <h1 className="font-headline-md text-headline-md text-primary m-0 mb-2">
            Certificate Not Found
          </h1>
          <p className="font-body-md text-on-surface-variant mb-6">
            No verified certificate matches code <strong className="font-mono">{code}</strong>. Please check the code or QR link and try again.
          </p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-6 h-touch-target bg-surface-container-high text-primary rounded-full font-label-md text-label-md hover:bg-surface-container-highest transition-colors"
          >
            Back to Portal
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg bg-surface-card border border-outline-variant rounded-2xl p-8 shadow-md text-left">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-outline-variant">
          <div className="w-12 h-12 rounded-full bg-status-success/15 text-status-success flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px]">verified</span>
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md text-primary m-0">
              Official Certificate Verified
            </h1>
            <p className="font-label-sm text-on-surface-variant m-0 uppercase font-bold">
              National Council for Cooperative Training
            </p>
          </div>
        </div>

        <div className="space-y-4 font-body-md">
          <div>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase block">
              Certified Recipient
            </span>
            <span className="font-headline-sm text-[18px] font-bold text-primary">
              {certificate.trainee_name ?? "Verified Trainee"}
            </span>
          </div>

          <div>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase block">
              Training Programme
            </span>
            <span className="font-body-md text-primary font-medium">
              {certificate.programme_title ?? "Cooperative Training Programme"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase block">
                Issuing Institution
              </span>
              <span className="font-body-sm text-on-surface font-semibold">
                {certificate.institution_name ?? "NCCT / VAMNICOM / RICM / ICM"}
              </span>
            </div>
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase block">
                Date Issued
              </span>
              <span className="font-body-sm text-on-surface font-semibold">
                {new Date(certificate.issued_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase block">
              Unique Verification Code
            </span>
            <code className="font-mono text-sm bg-surface-container px-2 py-1 rounded text-primary">
              {certificate.certificate_code}
            </code>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-outline-variant flex justify-between items-center">
          <a
            href="/"
            className="text-on-surface-variant hover:text-primary font-label-md text-sm"
          >
            NCCT Portal Home
          </a>
          {certificate.pdf_url && (
            <a
              href={certificate.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 h-touch-target bg-cta text-on-primary hover:bg-cta-hover rounded-full font-label-md text-label-md shadow-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              View PDF
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
