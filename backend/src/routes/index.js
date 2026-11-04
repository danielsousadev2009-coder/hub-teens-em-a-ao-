import { Router } from 'express';
import authRoutes from './authRoutes.js';
import coreRoutes from './coreRoutes.js';
import odsRoutes from './odsRoutes.js';
import ideasRoutes from './ideasRoutes.js';
import { challengesRouter, submissionsRouter } from './challengesRoutes.js';
import { teamsRouter, invitationsRouter } from './teamsRoutes.js';
import { projectsRouter, projectStepsRouter } from './projectsRoutes.js';
import mediaRoutes from './mediaRoutes.js';
import { fairsRouter, fairEntriesRouter } from './fairsRoutes.js';
import { eventsRouter, eventRegistrationsRouter } from './eventsRoutes.js';
import notificationsRoutes from './notificationsRoutes.js';
import { rankingRouter, pointsRouter } from './rankingRoutes.js';
import mentorRoutes from './mentorRoutes.js';

const apiRouter = Router();

// Auth routes
apiRouter.use('/auth', authRoutes);

// Core: health & dashboard
apiRouter.use('/', coreRoutes);

// ODS
apiRouter.use('/ods', odsRoutes);

// Ideas & Categories & Comments
apiRouter.use('/ideas', ideasRoutes);

// Challenges & Submissions
apiRouter.use('/challenges', challengesRouter);
apiRouter.use('/challenge-submissions', submissionsRouter);

// Teams & Invitations
apiRouter.use('/teams', teamsRouter);
apiRouter.use('/team-invitations', invitationsRouter);

// Projects & Project Steps
apiRouter.use('/projects', projectsRouter);
apiRouter.use('/project-steps', projectStepsRouter);

// Youth Media
apiRouter.use('/youth-media', mediaRoutes);

// Fairs & Fair Entries
apiRouter.use('/fairs', fairsRouter);
apiRouter.use('/fair-entries', fairEntriesRouter);

// Events & Event Registrations
apiRouter.use('/events', eventsRouter);
apiRouter.use('/event-registrations', eventRegistrationsRouter);

// Notifications
apiRouter.use('/notifications', notificationsRoutes);

// Ranking & Points
apiRouter.use('/ranking', rankingRouter);
apiRouter.use('/points', pointsRouter);

// Mentor
apiRouter.use('/mentor', mentorRoutes);

export default apiRouter;

