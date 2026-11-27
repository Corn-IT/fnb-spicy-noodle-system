import {
  filterAllowedSubstituteModifiers,
  type Modifier,
  type ModifierGroup,
  type OrderItemModifierSelection,
  type Product,
} from '@fnb/shared';

export function buildInitialSelectedByGroup(product: Product): Record<number, number[]> {
  const initial: Record<number, number[]> = {};
  for (const group of product.modifierGroups) {
    const defaultIds = group.modifiers
      .filter(
        (m) =>
          m.isAvailable !== false &&
          Boolean(m.isDefaultChecked || group.isAutoSelect || group.allowSubstitution),
      )
      .map((m) => m.id);
    if (defaultIds.length > 0) {
      initial[group.id] =
        group.maxSelect === 1 && !group.isAutoSelect && !group.allowSubstitution
          ? [defaultIds[0]!]
          : defaultIds;
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
  const remainingChecked = group.modifiers.filter(
    (m) => m.isAvailable !== false && chosenIds.includes(m.id),
  );
  const allowedSubstitutes = filterAllowedSubstituteModifiers(mod, remainingChecked);
  if (allowedSubstitutes.length === 0) {
    return {
      substituteModifier: null,
      substituteName: '',
      availableSubstitutes: [],
    };
  }

  // Khi bỏ tích chọn sao cho chỉ còn 1 món thay thế hợp lệ, tự động khoá thay thế bằng món còn lại duy nhất
  if (allowedSubstitutes.length === 1) {
    const sole = allowedSubstitutes[0]!;
    return {
      substituteModifier: sole,
      substituteName: sole.name,
      availableSubstitutes: allowedSubstitutes,
    };
  }

  const manualSubId = manualSubstituteByModifierId[mod.id];
  if (manualSubId !== undefined) {
    const manualMatch = allowedSubstitutes.find((m) => m.id === manualSubId);
    if (manualMatch) {
      return {
        substituteModifier: manualMatch,
        substituteName: manualMatch.name,
        availableSubstitutes: allowedSubstitutes,
      };
    }
  }

  if (mod.defaultSubstituteName) {
    const normalizedDefault = mod.defaultSubstituteName.trim().toLowerCase();
    const defaultMatch = allowedSubstitutes.find(
      (m) => m.name.trim().toLowerCase() === normalizedDefault,
    );
    if (defaultMatch) {
      return {
        substituteModifier: defaultMatch,
        substituteName: defaultMatch.name,
        availableSubstitutes: allowedSubstitutes,
      };
    }
  }

  const fallback = allowedSubstitutes[0]!;
  return {
    substituteModifier: fallback,
    substituteName: fallback.name,
    availableSubstitutes: allowedSubstitutes,
  };
}

/**
 * Returns the UI hint shown beneath a checked modifier inside an `allowSubstitution` group.
 */
export function getSubstitutionHintText(
  group: ModifierGroup,
  mod: Modifier,
): string | null {
  if (!group.allowSubstitution || mod.isAvailable === false) {
    return null;
  }

  const allowedCandidates = filterAllowedSubstituteModifiers(mod, group.modifiers);

  if (Array.isArray(mod.allowedSubstituteNames)) {
    if (mod.allowedSubstituteNames.length === 0) {
      return `(Bỏ tích → Không ${mod.name}, không đổi món)`;
    }
    if (allowedCandidates.length === 0) {
      return `(Bỏ tích → Không ${mod.name}, món đổi tạm hết)`;
    }
  }

  if (mod.defaultSubstituteName) {
    const trimmedDefault = mod.defaultSubstituteName.trim();
    const matchedDefault = allowedCandidates.find(
      (candidate) => candidate.name.trim().toLowerCase() === trimmedDefault.toLowerCase(),
    );
    if (matchedDefault) {
      return `(Bỏ tích → Thay bằng ${matchedDefault.name})`;
    }
  }

  if (allowedCandidates.length > 0) {
    return `(Bỏ tích → Thay bằng ${allowedCandidates[0]!.name})`;
  }

  return null;
}

export function isProductModifierSelectionValid(
  product: Product,
  selectedByGroup: Record<number, number[]>,
): boolean {
  return product.modifierGroups.every((group) => {
    const chosenIds = selectedByGroup[group.id] ?? [];
    const hasAvailableModifiers = group.modifiers.some((m) => m.isAvailable !== false);
    if (group.allowSubstitution && hasAvailableModifiers) {
      return chosenIds.length >= 1;
    }
    const isCheckboxAutoGroup = Boolean(
      group.isAutoSelect || group.allowSubstitution,
    );
    if (!isCheckboxAutoGroup && group.isRequired && hasAvailableModifiers) {
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
    const isCheckboxAutoGroup = Boolean(
      group.isAutoSelect || group.allowSubstitution,
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
          if (substituteModifier || substituteName) {
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
          } else {
            modifiers.push({
              groupId: group.id,
              modifierId: mod.id,
              action: 'REMOVED_DEFAULT',
            });
            modifierLabels.push(`Không ${mod.name}`);
          }
        } else if (mod.extraPrice > 0) {
          extraPrice += mod.extraPrice;
        }
      }
      continue;
    }

    if (isCheckboxAutoGroup) {
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

    const isSizeGroup = /^size$/i.test(group.name.trim());
    for (const modId of chosenIds) {
      const mod = group.modifiers.find((m) => m.id === modId);
      if (mod) {
        extraPrice += mod.extraPrice;
        modifiers.push({ groupId: group.id, modifierId: mod.id });
        if (isSizeGroup || !(mod.isDefaultChecked && mod.extraPrice === 0)) {
          modifierLabels.push(mod.name);
        }
      }
    }
  }

  return { extraPrice, modifiers, modifierLabels };
}

/**
 * Reconstructs `selectedByGroup` and `manualSubstituteByModifierId` from existing order/draft
 * selections so `ProductOptionsDialog` opens pre-populated when editing an item.
 * Gracefully drops any previously chosen modifier IDs that were removed or marked out-of-stock.
 */
export function hydrateModifierSelectionFromExisting(
  product: Product,
  existingModifiers: readonly OrderItemModifierSelection[] = [],
): {
  selectedByGroup: Record<number, number[]>;
  manualSubstituteByModifierId: Record<number, number>;
} {
  const selectedByGroup = buildInitialSelectedByGroup(product);
  const manualSubstituteByModifierId: Record<number, number> = {};

  for (const group of product.modifierGroups) {
    const groupSelections = existingModifiers.filter((sel) => sel.groupId === group.id);
    const availableIds = new Set(
      group.modifiers.filter((m) => m.isAvailable !== false).map((m) => m.id),
    );
    const isCheckboxAutoGroup = Boolean(group.isAutoSelect || group.allowSubstitution);

    if (group.allowSubstitution) {
      const nextIds = new Set(selectedByGroup[group.id] ?? []);
      for (const sel of groupSelections) {
        if (sel.action === 'REMOVED_DEFAULT') {
          nextIds.delete(sel.modifierId);
        } else if (sel.action === 'SUBSTITUTED') {
          nextIds.delete(sel.modifierId);
          const sourceMod = group.modifiers.find((m) => m.id === sel.modifierId);
          const allowedIds = sourceMod
            ? new Set(
                filterAllowedSubstituteModifiers(sourceMod, group.modifiers).map(
                  (m) => m.id,
                ),
              )
            : availableIds;
          if (
            sel.substituteModifierId !== undefined &&
            availableIds.has(sel.substituteModifierId) &&
            allowedIds.has(sel.substituteModifierId)
          ) {
            manualSubstituteByModifierId[sel.modifierId] = sel.substituteModifierId;
          }
        }
      }
      selectedByGroup[group.id] = group.modifiers
        .filter((m) => nextIds.has(m.id) && availableIds.has(m.id))
        .map((m) => m.id);
      continue;
    }

    if (isCheckboxAutoGroup) {
      const nextIds = new Set(selectedByGroup[group.id] ?? []);
      for (const sel of groupSelections) {
        if (sel.action === 'REMOVED_DEFAULT') {
          nextIds.delete(sel.modifierId);
        } else if (availableIds.has(sel.modifierId)) {
          nextIds.add(sel.modifierId);
        }
      }
      selectedByGroup[group.id] = group.modifiers
        .filter((m) => nextIds.has(m.id) && availableIds.has(m.id))
        .map((m) => m.id);
      continue;
    }

    if (groupSelections.length > 0) {
      const validChosen = groupSelections
        .filter((sel) => (!sel.action || sel.action === 'SELECTED') && availableIds.has(sel.modifierId))
        .map((sel) => sel.modifierId);
      const uniqueValid = [...new Set(validChosen)];
      if (uniqueValid.length > 0) {
        selectedByGroup[group.id] =
          group.maxSelect === 1
            ? uniqueValid.slice(0, 1)
            : uniqueValid.slice(0, Math.max(1, group.maxSelect));
      } else if (!group.isRequired) {
        selectedByGroup[group.id] = [];
      }
    }
  }

  return { selectedByGroup, manualSubstituteByModifierId };
}

/**
 * Fallback resolver when only display modifier labels (`string[]`) are available without
 * structured `modifierSelections` (e.g., simplified test fixtures).
 */
export function inferModifierSelectionsFromLabels(
  product: Product,
  labels: readonly string[],
): OrderItemModifierSelection[] {
  const inferred: OrderItemModifierSelection[] = [];
  const labelSet = new Set(labels.map((l) => l.trim().toLowerCase()));

  for (const group of product.modifierGroups) {
    if (group.allowSubstitution) {
      for (const mod of group.modifiers) {
        const prefix = `không ${mod.name.trim().toLowerCase()}`;
        const matched = labels.find((l) => l.trim().toLowerCase().startsWith(prefix));
        if (matched) {
          const subMatch = /\(thay bằng\s+(.+)\)$/i.exec(matched);
          const subName = subMatch?.[1]?.trim();
          if (subName) {
            const subMod = group.modifiers.find(
              (m) => m.name.trim().toLowerCase() === subName.toLowerCase(),
            );
            inferred.push({
              groupId: group.id,
              modifierId: mod.id,
              action: 'SUBSTITUTED',
              ...(subMod ? { substituteModifierId: subMod.id } : {}),
              substituteName: subName,
            });
          } else {
            inferred.push({
              groupId: group.id,
              modifierId: mod.id,
              action: 'REMOVED_DEFAULT',
            });
          }
        }
      }
      continue;
    }

    if (group.isAutoSelect) {
      for (const mod of group.modifiers) {
        const isDefault = Boolean(mod.isDefaultChecked || group.isAutoSelect);
        if (isDefault && labelSet.has(`không ${mod.name.trim().toLowerCase()}`)) {
          inferred.push({
            groupId: group.id,
            modifierId: mod.id,
            action: 'REMOVED_DEFAULT',
          });
        } else if (!isDefault && labelSet.has(mod.name.trim().toLowerCase())) {
          inferred.push({ groupId: group.id, modifierId: mod.id });
        }
      }
      continue;
    }

    for (const mod of group.modifiers) {
      if (labelSet.has(mod.name.trim().toLowerCase())) {
        inferred.push({ groupId: group.id, modifierId: mod.id });
      }
    }
  }

  return inferred;
}
