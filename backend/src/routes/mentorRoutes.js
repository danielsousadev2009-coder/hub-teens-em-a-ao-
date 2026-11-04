import { Router } from 'express';
import {
  getMentorProviders,
  listConversations,
  createConversation,
  deleteConversation,
  chatInConversation,
} from '../controllers/mentorController.js';
import { authenticate, requireAuth, requireStudent } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';
import { throttles } from '../middlewares/rateLimiter.js';

const router = Router();

router.get('/providers/', authenticate, requireAuth, getMentorProviders);
router.get('/conversations/', authenticate, requireAuth, listConversations);
router.post('/conversations/', enforceCsrf, authenticate, requireStudent, throttles.aiChat, createConversation);
router.delete('/conversations/:id/', enforceCsrf, authenticate, requireAuth, deleteConversation);
router.post('/conversations/:id/chat/', enforceCsrf, authenticate, requireStudent, throttles.aiChat, chatInConversation);

export default router;

