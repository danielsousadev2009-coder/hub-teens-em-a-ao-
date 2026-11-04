import { ApiError } from './errorHandler.js';

class MemoryRateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  middleware(scope = 'request') {
    return (req, res, next) => {
      // In test environment, skip throttling unless explicitly enabled
      if (process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMITS) {
        return next();
      }

      const identifier = req.user?.id || req.ip || req.headers['x-forwarded-for'] || 'anonymous';
      const key = `${scope}:${identifier}`;
      const now = Date.now();

      const record = this.hits.get(key) || { count: 0, resetTime: now + this.windowMs };

      if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + this.windowMs;
      } else {
        record.count += 1;
      }

      this.hits.set(key, record);

      if (record.count > this.limit) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        return next(
          new ApiError(
            `Limite de requisições excedido. Tente novamente em ${retryAfter} segundos.`,
            429,
            'throttled'
          )
        );
      }

      next();
    };
  }

  clear() {
    this.hits.clear();
  }
}

// DRF match:
export const throttles = {
  authLogin: new MemoryRateLimiter(5, 60 * 1000).middleware('auth_login'),
  authLogout: new MemoryRateLimiter(20, 60 * 1000).middleware('auth_logout'),
  authRegister: new MemoryRateLimiter(5, 60 * 60 * 1000).middleware('auth_register'),
  authPasswordReset: new MemoryRateLimiter(3, 60 * 60 * 1000).middleware('auth_password_reset'),
  authPasswordResetConfirm: new MemoryRateLimiter(10, 60 * 60 * 1000).middleware('auth_password_reset_confirm'),
  authRefresh: new MemoryRateLimiter(20, 60 * 1000).middleware('auth_refresh'),
  aiChat: new MemoryRateLimiter(10, 60 * 60 * 1000).middleware('ai_chat'),
};

