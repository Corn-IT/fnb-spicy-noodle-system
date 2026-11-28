import {
  DEFAULT_DRINK_SIZE_MODIFIER_GROUP,
  normalizeSubstituteNameList,
  syncSubstitutionRulesOnModifierChange,
  type Product,
} from '@fnb/shared';

export interface EditableModifier {
  name: string;
  extraPrice: number | '';
  isDefaultChecked: boolean;
  isAvailable: boolean;
  defaultSubstituteName: string;
  allowedSubstituteNames: string[] | null;
}

export interface EditableModifierGroup {
  name: string;
  isRequired: boolean;
  maxSelect: number;
  isAutoSelect: boolean;
  allowSubstitution: boolean;
  modifiers: EditableModifier[];
}

export interface EditableComboItem {
  productId: number;
  quantity: number;
}

/** Maps persisted product modifier groups into drawer form state with sanitized substitution rules. */
export function hydrateEditableModifierGroups(
  modifierGroups: Product['modifierGroups'],
): EditableModifierGroup[] {
  return modifierGroups.map((g) => {
    const allowSubstitution = g.allowSubstitution ?? false;
    const siblingNames = g.modifiers.map((item) => item.name.trim()).filter(Boolean);
    return {
      name: g.name,
      isRequired: g.isRequired,
      maxSelect: g.maxSelect,
      isAutoSelect: g.isAutoSelect ?? false,
      allowSubstitution,
      modifiers: g.modifiers.map((m) => {
        const modName = m.name.trim();
        const fallbackLegacyAllowed = siblingNames.filter((candidate) => candidate !== modName);
        const allowedSubstituteNames = allowSubstitution
          ? Array.isArray(m.allowedSubstituteNames)
            ? (normalizeSubstituteNameList(m.allowedSubstituteNames, modName) ?? [])
            : fallbackLegacyAllowed
          : null;
        const rawDefault = m.defaultSubstituteName?.trim() ?? '';
        const defaultSubstituteName =
          allowSubstitution && allowedSubstituteNames
            ? allowedSubstituteNames.includes(rawDefault)
              ? rawDefault
              : (allowedSubstituteNames[0] ?? '')
            : '';

        return {
          name: m.name,
          extraPrice: m.extraPrice,
          isDefaultChecked: m.isDefaultChecked ?? false,
          isAvailable: m.isAvailable ?? true,
          defaultSubstituteName,
          allowedSubstituteNames,
        };
      }),
    };
  });
}

export function buildSizePresetGroup(): EditableModifierGroup {
  return {
    name: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.name,
    isRequired: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.isRequired,
    maxSelect: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.maxSelect,
    isAutoSelect: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.isAutoSelect,
    allowSubstitution: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.allowSubstitution,
    modifiers: DEFAULT_DRINK_SIZE_MODIFIER_GROUP.modifiers.map((m) => ({
      name: m.name,
      extraPrice: m.extraPrice,
      isDefaultChecked: m.isDefaultChecked,
      isAvailable: m.isAvailable,
      defaultSubstituteName: m.defaultSubstituteName ?? '',
      allowedSubstituteNames: null,
    })),
  };
}

export function buildSpicePresetGroup(): EditableModifierGroup {
  return {
    name: 'Cấp độ cay',
    isRequired: true,
    maxSelect: 1,
    isAutoSelect: false,
    allowSubstitution: false,
    modifiers: Array.from({ length: 8 }, (_, i) => ({
      name: `Cấp ${i}`,
      extraPrice: 0,
      isDefaultChecked: false,
      isAvailable: true,
      defaultSubstituteName: '',
      allowedSubstituteNames: null,
    })),
  };
}

export function buildDefaultGarnishPresetGroup(): EditableModifierGroup {
  return {
    name: 'Đồ ăn mặc định (0đ)',
    isRequired: false,
    maxSelect: 6,
    isAutoSelect: true,
    allowSubstitution: false,
    modifiers: ['Tôm viên', 'Xúc xích', 'Ngô', 'Rau', 'Nấm kim châm', 'Kim chi'].map((item) => ({
      name: item,
      extraPrice: 0,
      isDefaultChecked: true,
      isAvailable: true,
      defaultSubstituteName: '',
      allowedSubstituteNames: null,
    })),
  };
}

export function buildMainIngredientSubstitutionPresetGroup(): EditableModifierGroup {
  return {
    name: 'Đồ ăn chính của món',
    isRequired: false,
    maxSelect: 3,
    isAutoSelect: true,
    allowSubstitution: true,
    modifiers: [
      {
        name: 'Ngao',
        extraPrice: 0,
        isDefaultChecked: true,
        isAvailable: true,
        defaultSubstituteName: '',
        allowedSubstituteNames: [],
      },
      {
        name: 'Tôm',
        extraPrice: 0,
        isDefaultChecked: true,
        isAvailable: true,
        defaultSubstituteName: 'Mực',
        allowedSubstituteNames: ['Mực', 'Ngao'],
      },
      {
        name: 'Mực',
        extraPrice: 0,
        isDefaultChecked: true,
        isAvailable: true,
        defaultSubstituteName: 'Tôm',
        allowedSubstituteNames: ['Tôm', 'Ngao'],
      },
    ],
  };
}

export function buildExtraToppingPresetGroup(): EditableModifierGroup {
  return {
    name: 'Đồ ăn thêm',
    isRequired: false,
    maxSelect: 10,
    isAutoSelect: false,
    allowSubstitution: false,
    modifiers: [
      { name: 'Xúc xích', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
      { name: 'Tôm viên', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
      { name: 'Đậu hũ', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
      { name: 'Bò Mỹ', extraPrice: 10000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
      { name: 'Sườn sụn', extraPrice: 10000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
      { name: 'Ngao', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
      { name: 'Tôm', extraPrice: 10000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
      { name: 'Mực', extraPrice: 10000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
      { name: 'Kim chi', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
      { name: 'Nấm kim châm', extraPrice: 5000, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
    ],
  };
}

export function buildBlankModifierGroup(): EditableModifierGroup {
  return {
    name: '',
    isRequired: false,
    maxSelect: 1,
    isAutoSelect: false,
    allowSubstitution: false,
    modifiers: [
      { name: '', extraPrice: 0, isDefaultChecked: false, isAvailable: true, defaultSubstituteName: '', allowedSubstituteNames: null },
    ],
  };
}

export function applyGroupPatch(
  group: EditableModifierGroup,
  patch: Partial<EditableModifierGroup>,
): EditableModifierGroup {
  const updated = { ...group, ...patch };
  if (patch.isAutoSelect !== undefined) {
    updated.modifiers = updated.modifiers.map((m) => ({
      ...m,
      isDefaultChecked: Boolean(patch.isAutoSelect),
    }));
    if (patch.isAutoSelect && updated.maxSelect < updated.modifiers.length) {
      updated.maxSelect = Math.max(updated.modifiers.length, 1);
    }
  }
  if (patch.allowSubstitution === true) {
    updated.isAutoSelect = true;
    const siblingNames = updated.modifiers.map((item) => item.name.trim()).filter(Boolean);
    updated.modifiers = updated.modifiers.map((m) => {
      const modName = m.name.trim();
      const existingAllowed = Array.isArray(m.allowedSubstituteNames)
        ? (normalizeSubstituteNameList(m.allowedSubstituteNames, modName) ?? [])
        : siblingNames.filter((candidate) => candidate !== modName);
      const currentDefault = m.defaultSubstituteName.trim();
      const nextDefault = existingAllowed.includes(currentDefault)
        ? currentDefault
        : (existingAllowed[0] ?? '');
      return {
        ...m,
        isDefaultChecked: true,
        allowedSubstituteNames: existingAllowed,
        defaultSubstituteName: nextDefault,
      };
    });
    updated.maxSelect = Math.max(updated.modifiers.length, 1);
  } else if (patch.allowSubstitution === false) {
    updated.modifiers = updated.modifiers.map((m) => ({
      ...m,
      allowedSubstituteNames: null,
      defaultSubstituteName: '',
    }));
  }
  return updated;
}

export function appendBlankModifier(group: EditableModifierGroup): EditableModifierGroup {
  const nextModifiers: EditableModifier[] = [
    ...group.modifiers,
    {
      name: '',
      extraPrice: 0,
      isDefaultChecked: group.isAutoSelect,
      isAvailable: true,
      defaultSubstituteName: '',
      allowedSubstituteNames: group.allowSubstitution ? [] : null,
    },
  ];
  return {
    ...group,
    maxSelect: group.isAutoSelect ? Math.max(group.maxSelect, nextModifiers.length) : group.maxSelect,
    modifiers: nextModifiers,
  };
}

export function applyModifierPatch(
  group: EditableModifierGroup,
  modIdx: number,
  patch: Partial<EditableModifier>,
): EditableModifierGroup {
  const prevMod = group.modifiers[modIdx];
  const nextModifiers = group.modifiers.map((m, mIdx) => {
    if (mIdx !== modIdx) return m;
    const nextRow = { ...m, ...patch };
    if (patch.name !== undefined && Array.isArray(nextRow.allowedSubstituteNames)) {
      nextRow.allowedSubstituteNames =
        normalizeSubstituteNameList(nextRow.allowedSubstituteNames, patch.name) ?? [];
      if (
        nextRow.defaultSubstituteName.trim() &&
        !nextRow.allowedSubstituteNames.includes(nextRow.defaultSubstituteName.trim())
      ) {
        nextRow.defaultSubstituteName = nextRow.allowedSubstituteNames[0] ?? '';
      }
    }
    return nextRow;
  });

  const syncedModifiers =
    group.allowSubstitution && patch.name !== undefined && prevMod
      ? syncSubstitutionRulesOnModifierChange(nextModifiers, {
          type: 'rename',
          oldName: prevMod.name,
          newName: patch.name,
        }).map((m) => ({
          ...m,
          defaultSubstituteName: m.defaultSubstituteName ?? '',
          allowedSubstituteNames: m.allowedSubstituteNames ?? null,
        }))
      : nextModifiers;

  return {
    ...group,
    modifiers: syncedModifiers,
  };
}

export function applyToggleAllowedSubstitute(
  group: EditableModifierGroup,
  modIdx: number,
  targetName: string,
  checked: boolean,
): EditableModifierGroup {
  return {
    ...group,
    modifiers: group.modifiers.map((m, mIdx) => {
      if (mIdx !== modIdx) return m;
      const modName = m.name.trim();
      const siblingNames = group.modifiers
        .map((other) => other.name.trim())
        .filter((nameVal) => nameVal && nameVal !== modName);
      const currentAllowed = Array.isArray(m.allowedSubstituteNames)
        ? m.allowedSubstituteNames
        : siblingNames;
      const rawNext = checked
        ? [...currentAllowed, targetName]
        : currentAllowed.filter((entry) => entry.trim() !== targetName);
      const nextAllowed = normalizeSubstituteNameList(rawNext, modName) ?? [];
      const currentDefault = m.defaultSubstituteName.trim();
      const nextDefault = nextAllowed.includes(currentDefault)
        ? currentDefault
        : (nextAllowed[0] ?? '');

      return {
        ...m,
        allowedSubstituteNames: nextAllowed,
        defaultSubstituteName: nextDefault,
      };
    }),
  };
}

export function applyRemoveModifier(
  group: EditableModifierGroup,
  modIdx: number,
): EditableModifierGroup {
  const removedMod = group.modifiers[modIdx];
  const filtered = group.modifiers.filter((_, mIdx) => mIdx !== modIdx);
  const syncedModifiers =
    group.allowSubstitution && removedMod
      ? syncSubstitutionRulesOnModifierChange(filtered, {
          type: 'remove',
          removedName: removedMod.name,
        }).map((m) => ({
          ...m,
          defaultSubstituteName: m.defaultSubstituteName ?? '',
          allowedSubstituteNames: m.allowedSubstituteNames ?? null,
        }))
      : filtered;

  return {
    ...group,
    modifiers: syncedModifiers,
  };
}
