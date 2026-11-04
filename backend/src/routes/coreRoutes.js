import { Router } from 'express';
import { healthHandler, readinessHandler, dashboardHandler } from '../controllers/coreController.js';
import { authenticate, requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/health/', healthHandler);
router.get('/health/ready/', readinessHandler);
router.get('/dashboard/', authenticate, requireAuth, dashboardHandler);

export default router;

