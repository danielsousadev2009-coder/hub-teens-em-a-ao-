import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { passwordFingerprint } from './passwords.js';

// Revoked refresh token JTIs
const revokedTokens = new Set();

export function createAccessToken(user) {
  const pwd = passwordFingerprint(user.password);
  return jwt.sign(
    {
      user_id: user.id,
      username: user.username,
      role: user.role,
      pwd,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

export function createRefreshToken(user) {
  const pwd = passwordFingerprint(user.password);
  const jti = crypto.randomUUID();
  return jwt.sign(
    {
      user_id: user.id,
      username: user.username,
      role: user.role,
      pwd,
      jti,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
}

export function revokeRefreshToken(tokenString) {
  try {
    const decoded = jwt.decode(tokenString);
    if (decoded && decoded.jti) {
      revokedTokens.add(decoded.jti);
    }
  } catch {
    // Ignore decode errors
  }
}

export function isRefreshTokenRevoked(jti) {
  return revokedTokens.has(jti);
}

export function verifyToken(tokenString) {
  return jwt.verify(tokenString, config.jwt.secret);
}

export function setAuthCookies(res, user) {
  const access = createAccessToken(user);
  const refresh = createRefreshToken(user);

  res.cookie(config.jwt.accessCookie, access, {
    httpOnly: true,
    secure: config.jwt.cookieSecure,
    sameSite: config.jwt.cookieSameSite,
    maxAge: 15 * 60 * 1000, // 15 mins
    path: '/api/',
  });

  res.cookie(config.jwt.refreshCookie, refresh, {
    httpOnly: true,
    secure: config.jwt.cookieSecure,
    sameSite: config.jwt.cookieSameSite,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/api/auth/',
  });

  return { access, refresh };
}

export function clearAuthCookies(res) {
  res.cookie(config.jwt.accessCookie, '', {
    httpOnly: true,
    secure: config.jwt.cookieSecure,
    sameSite: config.jwt.cookieSameSite,
    maxAge: 0,
    path: '/api/',
  });

  res.cookie(config.jwt.refreshCookie, '', {
    httpOnly: true,
    secure: config.jwt.cookieSecure,
    sameSite: config.jwt.cookieSameSite,
    maxAge: 0,
    path: '/api/auth/',
  });
}

