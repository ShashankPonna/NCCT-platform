import { getAssessmentToTake, getAssessments, submitAssessmentAttempt } from "@ncct/api-client";
import type {
  Assessment,
  AssessmentAttempt,
  AssessmentQuestionForTrainee,
  Certificate,
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
  certificate: Certificate | null;
  certificateError?: string;
}

interface QuizTakerText {
  assessments: string;
  offlineNotice: string;
  submitOnline: string;
  submitOffline: string;
  queuedNotice: string;
  score: (percent: number) => string;
  passed: string;
  notPassed: string;
  viewCertificate: (code: string) => string;
  certificateError: (message: string) => string;
}

const content: Record<Locale, QuizTakerText> = {
  en: {
    assessments: "Assessments",
    offlineNotice: "You're offline — your answers will be saved and graded once you're back online.",
    submitOnline: "Submit answers",
    submitOffline: "Save answers offline",
    queuedNotice: "Your answers are saved and will be graded once you're back online.",
    score: (percent) => `Score: ${percent}% — `,
    passed: "Passed",
    notPassed: "Not passed",
    viewCertificate: (code) => `View your certificate (${code})`,
    certificateError: (message) => `Certificate could not be generated: ${message}`,
  },
  hi: {
    assessments: "मूल्यांकन",
    offlineNotice: "आप ऑफ़लाइन हैं — ऑनलाइन आते ही आपके उत्तर सहेजे जाएंगे और उनका मूल्यांकन किया जाएगा।",
    submitOnline: "उत्तर जमा करें",
    submitOffline: "उत्तर ऑफ़लाइन सहेजें",
    queuedNotice: "आपके उत्तर सहेजे गए हैं और ऑनलाइन आते ही उनका मूल्यांकन किया जाएगा।",
    score: (percent) => `स्कोर: ${percent}% — `,
    passed: "उत्तीर्ण",
    notPassed: "अनुत्तीर्ण",
    viewCertificate: (code) => `अपना प्रमाणपत्र देखें (${code})`,
    certificateError: (message) => `प्रमाणपत्र उत्पन्न नहीं किया जा सका: ${message}`,
  },
};

export function QuizTaker({ accessToken, moduleId }: QuizTakerProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestionForTrainee[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function selectAssessment(assessment: Assessment) {
    setSelectedAssessment(assessment);
    setAnswers({});
    setResult(null);
    setQueued(false);
    setError(null);
    try {
      setQuestions(await getAssessmentToTake(accessToken, assessment.id));
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
    } catch (err) {
      setError((err as Error).message);
    }
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
            <button type="button" onClick={() => selectAssessment(a)}>
              {a.title}
            </button>
          </li>
        ))}
      </ul>

      {selectedAssessment && questions.length > 0 && !result && !queued && (
        <form onSubmit={handleSubmit} className="quiz-form">
          {!online && <p className="quiz-offline-notice">{t.offlineNotice}</p>}
          {questions.map((q, i) => (
            <fieldset key={q.id}>
              <legend>
                {i + 1}. {q.question_text}
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
            {t.score(result.attempt.score_percent)}
            <strong>{result.attempt.passed ? t.passed : t.notPassed}</strong>
          </p>
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
        </div>
      )}
    </div>
  );
}
