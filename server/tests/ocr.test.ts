import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('POST /api/ocr/scan', () => {
  it('scans a receipt image payload and returns structured receipt draft', async () => {
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
});
