import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateDiscountSchema,
  DiscountFilterQuerySchema,
  ToggleDiscountStatusSchema,
  UpdateDiscountSchema,
  type CreateDiscountInput,
  type DiscountFilterQuery,
  type ToggleDiscountStatusInput,
  type UpdateDiscountInput,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DiscountsService } from './discounts.service';

@Controller('api/v1/discounts')
@UseGuards(JwtAuthGuard, RbacGuard)
export class DiscountsController {
  constructor(@Inject(DiscountsService) private readonly discountsService: DiscountsService) {}

  @Get()
  @RequirePermission('discounts', 'view')
  list(@Query(new ZodValidationPipe(DiscountFilterQuerySchema)) query: DiscountFilterQuery) {
    return this.discountsService.list(query);
  }

  @Post()
  @RequirePermission('discounts', 'create')
  create(
    @Body(new ZodValidationPipe(CreateDiscountSchema)) body: CreateDiscountInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.discountsService.create(body, userId);
  }

  @Put(':id')
  @RequirePermission('discounts', 'update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateDiscountSchema)) body: UpdateDiscountInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.discountsService.update(id, body, userId);
  }

  @Patch(':id/status')
  @RequirePermission('discounts', 'update')
  toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ToggleDiscountStatusSchema)) body: ToggleDiscountStatusInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.discountsService.toggleStatus(id, body, userId);
  }

  @Delete(':id')
  @RequirePermission('discounts', 'delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.discountsService.remove(id, userId);
  }
}
