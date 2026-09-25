import { getMyHostelAssignments } from "@ncct/api-client";
import type { HostelRoomType, MyHostelAssignment } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";

interface HostelAssignmentCardProps {
  accessToken: string;
}

interface HostelAssignmentCardText {
  title: string;
  description: string;
  none: string;
  room: (roomNumber: string) => string;
  roomType: Record<HostelRoomType, string>;
  unknownProgramme: string;
}

const content: Record<Locale, HostelAssignmentCardText> = {
  en: {
    title: "Hostel Accommodation",
    description:
      "Assigned by your institution's admin. Visible only to you — never shown on your public profile.",
    none: "No hostel room assigned yet.",
    room: (roomNumber) => `Room ${roomNumber}`,
    roomType: { dorm: "Dorm", shared: "Shared", single: "Single" },
    unknownProgramme: "Programme",
  },
  hi: {
    title: "छात्रावास आवास",
    description:
      "आपके संस्थान के व्यवस्थापक द्वारा आवंटित। केवल आपको दिखाई देता है — आपकी सार्वजनिक प्रोफ़ाइल पर कभी नहीं।",
    none: "अभी तक कोई छात्रावास कक्ष आवंटित नहीं किया गया है।",
    room: (roomNumber) => `कक्ष ${roomNumber}`,
    roomType: { dorm: "डॉर्म", shared: "साझा", single: "एकल" },
    unknownProgramme: "कार्यक्रम",
  },
};

// Read-only view of the trainee's own hostel room per programme
// (docs/DECISIONS.md #64). Deliberately private-only: the public NFC
// profile page needs no login, so a room number there would tell a stranger
// where the trainee sleeps.
export function HostelAssignmentCard({ accessToken }: HostelAssignmentCardProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [assignments, setAssignments] = useState<MyHostelAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyHostelAssignments(accessToken)
      .then(setAssignments)
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  return (
    <div className="bg-surface-card border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="p-6 border-b border-outline-variant/50 bg-surface-container-lowest/50 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">bed</span>
        <h3 className="font-headline-md text-[20px] leading-[26px] font-semibold text-primary m-0">
          {t.title}
        </h3>
      </div>

      <div className="p-6 flex flex-col gap-3">
        <p className="font-body-md text-on-surface-variant m-0">{t.description}</p>
        {error && <p className="font-body-sm text-error m-0">{error}</p>}

        {assignments && assignments.length === 0 && (
          <p className="font-body-sm text-on-surface-variant m-0">{t.none}</p>
        )}

        {assignments?.map((assignment) => (
          <div
            key={assignment.programme_id}
            className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-label-md font-semibold text-on-surface m-0 truncate">
                {assignment.hostel_name ?? "—"}
                {assignment.room_number && ` · ${t.room(assignment.room_number)}`}
              </p>
              <p className="font-body-sm text-on-surface-variant m-0 truncate">
                {assignment.programme_title ?? t.unknownProgramme}
              </p>
              {assignment.notes && (
                <p className="font-body-sm text-on-surface-variant m-0 mt-1">{assignment.notes}</p>
              )}
            </div>
            {assignment.room_type && (
              <span className="shrink-0 rounded-full border border-outline-variant px-2.5 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                {t.roomType[assignment.room_type]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
