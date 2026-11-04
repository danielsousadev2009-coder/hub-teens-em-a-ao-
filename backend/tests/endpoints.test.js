import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import app from '../src/app.js';

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Health and ready endpoints respond', async () => {
  const healthRes = await fetch(`${baseUrl}/api/health/`);
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.status, 'ok');

  // Fallback mount directly on root (for Vercel rewrites without /api prefix)
  const fallbackRes = await fetch(`${baseUrl}/health/`);
  assert.equal(fallbackRes.status, 200);
  const fallbackData = await fallbackRes.json();
  assert.equal(fallbackData.status, 'ok');
});

test('All protected endpoints consistently enforce 401 for unauthenticated requests', async () => {
  const endpoints = [
    '/api/auth/me/',
    '/api/dashboard/',
    '/api/ods/',
    '/api/ideas/',
    '/api/ideas/categories/',
    '/api/challenges/',
    '/api/challenge-submissions/',
    '/api/teams/',
    '/api/team-invitations/',
    '/api/projects/',
    '/api/project-steps/',
    '/api/youth-media/',
    '/api/fairs/',
    '/api/fair-entries/',
    '/api/events/',
    '/api/event-registrations/',
    '/api/notifications/',
    '/api/ranking/',
    '/api/points/me/',
    '/api/mentor/providers/',
    '/api/mentor/conversations/',
  ];

  for (const ep of endpoints) {
    const res = await fetch(`${baseUrl}${ep}`);
    assert.equal(res.status, 401, `Endpoint ${ep} should return 401 for unauthenticated request`);
    const body = await res.json();
    assert.ok(body.error, `Endpoint ${ep} response should contain an error object`);
    assert.equal(body.error.code, 'not_authenticated');
  }
});

test('Unknown API routes return standard DRF-compatible 404 response', async () => {
  const res = await fetch(`${baseUrl}/api/non-existent-endpoint/`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'not_found');
  assert.equal(body.error.message, 'Rota da API não encontrada.');
});

test('POST to /api/points/me/ returns 405 Method Not Allowed', async () => {
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf/`);
  const csrfCookie = csrfRes.headers.get('set-cookie');
  const { csrfToken } = await csrfRes.json();

  const res = await fetch(`${baseUrl}/api/points/me/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken,
      Cookie: csrfCookie,
    },
    body: JSON.stringify({ points: 100 }),
  });

  // 405 Method Not Allowed or 401 Not Authenticated (both reject direct points writing)
  assert.ok([401, 405].includes(res.status));
});

