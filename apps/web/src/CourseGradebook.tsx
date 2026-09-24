import { getCourseGradebook } from "@ncct/api-client";
import type { CourseGradebook as CourseGradebookData } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

interface CourseGradebookProps {
  accessToken: string;
  courseId: string;
}

interface CourseGradebookText {
  heading: string;
  trainee: string;
  overallMarks: string;
  certificate: string;
  noRoster: string;
  cellMarks: (marks: number, total: number) => string;
  notAttempted: string;
  passed: string;
  notPassed: string;
}

const content: Record<Locale, CourseGradebookText> = {
  en: {
    heading: "Gradebook",
    trainee: "Trainee",
    overallMarks: "Overall",
    certificate: "Certificate",
    noRoster: "No trainees have attempted or been nominated for this course's programme yet.",
    cellMarks: (marks, total) => `${marks}/${total}`,
    notAttempted: "—",
    passed: "Pass",
    notPassed: "Fail",
  },
  hi: {
    heading: "ग्रेडबुक",
    trainee: "प्रशिक्षणार्थी",
    overallMarks: "कुल",
    certificate: "प्रमाणपत्र",
    noRoster: "इस पाठ्यक्रम के कार्यक्रम के लिए अभी तक किसी प्रशिक्षणार्थी ने प्रयास या नामांकन नहीं किया है।",
    cellMarks: (marks, total) => `${marks}/${total}`,
    notAttempted: "—",
    passed: "उत्तीर्ण",
    notPassed: "अनुत्तीर्ण",
  },
};

// Staff view of every roster trainee's best marks per graded module test in
// a course, plus their running total (docs/DECISIONS.md #53) — the
// marks-tally counterpart to AssessmentBuilder's authoring view. Scoped
// server-side to trainers assigned to the course's programme.
export function CourseGradebook({ accessToken, courseId }: CourseGradebookProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [gradebook, setGradebook] = useState<CourseGradebookData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A fresh mount (the caller keys this by courseId) already starts with
  // null state, so this effect only needs to kick off the fetch.
  useEffect(() => {
    getCourseGradebook(accessToken, courseId)
      .then(setGradebook)
      .catch((err: Error) => setError(err.message));
  }, [accessToken, courseId]);

  if (error) return <p className="form-error">{error}</p>;
  if (!gradebook) return null;

  const moduleTestColumns = gradebook.assessments.filter((a) => a.kind === "module_test");

  return (
    <div className="course-gradebook legacy-ui">
      <h4>{t.heading}</h4>
      {gradebook.rows.length === 0 ? (
        <p>{t.noRoster}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t.trainee}</th>
              {moduleTestColumns.map((a) => (
                <th key={a.id}>
                  {a.title}
                  <br />
                  <small>{a.module_title}</small>
                </th>
              ))}
              <th>{t.overallMarks}</th>
              <th>{t.certificate}</th>
            </tr>
          </thead>
          <tbody>
            {gradebook.rows.map((row) => (
              <tr key={row.trainee_id}>
                <td>{row.full_name ?? row.trainee_id.slice(0, 8)}</td>
                {moduleTestColumns.map((a) => {
                  const cell = row.cells[a.id];
                  return (
                    <td key={a.id}>
                      {cell ? (
                        <>
                          {t.cellMarks(cell.best_marks_obtained, cell.best_total_marks)}{" "}
                          <span>({cell.passed ? t.passed : t.notPassed})</span>
                        </>
                      ) : (
                        t.notAttempted
                      )}
                    </td>
                  );
                })}
                <td>
                  {row.totals.score_percent !== null
                    ? `${t.cellMarks(row.totals.marks_obtained, row.totals.total_marks)} (${row.totals.score_percent}%)`
                    : t.notAttempted}
                </td>
                <td>{row.certificate_code ?? t.notAttempted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
