import { enrollFaceEmbedding, getFaceEmbeddingStatus } from "@ncct/api-client";
import { useEffect, useState } from "react";
import { FaceCapture } from "./FaceCapture.js";

interface FaceEnrollmentProps {
  accessToken: string;
  onEnrolled?: () => void;
}

// Consent must be explicitly given before any capture happens — the
// checkbox gates rendering FaceCapture at all, not just gates the submit
// button, per CLAUDE.md's DPDP Act 2023 rule (consent before any biometric
// embedding is stored).
export function FaceEnrollment({ accessToken, onEnrolled }: FaceEnrollmentProps) {
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
    return <p>Face enrolled{success ? " ✓" : ""}. You can use face check-in for attendance.</p>;
  }

  return (
    <div className="face-enrollment">
      <p>
        Enroll your face for attendance check-in. Your camera image never leaves this device —
        only a numeric face descriptor is sent and stored.
      </p>
      <label>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I consent to my face being used for attendance verification.
      </label>
      {error && <p className="form-error">{error}</p>}
      {consent && <FaceCapture actionLabel="Enroll face" onCapture={handleCapture} />}
    </div>
  );
}
