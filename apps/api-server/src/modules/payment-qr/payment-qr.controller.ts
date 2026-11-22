import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreatePaymentAccountRequestSchema,
  PaymentAccountOrdersQuerySchema,
  ReorderPaymentAccountsRequestSchema,
  UpdatePaymentAccountRequestSchema,
  type CreatePaymentAccountRequest,
  type PaymentAccountOrdersQuery,
  type ReorderPaymentAccountsRequest,
  type UpdatePaymentAccountRequest,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaymentQrService } from './payment-qr.service';

@Controller('api/v1/payment-qr')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PaymentQrController {
  constructor(
    @Inject(PaymentQrService) private readonly paymentQrService: PaymentQrService,
  ) {}

  @Get()
  @RequirePermission('paymentQr', 'view')
  list() {
    return this.paymentQrService.list();
  }

  @Get(':id/orders')
  @RequirePermission('paymentQr', 'view')
  listOrders(
    @Param('id', ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(PaymentAccountOrdersQuerySchema)) query: PaymentAccountOrdersQuery,
  ) {
    return this.paymentQrService.listOrders(id, query);
  }

  @Post()
  @RequirePermission('paymentQr', 'create')
  create(
    @Body(new ZodValidationPipe(CreatePaymentAccountRequestSchema)) body: CreatePaymentAccountRequest,
    @CurrentUser('id') userId: number,
  ) {
    return this.paymentQrService.create(body, userId);
  }

  @Put('reorder')
  @RequirePermission('paymentQr', 'update')
  reorder(
    @Body(new ZodValidationPipe(ReorderPaymentAccountsRequestSchema)) body: ReorderPaymentAccountsRequest,
    @CurrentUser('id') userId: number,
  ) {
    return this.paymentQrService.reorder(body, userId);
  }

  @Put(':id')
  @RequirePermission('paymentQr', 'update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdatePaymentAccountRequestSchema)) body: UpdatePaymentAccountRequest,
    @CurrentUser('id') userId: number,
  ) {
    return this.paymentQrService.update(id, body, userId);
  }

  @Delete(':id')
  @RequirePermission('paymentQr', 'delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.paymentQrService.remove(id, userId);
  }
}
