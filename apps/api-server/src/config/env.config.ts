import { z } from 'zod';

const EnvironmentSchema = z.object({
  databaseUrl: z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
    message: 'DATABASE_URL must be a PostgreSQL connection URL',
  }),
  jwtSecret: z.string().min(64, 'JWT_SECRET must contain at least 64 characters'),
  jwtExpiresIn: z.string().min(1),
  jwtRefreshExpiresIn: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  corsOrigin: z.string().min(1),
  nodeEnv: z.enum(['development', 'production', 'test']),
  vietQrBankId: z.string().min(1).optional(),
  vietQrAccountNo: z.string().min(1).optional(),
  vietQrAccountName: z.string().min(1).optional(),
});

export type EnvConfig = z.infer<typeof EnvironmentSchema>;

export function parseEnvConfig(environment: NodeJS.ProcessEnv): EnvConfig {
  return EnvironmentSchema.parse({
    databaseUrl: environment.FNB_DATABASE_URL ?? environment.DATABASE_URL,
    jwtSecret: environment.FNB_JWT_SECRET ?? environment.JWT_SECRET,
    jwtExpiresIn: environment.FNB_JWT_EXPIRES_IN ?? environment.JWT_EXPIRES_IN ?? '15m',
    jwtRefreshExpiresIn: environment.FNB_JWT_REFRESH_EXPIRES_IN ?? environment.JWT_REFRESH_EXPIRES_IN ?? '7d',
    port: Number(environment.FNB_PORT ?? environment.PORT ?? '3000'),
    corsOrigin: environment.FNB_CORS_ORIGIN ?? environment.CORS_ORIGIN ?? 'http://localhost:5173',
    nodeEnv: environment.NODE_ENV ?? 'development',
    vietQrBankId: environment.FNB_VIETQR_BANK_ID ?? environment.VIETQR_BANK_ID,
    vietQrAccountNo: environment.FNB_VIETQR_ACCOUNT_NO ?? environment.VIETQR_ACCOUNT_NO,
    vietQrAccountName: environment.FNB_VIETQR_ACCOUNT_NAME ?? environment.VIETQR_ACCOUNT_NAME,
  });
}
