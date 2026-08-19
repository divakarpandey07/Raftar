import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_VERSION: z.string().default('v1'),
  DATABASE_URL: z.string().default('postgresql://raftar_admin:raftar_secure_pass@localhost:5432/raftar_db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().default('raftar_super_secret_jwt_access_key_2026_production'),
  JWT_REFRESH_SECRET: z.string().default('raftar_super_secret_jwt_refresh_key_2026_production'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  RATE_LIMIT_MAX: z.string().default('100').transform((val) => parseInt(val, 10)),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform((val) => parseInt(val, 10)),
  CORS_ORIGIN: z.string().default('*')
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    process.exit(1);
  }
  return result.data;
};

export const env = parseEnv();
