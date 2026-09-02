import { S3Client } from "@aws-sdk/client-s3";

// Backblaze B2 for self-hosted lesson video — DECISIONS.md #20 (supersedes
// #18's Cloudflare R2 choice; #18 in turn supersedes #12's YouTube-hosted
// approach). B2 is S3-compatible, so the AWS SDK talks to it directly
// against B2's own endpoint; no Backblaze-specific SDK needed. Lazily
// constructed, not built at module load, so a deployment missing the B2_*
// env vars still boots — only video upload/playback routes fail, the same
// "don't crash the whole app over one feature's config" shape as
// chatbotService.ts's lazy embedder singleton.
let client: S3Client | undefined;

// B2's S3 endpoint has the shape s3.<region>.backblazeb2.com (copied
// verbatim from the bucket's page in the B2 dashboard into B2_ENDPOINT) —
// the AWS SDK still needs that region as a separate value to sign requests
// with SigV4, so it's extracted here rather than asked for as a second env
// var the two could silently drift out of sync with each other.
function extractRegion(endpoint: string): string {
  const match = /^https?:\/\/s3\.([a-z0-9-]+)\.backblazeb2\.com/i.exec(endpoint);
  if (!match) {
    throw new Error(
      `B2_ENDPOINT doesn't look like a B2 S3 endpoint (expected https://s3.<region>.backblazeb2.com, got "${endpoint}")`,
    );
  }
  return match[1];
}

export function getB2Client(): S3Client {
  if (client) return client;

  const endpoint = process.env.B2_ENDPOINT;
  const keyId = process.env.B2_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  if (!endpoint || !keyId || !applicationKey) {
    throw new Error("B2 is not configured — set B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY");
  }

  client = new S3Client({
    region: extractRegion(endpoint),
    endpoint,
    credentials: { accessKeyId: keyId, secretAccessKey: applicationKey },
  });
  return client;
}

export function getB2BucketName(): string {
  const bucket = process.env.B2_BUCKET_NAME;
  if (!bucket) {
    throw new Error("B2 is not configured — set B2_BUCKET_NAME");
  }
  return bucket;
}
