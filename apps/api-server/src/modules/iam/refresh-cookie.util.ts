import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { durationToMilliseconds } from '../../common/utils/duration.util';
import type { EnvConfig } from '../../config/env.config';

export const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function buildRefreshCookieOptions(config: ConfigService<EnvConfig, true>): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
} {
  return {
    httpOnly: true,
    secure: config.get('nodeEnv') === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(
  response: Response,
  token: string,
  config: ConfigService<EnvConfig, true>,
): void {
  response.cookie(REFRESH_COOKIE, token, {
    ...buildRefreshCookieOptions(config),
    maxAge: durationToMilliseconds(config.get('jwtRefreshExpiresIn')),
  });
}

export function clearRefreshCookie(
  response: Response,
  config: ConfigService<EnvConfig, true>,
): void {
  response.clearCookie(REFRESH_COOKIE, buildRefreshCookieOptions(config));
}
