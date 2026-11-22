import { normalizeVietnameseString } from './normalized-string.util';

export interface MdmOrderable {
  id?: number;
  name?: string | null;
  normalizedName?: string | null;
  metadata?: unknown;
}

export interface UserOrderable {
  id?: number;
  username?: string | null;
  isSuperAdmin?: boolean | null;
  isActive?: boolean | null;
  permissions?: unknown;
  employee?: {
    position?: MdmOrderable | null;
    specialty?: MdmOrderable | null;
  } | null;
}

export interface EmployeeOrderable {
  id?: number;
  fullName?: string | null;
  isDeleted?: boolean | null;
  position?: MdmOrderable | null;
  specialty?: MdmOrderable | null;
  user?: Pick<UserOrderable, 'username' | 'isSuperAdmin' | 'isActive' | 'permissions'> | null;
}

const POSITION_FALLBACK_ORDER: ReadonlyArray<{ needle: string; rank: number }> = [
  { needle: 'chu cua hang', rank: 1 },
  { needle: 'quan ly', rank: 2 },
  { needle: 'thu ngan', rank: 3 },
  { needle: 'bep truong', rank: 4 },
  { needle: 'bep nau', rank: 5 },
  { needle: 'bep chien', rank: 6 },
  { needle: 'pha che', rank: 7 },
  { needle: 'phuc vu', rank: 8 },
];

const SPECIALTY_FALLBACK_ORDER: ReadonlyArray<{ needle: string; rank: number }> = [
  { needle: 'quan ly', rank: 1 },
  { needle: 'thu ngan', rank: 2 },
  { needle: 'bep nau', rank: 3 },
  { needle: 'bep chien', rank: 4 },
  { needle: 'pha che', rank: 5 },
  { needle: 'phuc vu', rank: 6 },
];

export function readMetadataSortOrder(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const raw = (metadata as Record<string, unknown>).sortOrder;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return null;
  }
  return raw;
}

function asPermissionMap(permissions: unknown): Record<string, Record<string, unknown>> {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return {};
  }
  return permissions as Record<string, Record<string, unknown>>;
}

function resolveRefSortRank(
  ref: MdmOrderable | null | undefined,
  fallbacks: ReadonlyArray<{ needle: string; rank: number }>,
): number {
  const explicit = readMetadataSortOrder(ref?.metadata);
  if (explicit !== null) return explicit;
  const norm = ref?.normalizedName?.trim() || normalizeVietnameseString(ref?.name ?? '');
  if (!norm) return Number.MAX_SAFE_INTEGER;
  const matched = fallbacks.find((entry) => norm.includes(entry.needle));
  return matched ? matched.rank : Number.MAX_SAFE_INTEGER;
}

/**
 * Sorts Master Data entries by configured `metadata.sortOrder` ascending,
 * falling back to creation order (`id`) and Vietnamese alphabetical order.
 */
export function compareMdmRecords<T extends MdmOrderable>(a: T, b: T): number {
  const sortA = readMetadataSortOrder(a.metadata) ?? Number.MAX_SAFE_INTEGER;
  const sortB = readMetadataSortOrder(b.metadata) ?? Number.MAX_SAFE_INTEGER;
  if (sortA !== sortB) return sortA - sortB;

  const idA = a.id ?? Number.MAX_SAFE_INTEGER;
  const idB = b.id ?? Number.MAX_SAFE_INTEGER;
  if (idA !== idB) return idA - idB;

  return (a.name ?? '').localeCompare(b.name ?? '', 'vi');
}

/**
 * Computes hierarchical RBAC display tier:
 * 0 = Super Admin, 1 = Admin (full ops), 2 = Admin View (read-only),
 * 3 = Cashier (`thungan`), 4 = Other staff accounts.
 */
export function resolveUserAccountTier(user: UserOrderable): number {
  if (user.isSuperAdmin) return 0;

  const uname = (user.username ?? '').trim().toLowerCase();
  if (uname === 'superadmin') return 0;
  if (uname === 'admin') return 1;
  if (uname === 'adminview') return 2;
  if (uname === 'thungan') return 3;

  const perms = asPermissionMap(user.permissions);
  const hasManagerialWrite =
    Boolean(perms.settings?.update) ||
    Boolean(perms.invoices?.approve) ||
    Boolean(perms.mdm?.update) ||
    Boolean(perms.payroll?.update) ||
    Boolean(perms.rbac?.create) ||
    Boolean(perms.rbac?.update);
  if (hasManagerialWrite) return 1;

  const hasAdminViewAccess =
    Boolean(perms.rbac?.view) ||
    Boolean(perms.settings?.view) ||
    Boolean(perms.payroll?.view) ||
    Boolean(perms.mdm?.view);
  const hasPosOperationalAccess = Boolean(perms.pos?.create) || Boolean(perms.pos?.checkout);
  if (hasAdminViewAccess && !hasPosOperationalAccess) return 2;

  if (uname.startsWith('cashier') || hasPosOperationalAccess || Boolean(perms.cashflow?.create)) {
    return 4;
  }

  return 5;
}

export function compareUsersForDisplay<T extends UserOrderable>(a: T, b: T): number {
  const tierDiff = resolveUserAccountTier(a) - resolveUserAccountTier(b);
  if (tierDiff !== 0) return tierDiff;

  const activeDiff = Number(Boolean(b.isActive ?? true)) - Number(Boolean(a.isActive ?? true));
  if (activeDiff !== 0) return activeDiff;

  const posDiff =
    resolveRefSortRank(a.employee?.position, POSITION_FALLBACK_ORDER) -
    resolveRefSortRank(b.employee?.position, POSITION_FALLBACK_ORDER);
  if (posDiff !== 0) return posDiff;

  const idDiff = (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
  if (idDiff !== 0) return idDiff;

  return (a.username ?? '').localeCompare(b.username ?? '', 'vi');
}

export function compareEmployeesForDisplay<T extends EmployeeOrderable>(a: T, b: T): number {
  const deletedDiff = Number(Boolean(a.isDeleted)) - Number(Boolean(b.isDeleted));
  if (deletedDiff !== 0) return deletedDiff;

  const posDiff =
    resolveRefSortRank(a.position, POSITION_FALLBACK_ORDER) -
    resolveRefSortRank(b.position, POSITION_FALLBACK_ORDER);
  if (posDiff !== 0) return posDiff;

  const accountRankA = a.user ? resolveUserAccountTier(a.user) : 10;
  const accountRankB = b.user ? resolveUserAccountTier(b.user) : 10;
  if (accountRankA !== accountRankB) return accountRankA - accountRankB;

  const specDiff =
    resolveRefSortRank(a.specialty, SPECIALTY_FALLBACK_ORDER) -
    resolveRefSortRank(b.specialty, SPECIALTY_FALLBACK_ORDER);
  if (specDiff !== 0) return specDiff;

  const idDiff = (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
  if (idDiff !== 0) return idDiff;

  return (a.fullName ?? '').localeCompare(b.fullName ?? '', 'vi');
}
