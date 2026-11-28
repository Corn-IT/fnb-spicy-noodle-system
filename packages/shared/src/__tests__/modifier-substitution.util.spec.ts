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

  it('parses persisted allowedSubstituteNames JSON safely', async () => {
    const { parseAllowedSubstituteNamesFromJson } = await import(
      '../utils/modifier-substitution.util'
    );

    expect(parseAllowedSubstituteNamesFromJson(null)).toBeNull();
    expect(parseAllowedSubstituteNamesFromJson('Tôm')).toBeNull();
    expect(parseAllowedSubstituteNamesFromJson([' Mực ', 42, '', '  ', 'Ngao'])).toEqual([
      'Mực',
      'Ngao',
    ]);
  });

  it('covers all validation error branches in validateGroupSubstitutionRules', () => {
    expect(
      validateGroupSubstitutionRules({
        allowSubstitution: false,
        modifiers: [{ name: 'Tôm', allowedSubstituteNames: ['Tôm'], defaultSubstituteName: 'Tôm' }],
      }),
    ).toBeNull();

    expect(
      validateGroupSubstitutionRules({
        allowSubstitution: true,
        modifiers: [{ name: 'Tôm', allowedSubstituteNames: ['   '], defaultSubstituteName: '' }],
      }),
    ).toContain('không được để trống');

    expect(
      validateGroupSubstitutionRules({
        allowSubstitution: true,
        modifiers: [{ name: 'Tôm', allowedSubstituteNames: ['Bạch Tuộc'], defaultSubstituteName: '' }],
      }),
    ).toContain('không tồn tại trong nhóm');

    expect(
      validateGroupSubstitutionRules({
        allowSubstitution: true,
        modifiers: [{ name: 'Tôm', allowedSubstituteNames: [], defaultSubstituteName: 'Tôm' }],
      }),
    ).toContain('không thể là chính nó');

    expect(
      validateGroupSubstitutionRules({
        allowSubstitution: true,
        modifiers: [{ name: 'Tôm', allowedSubstituteNames: null, defaultSubstituteName: 'Ghẹ' }],
      }),
    ).toContain('không tồn tại trong nhóm');
  });

  it('handles no-op, unchanged, and legacy null fallback branches in syncSubstitutionRulesOnModifierChange', () => {
    const legacyList = [
      { name: 'Ngao', allowedSubstituteNames: null, defaultSubstituteName: 'Tôm' },
      { name: 'Mực', allowedSubstituteNames: ['Ngao'], defaultSubstituteName: 'Ngao' },
      { name: 'Sò', allowedSubstituteNames: null, defaultSubstituteName: '' },
    ];

    expect(
      syncSubstitutionRulesOnModifierChange(legacyList, {
        type: 'rename',
        oldName: ' ',
        newName: 'Sò Điệp',
      }),
    ).toEqual(legacyList);

    expect(
      syncSubstitutionRulesOnModifierChange(legacyList, {
        type: 'rename',
        oldName: 'Tôm',
        newName: 'Tôm',
      }),
    ).toEqual(legacyList);

    const renamed = syncSubstitutionRulesOnModifierChange(legacyList, {
      type: 'rename',
      oldName: 'Tôm',
      newName: 'Tôm Sú',
    });
    expect(renamed[0]).toMatchObject({ allowedSubstituteNames: null, defaultSubstituteName: 'Tôm Sú' });
    expect(renamed[1]).toStrictEqual(legacyList[1]);
    expect(renamed[2]).toBe(legacyList[2]);

    expect(
      syncSubstitutionRulesOnModifierChange(legacyList, {
        type: 'remove',
        removedName: '  ',
      }),
    ).toEqual(legacyList);

    const afterRemove = syncSubstitutionRulesOnModifierChange(legacyList, {
      type: 'remove',
      removedName: 'Tôm',
    });
    expect(afterRemove[0]?.defaultSubstituteName).toBe('Mực');
    expect(afterRemove[1]).toStrictEqual(legacyList[1]);
    expect(afterRemove[2]).toBe(legacyList[2]);

    const clearedDefault = syncSubstitutionRulesOnModifierChange(
      [{ name: 'Ngao', allowedSubstituteNames: ['Tôm'], defaultSubstituteName: 'Tôm' }],
      { type: 'remove', removedName: 'Tôm' },
    );
    expect(clearedDefault[0]).toEqual({
      name: 'Ngao',
      allowedSubstituteNames: [],
      defaultSubstituteName: '',
    });
  });
});
