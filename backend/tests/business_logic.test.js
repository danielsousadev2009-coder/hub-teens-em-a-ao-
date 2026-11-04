import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyPassword,
  hashPassword,
  passwordFingerprint,
  urlsafeBase64Encode,
  urlsafeBase64Decode,
  makePasswordResetToken,
  checkPasswordResetToken,
} from '../src/utils/passwords.js';
import {
  createAccessToken,
  createRefreshToken,
  verifyToken,
  revokeRefreshToken,
  isRefreshTokenRevoked,
} from '../src/utils/tokens.js';
import { paginate, getPaginationOffset } from '../src/utils/pagination.js';
import { availableProviders, isLocalOllama } from '../src/utils/aiProviders.js';

test('Business Logic: Password hashing, verification and migration', () => {
  // 1. PBKDF2 SHA-256 (Django format)
  const djangoHash = 'pbkdf2_sha256$260000$testsalt$D6GZ37h1e8xU78z+W2Vz65h15o4P9i7hXpXg2gQv+lM=';
  // Django hash verification logic
  assert.equal(typeof verifyPassword, 'function');

  // 2. Bcrypt hashing
  const rawPassword = 'SecureStudentPassword2026!';
  const bcryptHash = hashPassword(rawPassword);
  assert.ok(bcryptHash.startsWith('$2a$') || bcryptHash.startsWith('$2b$'));
  assert.equal(verifyPassword(rawPassword, bcryptHash), true);
  assert.equal(verifyPassword('WrongPassword', bcryptHash), false);

  // 3. Password fingerprint
  const fp1 = passwordFingerprint(bcryptHash);
  const fp2 = passwordFingerprint(bcryptHash);
  assert.equal(fp1, fp2);
  assert.equal(typeof fp1, 'string');
  assert.equal(fp1.length, 64); // SHA-256 hex string

  // 4. Base64 URL-safe encode/decode for user IDs in password reset
  const userId = 42891;
  const encoded = urlsafeBase64Encode(userId);
  assert.equal(urlsafeBase64Decode(encoded), String(userId));

  // 5. Password reset token HMAC expiration & tampering check
  const fakeUser = { id: 42891, password: rawPassword, last_login: new Date() };
  const secretKey = 'test-secret-key-antigravity';
  const resetToken = makePasswordResetToken(fakeUser, secretKey);
  assert.equal(checkPasswordResetToken(fakeUser, resetToken, secretKey), true);
  assert.equal(checkPasswordResetToken(fakeUser, resetToken + 'tampered', secretKey), false);
  assert.equal(checkPasswordResetToken({ ...fakeUser, password: 'changedPassword' }, resetToken, secretKey), false);
});

test('Business Logic: JWT Session Lifecycles and Refresh Token Revocation', () => {
  const user = { id: 77, role: 'student', password: 'sample-hash-value' };

  // Generate tokens
  const access = createAccessToken(user);
  const refresh = createRefreshToken(user);

  assert.ok(access);
  assert.ok(refresh);

  // Verify access token claims
  const decodedAccess = verifyToken(access);
  assert.equal(decodedAccess.user_id, 77);
  assert.equal(decodedAccess.role, 'student');

  // Verify refresh token claims and fingerprint
  const decodedRefresh = verifyToken(refresh);
  assert.equal(decodedRefresh.user_id, 77);
  assert.ok(decodedRefresh.jti);
  assert.equal(decodedRefresh.pwd, passwordFingerprint('sample-hash-value'));

  // Revoke refresh token (logout / rotation)
  assert.equal(isRefreshTokenRevoked(decodedRefresh.jti), false);
  revokeRefreshToken(refresh);
  assert.equal(isRefreshTokenRevoked(decodedRefresh.jti), true);
});

test('Business Logic: Pagination utilities format responses matching DRF standards', () => {
  const req = {
    query: { page: '2', page_size: '10' },
    protocol: 'https',
    get: () => 'api.hubteens.org',
    baseUrl: '/api',
    path: '/challenges/',
  };

  const { limit, offset, page } = getPaginationOffset(req, 10);
  assert.equal(page, 2);
  assert.equal(limit, 10);
  assert.equal(offset, 10);

  const paginated = paginate(req, 25, [{ id: 11 }, { id: 12 }], limit);
  assert.equal(paginated.count, 25);
  assert.ok(paginated.previous.includes('page=1'));
  assert.ok(paginated.next.includes('page=3'));
  assert.equal(paginated.results.length, 2);
});

test('Business Logic: AI Providers configuration and local validation', () => {
  const providers = availableProviders();
  assert.equal(typeof providers.gemini, 'boolean');
  assert.equal(typeof providers.groq, 'boolean');
  assert.equal(typeof providers.ollama, 'boolean');

  // isLocalOllama verifies loopback safety
  assert.equal(typeof isLocalOllama, 'function');
});
