import {
  type Modifier,
  type ModifierGroup,
  type OrderItemModifierSelection,
  type Product,
} from '@fnb/shared';

export function buildInitialSelectedByGroup(product: Product): Record<number, number[]> {
  const initial: Record<number, number[]> = {};
  for (const group of product.modifierGroups) {
    const defaultIds = group.modifiers
      .filter((m) => Boolean(m.isDefaultChecked || group.isAutoSelect || group.allowSubstitution))
      .map((m) => m.id);
    if (defaultIds.length > 0) {
      initial[group.id] = defaultIds;
    }
  }
  return initial;
}

export function resolveSubstituteForUncheckedModifier(
  group: ModifierGroup,
  mod: Modifier,
  chosenIds: number[],
  manualSubstituteByModifierId: Record<number, number>,
): {
  substituteModifier: Modifier | null;
  substituteName: string;
  availableSubstitutes: Modifier[];
} {
  const remainingChecked = group.modifiers.filter((m) => chosenIds.includes(m.id));
  if (remainingChecked.length === 0) {
    return {
      substituteModifier: null,
      substituteName: mod.defaultSubstituteName ?? '',
      availableSubstitutes: [],
    };
  }

  // Khi bỏ tích chọn 2 món (chỉ còn 1 món chính được giữ lại), tự động khoá thay thế bằng món còn lại duy nhất
  if (remainingChecked.length === 1) {
    const sole = remainingChecked[0]!;
    return {
      substituteModifier: sole,
      substituteName: sole.name,
      availableSubstitutes: remainingChecked,
    };
  }

  const manualSubId = manualSubstituteByModifierId[mod.id];
  if (manualSubId !== undefined) {
    const manualMatch = remainingChecked.find((m) => m.id === manualSubId);
    if (manualMatch) {
      return {
        substituteModifier: manualMatch,
        substituteName: manualMatch.name,
        availableSubstitutes: remainingChecked,
      };
    }
  }

  if (mod.defaultSubstituteName) {
    const normalizedDefault = mod.defaultSubstituteName.trim().toLowerCase();
    const defaultMatch = remainingChecked.find(
      (m) => m.name.trim().toLowerCase() === normalizedDefault,
    );
    if (defaultMatch) {
      return {
        substituteModifier: defaultMatch,
        substituteName: defaultMatch.name,
        availableSubstitutes: remainingChecked,
      };
    }
  }

  const fallback = remainingChecked[0]!;
  return {
    substituteModifier: fallback,
    substituteName: fallback.name,
    availableSubstitutes: remainingChecked,
  };
}

export function isProductModifierSelectionValid(
  product: Product,
  selectedByGroup: Record<number, number[]>,
): boolean {
  return product.modifierGroups.every((group) => {
    const chosenIds = selectedByGroup[group.id] ?? [];
    if (group.allowSubstitution && group.modifiers.length > 0) {
      return chosenIds.length >= 1;
    }
    const hasAutoDefaults = Boolean(
      group.isAutoSelect ||
        group.allowSubstitution ||
        group.modifiers.some((m) => m.isDefaultChecked),
    );
    if (!hasAutoDefaults && group.isRequired) {
      return chosenIds.length > 0;
    }
    return true;
  });
}

export function computeOrderModifiersPayload(
  product: Product,
  selectedByGroup: Record<number, number[]>,
  manualSubstituteByModifierId: Record<number, number> = {},
): {
  extraPrice: number;
  modifiers: OrderItemModifierSelection[];
  modifierLabels: string[];
} {
  let extraPrice = 0;
  const modifiers: OrderItemModifierSelection[] = [];
  const modifierLabels: string[] = [];

  for (const group of product.modifierGroups) {
    const chosenIds = selectedByGroup[group.id] ?? [];
    const hasAutoDefaults = Boolean(
      group.isAutoSelect ||
        group.allowSubstitution ||
        group.modifiers.some((m) => m.isDefaultChecked),
    );

    if (group.allowSubstitution) {
      for (const mod of group.modifiers) {
        const isChecked = chosenIds.includes(mod.id);
        if (!isChecked) {
          const { substituteModifier, substituteName } =
            resolveSubstituteForUncheckedModifier(
              group,
              mod,
              chosenIds,
              manualSubstituteByModifierId,
            );
          modifiers.push({
            groupId: group.id,
            modifierId: mod.id,
            action: 'SUBSTITUTED',
            ...(substituteModifier ? { substituteModifierId: substituteModifier.id } : {}),
            ...(substituteName ? { substituteName } : {}),
          });
          modifierLabels.push(
            substituteName
              ? `Không ${mod.name} (Thay bằng ${substituteName})`
              : `Không ${mod.name}`,
          );
        } else if (mod.extraPrice > 0) {
          extraPrice += mod.extraPrice;
        }
      }
      continue;
    }

    if (hasAutoDefaults) {
      for (const mod of group.modifiers) {
        const isChecked = chosenIds.includes(mod.id);
        const isDefault = Boolean(mod.isDefaultChecked || group.isAutoSelect);
        if (isDefault && !isChecked) {
          modifiers.push({
            groupId: group.id,
            modifierId: mod.id,
            action: 'REMOVED_DEFAULT',
          });
          modifierLabels.push(`Không ${mod.name}`);
        } else if (!isDefault && isChecked) {
          extraPrice += mod.extraPrice;
          modifiers.push({ groupId: group.id, modifierId: mod.id });
          modifierLabels.push(mod.name);
        } else if (isDefault && isChecked && mod.extraPrice > 0) {
          extraPrice += mod.extraPrice;
        }
      }
      continue;
    }

    for (const modId of chosenIds) {
      const mod = group.modifiers.find((m) => m.id === modId);
      if (mod) {
        extraPrice += mod.extraPrice;
        modifiers.push({ groupId: group.id, modifierId: mod.id });
        modifierLabels.push(mod.name);
      }
    }
  }

  return { extraPrice, modifiers, modifierLabels };
}
