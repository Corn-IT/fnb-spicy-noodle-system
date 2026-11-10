import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Put, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateProductSchema,
  UpdateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from '@fnb/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MenuService } from './menu.service';

@Controller('api/v1')
export class MenuController {
  constructor(@Inject(MenuService) private readonly menuService: MenuService) {}

  @Get('public/menu')
  publicMenu(@Query('token') token: string | undefined) {
    return this.menuService.getPublicMenu(token ?? '');
  }

  @Get('menu/products')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'view')
  listProducts() {
    return this.menuService.listProducts();
  }

  @Post('menu/products')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  createProduct(@Body(new ZodValidationPipe(CreateProductSchema)) body: CreateProductInput) {
    return this.menuService.createProduct(body);
  }

  @Put('menu/products/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateProductSchema)) body: UpdateProductInput,
  ) {
    return this.menuService.updateProduct(id, body);
  }

  @Delete('menu/products/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('pos', 'update')
  deleteProduct(@Param('id', ParseIntPipe) id: number) {
    return this.menuService.deleteProduct(id);
  }
}
