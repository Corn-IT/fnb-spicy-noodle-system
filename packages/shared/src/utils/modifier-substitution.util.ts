export interface SubstitutableModifierLike {
  id: number;
  name: string;
  isAvailable?: boolean;
  defaultSubstituteName?: string | null;
  allowedSubstituteNames?: readonly string[] | null;
}

export interface EditableSubstitutionModifierLike {
  name: string;
  defaultSubstituteName?: string | null;
  allowedSubstituteNames?: readonly string[] | null;
}

export type SubstitutionModifierChange =
  | { type: 'rename'; oldName: string; newName: string }
  | { type: 'remove'; removedName: string };

/**
 * Normalizes a nullable list of allowed substitute modifier names:
 * preserves `null`/`undefined` as `null` (legacy unconfigured state),
 * trims entries, strips empty strings and optional self-name, and deduplicates.
 */
export function normalizeSubstituteNameList(
  names: readonly string[] | null | undefined,
  excludeName?: string,
): string[] | null {
  if (names == null) return null;
  const normalizedExclude = excludeName?.trim();
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (normalizedExclude && trimmed === normalizedExclude) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

/**
 * Parses a persisted JSON value (`Prisma.JsonValue`) into `string[] | null`.
 */
export function parseAllowedSubstituteNamesFromJson(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed) normalized.push(trimmed);
  }
  return normalized;
}

/**
 * Returns whether `targetName` is permitted as a substitute for `sourceModifier`.
 * Legacy `allowedSubstituteNames == null` preserves backward compatibility (allows any sibling).
 * Explicit `[]` forbids all substitutions.
 */
export function isSubstituteTargetAllowed(
  sourceModifier: Pick<EditableSubstitutionModifierLike, 'name' | 'allowedSubstituteNames'>,
  targetName: string,
): boolean {
  const trimmedTarget = targetName.trim();
  if (!trimmedTarget) return false;
  if (trimmedTarget === sourceModifier.name.trim()) return false;
  if (sourceModifier.allowedSubstituteNames == null) return true;
  return sourceModifier.allowedSubstituteNames.some(
    (allowed) => allowed.trim() === trimmedTarget,
  );
}

/**
 * Filters candidate substitute modifiers to available non-self targets allowed by the matrix.
 */
export function filterAllowedSubstituteModifiers<
  T extends Pick<SubstitutableModifierLike, 'id' | 'name' | 'isAvailable'>,
>(
  sourceModifier: Pick<
    SubstitutableModifierLike,
    'id' | 'name' | 'allowedSubstituteNames'
  >,
  candidates: readonly T[],
): T[] {
  return candidates.filter(
    (candidate) =>
      candidate.id !== sourceModifier.id &&
      candidate.isAvailable !== false &&
      isSubstituteTargetAllowed(sourceModifier, candidate.name),
  );
}

/**
 * Validates `allowSubstitution` modifier rules inside a single modifier group.
 * Returns a localized error string when invalid, or `null` when valid.
 */
export function validateGroupSubstitutionRules(group: {
  allowSubstitution?: boolean;
  modifiers: readonly EditableSubstitutionModifierLike[];
}): string | null {
  if (!group.allowSubstitution) return null;

  const siblingNames = new Set(
    group.modifiers.map((modifier) => modifier.name.trim()).filter(Boolean),
  );

  for (const modifier of group.modifiers) {
    const modName = modifier.name.trim();
    const allowedList = modifier.allowedSubstituteNames;

    if (Array.isArray(allowedList)) {
      for (const rawTarget of allowedList) {
        const target = rawTarget.trim();
        if (!target) {
          return `Tên món thay thế cho "${modName}" không được để trống`;
        }
        if (target === modName) {
          return `Món "${modName}" không thể tự thay thế bằng chính nó`;
        }
        if (!siblingNames.has(target)) {
          return `Món thay thế "${target}" của "${modName}" không tồn tại trong nhóm`;
        }
      }
    }

    const defaultSub = modifier.defaultSubstituteName?.trim() ?? '';
    if (defaultSub) {
      if (defaultSub === modName) {
        return `Món thay thế mặc định của "${modName}" không thể là chính nó`;
      }
      if (!siblingNames.has(defaultSub)) {
        return `Món thay thế mặc định "${defaultSub}" của "${modName}" không tồn tại trong nhóm`;
      }
      if (
        Array.isArray(allowedList) &&
        !allowedList.some((allowed) => allowed.trim() === defaultSub)
      ) {
        return `Món thay thế mặc định "${defaultSub}" của "${modName}" chưa được chọn trong cột Đổi món`;
      }
    }
  }

  return null;
}

/**
 * Keeps sibling `allowedSubstituteNames` and `defaultSubstituteName` consistent when
 * a modifier inside the same group is renamed or removed.
 */
export function syncSubstitutionRulesOnModifierChange<
  T extends EditableSubstitutionModifierLike,
>(modifiers: readonly T[], change: SubstitutionModifierChange): T[] {
  if (change.type === 'rename') {
    const oldTrimmed = change.oldName.trim();
    const newTrimmed = change.newName.trim();
    if (!oldTrimmed || oldTrimmed === newTrimmed) {
      return [...modifiers];
    }

    return modifiers.map((modifier) => {
      const nextAllowed = Array.isArray(modifier.allowedSubstituteNames)
        ? normalizeSubstituteNameList(
            modifier.allowedSubstituteNames
              .map((entry) => (entry.trim() === oldTrimmed ? newTrimmed : entry))
              .filter(Boolean),
            modifier.name,
          )
        : modifier.allowedSubstituteNames;

      const currentDefault = modifier.defaultSubstituteName?.trim() ?? '';
      const nextDefault =
        currentDefault === oldTrimmed
          ? newTrimmed || ''
          : modifier.defaultSubstituteName;

      if (
        nextAllowed === modifier.allowedSubstituteNames &&
        nextDefault === modifier.defaultSubstituteName
      ) {
        return modifier;
      }

      return {
        ...modifier,
        allowedSubstituteNames: nextAllowed,
        defaultSubstituteName: nextDefault,
      };
    });
  }

  const removedTrimmed = change.removedName.trim();
  if (!removedTrimmed) {
    return [...modifiers];
  }

  return modifiers.map((modifier) => {
    const nextAllowed = Array.isArray(modifier.allowedSubstituteNames)
      ? normalizeSubstituteNameList(
          modifier.allowedSubstituteNames.filter(
            (entry) => entry.trim() !== removedTrimmed,
          ),
          modifier.name,
        )
      : modifier.allowedSubstituteNames;

    const currentDefault = modifier.defaultSubstituteName?.trim() ?? '';
    let nextDefault = modifier.defaultSubstituteName;

    if (currentDefault === removedTrimmed) {
      if (Array.isArray(nextAllowed)) {
        nextDefault = nextAllowed[0] ?? '';
      } else {
        const firstOther = modifiers.find(
          (candidate) => candidate.name.trim() && candidate.name.trim() !== modifier.name.trim(),
        );
        nextDefault = firstOther?.name.trim() ?? '';
      }
    }

    if (
      nextAllowed === modifier.allowedSubstituteNames &&
      nextDefault === modifier.defaultSubstituteName
    ) {
      return modifier;
    }

    return {
      ...modifier,
      allowedSubstituteNames: nextAllowed,
      defaultSubstituteName: nextDefault,
    };
  });
}
