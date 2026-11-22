import { type Product } from '@fnb/shared';
import { describe, expect, it } from 'vitest';

import {
  buildInitialSelectedByGroup,
  computeOrderModifiersPayload,
  resolveSubstituteForUncheckedModifier,
} from '../modifier-selection';

const sampleSeafoodNoodle: Product = {
  id: 1,
  name: 'Mì cay hải sản',
  subtitle: 'Ngao, tôm, mực',
  categoryId: 10,
  categoryName: 'Mì Cay',
  price: 79000,
  station: 'BEP_NAU',
  isAvailable: true,
  sortOrder: 1,
  comboItems: [],
  modifierGroups: [
    {
      id: 1,
      name: 'Cấp độ cay',
      isRequired: true,
      maxSelect: 1,
      isAutoSelect: false,
      allowSubstitution: false,
      modifiers: [
        { id: 101, name: 'Cấp 1', extraPrice: 0, isDefaultChecked: false },
        { id: 102, name: 'Cấp 3', extraPrice: 0, isDefaultChecked: false },
      ],
    },
    {
      id: 2,
      name: 'Đồ ăn mặc định (0đ)',
      isRequired: false,
      maxSelect: 6,
      isAutoSelect: true,
      allowSubstitution: false,
      modifiers: [
        { id: 201, name: 'Tôm viên', extraPrice: 0, isDefaultChecked: true },
        { id: 202, name: 'Rau', extraPrice: 0, isDefaultChecked: true },
      ],
    },
    {
      id: 3,
      name: 'Đồ ăn chính của món',
      isRequired: false,
      maxSelect: 3,
      isAutoSelect: true,
      allowSubstitution: true,
      modifiers: [
        {
          id: 301,
          name: 'Tôm',
          extraPrice: 0,
          isDefaultChecked: true,
          defaultSubstituteName: 'Mực',
        },
        {
          id: 302,
          name: 'Ngao',
          extraPrice: 0,
          isDefaultChecked: true,
          defaultSubstituteName: 'Mực',
        },
        {
          id: 303,
          name: 'Mực',
          extraPrice: 0,
          isDefaultChecked: true,
          defaultSubstituteName: 'Tôm',
        },
      ],
    },
    {
      id: 4,
      name: 'Đồ ăn thêm',
      isRequired: false,
      maxSelect: 10,
      isAutoSelect: false,
      allowSubstitution: false,
      modifiers: [
        { id: 401, name: 'Bò Mỹ', extraPrice: 10000, isDefaultChecked: false },
      ],
    },
  ],
};

describe('modifier-selection engine', () => {
  it('auto-checks all default modifiers when opening a product', () => {
    const initial = buildInitialSelectedByGroup(sampleSeafoodNoodle);
    expect(initial[1]).toBeUndefined();
    expect(initial[2]).toEqual([201, 202]);
    expect(initial[3]).toEqual([301, 302, 303]);
  });

  it('resolves default substitute when 1 main ingredient is unchecked and locks to sole remaining when 2 are unchecked', () => {
    const mainGroup = sampleSeafoodNoodle.modifierGroups[2]!;
    const ngao = mainGroup.modifiers[1]!;
    const muc = mainGroup.modifiers[2]!;

    // Bỏ tích 1 món (Ngao) -> Thay thế mặc định bằng Mực
    const singleUncheck = resolveSubstituteForUncheckedModifier(
      mainGroup,
      ngao,
      [301, 303],
      {},
    );
    expect(singleUncheck.substituteName).toBe('Mực');
    expect(singleUncheck.availableSubstitutes.map((m) => m.name)).toEqual(['Tôm', 'Mực']);

    // Bỏ tích 2 món (Ngao và Mực) -> Tự động khoá thay thế bằng món còn lại duy nhất là Tôm
    const doubleUncheckNgao = resolveSubstituteForUncheckedModifier(
      mainGroup,
      ngao,
      [301],
      {},
    );
    const doubleUncheckMuc = resolveSubstituteForUncheckedModifier(
      mainGroup,
      muc,
      [301],
      {},
    );
    expect(doubleUncheckNgao.substituteName).toBe('Tôm');
    expect(doubleUncheckMuc.substituteName).toBe('Tôm');
  });

  it('computes exception-based payload for removed defaults, substituted main items, and extra toppings', () => {
    const payload = computeOrderModifiersPayload(sampleSeafoodNoodle, {
      1: [102], // Cấp 3
      2: [201], // Bỏ chọn Rau (202)
      3: [301], // Bỏ chọn Ngao (302) và Mực (303), chỉ giữ Tôm (301)
      4: [401], // Thêm Bò Mỹ (+10k)
    });

    expect(payload.extraPrice).toBe(10000);
    expect(payload.modifierLabels).toEqual([
      'Cấp 3',
      'Không Rau',
      'Không Ngao (Thay bằng Tôm)',
      'Không Mực (Thay bằng Tôm)',
      'Bò Mỹ',
    ]);
    expect(payload.modifiers).toEqual([
      { groupId: 1, modifierId: 102 },
      { groupId: 2, modifierId: 202, action: 'REMOVED_DEFAULT' },
      {
        groupId: 3,
        modifierId: 302,
        action: 'SUBSTITUTED',
        substituteModifierId: 301,
        substituteName: 'Tôm',
      },
      {
        groupId: 3,
        modifierId: 303,
        action: 'SUBSTITUTED',
        substituteModifierId: 301,
        substituteName: 'Tôm',
      },
      { groupId: 4, modifierId: 401 },
    ]);
  });

  it('skips out-of-stock (isAvailable: false) modifiers on auto-select and filters them out of substitute options', () => {
    const noodleWithUnavailableShrimp: Product = {
      ...sampleSeafoodNoodle,
      modifierGroups: sampleSeafoodNoodle.modifierGroups.map((group) =>
        group.id === 3
          ? {
              ...group,
              modifiers: group.modifiers.map((m) =>
                m.id === 301 ? { ...m, isAvailable: false } : m,
              ),
            }
          : group,
      ),
    };

    const initial = buildInitialSelectedByGroup(noodleWithUnavailableShrimp);
    expect(initial[3]).toEqual([302, 303]);

    const mainGroup = noodleWithUnavailableShrimp.modifierGroups[2]!;
    const shrimp = mainGroup.modifiers[0]!;
    const subForShrimp = resolveSubstituteForUncheckedModifier(
      mainGroup,
      shrimp,
      initial[3] ?? [],
      {},
    );
    expect(subForShrimp.availableSubstitutes.map((m) => m.name)).toEqual(['Ngao', 'Mực']);
    expect(subForShrimp.substituteName).toBe('Mực');
  });

  it('pre-selects radio defaults without printing default label or emitting REMOVED_DEFAULT when switched', () => {
    const drinkWithDefaults: Product = {
      id: 20,
      name: 'Trà Đào',
      subtitle: 'Hồng trà đào',
      categoryId: 14,
      categoryName: 'Trà Trái Cây',
      price: 25000,
      station: 'PHA_CHE',
      isAvailable: true,
      sortOrder: 1,
      comboItems: [],
      modifierGroups: [
        {
          id: 10,
          name: 'Độ ngọt (Đường)',
          isRequired: true,
          maxSelect: 1,
          isAutoSelect: false,
          allowSubstitution: false,
          modifiers: [
            { id: 1001, name: 'Mặc định', extraPrice: 0, isDefaultChecked: true },
            { id: 1002, name: 'Giảm ngọt', extraPrice: 0, isDefaultChecked: false },
            { id: 1003, name: 'Thêm ngọt', extraPrice: 0, isDefaultChecked: false },
          ],
        },
        {
          id: 11,
          name: 'Lượng đá',
          isRequired: true,
          maxSelect: 1,
          isAutoSelect: false,
          allowSubstitution: false,
          modifiers: [
            { id: 1101, name: 'Đá mặc định', extraPrice: 0, isDefaultChecked: true },
            { id: 1102, name: 'Ít đá', extraPrice: 0, isDefaultChecked: false },
          ],
        },
      ],
    };

    const initial = buildInitialSelectedByGroup(drinkWithDefaults);
    expect(initial[10]).toEqual([1001]);
    expect(initial[11]).toEqual([1101]);

    const defaultPayload = computeOrderModifiersPayload(drinkWithDefaults, initial);
    expect(defaultPayload.modifierLabels).toEqual([]);
    expect(defaultPayload.modifiers).toEqual([
      { groupId: 10, modifierId: 1001 },
      { groupId: 11, modifierId: 1101 },
    ]);

    const changedPayload = computeOrderModifiersPayload(drinkWithDefaults, {
      10: [1002],
      11: [1102],
    });
    expect(changedPayload.modifierLabels).toEqual(['Giảm ngọt', 'Ít đá']);
    expect(changedPayload.modifiers).toEqual([
      { groupId: 10, modifierId: 1002 },
      { groupId: 11, modifierId: 1102 },
    ]);
  });
});
