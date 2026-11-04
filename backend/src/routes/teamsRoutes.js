import { Router } from 'express';
import {
  listTeams,
  createTeam,
  getTeam,
  updateTeam,
  deleteTeam,
  inviteMember,
  listInvitations,
  acceptInvitation,
} from '../controllers/teamsController.js';
import { authenticate, requireAuth, requireStudent } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';

const teamsRouter = Router();

teamsRouter.get('/', authenticate, requireAuth, listTeams);
teamsRouter.post('/', enforceCsrf, authenticate, requireStudent, createTeam);
teamsRouter.get('/:id/', authenticate, requireAuth, getTeam);
teamsRouter.patch('/:id/', enforceCsrf, authenticate, requireAuth, updateTeam);
teamsRouter.put('/:id/', enforceCsrf, authenticate, requireAuth, updateTeam);
teamsRouter.delete('/:id/', enforceCsrf, authenticate, requireAuth, deleteTeam);
teamsRouter.post('/:id/invite/', enforceCsrf, authenticate, requireAuth, inviteMember);

const invitationsRouter = Router();

invitationsRouter.get('/', authenticate, requireAuth, listInvitations);
invitationsRouter.post('/:id/accept/', enforceCsrf, authenticate, requireAuth, acceptInvitation);

export { teamsRouter, invitationsRouter };

