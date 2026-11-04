import { Router } from 'express';
import { getRanking, getMyPoints, rejectPointsWrite } from '../controllers/rankingController.js';
import { authenticate, requireAuth } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';

const rankingRouter = Router();
rankingRouter.get('/', authenticate, requireAuth, getRanking);

const pointsRouter = Router();
pointsRouter.get('/me/', authenticate, requireAuth, getMyPoints);
pointsRouter.all('/me/', enforceCsrf, authenticate, requireAuth, rejectPointsWrite);

export { rankingRouter, pointsRouter };

