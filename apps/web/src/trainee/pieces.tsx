// Small shared building blocks for the trainee portal screens, matching
// DESIGN.md's Status Pills / Skill Chips component spec.

import { useLocale, type Locale } from "../i18n/LocaleContext.js";

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-100 text-status-shortlisted",
  shortlisted: "bg-emerald-100 text-status-shortlisted",
  pending: "bg-amber-100 text-status-pending",
  waitlisted: "bg-amber-100 text-status-pending",
  viewed: "bg-surface-container-highest text-on-surface-variant",
  rejected: "bg-red-100 text-status-rejected",
  contacted: "bg-emerald-100 text-status-shortlisted",
};

// These are the DB's own enum values (nomination/interest status columns),
// not free text, so this is a fixed lookup rather than a sentence to
// translate — any status not in this table (an unexpected/future value)
// falls back to showing the raw value rather than breaking.
const STATUS_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    approved: "Approved",
    shortlisted: "Shortlisted",
    pending: "Pending",
    waitlisted: "Waitlisted",
    viewed: "Viewed",
    rejected: "Rejected",
    contacted: "Contacted",
  },
  hi: {
    approved: "स्वीकृत",
    shortlisted: "शॉर्टलिस्ट किया गया",
    pending: "लंबित",
    waitlisted: "प्रतीक्षा सूची में",
    viewed: "देखा गया",
    rejected: "अस्वीकृत",
    contacted: "संपर्क किया गया",
  },
};

export function StatusPill({ status }: { status: string }) {
  const { locale } = useLocale();
  const style = STATUS_STYLES[status] ?? "bg-surface-container-highest text-on-surface-variant";
  const label = STATUS_LABELS[locale][status] ?? status;
  return (
    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-label-sm font-bold capitalize ${style}`}>
      {label}
    </span>
  );
}

export function SkillChip({ label, acquired }: { label: string; acquired: boolean }) {
  return acquired ? (
    <span className="rounded-full border border-primary-fixed-dim bg-primary-fixed px-4 py-2 text-label-md text-primary-container">
      {label}
    </span>
  ) : (
    <span className="rounded-full border border-dashed border-outline-variant px-4 py-2 text-label-md text-on-surface-variant">
      {label}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-status-rejected/30 bg-red-50 px-4 py-3 text-body-md text-status-rejected">
      {message}
    </p>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest">
        <span className="material-symbols-outlined text-on-surface-variant">{icon}</span>
      </div>
      <h3 className="font-headline text-headline-md text-on-background mb-2">{title}</h3>
      <p className="text-body-md text-on-surface-variant">{body}</p>
    </div>
  );
}
