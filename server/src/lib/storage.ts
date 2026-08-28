import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const publicUrl = process.env.R2_PUBLIC_URL; // e.g. https://media.cepatbayar.id or https://pub-xxx.r2.dev

let s3Client: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && bucketName && publicUrl);
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
  }
  return s3Client;
}

/**
 * Uploads a base64 image or data URI to Cloudflare R2.
 * If R2 is not configured, gracefully returns the base64 string directly as fallback.
 */
export async function uploadImage(
  dataUriOrBase64: string | null | undefined,
  folder: 'proofs' | 'qris' = 'proofs'
): Promise<string | null> {
  if (!dataUriOrBase64) return null;

  // If already a remote URL (e.g. https://...), return as-is
  if (dataUriOrBase64.startsWith('http://') || dataUriOrBase64.startsWith('https://')) {
    return dataUriOrBase64;
  }

  // If R2 is not configured, fallback to storing base64
  if (!isR2Configured()) {
    return dataUriOrBase64;
  }

  try {
    let mimeType = 'image/jpeg';
    let base64Data = dataUriOrBase64;

    const matches = dataUriOrBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Data = matches[2];
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const randomId = crypto.randomBytes(12).toString('hex');
    const key = `${folder}/${Date.now()}_${randomId}.${extension}`;

    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    const baseUrl = publicUrl!.replace(/\/+$/, '');
    return `${baseUrl}/${key}`;
  } catch (err) {
    console.error('Failed to upload image to Cloudflare R2:', err);
    // Fallback to storing raw data if R2 upload fails
    return dataUriOrBase64;
  }
}
