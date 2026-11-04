import { Router } from 'express';
import {
  listEvents,
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  listEventRegistrations,
  createEventRegistration,
  deleteEventRegistration,
} from '../controllers/eventsController.js';
import { authenticate, requireAuth, requireTeacherOrAdmin, requireStudent } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';

const eventsRouter = Router();

eventsRouter.get('/', authenticate, requireAuth, listEvents);
eventsRouter.post('/', enforceCsrf, authenticate, requireTeacherOrAdmin, createEvent);
eventsRouter.get('/:id/', authenticate, requireAuth, getEvent);
eventsRouter.patch('/:id/', enforceCsrf, authenticate, requireTeacherOrAdmin, updateEvent);
eventsRouter.put('/:id/', enforceCsrf, authenticate, requireTeacherOrAdmin, updateEvent);
eventsRouter.delete('/:id/', enforceCsrf, authenticate, requireTeacherOrAdmin, deleteEvent);

const eventRegistrationsRouter = Router();

eventRegistrationsRouter.get('/', authenticate, requireAuth, listEventRegistrations);
eventRegistrationsRouter.post('/', enforceCsrf, authenticate, requireStudent, createEventRegistration);
eventRegistrationsRouter.delete('/:id/', enforceCsrf, authenticate, requireAuth, deleteEventRegistration);

export { eventsRouter, eventRegistrationsRouter };

