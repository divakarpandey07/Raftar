import fs from 'fs';
import path from 'path';
import { query } from './connection';
import { logger } from '../utils/logger';

export async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  logger.info({ count: files.length }, 'Running database migrations');

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    logger.info({ file }, `Executing migration: ${file}`);
    await query(sql);
  }

  logger.info('Database migrations applied successfully');
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Migration runner failed');
      process.exit(1);
    });
}
