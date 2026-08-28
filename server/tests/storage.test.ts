import { describe, expect, it } from 'vitest';
import { uploadImage, isCloudinaryConfigured, isR2Configured } from '../src/lib/storage';

describe('Storage (Cloudinary, R2 & fallback)', () => {
  it('handles null/undefined gracefully', async () => {
    expect(await uploadImage(null)).toBeNull();
    expect(await uploadImage(undefined)).toBeNull();
  });

  it('preserves existing remote URLs', async () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
    expect(await uploadImage(url)).toBe(url);
  });

  it('returns fallback data when neither Cloudinary nor R2 credentials are set', async () => {
    const rawBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = await uploadImage(rawBase64);
    if (!isCloudinaryConfigured() && !isR2Configured()) {
      expect(result).toBe(rawBase64);
    }
  });
});
