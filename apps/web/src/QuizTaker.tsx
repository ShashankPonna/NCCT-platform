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
import { errorText, useOnlineStatus } from "./offline/network.js";
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
  statQuestions: string;
  statMarks: string;
  statPassMark: string;
  questionOf: (index: number, total: number) => string;
  answeredCount: (answered: number, total: number) => string;
  answerAllHint: string;
  submitting: string;
  serverGraded: string;
  yourAnswer: string;
  notAnswered: string;
  certificateIssued: string;
  certificateReady: string;
}

const content: Record<Locale, QuizTakerText> = {
  en: {
    assessments: "Assessments",
    kind: { quiz: "Practice Quiz", module_test: "Graded Module Test" },
    assessmentSummary: (questionCount, totalMarks, passPercent) =>
      `${questionCount} question${questionCount === 1 ? "" : "s"} · ${totalMarks} marks · pass ≥ ${passPercent}%`,
    attemptsUsed: (used, max) => `${used} of ${max} attempts used`,
    attemptsExhausted: "You've used every allowed attempt for this test.",
    offlineNotice:
      "You're offline — your answers will be saved and graded once you're back online.",
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
    backToTests: "Back to tests",
    pickTestPrompt: "Pick a test from the list to open it here.",
    statQuestions: "Questions",
    statMarks: "Total marks",
    statPassMark: "Pass mark",
    questionOf: (index, total) => `Question ${index} of ${total}`,
    answeredCount: (answered, total) => `${answered} of ${total} answered`,
    answerAllHint: "Answer every question to submit.",
    submitting: "Grading…",
    serverGraded: "Graded securely on the server.",
    yourAnswer: "Your answer",
    notAnswered: "Not answered",
    certificateIssued: "Certificate issued!",
    certificateReady:
      "Your course certificate is ready. You'll also find it under My Certificates.",
  },
  hi: {
    assessments: "मूल्यांकन",
    kind: { quiz: "अभ्यास क्विज़", module_test: "श्रेणीबद्ध मॉड्यूल परीक्षा" },
    assessmentSummary: (questionCount, totalMarks, passPercent) =>
      `${questionCount} प्रश्न · ${totalMarks} अंक · उत्तीर्ण ≥ ${passPercent}%`,
    attemptsUsed: (used, max) => `${max} में से ${used} प्रयास उपयोग किए गए`,
    attemptsExhausted: "आपने इस परीक्षा के लिए अनुमत सभी प्रयास उपयोग कर लिए हैं।",
    offlineNotice:
      "आप ऑफ़लाइन हैं — ऑनलाइन आते ही आपके उत्तर सहेजे जाएंगे और उनका मूल्यांकन किया जाएगा।",
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
    backToTests: "परीक्षण सूची पर वापस जाएं",
    pickTestPrompt: "इसे यहां खोलने के लिए सूची से एक परीक्षण चुनें।",
    statQuestions: "प्रश्न",
    statMarks: "कुल अंक",
    statPassMark: "उत्तीर्ण अंक",
    questionOf: (index, total) => `प्रश्न ${index} / ${total}`,
    answeredCount: (answered, total) => `${total} में से ${answered} उत्तर दिए`,
    answerAllHint: "जमा करने के लिए सभी प्रश्नों के उत्तर दें।",
    submitting: "मूल्यांकन हो रहा है…",
    serverGraded: "सर्वर पर सुरक्षित रूप से मूल्यांकन किया जाता है।",
    yourAnswer: "आपका उत्तर",
    notAnswered: "उत्तर नहीं दिया",
    certificateIssued: "प्रमाणपत्र जारी हुआ!",
    certificateReady: "आपका कोर्स प्रमाणपत्र तैयार है। यह मेरे प्रमाणपत्र में भी मिलेगा।",
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
  submitting: boolean;
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
  const [submitting, setSubmitting] = useState(false);
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
      .catch((err: Error) => setError(errorText(err)));
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
      setError(errorText(err));
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

    setSubmitting(true);
    try {
      setResult(await submitAssessmentAttempt(accessToken, selectedAssessment.id, answers));
      setAttemptsUsed((prev) => prev + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setAttemptLimitReached(true);
        return;
      }
      setError(errorText(err));
    } finally {
      setSubmitting(false);
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
    submitting,
    online,
    openAssessment,
    closeAssessment,
    handleSubmit,
    retake,
  };
}

const OPTION_LETTERS = "ABCDEFGHIJ";

function KindBadge({ kind, label }: { kind: AssessmentKind; label: string }) {
  const graded = kind === "module_test";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label-sm font-semibold ${
        graded ? "bg-accent/15 text-accent" : "bg-surface-container-high text-on-surface-variant"
      }`}
    >
      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
        {graded ? "workspace_premium" : "edit_note"}
      </span>
      {label}
    </span>
  );
}

// The picker — meant for a narrow sidebar alongside the module/lesson list.
export function QuizAssessmentList({ quiz }: { quiz: QuizTakerState }) {
  const { t } = quiz;
  if (quiz.assessments.length === 0 && !quiz.error) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border-low-contrast bg-surface-card text-left">
      <div className="flex items-center gap-2 border-b border-border-low-contrast bg-surface-container-low p-4">
        <span className="material-symbols-outlined text-[22px] text-accent" aria-hidden="true">
          quiz
        </span>
        <h3 className="font-headline text-headline-sm text-primary">{t.assessments}</h3>
      </div>
      {quiz.error && <p className="px-4 pt-3 text-body-sm text-status-rejected">{quiz.error}</p>}
      <ul className="flex flex-col gap-2 p-3">
        {quiz.assessments.map((a) => {
          const selected = quiz.selectedAssessment?.id === a.id;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => void quiz.openAssessment(a)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border-low-contrast bg-surface-container-lowest hover:border-accent/60"
                }`}
              >
                <span className="min-w-0 flex-grow">
                  <KindBadge kind={a.kind} label={t.kind[a.kind]} />
                  <span className="mt-1.5 block text-label-lg font-semibold text-on-background">
                    {a.title}
                  </span>
                  <span className="mt-0.5 block text-label-sm text-on-surface-variant">
                    {t.assessmentSummary(a.question_count, a.total_marks, a.pass_threshold_percent)}
                  </span>
                </span>
                <span
                  className="material-symbols-outlined text-[20px] text-on-surface-variant"
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low px-3 py-2">
      <p className="text-label-sm text-on-surface-variant">{label}</p>
      <p className="font-metric-mono text-headline-sm text-on-background">{value}</p>
    </div>
  );
}

function ScoreRing({ percent, passed }: { percent: number; passed: boolean }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          className="stroke-surface-container-high"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, Math.max(0, percent)) / 100)}
          className={`transition-all duration-700 ${passed ? "stroke-status-success" : "stroke-status-rejected"}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-metric-mono text-headline-md text-on-background">
        {percent}%
      </span>
    </div>
  );
}

// The opened test itself — meant for the large main-content column, so a
// real test reads like one instead of being squeezed into a sidebar.
export function QuizTestDetail({ quiz }: { quiz: QuizTakerState }) {
  const {
    t,
    selectedAssessment,
    questions,
    answers,
    result,
    queued,
    attemptLimitReached,
    online,
    submitting,
  } = quiz;
  const containerRef = useRef<HTMLDivElement>(null);

  // Bring the test (and later its result) into view: on a stacked mobile
  // layout the detail column renders below the fold otherwise.
  useEffect(() => {
    if (selectedAssessment) {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssessment?.id]);

  useEffect(() => {
    if (result || queued) {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result, queued]);

  if (!selectedAssessment) return null;

  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;
  const passMarks = Math.ceil(
    (selectedAssessment.total_marks * selectedAssessment.pass_threshold_percent) / 100,
  );
  const showForm = questions.length > 0 && !result && !queued && !attemptLimitReached;

  return (
    <div ref={containerRef} className="flex scroll-mt-24 flex-col gap-4 text-left">
      <div className="rounded-xl border border-border-low-contrast bg-surface-card p-5 md:p-6">
        <button
          type="button"
          onClick={quiz.closeAssessment}
          className="mb-4 flex w-fit items-center gap-1 text-label-md font-semibold text-accent hover:underline"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_back
          </span>
          {t.backToTests}
        </button>
        <KindBadge kind={selectedAssessment.kind} label={t.kind[selectedAssessment.kind]} />
        <h2 className="mt-2 font-headline text-headline-lg-mobile text-primary md:text-headline-lg">
          {selectedAssessment.title}
        </h2>
        <div className="mt-4 grid grid-cols-3 gap-2 md:gap-3">
          <Stat label={t.statQuestions} value={String(selectedAssessment.question_count)} />
          <Stat label={t.statMarks} value={String(selectedAssessment.total_marks)} />
          <Stat
            label={`${t.statPassMark} · ${selectedAssessment.pass_threshold_percent}%`}
            value={String(passMarks)}
          />
        </div>
        {selectedAssessment.max_attempts !== null && (
          <p className="mt-3 text-label-sm text-on-surface-variant">
            {t.attemptsUsed(quiz.attemptsUsed, selectedAssessment.max_attempts)}
          </p>
        )}
        {selectedAssessment.kind === "quiz" && (
          <p className="mt-3 text-label-sm text-on-surface-variant">{t.practiceNote}</p>
        )}
      </div>

      {quiz.error && (
        <p className="rounded-lg border border-status-rejected/40 bg-status-rejected/10 p-3 text-body-sm text-status-rejected">
          {quiz.error}
        </p>
      )}

      {attemptLimitReached && !result && (
        <p className="rounded-lg border border-status-rejected/40 bg-status-rejected/10 p-3 text-body-sm text-status-rejected">
          {t.attemptsExhausted}
        </p>
      )}

      {showForm && (
        <form onSubmit={quiz.handleSubmit} className="flex flex-col gap-4">
          <div className="sticky top-2 z-10 rounded-lg border border-border-low-contrast bg-surface-card/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="mb-1.5 flex items-center justify-between text-label-sm">
              <span className="font-semibold text-on-background">
                {t.answeredCount(answeredCount, questions.length)}
              </span>
              <span className="font-metric-mono text-on-surface-variant">
                {Math.round((answeredCount / questions.length) * 100)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${(answeredCount / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {!online && (
            <p className="rounded-lg border border-status-pending/40 bg-status-pending/10 p-3 text-body-sm text-on-background">
              {t.offlineNotice}
            </p>
          )}

          {questions.map((q, i) => (
            <fieldset
              key={q.id}
              className="rounded-xl border border-border-low-contrast bg-surface-card p-5 md:p-6"
            >
              <legend className="sr-only">{t.questionOf(i + 1, questions.length)}</legend>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                  {t.questionOf(i + 1, questions.length)}
                </span>
                <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-metric-mono text-label-sm text-on-surface-variant">
                  {t.questionMarks(q.marks)}
                </span>
              </div>
              <p className="mb-4 text-body-lg font-semibold text-on-background">
                {q.question_text}
              </p>
              <div className="flex flex-col gap-2">
                {q.options.map((opt, oi) => {
                  const checked = answers[q.id] === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={`flex min-h-touch-target cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-accent ${
                        checked
                          ? "border-accent bg-accent/10"
                          : "border-border-low-contrast bg-surface-container-lowest hover:border-accent/60"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={opt.id}
                        checked={checked}
                        onChange={() => quiz.setAnswer(q.id, opt.id)}
                        className="sr-only"
                      />
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-metric-mono text-label-md font-bold ${
                          checked
                            ? "bg-accent text-white"
                            : "bg-surface-container-high text-on-surface-variant"
                        }`}
                        aria-hidden="true"
                      >
                        {OPTION_LETTERS[oi] ?? oi + 1}
                      </span>
                      <span className="flex-grow text-body-md text-on-background">{opt.text}</span>
                      {checked && (
                        <span
                          className="material-symbols-outlined text-[20px] text-accent"
                          aria-hidden="true"
                        >
                          check_circle
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="rounded-xl border border-border-low-contrast bg-surface-card p-4">
            <button
              type="submit"
              disabled={!allAnswered || submitting}
              className="flex min-h-touch-target w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-label-lg font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                {submitting ? "hourglass_top" : online ? "send" : "save"}
              </span>
              {submitting ? t.submitting : online ? t.submitOnline : t.submitOffline}
            </button>
            <p className="mt-2 flex items-center justify-center gap-1 text-center text-label-sm text-on-surface-variant">
              {allAnswered ? (
                <>
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    lock
                  </span>
                  {t.serverGraded}
                </>
              ) : (
                t.answerAllHint
              )}
            </p>
          </div>
        </form>
      )}

      {queued && (
        <div className="flex items-center gap-3 rounded-xl border border-status-pending/40 bg-status-pending/10 p-5">
          <span
            className="material-symbols-outlined text-[28px] text-status-pending"
            aria-hidden="true"
          >
            cloud_upload
          </span>
          <p className="text-body-md text-on-background">{t.queuedNotice}</p>
        </div>
      )}

      {result && (
        <>
          <div
            className={`flex flex-col items-center gap-5 rounded-xl border p-6 text-center md:flex-row md:text-left ${
              result.attempt.passed
                ? "border-status-success/40 bg-status-success/10"
                : "border-status-rejected/40 bg-status-rejected/10"
            }`}
          >
            <ScoreRing percent={result.attempt.score_percent} passed={result.attempt.passed} />
            <div className="flex-grow">
              <p
                className={`inline-flex items-center gap-1.5 font-headline text-headline-md ${
                  result.attempt.passed ? "text-status-success" : "text-status-rejected"
                }`}
              >
                <span className="material-symbols-outlined text-[26px]" aria-hidden="true">
                  {result.attempt.passed ? "verified" : "cancel"}
                </span>
                {result.attempt.passed ? t.passed : t.notPassed}
              </p>
              <p className="mt-1 font-metric-mono text-headline-sm text-on-background">
                {result.attempt.marks_obtained ?? 0} / {result.attempt.total_marks ?? 0}
              </p>
              <p className="mt-1 flex items-center justify-center gap-1 text-label-sm text-on-surface-variant md:justify-start">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  lock
                </span>
                {t.serverGraded}
              </p>
            </div>
            {!result.attempt.passed &&
              (selectedAssessment.max_attempts === null ||
                quiz.attemptsUsed < selectedAssessment.max_attempts) && (
                <button
                  type="button"
                  onClick={quiz.retake}
                  className="inline-flex min-h-touch-target items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-label-md font-semibold text-white hover:opacity-90"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    replay
                  </span>
                  {t.tryAgain}
                </button>
              )}
          </div>

          {result.certificate && (
            <div className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent/10 p-5 md:flex-row md:items-center">
              <span
                className="material-symbols-outlined text-[36px] text-accent"
                aria-hidden="true"
              >
                workspace_premium
              </span>
              <div className="flex-grow">
                <p className="font-headline text-headline-sm text-on-background">
                  {t.certificateIssued}
                </p>
                <p className="text-body-sm text-on-surface-variant">{t.certificateReady}</p>
              </div>
              <a
                href={`/?verify=${encodeURIComponent(result.certificate.certificate_code)}`}
                className="inline-flex min-h-touch-target shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-label-md font-semibold text-white hover:opacity-90"
              >
                {t.viewCertificate(result.certificate.certificate_code)}
              </a>
            </div>
          )}
          {result.certificateError && (
            <p className="rounded-lg border border-status-rejected/40 bg-status-rejected/10 p-3 text-body-sm text-status-rejected">
              {t.certificateError(result.certificateError)}
            </p>
          )}
          {selectedAssessment.kind === "quiz" && (
            <p className="text-label-sm text-on-surface-variant">{t.practiceNote}</p>
          )}

          <div className="rounded-xl border border-border-low-contrast bg-surface-card p-5 md:p-6">
            <h3 className="mb-3 font-headline text-headline-sm text-primary">
              {t.breakdownHeading}
            </h3>
            <ol className="flex flex-col gap-2">
              {result.breakdown.map((b, i) => {
                const q = questions.find((question) => question.id === b.question_id);
                const correctText = q?.options.find((o) => o.id === b.correct_option_id)?.text;
                const chosenText = q?.options.find((o) => o.id === answers[b.question_id])?.text;
                return (
                  <li
                    key={b.question_id}
                    className="flex gap-3 rounded-lg bg-surface-container-low p-3"
                  >
                    <span
                      className={`material-symbols-outlined mt-0.5 text-[22px] ${
                        b.is_correct ? "text-status-success" : "text-status-rejected"
                      }`}
                      aria-label={b.is_correct ? "✓" : "✗"}
                    >
                      {b.is_correct ? "check_circle" : "cancel"}
                    </span>
                    <div className="min-w-0 flex-grow">
                      <p className="text-body-md font-semibold text-on-background">
                        {i + 1}. {q?.question_text}
                      </p>
                      <p className="mt-0.5 text-body-sm text-on-surface-variant">
                        {t.yourAnswer}: {chosenText ?? t.notAnswered}
                      </p>
                      {!b.is_correct && correctText && (
                        <p className="mt-0.5 text-body-sm text-status-success">
                          {t.correctAnswerWas(correctText)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-metric-mono text-label-md font-semibold text-on-background">
                      {b.marks_awarded}/{b.marks}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
