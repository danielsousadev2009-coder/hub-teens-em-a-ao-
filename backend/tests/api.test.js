import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import app from '../src/app.js';
import { paginate } from '../src/utils/pagination.js';
import { createAccessToken } from '../src/utils/tokens.js';
import { config } from '../src/config/env.js';

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

test('GET /api/health/ returns status ok and service name', async () => {
  const res = await fetch(`${baseUrl}/api/health/`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, { status: 'ok', service: 'hub-teens-api' });
});

test('GET /api/auth/csrf/ returns csrfToken and sets csrftoken cookie', async () => {
  const res = await fetch(`${baseUrl}/api/auth/csrf/`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.csrfToken);
  assert.equal(typeof data.csrfToken, 'string');

  const cookies = res.headers.get('set-cookie');
  assert.ok(cookies);
  assert.ok(cookies.includes('csrftoken='));
});

test('Anonymous user cannot access private endpoints (returns 401)', async () => {
  const endpoints = [
    '/api/dashboard/',
    '/api/ideas/',
    '/api/projects/',
    '/api/notifications/',
    '/api/mentor/providers/',
    '/api/ranking/',
    '/api/points/me/',
  ];

  for (const ep of endpoints) {
    const res = await fetch(`${baseUrl}${ep}`);
    assert.equal(res.status, 401, `Expected 401 for ${ep}`);
    const data = await res.json();
    assert.equal(data.error.code, 'not_authenticated');
  }
});

import { requireStudent, requireTeacherOrAdmin, requireAdmin } from '../src/middlewares/auth.js';

test('Role permission middlewares enforce student, teacher, and administrator access', () => {
  const studentReq = { user: { id: 1, role: 'student' } };
  const teacherReq = { user: { id: 2, role: 'teacher' } };
  const adminReq = { user: { id: 3, role: 'administrator' } };

  // requireStudent
  let err = null;
  requireStudent(studentReq, {}, (e) => { err = e; });
  assert.equal(err, undefined);

  requireStudent(teacherReq, {}, (e) => { err = e; });
  assert.ok(err);
  assert.equal(err.status, 403);

  // requireTeacherOrAdmin
  err = null;
  requireTeacherOrAdmin(teacherReq, {}, (e) => { err = e; });
  assert.equal(err, undefined);

  err = null;
  requireTeacherOrAdmin(adminReq, {}, (e) => { err = e; });
  assert.equal(err, undefined);

  requireTeacherOrAdmin(studentReq, {}, (e) => { err = e; });
  assert.ok(err);
  assert.equal(err.status, 403);

  // requireAdmin
  err = null;
  requireAdmin(adminReq, {}, (e) => { err = e; });
  assert.equal(err, undefined);

  requireAdmin(teacherReq, {}, (e) => { err = e; });
  assert.ok(err);
  assert.equal(err.status, 403);

  requireAdmin(studentReq, {}, (e) => { err = e; });
  assert.ok(err);
  assert.equal(err.status, 403);
});

test('paginate utility produces DRF page structure with count, next, previous and results', () => {
  const req = {
    query: { page: '1' },
    protocol: 'https',
    get: () => 'api.example.org',
    baseUrl: '/api',
    path: '/ods/',
  };

  const paginated = paginate(req, 45, [{ id: 1 }, { id: 2 }], 20);
  assert.equal(paginated.count, 45);
  assert.equal(paginated.previous, null);
  assert.ok(paginated.next.includes('page=2'));
  assert.equal(paginated.results.length, 2);
});
