import { config } from '../config/env.js';
import { query } from '../config/database.js';
import {
  verifyPassword,
  hashPassword,
  passwordFingerprint,
  urlsafeBase64Encode,
  urlsafeBase64Decode,
  makePasswordResetToken,
  checkPasswordResetToken,
} from '../utils/passwords.js';
import {
  setAuthCookies,
  clearAuthCookies,
  verifyToken,
  revokeRefreshToken,
  isRefreshTokenRevoked,
} from '../utils/tokens.js';
import { sendPasswordResetEmail, isEmailConfigured } from '../utils/mailer.js';
import { getOrCreateCsrfToken } from '../middlewares/csrf.js';
import { ApiError, ValidationError, AuthenticationError, PermissionError, NotFoundError } from '../middlewares/errorHandler.js';

export async function csrfHandler(req, res) {
  const token = getOrCreateCsrfToken(req, res);
  res.json({ csrfToken: token });
}

export async function registerHandler(req, res, next) {
  try {
    const { username, email, first_name = '', last_name = '', password, password_confirm, role = 'student' } = req.body;

    const allowedRoles = ['student', 'teacher'];
    const assignedRole = allowedRoles.includes(role) ? role : 'student';

    const errors = {};

    if (!username || !/^[A-Za-z0-9._-]{3,30}$/.test(username)) {
      errors.username = ['Use 3 a 30 letras, números, pontos, hífens ou sublinhados.'];
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = ['Informe um endereço de e-mail válido.'];
    }

    if (!password || password.length < 8) {
      errors.password = ['A senha deve conter pelo menos 8 caracteres.'];
    }

    if (password !== password_confirm) {
      errors.password_confirm = ['As senhas não correspondem.'];
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Os dados enviados são inválidos.', errors);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check unique username and email
    const existing = await query(
      'SELECT id, username, email FROM accounts_user WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
      [username, normalizedEmail]
    );

    for (const row of existing.rows) {
      if (row.username.toLowerCase() === username.toLowerCase()) {
        errors.username = ['Este nome de usuário já está em uso.'];
      }
      if (row.email && row.email.toLowerCase() === normalizedEmail) {
        errors.email = ['Este e-mail já está em uso.'];
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Os dados enviados são inválidos.', errors);
    }

    const hashedPassword = hashPassword(password);
    const now = new Date();

    const result = await query(
      `INSERT INTO accounts_user (
        username, email, first_name, last_name, password, role,
        is_superuser, is_staff, is_active, date_joined
      ) VALUES ($1, $2, $3, $4, $5, $6, false, false, true, $7)
      RETURNING id, username, email, first_name, last_name, role`,
      [username, normalizedEmail, first_name, last_name, hashedPassword, assignedRole, now]
    );

    const user = result.rows[0];
    user.password = hashedPassword;

    setAuthCookies(res, user);

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req, res, next) {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      throw new ValidationError('Informe o usuário/e-mail e a senha.');
    }

    const trimmed = String(identifier).trim();
    let result;

    if (trimmed.includes('@')) {
      result = await query(
        'SELECT id, username, email, first_name, last_name, role, password, is_active FROM accounts_user WHERE LOWER(email) = LOWER($1)',
        [trimmed]
      );
    } else {
      result = await query(
        'SELECT id, username, email, first_name, last_name, role, password, is_active FROM accounts_user WHERE LOWER(username) = LOWER($1)',
        [trimmed]
      );
    }

    const user = result.rows[0];

    if (!user || !user.is_active || !verifyPassword(password, user.password)) {
      throw new AuthenticationError('Usuário ou senha inválidos.');
    }

    // Update last_login
    await query('UPDATE accounts_user SET last_login = $1 WHERE id = $2', [new Date(), user.id]);

    setAuthCookies(res, user);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req, res, next) {
  try {
    const rawToken = req.cookies?.[config.jwt.refreshCookie];
    if (!rawToken) {
      throw new AuthenticationError('A sessão expirou. Entre novamente.');
    }

    let decoded;
    try {
      decoded = verifyToken(rawToken);
    } catch {
      throw new AuthenticationError('A sessão expirou. Entre novamente.');
    }

    if (decoded.jti && isRefreshTokenRevoked(decoded.jti)) {
      throw new AuthenticationError('A sessão expirou. Entre novamente.');
    }

    const result = await query(
      'SELECT id, username, email, first_name, last_name, role, password, is_active FROM accounts_user WHERE id = $1',
      [decoded.user_id]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      throw new AuthenticationError('A sessão expirou. Entre novamente.');
    }

    if (decoded.pwd && decoded.pwd !== passwordFingerprint(user.password)) {
      throw new AuthenticationError('A sessão expirou. Entre novamente.');
    }

    // Revoke old refresh token (rotate)
    if (decoded.jti) {
      revokeRefreshToken(rawToken);
    }

    setAuthCookies(res, user);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req, res) {
  const rawToken = req.cookies?.[config.jwt.refreshCookie];
  if (rawToken) {
    revokeRefreshToken(rawToken);
  }
  clearAuthCookies(res);
  res.status(204).end();
}

export async function getProfileHandler(req, res) {
  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    first_name: req.user.first_name,
    last_name: req.user.last_name,
    role: req.user.role,
  });
}

export async function patchProfileHandler(req, res, next) {
  try {
    const { first_name, last_name } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (typeof first_name === 'string') {
      updates.push(`first_name = $${idx++}`);
      values.push(first_name.trim());
    }
    if (typeof last_name === 'string') {
      updates.push(`last_name = $${idx++}`);
      values.push(last_name.trim());
    }

    if (updates.length > 0) {
      values.push(req.user.id);
      await query(`UPDATE accounts_user SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    }

    const updated = await query(
      'SELECT id, username, email, first_name, last_name, role FROM accounts_user WHERE id = $1',
      [req.user.id]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function passwordResetRequestHandler(req, res, next) {
  try {
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      throw new ValidationError('Informe um endereço de e-mail válido.', { email: ['Este campo é obrigatório.'] });
    }

    if (!isEmailConfigured() && process.env.NODE_ENV !== 'test') {
      return res.status(503).json({
        error: {
          code: 'email_not_configured',
          message: 'A recuperação de senha está temporariamente indisponível.',
          details: null,
        },
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await query(
      'SELECT id, username, email, password, is_active FROM accounts_user WHERE LOWER(email) = LOWER($1) AND is_active = true',
      [normalizedEmail]
    );

    const user = result.rows[0];
    if (user) {
      const uid = urlsafeBase64Encode(user.id);
      const token = makePasswordResetToken(user, config.jwt.secret);
      const resetUrl = `${config.frontendBaseUrl}/redefinir-senha?uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}`;

      try {
        await sendPasswordResetEmail({ to: user.email, resetUrl });
      } catch (err) {
        console.warn('Password reset email delivery failed:', err);
      }
    }

    res.json({
      message: 'Se houver uma conta associada a esse e-mail, enviaremos as instruções para redefinir a senha.',
    });
  } catch (err) {
    next(err);
  }
}

export async function passwordResetConfirmHandler(req, res, next) {
  try {
    const { uid, token, new_password, password_confirm } = req.body;

    if (!uid || !token || !new_password) {
      throw new NotFoundError('O link de redefinição é inválido ou expirou.');
    }

    if (new_password !== password_confirm) {
      throw new ValidationError('As senhas não correspondem.', {
        password_confirm: ['As senhas não correspondem.'],
      });
    }

    if (new_password.length < 8) {
      throw new ValidationError('A senha deve conter pelo menos 8 caracteres.', {
        new_password: ['A senha deve conter pelo menos 8 caracteres.'],
      });
    }

    let userId;
    try {
      userId = urlsafeBase64Decode(uid);
    } catch {
      throw new NotFoundError('O link de redefinição é inválido ou expirou.');
    }

    const result = await query(
      'SELECT id, username, email, password, is_active FROM accounts_user WHERE id = $1 AND is_active = true',
      [userId]
    );

    const user = result.rows[0];
    if (!user) {
      throw new NotFoundError('O link de redefinição é inválido ou expirou.');
    }

    const isValid = checkPasswordResetToken(user, token, config.jwt.secret);
    if (!isValid) {
      throw new NotFoundError('O link de redefinição é inválido ou expirou.');
    }

    const hashedPassword = hashPassword(new_password);
    await query('UPDATE accounts_user SET password = $1 WHERE id = $2', [hashedPassword, user.id]);

    res.json({ message: 'Senha redefinida com sucesso.' });
  } catch (err) {
    next(err);
  }
}

