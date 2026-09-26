import { getMyCourseMarks } from "@ncct/api-client";
import type { CourseMarksTally as CourseMarksTallyData } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";
import { ErrorBanner } from "./pieces.js";

interface CourseMarksTallyProps {
  accessToken: string;
  courseId: string;
}

interface CourseMarksTallyText {
  heading: string;
  lessons: string;
  moduleTests: string;
  overallMarks: string;
  marksOf: (marks: number, total: number) => string;
  noModuleTests: string;
  noAttemptsYet: string;
  eligible: string;
  remaining: (lessonsLeft: number, testsLeft: number) => string;
  certificateEarned: string;
  verifyCertificate: string;
  perAssessmentHeading: string;
  attemptsUsed: (used: number, max: number | null) => string;
  passMark: (percent: number, totalMarks: number) => string;
  notAttempted: string;
  passLabel: string;
  failLabel: string;
  quizLabel: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const content: Record<Locale, CourseMarksTallyText> = {
  en: {
    heading: "My Marks",
    lessons: "Lessons",
    moduleTests: "Module tests passed",
    overallMarks: "Overall marks",
    marksOf: (marks, total) => `${marks} / ${total}`,
    noModuleTests: "This course has no graded module tests.",
    noAttemptsYet: "No graded test attempted yet",
    eligible: "You've met every requirement for this course's certificate.",
    remaining: (lessonsLeft, testsLeft) =>
      `To earn the certificate: ${[
        lessonsLeft > 0 ? `complete ${plural(lessonsLeft, "more lesson", "more lessons")}` : null,
        testsLeft > 0 ? `pass ${plural(testsLeft, "more module test", "more module tests")}` : null,
      ]
        .filter(Boolean)
        .join(" and ")}.`,
    certificateEarned: "Certificate issued",
    verifyCertificate: "Verify",
    perAssessmentHeading: "Per-test results",
    attemptsUsed: (used, max) =>
      max === null ? plural(used, "attempt", "attempts") : `${used} of ${max} attempts`,
    passMark: (percent, totalMarks) => `Pass mark ${percent}% · ${totalMarks} marks`,
    notAttempted: "Not attempted",
    passLabel: "Passed",
    failLabel: "Not passed",
    quizLabel: "Practice",
  },
  hi: {
    heading: "मेरे अंक",
    lessons: "पाठ",
    moduleTests: "उत्तीर्ण मॉड्यूल परीक्षाएं",
    overallMarks: "कुल अंक",
    marksOf: (marks, total) => `${marks} / ${total}`,
    noModuleTests: "इस पाठ्यक्रम में कोई श्रेणीबद्ध मॉड्यूल परीक्षा नहीं है।",
    noAttemptsYet: "अभी तक कोई श्रेणीबद्ध परीक्षा नहीं दी",
    eligible: "आपने इस पाठ्यक्रम के प्रमाणपत्र के लिए सभी आवश्यकताएं पूरी कर ली हैं।",
    remaining: (lessonsLeft, testsLeft) =>
      `प्रमाणपत्र के लिए: ${[
        lessonsLeft > 0 ? `${lessonsLeft} और पाठ पूरे करें` : null,
        testsLeft > 0 ? `${testsLeft} और मॉड्यूल परीक्षाएं उत्तीर्ण करें` : null,
      ]
        .filter(Boolean)
        .join(" और ")}।`,
    certificateEarned: "प्रमाणपत्र जारी",
    verifyCertificate: "सत्यापित करें",
    perAssessmentHeading: "प्रति-परीक्षा परिणाम",
    attemptsUsed: (used, max) => (max === null ? `${used} प्रयास` : `${max} में से ${used} प्रयास`),
    passMark: (percent, totalMarks) => `उत्तीर्णांक ${percent}% · ${totalMarks} अंक`,
    notAttempted: "प्रयास नहीं किया",
    passLabel: "उत्तीर्ण",
    failLabel: "अनुत्तीर्ण",
    quizLabel: "अभ्यास",
  },
};

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-label-sm text-on-surface-variant">{label}</span>
        <span className="font-metric-mono text-label-md font-semibold text-on-background">
          {value} / {total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? "bg-status-shortlisted" : "bg-interactive"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// SVG ring for the overall percentage; stroke colours follow the theme tokens.
function ScoreRing({ percent }: { percent: number | null }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const filled = percent === null ? 0 : (Math.min(percent, 100) / 100) * circumference;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-surface-container-high"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="stroke-secondary transition-all"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-metric-mono text-label-md font-bold text-primary">
        {percent === null ? "—" : `${percent}%`}
      </span>
    </div>
  );
}

// Trainee's own marks tally for one course (docs/DECISIONS.md #53) — best
// attempt per assessment, the module-test-only marks total, lesson
// completion, and certificate eligibility, all computed server-side.
export function CourseMarksTally({ accessToken, courseId }: CourseMarksTallyProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [tally, setTally] = useState<CourseMarksTallyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A fresh mount (the caller keys this by courseId) already starts with
  // null state, so this effect only needs to kick off the fetch.
  useEffect(() => {
    getMyCourseMarks(accessToken, courseId)
      .then(setTally)
      .catch((err: Error) => setError(err.message));
  }, [accessToken, courseId]);

  if (error) return <ErrorBanner message={error} />;
  if (!tally) return null;

  const { totals } = tally;
  const hasModuleTests = totals.module_tests_total > 0;
  const lessonsLeft = Math.max(0, tally.lessons_total - tally.lessons_completed);
  const testsLeft = Math.max(0, totals.module_tests_total - totals.module_tests_passed);

  return (
    <div className="overflow-hidden rounded-xl border border-border-low-contrast bg-surface-card text-left">
      <div className="flex items-center justify-between gap-3 border-b border-border-low-contrast bg-surface-container-low p-4">
        <div className="min-w-0">
          <h2 className="font-headline text-headline-md text-primary">{t.heading}</h2>
          <p className="mt-0.5 truncate text-label-sm text-on-surface-variant">
            {tally.course_title}
          </p>
        </div>
        {hasModuleTests && <ScoreRing percent={totals.score_percent} />}
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3">
          <ProgressRow
            label={t.lessons}
            value={tally.lessons_completed}
            total={tally.lessons_total}
          />
          {hasModuleTests && (
            <ProgressRow
              label={t.moduleTests}
              value={totals.module_tests_passed}
              total={totals.module_tests_total}
            />
          )}
        </div>

        {hasModuleTests ? (
          <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2.5">
            <span className="text-label-sm text-on-surface-variant">{t.overallMarks}</span>
            {totals.score_percent === null ? (
              <span className="text-label-sm text-on-surface-variant">{t.noAttemptsYet}</span>
            ) : (
              <span className="font-metric-mono text-label-md font-bold text-on-background">
                {t.marksOf(totals.marks_obtained, totals.total_marks)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-label-sm text-on-surface-variant">{t.noModuleTests}</p>
        )}

        {/* A certificate, once issued, stands even if tests were added to the
            course afterwards — so it takes precedence over the "what's left"
            hint, which used to contradict it. */}
        {tally.certificate ? (
          <div className="flex items-center gap-3 rounded-lg border border-status-shortlisted/40 bg-status-shortlisted/10 p-3">
            <span className="material-symbols-outlined text-[22px] text-status-shortlisted">
              workspace_premium
            </span>
            <div className="min-w-0 flex-grow">
              <p className="text-label-md font-semibold text-on-background">
                {t.certificateEarned}
              </p>
              <p className="truncate font-metric-mono text-label-sm text-on-surface-variant">
                {tally.certificate.certificate_code}
              </p>
            </div>
            <a
              href={`/?verify=${encodeURIComponent(tally.certificate.certificate_code)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-label-sm font-semibold text-interactive hover:underline"
            >
              {t.verifyCertificate}
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            </a>
          </div>
        ) : tally.eligible_for_certificate ? (
          <div className="flex items-center gap-2 rounded-lg border border-status-shortlisted/40 bg-status-shortlisted/10 p-3 text-label-sm text-on-background">
            <span className="material-symbols-outlined text-[20px] text-status-shortlisted">
              task_alt
            </span>
            {t.eligible}
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-status-pending/40 bg-status-pending/10 p-3 text-label-sm text-on-background">
            <span className="material-symbols-outlined text-[20px] text-status-pending">flag</span>
            {t.remaining(lessonsLeft, testsLeft)}
          </div>
        )}

        {tally.assessments.length > 0 && (
          <div>
            <h3 className="mb-2 text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
              {t.perAssessmentHeading}
            </h3>
            <ul className="flex flex-col gap-2">
              {tally.assessments.map((a) => {
                const attempted = a.attempts_used > 0;
                const percent = a.best_score_percent ?? 0;
                const status =
                  a.kind === "quiz"
                    ? { label: t.quizLabel, cls: "bg-interactive/10 text-interactive" }
                    : !attempted
                      ? {
                          label: t.notAttempted,
                          cls: "bg-surface-container-high text-on-surface-variant",
                        }
                      : a.passed
                        ? {
                            label: t.passLabel,
                            cls: "bg-status-shortlisted/15 text-status-shortlisted",
                          }
                        : { label: t.failLabel, cls: "bg-status-rejected/15 text-status-rejected" };
                return (
                  <li
                    key={a.assessment_id}
                    className="rounded-lg border border-border-low-contrast p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-label-md font-semibold text-on-background">
                          {a.title}
                        </p>
                        <p className="truncate text-label-sm text-on-surface-variant">
                          {a.module_title}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${status.cls}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    {attempted && (
                      <>
                        <div className="relative mt-2.5 h-1.5 rounded-full bg-surface-container-high">
                          <div
                            className={`h-full rounded-full ${
                              a.kind === "quiz"
                                ? "bg-interactive"
                                : a.passed
                                  ? "bg-status-shortlisted"
                                  : "bg-status-rejected"
                            }`}
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          />
                          {/* Pass-mark tick */}
                          <span
                            className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-on-surface-variant"
                            style={{ left: `${a.pass_threshold_percent}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-label-sm text-on-surface-variant">
                          <span className="font-metric-mono font-semibold text-on-background">
                            {a.best_marks_obtained ?? 0} / {a.best_total_marks ?? a.total_marks} ·{" "}
                            {percent}%
                          </span>
                          <span>{t.attemptsUsed(a.attempts_used, a.max_attempts)}</span>
                        </div>
                      </>
                    )}
                    {!attempted && a.kind !== "quiz" && (
                      <p className="mt-1 text-label-sm text-on-surface-variant">
                        {t.passMark(a.pass_threshold_percent, a.total_marks)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
