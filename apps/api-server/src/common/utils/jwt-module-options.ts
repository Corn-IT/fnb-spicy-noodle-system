import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleAsyncOptions, type JwtSignOptions } from '@nestjs/jwt';
import type { EnvConfig } from '../../config/env.config';

export function configuredJwtModule(): ReturnType<typeof JwtModule.registerAsync> {
  const options: JwtModuleAsyncOptions = {
    inject: [ConfigService],
    useFactory: (config: ConfigService<EnvConfig, true>) => ({
      secret: config.get('jwtSecret'),
      signOptions: { expiresIn: config.get('jwtExpiresIn') as JwtSignOptions['expiresIn'] },
    }),
  };
  return JwtModule.registerAsync(options);
}
