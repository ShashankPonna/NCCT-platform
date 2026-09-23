import { ApiError, bindNfcTag, kioskFaceCheckIn, kioskNfcLookup } from "@ncct/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { captureFrame, extractEmbedding, withCaptureRetries } from "./kioskCapture.js";
import { useKioskReader } from "./useKioskReader.js";

interface KioskTerminalProps {
  accessToken: string;
}

interface LogEntry {
  at: string;
  text: string;
  kind: "in" | "out" | "info" | "good" | "bad";
}

// The hardware-driven kiosk: a student taps, positions, presses the button,
// and gets a verdict on the OLED — no staff interaction per student.
//
// This screen exists as one component because the reader (card taps, button
// presses) and the camera both need to be resolved into one linear
// conversation per student — splitting NFC and face capture across two tabs,
// as they were before, makes that flow impossible.
//
// The browser is the only part that can run @vladmandic/human, so it stays in
// the loop: it resolves the card, extracts the embedding, and relays the
// server's verdict back to the ESP32. The match itself is always recomputed
// server-side — this screen never decides it (CLAUDE.md).
// The reader/camera addresses are the kiosk's own local hardware endpoints.
// Both boards advertise themselves via mDNS at these fixed hostnames (see
// the firmware's own MDNS_HOSTNAME, ESP32-CONTROLLER/arduino/kiosk_controller
// and ESP32-CAM/arduino/kiosk_capture_server), which keep working across
// DHCP lease changes and even a different network entirely — unlike a raw
// numeric IP, which changes with both. No longer user-editable here: with
// mDNS resolving on any normal network (true out of the box on macOS/Linux,
// and in Chrome/Edge on Windows without any extra install), there's nothing
// for a staff member to ever type. If mDNS is ever blocked on a given
// network, fix it at the source — reflash that board's MDNS_HOSTNAME or
// resolve the network issue — rather than hardcoding a numeric IP here that
// would just go stale on the next DHCP lease.
const READER_URL = "http://ncct-kiosk-reader.local";
const CAM_URL = "http://ncct-kiosk-cam.local";

export function KioskTerminal({ accessToken }: KioskTerminalProps) {
  const [sessionId, setSessionId] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<{ id: string; name: string } | null>(null);

  // Binding lives here rather than only on the NFC Kiosk tab so a student
  // whose card isn't registered can be handled without leaving this screen.
  const [unboundUid, setUnboundUid] = useState<string | null>(null);
  const [bindTraineeId, setBindTraineeId] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Read inside the poll callback, which would otherwise capture whatever
  // these were when polling started. Synced in an effect rather than
  // assigned during render — a render-phase ref write is what React warns
  // about, and these are only ever read later, from an async callback.
  const sessionIdRef = useRef(sessionId);
  const traineeRef = useRef<{ id: string; name: string } | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const addLog = useCallback((text: string, kind: LogEntry["kind"] = "info") => {
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLog((prev) => [{ at, text, kind }, ...prev].slice(0, 12));
  }, []);

  // `send` comes from the hook, but the hook needs `handleLine` — declared
  // with a ref indirection to break the cycle.
  const sendRef = useRef<(line: string) => Promise<void>>(async () => {});

  const handleCard = useCallback(
    async (uid: string) => {
      addLog(`UID ${uid}`, "in");
      try {
        const profile = await kioskNfcLookup(accessToken, uid);
        if (!profile) {
          addLog("Card not registered — bind it below", "bad");
          setUnboundUid(uid);
          await sendRef.current("UNKNOWN");
          return;
        }
        setUnboundUid(null);

        // The consent gate, enforced before the camera is ever touched.
        // face_embeddings.consent_given_at is NOT NULL and stamped
        // server-side at enrollment, so "no enrolled face" and "has not
        // consented to biometric processing" are the same state
        // (ARCHITECTURE.md §13, DPDP Act 2023). Without this the trainee
        // still fails — the check-in route 400s at the very end — but only
        // after the board has told them to look at the camera and a frame
        // of their face has been fetched and run through Human. Refusing
        // here means no biometric capture happens at all for someone who
        // never agreed to it, which is the whole point of the rule.
        //
        // traineeRef deliberately stays null: a BTN:CAPTURE that arrives
        // anyway (a button press racing this reply) then hits the
        // "no card scanned" guard rather than proceeding.
        if (!profile.face_enrolled) {
          addLog(`${profile.full_name}: no face enrolled — use QR check-in`, "bad");
          await sendRef.current("ERR:face not enrolled");
          return;
        }

        traineeRef.current = { id: profile.id, name: profile.full_name };
        setCurrent({ id: profile.id, name: profile.full_name });
        addLog(`Identified: ${profile.full_name}`, "good");
        await sendRef.current(`NAME:${profile.full_name}`);
      } catch (err) {
        addLog(`Lookup failed: ${(err as Error).message}`, "bad");
        await sendRef.current(`ERR:lookup failed`);
      }
    },
    [accessToken, addLog],
  );

  const handleCapture = useCallback(async () => {
    const trainee = traineeRef.current;
    const session = sessionIdRef.current.trim();

    if (!trainee) {
      await sendRef.current("ERR:no card scanned");
      return;
    }
    if (!session) {
      addLog("Session ID not set", "bad");
      await sendRef.current("ERR:kiosk not configured");
      return;
    }
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    addLog("Capture requested", "in");

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("preview canvas not ready");

      const frame = await withCaptureRetries(
        () => captureFrame(CAM_URL, canvas),
        (message, attempt, total) => addLog(`Capture attempt ${attempt}/${total}: ${message}`, "bad"),
      );

      const embedding = await extractEmbedding(frame);
      if (!embedding) {
        addLog("No face found in that frame", "bad");
        await sendRef.current("FAIL");
        return;
      }

      const result = await kioskFaceCheckIn(accessToken, session, trainee.id, embedding);
      if (result.matched) {
        const score = "match_score" in result ? result.match_score : null;
        addLog(`${trainee.name}: checked in${score != null ? ` (${score.toFixed(3)})` : ""}`, "good");
        await sendRef.current("OK");
      } else {
        addLog(`${trainee.name}: no confident match`, "bad");
        await sendRef.current("FAIL");
      }
    } catch (err) {
      // A 409 is "already checked in for this session" — a normal outcome
      // worth its own message, not a failure the student should retry.
      if (err instanceof ApiError && err.status === 409) {
        addLog(`${trainee.name}: already checked in`, "info");
        await sendRef.current("DUP");
      } else {
        addLog(`Check-in failed: ${(err as Error).message}`, "bad");
        await sendRef.current("ERR:check-in failed");
      }
    } finally {
      traineeRef.current = null;
      setCurrent(null);
      busyRef.current = false;
      setBusy(false);
    }
  }, [accessToken, addLog]);

  const handleBind = useCallback(async () => {
    if (!unboundUid || !bindTraineeId.trim()) return;
    try {
      await bindNfcTag(accessToken, bindTraineeId.trim(), unboundUid);
      addLog(`Card ${unboundUid} bound — tap it again to check in`, "good");
      setUnboundUid(null);
      setBindTraineeId("");
    } catch (err) {
      addLog(`Bind failed: ${(err as Error).message}`, "bad");
    }
  }, [accessToken, addLog, bindTraineeId, unboundUid]);

  const handleLine = useCallback(
    (line: string) => {
      if (line.startsWith("UID:")) {
        void handleCard(line.slice(4));
        return;
      }
      if (line === "BTN:CAPTURE") {
        void handleCapture();
        return;
      }
      if (line.startsWith("STATE:") || line === "READY") return; // diagnostics
      if (line.startsWith("ERR:")) addLog(`Reader: ${line.slice(4)}`, "bad");
    },
    [handleCard, handleCapture, addLog],
  );

  const { connected, error, start, stop, send } = useKioskReader(READER_URL, handleLine);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const configured = sessionId.trim() !== "";

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-5xl mx-auto w-full flex flex-col gap-6 text-left">
      <div>
        <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary m-0">
          Kiosk Terminal
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Set the session ID, start it, then leave it running. Students tap, position themselves
          and press the button &mdash; no action needed here per student.
        </p>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      )}

      <section className="bg-surface-card border border-outline-variant rounded-xl p-6 flex flex-col gap-4">
        <h2 className="font-headline-sm text-headline-sm text-on-surface m-0">Setup</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            id="kiosk-session"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="Session ID (UUID)"
            disabled={busy}
            className="flex-1 h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 font-mono text-body-sm disabled:opacity-50"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {!connected ? (
            <button
              type="button"
              onClick={start}
              disabled={!configured}
              className="h-touch-target px-6 bg-cta text-on-primary hover:bg-cta-hover disabled:opacity-50 rounded-full font-label-md text-label-md flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">wifi</span>
              Start
            </button>
          ) : (
            <>
              <span className="flex items-center gap-2 text-status-success font-label-md">
                <span className="material-symbols-outlined text-[18px]">nfc</span>
                Live &mdash; waiting for a card
              </span>
              <button
                type="button"
                onClick={stop}
                className="h-touch-target px-5 border border-outline text-primary hover:bg-surface-container-highest rounded-full font-label-md text-label-md"
              >
                Stop
              </button>
            </>
          )}
          {!configured && (
            <span className="font-body-sm text-on-surface-variant">Enter a session ID first.</span>
          )}
        </div>
      </section>

      {unboundUid && (
        <section className="bg-surface-card border border-dashed border-outline-variant rounded-xl p-6 flex flex-col gap-3">
          <h2 className="font-headline-sm text-headline-sm text-on-surface m-0">Bind this card</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
            Card{" "}
            <code className="font-mono bg-surface-container px-2 py-0.5 rounded">{unboundUid}</code>{" "}
            isn&rsquo;t linked to anyone yet. Nothing is written to the card &mdash; the link is stored
            against the trainee.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="kiosk-bind-trainee"
              value={bindTraineeId}
              onChange={(e) => setBindTraineeId(e.target.value)}
              placeholder="Trainee ID (UUID)"
              className="flex-1 h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 font-mono text-body-sm"
            />
            <button
              type="button"
              onClick={() => void handleBind()}
              disabled={!bindTraineeId.trim()}
              className="h-touch-target px-6 bg-cta text-on-primary hover:bg-cta-hover disabled:opacity-50 rounded-full font-label-md text-label-md"
            >
              Bind Card
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-surface-card border border-outline-variant rounded-xl p-6 flex flex-col gap-3">
          <h2 className="font-headline-sm text-headline-sm text-on-surface m-0">Last capture</h2>
          <canvas
            ref={canvasRef}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest"
          />
          <p className="font-body-sm text-on-surface-variant m-0">
            {current
              ? `Waiting for ${current.name} to press the button`
              : busy
                ? "Verifying..."
                : "Idle"}
          </p>
        </section>

        <section className="bg-surface-card border border-outline-variant rounded-xl p-6 flex flex-col gap-2">
          <h2 className="font-headline-sm text-headline-sm text-on-surface m-0 mb-1">Activity</h2>
          {log.length === 0 ? (
            <p className="font-body-sm text-on-surface-variant m-0">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
              {log.map((entry, i) => (
                <li key={`${entry.at}-${i}`} className="flex gap-3 font-body-sm text-body-sm">
                  <span className="font-mono text-on-surface-variant shrink-0">{entry.at}</span>
                  <span
                    className={
                      entry.kind === "good"
                        ? "text-status-success"
                        : entry.kind === "bad"
                          ? "text-status-rejected"
                          : entry.kind === "in"
                            ? "text-primary"
                            : "text-on-surface"
                    }
                  >
                    {entry.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
