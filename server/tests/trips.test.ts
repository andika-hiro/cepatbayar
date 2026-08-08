import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createAuthedUser } from './helpers/auth';

const app = createApp();

describe('POST /api/trips', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/trips').send({});
    expect(res.status).toBe(401);
  });

  it('creates a trip with members for the authenticated user', async () => {
    const { cookie } = await createAuthedUser('dedi@example.com');
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', cookie)
      .send({
        name: 'Trip ke Jogja',
        destination: 'Yogyakarta',
        startDate: '2026-09-01',
        endDate: '2026-09-04',
        members: ['Dedi', 'Budi'],
      });
    expect(res.status).toBe(201);
    expect(res.body.publicId).toBeTypeOf('string');
    expect(res.body.publicId.length).toBeGreaterThan(10);
  });

  it('rejects a trip with no members', async () => {
    const { cookie } = await createAuthedUser('eka@example.com');
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', cookie)
      .send({ name: 'Trip', destination: 'Bandung', startDate: '2026-09-01', endDate: '2026-09-02', members: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/trips/mine', () => {
  it('lists only trips created by the authenticated user', async () => {
    const { cookie: cookieA } = await createAuthedUser('fajar@example.com');
    const { cookie: cookieB } = await createAuthedUser('gita@example.com');
    await request(app).post('/api/trips').set('Cookie', cookieA).send({
      name: 'Trip A', destination: 'Bali', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Fajar'],
    });
    await request(app).post('/api/trips').set('Cookie', cookieB).send({
      name: 'Trip B', destination: 'Lombok', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Gita'],
    });

    const res = await request(app).get('/api/trips/mine').set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Trip A');
    expect(res.body[0].memberCount).toBe(1);
    expect(res.body[0].unsettledCount).toBe(0);
  });
});

describe('GET /api/trips/:publicId', () => {
  it('returns trip detail with members for a valid publicId', async () => {
    const { cookie } = await createAuthedUser('hana@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Hana', destination: 'Malang', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Hana', 'Ivan'],
    });
    const { publicId } = createRes.body;

    const res = await request(app).get(`/api/trips/${publicId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Trip Hana');
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members.map((m: { name: string }) => m.name)).toEqual(['Hana', 'Ivan']);
  });

  it('returns 404 for an unknown publicId', async () => {
    const res = await request(app).get('/api/trips/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/trips/summary', () => {
  it('returns summaries for known ids and silently drops unknown ones', async () => {
    const { cookie } = await createAuthedUser('joko@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Joko', destination: 'Solo', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Joko'],
    });
    const { publicId } = createRes.body;

    const res = await request(app).post('/api/trips/summary').send({ publicIds: [publicId, 'unknown-id'] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].publicId).toBe(publicId);
  });
});
