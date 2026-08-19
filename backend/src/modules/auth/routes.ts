// --- AUTH MODULE ---
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validation.middleware';
import { hashPassword, verifyPassword } from '../../utils/password';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/token';
import { AppError } from '../../utils/problem-details';
import { query } from '../../database/connection';
import { redisClient } from '../../database/redis';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(2),
  handle: z.string().min(3).regex(/^[a-zA-Z0-9_]+$/, 'Handle must contain only letters, numbers, and underscores')
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const refreshSchema = z.object({
  refreshToken: z.string()
});

export class AuthService {
  static async register(dto: z.infer<typeof registerSchema>) {
    const existing = await query('SELECT id FROM users WHERE email = $1', [dto.email]);
    if (existing.rows.length > 0) {
      throw AppError.badRequest('An account with this email already exists');
    }

    const handleCheck = await query('SELECT user_id FROM profiles WHERE handle = $1', [dto.handle]);
    if (handleCheck.rows.length > 0) {
      throw AppError.badRequest('This athlete handle is already taken');
    }

    const passwordHash = await hashPassword(dto.password);
    const userRes = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [dto.email, passwordHash]
    );
    const user = userRes.rows[0];

    await query(
      'INSERT INTO profiles (user_id, display_name, handle) VALUES ($1, $2, $3)',
      [user.id, dto.displayName, dto.handle]
    );

    await query('INSERT INTO privacy_settings (user_id) VALUES ($1)', [user.id]);

    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    return { user, accessToken, refreshToken };
  }

  static async login(dto: z.infer<typeof loginSchema>) {
    const res = await query('SELECT id, email, password_hash, is_active FROM users WHERE email = $1', [dto.email]);
    if (res.rows.length === 0) {
      throw AppError.unauthorized('Invalid email or password credentials');
    }

    const user = res.rows[0];
    if (!user.is_active) {
      throw AppError.forbidden('Your account has been deactivated');
    }

    const isMatch = await verifyPassword(dto.password, user.password_hash);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password credentials');
    }

    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    return {
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken
    };
  }

  static async refresh(token: string) {
    try {
      const payload = verifyRefreshToken(token);
      const isRevoked = await redisClient.get(`revoked_refresh:${token}`);
      if (isRevoked) {
        throw AppError.unauthorized('Refresh token has been revoked');
      }

      const newAccessToken = generateAccessToken({ userId: payload.userId, email: payload.email });
      const newRefreshToken = generateRefreshToken({ userId: payload.userId, email: payload.email });

      // Rotate token
      await redisClient.set(`revoked_refresh:${token}`, '1', 'EX', 60 * 60 * 24 * 30);

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch {
      throw AppError.unauthorized('Invalid refresh token');
    }
  }

  static async logout(token: string) {
    await redisClient.set(`revoked_token:${token}`, '1', 'EX', 60 * 60 * 24);
  }
}

export const authRouter = Router();

authRouter.post('/register', validate({ body: registerSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await AuthService.register(req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

authRouter.post('/login', validate({ body: loginSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await AuthService.login(req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

authRouter.post('/refresh', validate({ body: refreshSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await AuthService.refresh(req.body.refreshToken);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

authRouter.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization!.split(' ')[1];
    await AuthService.logout(token);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (e) { next(e); }
});
