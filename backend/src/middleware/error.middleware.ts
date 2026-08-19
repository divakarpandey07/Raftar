import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/problem-details';
import { logger } from '../utils/logger';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      type: err.type,
      title: err.title,
      status: err.status,
      detail: err.detail,
      instance: req.originalUrl,
      invalid_params: err.invalidParams
    });
    return;
  }

  logger.error({ err, path: req.originalUrl }, 'Unhandled internal server error');

  res.status(500).json({
    type: 'https://api.raftar.app/errors/INTERNAL_ERROR',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected internal error occurred. Please try again later.',
    instance: req.originalUrl
  });
}
