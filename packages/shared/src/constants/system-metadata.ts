export const InternalMdmRecord = {
  CASHFLOW_DEFAULT_OPENING_BUDGET: '__internal_cashflow_default_opening_budget__',
} as const;

export const DRINK_SIZE_CATEGORY_NAMES = [
  'Trà Hoa Quả Tươi',
  'Trà Trái Cây',
  'Trà Sữa',
  'Coffee',
  'Sinh Tố',
  'Nước Ép Hoa Quả',
  'Đá Xay',
  'Sữa Chua',
  'Sữa Tươi',
  'Soda Ý',
] as const;

export const DRINK_SIZE_CATEGORY_NORMALIZED_NAMES = [
  'tra hoa qua tuoi',
  'tra trai cay',
  'tra sua',
  'coffee',
  'sinh to',
  'nuoc ep hoa qua',
  'da xay',
  'sua chua',
  'sua tuoi',
  'soda y',
] as const;

export const DEFAULT_DRINK_SIZE_MODIFIER_GROUP = {
  name: 'Size',
  isRequired: true,
  maxSelect: 1,
  isAutoSelect: false,
  allowSubstitution: false,
  modifiers: [
    { name: 'Size M', extraPrice: 0, isDefaultChecked: true, isAvailable: true, defaultSubstituteName: null, allowedSubstituteNames: null },
    { name: 'Size L', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: null, allowedSubstituteNames: null },
  ],
} as const;

export function isDrinkSizeCategoryName(categoryName: string | null | undefined): boolean {
  if (!categoryName) return false;
  const normalized = categoryName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  return (DRINK_SIZE_CATEGORY_NORMALIZED_NAMES as readonly string[]).includes(normalized);
}

/**
 * Formats an item name with its selected Size (M/L) modifier appended as `(M)` or `(L)`,
 * and returns the remaining non-size modifiers so Size is not duplicated as a separate line.
 */
export function formatProductNameWithSize(
  productName: string,
  modifiers: readonly string[],
  pricedModifiers?: readonly string[] | null,
): {
  displayName: string;
  sizeCode: 'M' | 'L' | null;
  remainingModifiers: string[];
  remainingPricedModifiers: string[];
} {
  let sizeCode: 'M' | 'L' | null = null;
  const remainingModifiers: string[] = [];

  for (const mod of modifiers) {
    const trimmed = mod.trim();
    const match = /^(?:size\s*)?([ML])$/i.exec(trimmed);
    if (match && sizeCode === null) {
      sizeCode = match[1]!.toUpperCase() as 'M' | 'L';
    } else {
      remainingModifiers.push(mod);
    }
  }

  const remainingPricedModifiers = Array.isArray(pricedModifiers)
    ? pricedModifiers.filter((mod) => !/^(?:size\s*)?([ML])$/i.test(mod.trim()))
    : [];

  const alreadyHasSizeSuffix = /\(\s*[ML]\s*\)$/i.test(productName.trim());
  const displayName =
    sizeCode && !alreadyHasSizeSuffix ? `${productName} (${sizeCode})` : productName;

  return {
    displayName,
    sizeCode,
    remainingModifiers,
    remainingPricedModifiers,
  };
}

