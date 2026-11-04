export class ApiError extends Error {
  constructor(message, status = 400, code = 'request_error', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Os dados enviados são inválidos.', details = null) {
    super(message, 400, 'validation_error', details);
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Usuário ou senha inválidos.') {
    super(message, 401, 'authentication_failed', null);
  }
}

export class PermissionError extends ApiError {
  constructor(message = 'Você não tem permissão para realizar esta ação.') {
    super(message, 403, 'permission_denied', null);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Não encontrado.') {
    super(message, 404, 'not_found', null);
  }
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || (err.statusCode ? err.statusCode : 500);
  let code = err.code || 'request_error';
  let message = err.message || 'Não foi possível concluir a solicitação.';
  let details = err.details || null;

  if (status === 500) {
    console.error('Unhandled server error:', err);
    message = 'Erro interno do servidor.';
    code = 'server_error';
  } else if (status === 400 && !details && err.fieldErrors) {
    details = err.fieldErrors;
    code = 'validation_error';
  }

  res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
}

