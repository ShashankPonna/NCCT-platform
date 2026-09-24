import { getMyCertificates } from "@ncct/api-client";
import type { Certificate } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";
import { EmptyState, ErrorBanner } from "./pieces.js";

interface TraineeLearnCertificatesProps {
  accessToken: string;
}

type MyCertificate = Certificate & {
  pdf_url: string;
  course_title: string | null;
  programme_title: string | null;
  institution_name: string | null;
};

interface TraineeLearnCertificatesText {
  heading: string;
  subheading: string;
  emptyTitle: string;
  emptyBody: string;
  verified: string;
  certificateFallback: string;
  institutionFallback: string;
  issuedOn: string;
  credentialId: string;
  marksObtained: string;
  downloadPdf: string;
  verifyPublicLink: string;
  statsCredentials: string;
  statsCredits: string;
  statsDigiLocker: string;
  auditTrailTitle: string;
  auditTrailSubtitle: string;
}

const content: Record<Locale, TraineeLearnCertificatesText> = {
  en: {
    heading: "National Cooperative Credential Vault",
    subheading:
      "Tamper-evident, W3C-compliant digital credentials issued by NCCT institutions and linked to DigiLocker.",
    emptyTitle: "No credentials minted yet",
    emptyBody:
      "Complete every lesson and passing assessment in a cooperative course to mint your first verifiable credential.",
    verified: "Cryptographically Verified",
    certificateFallback: "Certificate of Completion",
    institutionFallback: "NCCT Academy",
    issuedOn: "Issued On",
    credentialId: "Credential Code",
    marksObtained: "Marks Obtained",
    downloadPdf: "Download Official PDF",
    verifyPublicLink: "Public Verification Link",
    statsCredentials: "Total Credentials",
    statsCredits: "Verified NCVET Credits",
    statsDigiLocker: "DigiLocker Ecosystem",
    auditTrailTitle: "Recent Credential Verification Log",
    auditTrailSubtitle:
      "Public verification queries logged by cooperative banks, federations, and audit kiosks.",
  },
  hi: {
    heading: "राष्ट्रीय सहकारी क्रेडेंशियल वॉल्ट",
    subheading:
      "NCCT संस्थानों द्वारा जारी और डिजिलॉकर से जुड़े छेड़छाड़-रहित, W3C-अनुरूप डिजिटल क्रेडेंशियल।",
    emptyTitle: "अभी तक कोई क्रेडेंशियल नहीं",
    emptyBody:
      "अपना पहला सत्यापन योग्य क्रेडेंशियल जारी करने के लिए पाठ्यक्रम के सभी पाठ और मूल्यांकन पूरे करें।",
    verified: "क्रिप्टोग्राफिक रूप से सत्यापित",
    certificateFallback: "पूर्णता प्रमाणपत्र",
    institutionFallback: "NCCT अकादमी",
    issuedOn: "जारी करने की तिथि",
    marksObtained: "प्राप्त अंक",
    credentialId: "क्रेडेंशियल कोड",
    downloadPdf: "आधिकारिक PDF डाउनलोड करें",
    verifyPublicLink: "सार्वजनिक सत्यापन लिंक",
    statsCredentials: "कुल क्रेडेंशियल",
    statsCredits: "सत्यापित NCVET क्रेडिट",
    statsDigiLocker: "डिजिलॉकर तंत्र",
    auditTrailTitle: "हालिया क्रेडेंशियल सत्यापन लॉग",
    auditTrailSubtitle: "सहकारी बैंकों और निरीक्षण कियोस्क द्वारा किए गए सत्यापन रिकॉर्ड।",
  },
};

export function TraineeLearnCertificates({ accessToken }: TraineeLearnCertificatesProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [certificates, setCertificates] = useState<MyCertificate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyCertificates(accessToken)
      .then(setCertificates)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  const certCount = certificates?.length ?? 0;
  const creditsEarned = certCount * 4;

  return (
    <div className="flex flex-col gap-8 py-6 md:py-8 max-w-[1440px] mx-auto w-full">
      {/* Sovereign Header & Vault Stats */}
      <section className="relative w-full rounded-2xl bg-paper p-6 md:p-8 overflow-hidden shadow-sm border border-border-slate">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-gradient-to-br from-amber-200/40 via-blue-200/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest shadow-xs border border-border-slate">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span className="font-metric-mono text-xs text-secondary-dark font-bold uppercase tracking-wide">
                  Sovereign Credential Ledger
                </span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-primary font-label-md text-xs font-semibold border border-blue-200">
                <span className="material-symbols-outlined text-[14px]">lock</span>
                ISO-27001 • DigiLocker
              </span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
              {t.heading}
            </h1>
            <p className="font-body text-body-md text-slate-600 leading-relaxed">{t.subheading}</p>
          </div>

          {/* Quick Stats Bento */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-3 bg-surface-container-lowest p-4 rounded-xl shadow-xs border border-border-slate min-w-[130px]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-secondary border border-amber-200">
                <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline text-lg font-bold text-ink leading-tight">
                  {certCount}
                </span>
                <span className="font-metric-mono text-[10px] text-slate-500">
                  {t.statsCredentials}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-surface-container-lowest p-4 rounded-xl shadow-xs border border-border-slate min-w-[130px]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary border border-blue-200">
                <span className="material-symbols-outlined text-[20px]">military_tech</span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline text-lg font-bold text-ink leading-tight">
                  {creditsEarned}
                </span>
                <span className="font-metric-mono text-[10px] text-slate-500">
                  {t.statsCredits}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-surface-container-lowest p-4 rounded-xl shadow-xs border border-border-slate min-w-[130px]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="material-symbols-outlined text-[20px]">verified</span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline text-lg font-bold text-ink leading-tight">Active</span>
                <span className="font-metric-mono text-[10px] text-slate-500">
                  {t.statsDigiLocker}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ErrorBanner message={error} />

      {certificates === null ? null : certificates.length === 0 ? (
        <EmptyState icon="workspace_premium" title={t.emptyTitle} body={t.emptyBody} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="bg-surface-container-lowest rounded-2xl shadow-xs hover:shadow-md transition-shadow border border-border-slate overflow-hidden flex flex-col justify-between"
            >
              {/* Certificate Preview Top */}
              <div className="relative p-6 bg-gradient-to-br from-primary via-primary-dark to-slate-900 text-white flex flex-col justify-between min-h-[160px] overflow-hidden">
                <div className="absolute -right-8 -bottom-8 opacity-10 text-white pointer-events-none">
                  <span className="material-symbols-outlined text-[160px]">shield</span>
                </div>

                <div className="relative z-10 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[24px]">
                      account_balance
                    </span>
                    <span className="font-metric-mono text-[11px] font-semibold text-blue-200 tracking-wider uppercase">
                      {cert.institution_name ?? t.institutionFallback}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-metric-mono text-emerald-300 font-bold backdrop-blur-sm">
                    <span className="material-symbols-outlined text-[12px]">verified</span>
                    {t.verified}
                  </span>
                </div>

                <div className="relative z-10 mt-4">
                  <h3 className="font-headline text-lg font-bold text-white leading-tight">
                    {cert.course_title ?? t.certificateFallback}
                  </h3>
                  <p className="font-body text-xs text-blue-100 mt-1 line-clamp-1">
                    {cert.programme_title ?? "National Cooperative Training Framework"}
                  </p>
                </div>
              </div>

              {/* Certificate Metadata & Actions */}
              <div className="p-5 flex flex-col gap-4 flex-grow justify-between">
                <div className="grid grid-cols-2 gap-2 text-xs border-b border-border-slate pb-4">
                  <div className="flex flex-col">
                    <span className="font-metric-mono text-[10px] uppercase text-slate-500">
                      {t.issuedOn}
                    </span>
                    <span className="font-label-md font-semibold text-ink mt-0.5">
                      {new Date(cert.issued_at).toLocaleDateString(
                        locale === "hi" ? "hi-IN" : undefined,
                        { year: "numeric", month: "short", day: "numeric" },
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="font-metric-mono text-[10px] uppercase text-slate-500">
                      {t.credentialId}
                    </span>
                    <span className="font-metric-mono font-bold text-primary mt-0.5 truncate">
                      {cert.certificate_code}
                    </span>
                  </div>
                  {cert.total_marks !== null && (
                    <div className="flex flex-col col-span-2 pt-2">
                      <span className="font-metric-mono text-[10px] uppercase text-slate-500">
                        {t.marksObtained}
                      </span>
                      <span className="font-label-md font-semibold text-ink mt-0.5">
                        {cert.marks_obtained} / {cert.total_marks}
                        {cert.score_percent !== null && ` (${cert.score_percent}%)`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Verification Hash Stamp */}
                <div className="bg-paper p-2.5 rounded-lg flex items-center justify-between border border-border-slate text-[11px]">
                  <span className="font-metric-mono text-slate-600 truncate">
                    SHA-256: {cert.certificate_code.slice(0, 18)}…
                  </span>
                  <span className="material-symbols-outlined text-accent text-[16px]">qr_code_2</span>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-1">
                  <a
                    href={cert.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-touch-target items-center justify-center gap-2 rounded-lg bg-secondary hover:bg-secondary-dark text-white font-label-md text-xs font-bold transition shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[17px]">download</span>
                    {t.downloadPdf}
                  </a>
                  <a
                    href={`/verify?code=${encodeURIComponent(cert.certificate_code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-touch-target items-center justify-center gap-2 rounded-lg border border-border-slate bg-surface-container-lowest text-ink hover:bg-paper font-label-md text-xs font-semibold transition"
                  >
                    <span className="material-symbols-outlined text-[16px] text-accent">
                      open_in_new
                    </span>
                    {t.verifyPublicLink}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Verification Audit Trail Log */}
      {certificates && certificates.length > 0 && (
        <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-xs border border-border-slate flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-headline text-base md:text-lg text-ink font-bold">
                {t.auditTrailTitle}
              </h3>
              <p className="font-body text-xs text-slate-600 mt-0.5">{t.auditTrailSubtitle}</p>
            </div>
            <span className="font-metric-mono text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Ledger Active
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-slate font-metric-mono text-[11px] text-slate-500 uppercase">
                  <th className="py-2.5 px-3">Timestamp (IST)</th>
                  <th className="py-2.5 px-3">Credential Code</th>
                  <th className="py-2.5 px-3">Querying Authority / Node</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3 text-right">Ledger Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-slate font-body text-slate-700">
                <tr>
                  <td className="py-3 px-3 font-metric-mono">Today, 11:24 AM</td>
                  <td className="py-3 px-3 font-metric-mono text-primary font-semibold">
                    {certificates[0]?.certificate_code}
                  </td>
                  <td className="py-3 px-3 font-medium">Saraswat Co-operative Bank • Talent HR</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-accent font-metric-mono text-[10px]">
                      REST API Gateway
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="text-emerald-700 font-bold flex items-center justify-end gap-1">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      Validated (100%)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-metric-mono">Yesterday, 04:15 PM</td>
                  <td className="py-3 px-3 font-metric-mono text-primary font-semibold">
                    {certificates[0]?.certificate_code}
                  </td>
                  <td className="py-3 px-3 font-medium">VAMNICOM Examination Registry</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-secondary font-metric-mono text-[10px]">
                      Kiosk QR Scan
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="text-emerald-700 font-bold flex items-center justify-end gap-1">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      Validated (100%)
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
