/**
 * Client-side image compressor.
 * Automatically resizes large images (e.g. 12MP camera photos) to max 1200px
 * and compresses to WebP/JPEG (quality: 0.8), reducing file size by up to 90-95%
 * before sending to server or Cloudflare R2.
 */
export async function compressImage(
  fileOrDataUrl: File | string,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve) => {
    const src =
      typeof fileOrDataUrl === 'string'
        ? fileOrDataUrl
        : URL.createObjectURL(fileOrDataUrl);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (typeof fileOrDataUrl !== 'string') {
        URL.revokeObjectURL(src);
      }

      let { width, height } = img;

      // Scale down if exceeding max dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback to original
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : src);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Try webp first, fallback to jpeg
      let result = canvas.toDataURL('image/webp', quality);
      if (!result.startsWith('data:image/webp')) {
        result = canvas.toDataURL('image/jpeg', quality);
      }

      resolve(result);
    };

    img.onerror = () => {
      // If error loading, resolve original data url if available
      resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
    };

    img.src = src;
  });
}
