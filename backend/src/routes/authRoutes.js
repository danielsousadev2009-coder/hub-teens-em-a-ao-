import { Router } from 'express';
import {
  csrfHandler,
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  getProfileHandler,
  patchProfileHandler,
  passwordResetRequestHandler,
  passwordResetConfirmHandler,
} from '../controllers/authController.js';
import { authenticate, requireAuth } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';
import { throttles } from '../middlewares/rateLimiter.js';

const router = Router();

router.get('/csrf/', csrfHandler);
router.post('/register/', enforceCsrf, throttles.authRegister, registerHandler);
router.post('/login/', enforceCsrf, throttles.authLogin, loginHandler);
router.post('/refresh/', enforceCsrf, throttles.authRefresh, refreshHandler);
router.post('/logout/', enforceCsrf, throttles.authLogout, logoutHandler);
router.get('/me/', authenticate, requireAuth, getProfileHandler);
router.patch('/me/', enforceCsrf, authenticate, requireAuth, patchProfileHandler);
router.post('/password-reset/', enforceCsrf, throttles.authPasswordReset, passwordResetRequestHandler);
router.post('/password-reset/confirm/', enforceCsrf, throttles.authPasswordResetConfirm, passwordResetConfirmHandler);

export default router;

