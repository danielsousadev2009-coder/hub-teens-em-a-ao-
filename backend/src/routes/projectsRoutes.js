import { Router } from 'express';
import multer from 'multer';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  listProjectSteps,
  createProjectStep,
  updateProjectStep,
  deleteProjectStep,
} from '../controllers/projectsController.js';
import { authenticate, requireAuth, requireStudent } from '../middlewares/auth.js';
import { enforceCsrf } from '../middlewares/csrf.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit for safety
});

const projectsRouter = Router();

projectsRouter.get('/', authenticate, requireAuth, listProjects);
projectsRouter.post('/', enforceCsrf, authenticate, requireStudent, upload.single('image'), createProject);
projectsRouter.get('/:id/', authenticate, requireAuth, getProject);
projectsRouter.patch('/:id/', enforceCsrf, authenticate, requireAuth, upload.single('image'), updateProject);
projectsRouter.put('/:id/', enforceCsrf, authenticate, requireAuth, upload.single('image'), updateProject);
projectsRouter.delete('/:id/', enforceCsrf, authenticate, requireAuth, deleteProject);

const projectStepsRouter = Router();

projectStepsRouter.get('/', authenticate, requireAuth, listProjectSteps);
projectStepsRouter.post('/', enforceCsrf, authenticate, requireAuth, createProjectStep);
projectStepsRouter.patch('/:id/', enforceCsrf, authenticate, requireAuth, updateProjectStep);
projectStepsRouter.put('/:id/', enforceCsrf, authenticate, requireAuth, updateProjectStep);
projectStepsRouter.delete('/:id/', enforceCsrf, authenticate, requireAuth, deleteProjectStep);

export { projectsRouter, projectStepsRouter };

