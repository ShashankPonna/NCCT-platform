export const ROLES = ["admin", "trainer", "trainee", "employer"] as const;

export const PROGRAMME_MODES = ["online", "offline", "hybrid"] as const;

export const NOMINATION_STATUSES = ["pending", "approved", "waitlisted", "rejected"] as const;

// A nomination can only be *decided* into one of these — "pending" is the
// initial state, not something an admin decides it back to.
export const NOMINATION_DECISIONS = ["approved", "waitlisted", "rejected"] as const;

export const CONTENT_TYPES = ["video", "pdf", "slides", "text", "interactive"] as const;

// YouTube video IDs are always exactly 11 URL-safe characters.
export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// Matches the `allowed_mime_types` set on the `lesson-content` Supabase
// Storage bucket — kept in sync manually since the bucket isn't provisioned
// via a SQL migration (Storage buckets are provisioned through the Storage
// Management API, not plain SQL).
export const LESSON_FILE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
] as const;

export const LESSON_FILE_MAX_BYTES = 25 * 1024 * 1024;

// Locale codes are validated by shape, not against a fixed list: PRD §14
// still has "which 2nd MVP language" open, so pinning an enum here would be
// inventing a requirement. These are only the options the admin UI offers as
// a convenience — any well-formed locale is accepted by the API.
export const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

export const SUGGESTED_LOCALES = ["en", "hi", "mr", "gu", "ta", "te", "kn", "bn"] as const;

export const INTERACTIVE_EXERCISE_TYPES = ["matching"] as const;
