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
  certificateFallback: string;
  institutionFallback: string;
  issuedOn: string;
  credentialId: string;
  marksObtained: string;
  downloadPdf: string;
  verifyPublicLink: string;
  statsCredentials: string;
  statsProgrammes: string;
  verified: string;
}

const content: Record<Locale, TraineeLearnCertificatesText> = {
  en: {
    heading: "My Certificates",
    subheading:
      "Certificates you've earned by completing courses. Anyone can check one on the public verification page using its code.",
    emptyTitle: "No certificates yet",
    emptyBody: "Complete every lesson and pass every graded test in a course to earn your first certificate.",
    certificateFallback: "Certificate of Completion",
    institutionFallback: "EduDisha Academy",
    issuedOn: "Issued On",
    credentialId: "Credential Code",
    marksObtained: "Marks Obtained",
    downloadPdf: "Download Official PDF",
    verifyPublicLink: "Public Verification Link",
    statsCredentials: "Total Credentials",
    statsProgrammes: "Programmes",
    verified: "Publicly verifiable",
  },
  hi: {
    heading: "मेरे प्रमाणपत्र",
    subheading:
      "पाठ्यक्रम पूरे करके अर्जित आपके प्रमाणपत्र। कोई भी व्यक्ति कोड के ज़रिए सार्वजनिक सत्यापन पृष्ठ पर इन्हें जांच सकता है।",
    emptyTitle: "अभी तक कोई प्रमाणपत्र नहीं",
    emptyBody: "अपना पहला प्रमाणपत्र पाने के लिए किसी पाठ्यक्रम के सभी पाठ पूरे करें और सभी श्रेणीबद्ध परीक्षाएं उत्तीर्ण करें।",
    certificateFallback: "पूर्णता प्रमाणपत्र",
    institutionFallback: "EduDisha अकादमी",
    issuedOn: "जारी करने की तिथि",
    marksObtained: "प्राप्त अंक",
    credentialId: "क्रेडेंशियल कोड",
    downloadPdf: "आधिकारिक PDF डाउनलोड करें",
    verifyPublicLink: "सार्वजनिक सत्यापन लिंक",
    statsCredentials: "कुल क्रेडेंशियल",
    statsProgrammes: "कार्यक्रम",
    verified: "सार्वजनिक रूप से सत्यापन योग्य",
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
  const programmeCount = new Set((certificates ?? []).map((cert) => cert.programme_id)).size;

  return (
    <div className="flex flex-col gap-8 py-6 md:py-8 max-w-[1440px] mx-auto w-full">
      {/* Header & stats */}
      <section className="relative w-full rounded-2xl bg-paper p-6 md:p-8 overflow-hidden shadow-sm border border-border-slate">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-gradient-to-br from-amber-200/40 via-blue-200/30 to-transparent blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
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
                  {programmeCount}
                </span>
                <span className="font-metric-mono text-[10px] text-slate-500">
                  {t.statsProgrammes}
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

                {/* Certificate code — what the public verification page looks up */}
                <div className="bg-paper p-2.5 rounded-lg flex items-center justify-between border border-border-slate text-[11px]">
                  <span className="font-metric-mono text-slate-600 truncate">
                    {t.credentialId}: {cert.certificate_code}
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
                    href={`/?verify=${encodeURIComponent(cert.certificate_code)}`}
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
    </div>
  );
}
