# Product Requirements Document

Status: draft, derived entirely from project discussion (no prior PRD existed). Open items are marked `TBD`/`OPEN QUESTION` rather than assumed.

## 1. Product Overview

A centralized digital ecosystem for cooperative training institutions under NCCT (VAMNICOM, RICMs, ICMs) that combines training ERP, e-learning, skill certification, and an employment exchange for trained rural youth and cooperative personnel.

## 2. Problem Statement

Cooperative training programmes (for PACS members, SHGs, dairy cooperatives, farmers, and rural youth) are currently run through largely manual/fragmented systems: duplicated effort, weak trainee tracking, no learning analytics, poor linkage between certification and employment, and inefficient programme administration. Trained rural youth separately struggle to access employment opportunities, entrepreneurship support, and visibility for their earned skill certifications.

## 3. Goals

- Centralize programme registration, nomination, and trainee/institution records for NCCT institutions.
- Deliver e-learning with assessments and verifiable certification, usable in low-connectivity settings.
- Give trained youth a searchable, verifiable skill/certification profile that employers can find.
- Provide NCCT/ministry-level analytics on training reach and outcomes.

## 4. Target Users / Personas

| Persona            | Description                                               | Primary needs                                                       |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Admin              | NCCT/VAMNICOM/RICM/ICM staff                              | Programme setup, nomination approval, timetable, reporting          |
| Trainer/Faculty    | Delivers training content                                 | Upload content, create assessments, grade, mark attendance          |
| Trainee            | PACS staff, SHG members, dairy co-op workers, rural youth | Enroll, learn (incl. offline), get certified, find jobs             |
| Employer/Recruiter | Hiring organizations, cooperative sector employers        | Search verified skill profiles, post openings, shortlist candidates |

## 5. User Stories (MVP)

- As an Admin, I can create a training programme and open nominations so institutions/trainees can enroll.
- As a Trainee, I can enroll in a programme, view my timetable, and access course content on web or mobile.
- As a Trainee, I can download course videos and take quizzes offline, and have my progress sync when I'm back online.
- As a Trainer, I can create an assessment and have it auto-graded.
- As a Trainee, I receive a certificate with a verifiable ID/QR after passing an assessment.
- As anyone (no login), I can verify a certificate's authenticity via its public verification page.
- As a Trainer, I can take attendance via QR code or face recognition at a session.
- As a Trainee, I can tap an NFC card to share my public profile (skills, courses, certifications) with an employer.
- As an Employer, I can search trainee profiles by skill/certification/location and shortlist candidates.
- As a Trainee, I can ask a chatbot questions about available programmes, eligibility, and certification requirements.
- As an Admin, I can view a dashboard of programmes run, trainees trained by region, completion rates, and certificates issued.

## 6. Functional Requirements — MVP Scope

1. **Auth & User Management** — role-based accounts (Admin, Trainer, Trainee, Employer); institution and employer org profiles; bulk trainee import.
2. **Programme & Nomination Management** — programme CRUD; nomination/enrollment with approval workflow; timetable per programme.
3. **E-Learning / LMS Core** — course → module → lesson structure (video/PDF/slides/text); progress tracking; content in at least 2 languages (English + one regional language, **TBD which**); at least one genuinely interactive learning element (not just video+quiz).
4. **Assessment & Certification** — MCQ quiz builder with server-side auto-grading; auto-generated PDF certificate with unique ID/QR on pass; public, no-login certificate verification page.
5. **Attendance** — QR-code session check-in; face-recognition check-in with consent capture, falling back to QR on match failure (see [docs/DECISIONS.md](DECISIONS.md) for model choice).
6. **Employer & Employment Exchange** — employer job postings; trainee search/filter by skill/certification/location; trainee opt-in visibility control; shortlist/interest flow.
7. **Career Counseling Chatbot** — RAG chatbot over programme/FAQ content; scoped to informational Q&A, not open-ended career advice.
8. **Analytics Dashboard** (Admin) — programmes run, trainees by region, completion rates, certificates issued, placements.
9. **Offline Mobile App** — download course videos and quiz content for offline use; take quizzes offline; local queue of progress/attendance writes; automatic sync on reconnect (last-write-wins conflict resolution).
10. **NFC Profile Card** — static NFC tag encoding a URL to the trainee's public profile page (skills, courses, certifications); opens natively on tap, no app required by the person reading it.
11. **Skill-Gap Analysis** — promoted from Phase-2 into MVP scope, see [docs/DECISIONS.md](DECISIONS.md) #26. A shared skills taxonomy; employers tag a job posting's required skills against it; a programme is tagged with the skills a trainee is read as acquiring by earning a certificate under it; a trainee picks a job and sees which of its required skills they already have vs. still need. An optional AI-ranked "what to learn first" ordering over the gap is a non-essential enrichment layer, not the feature itself — the gap computation is fully deterministic on its own and the ranking degrades to absent (not an error) when unavailable.
12. **AI Career Counsellor** — promoted from Phase-2 into MVP scope, see [docs/DECISIONS.md](DECISIONS.md) #27. Personalized, tool-using chat: a trainee asks a question and the model calls read-only tools scoped to their own data (certificates, nominations, open programmes/jobs, and Skill-Gap Analysis results for a specific job) before answering, and the answer is shown with which tools grounded it. Deliberately distinct from the Career Counseling Chatbot (§6.7 above), which stays a shared, non-personalized FAQ surface that refuses this kind of advice — the two are separate features with intentionally opposite scope rules, not one merged into the other.
13. **AI Job Matching** — promoted from Phase-2 into MVP scope, see [docs/DECISIONS.md](DECISIONS.md) #28. Ranked, embedding-based: jobs are embedded (title/description/tagged skills) and a trainee's own certificates/skills are embedded fresh per request, ranked by cosine similarity via pgvector. Shown on the trainee's job board as "Best Matches for You," with a distinct low-signal state when the trainee has no certificates/skills yet.
14. **Deep Training & Learning Analytics (dropout-risk)** — promoted from Phase-2 into MVP scope, see [docs/DECISIONS.md](DECISIONS.md) #29. A heuristic risk flag (not a trained model — no historical dropout data exists yet to train one) per approved-nomination trainee, from lesson-completion rate, timetable-attendance rate, days since any activity, and failed assessment attempts. Surfaced on the Admin Analytics Dashboard (§6.8) as a new dimension, not a separate screen.

**Explicitly out of MVP**: hostel/logistics management (roadmap only).

## 7. Non-Functional Requirements

- **Offline-capable**: mobile app must support learning and quiz-taking without connectivity; sync must not lose data on reconnect.
- **Multilingual**: minimum 2 languages at MVP; full multilingual coverage is Phase-2.
- **Low-bandwidth friendly**: content should be viewable/downloadable on constrained rural connectivity — exact bitrate/compression targets `TBD`.
- **Privacy/compliance**: biometric data (face embeddings) requires explicit recorded consent per India's DPDP Act 2023.
- **Performance/scale targets**: `TBD` — MVP is prototype-scale, not sized against a concurrent-user target yet.
- **Accessibility**: `TBD` — no specific WCAG target set.

## 8. Major User Flows

- **Enrollment → Learning → Certification → Verification**: trainee nominated/self-enrolls → completes modules → passes assessment → certificate issued → employer/anyone verifies it via public page.
- **Attendance**: trainer opens session → trainee scans QR or face → attendance logged → feeds analytics dashboard.
- **Offline learning**: trainee downloads module on connectivity → learns/quizzes offline → app queues results → syncs on reconnect.
- **Employer sourcing**: employer searches/filters trainee profiles → shortlists → trainee notified → (outcome tracking is Phase-2).
- **NFC profile share**: trainee taps card on employer's phone → public profile page opens → employer sees verified skills/certs.

## 9. UI/UX Requirements

- Mobile-first design for the trainee-facing app (primary usage context is rural/mobile).
- Dashboard-dense, table/chart-heavy design for the Admin web app (not mobile-first).
- Certificate verification and public profile pages must be usable with no login, on any device.
- Exact design system / component library: `TBD`.

## 10. Integrations

- **Supabase** — Auth, Postgres, Storage, pgvector.
- **Gemini API** — chatbot RAG responses (see [docs/DECISIONS.md](DECISIONS.md) #25; originally Claude API, switched per user request).
- **Face recognition model** — `@vladmandic/human` (default) or InsightFace `buffalo_l` — see [docs/DECISIONS.md](DECISIONS.md).
- **Push notifications** — provider `TBD` (FCM/APNs).

## 11. Edge Cases

- Face match fails or confidence is below threshold → fall back to QR attendance, don't block the trainee.
- Offline device generates a quiz submission after the certificate deadline has technically passed → conflict resolution rule `TBD` (currently: last-write-wins by client timestamp, flagged as an accepted simplification, not a guarantee of fairness).
- Trainee enrolled in overlapping programmes / double-booked timetable → validation rule `TBD`.
- Employer views a trainee profile who has since opted out of visibility → must not appear in new searches; existing shortlist entries `TBD` whether they persist.
- Certificate verification requested for a since-revoked certificate → revocation flow `TBD` (not currently designed).

## 12. MVP Scope

The 14 functional requirements in Section 6.

## 13. Future Scope (Phase 2)

Employer Outcome Analysis, Entrepreneurship Support, Government Scheme Matchmaking, Alumni-as-Mentor Loop. Skill-Gap Analysis, AI Career Counsellor, AI Job Matching, and deep Training & Learning Analytics were originally listed here but were promoted into MVP scope (§6.11–§6.14) — see [docs/DECISIONS.md](DECISIONS.md) #26–#29. Rationale and dependencies for the remaining items are in the project discussion history; not re-derived here since none are being built yet — expand this section with full requirements when Phase-2 planning begins.

## 14. Open Questions / TBD

- Exact 2 languages for MVP content (English + which regional language).
- Low-bandwidth/compression targets for video content.
- Performance/scale targets (concurrent users, data volume).
- Accessibility target (WCAG level, if any).
- Design system/component library choice.
- Push notification provider (FCM/APNs) and ownership of credentials.
- Certificate revocation flow.
- Conflict-resolution fairness rule for offline submissions near deadlines.
- Timetable double-booking validation rule.
- Whether shortlist entries persist after a trainee opts out of employer visibility.
- Hosting/deployment targets (see [docs/ARCHITECTURE.md](ARCHITECTURE.md)).
- Skill taxonomy and government scheme data ownership (Phase-2 dependencies).
