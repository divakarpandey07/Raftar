import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { checkDbHealth } from './database/connection';

const app = createApp();

const server = app.listen(env.PORT, async () => {
  logger.info({
    port: env.PORT,
    env: env.NODE_ENV,
    apiBase: `/api/${env.API_VERSION}`
  }, `🚀 RAFTAR Backend running on port ${env.PORT}`);

  const dbHealth = await checkDbHealth();
  logger.info({ dbHealth }, 'Database connection checked on boot');
});

// Graceful shutdown
const handleShutdown = (signal: string) => {
  logger.info({ signal }, 'Gracefully shutting down RAFTAR backend server...');
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
