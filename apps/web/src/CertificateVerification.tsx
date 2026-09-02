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

// No login, no accessToken — reachable by anyone with the code (PRD §6.4
// "public, no-login certificate verification page"). Rendered by App.tsx
// before its auth gate whenever the URL has a `?verify=` param.
export function CertificateVerification({ code }: CertificateVerificationProps) {
  const [certificate, setCertificate] = useState<CertificateDisplay | null | "loading">("loading");

  useEffect(() => {
    getCertificate(code)
      .then((result) => setCertificate(result as CertificateDisplay | null))
      .catch(() => setCertificate(null));
  }, [code]);

  if (certificate === "loading") {
    return <p className="legacy-ui center-message">Checking certificate...</p>;
  }

  if (!certificate) {
    return (
      <div className="legacy-ui verify-panel">
        <h1>Certificate not found</h1>
        <p>
          No certificate matches code <strong>{code}</strong>. Check the code and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="legacy-ui verify-panel">
      <h1>Certificate verified ✓</h1>
      <dl>
        <dt>Trainee</dt>
        <dd>{certificate.trainee_name}</dd>
        <dt>Programme</dt>
        <dd>{certificate.programme_title}</dd>
        <dt>Issuing institution</dt>
        <dd>{certificate.institution_name}</dd>
        <dt>Certificate ID</dt>
        <dd>{certificate.certificate_code}</dd>
        <dt>Issued</dt>
        <dd>{new Date(certificate.issued_at).toLocaleDateString()}</dd>
      </dl>
      <a href={certificate.pdf_url} target="_blank" rel="noopener noreferrer">
        View certificate PDF
      </a>
    </div>
  );
}
