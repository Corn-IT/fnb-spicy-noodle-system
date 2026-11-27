import { describe, expect, it } from 'vitest';

import {
  filterAllowedSubstituteModifiers,
  isSubstituteTargetAllowed,
  normalizeSubstituteNameList,
  syncSubstitutionRulesOnModifierChange,
  validateGroupSubstitutionRules,
} from '../utils/modifier-substitution.util';

describe('modifier-substitution.util', () => {
  it('distinguishes legacy null/undefined from explicit arrays when normalizing', () => {
    expect(normalizeSubstituteNameList(null, 'Ngao')).toBeNull();
    expect(normalizeSubstituteNameList(undefined, 'Ngao')).toBeNull();
    expect(normalizeSubstituteNameList([], 'Ngao')).toEqual([]);
    expect(
      normalizeSubstituteNameList(['  Mực ', 'Tôm', 'Ngao', 'Mực', '  '], 'Ngao'),
    ).toEqual(['Mực', 'Tôm']);
  });

  it('checks substitute target permission against null (legacy) vs explicit allowlist', () => {
    expect(isSubstituteTargetAllowed({ name: 'Tôm', allowedSubstituteNames: null }, 'Mực')).toBe(true);
    expect(isSubstituteTargetAllowed({ name: 'Tôm', allowedSubstituteNames: null }, 'Tôm')).toBe(false);
    expect(isSubstituteTargetAllowed({ name: 'Ngao', allowedSubstituteNames: [] }, 'Tôm')).toBe(false);
    expect(isSubstituteTargetAllowed({ name: 'Tôm', allowedSubstituteNames: ['Mực'] }, 'Mực')).toBe(true);
    expect(isSubstituteTargetAllowed({ name: 'Tôm', allowedSubstituteNames: ['Mực'] }, 'Ngao')).toBe(false);
  });

  it('filters allowed available candidate modifiers accurately', () => {
    const modifiers = [
      { id: 1, name: 'Ngao', isAvailable: true, allowedSubstituteNames: [] as string[] },
      { id: 2, name: 'Tôm', isAvailable: true, allowedSubstituteNames: ['Mực', 'Sườn'] },
      { id: 3, name: 'Mực', isAvailable: true, allowedSubstituteNames: ['Tôm'] },
      { id: 4, name: 'Sườn', isAvailable: false, allowedSubstituteNames: ['Tôm', 'Mực'] },
    ];

    expect(filterAllowedSubstituteModifiers(modifiers[0]!, modifiers)).toEqual([]);
    expect(filterAllowedSubstituteModifiers(modifiers[1]!, modifiers).map((m) => m.name)).toEqual([
      'Mực',
    ]);
    expect(filterAllowedSubstituteModifiers(modifiers[2]!, modifiers).map((m) => m.name)).toEqual([
      'Tôm',
    ]);
  });

  it('validates group substitution rules and rejects invalid targets or defaults', () => {
    expect(
      validateGroupSubstitutionRules({
        allowSubstitution: true,
        modifiers: [
          { name: 'Ngao', allowedSubstituteNames: [], defaultSubstituteName: '' },
          { name: 'Tôm', allowedSubstituteNames: ['Mực'], defaultSubstituteName: 'Mực' },
          { name: 'Mực', allowedSubstituteNames: ['Tôm'], defaultSubstituteName: 'Tôm' },
        ],
      }),
    ).toBeNull();

    expect(
      validateGroupSubstitutionRules({
        allowSubstitution: true,
        modifiers: [
          { name: 'Tôm', allowedSubstituteNames: ['Tôm'], defaultSubstituteName: 'Mực' },
          { name: 'Mực', allowedSubstituteNames: ['Tôm'], defaultSubstituteName: 'Tôm' },
        ],
      }),
    ).toContain('tự thay thế');

    expect(
      validateGroupSubstitutionRules({
        allowSubstitution: true,
        modifiers: [
          { name: 'Ngao', allowedSubstituteNames: [], defaultSubstituteName: 'Tôm' },
          { name: 'Tôm', allowedSubstituteNames: ['Mực'], defaultSubstituteName: 'Mực' },
          { name: 'Mực', allowedSubstituteNames: ['Tôm'], defaultSubstituteName: 'Tôm' },
        ],
      }),
    ).toContain('chưa được chọn');
  });

  it('synchronizes sibling allowedSubstituteNames and defaultSubstituteName on rename and remove', () => {
    const initial = [
      { name: 'Ngao', allowedSubstituteNames: [] as string[], defaultSubstituteName: '' },
      { name: 'Tôm', allowedSubstituteNames: ['Mực'], defaultSubstituteName: 'Mực' },
      { name: 'Mực', allowedSubstituteNames: ['Tôm', 'Ngao'], defaultSubstituteName: 'Tôm' },
    ];

    const renamed = syncSubstitutionRulesOnModifierChange(initial, {
      type: 'rename',
      oldName: 'Mực',
      newName: 'Mực Ống',
    });
    expect(renamed[1]).toEqual({
      name: 'Tôm',
      allowedSubstituteNames: ['Mực Ống'],
      defaultSubstituteName: 'Mực Ống',
    });

    const withoutTom = syncSubstitutionRulesOnModifierChange(initial.filter((m) => m.name !== 'Tôm'), {
      type: 'remove',
      removedName: 'Tôm',
    });
    expect(withoutTom[1]).toEqual({
      name: 'Mực',
      allowedSubstituteNames: ['Ngao'],
      defaultSubstituteName: 'Ngao',
    });
  });
});
