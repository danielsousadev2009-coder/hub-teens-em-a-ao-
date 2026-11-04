import { Router } from 'express';
import {
  listNotifications,
  getNotification,
  markRead,
  markAllRead,
} from '../controllers/notificationsController.js';
import { authenticate, requireAuth } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';

const router = Router();

router.get('/', authenticate, requireAuth, listNotifications);
router.get('/:id/', authenticate, requireAuth, getNotification);
router.post('/:id/mark_read/', enforceCsrf, authenticate, requireAuth, markRead);
router.post('/mark_all_read/', enforceCsrf, authenticate, requireAuth, markAllRead);

export default router;

