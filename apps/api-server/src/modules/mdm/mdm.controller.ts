import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  MdmLookupQuerySchema,
  UpsertMdmSchema,
  UpdateMdmSchema,
  type MdmLookupQuery,
  type UpdateMdmInput,
  type UpsertMdmInput,
} from '@fnb/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MdmService } from './mdm.service';

@Controller('api/v1/mdm')
export class MdmController {
  constructor(@Inject(MdmService) private readonly mdmService: MdmService) {}

  @Get('lookup')
  @UseGuards(JwtAuthGuard)
  lookup(@Query(new ZodValidationPipe(MdmLookupQuerySchema)) query: MdmLookupQuery) {
    return this.mdmService.lookup(query);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mdm', 'view')
  list(@Query(new ZodValidationPipe(MdmLookupQuerySchema)) query: MdmLookupQuery) {
    return this.mdmService.list(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mdm', 'write')
  create(@Body(new ZodValidationPipe(UpsertMdmSchema)) body: UpsertMdmInput) {
    return this.mdmService.findOrCreate(body.category, body.name, body.metadata);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mdm', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateMdmSchema)) body: UpdateMdmInput,
  ) {
    return this.mdmService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('mdm', 'write')
  disable(@Param('id', ParseIntPipe) id: number) {
    return this.mdmService.softDisable(id);
  }
}
