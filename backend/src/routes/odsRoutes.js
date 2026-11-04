import { Router } from 'express';
import { listOds, getOds } from '../controllers/odsController.js';
import { authenticate, requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/', authenticate, requireAuth, listOds);
router.get('/:id/', authenticate, requireAuth, getOds);

export default router;

