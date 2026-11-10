import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ErrorCodes,
  LoginRequestSchema,
  RefreshRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type RefreshRequest,
} from '@fnb/shared';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { durationToMilliseconds } from '../../common/utils/duration.util';
import type { EnvConfig } from '../../config/env.config';
import { IamService } from './iam.service';

type CookieRequest = Request & { cookies?: Record<string, unknown> };
const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller('api/v1/auth')
export class IamController {
  constructor(
    @Inject(IamService) private readonly iamService: IamService,
    @Inject(ConfigService) private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.iamService.login(body);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: CookieRequest,
    @Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const cookieToken = request.cookies?.[REFRESH_COOKIE];
    const refreshToken = typeof cookieToken === 'string' ? cookieToken : body.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_TOKEN_MISSING,
        message: 'Yêu cầu refresh token để làm mới phiên đăng nhập',
      });
    }
    const result = await this.iamService.refreshAccessToken(refreshToken);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: durationToMilliseconds(this.config.get('jwtRefreshExpiresIn')),
    });
  }

  private cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    path: string;
  } {
    return {
      httpOnly: true,
      secure: this.config.get('nodeEnv') === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }
}
