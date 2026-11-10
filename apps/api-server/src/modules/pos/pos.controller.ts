import { Body, Controller, Get, HttpCode, Inject, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApproveQrOrderSchema,
  CheckoutOrderRequestSchema,
  CreatePosOrderSchema,
  CreateQrOrderSchema,
  PatchOrderItemsSchema,
  ReprintKitchenRequestSchema,
  TableActionRequestSchema,
  VoidInvoiceRequestSchema,
  type ApproveQrOrderInput,
  type CheckoutOrderRequest,
  type CreatePosOrderInput,
  type CreateQrOrderInput,
  type PatchOrderItemsInput,
  type ReprintKitchenRequest,
  type TableActionRequest,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PosService } from './pos.service';

@Controller('api/v1')
export class PosController {
  constructor(@Inject(PosService) private readonly posService: PosService) {}

  @Post('public/orders/qr')
  createQrOrder(@Body(new ZodValidationPipe(CreateQrOrderSchema)) body: CreateQrOrderInput) {
    return this.posService.createQrOrder(body);
  }

  @Get('pos/tables')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'view')
  getTableGrid() {
    return this.posService.getTableGrid();
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
  ) {
    return this.posService.patchOrderItems(id, body);
  }

  @Get('pos/orders/:id/provisional-bill')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'view')
  getProvisionalBill(@Param('id', ParseIntPipe) id: number) {
    return this.posService.getProvisionalBill(id);
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
}
