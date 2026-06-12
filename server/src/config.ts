import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

const configSchema = z.object({
  DATABASE_PATH: z.string().default('./data/data.sqlite'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.string().url(),
  OIDC_ADMIN_GROUP: z.string().default('admin'),
  OIDC_UPDATER_GROUP: z.string().default('personal'),
  AUTH_DEV_BYPASS: boolFromString.default(false),
  DEV_USER_ROLE: z.enum(['admin', 'updater']).default('admin'),
  DEV_USER_NAME: z.string().default('Dev User'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return result.data;
}
