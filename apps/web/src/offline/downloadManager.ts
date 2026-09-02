import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { getLessonVideoUrl } from "@ncct/api-client";
import type { Lesson } from "@ncct/shared-types";
import { getDownloadManifest, removeDownloadedLesson, setDownloadedLesson } from "./storage.js";

// Downloads land in Directory.Data — the app's own private storage, which
// (unlike Directory.Cache) the OS won't silently clear under storage
// pressure. A trainee downloading a lesson for offline use expects it to
// still be there later, not evicted the way a cache entry can be.
const DOWNLOAD_DIR = Directory.Data;
const DOWNLOAD_SUBDIR = "lesson-downloads";

// Native-only: on plain web there's no persistent native filesystem to
// download into (and no offline story to build one for — a browser tab
// isn't installed, it's just visited). Every offline feature in this module
// checks this first and no-ops or reports "unavailable" on plain web,
// rather than half-working against IndexedDB in a way nobody asked for.
export function isOfflineCapable(): boolean {
  return Capacitor.isNativePlatform();
}

function localPathFor(lessonId: string, filename: string): string {
  return `${DOWNLOAD_SUBDIR}/${lessonId}/${filename}`;
}

export async function isLessonDownloaded(lessonId: string): Promise<boolean> {
  if (!isOfflineCapable()) return false;
  const manifest = await getDownloadManifest();
  return Boolean(manifest[lessonId]);
}

export async function getLocalLessonUri(lessonId: string): Promise<string | null> {
  if (!isOfflineCapable()) return null;
  const manifest = await getDownloadManifest();
  const entry = manifest[lessonId];
  if (!entry) return null;
  // Capacitor.convertFileSrc turns a native file path into a URL the
  // WebView is actually allowed to load in a <video>/<img> src.
  return Capacitor.convertFileSrc(entry.localUri);
}

// Video only for now — the one large-file case PRD §6.9 actually names.
// PDF/slides lessons are small enough that DECISIONS.md #13's existing
// signed-URL read already works fine online; nothing has asked for offline
// PDF access specifically, and adding it "for symmetry" would be exactly
// the kind of gold-plating CLAUDE.md warns against.
export async function downloadLessonVideo(
  accessToken: string,
  lesson: Lesson,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (!isOfflineCapable()) {
    throw new Error("Offline downloads are only available in the installed app, not the browser.");
  }
  if (lesson.content_type !== "video") {
    throw new Error("Only video lessons can be downloaded for offline use.");
  }

  let sourceUrl: string;
  if (lesson.video_id) {
    throw new Error("YouTube-hosted lessons can't be downloaded — they need a live connection.");
  }
  const { url } = await getLessonVideoUrl(accessToken, lesson.id);
  if (!url) {
    throw new Error("This lesson has no video file uploaded yet.");
  }
  sourceUrl = url;

  const filename = `${lesson.id}.mp4`;
  const path = localPathFor(lesson.id, filename);

  let progressListener: { remove: () => void } | undefined;
  if (onProgress) {
    const handle = await Filesystem.addListener("progress", (event) => {
      if (event.url === sourceUrl && event.contentLength > 0) {
        onProgress(event.bytes / event.contentLength);
      }
    });
    progressListener = handle;
  }

  try {
    await Filesystem.downloadFile({
      url: sourceUrl,
      path,
      directory: DOWNLOAD_DIR,
      progress: Boolean(onProgress),
      recursive: true,
    });
  } finally {
    progressListener?.remove();
  }

  const stat = await Filesystem.stat({ path, directory: DOWNLOAD_DIR });

  await setDownloadedLesson({
    lessonId: lesson.id,
    title: lesson.title,
    contentType: "video",
    localUri: stat.uri,
    downloadedAt: new Date().toISOString(),
    sizeBytes: stat.size,
  });
}

export async function deleteDownloadedLesson(lessonId: string): Promise<void> {
  if (!isOfflineCapable()) return;
  const manifest = await getDownloadManifest();
  const entry = manifest[lessonId];
  if (entry) {
    try {
      await Filesystem.deleteFile({ path: localPathFor(lessonId, `${lessonId}.mp4`), directory: DOWNLOAD_DIR });
    } catch {
      // File already gone (e.g. cleared by the OS despite Directory.Data) —
      // the manifest entry is still stale and should be removed either way.
    }
  }
  await removeDownloadedLesson(lessonId);
}
