import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('POST /api/ocr/scan', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VISION_LLM_API_KEY;
  });

  it('scans a receipt image payload and returns structured receipt draft (mock fallback, no key configured)', async () => {
    const res = await request(app)
      .post('/api/ocr/scan')
      .send({ imageBase64: 'data:image/png;base64,mockdata' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('taxPercent');
    expect(res.body).toHaveProperty('servicePercent');
    expect(res.body).toHaveProperty('total');
  });

  it('rejects request without imageBase64', async () => {
    const res = await request(app).post('/api/ocr/scan').send({});
    expect(res.status).toBe(400);
  });

  it('calls the Gemini vision API and parses its JSON response when an API key is configured', async () => {
    process.env.VISION_LLM_API_KEY = 'test-key';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [{ name: 'Kopi Susu', price: 20000 }],
                    taxPercent: 10,
                    servicePercent: 0,
                    total: 22000,
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await request(app)
      .post('/api/ocr/scan')
      .send({ imageBase64: 'data:image/jpeg;base64,realimagedata' });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([{ name: 'Kopi Susu', price: 20000 }]);
    expect(res.body.total).toBe(22000);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('key=test-key');
    const requestBody = JSON.parse(options.body);
    expect(requestBody.contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg');
    expect(requestBody.contents[0].parts[1].inline_data.data).toBe('realimagedata');
  });
});
