-- F5 fix: face embeddings are 1024-d, not 512-d.
--
-- The initial migration created `face_embeddings.embedding` as `vector(512)`
-- with the comment "512-d to match the Human / InsightFace buffalo_l output
-- size". That conflated two different models: InsightFace `buffalo_l` does
-- produce 512-d descriptors, but `@vladmandic/human`'s faceres model — the
-- one actually in use (DECISIONS.md #5/#16) — produces **1024**. The claim was
-- never verified against a real face until now.
--
-- Measured directly in a headless browser running the same Human config
-- `apps/web/src/FaceCapture.tsx` uses, against photos with real faces:
-- detection succeeded (score 1.0) and every descriptor came back 1024-d.
--
-- Consequences of the wrong dimension, all now fixed together:
--   * this column could never have stored a real descriptor;
--   * `enrollFaceEmbeddingSchema` / `attendanceCheckInSchema` rejected any
--     real capture as a 400 (they required exactly 512 values);
--   * `FaceCapture.tsx` reported "No face detected" for a face it HAD
--     detected, because its length check failed — the user-visible symptom
--     that prompted this investigation.
--
-- The earlier live verification passed only because it fed synthetic
-- 512-length vectors end-to-end, which is exactly the hazard of verifying a
-- pipeline with fabricated data: every layer agreed with every other layer
-- and all of them were wrong together.
--
-- Existing rows are synthetic test embeddings from that verification round,
-- so they are deleted rather than migrated — they are not real biometric
-- data and cannot be converted to a different dimension anyway.
--
-- NOTE for a future swap to InsightFace buffalo_l (the documented
-- alternative in DECISIONS.md #5): that model IS 512-d, so switching back
-- would require recreating this column at 512 and re-enrolling every
-- trainee. The two options are not interchangeable at the schema level.

delete from public.face_embeddings;

alter table public.face_embeddings drop column embedding;
alter table public.face_embeddings add column embedding extensions.vector(1024) not null;
