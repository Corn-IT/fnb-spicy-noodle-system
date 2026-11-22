import { Body, Controller, Delete, Get, Inject, Optional, Param, ParseIntPipe, Put, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  CreateProductSchema,
  ImportMenuExcelRequestSchema,
  MdmCategory,
  UpdateMdmSchema,
  UpdateProductSchema,
  UpsertMdmSchema,
  type AuthPrincipal,
  type CreateProductInput,
  type ImportMenuExcelRequest,
  type UpdateMdmInput,
  type UpdateProductInput,
  type UpsertMdmInput,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireAnyPermission, RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { QrSecurityService } from '../../common/security/qr-security.service';
import { extractClientIp } from '../../common/security/rate-limit.guard';
import { MdmService } from '../mdm/mdm.service';
import { MenuService } from './menu.service';

@Controller('api/v1')
export class MenuController {
  constructor(
    @Inject(MenuService) private readonly menuService: MenuService,
    @Optional() @Inject(QrSecurityService) private readonly qrSecurityService?: QrSecurityService,
    @Optional() @Inject(MdmService) private readonly mdmService?: MdmService,
  ) {}

  @Get('public/menu')
  async publicMenu(
    @Query('token') token: string | undefined,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('activeOrderId') activeOrderIdRaw?: string,
    @Query('guestSessionToken') guestSessionToken?: string,
    @Req() req?: Request,
  ) {
    if (this.qrSecurityService) {
      const parsedLat = lat !== undefined && lat !== '' ? Number(lat) : undefined;
      const parsedLng = lng !== undefined && lng !== '' ? Number(lng) : undefined;
      await this.qrSecurityService.verifyGuestQrAccess({
        clientIp: req ? extractClientIp(req) : undefined,
        latitude: Number.isFinite(parsedLat) ? parsedLat : undefined,
        longitude: Number.isFinite(parsedLng) ? parsedLng : undefined,
        qrToken: token,
      });
    }
    const parsedOrderId = activeOrderIdRaw !== undefined && activeOrderIdRaw !== ''
      ? Number(activeOrderIdRaw)
      : undefined;
    const hasGuestContext =
      (parsedOrderId !== undefined && Number.isSafeInteger(parsedOrderId) && parsedOrderId > 0) ||
      Boolean(guestSessionToken?.trim());
    if (hasGuestContext) {
      return this.menuService.getPublicMenu(token ?? '', {
        ...(parsedOrderId && Number.isSafeInteger(parsedOrderId) && parsedOrderId > 0
          ? { activeOrderId: parsedOrderId }
          : {}),
        ...(guestSessionToken?.trim() ? { guestSessionToken: guestSessionToken.trim() } : {}),
      });
    }
    return this.menuService.getPublicMenu(token ?? '');
  }

  @Get('menu/products')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireAnyPermission(
    { module: 'menu', action: 'view' },
    { module: 'pos', action: 'view' },
  )
  listProducts() {
    return this.menuService.listProducts();
  }

  @Post('menu/products')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'create')
  createProduct(
    @Body(new ZodValidationPipe(CreateProductSchema)) body: CreateProductInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.menuService.createProduct(body, user);
  }

  @Post('menu/products/import-excel')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'import')
  importProductsExcel(
    @Body(new ZodValidationPipe(ImportMenuExcelRequestSchema)) body: ImportMenuExcelRequest,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.menuService.importProductsExcel(body, user);
  }

  @Put('menu/products/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'update')
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateProductSchema)) body: UpdateProductInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.menuService.updateProduct(id, body, user);
  }

  @Delete('menu/products/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'delete')
  deleteProduct(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.menuService.deleteProduct(id, user);
  }

  @Post('menu/stations')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'manageStations')
  async createStation(
    @Body(new ZodValidationPipe(UpsertMdmSchema)) body: UpsertMdmInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const res = await this.mdmService!.findOrCreate(MdmCategory.KITCHEN_STATION, body.name, body.metadata, undefined, user);
    this.menuService.invalidatePublicMenuCache();
    return res;
  }

  @Put('menu/stations/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'manageStations')
  async updateStation(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateMdmSchema)) body: UpdateMdmInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const res = await this.mdmService!.update(id, body, user);
    this.menuService.invalidatePublicMenuCache();
    return res;
  }

  @Delete('menu/stations/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'manageStations')
  async deleteStation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    const res = await this.mdmService!.softDisable(id, user);
    this.menuService.invalidatePublicMenuCache();
    return res;
  }

  @Post('menu/categories')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'manageCategories')
  async createCategory(
    @Body(new ZodValidationPipe(UpsertMdmSchema)) body: UpsertMdmInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const res = await this.mdmService!.findOrCreate(MdmCategory.MENU_CATEGORY, body.name, body.metadata, undefined, user);
    this.menuService.invalidatePublicMenuCache();
    return res;
  }

  @Put('menu/categories/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'manageCategories')
  async updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateMdmSchema)) body: UpdateMdmInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const res = await this.mdmService!.update(id, body, user);
    this.menuService.invalidatePublicMenuCache();
    return res;
  }

  @Delete('menu/categories/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('menu', 'manageCategories')
  async deleteCategory(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    const res = await this.mdmService!.softDisable(id, user);
    this.menuService.invalidatePublicMenuCache();
    return res;
  }
}
