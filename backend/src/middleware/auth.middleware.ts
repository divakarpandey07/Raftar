import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/token';
import { AppError } from '../utils/problem-details';
import { redisClient } from '../database/redis';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Bearer token missing in Authorization header'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);

    // Check if token has been revoked
    const isRevoked = await redisClient.get(`revoked_token:${token}`);
    if (isRevoked) {
      return next(AppError.unauthorized('Token has been revoked. Please log in again.'));
    }

    req.user = payload;
    next();
  } catch (err: any) {
    return next(AppError.unauthorized(`Invalid or expired token: ${err.message}`));
  }
}
