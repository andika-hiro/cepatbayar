import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const publicDir = path.join(__dirname, '../public');
const indexPath = path.join(publicDir, 'index.html');

describe('static file serving / SPA fallback (not built)', () => {
  beforeAll(() => {
    fs.rmSync(publicDir, { recursive: true, force: true });
  });

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

  it('does not swallow an unmatched /api/* path into the SPA fallback', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('Not built yet');
  });
});

describe('static file serving / SPA fallback (built)', () => {
  beforeAll(() => {
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(indexPath, '<!doctype html><html><body>built-client-marker</body></html>');
  });

  afterAll(() => {
    fs.rmSync(publicDir, { recursive: true, force: true });
  });

  it('serves the built index.html for a non-API path once the client is built', async () => {
    const res = await request(createApp()).get('/some-client-route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('built-client-marker');
  });

  it('still routes /api/* paths to the API instead of the built SPA fallback', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
