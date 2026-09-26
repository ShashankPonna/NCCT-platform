/**
 * Re-renders every already-issued certificate PDF in the current design
 * (docs/DECISIONS.md #69). Nothing a certificate certifies changes — same
 * code, issue date, frozen marks and QR/verification link — only the PDF
 * artwork. Each new PDF is uploaded to a fresh versioned path and the row
 * repointed; the previous file is left in Storage as a backup (see
 * certificateService.rerenderCertificate for why it isn't overwritten).
 *
 * PUBLIC_WEB_URL must be the deployed web app's URL, since it's what every
 * QR code encodes — the script refuses to run against a localhost value.
 *
 * Usage: pnpm --filter api certificates:regenerate
 */
import "dotenv/config";
import { rerenderCertificate } from "../src/certificateService.js";
import { supabaseAdmin } from "../src/supabaseClient.js";

const publicWebUrl = process.env.PUBLIC_WEB_URL ?? "";
if (!/^https:\/\//.test(publicWebUrl) || publicWebUrl.includes("localhost")) {
  console.error(
    `Refusing to run: PUBLIC_WEB_URL is "${publicWebUrl}" — QR codes would point there.`,
  );
  process.exit(1);
}

const { data: certificates, error } = await supabaseAdmin
  .from("certificates")
  .select("id, certificate_code")
  .order("issued_at", { ascending: true });
if (error) throw new Error(error.message);

console.log(`Re-rendering ${certificates.length} certificate(s); QR codes → ${publicWebUrl}`);
let failed = 0;
for (const cert of certificates) {
  try {
    const { oldPath, newPath } = await rerenderCertificate(cert.id);
    console.log(`  ✓ ${cert.certificate_code}  ${oldPath} → ${newPath}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${cert.certificate_code}  ${(err as Error).message}`);
  }
}
console.log(`Done: ${certificates.length - failed} re-rendered, ${failed} failed.`);
process.exit(failed ? 1 : 0);
