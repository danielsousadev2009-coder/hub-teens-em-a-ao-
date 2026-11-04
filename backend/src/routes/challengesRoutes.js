import { Router } from 'express';
import {
  listChallenges,
  createChallenge,
  getChallenge,
  updateChallenge,
  deleteChallenge,
  listSubmissions,
  createSubmission,
  rejectDirectSubmissionUpdate,
  reviewSubmission,
} from '../controllers/challengesController.js';
import { authenticate, requireAuth, requireTeacherOrAdmin, requireStudent } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';

const challengesRouter = Router();

challengesRouter.get('/', authenticate, requireAuth, listChallenges);
challengesRouter.post('/', enforceCsrf, authenticate, requireTeacherOrAdmin, createChallenge);
challengesRouter.get('/:id/', authenticate, requireAuth, getChallenge);
challengesRouter.patch('/:id/', enforceCsrf, authenticate, requireTeacherOrAdmin, updateChallenge);
challengesRouter.put('/:id/', enforceCsrf, authenticate, requireTeacherOrAdmin, updateChallenge);
challengesRouter.delete('/:id/', enforceCsrf, authenticate, requireTeacherOrAdmin, deleteChallenge);

const submissionsRouter = Router();

submissionsRouter.get('/', authenticate, requireAuth, listSubmissions);
submissionsRouter.post('/', enforceCsrf, authenticate, requireStudent, createSubmission);
submissionsRouter.patch('/:id/', enforceCsrf, authenticate, requireAuth, rejectDirectSubmissionUpdate);
submissionsRouter.put('/:id/', enforceCsrf, authenticate, requireAuth, rejectDirectSubmissionUpdate);
submissionsRouter.post('/:id/review/', enforceCsrf, authenticate, requireTeacherOrAdmin, reviewSubmission);

export { challengesRouter, submissionsRouter };

