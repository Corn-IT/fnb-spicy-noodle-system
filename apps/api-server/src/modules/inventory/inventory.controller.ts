import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateInventoryImportBatchSchema,
  InventoryImportFilterQuerySchema,
  type AuthPrincipal,
  type CreateInventoryImportBatchInput,
  type InventoryImportFilterQuery,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InventoryService } from './inventory.service';

@Controller('api/v1/inventory-imports')
@UseGuards(JwtAuthGuard, RbacGuard)
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermission('inventory', 'view')
  list(@Query(new ZodValidationPipe(InventoryImportFilterQuerySchema)) query: InventoryImportFilterQuery) {
    return this.inventoryService.list(query);
  }

  @Post()
  @RequirePermission('inventory', 'create')
  create(
    @Body(new ZodValidationPipe(CreateInventoryImportBatchSchema)) body: CreateInventoryImportBatchInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.inventoryService.createBatch(body, user.id);
  }

  @Delete(':id')
  @RequirePermission('inventory', 'delete')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.inventoryService.softDelete(id, user);
  }
}
