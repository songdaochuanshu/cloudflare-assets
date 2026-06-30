// errors.ts — 自定义错误类体系
export class AppError extends Error {
  // eslint-disable-next-line no-unused-vars
  public readonly code: string;
  // eslint-disable-next-line no-unused-vars
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

export class R2Error extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'R2_ERROR', context);
    this.name = 'R2Error';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

export class ApiError extends AppError {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number, context?: Record<string, unknown>) {
    super(message, 'API_ERROR', { statusCode, ...context });
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }

  toJSON() {
    return { ...super.toJSON(), statusCode: this.statusCode };
  }
}
