import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('static file serving / SPA fallback', () => {
  it('returns 404 with a helpful message for a non-API path when no build exists', async () => {
    const res = await request(createApp()).get('/some-client-route');
    expect(res.status).toBe(404);
    expect(res.text).toContain('Not built yet');
  });

  it('still routes /api/* paths to the API instead of the SPA fallback', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
