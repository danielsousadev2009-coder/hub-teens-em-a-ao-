import { Router } from 'express';
import {
  listCategories,
  createCategory,
  listIdeas,
  createIdea,
  getIdea,
  updateIdea,
  deleteIdea,
  moderateIdea,
  listIdeaComments,
  createIdeaComment,
} from '../controllers/ideasController.js';
import { authenticate, requireAuth, requireAdmin, requireTeacherOrAdmin } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';

const router = Router();

// Categories
router.get('/categories/', authenticate, requireAuth, listCategories);
router.post('/categories/', enforceCsrf, authenticate, requireAdmin, createCategory);

// Ideas CRUD
router.get('/', authenticate, requireAuth, listIdeas);
router.post('/', enforceCsrf, authenticate, requireAuth, createIdea);
router.get('/:id/', authenticate, requireAuth, getIdea);
router.patch('/:id/', enforceCsrf, authenticate, requireAuth, updateIdea);
router.put('/:id/', enforceCsrf, authenticate, requireAuth, updateIdea);
router.delete('/:id/', enforceCsrf, authenticate, requireAuth, deleteIdea);

// Moderate
router.post('/:id/moderate/', enforceCsrf, authenticate, requireTeacherOrAdmin, moderateIdea);

// Comments
router.get('/:ideaId/comments/', authenticate, requireAuth, listIdeaComments);
router.post('/:ideaId/comments/', enforceCsrf, authenticate, requireAuth, createIdeaComment);

export default router;

