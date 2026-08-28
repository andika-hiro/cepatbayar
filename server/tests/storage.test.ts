import { describe, expect, it } from 'vitest';
import { uploadImage, isR2Configured } from '../src/lib/storage';

describe('Storage (Cloudflare R2 & fallback)', () => {
  it('handles null/undefined gracefully', async () => {
    expect(await uploadImage(null)).toBeNull();
    expect(await uploadImage(undefined)).toBeNull();
  });

  it('preserves existing remote URLs', async () => {
    const url = 'https://media.example.com/proofs/receipt.jpg';
    expect(await uploadImage(url)).toBe(url);
  });

  it('returns fallback data when R2 credentials are not set', async () => {
    const rawBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = await uploadImage(rawBase64);
    // If R2 is not configured in test env, it returns rawBase64
    if (!isR2Configured()) {
      expect(result).toBe(rawBase64);
    }
  });
});
