import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

// A session secret is always needed to sign cookies. In prod it is mandatory and
// must be ≥32 chars (256-bit, the HS256 key size); under dev bypass we fall back
// to a fixed throwaway value so the local/all-in-one server boots without
// configuring OIDC. A value supplied under dev bypass is still validated for
// length (a too-short secret is a bug, not a convenience).
const SESSION_SECRET_MIN = 32;
const DEV_SESSION_SECRET = 'dev-bypass-session-secret-not-for-prod';

const configSchema = z
  .object({
    DATABASE_PATH: z.string().default('./data/data.sqlite'),
    // Read NODE_ENV so superRefine can refuse the dev bypass in production.
    NODE_ENV: z.string().optional(),
    SESSION_SECRET: z
      .string()
      .min(SESSION_SECRET_MIN, 'SESSION_SECRET must be at least 32 characters')
      .optional(),
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_REDIRECT_URI: z.string().url().optional(),
    OIDC_ADMIN_GROUP: z.string().default('admin'),
    OIDC_UPDATER_GROUP: z.string().default('personal'),
    AUTH_DEV_BYPASS: boolFromString.default(false),
    DEV_USER_ROLE: z.enum(['admin', 'updater']).default('admin'),
    DEV_USER_NAME: z.string().default('Dev User'),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .superRefine((cfg, ctx) => {
    // The dev auth bypass authenticates every request as a fixed user with no
    // OIDC check — shipping it to production would be a critical hole. Refuse to
    // boot if it is enabled while NODE_ENV=production.
    if (cfg.AUTH_DEV_BYPASS && cfg.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_DEV_BYPASS'],
        message: 'AUTH_DEV_BYPASS must not be enabled when NODE_ENV=production',
      });
      return;
    }
    // Outside dev bypass, the session secret and the full OIDC config are
    // required for the real auth flow.
    if (cfg.AUTH_DEV_BYPASS) return;
    const required = [
      'SESSION_SECRET',
      'OIDC_ISSUER',
      'OIDC_CLIENT_ID',
      'OIDC_CLIENT_SECRET',
      'OIDC_REDIRECT_URI',
    ] as const;
    for (const key of required) {
      if (cfg[key] === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Required' });
      }
    }
  })
  .transform((cfg) => ({
    ...cfg,
    // Guarantee a usable session secret. Under dev bypass an unset secret falls
    // back to the throwaway dev value; outside bypass superRefine has already
    // ensured it is present.
    SESSION_SECRET: cfg.SESSION_SECRET ?? DEV_SESSION_SECRET,
  }));

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
