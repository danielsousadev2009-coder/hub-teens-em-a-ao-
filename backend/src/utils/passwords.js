import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Verifies a password against a stored password hash.
 * Supports:
 * - Django PBKDF2 SHA-256 (`pbkdf2_sha256$...`)
 * - bcrypt (`$2a$`, `$2b$`, `$2y$`)
 */
export function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;

  // Django PBKDF2 format: pbkdf2_sha256$<iterations>$<salt>$<hash>
  if (storedHash.startsWith('pbkdf2_sha256$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const expectedHash = parts[3];

    try {
      const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64');
      const bufA = Buffer.from(derived, 'utf-8');
      const bufB = Buffer.from(expectedHash, 'utf-8');
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  // bcrypt format
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    try {
      return bcrypt.compareSync(password, storedHash);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Hashes a new password using bcrypt (or standard format).
 */
export function hashPassword(password) {
  const salt = bcrypt.genSaltSync(12);
  return bcrypt.hashSync(password, salt);
}

/**
 * Computes SHA-256 password fingerprint matching Django's
 * `hashlib.sha256(user.password.encode('utf-8')).hexdigest()`.
 */
export function passwordFingerprint(passwordHash) {
  return crypto.createHash('sha256').update(passwordHash || '').digest('hex');
}

/**
 * URL-safe Base64 encode for user primary key (Django urlsafe_base64_encode).
 */
export function urlsafeBase64Encode(val) {
  return Buffer.from(String(val), 'utf-8').toString('base64url');
}

/**
 * URL-safe Base64 decode for user primary key (Django urlsafe_base64_decode).
 */
export function urlsafeBase64Decode(encoded) {
  return Buffer.from(String(encoded), 'base64url').toString('utf-8');
}

/**
 * Generates a password reset token HMAC-SHA256 tied to the user's ID, password hash,
 * and timestamp. If the password is changed, old tokens automatically become invalid.
 */
export function makePasswordResetToken(user, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${user.id}:${user.password}:${timestamp}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${timestamp}-${sig}`;
}

/**
 * Checks a password reset token for validity and max age (e.g. 1 hour).
 */
export function checkPasswordResetToken(user, token, secret, maxAgeSeconds = 3600) {
  if (!token || typeof token !== 'string') return false;
  const hyphenIndex = token.indexOf('-');
  if (hyphenIndex === -1) return false;

  const timestampStr = token.substring(0, hyphenIndex);
  const sig = token.substring(hyphenIndex + 1);
  const timestamp = parseInt(timestampStr, 10);
  if (Number.isNaN(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > maxAgeSeconds || timestamp > now + 60) {
    return false; // Expired or future
  }

  const expectedData = `${user.id}:${user.password}:${timestamp}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(expectedData).digest('base64url');

  try {
    const bufA = Buffer.from(sig, 'utf-8');
    const bufB = Buffer.from(expectedSig, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

