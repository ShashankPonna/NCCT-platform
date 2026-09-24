import { getMyCourseMarks } from "@ncct/api-client";
import type { CourseMarksTally as CourseMarksTallyData } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";

interface CourseMarksTallyProps {
  accessToken: string;
  courseId: string;
}

interface CourseMarksTallyText {
  heading: string;
  lessonsProgress: (done: number, total: number) => string;
  moduleTestsProgress: (passed: number, total: number) => string;
  overallMarks: (marks: number, total: number, percent: number) => string;
  noModuleTests: string;
  eligible: string;
  notEligible: string;
  perAssessmentHeading: string;
  attempted: (marks: number, total: number, percent: number, attempts: number) => string;
  notAttempted: string;
  passLabel: string;
  failLabel: string;
  quizLabel: string;
  certificateEarned: (code: string) => string;
}

const content: Record<Locale, CourseMarksTallyText> = {
  en: {
    heading: "My Marks",
    lessonsProgress: (done, total) => `Lessons: ${done} / ${total} complete`,
    moduleTestsProgress: (passed, total) => `Module tests passed: ${passed} / ${total}`,
    overallMarks: (marks, total, percent) => `Overall marks: ${marks} / ${total} (${percent}%)`,
    noModuleTests: "This course has no graded module tests.",
    eligible: "You've met every requirement for this course's certificate.",
    notEligible: "Complete all lessons and pass every module test to earn the certificate.",
    perAssessmentHeading: "Per-test results",
    attempted: (marks, total, percent, attempts) =>
      `${marks} / ${total} (${percent}%) — ${attempts} attempt${attempts === 1 ? "" : "s"}`,
    notAttempted: "Not attempted yet",
    passLabel: "Passed",
    failLabel: "Not passed",
    quizLabel: "Practice — not counted",
    certificateEarned: (code) => `Certificate issued: ${code}`,
  },
  hi: {
    heading: "मेरे अंक",
    lessonsProgress: (done, total) => `पाठ: ${total} में से ${done} पूर्ण`,
    moduleTestsProgress: (passed, total) => `उत्तीर्ण मॉड्यूल परीक्षाएं: ${total} में से ${passed}`,
    overallMarks: (marks, total, percent) => `कुल अंक: ${marks} / ${total} (${percent}%)`,
    noModuleTests: "इस पाठ्यक्रम में कोई श्रेणीबद्ध मॉड्यूल परीक्षा नहीं है।",
    eligible: "आपने इस पाठ्यक्रम के प्रमाणपत्र के लिए सभी आवश्यकताएं पूरी कर ली हैं।",
    notEligible: "प्रमाणपत्र प्राप्त करने के लिए सभी पाठ पूरे करें और हर मॉड्यूल परीक्षा उत्तीर्ण करें।",
    perAssessmentHeading: "प्रति-परीक्षा परिणाम",
    attempted: (marks, total, percent, attempts) =>
      `${marks} / ${total} (${percent}%) — ${attempts} प्रयास`,
    notAttempted: "अभी तक प्रयास नहीं किया",
    passLabel: "उत्तीर्ण",
    failLabel: "अनुत्तीर्ण",
    quizLabel: "अभ्यास — गिना नहीं जाता",
    certificateEarned: (code) => `प्रमाणपत्र जारी: ${code}`,
  },
};

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

  if (error) return <p className="form-error">{error}</p>;
  if (!tally) return null;

  return (
    <div className="course-marks-tally legacy-ui">
      <h4>{t.heading}</h4>
      <p>{t.lessonsProgress(tally.lessons_completed, tally.lessons_total)}</p>
      {tally.totals.module_tests_total === 0 ? (
        <p>{t.noModuleTests}</p>
      ) : (
        <>
          <p>{t.moduleTestsProgress(tally.totals.module_tests_passed, tally.totals.module_tests_total)}</p>
          {tally.totals.score_percent !== null && (
            <p>
              <strong>
                {t.overallMarks(tally.totals.marks_obtained, tally.totals.total_marks, tally.totals.score_percent)}
              </strong>
            </p>
          )}
        </>
      )}
      <p>{tally.eligible_for_certificate ? t.eligible : t.notEligible}</p>

      {tally.certificate && (
        <p className="course-marks-certificate">{t.certificateEarned(tally.certificate.certificate_code)}</p>
      )}

      {tally.assessments.length > 0 && (
        <>
          <h5>{t.perAssessmentHeading}</h5>
          <ul>
            {tally.assessments.map((a) => (
              <li key={a.assessment_id}>
                <strong>{a.title}</strong> ({a.module_title}){" "}
                {a.kind === "quiz" ? (
                  <em>{t.quizLabel}</em>
                ) : a.attempts_used === 0 ? (
                  t.notAttempted
                ) : (
                  <>
                    {t.attempted(
                      a.best_marks_obtained ?? 0,
                      a.best_total_marks ?? a.total_marks,
                      a.best_score_percent ?? 0,
                      a.attempts_used,
                    )}{" "}
                    — {a.passed ? t.passLabel : t.failLabel}
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
