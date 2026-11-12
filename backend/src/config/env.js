import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory or project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: parseInt(process.env.PORT || '8011', 10),

  // Database
  database: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'hub_teens',
    user: process.env.DB_USER || 'hub_teens',
    password: process.env.DB_PASSWORD || '',
    sslMode: (process.env.DB_SSLMODE || 'require').toLowerCase(),
    isTransactionPooler: (process.env.DB_POOLER_TRANSACTION || 'false').toLowerCase() === 'true',
  },

  // Security & JWT
  jwt: {
    secret: process.env.JWT_SECRET || process.env.DJANGO_SECRET_KEY || 'hub-teens-secret-key-min-32-chars-long-development',
    accessCookie: process.env.AUTH_ACCESS_COOKIE || 'hub_access',
    refreshCookie: process.env.AUTH_REFRESH_COOKIE || 'hub_refresh',
    accessExpiresIn: '15m',
    refreshExpiresIn: '1d',
    cookieSecure: isProd && (process.env.AUTH_COOKIE_SECURE || 'true').toLowerCase() !== 'false',
    cookieSameSite: process.env.AUTH_COOKIE_SAMESITE || 'Lax',
  },

  // Registration
  allowPublicStudentRegistration:
    (process.env.ALLOW_PUBLIC_STUDENT_REGISTRATION || 'true').toLowerCase() === 'true',

  // CORS & CSRF
  corsAllowedOrigins: (
    process.env.CORS_ALLOWED_ORIGINS ||
    'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  csrfTrustedOrigins: (
    process.env.CSRF_TRUSTED_ORIGINS ||
    'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  frontendBaseUrl: (process.env.FRONTEND_BASE_URL || 'http://127.0.0.1:5173').replace(/\/+$/, ''),

  // Email (SMTP)
  email: {
    host: process.env.EMAIL_HOST || '',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    user: process.env.EMAIL_HOST_USER || '',
    password: process.env.EMAIL_HOST_PASSWORD || '',
    useTls: (process.env.EMAIL_USE_TLS || 'true').toLowerCase() === 'true',
    useSsl: (process.env.EMAIL_USE_SSL || 'false').toLowerCase() === 'true',
    defaultFromEmail: process.env.DEFAULT_FROM_EMAIL || '',
  },

  // Supabase Storage
  storage: {
    projectUrl: (process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, ''),
    serviceKey: process.env.SUPABASE_STORAGE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || '',
    isPublic: (process.env.SUPABASE_STORAGE_PUBLIC || 'false').toLowerCase() === 'true',
    signedUrlTtl: parseInt(process.env.SUPABASE_STORAGE_SIGNED_URL_TTL || '900', 10),
    maxFileSize: parseInt(process.env.SUPABASE_STORAGE_MAX_FILE_SIZE || String(5 * 1024 * 1024), 10),
  },

  // AI Mentor
  ai: {
    geminiApiKey: process.env.AI_GEMINI_API_KEY || '',
    geminiModel: process.env.AI_GEMINI_MODEL || 'gemini-2.0-flash',
    groqApiKey: process.env.AI_GROQ_API_KEY || '',
    groqModel: process.env.AI_GROQ_MODEL || 'llama-3.3-70b-versatile',
    ollamaUrl: (process.env.AI_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    ollamaModel: process.env.AI_OLLAMA_MODEL || '',
  },
};

