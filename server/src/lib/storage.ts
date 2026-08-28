import { v2 as cloudinary } from 'cloudinary';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// Cloudinary config
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
const cloudinaryUrl = process.env.CLOUDINARY_URL;

// Cloudflare R2 config
const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.R2_BUCKET_NAME;
const r2PublicUrl = process.env.R2_PUBLIC_URL;

let cloudinaryConfigured = false;
let s3Client: S3Client | null = null;

export function isCloudinaryConfigured(): boolean {
  return Boolean((cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret) || cloudinaryUrl);
}

export function isR2Configured(): boolean {
  return Boolean(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2BucketName && r2PublicUrl);
}

function initCloudinary() {
  if (!cloudinaryConfigured) {
    if (cloudinaryUrl) {
      cloudinary.config({ url: cloudinaryUrl });
    } else if (cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret) {
      cloudinary.config({
        cloud_name: cloudinaryCloudName,
        api_key: cloudinaryApiKey,
        api_secret: cloudinaryApiSecret,
        secure: true,
      });
    }
    cloudinaryConfigured = true;
  }
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId!,
        secretAccessKey: r2SecretAccessKey!,
      },
    });
  }
  return s3Client;
}

/**
 * Uploads a base64 image or data URI to Cloudinary or Cloudflare R2.
 * If neither is configured, gracefully returns the base64 string directly as fallback.
 */
export async function uploadImage(
  dataUriOrBase64: string | null | undefined,
  folder: 'proofs' | 'qris' = 'proofs'
): Promise<string | null> {
  if (!dataUriOrBase64) return null;

  // If already a remote URL (e.g. https://res.cloudinary.com/... or https://...), return as-is
  if (dataUriOrBase64.startsWith('http://') || dataUriOrBase64.startsWith('https://')) {
    return dataUriOrBase64;
  }

  // 1. Prioritize Cloudinary if configured
  if (isCloudinaryConfigured()) {
    try {
      initCloudinary();
      const result = await cloudinary.uploader.upload(dataUriOrBase64, {
        folder: `cepatbayar/${folder}`,
        resource_type: 'image',
      });
      return result.secure_url;
    } catch (err) {
      console.error('Failed to upload image to Cloudinary:', err);
      // Fallback to R2 or raw data
    }
  }

  // 2. Try Cloudflare R2 if configured
  if (isR2Configured()) {
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
          Bucket: r2BucketName,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );

      const baseUrl = r2PublicUrl!.replace(/\/+$/, '');
      return `${baseUrl}/${key}`;
    } catch (err) {
      console.error('Failed to upload image to Cloudflare R2:', err);
    }
  }

  // 3. Fallback to raw base64 data URI if no cloud storage configured
  return dataUriOrBase64;
}
