import { Router } from 'express';
import {
  getMentorProviders,
  listConversations,
  createConversation,
  deleteConversation,
  chatInConversation,
  getAiAdminConfig,
  updateAiAdminConfig,
  testAiProviderEndpoint,
} from '../controllers/mentorController.js';
import { authenticate, requireAuth, requireTeacherOrAdmin } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';
import { throttles } from '../middlewares/rateLimiter.js';

const router = Router();

// Student & User routes
router.get('/providers/', authenticate, requireAuth, getMentorProviders);
router.get('/conversations/', authenticate, requireAuth, listConversations);
router.post('/conversations/', enforceCsrf, authenticate, requireAuth, throttles.aiChat, createConversation);
router.delete('/conversations/:id/', enforceCsrf, authenticate, requireAuth, deleteConversation);
router.post('/conversations/:id/chat/', enforceCsrf, authenticate, requireAuth, throttles.aiChat, chatInConversation);

// AI Administration and Configuration (Teacher & Admin)
router.get('/admin/config/', authenticate, requireTeacherOrAdmin, getAiAdminConfig);
router.post('/admin/config/', enforceCsrf, authenticate, requireTeacherOrAdmin, updateAiAdminConfig);
router.post('/admin/test/', enforceCsrf, authenticate, requireTeacherOrAdmin, testAiProviderEndpoint);

export default router;
