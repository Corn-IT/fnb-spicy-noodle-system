import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
import { extractClientMeta } from '../../common/security/client-info.util';
import { extractTokenSessionId } from '../../common/security/session-validation.util';
import type { EnvConfig } from '../../config/env.config';
import { clearAiSessionsForUser } from '../ai-assistant/ai-session-memory.service';
import { IamService } from './iam.service';
import {
  clearRefreshCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
} from './refresh-cookie.util';

type CookieRequest = Request & { cookies?: Record<string, unknown> };

@Controller('api/v1/auth')
export class IamController {
  constructor(
    @Inject(IamService) private readonly iamService: IamService,
    @Inject(ConfigService) private readonly config: ConfigService<EnvConfig, true>,
    @Optional() @Inject(JwtService) private readonly jwtService?: JwtService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: Request,
  ): Promise<AuthResponse> {
    const clientMeta = request ? extractClientMeta(request) : undefined;
    const result = await this.iamService.login(body, clientMeta);
    setRefreshCookie(response, result.refreshToken, this.config);
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
    setRefreshCookie(response, result.refreshToken, this.config);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Res({ passthrough: true }) response: Response,
    @Req() request?: CookieRequest,
  ): Promise<void> {
    clearRefreshCookie(response, this.config);
    const sessionInfo = await this.extractLogoutSessionInfo(request);
    if (sessionInfo) {
      clearAiSessionsForUser(sessionInfo.userId);
      if (typeof this.iamService.logout === 'function') {
        const clientMeta = request ? extractClientMeta(request) : undefined;
        await this.iamService.logout(sessionInfo, clientMeta);
      }
    }
  }

  private async extractLogoutSessionInfo(
    request?: CookieRequest,
  ): Promise<{ userId: number; sessionId?: string | null } | null> {
    if (!request || !this.jwtService) return null;

    const candidates: string[] = [];
    const authHeader = request.headers?.authorization;
    if (typeof authHeader === 'string') {
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
      if (match?.[1]) candidates.push(match[1]);
    }
    const cookieToken = request.cookies?.[REFRESH_COOKIE];
    if (typeof cookieToken === 'string' && cookieToken.trim()) {
      candidates.push(cookieToken.trim());
    }

    for (const token of candidates) {
      try {
        const claims = await this.jwtService.verifyAsync<{
          sub?: unknown;
          sid?: unknown;
        }>(token, { ignoreExpiration: true });
        const userId = typeof claims.sub === 'number' ? claims.sub : Number(claims.sub);
        if (Number.isSafeInteger(userId) && userId >= 1) {
          return {
            userId,
            sessionId: extractTokenSessionId(claims),
          };
        }
      } catch {
        // Ignore invalid/forged tokens during logout
      }
    }
    return null;
  }
}
