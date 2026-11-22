import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Optional, Param, ParseIntPipe, Patch, Post, Put, Query, Req, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApplyPosDiscountRequestSchema,
  ApproveQrOrderSchema,
  CheckoutOrderRequestSchema,
  CreateDiningTableSchema,
  CreatePosOrderSchema,
  CreateQrOrderSchema,
  PatchOrderItemsSchema,
  ReprintKitchenRequestSchema,
  SplitCheckoutOrderRequestSchema,
  SplitProvisionalBillRequestSchema,
  TableActionRequestSchema,
  UpdateDiningTableSchema,
  UpdateQrSecurityConfigSchema,
  VoidInvoiceRequestSchema,
  type ApplyPosDiscountRequest,
  type ApproveQrOrderInput,
  type AuthPrincipal,
  type CheckoutOrderRequest,
  type CreateDiningTableInput,
  type CreatePosOrderInput,
  type CreateQrOrderInput,
  type PatchOrderItemsInput,
  type ReprintKitchenRequest,
  type SplitCheckoutOrderRequest,
  type SplitProvisionalBillRequest,
  type TableActionRequest,
  type UpdateDiningTableInput,
  type UpdateQrSecurityConfigInput,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { QrSecurityService } from '../../common/security/qr-security.service';
import { extractClientIp } from '../../common/security/rate-limit.guard';
import { PosService } from './pos.service';

@Controller('api/v1')
export class PosController {
  private static readonly ttsCache = new Map<string, Buffer>();
  private static readonly MAX_TTS_CACHE = 200;

  constructor(
    @Inject(PosService) private readonly posService: PosService,
    @Optional() @Inject(QrSecurityService) private readonly qrSecurityService?: QrSecurityService,
  ) {}

  @Get('public/tts')
  async synthesizeVietnameseTts(
    @Query('text') rawText: string | undefined,
    @Res() res: Response,
  ) {
    const cleaned = (rawText ?? '')
      .trim()
      .replace(/\b0+(\d+)\b/g, '$1')
      .slice(0, 180);
    if (!cleaned) {
      throw new BadRequestException({ message: 'Nội dung phát thanh không được để trống' });
    }

    const cacheKey = cleaned.toLowerCase();
    let audioBuffer = PosController.ttsCache.get(cacheKey);

    if (!audioBuffer) {
      const ttsUrl = new URL('https://translate.googleapis.com/translate_tts');
      ttsUrl.searchParams.set('ie', 'UTF-8');
      ttsUrl.searchParams.set('q', cleaned);
      ttsUrl.searchParams.set('tl', 'vi');
      ttsUrl.searchParams.set('client', 'tw-ob');

      try {
        const upstream = await fetch(ttsUrl.toString(), {
          signal: AbortSignal.timeout(4000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
        });
        if (!upstream.ok) {
          throw new Error(`TTS upstream HTTP ${upstream.status}`);
        }
        const arrayBuf = await upstream.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuf);
      } catch {
        throw new ServiceUnavailableException({
          message: 'Không thể kết nối dịch vụ tổng hợp giọng nói trực tuyến',
        });
      }

      if (PosController.ttsCache.size >= PosController.MAX_TTS_CACHE) {
        const oldestKey = PosController.ttsCache.keys().next().value;
        if (oldestKey) PosController.ttsCache.delete(oldestKey);
      }
      PosController.ttsCache.set(cacheKey, audioBuffer);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audioBuffer);
  }

  @Post('public/orders/qr')
  async createQrOrder(
    @Body(new ZodValidationPipe(CreateQrOrderSchema)) body: CreateQrOrderInput,
    @Req() req?: Request,
  ) {
    if (this.qrSecurityService) {
      await this.qrSecurityService.verifyGuestQrAccess({
        clientIp: req ? extractClientIp(req) : undefined,
        latitude: body.latitude,
        longitude: body.longitude,
        qrToken: body.qrToken,
      });
    }
    return this.posService.createQrOrder(body);
  }

  @Get('pos/qr-security-config')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'qrSecurity')
  getQrSecurityConfig(@Req() req?: Request) {
    return this.qrSecurityService?.getConfigResponse(req ? extractClientIp(req) : undefined);
  }

  @Put('pos/qr-security-config')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'qrSecurity')
  updateQrSecurityConfig(
    @Body(new ZodValidationPipe(UpdateQrSecurityConfigSchema)) body: UpdateQrSecurityConfigInput,
    @CurrentUser('id') userId: number,
    @Req() req?: Request,
  ) {
    return this.qrSecurityService?.updateConfig(
      body,
      req ? extractClientIp(req) : undefined,
      userId,
    );
  }

  @Get('pos/tables')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'view')
  getTableGrid(@Req() req?: Request) {
    if (req && this.qrSecurityService) {
      this.qrSecurityService.recordPosClientIp(extractClientIp(req));
    }
    return this.posService.getTableGrid();
  }

  @Post('pos/tables')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  createTable(
    @Body(new ZodValidationPipe(CreateDiningTableSchema)) body: CreateDiningTableInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.posService.createTable(body, userId);
  }

  @Put('pos/tables/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  updateTable(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateDiningTableSchema)) body: UpdateDiningTableInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.posService.updateTable(id, body, userId);
  }

  @Delete('pos/tables/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  deleteTable(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.posService.deleteTable(id, userId);
  }

  @Post('pos/tables/:id/rotate-qr')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  rotateTableQr(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.posService.rotateTableQr(id, userId);
  }

  @Post('pos/takeaway-qr/rotate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  rotateTakeawayQr(@CurrentUser('id') userId: number) {
    return this.posService.rotateTakeawayQr(userId);
  }

  @Post('pos/tables/shorten-qr')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  shortenLegacyQrTokens(@CurrentUser('id') userId: number) {
    return this.posService.shortenLegacyQrTokens(userId);
  }

  @Post('pos/orders')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'create')
  createOrder(
    @Body(new ZodValidationPipe(CreatePosOrderSchema)) body: CreatePosOrderInput,
    @CurrentUser('id') cashierId: number,
  ) {
    return this.posService.createOrder(body, cashierId);
  }

  @Get('pos/orders/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'view')
  getOrder(@Param('id', ParseIntPipe) id: number) {
    return this.posService.getOrder(id);
  }

  @Post('pos/orders/:id/approve')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  approveQrOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ApproveQrOrderSchema)) body: ApproveQrOrderInput,
    @CurrentUser('id') cashierId: number,
  ) {
    return this.posService.approveQrOrder(id, body, cashierId);
  }

  @Post('pos/orders/:id/cancel')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  cancelOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(VoidInvoiceRequestSchema)) body: VoidInvoiceRequest,
    @CurrentUser('id') cashierId: number,
  ) {
    return this.posService.cancelOrder(id, body, cashierId);
  }

  @Patch('pos/orders/:id/items')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  patchOrderItems(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(PatchOrderItemsSchema)) body: PatchOrderItemsInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.posService.patchOrderItems(id, body, userId);
  }

  @Get('pos/orders/:id/provisional-bill')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'view')
  getProvisionalBill(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.posService.getProvisionalBill(id, userId);
  }

  @Post('pos/orders/:id/provisional-bill')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'view')
  createProvisionalBill(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.posService.getProvisionalBill(id, userId);
  }

  @Post('pos/orders/:id/split-provisional-bill')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'view')
  createSplitProvisionalBill(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(SplitProvisionalBillRequestSchema)) body: SplitProvisionalBillRequest,
    @CurrentUser('id') userId?: number,
  ) {
    return this.posService.getSplitProvisionalBill(id, body, userId);
  }

  @Post('pos/orders/:id/checkout')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'checkout')
  checkout(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CheckoutOrderRequestSchema)) body: CheckoutOrderRequest,
    @CurrentUser('id') cashierId: number,
  ) {
    return this.posService.checkout(id, body, cashierId);
  }

  @Post('pos/orders/:id/split-checkout')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'checkout')
  splitCheckout(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(SplitCheckoutOrderRequestSchema)) body: SplitCheckoutOrderRequest,
    @CurrentUser('id') cashierId: number,
  ) {
    return this.posService.splitCheckout(id, body, cashierId);
  }

  @Post('pos/orders/:id/split-kitchen')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'splitKitchen')
  splitKitchen(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.posService.splitKitchen(id, userId);
  }

  @Post('pos/orders/:id/reprint-kitchen')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'splitKitchen')
  reprintKitchen(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ReprintKitchenRequestSchema)) body: ReprintKitchenRequest,
    @CurrentUser('id') userId: number,
  ) {
    return this.posService.reprintKitchen(id, body, userId);
  }

  @Post('pos/orders/:id/table-action')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'tableAction')
  tableAction(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(TableActionRequestSchema)) body: TableActionRequest,
    @CurrentUser('id') userId: number,
  ) {
    return this.posService.tableAction(id, body, userId);
  }

  @Get('pos/orders/:id/applicable-discounts')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'checkout')
  getApplicableDiscounts(@Param('id', ParseIntPipe) id: number) {
    return this.posService.getApplicableDiscounts(id);
  }

  @Post('pos/orders/:id/discount')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'checkout')
  applyDiscount(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ApplyPosDiscountRequestSchema)) body: ApplyPosDiscountRequest,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.posService.applyDiscount(id, body, user);
  }

  @Delete('pos/orders/:id/discount')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'checkout')
  removeDiscount(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.posService.removeDiscount(id, userId);
  }
}
