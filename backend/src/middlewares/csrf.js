import crypto from 'crypto';
import { config } from '../config/env.js';
import { ApiError } from './errorHandler.js';

export function getOrCreateCsrfToken(req, res) {
  let token = req.cookies?.csrftoken;
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrftoken', token, {
      httpOnly: false, // Frontend reads it or sends from GET /api/auth/csrf/
      secure: config.jwt.cookieSecure,
      sameSite: config.jwt.cookieSameSite,
      path: '/',
    });
  }
  return token;
}

export function enforceCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    return next();
  }

  const headerToken = req.headers['x-csrftoken'] || req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.csrftoken;

  if (!headerToken) {
    return next(new ApiError('CSRF validation failed.', 403, 'permission_denied'));
  }

  // If cookie exists, verify match
  if (cookieToken && headerToken !== cookieToken) {
    return next(new ApiError('CSRF validation failed.', 403, 'permission_denied'));
  }

  // Check origin/referer against allowed origins in production if available
  const origin = req.headers['origin'] || req.headers['referer'];
  if (config.isProd && origin) {
    try {
      const originUrl = new URL(origin).origin;
      const originHost = new URL(origin).host;
      const reqHost = req.headers['x-forwarded-host'] || req.headers['host'];

      // Same-origin is always safe
      const isSameHost = Boolean(reqHost && originHost.toLowerCase() === reqHost.toLowerCase());

      // Vercel deployment preview / production domains
      const isVercelDomain = originHost.endsWith('.vercel.app');

      const isAllowed = isSameHost ||
        isVercelDomain ||
        config.corsAllowedOrigins.includes(originUrl) ||
        config.csrfTrustedOrigins.includes(originUrl);

      if (!isAllowed) {
        return next(new ApiError('CSRF origin check failed.', 403, 'permission_denied'));
      }
    } catch {
      return next(new ApiError('CSRF origin check failed.', 403, 'permission_denied'));
    }
  }

  next();
}

