import { randomInt } from 'node:crypto';
import {
  buildTableQrSlugPrefix,
  normalizeQrToken,
  SHORT_QR_TOKEN_SUFFIX_ALPHABET,
} from '@fnb/shared';

type TableTokenLookupClient = {
  diningTable?: {
    findUnique?: (args: {
      where: { qrToken: string };
      select?: { id?: boolean };
    }) => Promise<{ id: number } | null>;
  };
};

export function generateShortQrSuffix(length = 4): string {
  let suffix = '';
  for (let i = 0; i < length; i += 1) {
    const idx = randomInt(0, SHORT_QR_TOKEN_SUFFIX_ALPHABET.length);
    suffix += SHORT_QR_TOKEN_SUFFIX_ALPHABET[idx]!;
  }
  return suffix;
}

export function generateShortQrToken(
  labelSeed: string,
  options?: { fallbackPrefix?: string; previousToken?: string | null },
): string {
  const prefix = buildTableQrSlugPrefix(labelSeed, options?.fallbackPrefix ?? 'ban');
  const previousNormalized = options?.previousToken
    ? normalizeQrToken(options.previousToken)
    : null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${prefix}-${generateShortQrSuffix(4)}`;
    if (!previousNormalized || candidate !== previousNormalized) {
      return candidate;
    }
  }
  return `${prefix}-${generateShortQrSuffix(5)}`;
}

export async function generateUniqueTableQrToken(
  prisma: TableTokenLookupClient,
  labelSeed: string,
  previousToken?: string | null,
): Promise<string> {
  const hasLookup = typeof prisma.diningTable?.findUnique === 'function';
  let excluded = previousToken ?? null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateShortQrToken(labelSeed, {
      fallbackPrefix: 'ban',
      previousToken: excluded,
    });
    if (!hasLookup) {
      return candidate;
    }
    const existing = await prisma.diningTable!.findUnique!({
      where: { qrToken: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    excluded = candidate;
  }

  return generateShortQrToken(labelSeed, {
    fallbackPrefix: 'ban',
    previousToken: excluded,
  });
}
