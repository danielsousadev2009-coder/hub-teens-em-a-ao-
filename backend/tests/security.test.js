import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceCsrf } from '../src/middlewares/csrf.js';
import { createAccessToken, createRefreshToken, verifyToken } from '../src/utils/tokens.js';
import { errorHandler, ApiError, ValidationError } from '../src/middlewares/errorHandler.js';
import { throttles } from '../src/middlewares/rateLimiter.js';

test('createAccessToken and createRefreshToken generate verifiable JWTs', () => {
  const user = {
    id: 10,
    username: 'aluno.teste',
    role: 'student',
    password: 'password-hash-example',
  };

  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  assert.equal(typeof accessToken, 'string');
  assert.equal(typeof refreshToken, 'string');

  const decodedAccess = verifyToken(accessToken);
  assert.equal(decodedAccess.user_id, 10);
  assert.equal(decodedAccess.username, 'aluno.teste');
  assert.equal(decodedAccess.role, 'student');
  assert.ok(decodedAccess.pwd);

  const decodedRefresh = verifyToken(refreshToken);
  assert.equal(decodedRefresh.user_id, 10);
  assert.ok(decodedRefresh.jti);
});

test('enforceCsrf allows safe GET/HEAD methods without tokens', () => {
  let called = false;
  const next = (err) => {
    assert.equal(err, undefined);
    called = true;
  };

  enforceCsrf({ method: 'GET' }, {}, next);
  assert.equal(called, true);
});

test('enforceCsrf rejects mutation requests without X-CSRFToken', () => {
  let errorCaught = null;
  const next = (err) => {
    errorCaught = err;
  };

  enforceCsrf({ method: 'POST', headers: {} }, {}, next);
  assert.ok(errorCaught);
  assert.equal(errorCaught.status, 403);
  assert.equal(errorCaught.message, 'CSRF validation failed.');
});

test('enforceCsrf accepts mutation request when header matches cookie', () => {
  let called = false;
  const next = (err) => {
    assert.equal(err, undefined);
    called = true;
  };

  const req = {
    method: 'POST',
    headers: { 'x-csrftoken': 'token123' },
    cookies: { csrftoken: 'token123' },
  };

  enforceCsrf(req, {}, next);
  assert.equal(called, true);
});

test('errorHandler emits standard DRF-compatible error response', () => {
  let responseData = null;
  let responseStatus = null;

  const res = {
    headersSent: false,
    status(s) {
      responseStatus = s;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  const err = new ValidationError('Dados inválidos.', { email: ['E-mail inválido.'] });
  errorHandler(err, {}, res, () => {});

  assert.equal(responseStatus, 400);
  assert.deepEqual(responseData, {
    error: {
      code: 'validation_error',
      message: 'Dados inválidos.',
      details: { email: ['E-mail inválido.'] },
    },
  });
});
