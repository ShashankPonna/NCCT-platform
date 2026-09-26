/**
 * Seeds F7's chatbot knowledge base (`chatbot_corpus_chunks`) with general
 * platform FAQ content, grounded only in real PRD requirements and features
 * that are actually built — never invented facts (no fees, dates, or
 * eligibility specifics PRD.md itself marks TBD; see PRD.md §14 and
 * CLAUDE.md's "do not invent requirements" rule). The chatbot can only
 * answer questions its corpus actually covers (docs/DECISIONS.md #35's own
 * live check found this: only 5 chunks existed before this script, 2 of
 * them programme-specific and 3 narrow FAQs, so anything outside a handful
 * of exact topics fell through to the "I don't have information" fallback
 * — not a bug, just a corpus with real gaps).
 *
 * Idempotent: re-running skips any chunk whose exact `content` already
 * exists, so this is safe to run again after adding more entries below.
 *
 * Usage: pnpm --filter api seed:chatbot
 */
import "dotenv/config";
import { embedText } from "../src/chatbotService.js";
import { supabaseAdmin } from "../src/supabaseClient.js";

interface SeedChunk {
  source_type: "faq" | "programme";
  content: string;
}

const CHUNKS: SeedChunk[] = [
  // --- What the platform is (PRD §1-2) ---
  {
    source_type: "faq",
    content:
      "This platform is EduDisha, run in partnership with cooperative training institutions (VAMNICOM, RICMs, ICMs). It combines training programme enrollment, e-learning with certification, and an employment exchange connecting trained rural youth and cooperative-sector workers with employers.",
  },
  {
    source_type: "faq",
    content:
      "Training programmes on this platform are aimed at cooperative-sector personnel and rural youth: PACS (Primary Agricultural Credit Society) staff, SHG (Self-Help Group) members, dairy cooperative workers, farmers, and other rural youth seeking skills training and certification.",
  },

  // --- Enrollment / nomination (F2) ---
  {
    source_type: "faq",
    content:
      "To join a programme, you (or your institution) submit a nomination for it. A nomination starts as pending and is reviewed by an administrator, who marks it approved, waitlisted, or rejected. You can see your nomination status at any time from your Career/Learn section. Exact eligibility criteria vary by programme — check the specific programme's details.",
  },
  {
    source_type: "faq",
    content:
      "You can see programmes open for nomination, and your own nomination history and status, from the Learn section of your account. There is no separate application form outside the platform — nomination is the enrollment step.",
  },

  // --- Learning (F3) ---
  {
    source_type: "faq",
    content:
      "Programme content is organized as courses made up of modules, and modules made up of individual lessons. Lessons can be video, PDF/slide documents, plain text, or an interactive exercise. Your progress through lessons is tracked and visible to you as you complete them.",
  },
  {
    source_type: "faq",
    content:
      "Course content is available in more than one language (English plus a regional language) where the trainer/admin has added a translation for that lesson. If a translation isn't available for a lesson yet, it is shown in whichever language was originally uploaded.",
  },
  {
    source_type: "faq",
    content:
      "On the mobile app you can download a lesson's video for offline use, watch it without an internet connection, and mark your progress or submit a quiz while offline — this is queued and automatically synced back once you're online again. This is useful in low-connectivity rural areas.",
  },

  // --- Assessment & certification (F4) ---
  {
    source_type: "faq",
    content:
      "You receive a certificate automatically after passing a module's assessment with a score at or above the pass mark set for that assessment. Assessments are multiple-choice quizzes and are graded automatically by the platform the moment you submit — the grade is never something you self-report.",
  },
  {
    source_type: "faq",
    content:
      "Every certificate has a unique ID and a QR code, and can be downloaded as a PDF from your Certificates section. Anyone — an employer, another institution, or the public — can verify a certificate's authenticity with no login required, either by scanning its QR code or by entering its unique ID on the certificate verification page.",
  },

  // --- Attendance (F5) ---
  {
    source_type: "faq",
    content:
      "Attendance at a training session can be marked in two ways: scanning a QR code shown by the trainer, or (where a kiosk with a camera is set up) face recognition after you've enrolled your face with your explicit consent. If face recognition doesn't get a confident match, it automatically falls back to QR code check-in instead of blocking you.",
  },
  {
    source_type: "faq",
    content:
      "If you miss a live session, you can still mark attendance via QR code at the next available session for that programme, subject to your institution's own attendance policy for that programme.",
  },

  // --- Employer exchange, visibility, skill-gap, job matching (F6, F11-F13) ---
  {
    source_type: "faq",
    content:
      "Employers can only search for and shortlist trainees who have opted in under Visibility Settings. Your certifications and programme history are shown to employers only after you opt in, and you can opt out at any time — opting out removes you from new searches immediately.",
  },
  {
    source_type: "faq",
    content:
      "The Career section shows job postings from employers, which you can browse and express interest in. It also shows 'Best Matches for You' — jobs ranked against your own certificates and skills — and a distinct message if you don't have any certificates yet to match against.",
  },
  {
    source_type: "faq",
    content:
      "The Skill-Gap Check lets you pick a job posting and see which of its required skills you already have (based on certificates you've earned) versus which you still need. This is a factual comparison — it does not replace an employer's own hiring decision.",
  },
  {
    source_type: "faq",
    content:
      "Your NFC profile card (or the link on your profile page) opens a public page showing your verified skills, courses, and certifications with no login required — useful for sharing your profile with an employer in person. You control whether this page is enabled from your profile's visibility settings.",
  },

  // --- The chatbot's own scope (helps it explain itself instead of just refusing) ---
  {
    source_type: "faq",
    content:
      "This chatbot answers informational questions about programmes, eligibility, enrollment, learning, certification, and how platform features work, based only on the official programme material available to it. It does not give personalized career advice, tell you what to study, or recommend specific jobs for you — for that, use the separate 'Ask a Counsellor' feature in the Career section, which looks at your own certificates, nominations, and skill gaps to answer personally.",
  },
];

async function main() {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("chatbot_corpus_chunks")
    .select("content");
  if (fetchError) throw new Error(fetchError.message);

  const existingContent = new Set((existing ?? []).map((row) => row.content));
  const toInsert = CHUNKS.filter((chunk) => !existingContent.has(chunk.content));

  console.log(`${existingContent.size} chunk(s) already in the corpus.`);
  console.log(
    `${toInsert.length} new chunk(s) to add (${CHUNKS.length - toInsert.length} skipped, already present).`,
  );

  for (const chunk of toInsert) {
    const embedding = await embedText(chunk.content);
    const { error: insertError } = await supabaseAdmin.from("chatbot_corpus_chunks").insert({
      source_type: chunk.source_type,
      source_id: null,
      content: chunk.content,
      embedding,
    });
    if (insertError) {
      console.error(
        `Failed to insert chunk: ${chunk.content.slice(0, 60)}...`,
        insertError.message,
      );
      continue;
    }
    console.log(`Inserted: ${chunk.content.slice(0, 70)}...`);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
