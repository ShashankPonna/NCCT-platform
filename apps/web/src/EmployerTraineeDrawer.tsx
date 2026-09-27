import { getEmployerTrainee } from "@ncct/api-client";
import type { EmployerTraineeProfile, Skill } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface EmployerTraineeDrawerProps {
  accessToken: string;
  traineeId: string;
  onClose: () => void;
  // Shortlisting stays owned by EmployerDashboard (it's per selected job);
  // the drawer just offers the same action without leaving the summary.
  isShortlisted: boolean;
  shortlistPending: boolean;
  selectedJobTitle: string | null;
  onShortlist: () => void;
}

const LATEST_COUNT = 3;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function groupByCategory(skills: Skill[]): [string, Skill[]][] {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const key = skill.category?.trim() || "Other";
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b),
  );
}

// The employer's "Trainee summary" slide-over. Everything shown here is what
// the trainee already consented to via visible_to_employers (name,
// certificates, skills) — see GET /employer/trainees/:traineeId. Each
// certificate links to the public ?verify= page so the employer can confirm
// it independently rather than trusting this screen.
export function EmployerTraineeDrawer({
  accessToken,
  traineeId,
  onClose,
  isShortlisted,
  shortlistPending,
  selectedJobTitle,
  onShortlist,
}: EmployerTraineeDrawerProps) {
  const [profile, setProfile] = useState<EmployerTraineeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // No state reset here: the dashboard keys this component by traineeId,
    // so switching trainee remounts it with fresh state.
    let cancelled = false;
    getEmployerTrainee(accessToken, traineeId)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, traineeId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const name = profile?.full_name?.trim() || "Trainee";
  const certificates = profile?.certificates ?? [];
  const visibleCertificates = showAll ? certificates : certificates.slice(0, LATEST_COUNT);
  const latest = certificates[0];
  const institutions = new Set(certificates.map((c) => c.institution_name).filter(Boolean));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close trainee summary"
        onClick={onClose}
        className="absolute inset-0 bg-primary/40 backdrop-blur-xs cursor-default"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Trainee summary: ${name}`}
        className="relative flex h-full w-full max-w-md flex-col bg-surface-container-lowest shadow-2xl border-l border-border-slate"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-space-sm border-b border-border-slate/60 bg-paper-light p-space-md">
          <div className="flex min-w-0 items-center gap-space-sm">
            <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center font-display text-headline-sm shrink-0 font-bold shadow-2xs">
              {profile ? name.slice(0, 2).toUpperCase() : ""}
            </div>
            <div className="min-w-0">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                Trainee summary
              </span>
              <div className="flex items-center gap-1">
                <h3 className="font-headline-sm text-headline-sm text-primary font-bold truncate">
                  {profile ? name : "Loading…"}
                </h3>
                {certificates.length > 0 && (
                  <span
                    className="material-symbols-outlined text-[18px] text-on-tertiary-container shrink-0"
                    title="Holds EduDisha certificates — each can be checked on the public verification page"
                  >
                    verified
                  </span>
                )}
              </div>
              {latest?.institution_location && (
                <span className="flex items-center gap-0.5 font-body-sm text-body-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px]">place</span>
                  {latest.institution_location}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded flex items-center justify-center hover:bg-surface-container text-on-surface-variant cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-space-md space-y-space-lg">
          {error && (
            <p className="rounded-lg border border-status-rejected/30 bg-status-rejected/10 p-3 font-body-sm text-body-sm text-status-rejected">
              {error}
            </p>
          )}

          {!profile && !error && (
            <div className="space-y-space-sm" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 rounded-xl bg-surface-container-low animate-pulse" />
              ))}
            </div>
          )}

          {profile && (
            <>
              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-space-xs">
                {[
                  { label: "Certificates", value: String(certificates.length) },
                  { label: "Skills", value: String(profile.skills.length) },
                  { label: "Institutions", value: String(institutions.size) },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-border-slate/60 bg-paper-light px-space-sm py-2 text-center"
                  >
                    <div className="font-metric-mono text-headline-sm font-bold text-primary">
                      {stat.value}
                    </div>
                    <div className="font-label-sm text-label-sm text-on-surface-variant">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Certificates */}
              <section className="space-y-space-sm">
                <div className="flex items-baseline justify-between">
                  <h4 className="font-label-lg text-label-lg text-primary font-bold">
                    {showAll || certificates.length <= LATEST_COUNT
                      ? "Certificates"
                      : `Latest ${LATEST_COUNT} certificates`}
                  </h4>
                  {latest && (
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      Most recent {formatDate(latest.issued_at)}
                    </span>
                  )}
                </div>

                {certificates.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No certificates yet.
                  </p>
                ) : (
                  <ol className="space-y-space-xs">
                    {visibleCertificates.map((cert, index) => (
                      <li
                        key={cert.certificate_code}
                        className="rounded-xl border border-border-slate/60 bg-surface-container-lowest p-space-sm"
                      >
                        <div className="flex items-start justify-between gap-space-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-label-md text-label-md text-primary font-bold">
                                {cert.course_title ?? cert.programme_title ?? "Certificate"}
                              </span>
                              {index === 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-sm text-[10px] uppercase font-bold">
                                  Latest
                                </span>
                              )}
                            </div>
                            {cert.course_title && cert.programme_title && (
                              <div className="font-body-sm text-body-sm text-on-surface-variant">
                                {cert.programme_title}
                              </div>
                            )}
                            <div className="font-body-sm text-body-sm text-on-surface-variant">
                              {[cert.institution_name, formatDate(cert.issued_at)]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-space-xs">
                          <span className="font-metric-mono text-label-sm text-on-surface-variant">
                            {cert.certificate_code}
                          </span>
                          <a
                            href={`/?verify=${encodeURIComponent(cert.certificate_code)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 font-label-sm text-label-sm font-bold text-primary hover:underline"
                          >
                            Verify
                            <span className="material-symbols-outlined text-[14px]">
                              open_in_new
                            </span>
                          </a>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {certificates.length > LATEST_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="w-full rounded-xl border border-dashed border-border-slate py-2 font-label-md text-label-md text-on-surface-variant hover:bg-paper-light cursor-pointer"
                  >
                    {showAll ? "Show latest only" : `Show all ${certificates.length} certificates`}
                  </button>
                )}
              </section>

              {/* Skills */}
              <section className="space-y-space-sm">
                <h4 className="font-label-lg text-label-lg text-primary font-bold">Skills</h4>
                {profile.skills.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No tagged skills yet — their programmes haven't been mapped to the skills list.
                  </p>
                ) : (
                  groupByCategory(profile.skills).map(([category, list]) => (
                    <div key={category}>
                      <div className="mb-1 font-label-sm text-label-sm text-on-surface-variant">
                        {category}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {list.map((skill) => (
                          <span
                            key={skill.id}
                            className="px-2 py-0.5 rounded-lg bg-paper text-ink font-metric-mono text-xs border border-border-slate/50"
                          >
                            {skill.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer action */}
        <div className="border-t border-border-slate/60 bg-paper-light p-space-md">
          <button
            type="button"
            onClick={onShortlist}
            disabled={isShortlisted || shortlistPending || !profile || !selectedJobTitle}
            className={`w-full min-h-[44px] rounded-xl inline-flex items-center justify-center gap-1 font-bold text-sm transition-all ${
              isShortlisted
                ? "bg-primary text-on-primary cursor-default"
                : "bg-primary-container text-on-primary hover:opacity-90 cursor-pointer disabled:opacity-50"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isShortlisted ? "check_circle" : "bookmark_add"}
            </span>
            {isShortlisted ? "Shortlisted" : shortlistPending ? "Saving…" : "Shortlist"}
          </button>
          <p className="mt-2 text-center font-label-sm text-label-sm text-on-surface-variant">
            {selectedJobTitle
              ? `For "${selectedJobTitle}"`
              : 'Pick a job in "My Postings" to shortlist.'}
          </p>
        </div>
      </aside>
    </div>
  );
}
