import type { AppNotification, NotificationData } from "@ncct/shared-types";
import type { Locale } from "../i18n/LocaleContext.js";

// Where tapping a notification takes the user (docs/DECISIONS.md #65). Each
// app shell maps these onto its own tabs — a trainee and an admin have
// different navigation, but the notification only says what it's about.
export type NotificationTarget =
  | "lessons"
  | "certificates"
  | "my-nominations"
  | "attendance"
  | "career"
  | "profile"
  | "programmes";

export interface NotificationView {
  icon: string;
  title: string;
  body: string;
  target: NotificationTarget;
}

function str(data: NotificationData, key: string): string {
  const value = data[key];
  return value === null || value === undefined ? "" : String(value);
}

function formatWhen(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function joinParts(parts: string[]): string {
  return parts.filter(Boolean).join(" · ");
}

// Messages are built here, per locale, from the stored `type` + `data` —
// never stored as text — so one notification row reads correctly in
// whichever language the viewer has selected.
export function describeNotification(
  notification: AppNotification,
  locale: Locale,
): NotificationView {
  const d = notification.data;
  const hi = locale === "hi";
  const programme = str(d, "programme_title");

  switch (notification.type) {
    case "nomination_decided": {
      const status = str(d, "status");
      if (status === "approved") {
        return {
          icon: "how_to_reg",
          title: hi ? "नामांकन स्वीकृत" : "Nomination approved",
          body: hi ? `आप ${programme} में नामांकित हैं।` : `You're enrolled in ${programme}.`,
          target: "lessons",
        };
      }
      if (status === "waitlisted") {
        return {
          icon: "hourglass_top",
          title: hi ? "आप प्रतीक्षा सूची में हैं" : "You're on the waitlist",
          body: hi
            ? `${programme} — सीट खुलने पर आपको सूचित किया जाएगा।`
            : `${programme} — we'll let you know if a seat opens.`,
          target: "my-nominations",
        };
      }
      return {
        icon: "cancel",
        title: hi ? "नामांकन स्वीकृत नहीं हुआ" : "Nomination not approved",
        body: programme,
        target: "my-nominations",
      };
    }
    case "nomination_submitted":
      return {
        icon: "person_add",
        title: hi ? "समीक्षा हेतु नया नामांकन" : "New nomination to review",
        body: hi
          ? `${str(d, "trainee_name") || "एक प्रशिक्षणार्थी"} ने ${programme} के लिए आवेदन किया।`
          : `${str(d, "trainee_name") || "A trainee"} applied for ${programme}.`,
        target: "programmes",
      };
    case "lesson_published":
      return {
        icon: "menu_book",
        title: hi ? `नया पाठ: ${str(d, "lesson_title")}` : `New lesson: ${str(d, "lesson_title")}`,
        body: str(d, "course_title"),
        target: "lessons",
      };
    case "assessment_available": {
      const isQuiz = str(d, "kind") === "quiz";
      const title = str(d, "assessment_title");
      return {
        icon: isQuiz ? "quiz" : "assignment",
        title: isQuiz
          ? hi
            ? `नई अभ्यास क्विज़: ${title}`
            : `New practice quiz: ${title}`
          : hi
            ? `नई परीक्षा उपलब्ध: ${title}`
            : `New test available: ${title}`,
        body: str(d, "course_title"),
        target: "lessons",
      };
    }
    case "session_scheduled":
      return {
        icon: "event",
        title: hi ? "नया सत्र निर्धारित" : "New session scheduled",
        body: joinParts([
          str(d, "session_title") || programme,
          formatWhen(str(d, "starts_at"), locale),
          str(d, "location"),
        ]),
        target: "attendance",
      };
    case "certificate_issued":
      return {
        icon: "workspace_premium",
        title: hi ? "प्रमाणपत्र प्राप्त हुआ!" : "Certificate earned!",
        body: joinParts([str(d, "course_title"), str(d, "certificate_code")]),
        target: "certificates",
      };
    case "hostel_assigned":
      return {
        icon: "bed",
        title: hi ? "छात्रावास कक्ष आवंटित" : "Hostel room assigned",
        body: joinParts([
          str(d, "hostel_name"),
          str(d, "room_number")
            ? hi
              ? `कक्ष ${str(d, "room_number")}`
              : `Room ${str(d, "room_number")}`
            : "",
          programme,
        ]),
        target: "profile",
      };
    case "job_shortlisted":
      return {
        icon: "star",
        title: hi ? "आपको शॉर्टलिस्ट किया गया है" : "You've been shortlisted",
        body: joinParts([str(d, "job_title"), str(d, "location")]),
        target: "career",
      };
    case "job_interest_updated": {
      const status = str(d, "status");
      const title =
        status === "contacted"
          ? hi
            ? "एक नियोक्ता आपसे संपर्क करना चाहता है"
            : "An employer wants to contact you"
          : status === "viewed"
            ? hi
              ? "एक नियोक्ता ने आपकी प्रोफ़ाइल देखी"
              : "An employer viewed your profile"
            : hi
              ? "आपकी शॉर्टलिस्ट स्थिति अपडेट हुई"
              : "Your shortlist status changed";
      return { icon: "work", title, body: str(d, "job_title"), target: "career" };
    }
    case "trainer_assigned":
      return {
        icon: "school",
        title: hi ? "कार्यक्रम में नियुक्त" : "Assigned to a programme",
        body: hi
          ? `अब आप ${programme} का प्रबंधन कर सकते हैं।`
          : `You can now manage ${programme}.`,
        target: "programmes",
      };
  }
}

export function formatRelativeTime(iso: string, locale: Locale, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "hi" ? "hi" : "en", { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "medium",
  });
}
