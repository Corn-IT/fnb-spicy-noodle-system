import {
  TakeawayLabelFormat,
  TakeawayLabelFormatSchema,
  formatTakeawayLabel,
  type TakeawayLabelFormat as TakeawayLabelFormatType,
} from '@fnb/shared';

type MasterDataReader = {
  masterData?: {
    findUnique?: (args: {
      where: {
        category_normalizedName: {
          category: string;
          normalizedName: string;
        };
      };
      select?: { metadata?: boolean };
    }) => Promise<{ metadata?: unknown } | null>;
  };
};

export function normalizeTakeawayLabelFormat(
  rawFormat: unknown,
): TakeawayLabelFormatType | null {
  const parsed = TakeawayLabelFormatSchema.safeParse(rawFormat);
  return parsed.success ? parsed.data : null;
}

export function formatOrderTakeawayLabel(
  takeawayNumber: number | null | undefined,
  takeawayLabelFormat?: unknown,
): string {
  const format = normalizeTakeawayLabelFormat(takeawayLabelFormat) ?? TakeawayLabelFormat.NUMBER;
  return formatTakeawayLabel(takeawayNumber, format);
}

export async function resolveStoreTakeawayLabelFormat(
  client: unknown,
): Promise<TakeawayLabelFormatType> {
  const db = client as MasterDataReader | null | undefined;
  if (typeof db?.masterData?.findUnique !== 'function') {
    return TakeawayLabelFormat.NUMBER;
  }
  try {
    const row = await db.masterData.findUnique({
      where: {
        category_normalizedName: {
          category: 'SYSTEM_CONFIG',
          normalizedName: 'store_settings',
        },
      },
      select: { metadata: true },
    });
    const metadata = row?.metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const parsed = TakeawayLabelFormatSchema.safeParse(
        (metadata as { takeawayLabelFormat?: unknown }).takeawayLabelFormat,
      );
      if (parsed.success) {
        return parsed.data;
      }
    }
  } catch {
    return TakeawayLabelFormat.NUMBER;
  }
  return TakeawayLabelFormat.NUMBER;
}
