import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type MasterData } from '@prisma/client';
import {
  ErrorCodes,
  InternalMdmRecord,
  MdmCategory,
  type MdmListResponse,
  type MdmLookupQuery,
  type UpdateMdmInput,
} from '@fnb/shared';
import { normalizeVietnameseString, toTitleCase } from '../../common/utils/normalized-string.util';
import { PrismaService } from '../../common/prisma/prisma.service';

type Metadata = Record<string, unknown>;

@Injectable()
export class MdmService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findOrCreate(
    category: MdmCategory,
    rawInput: string,
    metadata: Metadata = {},
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<MasterData> {
    const trimmed = rawInput.trim();
    if (!trimmed) throw new BadRequestException('Tên danh mục không được để trống');

    const name = toTitleCase(trimmed);
    const normalizedName = normalizeVietnameseString(trimmed);
    if (category === MdmCategory.UNIT && normalizedName === InternalMdmRecord.CASHFLOW_DEFAULT_OPENING_BUDGET) {
      throw new BadRequestException('Tên danh mục này được hệ thống sử dụng');
    }
    if (client !== this.prisma) {
      return this.findOrCreateWithinTransaction(client, category, name, normalizedName, metadata);
    }

    const existing = await client.masterData.findFirst({
      where: { category, normalizedName, isActive: true },
    });

    if (existing) return this.mergeMetadata(existing, metadata, client);

    try {
      return await client.masterData.create({
        data: { category, name, normalizedName, metadata: metadata as Prisma.InputJsonObject, isActive: true },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const conflicting = await client.masterData.findUnique({
        where: { category_normalizedName: { category, normalizedName } },
      });
      if (!conflicting) throw error;
      const reactivated = conflicting.isActive
        ? conflicting
        : await client.masterData.update({ where: { id: conflicting.id }, data: { isActive: true, name } });
      return this.mergeMetadata(reactivated, metadata, client);
    }
  }

  async lookup(query: MdmLookupQuery): Promise<MasterData[]> {
    return this.prisma.masterData.findMany({
      where: {
        category: query.category,
        isActive: true,
        normalizedName: { not: InternalMdmRecord.CASHFLOW_DEFAULT_OPENING_BUDGET },
        ...(query.keyword ? { name: { contains: query.keyword, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  async list(query: MdmLookupQuery): Promise<MdmListResponse> {
    const where: Prisma.MasterDataWhereInput = {
      category: query.category,
      normalizedName: { not: InternalMdmRecord.CASHFLOW_DEFAULT_OPENING_BUDGET },
      ...(query.activeOnly ? { isActive: true } : {}),
      ...(query.keyword ? { name: { contains: query.keyword, mode: 'insensitive' as const } } : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.masterData.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.masterData.count({ where }),
    ]);
    const items = records.map((record) => ({
      ...record,
      category: record.category as MdmCategory,
      metadata: record.metadata as Metadata,
      createdAt: record.createdAt.toISOString(),
    }));
    return { page: query.page, limit: query.limit, total, items };
  }

  async update(id: number, input: UpdateMdmInput): Promise<MasterData> {
    const existing = await this.prisma.masterData.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy dữ liệu danh mục');
    if (this.isInternalCashflowRecord(existing)) throw this.internalRecordForbidden();

    const data: Prisma.MasterDataUpdateInput = {};
    if (input.name !== undefined) {
      const name = toTitleCase(input.name);
      const normalizedName = normalizeVietnameseString(input.name);
      const duplicate = await this.prisma.masterData.findFirst({
        where: { category: existing.category, normalizedName, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw this.duplicateName();
      data.name = name;
      data.normalizedName = normalizedName;
    }
    if (input.metadata !== undefined) {
      data.metadata = { ...(existing.metadata as Metadata), ...input.metadata } as Prisma.InputJsonObject;
    }

    try {
      return await this.prisma.masterData.update({ where: { id }, data });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) throw this.duplicateName();
      throw error;
    }
  }

  async softDisable(id: number): Promise<MasterData> {
    const existing = await this.prisma.masterData.findUnique({
      where: { id },
      select: { id: true, category: true, normalizedName: true },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy dữ liệu danh mục');
    if (this.isInternalCashflowRecord(existing)) throw this.internalRecordForbidden();
    return this.prisma.masterData.update({ where: { id }, data: { isActive: false } });
  }

  private async mergeMetadata(
    record: MasterData,
    metadata: Metadata,
    client: PrismaService | Prisma.TransactionClient,
  ): Promise<MasterData> {
    if (Object.keys(metadata).length === 0) return record;
    return client.masterData.update({
      where: { id: record.id },
      data: {
        metadata: { ...(record.metadata as Metadata), ...metadata } as Prisma.InputJsonObject,
      },
    });
  }

  private async findOrCreateWithinTransaction(
    client: Prisma.TransactionClient | PrismaService,
    category: MdmCategory,
    name: string,
    normalizedName: string,
    metadata: Metadata,
  ): Promise<MasterData> {
    const metadataJson = JSON.stringify(metadata);
    const [record] = await client.$queryRaw<MasterData[]>`
      INSERT INTO master_data (category, name, normalized_name, metadata, is_active)
      VALUES (${category}, ${name}, ${normalizedName}, ${metadataJson}::jsonb, TRUE)
      ON CONFLICT (category, normalized_name)
      DO UPDATE SET
        name = CASE WHEN master_data.is_active THEN master_data.name ELSE EXCLUDED.name END,
        metadata = master_data.metadata || EXCLUDED.metadata,
        is_active = TRUE
      RETURNING
        id,
        category,
        name,
        normalized_name AS "normalizedName",
        metadata,
        is_active AS "isActive",
        created_at AS "createdAt"
    `;
    if (!record) throw new Error('Không thể lưu dữ liệu danh mục');
    return record;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private duplicateName(): ConflictException {
    return new ConflictException({ code: ErrorCodes.MDM_NAME_TAKEN, message: 'Tên danh mục đã tồn tại' });
  }

  private isInternalCashflowRecord(record: { category: string; normalizedName: string }): boolean {
    return record.category === MdmCategory.UNIT
      && record.normalizedName === InternalMdmRecord.CASHFLOW_DEFAULT_OPENING_BUDGET;
  }

  private internalRecordForbidden(): ForbiddenException {
    return new ForbiddenException({
      code: ErrorCodes.RBAC_PERMISSION_DENIED,
      message: 'Không thể chỉnh sửa cấu hình nội bộ của hệ thống qua danh mục Master Data',
    });
  }
}
