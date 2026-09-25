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
import { useEffect, useRef, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";
import { useOnlineStatus } from "./offline/network.js";
import { enqueueWrite } from "./offline/syncManager.js";

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
  questionMarks: (marks: number) => string;
  passed: string;
  notPassed: string;
  practiceNote: string;
  breakdownHeading: string;
  correctAnswerWas: (text: string) => string;
  viewCertificate: (code: string) => string;
  certificateError: (message: string) => string;
  tryAgain: string;
  backToTests: string;
  pickTestPrompt: string;
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
    questionMarks: (marks) => `${marks} mark${marks === 1 ? "" : "s"}`,
    passed: "Passed",
    notPassed: "Not passed",
    practiceNote: "Practice quiz — this never affects your certificate.",
    breakdownHeading: "Answer breakdown",
    correctAnswerWas: (text) => `Correct answer: ${text}`,
    viewCertificate: (code) => `View your certificate (${code})`,
    certificateError: (message) => `Certificate could not be generated: ${message}`,
    tryAgain: "Try again",
    backToTests: "← Back to tests",
    pickTestPrompt: "Pick a test from the list to open it here.",
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
    questionMarks: (marks) => `${marks} अंक`,
    passed: "उत्तीर्ण",
    notPassed: "अनुत्तीर्ण",
    practiceNote: "अभ्यास क्विज़ — यह आपके प्रमाणपत्र को कभी प्रभावित नहीं करता।",
    breakdownHeading: "उत्तर विवरण",
    correctAnswerWas: (text) => `सही उत्तर: ${text}`,
    viewCertificate: (code) => `अपना प्रमाणपत्र देखें (${code})`,
    certificateError: (message) => `प्रमाणपत्र उत्पन्न नहीं किया जा सका: ${message}`,
    tryAgain: "पुनः प्रयास करें",
    backToTests: "← परीक्षण सूची पर वापस जाएं",
    pickTestPrompt: "इसे यहां खोलने के लिए सूची से एक परीक्षण चुनें।",
  },
};

export interface QuizTakerState {
  t: QuizTakerText;
  assessments: AssessmentWithTotals[];
  selectedAssessment: AssessmentWithTotals | null;
  questions: AssessmentQuestionForTrainee[];
  attemptsUsed: number;
  answers: Record<string, string>;
  setAnswer: (questionId: string, optionId: string) => void;
  result: SubmitResult | null;
  error: string | null;
  attemptLimitReached: boolean;
  queued: boolean;
  online: boolean;
  openAssessment: (assessment: AssessmentWithTotals) => void;
  closeAssessment: () => void;
  handleSubmit: (e: React.FormEvent) => void;
  retake: () => void;
}

// Split into a hook (all state/data-fetching) plus two presentational
// components (`QuizAssessmentList`, `QuizTestDetail`) instead of one
// component that renders both the picker and the test inline — the caller
// (TraineeLearnLessons) puts the two in different halves of its two-column
// layout: the list alongside the lesson list on the left, the opened test in
// the large main content column on the right where the lesson detail
// normally lives, so a big test doesn't have to fit in a narrow sidebar.
// Direct user request: "on opening this, it should appear to right side
// bigger screen."
export function useQuizTaker(accessToken: string, moduleId: string | null): QuizTakerState {
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

  function closeAssessment() {
    setSelectedAssessment(null);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setQueued(false);
    setAttemptLimitReached(false);
  }

  // This hook is called once per module (not remounted per module the way a
  // component keyed by moduleId would be), so switching modules has to reset
  // the opened test explicitly rather than relying on a fresh mount.
  useEffect(() => {
    setAssessments([]);
    closeAssessment();
    setError(null);
    if (!moduleId) return;
    getAssessments(accessToken, moduleId)
      .then(setAssessments)
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, moduleId]);

  async function openAssessment(assessment: AssessmentWithTotals) {
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

  function setAnswer(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
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

  return {
    t,
    assessments,
    selectedAssessment,
    questions,
    attemptsUsed,
    answers,
    setAnswer,
    result,
    error,
    attemptLimitReached,
    queued,
    online,
    openAssessment,
    closeAssessment,
    handleSubmit,
    retake,
  };
}

// The picker — meant for a narrow sidebar alongside the module/lesson list.
export function QuizAssessmentList({ quiz }: { quiz: QuizTakerState }) {
  const { t } = quiz;
  if (quiz.assessments.length === 0 && !quiz.error) return null;
  return (
    // See AssessmentBuilder.tsx's identical comment: `legacy-ui` is applied
    // here directly rather than relying on the caller (TraineeLearnLessons
    // doesn't wrap this one), so the card buttons get real font/reset
    // styling rather than the browser default.
    <div className="quiz-taker legacy-ui">
      <h3>{t.assessments}</h3>
      {quiz.error && <p className="form-error">{quiz.error}</p>}
      <div className="quiz-assessment-list">
        {quiz.assessments.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`quiz-assessment-card${quiz.selectedAssessment?.id === a.id ? " is-selected" : ""}`}
            onClick={() => void quiz.openAssessment(a)}
          >
            <span className={`quiz-kind-badge quiz-kind-${a.kind}`}>{t.kind[a.kind]}</span>
            <span className="quiz-assessment-title">{a.title}</span>
            <span className="quiz-assessment-meta">
              {t.assessmentSummary(a.question_count, a.total_marks, a.pass_threshold_percent)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// The opened test itself — meant for the large main-content column, so a
// real test reads like one instead of being squeezed into a sidebar.
export function QuizTestDetail({ quiz }: { quiz: QuizTakerState }) {
  const { t, selectedAssessment, questions, answers, result, queued, attemptLimitReached, online } = quiz;
  const containerRef = useRef<HTMLDivElement>(null);

  // Redirect the viewport to the start of the test the moment it's opened
  // (direct user request) — the detail panel now lives in the page's large
  // main column rather than inline below the picker, so on a narrow/mobile
  // layout (the two columns stack) it can otherwise render off-screen below
  // the fold with no visual cue that anything happened.
  useEffect(() => {
    if (selectedAssessment) {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Deliberately keyed on the id, not the whole object, so re-fetching the
    // same assessment (e.g. a fresh `getAssessments` after an edit) doesn't
    // re-trigger the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssessment?.id]);

  // Same for landing on the result/score once grading (or offline queuing)
  // completes — the result block replaces the question form in place, so
  // scrolling back to the top of this same panel is enough to bring it into
  // view without a second ref.
  useEffect(() => {
    if (result || queued) {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result, queued]);

  if (!selectedAssessment) return null;

  return (
    <div
      ref={containerRef}
      className="quiz-taker quiz-taker-detail legacy-ui rounded-xl border border-border-low-contrast bg-surface-card p-6"
    >
      <button type="button" className="quiz-back-button" onClick={quiz.closeAssessment}>
        {t.backToTests}
      </button>

      {selectedAssessment.max_attempts !== null && (
        <p className="quiz-attempts-note">{t.attemptsUsed(quiz.attemptsUsed, selectedAssessment.max_attempts)}</p>
      )}

      {attemptLimitReached && !result && <p className="form-error">{t.attemptsExhausted}</p>}

      {questions.length > 0 && !result && !queued && !attemptLimitReached && (
        <form onSubmit={quiz.handleSubmit} className="quiz-form quiz-form-big">
          <div className="quiz-paper-header">
            <h2>{selectedAssessment.title}</h2>
            <p className="quiz-paper-meta">
              {t.assessmentSummary(
                selectedAssessment.question_count,
                selectedAssessment.total_marks,
                selectedAssessment.pass_threshold_percent,
              )}
            </p>
          </div>
          {!online && <p className="quiz-offline-notice">{t.offlineNotice}</p>}
          {selectedAssessment.kind === "quiz" && <p className="quiz-practice-note">{t.practiceNote}</p>}
          {questions.map((q, i) => (
            <fieldset key={q.id} className="quiz-question">
              <legend>
                <span className="quiz-question-number">{i + 1}</span>
                <span className="quiz-question-text">{q.question_text}</span>
                <span className="quiz-question-marks">{t.questionMarks(q.marks)}</span>
              </legend>
              <div className="quiz-option-list">
                {q.options.map((opt) => (
                  <label key={opt.id} className={`quiz-option${answers[q.id] === opt.id ? " is-selected" : ""}`}>
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      value={opt.id}
                      checked={answers[q.id] === opt.id}
                      onChange={() => quiz.setAnswer(q.id, opt.id)}
                    />
                    <span className="quiz-option-text">{opt.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button type="submit" className="quiz-submit-button">
            {online ? t.submitOnline : t.submitOffline}
          </button>
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
            {t.score(result.attempt.marks_obtained ?? 0, result.attempt.total_marks ?? 0, result.attempt.score_percent)}
            <strong>{result.attempt.passed ? t.passed : t.notPassed}</strong>
          </p>
          {selectedAssessment.kind === "quiz" && <p className="quiz-practice-note">{t.practiceNote}</p>}

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
          {result.certificateError && <p className="form-error">{t.certificateError(result.certificateError)}</p>}

          {!result.attempt.passed &&
            (selectedAssessment.max_attempts === null || quiz.attemptsUsed < selectedAssessment.max_attempts) && (
              <button type="button" onClick={quiz.retake}>
                {t.tryAgain}
              </button>
            )}
        </div>
      )}
    </div>
  );
}
