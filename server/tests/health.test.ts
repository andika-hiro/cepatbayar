import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
