# Architecture Decisions

Lightweight decision log — why key choices were made, so future changes are deliberate reversals rather than silent drift. Add a new entry (don't edit past ones) when a decision changes; mark the old one Superseded.

---

### 1. One backend serves both web and mobile

**Decision**: Single Node/Express REST API consumed by both the React web app and the React Native app; no separate mobile-specific API.
**Why**: A REST API doesn't need to know whether its caller is a browser or a phone. Duplicating it would double the bug surface and let web/mobile drift out of sync on business logic.
**Status**: Active.

### 2. One shared Supabase database

**Decision**: Single Supabase Postgres instance for both clients, accessed only through Express.
**Why**: Follows directly from Decision 1 — a shared backend implies a shared data source. No product reason for web-only or mobile-only data.
**Status**: Active.

### 3. Separate UI codebases (React web + React Native), not React Native Web

**Decision**: Web and mobile have independent UI code; only the logic layer (`packages/*`) is shared.
**Why**: The two surfaces have genuinely different UI shapes — dashboard/table-heavy admin+employer screens on web vs. camera/NFC/offline-native trainee screens on mobile. Forcing one UI codebase via RN-Web would fight both use cases.
**Status**: Active.

### 4. Clients never call Supabase directly

**Decision**: All data access goes through Express; Supabase service credentials are server-side only.
**Why**: Centralizes auth checks, face-recognition matching, PDF generation, and chatbot orchestration in one place instead of duplicating business rules in RLS policies and two clients.
**Status**: Active.

### 5. Face recognition: `@vladmandic/human` as default, InsightFace `buffalo_l` as swap-in alternative

**Decision**: Use the JS-native `@vladmandic/human` library (runs in Node via tfjs-node) for face detection/embedding extraction in the Express face-rec service. If accuracy proves insufficient, swap the extraction step to InsightFace's `buffalo_l` ONNX models (mirrored on Hugging Face) via `onnxruntime-node` — the storage/comparison logic downstream (pgvector cosine similarity) stays the same either way.
**Why**: Human integrates fastest given an all-JS/TS stack and runs on both Node and React Native. `buffalo_l` is higher accuracy but adds ONNX-inference wiring; kept as a documented fallback rather than the default to avoid premature complexity.
**Status**: Amended by #16 — the library choice (`@vladmandic/human`) is still active, but *where extraction runs* changed from "the Express service" to "the browser client." **Dimension correction**: the two options in this decision do **not** produce the same descriptor size, contrary to what the initial schema assumed — Human's faceres output is **1024-d**, InsightFace `buffalo_l` is 512-d (measured, not assumed; see migration `20260901000011`). Swapping to `buffalo_l` later therefore means recreating `face_embeddings.embedding` at 512 and re-enrolling every trainee, not just changing the extraction call. Revisit after real-world accuracy testing.

### 6. NFC: static NDEF URI tag, not custom in-app read/write

**Decision**: NFC cards encode a URL to the trainee's public profile page (reusing the certificate-verification page pattern), written once at issuance. No custom NFC read/write logic is built into the apps for MVP.
**Why**: NFC tags hold too little storage (144–888 bytes on common tags) for a full profile — a URL is the only sane payload. Tapping a tag with a native OS NFC reader opens the URL on both Android and iOS with no app installed, sidestepping Web NFC's Chrome-Android-only support and iOS's tag-write restrictions.
**Status**: Active.

### 7. Offline sync: timestamp/last-write-wins, not CRDT/OT

**Decision**: Mobile queues offline writes locally and replays them against the same Express endpoints on reconnect; conflicts resolved by last-write-wins on client timestamp.
**Why**: The data involved (progress events, quiz results, attendance) is mostly append-only, not collaboratively edited — a full CRDT/operational-transform sync engine would be solving a problem this data shape doesn't have.
**Status**: Active. Fairness edge cases near deadlines are a known open question (see PRD §14).

### 8. Monorepo: pnpm workspaces, not Turborepo/Nx

**Decision**: Use plain pnpm workspaces to let `apps/*` import from `packages/*` locally.
**Why**: Sufficient for the project's current size; Turborepo/Nx's build-caching benefits aren't needed until build times or team size actually justify the extra tooling.
**Status**: Active. Revisit if build/CI times become a real pain point.

### 9. Express uses per-user Supabase clients for user-owned data, service-role only for privileged operations

**Decision**: The auth middleware builds a request-scoped Supabase client using the caller's own JWT (so Postgres RLS evaluates as that user) for routes acting on a user's own data. A separate service-role client (`supabaseAdmin`) is used only where the operation is legitimately cross-user or privileged (e.g., admin approving a nomination, issuing a certificate, writing a face embedding after consent).
**Why**: `CLAUDE.md`'s security rule states Express role middleware and Supabase RLS are "defense in depth, not either/or." That's only true if Express doesn't call Supabase exclusively with the all-powerful service-role key (which bypasses RLS entirely) — otherwise RLS is enabled but inert. Splitting the client this way makes RLS a real second layer instead of a checkbox.
**Status**: Active. Individual routes still decide per-case which client to use; there's no automatic rule beyond "user's own data → user-scoped client."

### 10. Vitest (not Jest) for `apps/api` tests

**Decision**: Use Vitest + Supertest for API tests instead of the originally proposed Jest + Supertest.
**Why**: `apps/api` is ESM (`"type": "module"`) with `NodeNext` module resolution. Jest's ESM support requires extra transform/config friction (`ts-jest` ESM preset, `extensionsToTreatAsEsm`, moduleNameMapper for `.js` specifiers) that Vitest avoids natively — it was faster to get a real, working test running than to fight Jest's ESM setup. `CLAUDE.md`'s testing section explicitly said "confirm before first test is written, then remove the caveat"; this is that confirmation.
**Status**: Active for `apps/api`. Web is a natural fit for Vitest too (same Vite tooling) if/when its test setup is confirmed. Mobile stays Jest (`jest-expo` preset) since that's the RN/Expo ecosystem standard, not Vitest.

### 11. `apps/api` splits `app.ts` (Express app, exported) from `index.ts` (thin `listen()` entrypoint)

**Decision**: `apps/api/src/app.ts` builds and exports the configured Express app; `apps/api/src/index.ts` only imports it and calls `.listen()`.
**Why**: Supertest needs an importable `app` object to test against directly, without binding a real port. This is the standard pattern for testable Express apps, not a speculative abstraction — it was introduced exactly when the first test needed it, per `CLAUDE.md`'s "minimal change that satisfies the requirement."
**Status**: Active. Every future route file goes in `apps/api/src/routes/` and is mounted onto `app` in `app.ts`.

### 12. Lesson video hosted as YouTube unlisted videos (prototype), PDFs stay on Supabase Storage

**Decision**: For the SIH prototype, `lessons.content_type = 'video'` rows store only an 11-character `video_id` (validated by regex both client-side via zod and DB-side via a `CHECK` constraint) — never a full URL, never the video file itself. The web app embeds it with the official `https://www.youtube.com/embed/{video_id}` iframe player via a reusable `YouTubeVideoPlayer` component (`apps/web/src/YouTubeVideoPlayer.tsx`). Non-video lesson content (PDF/slides) continues to use `lessons.storage_path` against Supabase Storage, as already implied by the initial schema — this decision only concerns the video path.
**Why**: Building real private video delivery (signed URLs, a CDN, DRM) is out of scope for a hackathon prototype and would be premature infrastructure. YouTube's iframe player gets a working, embeddable, responsive video player with zero backend video-serving code. "Unlisted" only means the video is unlisted on YouTube itself — it is **not** access-controlled by our app's auth; anyone with the link (leaked or guessed) can view it. This must not be described as private/secure content, and it is not suitable for anything requiring real confidentiality.
**Status**: Active for the prototype. **Migration note**: because only an opaque `video_id`/key is stored on the lesson row (never the file), swapping this for private object storage + CDN/signed URLs later only changes how that key is resolved into a playable URL — it does not require changing the `lessons` table shape or the LMS content hierarchy.

### 13. PDF/slides lessons: upload through Express, read via short-lived signed URLs

**Decision**: The `lesson-content` Supabase Storage bucket is **private** (`public: false`). Uploads go `client → Express (multipart, `multer`) → supabaseAdmin.storage.upload()`; the client never gets direct Storage write access, per ARCHITECTURE.md §8. Reads work differently: Express checks the caller is authenticated (any role can read; RLS-equivalent same as lesson content generally) and then calls `supabaseAdmin.storage.createSignedUrl()` with a 60-second TTL, returning that URL to the client — the actual file bytes then flow straight from Supabase's CDN to the browser, not proxied through Express.
**Why**: Proxying PDF bytes through Express would work but wastes Express's bandwidth/memory for no security benefit once the authorization decision (does this caller get a URL at all) has already been made — the same reasoning already applied to lesson video in Decision #12's "don't proxy the video" note. A private bucket + short-lived signed URLs keeps the actual authorization check server-side (a leaked signed URL only works for 60 seconds) while still letting large files be served efficiently. This is a read-only exception to "clients never call Supabase directly" — the client calls Supabase's CDN with a token Express minted, not Supabase's API with its own credentials, and it can never do so without Express's say-so first.
**Status**: Active.

### 14. Interactive lessons: `lessons.interactive_config` as jsonb, one exercise type (`matching`) to start

**Decision**: A `content_type: 'interactive'` lesson stores its exercise definition in a new `lessons.interactive_config` jsonb column rather than a normalized table (e.g. `interactive_exercises` + `interactive_exercise_items`). Only one exercise type exists so far — `matching` (term ↔ definition pairs, rendered client-side as a tap-to-pair exercise, graded client-side since there's no "submission" concept for it, unlike a quiz). The zod schema (`interactiveConfigSchema`) is a discriminated union on `type`, currently with one member, so adding a second exercise type is a compile-time-visible change (every `switch`/consumer has to handle it), not a silent JSON shape drift.
**Why**: PRD only requires "at least one genuinely interactive element," not a general-purpose exercise-authoring system — building normalized tables for a still-hypothetical second/third exercise type would be exactly the kind of premature abstraction `CLAUDE.md` says to avoid. jsonb keeps the DB shape stable while the exercise-type roster is still unknown; if a second type needs its own indexed queries later (not just "fetch by lesson"), that's the trigger to normalize, not before.
**Status**: Active. Revisit if a second interactive exercise type needs querying/reporting beyond "attached to this lesson."

### 15. Assessment questions: no RLS read policy at all; correct answers stripped in Express, not in the database

**Decision**: `assessment_questions` is the one content table in this codebase with **no** authenticated-read RLS policy — every other F3/F4 table (`courses`, `modules`, `lessons`, `content_translations`, `assessments`) got one. All reads of `assessment_questions` go through `supabaseAdmin` in Express: the admin/trainer authoring routes (`GET /assessments/:id/questions`) return the full row including `correct_option_id`; the trainee-facing route (`GET /assessments/:id/take`) builds a new object per question naming only the safe fields (`id`, `assessment_id`, `question_text`, `options`, `position`) — `correct_option_id` is never spread into the response. Grading (`POST /assessments/:id/attempts`) also reads the table via `supabaseAdmin` to compare submitted answers against `correct_option_id` server-side, then inserts the graded `assessment_attempts` row via `supabaseAdmin` too, rather than `req.supabase` — unlike every other own-row insert in this codebase (nominations, lesson_progress), which do use the caller's own RLS-scoped client.
**Why**: Postgres RLS is row-level, not column-level. A policy letting a trainee `SELECT` their own module's questions would have no way to hide just the `correct_option_id` column while allowing the rest — the policy would have to leak the answer key to give any read access at all. Since the correct answer must never reach the browser before grading, the only sound options were per-column Postgres `GRANT`s (real but heavier machinery, and this table has no other consumer that would benefit from it) or keeping this table entirely behind the service-role client and filtering in application code, where the "strip this field" logic is a one-line, easily-reviewed operation. The attempt insert uses `supabaseAdmin` for a related reason: correct grading requires reading `correct_option_id` in the same request handler regardless, so there was no security benefit left to gate the insert through a separate RLS-scoped client — `trainee_id` is still always taken from `req.user`, never the request body, so a trainee still can't submit as anyone else.
**Status**: Active. This is a deliberate, narrow exception — every other table added for F3/F4 does get an authenticated-read RLS policy per the established default (DATABASE.md).

### 16. Face embedding extraction runs in the browser (`apps/web`), not the Express service — amending #5

**Decision**: `@vladmandic/human` still does face detection/embedding extraction (the library choice in #5 is unchanged), but that extraction now runs client-side in `apps/web` (browser, WebGL backend) rather than server-side in Express as #5 originally described. A trainee's browser captures a webcam frame, runs Human locally, and sends only the resulting 512-number embedding array to Express — never a raw image. Express's face-rec responsibilities become: verify recorded consent, store the embedding (`face_embeddings`, own-row RLS), and — critically — always **recompute** the match server-side (cosine similarity against the trainee's own stored embedding(s)) rather than trusting any client-reported match result, per `CLAUDE.md`'s "never trust a client-reported ... face-match result" rule. The client only ever supplies the raw embedding, never a match score or a pass/fail verdict.
**Why**: Tried the server-side path first and it doesn't work on a stock Windows dev machine. `@vladmandic/human`'s Node build has two options: (1) `@tensorflow/tfjs-node` (native bindings) — a real install attempt failed outright (`npm install @tensorflow/tfjs-node`) because no prebuilt binary exists for this Node/ABI combination and the fallback native compile needs Visual Studio's C++ build tools, which aren't installed and aren't something to demand of every dev machine for a prototype; (2) the WASM Node build (`@vladmandic/human/dist/human.node-wasm.js`, no native compilation) — this **does** install and load cleanly, but a real end-to-end test (a photo with multiple clearly visible faces, run through blazeface detection) returned zero face detections while the same pipeline's body detector (movenet) correctly found a person in the same frame — a reproducible wasm-backend-specific failure in the face detector, not a config mistake (confirmed by lowering `minConfidence` to 0.05 and still getting zero results). Since Human is fundamentally built, tested, and documented as a browser-first library (WebGL backend), and the trainee's device already needs camera access for this feature regardless, running extraction in `apps/web` sidesteps both failure modes entirely and is arguably better for the DPDP Act's data-minimization principle besides — the raw camera image never has to leave the trainee's device at all, only the derived embedding does.
**Status**: Active. If mobile (`apps/mobile`) later needs face check-in, the same "extract on-device" approach applies there too (Human also runs in React Native), not a return to server-side extraction. Revisit if a future accuracy/consistency problem specifically requires centralizing extraction.

### 17. Chatbot embeddings: a local model (`Xenova/all-MiniLM-L6-v2`), not a hosted embedding API

**Decision**: F7's RAG retrieval generates embeddings **locally inside the Express service** using `@huggingface/transformers` (Transformers.js) with `Xenova/all-MiniLM-L6-v2` — 384 dimensions, mean-pooled and L2-normalized. This resolves the long-standing open question that `chatbot_corpus_chunks.embedding vector(1536)` was a placeholder for; the F7 migration recreates that column as `vector(384)`. Answer *generation* still uses the Claude API (`claude-opus-5`) per PRD §10 — only the embedding half is local. Retrieval itself is a Postgres function (`match_corpus_chunks`) using pgvector's cosine operator, called from Express via `supabase.rpc()`, because PostgREST's query builder cannot express `<=>`.
**Why**: Anthropic has no first-party embeddings API (their documented recommendation is Voyage AI), so "use Claude for embeddings too" was never an option — the real choice was between a second paid vendor (Voyage/OpenAI) and a local model. Local wins here on four counts: (1) **one key instead of two** — F7 already requires an `ANTHROPIC_API_KEY` for generation; a hosted embedding provider would add a second account, key, and bill to a project that has no committed API budget; (2) **no per-query cost or rate limit** on the highest-frequency operation in the feature (every question embeds, and every corpus chunk embeds once); (3) **it works offline once cached**, which is directionally right for a platform whose stated non-functional requirement (PRD §7) is low-bandwidth rural usability; (4) **verified quality and installability before committing** — a spike embedded a representative domain query and scored 0.87 cosine against a relevant sentence vs 0.02 against an unrelated one, then live retrieval against the real database ranked a dairy-programme chunk first at 0.731 for a dairy question, with the next-nearest at 0.404. Install was checked explicitly against the trap that burned F5: the package installs cleanly on this Windows machine and runs on the WASM backend without `onnxruntime-node`'s native binaries (their build scripts are declared off in `pnpm-workspace.yaml`), so there is no repeat of DECISIONS.md #16's native-compilation dead end.
**Status**: Active. **Migration note**: the swap cost to a hosted provider later is small and well-contained — `embedText()` in `apps/api/src/chatbotService.ts` is the only place embeddings are produced, so switching means changing that one function, changing `EMBEDDING_DIMENSIONS`/`EMBEDDING_MODEL` in `packages/constants`, and running a migration that recreates the column and the RPC signature at the new dimension (plus re-embedding the corpus, which is cheap at this size). Retrieval SQL, route shapes, and the answer-generation path are all dimension-agnostic and would not change. Worth revisiting if retrieval quality proves insufficient on a real corpus — MiniLM is a small model, and Voyage's domain models would be the first upgrade to try.
