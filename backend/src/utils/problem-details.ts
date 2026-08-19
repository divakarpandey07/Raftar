export interface InvalidParam {
  field: string;
  message: string;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly type: string;
  public readonly title: string;
  public readonly detail: string;
  public readonly invalidParams?: InvalidParam[];

  constructor(
    status: number,
    title: string,
    detail: string,
    type: string = 'https://api.raftar.app/errors/GENERAL_ERROR',
    invalidParams?: InvalidParam[]
  ) {
    super(detail);
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.type = type;
    this.invalidParams = invalidParams;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(detail: string, invalidParams?: InvalidParam[]) {
    return new AppError(400, 'Bad Request', detail, 'https://api.raftar.app/errors/BAD_REQUEST', invalidParams);
  }

  static unauthorized(detail: string = 'Authentication required') {
    return new AppError(401, 'Unauthorized', detail, 'https://api.raftar.app/errors/UNAUTHORIZED');
  }

  static forbidden(detail: string = 'Access denied') {
    return new AppError(403, 'Forbidden', detail, 'https://api.raftar.app/errors/FORBIDDEN');
  }

  static notFound(detail: string = 'Resource not found') {
    return new AppError(404, 'Not Found', detail, 'https://api.raftar.app/errors/NOT_FOUND');
  }

  static unprocessable(detail: string, invalidParams?: InvalidParam[]) {
    return new AppError(422, 'Unprocessable Entity', detail, 'https://api.raftar.app/errors/VALIDATION_ERROR', invalidParams);
  }

  static tooManyRequests(detail: string = 'Rate limit exceeded') {
    return new AppError(429, 'Too Many Requests', detail, 'https://api.raftar.app/errors/RATE_LIMIT_EXCEEDED');
  }

  static internal(detail: string = 'Internal server error') {
    return new AppError(500, 'Internal Server Error', detail, 'https://api.raftar.app/errors/INTERNAL_ERROR');
  }
}
