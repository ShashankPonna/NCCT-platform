import {
  ApiError,
  getAssessmentAttempts,
  getAssessmentToTake,
  getAssessments,
  submitAssessmentAttempt,
} from "@ncct/api-client";
import type {
  AssessmentAttempt,
  AssessmentKind,
  AssessmentQuestionForTrainee,
  AssessmentWithTotals,
  Certificate,
  QuestionResult,
} from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";
import { useOnlineStatus } from "./offline/network.js";
import { enqueueWrite } from "./offline/syncManager.js";

interface QuizTakerProps {
  accessToken: string;
  moduleId: string;
}

interface SubmitResult {
  attempt: AssessmentAttempt;
  breakdown: QuestionResult[];
  certificate: Certificate | null;
  certificateError?: string;
}

interface QuizTakerText {
  assessments: string;
  kind: Record<AssessmentKind, string>;
  assessmentSummary: (questionCount: number, totalMarks: number, passPercent: number) => string;
  attemptsUsed: (used: number, max: number) => string;
  attemptsExhausted: string;
  offlineNotice: string;
  submitOnline: string;
  submitOffline: string;
  queuedNotice: string;
  score: (marks: number, total: number, percent: number) => string;
  passed: string;
  notPassed: string;
  practiceNote: string;
  breakdownHeading: string;
  correctAnswerWas: (text: string) => string;
  viewCertificate: (code: string) => string;
  certificateError: (message: string) => string;
  tryAgain: string;
}

const content: Record<Locale, QuizTakerText> = {
  en: {
    assessments: "Assessments",
    kind: { quiz: "Practice Quiz", module_test: "Graded Module Test" },
    assessmentSummary: (questionCount, totalMarks, passPercent) =>
      `${questionCount} question${questionCount === 1 ? "" : "s"} · ${totalMarks} marks · pass ≥ ${passPercent}%`,
    attemptsUsed: (used, max) => `${used} of ${max} attempts used`,
    attemptsExhausted: "You've used every allowed attempt for this test.",
    offlineNotice: "You're offline — your answers will be saved and graded once you're back online.",
    submitOnline: "Submit answers",
    submitOffline: "Save answers offline",
    queuedNotice: "Your answers are saved and will be graded once you're back online.",
    score: (marks, total, percent) => `Score: ${marks} / ${total} marks (${percent}%) — `,
    passed: "Passed",
    notPassed: "Not passed",
    practiceNote: "Practice quiz — this never affects your certificate.",
    breakdownHeading: "Answer breakdown",
    correctAnswerWas: (text) => `Correct answer: ${text}`,
    viewCertificate: (code) => `View your certificate (${code})`,
    certificateError: (message) => `Certificate could not be generated: ${message}`,
    tryAgain: "Try again",
  },
  hi: {
    assessments: "मूल्यांकन",
    kind: { quiz: "अभ्यास क्विज़", module_test: "श्रेणीबद्ध मॉड्यूल परीक्षा" },
    assessmentSummary: (questionCount, totalMarks, passPercent) =>
      `${questionCount} प्रश्न · ${totalMarks} अंक · उत्तीर्ण ≥ ${passPercent}%`,
    attemptsUsed: (used, max) => `${max} में से ${used} प्रयास उपयोग किए गए`,
    attemptsExhausted: "आपने इस परीक्षा के लिए अनुमत सभी प्रयास उपयोग कर लिए हैं।",
    offlineNotice: "आप ऑफ़लाइन हैं — ऑनलाइन आते ही आपके उत्तर सहेजे जाएंगे और उनका मूल्यांकन किया जाएगा।",
    submitOnline: "उत्तर जमा करें",
    submitOffline: "उत्तर ऑफ़लाइन सहेजें",
    queuedNotice: "आपके उत्तर सहेजे गए हैं और ऑनलाइन आते ही उनका मूल्यांकन किया जाएगा।",
    score: (marks, total, percent) => `स्कोर: ${marks} / ${total} अंक (${percent}%) — `,
    passed: "उत्तीर्ण",
    notPassed: "अनुत्तीर्ण",
    practiceNote: "अभ्यास क्विज़ — यह आपके प्रमाणपत्र को कभी प्रभावित नहीं करता।",
    breakdownHeading: "उत्तर विवरण",
    correctAnswerWas: (text) => `सही उत्तर: ${text}`,
    viewCertificate: (code) => `अपना प्रमाणपत्र देखें (${code})`,
    certificateError: (message) => `प्रमाणपत्र उत्पन्न नहीं किया जा सका: ${message}`,
    tryAgain: "पुनः प्रयास करें",
  },
};

export function QuizTaker({ accessToken, moduleId }: QuizTakerProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [assessments, setAssessments] = useState<AssessmentWithTotals[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentWithTotals | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestionForTrainee[]>([]);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptLimitReached, setAttemptLimitReached] = useState(false);
  // Distinct from `result` — a queued attempt has no score yet. Grading
  // stays server-side even for an offline submission (never trust a
  // client-reported score), so the real result only exists once this syncs.
  const [queued, setQueued] = useState(false);
  const online = useOnlineStatus();

  // Reset-on-moduleId-change comes from the parent mounting this component
  // with `key={moduleId}` (a fresh mount) rather than resetting state here.
  useEffect(() => {
    getAssessments(accessToken, moduleId)
      .then(setAssessments)
      .catch((err: Error) => setError(err.message));
  }, [accessToken, moduleId]);

  async function selectAssessment(assessment: AssessmentWithTotals) {
    setSelectedAssessment(assessment);
    setAnswers({});
    setResult(null);
    setQueued(false);
    setAttemptLimitReached(false);
    setError(null);
    try {
      const [take, attempts] = await Promise.all([
        getAssessmentToTake(accessToken, assessment.id),
        getAssessmentAttempts(accessToken, assessment.id),
      ]);
      setQuestions(take);
      setAttemptsUsed(attempts.length);
      if (assessment.max_attempts !== null && attempts.length >= assessment.max_attempts) {
        setAttemptLimitReached(true);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssessment) return;
    setError(null);

    if (!online) {
      await enqueueWrite({
        type: "quiz_attempt",
        queuedAt: new Date().toISOString(),
        assessmentId: selectedAssessment.id,
        answers,
      });
      setQueued(true);
      return;
    }

    try {
      setResult(await submitAssessmentAttempt(accessToken, selectedAssessment.id, answers));
      setAttemptsUsed((prev) => prev + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setAttemptLimitReached(true);
        return;
      }
      setError((err as Error).message);
    }
  }

  function retake() {
    setResult(null);
    setAnswers({});
  }

  return (
    // See AssessmentBuilder.tsx's identical comment: `legacy-ui` is applied
    // here directly rather than relying on the caller (TraineeLearnLessons
    // doesn't wrap this one), so the quiz's radio/text inputs get real
    // styling and don't trigger iOS's zoom-on-focus behavior on mobile.
    <div className="quiz-taker legacy-ui">
      <h3>{t.assessments}</h3>
      {error && <p className="form-error">{error}</p>}

      <ul>
        {assessments.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => void selectAssessment(a)}>
              [{t.kind[a.kind]}] {a.title} —{" "}
              {t.assessmentSummary(a.question_count, a.total_marks, a.pass_threshold_percent)}
            </button>
          </li>
        ))}
      </ul>

      {selectedAssessment && selectedAssessment.max_attempts !== null && (
        <p className="quiz-attempts-note">
          {t.attemptsUsed(attemptsUsed, selectedAssessment.max_attempts)}
        </p>
      )}

      {selectedAssessment && attemptLimitReached && !result && (
        <p className="form-error">{t.attemptsExhausted}</p>
      )}

      {selectedAssessment &&
        questions.length > 0 &&
        !result &&
        !queued &&
        !attemptLimitReached && (
          <form onSubmit={handleSubmit} className="quiz-form">
            {!online && <p className="quiz-offline-notice">{t.offlineNotice}</p>}
            {selectedAssessment.kind === "quiz" && <p className="quiz-practice-note">{t.practiceNote}</p>}
            {questions.map((q, i) => (
              <fieldset key={q.id}>
                <legend>
                  {i + 1}. {q.question_text} ({q.marks})
                </legend>
                {q.options.map((opt) => (
                  <label key={opt.id} className="quiz-option">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      value={opt.id}
                      checked={answers[q.id] === opt.id}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                    />
                    {opt.text}
                  </label>
                ))}
              </fieldset>
            ))}
            <button type="submit">{online ? t.submitOnline : t.submitOffline}</button>
          </form>
        )}

      {queued && (
        <div className="quiz-result">
          <p>{t.queuedNotice}</p>
        </div>
      )}

      {result && (
        <div className="quiz-result">
          <p>
            {t.score(
              result.attempt.marks_obtained ?? 0,
              result.attempt.total_marks ?? 0,
              result.attempt.score_percent,
            )}
            <strong>{result.attempt.passed ? t.passed : t.notPassed}</strong>
          </p>
          {selectedAssessment?.kind === "quiz" && <p className="quiz-practice-note">{t.practiceNote}</p>}

          <h4>{t.breakdownHeading}</h4>
          <ul>
            {result.breakdown.map((b) => {
              const q = questions.find((question) => question.id === b.question_id);
              const correctText = q?.options.find((o) => o.id === b.correct_option_id)?.text;
              return (
                <li key={b.question_id}>
                  {q?.question_text} — {b.is_correct ? "✓" : "✗"} ({b.marks_awarded}/{b.marks})
                  {!b.is_correct && correctText && ` — ${t.correctAnswerWas(correctText)}`}
                </li>
              );
            })}
          </ul>

          {result.certificate && (
            <p>
              <a href={`?verify=${result.certificate.certificate_code}`}>
                {t.viewCertificate(result.certificate.certificate_code)}
              </a>
            </p>
          )}
          {result.certificateError && (
            <p className="form-error">{t.certificateError(result.certificateError)}</p>
          )}

          {selectedAssessment &&
            !result.attempt.passed &&
            (selectedAssessment.max_attempts === null ||
              attemptsUsed < selectedAssessment.max_attempts) && (
              <button type="button" onClick={retake}>
                {t.tryAgain}
              </button>
            )}
        </div>
      )}
    </div>
  );
}
