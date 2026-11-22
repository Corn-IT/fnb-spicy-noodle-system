import { Body, Controller, Get, Inject, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  InvoiceFilterQuerySchema,
  ReviewInvoicePaymentEditSchema,
  UpdateInvoicePaymentMethodSchema,
  VoidInvoiceRequestSchema,
  type AuthPrincipal,
  type InvoiceFilterQuery,
  type ReviewInvoicePaymentEditInput,
  type UpdateInvoicePaymentMethodInput,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InvoicesService } from './invoices.service';

@Controller('api/v1/invoices')
@UseGuards(JwtAuthGuard, RbacGuard)
export class InvoicesController {
  constructor(@Inject(InvoicesService) private readonly invoicesService: InvoicesService) {}

  @Get()
  @RequirePermission('invoices', 'view')
  list(@Query(new ZodValidationPipe(InvoiceFilterQuerySchema)) query: InvoiceFilterQuery) {
    return this.invoicesService.list(query);
  }

  @Get(':id')
  @RequirePermission('invoices', 'view')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.get(id);
  }

  @Post(':id/reprint')
  @RequirePermission('invoices', 'reprint')
  reprint(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.invoicesService.reprint(id, user);
  }

  @Patch(':id/payment-method')
  @RequirePermission('invoices', 'update')
  requestPaymentMethodEdit(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateInvoicePaymentMethodSchema)) body: UpdateInvoicePaymentMethodInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.invoicesService.requestPaymentMethodEdit(id, body, user);
  }

  @Post(':id/payment-method/review')
  @RequirePermission('invoices', 'approve')
  reviewPaymentMethodEdit(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ReviewInvoicePaymentEditSchema)) body: ReviewInvoicePaymentEditInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.invoicesService.reviewPaymentMethodEdit(id, body, user);
  }

  @Post(':id/void')
  @RequirePermission('invoices', 'void')
  voidInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(VoidInvoiceRequestSchema)) body: VoidInvoiceRequest,
    @CurrentUser('id') actorId: number,
  ) {
    return this.invoicesService.voidInvoice(id, body, actorId);
  }
}
