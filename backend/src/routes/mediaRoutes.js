import { Router } from 'express';
import multer from 'multer';
import {
  listArticles,
  createArticle,
  getArticle,
  updateArticle,
  deleteArticle,
  moderateArticle,
} from '../controllers/mediaController.js';
import { authenticate, requireAuth, requireStudent, requireTeacherOrAdmin } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.get('/', authenticate, requireAuth, listArticles);
router.post('/', enforceCsrf, authenticate, requireStudent, upload.single('image'), createArticle);
router.get('/:id/', authenticate, requireAuth, getArticle);
router.patch('/:id/', enforceCsrf, authenticate, requireAuth, upload.single('image'), updateArticle);
router.put('/:id/', enforceCsrf, authenticate, requireAuth, upload.single('image'), updateArticle);
router.delete('/:id/', enforceCsrf, authenticate, requireAuth, deleteArticle);
router.post('/:id/moderate/', enforceCsrf, authenticate, requireTeacherOrAdmin, moderateArticle);

export default router;

