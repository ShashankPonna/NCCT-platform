import {
  checkInWithQr,
  submitAssessmentAttempt,
  updateLessonProgress,
} from "@ncct/api-client";
import { useEffect, useState } from "react";
import { useOnlineStatus } from "./network.js";
import { dequeueWrite, enqueueWrite, getWriteQueue } from "./storage.js";
import type { QueuedWrite } from "./types.js";

// Applies one queued write against its real endpoint. Deliberately no
// grading or matching logic lives here — a quiz attempt still gets graded
// server-side exactly the way a live submission does (CLAUDE.md: never
// trust a client-reported score), it just happens later than usual. The
// trainee never saw a score while offline; this is the first time the real
// one exists.
async function applyWrite(accessToken: string, write: QueuedWrite): Promise<void> {
  switch (write.type) {
    case "lesson_progress":
      await updateLessonProgress(accessToken, write.lessonId, write.body);
      return;
    case "quiz_attempt":
      await submitAssessmentAttempt(accessToken, write.assessmentId, write.answers);
      return;
    case "qr_checkin":
      await checkInWithQr(accessToken, write.sessionId);
      return;
  }
}

// Processes the queue in order (oldest first) and stops at the first
// failure rather than skipping past it — a later write for the same lesson
// (e.g. two progress updates) landing out of order would silently corrupt
// DECISIONS.md #7's last-write-wins guarantee, which assumes writes arrive
// in the order they actually happened. Whatever's left keeps waiting for
// the next sync attempt.
export async function flushWriteQueue(accessToken: string): Promise<{ synced: number; remaining: number }> {
  const queue = await getWriteQueue();
  let synced = 0;
  for (const write of queue) {
    try {
      await applyWrite(accessToken, write);
      await dequeueWrite(write.id);
      synced++;
    } catch {
      // Could be the same server-config 503s the rest of this app already
      // treats as transient (e.g. an unrelated route down), or a genuine
      // network drop mid-sync — either way, stop and retry the whole
      // remaining queue on the next reconnect rather than guessing.
      break;
    }
  }
  const remaining = (await getWriteQueue()).length;
  return { synced, remaining };
}

export { enqueueWrite };

// Queues automatically flush the moment the app comes back online, and
// again whenever this hook's owner asks (e.g. after adding a new item to
// the queue while already online, so it doesn't just sit there until the
// next reconnect event that may never come).
export function useAutoSync(accessToken: string | null) {
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function refreshPendingCount() {
    setPendingCount((await getWriteQueue()).length);
  }

  async function syncNow() {
    if (!accessToken || syncing) return;
    setSyncing(true);
    try {
      await flushWriteQueue(accessToken);
    } finally {
      setSyncing(false);
      await refreshPendingCount();
    }
  }

  useEffect(() => {
    refreshPendingCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (online && accessToken) {
      void syncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, accessToken]);

  return { online, pendingCount, syncing, syncNow, refreshPendingCount };
}
