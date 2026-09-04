-- F10: NFC trainee profile card. See docs/DECISIONS.md #30.
--
-- Two independent lookup keys added to `profiles`, each serving one of the
-- card's two read paths (docs/DECISIONS.md #6, #21):
--   public_profile_code — an opaque, rotatable code embedded in the NDEF
--     URL written to the card at issuance. Any phone's OS reads it with no
--     app installed. Rotatable so a lost card's old URL can be killed
--     without touching the physical object.
--   nfc_tag_uid — the tag's factory UID, read by the kiosk's RC522/PN532
--     reader. Nullable/unique so unbinding a lost card (without rotating
--     the public code) is a simple null-out.
--
-- `public_profile_enabled` lives on visibility_settings, not profiles,
-- consistent with how visible_to_employers already models trainee consent
-- there — but as its own column, not reusing visible_to_employers, because
-- an employer-portal audience (behind a login) and the open internet are
-- different consent scopes under the DPDP Act 2023.

alter table profiles
  add column public_profile_code text unique,
  add column nfc_tag_uid text unique;

alter table visibility_settings
  add column public_profile_enabled boolean not null default false;

-- No new RLS policy: the public profile route and the kiosk lookup route
-- both read via supabaseAdmin (service-role), matching how
-- certificates.ts's public verification route already works — see
-- docs/DATABASE.md's RLS section for why that's the deliberate pattern
-- here rather than a public-read policy on profiles itself (profiles stays
-- self-access-only; nothing else should be able to read it directly).
