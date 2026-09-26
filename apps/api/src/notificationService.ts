import type { NotificationData, NotificationType } from "@ncct/shared-types";
import { supabaseAdmin } from "./supabaseClient.js";

// In-app notification fan-out (docs/DECISIONS.md #65).
//
// Every export here is best-effort and never rejects: a notification is a
// side effect of a write that has already succeeded (a lesson saved, a
// nomination approved), so a failure here is logged and swallowed rather
// than turning that success into an error. Routes call these as
// `void notifyX(...)` — same fire-and-forget posture as embedJobBestEffort.
//
// Rows store the event's parameters in `data`, never rendered text — the
// client builds the message per locale from `type` + `data`.

async function bestEffort(type: NotificationType, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    console.error(`Notification "${type}" failed:`, (err as Error).message);
  }
}

async function insertNotifications(
  recipientIds: (string | null | undefined)[],
  type: NotificationType,
  data: NotificationData,
): Promise<void> {
  const recipients = [...new Set(recipientIds.filter((id): id is string => Boolean(id)))];
  if (recipients.length === 0) return;
  const { error } = await supabaseAdmin
    .from("notifications")
    .insert(recipients.map((recipient_id) => ({ recipient_id, type, data })));
  if (error) throw new Error(error.message);
}

/** Generic entry point, for callers that already hold every field they need. */
export function notify(
  recipientIds: (string | null | undefined)[],
  type: NotificationType,
  data: NotificationData,
): Promise<void> {
  return bestEffort(type, () => insertNotifications(recipientIds, type, data));
}

// A programme's audience is its approved nominees — the same "roster"
// definition manual attendance marking and the gradebook already use.
async function approvedTraineeIds(programmeId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("nominations")
    .select("trainee_id")
    .eq("programme_id", programmeId)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { trainee_id: string }[]).map((row) => row.trainee_id);
}

async function adminIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("role", "admin");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

async function programmeTitle(programmeId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("programmes")
    .select("title")
    .eq("id", programmeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { title: string } | null)?.title ?? null;
}

export function notifyNominationDecided(input: {
  programmeId: string;
  traineeId: string;
  status: string;
}) {
  return bestEffort("nomination_decided", async () => {
    await insertNotifications([input.traineeId], "nomination_decided", {
      programme_id: input.programmeId,
      programme_title: await programmeTitle(input.programmeId),
      status: input.status,
    });
  });
}

export function notifyNominationSubmitted(input: { programmeId: string; traineeId: string }) {
  return bestEffort("nomination_submitted", async () => {
    const [title, admins, trainee] = await Promise.all([
      programmeTitle(input.programmeId),
      adminIds(),
      supabaseAdmin.from("profiles").select("full_name").eq("id", input.traineeId).maybeSingle(),
    ]);
    await insertNotifications(admins, "nomination_submitted", {
      programme_id: input.programmeId,
      programme_title: title,
      trainee_name: (trainee.data as { full_name: string | null } | null)?.full_name ?? null,
    });
  });
}

export function notifyLessonPublished(input: {
  moduleId: string;
  lessonId: string;
  lessonTitle: string;
}) {
  return bestEffort("lesson_published", async () => {
    const { data, error } = await supabaseAdmin
      .from("modules")
      .select("courses(title, programme_id)")
      .eq("id", input.moduleId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const course = (data as { courses: { title: string; programme_id: string } | null } | null)
      ?.courses;
    if (!course) return;
    await insertNotifications(await approvedTraineeIds(course.programme_id), "lesson_published", {
      programme_id: course.programme_id,
      course_title: course.title,
      lesson_id: input.lessonId,
      lesson_title: input.lessonTitle,
    });
  });
}

// Fired when an assessment gets its *first* question(s), not when an empty
// shell is created — an assessment with no questions can't be taken yet.
export function notifyAssessmentAvailable(assessmentId: string) {
  return bestEffort("assessment_available", async () => {
    const { data, error } = await supabaseAdmin
      .from("assessments")
      .select("title, kind, modules(courses(title, programme_id))")
      .eq("id", assessmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as {
      title: string;
      kind: string;
      modules: { courses: { title: string; programme_id: string } | null } | null;
    } | null;
    const course = row?.modules?.courses;
    if (!row || !course) return;
    await insertNotifications(
      await approvedTraineeIds(course.programme_id),
      "assessment_available",
      {
        programme_id: course.programme_id,
        course_title: course.title,
        assessment_id: assessmentId,
        assessment_title: row.title,
        kind: row.kind,
      },
    );
  });
}

export function notifySessionScheduled(input: {
  programmeId: string;
  sessionTitle: string | null;
  startsAt: string;
  location: string | null;
}) {
  return bestEffort("session_scheduled", async () => {
    // A session back-filled into the past (a record of a class already held)
    // isn't news to anyone — only announce upcoming ones.
    if (new Date(input.startsAt).getTime() < Date.now()) return;
    const [title, trainees] = await Promise.all([
      programmeTitle(input.programmeId),
      approvedTraineeIds(input.programmeId),
    ]);
    await insertNotifications(trainees, "session_scheduled", {
      programme_id: input.programmeId,
      programme_title: title,
      session_title: input.sessionTitle,
      starts_at: input.startsAt,
      location: input.location,
    });
  });
}

export function notifyHostelAssigned(input: {
  programmeId: string;
  traineeId: string;
  roomId: string;
}) {
  return bestEffort("hostel_assigned", async () => {
    const [title, room] = await Promise.all([
      programmeTitle(input.programmeId),
      supabaseAdmin
        .from("hostel_rooms")
        .select("room_number, hostels(name)")
        .eq("id", input.roomId)
        .maybeSingle(),
    ]);
    const roomRow = room.data as { room_number: string; hostels: { name: string } | null } | null;
    await insertNotifications([input.traineeId], "hostel_assigned", {
      programme_id: input.programmeId,
      programme_title: title,
      hostel_name: roomRow?.hostels?.name ?? null,
      room_number: roomRow?.room_number ?? null,
    });
  });
}

async function jobSummary(
  jobId: string,
): Promise<{ title: string | null; location: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("title, location")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const job = data as { title: string; location: string | null } | null;
  return { title: job?.title ?? null, location: job?.location ?? null };
}

export function notifyJobShortlisted(input: { jobId: string; traineeId: string }) {
  return bestEffort("job_shortlisted", async () => {
    const job = await jobSummary(input.jobId);
    await insertNotifications([input.traineeId], "job_shortlisted", {
      job_id: input.jobId,
      job_title: job.title,
      location: job.location,
    });
  });
}

export function notifyJobInterestUpdated(input: {
  jobId: string;
  traineeId: string;
  status: string;
}) {
  return bestEffort("job_interest_updated", async () => {
    const job = await jobSummary(input.jobId);
    await insertNotifications([input.traineeId], "job_interest_updated", {
      job_id: input.jobId,
      job_title: job.title,
      status: input.status,
    });
  });
}

export function notifyTrainerAssigned(input: { programmeId: string; trainerId: string }) {
  return bestEffort("trainer_assigned", async () => {
    await insertNotifications([input.trainerId], "trainer_assigned", {
      programme_id: input.programmeId,
      programme_title: await programmeTitle(input.programmeId),
    });
  });
}
