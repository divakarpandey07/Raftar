import request from 'supertest';
import { createApp } from '../../src/app';
import { generateAccessToken, verifyAccessToken } from '../../src/utils/token';

describe('App Foundation & Integration Tests', () => {
  const app = createApp();

  test('GET /health returns status UP with version metadata', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.app).toBe('RAFTAR Backend');
    expect(res.body.version).toBe('1.0.0');
  });

  test('JWT signing and verification roundtrip', () => {
    const payload = { userId: 'user-123', email: 'athlete@raftar.app' };
    const token = generateAccessToken(payload);
    const verified = verifyAccessToken(token);
    expect(verified.userId).toBe(payload.userId);
    expect(verified.email).toBe(payload.email);
  });

  test('POST /api/v1/auth/register with invalid email returns RFC 7807 Problem Details (422)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'invalid-email-string',
        password: 'short',
        displayName: 'A',
        handle: 'bad handle!'
      });

    expect(res.status).toBe(422);
    expect(res.body.type).toBe('https://api.raftar.app/errors/VALIDATION_ERROR');
    expect(res.body.title).toBe('Unprocessable Entity');
    expect(res.body.invalid_params.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/activities without authorization header returns 401 Problem Details', async () => {
    const res = await request(app).get('/api/v1/activities');
    expect(res.status).toBe(401);
    expect(res.body.type).toBe('https://api.raftar.app/errors/UNAUTHORIZED');
    expect(res.body.detail).toContain('Bearer token missing');
  });
});
