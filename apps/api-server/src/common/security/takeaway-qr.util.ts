import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { QrTokenSchema } from '@fnb/shared';

const SYSTEM_CONFIG_CATEGORY = 'SYSTEM_CONFIG';
const TAKEAWAY_QR_NORMALIZED_NAME = 'takeaway_qr_config';
const TAKEAWAY_QR_DISPLAY_NAME = 'Cấu hình Mã QR Mang về';
const EPHEMERAL_FALLBACK_SECRET = randomBytes(32).toString('hex');

let cachedTakeawayQrToken: string | null = null;

type MasterDataLookupClient = {
  masterData?: {
    findUnique?: (args: Prisma.MasterDataFindUniqueArgs) => Promise<{
      metadata?: unknown;
      isActive?: boolean;
    } | null>;
    upsert?: (args: Prisma.MasterDataUpsertArgs) => Promise<{ metadata?: unknown }>;
  };
};

function resolveGuestSessionSecret(): string {
  return process.env.FNB_JWT_SECRET ?? process.env.JWT_SECRET ?? EPHEMERAL_FALLBACK_SECRET;
}

function extractTokenFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const rawToken = (metadata as { qrToken?: unknown }).qrToken;
  return QrTokenSchema.safeParse(rawToken).success ? (rawToken as string) : null;
}

export function setCachedTakeawayQrToken(token: string | null): void {
  cachedTakeawayQrToken = token && QrTokenSchema.safeParse(token).success ? token : null;
}

export function isCachedTakeawayQrToken(token: string | undefined | null): boolean {
  if (!token || !cachedTakeawayQrToken) return false;
  return token === cachedTakeawayQrToken;
}

export async function getTakeawayQrToken(prisma: MasterDataLookupClient): Promise<string | null> {
  if (typeof prisma.masterData?.findUnique !== 'function') {
    return null;
  }
  const row = await prisma.masterData.findUnique({
    where: {
      category_normalizedName: {
        category: SYSTEM_CONFIG_CATEGORY,
        normalizedName: TAKEAWAY_QR_NORMALIZED_NAME,
      },
    },
    select: { metadata: true, isActive: true },
  });
  if (!row || row.isActive === false) {
    return null;
  }
  const token = extractTokenFromMetadata(row.metadata);
  if (token) {
    setCachedTakeawayQrToken(token);
  }
  return token;
}

export async function getOrCreateTakeawayQrToken(
  prisma: MasterDataLookupClient,
): Promise<string | undefined> {
  if (typeof prisma.masterData?.findUnique !== 'function') {
    return undefined;
  }
  const existing = await getTakeawayQrToken(prisma);
  if (existing) {
    return existing;
  }
  if (typeof prisma.masterData?.upsert !== 'function') {
    return undefined;
  }

  const candidateToken = randomBytes(32).toString('hex');
  const metadata: Prisma.InputJsonObject = {
    qrToken: candidateToken,
    updatedAt: new Date().toISOString(),
  };
  const upserted = await prisma.masterData.upsert({
    where: {
      category_normalizedName: {
        category: SYSTEM_CONFIG_CATEGORY,
        normalizedName: TAKEAWAY_QR_NORMALIZED_NAME,
      },
    },
    update: {},
    create: {
      category: SYSTEM_CONFIG_CATEGORY,
      name: TAKEAWAY_QR_DISPLAY_NAME,
      normalizedName: TAKEAWAY_QR_NORMALIZED_NAME,
      metadata,
      isActive: true,
    },
    select: { metadata: true },
  });
  const resolved = extractTokenFromMetadata(upserted?.metadata) ?? candidateToken;
  setCachedTakeawayQrToken(resolved);
  return resolved;
}

export async function rotateTakeawayQrToken(
  prisma: MasterDataLookupClient,
): Promise<{ previousQrToken: string | null; qrToken: string }> {
  const previousQrToken = await getTakeawayQrToken(prisma);
  const nextQrToken = randomBytes(32).toString('hex');
  const metadata: Prisma.InputJsonObject = {
    qrToken: nextQrToken,
    updatedAt: new Date().toISOString(),
  };

  if (typeof prisma.masterData?.upsert === 'function') {
    await prisma.masterData.upsert({
      where: {
        category_normalizedName: {
          category: SYSTEM_CONFIG_CATEGORY,
          normalizedName: TAKEAWAY_QR_NORMALIZED_NAME,
        },
      },
      update: {
        name: TAKEAWAY_QR_DISPLAY_NAME,
        metadata,
        isActive: true,
      },
      create: {
        category: SYSTEM_CONFIG_CATEGORY,
        name: TAKEAWAY_QR_DISPLAY_NAME,
        normalizedName: TAKEAWAY_QR_NORMALIZED_NAME,
        metadata,
        isActive: true,
      },
    });
  }

  setCachedTakeawayQrToken(nextQrToken);
  return { previousQrToken, qrToken: nextQrToken };
}

export async function isTakeawayQrToken(
  prisma: MasterDataLookupClient,
  token: string | undefined | null,
): Promise<boolean> {
  if (!token || !QrTokenSchema.safeParse(token).success) {
    return false;
  }
  const activeToken = await getTakeawayQrToken(prisma);
  return Boolean(activeToken && activeToken === token);
}

export function signTakeawayGuestSessionToken(orderId: number, orderCode: string): string {
  return createHmac('sha256', resolveGuestSessionSecret())
    .update(`takeaway-guest:${orderId}:${orderCode}`)
    .digest('hex');
}

export function verifyTakeawayGuestSessionToken(
  candidate: unknown,
  orderId: number,
  orderCode: string,
): boolean {
  if (typeof candidate !== 'string' || !/^[a-f0-9]{64}$/i.test(candidate.trim())) {
    return false;
  }
  const expected = signTakeawayGuestSessionToken(orderId, orderCode);
  const candidateBuf = Buffer.from(candidate.trim().toLowerCase(), 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (candidateBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(candidateBuf, expectedBuf);
}

export function formatTakeawayCustomerNote(params: {
  customerName?: string;
  customerPhone?: string;
  note?: string;
}): string | undefined {
  const name = params.customerName?.trim() || '';
  const phone = params.customerPhone?.trim() || '';
  const note = params.note?.trim() || '';
  const customerParts = [name, phone].filter(Boolean);
  const customerPrefix = customerParts.length > 0 ? `Khách: ${customerParts.join(' - ')}` : '';
  const combined = [customerPrefix, note].filter(Boolean).join(' | ');
  return combined ? combined.slice(0, 1000) : undefined;
}
