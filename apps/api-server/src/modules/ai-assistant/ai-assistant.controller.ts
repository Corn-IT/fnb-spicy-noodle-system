import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query, UseGuards } from '@nestjs/common';
import {
  AiChatRequestSchema,
  AiResetRequestSchema,
  type AiChatRequest,
  type AiChatResponse,
  type AiResetRequest,
  type AiResetResponse,
  type AiStatusResponse,
  type AuthPrincipal,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RateLimitGuard } from '../../common/security/rate-limit.guard';
import { AiAssistantService } from './ai-assistant.service';

@Controller('api/v1/ai-assistant')
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class AiAssistantController {
  constructor(
    @Inject(AiAssistantService) private readonly aiAssistantService: AiAssistantService,
  ) {}

  @Get('status')
  getStatus(
    @CurrentUser() user: AuthPrincipal,
    @Query('clientSessionId') clientSessionId?: string,
  ): Promise<AiStatusResponse> {
    return this.aiAssistantService.getStatus(user, clientSessionId);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  chat(
    @Body(new ZodValidationPipe(AiChatRequestSchema)) body: AiChatRequest,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AiChatResponse> {
    return this.aiAssistantService.chat(body, user);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  reset(
    @Body(new ZodValidationPipe(AiResetRequestSchema)) body: AiResetRequest,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AiResetResponse> {
    return this.aiAssistantService.resetSession(user, body.clientSessionId);
  }
}
