import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  RegisterWebPushSubscriptionSchema,
  SendTestWebPushSchema,
  UnregisterWebPushSubscriptionSchema,
  WebPushVapidKeyResponseSchema,
  type AuthPrincipal,
  type RegisterWebPushSubscriptionInput,
  type SendTestWebPushInput,
  type UnregisterWebPushSubscriptionInput,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WebPushService } from './web-push.service';

@Controller('api/v1/pos/push')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PosPushController {
  constructor(@Inject(WebPushService) private readonly webPushService: WebPushService) {}

  @Get('vapid-public-key')
  @RequirePermission('pos', 'view')
  async getVapidPublicKey() {
    const publicKey = await this.webPushService.getPublicKey();
    return WebPushVapidKeyResponseSchema.parse({ publicKey });
  }

  @Get('subscriptions/status')
  @RequirePermission('pos', 'view')
  async getSubscriptionStatus(
    @CurrentUser() user: AuthPrincipal,
    @Query('endpoint') endpoint?: string,
  ) {
    return this.webPushService.getSubscriptionStatus(user, endpoint);
  }

  @Post('subscriptions')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos', 'view')
  async registerSubscription(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(RegisterWebPushSubscriptionSchema))
    body: RegisterWebPushSubscriptionInput,
    @Req() req: Request,
  ) {
    const userAgentHeader =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
    return this.webPushService.registerSubscription(user, body, userAgentHeader);
  }

  @Delete('subscriptions')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos', 'view')
  async unregisterSubscription(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(UnregisterWebPushSubscriptionSchema))
    body: UnregisterWebPushSubscriptionInput,
  ) {
    return this.webPushService.unregisterSubscription(user, body);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos', 'view')
  async sendTestPush(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(SendTestWebPushSchema))
    body: SendTestWebPushInput,
  ) {
    return this.webPushService.sendTestPushToUser(user, body.delaySeconds);
  }
}
