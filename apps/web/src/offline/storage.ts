import { Preferences } from "@capacitor/preferences";
import type { DownloadedLesson, NewQueuedWrite, QueuedWrite } from "./types.js";

// @capacitor/preferences, not @capacitor-community/sqlite: the actual data
// here is a small JSON array (a write queue, a downloaded-lesson manifest),
// not a relational dataset that needs SQL querying — Preferences has a real
// native + web implementation with none of SQLite's extra setup (a web
// build needs a bundled WASM binary and a custom element just to run
// in-browser), and CLAUDE.md is explicit about not reaching for more
// machinery than the actual data shape calls for. Video/PDF bytes
// themselves live in Filesystem (downloadManager.ts), never here —
// Preferences only ever holds small pointers to them.
const QUEUE_KEY = "ncct_offline_write_queue";
const DOWNLOADS_KEY = "ncct_offline_downloads";

export async function getWriteQueue(): Promise<QueuedWrite[]> {
  const { value } = await Preferences.get({ key: QUEUE_KEY });
  return value ? (JSON.parse(value) as QueuedWrite[]) : [];
}

async function setWriteQueue(queue: QueuedWrite[]): Promise<void> {
  await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(queue) });
}

export async function enqueueWrite(write: NewQueuedWrite): Promise<void> {
  const queue = await getWriteQueue();
  queue.push({ ...write, id: crypto.randomUUID() } as QueuedWrite);
  await setWriteQueue(queue);
}

export async function dequeueWrite(id: string): Promise<void> {
  const queue = await getWriteQueue();
  await setWriteQueue(queue.filter((w) => w.id !== id));
}

export async function getDownloadManifest(): Promise<Record<string, DownloadedLesson>> {
  const { value } = await Preferences.get({ key: DOWNLOADS_KEY });
  return value ? (JSON.parse(value) as Record<string, DownloadedLesson>) : {};
}

export async function setDownloadedLesson(entry: DownloadedLesson): Promise<void> {
  const manifest = await getDownloadManifest();
  manifest[entry.lessonId] = entry;
  await Preferences.set({ key: DOWNLOADS_KEY, value: JSON.stringify(manifest) });
}

export async function removeDownloadedLesson(lessonId: string): Promise<void> {
  const manifest = await getDownloadManifest();
  delete manifest[lessonId];
  await Preferences.set({ key: DOWNLOADS_KEY, value: JSON.stringify(manifest) });
}
