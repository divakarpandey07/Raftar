import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError, InvalidParam } from '../utils/problem-details';

export function validate(schema: {
  body?: ZodSchema<any>;
  query?: ZodSchema<any>;
  params?: ZodSchema<any>;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const invalidParams: InvalidParam[] = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message
        }));
        next(AppError.unprocessable('Schema validation failed for request payload', invalidParams));
      } else {
        next(error);
      }
    }
  };
}
