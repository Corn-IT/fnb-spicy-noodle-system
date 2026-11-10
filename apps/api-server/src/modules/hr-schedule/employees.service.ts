import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  CreateEmployeeSchema,
  EmployeeFilterQuerySchema,
  ErrorCodes,
  MdmCategory,
  UpdateEmployeeSchema,
  type AuthPrincipal,
  type CreateEmployeeInput,
  type EmployeeFilterQuery,
  type UpdateEmployeeInput,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/utils/business-date.util';
import { MdmService } from '../mdm/mdm.service';
import { generateShortName } from './short-name.util';

const employeeRelations = {
  position: true,
  specialty: true,
  user: { select: { id: true, username: true, isActive: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeRecord = Prisma.EmployeeGetPayload<{ include: typeof employeeRelations }>;

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MdmService) private readonly mdmService: MdmService,
  ) {}

  async listEmployees(input: EmployeeFilterQuery) {
    const { page, limit, keyword, positionId, specialtyId, includeDeleted, inactiveOnly } = this.parseEmployeeFilter(input);
    const where: Prisma.EmployeeWhereInput = {
      ...(inactiveOnly ? { isDeleted: true } : includeDeleted ? {} : { isDeleted: false }),
      ...(positionId ? { positionId } : {}),
      ...(specialtyId ? { specialtyId } : {}),
      ...(keyword ? {
        OR: [
          { fullName: { contains: keyword, mode: 'insensitive' } },
          { shortName: { contains: keyword, mode: 'insensitive' } },
          { phone: { contains: keyword, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: employeeRelations,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { page, limit, total, items };
  }

  async getEmployee(id: number): Promise<EmployeeRecord> {
    const employee = await this.prisma.employee.findUnique({ where: { id }, include: employeeRelations });
    if (!employee) throw new NotFoundException('Không tìm thấy hồ sơ nhân viên');
    return employee;
  }

  async createEmployee(input: CreateEmployeeInput, actor: Pick<AuthPrincipal, 'isSuperAdmin'>): Promise<EmployeeRecord> {
    const parsed = CreateEmployeeSchema.safeParse(input);
    if (!parsed.success) throw this.invalidEmployeeData(parsed.error.flatten().fieldErrors);
    const employeeInput = parsed.data;
    if (employeeInput.account && !actor.isSuperAdmin) {
      throw new ForbiddenException({
        code: ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED,
        message: 'Chỉ Super Admin mới được tạo tài khoản đăng nhập',
      });
    }
    const passwordHash = employeeInput.account ? await bcrypt.hash(employeeInput.account.password, 10) : undefined;
    let employeeId: number | undefined;

    try {
      await this.prisma.$transaction(async (tx) => {
        const position = await this.resolveMdmReference(MdmCategory.POSITION, employeeInput.positionId, tx);
        const specialty = await this.resolveMdmReference(MdmCategory.SPECIALTY, employeeInput.specialtyId, tx);
        const created = await tx.employee.create({
          data: {
            fullName: employeeInput.fullName,
            shortName: '#pending',
            dob: employeeInput.dob ? dateOnly(employeeInput.dob) : null,
            phone: employeeInput.phone,
            address: employeeInput.address,
            citizenId: employeeInput.citizenId,
            citizenIdIssuedPlace: employeeInput.citizenIdIssuedPlace,
            positionId: position.id,
            specialtyId: specialty.id,
            startDate: employeeInput.startDate ? dateOnly(employeeInput.startDate) : null,
            bankName: employeeInput.bankName,
            bankAccountNo: employeeInput.bankAccountNo,
            bankAccountName: employeeInput.bankAccountName,
            avatarUrl: employeeInput.avatarUrl,
            attachmentUrls: employeeInput.attachmentUrls as Prisma.InputJsonArray,
            note: employeeInput.note,
          },
          select: { id: true },
        });
        employeeId = created.id;

        const existingEmployees = await tx.employee.findMany({
          where: { id: { not: created.id }, isDeleted: false },
          select: { id: true, shortName: true },
        });
        await tx.employee.update({
          where: { id: created.id },
          data: { shortName: generateShortName(employeeInput.fullName, existingEmployees, created.id) },
        });

        if (employeeInput.account && passwordHash) {
          await tx.user.create({
            data: {
              employeeId: created.id,
              username: employeeInput.account.username,
              passwordHash,
              permissions: employeeInput.account.permissions as Prisma.InputJsonObject,
            },
          });
        }
      });
    } catch (error) {
      this.rethrowEmployeeConstraint(error);
    }

    if (!employeeId) throw new Error('Không thể tạo hồ sơ nhân viên');
    return this.getEmployee(employeeId);
  }

  async updateEmployee(id: number, input: UpdateEmployeeInput): Promise<EmployeeRecord> {
    const parsed = UpdateEmployeeSchema.safeParse(input);
    if (!parsed.success) throw this.invalidEmployeeData(parsed.error.flatten().fieldErrors);
    const employeeInput = parsed.data;

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.employee.findUnique({ where: { id }, select: { id: true, isDeleted: true } });
        if (!existing) throw new NotFoundException('Không tìm thấy hồ sơ nhân viên');
        if (existing.isDeleted) throw this.employeeDeleted();

        const data: Prisma.EmployeeUncheckedUpdateInput = {};
        if (employeeInput.fullName !== undefined) data.fullName = employeeInput.fullName;
        if (employeeInput.dob !== undefined) data.dob = employeeInput.dob ? dateOnly(employeeInput.dob) : null;
        if (employeeInput.phone !== undefined) data.phone = employeeInput.phone;
        if (employeeInput.address !== undefined) data.address = employeeInput.address;
        if (employeeInput.citizenId !== undefined) data.citizenId = employeeInput.citizenId;
        if (employeeInput.citizenIdIssuedPlace !== undefined) data.citizenIdIssuedPlace = employeeInput.citizenIdIssuedPlace;
        if (employeeInput.startDate !== undefined) data.startDate = employeeInput.startDate ? dateOnly(employeeInput.startDate) : null;
        if (employeeInput.bankName !== undefined) data.bankName = employeeInput.bankName;
        if (employeeInput.bankAccountNo !== undefined) data.bankAccountNo = employeeInput.bankAccountNo;
        if (employeeInput.bankAccountName !== undefined) data.bankAccountName = employeeInput.bankAccountName;
        if (employeeInput.avatarUrl !== undefined) data.avatarUrl = employeeInput.avatarUrl;
        if (employeeInput.attachmentUrls !== undefined) data.attachmentUrls = employeeInput.attachmentUrls as Prisma.InputJsonArray;
        if (employeeInput.note !== undefined) data.note = employeeInput.note;
        if (employeeInput.positionId !== undefined) {
          data.positionId = (await this.resolveMdmReference(MdmCategory.POSITION, employeeInput.positionId, tx)).id;
        }
        if (employeeInput.specialtyId !== undefined) {
          data.specialtyId = (await this.resolveMdmReference(MdmCategory.SPECIALTY, employeeInput.specialtyId, tx)).id;
        }
        if (employeeInput.fullName !== undefined) {
          const existingEmployees = await tx.employee.findMany({
            where: { id: { not: id }, isDeleted: false },
            select: { id: true, shortName: true },
          });
          data.shortName = generateShortName(employeeInput.fullName, existingEmployees, id);
        }
        await tx.employee.update({ where: { id }, data });
      });
    } catch (error) {
      this.rethrowEmployeeConstraint(error);
    }

    return this.getEmployee(id);
  }

  async softDeleteEmployee(id: number): Promise<{ id: number; isDeleted: true }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.employee.findUnique({ where: { id }, select: { id: true, isDeleted: true } });
      if (!existing) throw new NotFoundException('Không tìm thấy hồ sơ nhân viên');
      if (existing.isDeleted) throw this.employeeDeleted();
      await tx.employee.update({ where: { id }, data: { isDeleted: true } });
      await tx.user.updateMany({ where: { employeeId: id }, data: { isActive: false } });
      return { id, isDeleted: true };
    });
  }

  async setEmployeeActiveStatus(id: number, isActive: boolean): Promise<{ id: number; isDeleted: boolean; isActive: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.employee.findUnique({ where: { id }, select: { id: true, isDeleted: true } });
      if (!existing) throw new NotFoundException('Không tìm thấy hồ sơ nhân viên');

      const isDeleted = !isActive;
      if (existing.isDeleted !== isDeleted) {
        await tx.employee.update({ where: { id }, data: { isDeleted } });
      }
      await tx.user.updateMany({ where: { employeeId: id }, data: { isActive } });
      return { id, isDeleted, isActive };
    });
  }

  private parseEmployeeFilter(input: EmployeeFilterQuery) {
    const parsed = EmployeeFilterQuerySchema.safeParse(input);
    if (!parsed.success) throw this.invalidEmployeeData(parsed.error.flatten().fieldErrors);
    return parsed.data;
  }

  private async resolveMdmReference(
    category: typeof MdmCategory.POSITION | typeof MdmCategory.SPECIALTY,
    id: number,
    tx: Prisma.TransactionClient,
  ) {
    const selected = await tx.masterData.findUnique({ where: { id }, select: { id: true, category: true, name: true, isActive: true } });
    if (!selected || selected.category !== category || !selected.isActive) {
      throw new NotFoundException(`Không tìm thấy danh mục ${category} đang hoạt động`);
    }
    return this.mdmService.findOrCreate(category, selected.name, {}, tx);
  }

  private invalidEmployeeData(details: unknown): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: ErrorCodes.VALIDATION_FAILED,
      message: 'Dữ liệu nhân viên không hợp lệ',
      details: { fieldErrors: details },
    });
  }

  private employeeDeleted(): NotFoundException {
    return new NotFoundException({ code: ErrorCodes.HR_EMPLOYEE_DELETED, message: 'Nhân viên đã được xoá' });
  }

  private rethrowEmployeeConstraint(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.map(String).join(' ').toLowerCase()
        : String(error.meta?.target ?? '').toLowerCase();
      if (target.includes('citizen_id') || target.includes('citizenid')) {
        throw new ConflictException({
          code: ErrorCodes.HR_CITIZEN_ID_DUPLICATE,
          message: 'Số CCCD đã được sử dụng',
        });
      }
      if (target.includes('username')) {
        throw new ConflictException({ code: ErrorCodes.HR_USERNAME_TAKEN, message: 'Tên đăng nhập đã được sử dụng' });
      }
      if (target.includes('employee_id') || target.includes('employeeid')) {
        throw new ConflictException({
          code: ErrorCodes.HR_EMPLOYEE_ACCOUNT_EXISTS,
          message: 'Nhân viên đã có tài khoản đăng nhập',
        });
      }
    }
    throw error;
  }
}
