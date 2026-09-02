// One record per pending write made while offline. `queuedAt` is the
// client-side timestamp the write actually happened at (not when it's
// eventually synced) — DECISIONS.md #7's last-write-wins conflict rule
// needs the real moment of the action, not whenever connectivity happened
// to come back.
export type QueuedWrite =
  | {
      id: string;
      type: "lesson_progress";
      queuedAt: string;
      lessonId: string;
      body: { progress_percent?: number; last_position_seconds?: number; completed_at?: string | null };
    }
  | {
      id: string;
      type: "quiz_attempt";
      queuedAt: string;
      assessmentId: string;
      answers: Record<string, string>;
    }
  | {
      id: string;
      type: "qr_checkin";
      queuedAt: string;
      sessionId: string;
    };

// Plain `Omit<QueuedWrite, "id">` doesn't distribute over the union — it
// collapses to only the fields every branch shares, silently dropping
// branch-specific ones like `lessonId`. A conditional type only distributes
// over a bare generic type parameter, not a concrete named type used
// directly, so the distribution has to go through a real generic here.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewQueuedWrite = DistributiveOmit<QueuedWrite, "id">;

export interface DownloadedLesson {
  lessonId: string;
  title: string;
  contentType: "video" | "pdf" | "slides";
  localUri: string;
  downloadedAt: string;
  sizeBytes: number;
}
