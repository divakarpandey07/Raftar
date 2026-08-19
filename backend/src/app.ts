import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env } from './config/env';
import { requestLogger } from './middleware/request-logger.middleware';
import { errorHandler } from './middleware/error.middleware';
import { rateLimiter } from './middleware/rate-limiter.middleware';

// Module Routers (25 Modules)
import { authRouter } from './modules/auth/routes';
import { usersRouter } from './modules/users/routes';
import { profilesRouter } from './modules/profiles/routes';
import { activitiesRouter } from './modules/activities/routes';
import { gpsTracksRouter } from './modules/gps-tracks/routes';
import { routesRouter } from './modules/routes/routes';
import { segmentsRouter } from './modules/segments/routes';
import { socialRouter } from './modules/social/routes';
import { commentsRouter } from './modules/comments/routes';
import { reactionsRouter } from './modules/reactions/routes';
import { followersRouter } from './modules/followers/routes';
import { clubsRouter } from './modules/clubs/routes';
import { challengesRouter } from './modules/challenges/routes';
import { leaderboardsRouter } from './modules/leaderboards/routes';
import { goalsRouter } from './modules/goals/routes';
import { achievementsRouter } from './modules/achievements/routes';
import { notificationsRouter } from './modules/notifications/routes';
import { aiRouter } from './modules/ai/routes';
import { weatherRouter } from './modules/weather/routes';
import { environmentalRouter } from './modules/environmental/routes';
import { syncRouter } from './modules/sync/routes';
import { analyticsRouter } from './modules/analytics/routes';
import { gearRouter } from './modules/gear/routes';
import { privacyRouter } from './modules/privacy/routes';
import { safetyRouter } from './modules/safety/routes';

export function createApp(): Express {
  const app = express();

  // Global Security & Optimization Middlewares
  app.use(helmet());
  app.use(cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
    credentials: true
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestLogger);
  app.use(rateLimiter());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'UP',
      app: 'RAFTAR Backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime()
    });
  });

  // API v1 Sub-Router
  const apiV1 = express.Router();

  apiV1.use('/auth', authRouter);
  apiV1.use('/users', usersRouter);
  apiV1.use('/profiles', profilesRouter);
  apiV1.use('/activities', activitiesRouter);
  apiV1.use('/gps-tracks', gpsTracksRouter);
  apiV1.use('/routes', routesRouter);
  apiV1.use('/segments', segmentsRouter);
  apiV1.use('/social', socialRouter);
  apiV1.use('/comments', commentsRouter);
  apiV1.use('/reactions', reactionsRouter);
  apiV1.use('/followers', followersRouter);
  apiV1.use('/clubs', clubsRouter);
  apiV1.use('/challenges', challengesRouter);
  apiV1.use('/leaderboards', leaderboardsRouter);
  apiV1.use('/goals', goalsRouter);
  apiV1.use('/achievements', achievementsRouter);
  apiV1.use('/notifications', notificationsRouter);
  apiV1.use('/ai', aiRouter);
  apiV1.use('/weather', weatherRouter);
  apiV1.use('/environmental', environmentalRouter);
  apiV1.use('/sync', syncRouter);
  apiV1.use('/analytics', analyticsRouter);
  apiV1.use('/gear', gearRouter);
  apiV1.use('/privacy', privacyRouter);
  apiV1.use('/safety', safetyRouter);

  // Mount API v1 router
  app.use(`/api/${env.API_VERSION}`, apiV1);

  // Centralized RFC 7807 Error Handler
  app.use(errorHandler);

  return app;
}
