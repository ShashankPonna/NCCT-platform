import { enrollFaceEmbedding, getFaceEmbeddingStatus } from "@ncct/api-client";
import { useEffect, useState } from "react";
import { FaceCapture } from "./FaceCapture.js";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

interface FaceEnrollmentProps {
  accessToken: string;
  onEnrolled?: () => void;
}

interface FaceEnrollmentText {
  enrolled: (success: boolean) => string;
  intro: string;
  consentLabel: string;
  actionLabel: string;
}

const content: Record<Locale, FaceEnrollmentText> = {
  en: {
    enrolled: (success) => `Face enrolled${success ? " ✓" : ""}. You can use face check-in for attendance.`,
    intro:
      "Enroll your face for attendance check-in. Your camera image never leaves this device — only a numeric face descriptor is sent and stored.",
    consentLabel: "I consent to my face being used for attendance verification.",
    actionLabel: "Enroll face",
  },
  hi: {
    enrolled: (success) =>
      `चेहरा नामांकित हो गया${success ? " ✓" : ""}। आप उपस्थिति के लिए फेस चेक-इन का उपयोग कर सकते हैं।`,
    intro:
      "उपस्थिति चेक-इन के लिए अपना चेहरा नामांकित करें। आपकी कैमरा छवि कभी भी इस डिवाइस से बाहर नहीं जाती — केवल एक संख्यात्मक फेस डिस्क्रिप्टर भेजा और संग्रहीत किया जाता है।",
    consentLabel: "मैं सहमति देता/देती हूं कि मेरे चेहरे का उपयोग उपस्थिति सत्यापन के लिए किया जाए।",
    actionLabel: "चेहरा नामांकित करें",
  },
};

// Consent must be explicitly given before any capture happens — the
// checkbox gates rendering FaceCapture at all, not just gates the submit
// button, per CLAUDE.md's DPDP Act 2023 rule (consent before any biometric
// embedding is stored).
export function FaceEnrollment({ accessToken, onEnrolled }: FaceEnrollmentProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getFaceEmbeddingStatus(accessToken)
      .then((status) => setEnrolled(status.enrolled))
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  async function handleCapture(embedding: number[]) {
    setError(null);
    try {
      await enrollFaceEmbedding(accessToken, embedding);
      setEnrolled(true);
      setSuccess(true);
      onEnrolled?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (enrolled === null) return null;

  if (enrolled) {
    return <p>{t.enrolled(success)}</p>;
  }

  return (
    // See FaceCapture.tsx's identical comment on `legacy-ui`.
    <div className="face-enrollment legacy-ui">
      <p>{t.intro}</p>
      <label>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {t.consentLabel}
      </label>
      {error && <p className="form-error">{error}</p>}
      {consent && <FaceCapture actionLabel={t.actionLabel} onCapture={handleCapture} />}
    </div>
  );
}
