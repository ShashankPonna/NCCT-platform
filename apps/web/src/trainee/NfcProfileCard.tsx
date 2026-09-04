import {
  getVisibilitySettings,
  issuePublicProfileCard,
  updatePublicProfileEnabled,
} from "@ncct/api-client";
import type { VisibilitySettings } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface NfcProfileCardProps {
  accessToken: string;
  publicProfileCode: string | null;
}

// F10 (docs/DECISIONS.md #30) — issuance UI for the trainee's own public
// profile: opt-in toggle, the generated link an NFC card gets written with,
// and a copy button. Self-contained (fetches its own visibility_settings)
// rather than threading state through ProfileEditor, since this consent
// scope is independent of the profile-details form around it.
export function NfcProfileCard({
  accessToken,
  publicProfileCode: initialCode,
}: NfcProfileCardProps) {
  const [visibility, setVisibility] = useState<VisibilitySettings | null>(null);
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVisibilitySettings(accessToken)
      .then(setVisibility)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  const enabled = visibility?.public_profile_enabled ?? false;
  const profileUrl = code ? `${window.location.origin}/?profile=${code}` : null;

  async function handleToggle(next: boolean) {
    setError(null);
    setBusy(true);
    try {
      setVisibility(await updatePublicProfileEnabled(accessToken, next));
      if (next && !code) {
        const result = await issuePublicProfileCard(accessToken);
        setCode(result.public_profile_code);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!profileUrl) return;
    await navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Deliberately a separate action from the toggle above, not implied by
  // switching it off and back on — turning the toggle off already revokes
  // access (public_profile_enabled gates the page regardless of code), so
  // it shouldn't also silently invalidate a card that's still physically
  // fine. Rotating the code is the stronger, explicit step for an actually
  // lost card.
  async function handleReissue() {
    if (!window.confirm("This immediately breaks the link on your current card. Continue?")) return;
    setError(null);
    setBusy(true);
    try {
      const result = await issuePublicProfileCard(accessToken);
      setCode(result.public_profile_code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface-card border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="p-6 border-b border-outline-variant/50 bg-surface-container-lowest/50 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">nfc</span>
        <h3 className="font-headline-md text-[20px] leading-[26px] font-semibold text-primary m-0">
          NFC Profile Card
        </h3>
      </div>

      <div className="p-6 flex flex-col gap-4">
        <p className="font-body-md text-on-surface-variant m-0">
          Publish a card-tappable profile page showing your name, skills, and certifications — no
          login required to view it.
        </p>

        {error && <p className="font-body-sm text-error m-0">{error}</p>}

        <div className="flex items-center gap-3 rounded-lg border border-border-low-contrast bg-surface p-3">
          <div className="flex flex-col flex-1">
            <span className="text-label-md text-primary">Public Profile</span>
            <span className="text-label-sm text-on-surface-variant">
              {enabled ? "Visible to anyone with the link" : "Not published"}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={busy}
            onClick={() => void handleToggle(!enabled)}
            className={`relative h-6 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              enabled ? "bg-interactive" : "bg-outline-variant"
            }`}
          >
            <span
              className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {enabled && profileUrl && (
          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface">
              Link written to your NFC card
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={profileUrl}
                className="flex-1 min-h-[44px] px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-mono text-body-sm text-on-surface"
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="px-4 h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-primary rounded-lg font-label-md text-label-md transition-colors flex items-center gap-1.5 shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copied ? "check" : "content_copy"}
                </span>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="font-body-sm text-on-surface-variant m-0">
              Write this URL as an NDEF record onto your card (e.g. with the NFC Tools app).
            </p>
            <button
              type="button"
              onClick={() => void handleReissue()}
              disabled={busy}
              className="self-start font-label-sm text-label-sm text-error hover:underline disabled:opacity-50"
            >
              Card lost? Generate a new link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
