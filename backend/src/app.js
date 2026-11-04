import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { authenticate } from './middlewares/auth.js';
import { errorHandler, NotFoundError } from './middlewares/errorHandler.js';
import apiRouter from './routes/index.js';

const app = express();

// Trust proxy behind Vercel / HTTPS reverse proxies
app.set('trust proxy', 1);

// CORS configuration matching Django's corsheaders
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        config.corsAllowedOrigins.includes(origin) ||
        !config.isProd ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return callback(null, true);
      }
      return callback(new Error('Origem não permitida por CORS.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Accept',
      'Content-Type',
      'Cookie',
      'Origin',
      'Referer',
      'User-Agent',
      'X-CSRFToken',
      'X-CSRF-Token',
      'Authorization',
      'X-Requested-With',
    ],
    exposedHeaders: ['Set-Cookie'],
  })
);

// Standard body & cookie parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Authenticate on all requests (populates req.user if session valid)
app.use(authenticate);

// Mount API router under /api
app.use('/api', apiRouter);

// Fallback mount directly on root to support Vercel rewrites where /api is stripped
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    return next();
  }
  return apiRouter(req, res, next);
});

// 404 for unhandled API routes
app.use((req, res, next) => {
  next(new NotFoundError('Rota da API não encontrada.'));
});

// Centralized error handler
app.use(errorHandler);

export default app;

