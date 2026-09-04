import { bindNfcTag, kioskNfcLookup } from "@ncct/api-client";
import type { KioskProfileResult } from "@ncct/shared-types";
import { useCallback, useRef, useState } from "react";
import { SkillChip, StatusPill } from "./trainee/pieces.js";

interface KioskNfcReaderProps {
  accessToken: string;
}

// F10 kiosk terminal (docs/DECISIONS.md #30) — reads UIDs over Web Serial
// from the ESP32+RC522 reader tethered by USB, rather than polling an
// http:// endpoint on the reader's own WiFi. Chosen specifically because
// Web Serial requires a secure context (satisfied by this site's HTTPS),
// so unlike an ESP32 HTTP server it works against the real deployed site,
// not only against a localhost dev server — no mixed-content problem.
export function KioskNfcReader({ accessToken }: KioskNfcReaderProps) {
  const [connected, setConnected] = useState(false);
  const [lastUid, setLastUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<KioskProfileResult | null | "loading">(null);
  const [unbound, setUnbound] = useState<string | null>(null);
  const [bindTraineeId, setBindTraineeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const portRef = useRef<SerialPort | null>(null);
  const seenRef = useRef<string>("");

  const onScan = useCallback(
    async (uid: string) => {
      if (uid === seenRef.current) return; // ignore a repeated line for the same tap
      seenRef.current = uid;
      setLastUid(uid);
      setUnbound(null);
      setError(null);
      setProfile("loading");
      try {
        const result = await kioskNfcLookup(accessToken, uid);
        if (!result) {
          setProfile(null);
          setUnbound(uid);
        } else {
          setProfile(result);
        }
      } catch (err) {
        setProfile(null);
        setError((err as Error).message);
      }
    },
    [accessToken],
  );

  async function connect() {
    setError(null);
    if (!navigator.serial) {
      setError("This browser doesn't support Web Serial — use Chrome or Edge on desktop.");
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setConnected(true);
      void readLoop(port);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function readLoop(port: SerialPort) {
    if (!port.readable) return;
    const decoder = new TextDecoderStream();
    // TS's lib.dom types TextDecoderStream.writable as
    // WritableStream<BufferSource>, which pipeTo's generic won't accept
    // directly against a ReadableStream<Uint8Array> — a known DOM-lib typing
    // gap, not a real runtime mismatch (Uint8Array is a BufferSource).
    const closed = port.readable.pipeTo(decoder.writable as WritableStream<Uint8Array>);
    const reader = decoder.readable.getReader();

    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line.startsWith("UID:")) {
            void onScan(line.slice(4));
          }
        }
      }
    } catch {
      // Port unplugged mid-read — fall through to disconnect below.
    } finally {
      reader.releaseLock();
      await closed.catch(() => undefined);
      setConnected(false);
    }
  }

  function initials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  async function handleBind() {
    if (!unbound || !bindTraineeId.trim()) return;
    setError(null);
    try {
      await bindNfcTag(accessToken, bindTraineeId.trim(), unbound);
      seenRef.current = ""; // let the same tap re-resolve after binding
      const result = await kioskNfcLookup(accessToken, unbound);
      setProfile(result);
      setUnbound(null);
      setBindTraineeId("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-2xl mx-auto w-full flex flex-col gap-6 text-left">
      <div>
        <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0">
          NFC Kiosk
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Tap a trainee&apos;s card on the reader to look up their profile.
        </p>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      )}

      {!connected ? (
        <button
          type="button"
          onClick={() => void connect()}
          className="self-start px-6 h-touch-target bg-cta text-on-primary hover:bg-cta-hover rounded-full font-label-md text-label-md transition-colors flex items-center gap-2 shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">usb</span>
          Connect Reader
        </button>
      ) : (
        <div className="flex items-center gap-2 text-status-success font-label-md">
          <span className="material-symbols-outlined text-[18px]">nfc</span>
          Reader connected — waiting for a tap
        </div>
      )}

      {lastUid && (
        <p className="font-body-sm text-on-surface-variant">
          Last scan:{" "}
          <code className="font-mono bg-surface-container px-2 py-0.5 rounded">{lastUid}</code>
        </p>
      )}

      {profile === "loading" && (
        <div className="flex items-center gap-2 text-on-surface-variant">
          <div className="animate-spin material-symbols-outlined text-[20px]">
            progress_activity
          </div>
          Looking up card...
        </div>
      )}

      {profile && profile !== "loading" && (
        <div className="bg-surface-card border border-outline-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 flex items-center gap-4 border-b border-outline-variant/50 bg-surface-container-lowest/50">
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-container font-headline-md text-headline-md text-primary"
            >
              {initials(profile.full_name)}
            </div>
            <div>
              <h2 className="font-headline-md text-headline-md text-primary m-0">
                {profile.full_name}
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
                Member since {formatDate(profile.member_since)}
              </p>
            </div>
          </div>

          <div className="p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant m-0 mb-1">Phone</p>
                <p className="font-body-md text-body-md text-on-surface m-0">
                  {profile.phone ?? "—"}
                </p>
              </div>
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant m-0 mb-1">
                  Cooperative
                </p>
                <p className="font-body-md text-body-md text-on-surface m-0">
                  {profile.cooperative_affiliation ?? "—"}
                </p>
              </div>
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant m-0 mb-1">
                  Sessions Attended
                </p>
                <p className="font-body-md text-body-md text-on-surface m-0">
                  {profile.attendance_count}
                </p>
              </div>
            </div>

            {profile.skills.length > 0 && (
              <div>
                <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide m-0 mb-2">
                  Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <SkillChip key={skill} label={skill} acquired />
                  ))}
                </div>
              </div>
            )}

            {profile.programmes.length > 0 && (
              <div>
                <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide m-0 mb-2">
                  Programmes
                </h3>
                <div className="flex flex-col gap-2">
                  {profile.programmes.map((prog, i) => (
                    <div
                      key={`${prog.title}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/50 px-4 py-2"
                    >
                      <span className="font-body-md text-body-md text-on-surface">{prog.title}</span>
                      <StatusPill status={prog.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.certificates.length > 0 && (
              <div>
                <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide m-0 mb-2">
                  Certificates
                </h3>
                <div className="flex flex-col gap-2">
                  {profile.certificates.map((cert) => (
                    <div
                      key={cert.certificate_code}
                      className="flex items-center gap-3 rounded-lg border border-outline-variant/50 px-4 py-3"
                    >
                      <span className="material-symbols-outlined text-primary">
                        workspace_premium
                      </span>
                      <div>
                        <p className="font-body-md text-body-md text-on-surface m-0">
                          {cert.programme_title ?? "Certificate"}
                        </p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
                          {cert.institution_name ?? "—"} · {formatDate(cert.issued_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.skills.length === 0 &&
              profile.programmes.length === 0 &&
              profile.certificates.length === 0 && (
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
                  No programme, skill, or certificate records yet.
                </p>
              )}
          </div>
        </div>
      )}

      {unbound && (
        <div className="bg-surface-card border border-dashed border-outline-variant rounded-xl p-6">
          <p className="font-body-md text-on-surface mb-3">
            This card isn&apos;t registered to any trainee yet. Bind it now:
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={bindTraineeId}
              onChange={(e) => setBindTraineeId(e.target.value)}
              placeholder="Trainee ID (UUID)"
              className="flex-1 min-h-[44px] px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md"
            />
            <button
              type="button"
              onClick={() => void handleBind()}
              disabled={!bindTraineeId.trim()}
              className="px-6 h-touch-target bg-cta text-on-primary hover:bg-cta-hover rounded-full font-label-md text-label-md disabled:opacity-50"
            >
              Bind Card
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
