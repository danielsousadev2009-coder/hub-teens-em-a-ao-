import { Router } from 'express';
import {
  listFairs,
  createFair,
  getFair,
  updateFair,
  deleteFair,
  listFairEntries,
  createFairEntry,
  rejectDirectFairEntryUpdate,
  reviewFairEntry,
} from '../controllers/fairsController.js';
import { authenticate, requireAuth, requireTeacherOrAdmin, requireStudent } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';

const fairsRouter = Router();

fairsRouter.get('/', authenticate, requireAuth, listFairs);
fairsRouter.post('/', enforceCsrf, authenticate, requireTeacherOrAdmin, createFair);
fairsRouter.get('/:id/', authenticate, requireAuth, getFair);
fairsRouter.patch('/:id/', enforceCsrf, authenticate, requireTeacherOrAdmin, updateFair);
fairsRouter.put('/:id/', enforceCsrf, authenticate, requireTeacherOrAdmin, updateFair);
fairsRouter.delete('/:id/', enforceCsrf, authenticate, requireTeacherOrAdmin, deleteFair);

const fairEntriesRouter = Router();

fairEntriesRouter.get('/', authenticate, requireAuth, listFairEntries);
fairEntriesRouter.post('/', enforceCsrf, authenticate, requireStudent, createFairEntry);
fairEntriesRouter.patch('/:id/', enforceCsrf, authenticate, requireAuth, rejectDirectFairEntryUpdate);
fairEntriesRouter.put('/:id/', enforceCsrf, authenticate, requireAuth, rejectDirectFairEntryUpdate);
fairEntriesRouter.post('/:id/review/', enforceCsrf, authenticate, requireTeacherOrAdmin, reviewFairEntry);

export { fairsRouter, fairEntriesRouter };

