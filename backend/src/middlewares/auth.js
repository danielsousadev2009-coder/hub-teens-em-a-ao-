import { config } from '../config/env.js';
import { query } from '../config/database.js';
import { verifyToken } from '../utils/tokens.js';
import { passwordFingerprint } from '../utils/passwords.js';
import { ApiError } from './errorHandler.js';

export async function authenticate(req, res, next) {
  let token = req.cookies?.[config.jwt.accessCookie];

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7);
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyToken(token);
    const result = await query(
      'SELECT id, username, email, first_name, last_name, role, password, is_active, is_superuser FROM accounts_user WHERE id = $1',
      [decoded.user_id]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      req.user = null;
      return next();
    }

    // Verify password fingerprint
    if (decoded.pwd && decoded.pwd !== passwordFingerprint(user.password)) {
      req.user = null;
      return next();
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_active: user.is_active,
      is_superuser: user.is_superuser,
    };
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return next(new ApiError('As credenciais de autenticação não foram fornecidas.', 401, 'not_authenticated'));
  }
  next();
}

export function requireStudent(req, res, next) {
  if (!req.user) {
    return next(new ApiError('As credenciais de autenticação não foram fornecidas.', 401, 'not_authenticated'));
  }
  if (req.user.role !== 'student') {
    return next(new ApiError('Somente alunos podem realizar esta ação.', 403, 'permission_denied'));
  }
  next();
}

export function requireTeacherOrAdmin(req, res, next) {
  if (!req.user) {
    return next(new ApiError('As credenciais de autenticação não foram fornecidas.', 401, 'not_authenticated'));
  }
  if (req.user.role !== 'teacher' && req.user.role !== 'administrator') {
    return next(new ApiError('Somente professores ou administradores têm permissão.', 403, 'permission_denied'));
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(new ApiError('As credenciais de autenticação não foram fornecidas.', 401, 'not_authenticated'));
  }
  if (req.user.role !== 'administrator') {
    return next(new ApiError('Somente administradores têm permissão.', 403, 'permission_denied'));
  }
  next();
}

