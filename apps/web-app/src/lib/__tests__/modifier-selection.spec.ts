import type { Product } from '@fnb/shared';
import { describe, expect, it } from 'vitest';

import {
  computeOrderModifiersPayload,
  getSubstitutionHintText,
  hydrateModifierSelectionFromExisting,
  inferModifierSelectionsFromLabels,
  isProductModifierSelectionValid,
  resolveSubstituteForUncheckedModifier,
} from '../modifier-selection';

const spicyComboNoodle: Product = {
  id: 1,
  name: 'Mì Cay Hải Sản',
  price: 55000,
  station: 'BEP_NAU',
  isAvailable: true,
  imageUrl: null,
  sortOrder: 1,
  comboItems: [],
  modifierGroups: [
    {
      id: 10,
      name: 'Cấp độ cay',
      isRequired: true,
      maxSelect: 1,
      modifiers: [
        { id: 101, name: 'Cấp 0', extraPrice: 0, isDefaultChecked: true, isAvailable: true },
        { id: 102, name: 'Cấp 3', extraPrice: 0, isDefaultChecked: false, isAvailable: true },
        { id: 103, name: 'Cấp 7 (Tạm hết)', extraPrice: 0, isDefaultChecked: false, isAvailable: false },
      ],
    },
    {
      id: 20,
      name: 'Topping',
      isRequired: false,
      maxSelect: 5,
      modifiers: [
        { id: 201, name: 'Thêm Bò Mỹ', extraPrice: 20000, isAvailable: true },
        { id: 202, name: 'Thêm Phô Mai', extraPrice: 10000, isAvailable: true },
        { id: 203, name: 'Trứng Cút (Tạm hết)', extraPrice: 5000, isAvailable: false },
      ],
    },
    {
      id: 30,
      name: 'Gia vị đi kèm',
      isRequired: false,
      maxSelect: 2,
      isAutoSelect: true,
      modifiers: [
        { id: 301, name: 'Hành lá', extraPrice: 0, isDefaultChecked: true, isAvailable: true },
        { id: 302, name: 'Nấm kim châm', extraPrice: 0, isDefaultChecked: true, isAvailable: true },
      ],
    },
    {
      id: 40,
      name: 'Loại mì',
      isRequired: true,
      maxSelect: 3,
      allowSubstitution: true,
      modifiers: [
        { id: 401, name: 'Mì Hàn Quốc', extraPrice: 0, defaultSubstituteName: 'Bún tươi', isAvailable: true },
        { id: 402, name: 'Bún tươi', extraPrice: 0, isAvailable: true },
        { id: 403, name: 'Miến dong', extraPrice: 0, isAvailable: true },
      ],
    },
  ],
};

describe('modifier-selection hydration & round-trip', () => {
  it('hydrates radio, checkbox, REMOVED_DEFAULT, and SUBSTITUTED selections back into editable state', () => {
    const initialSelections = [
      { groupId: 10, modifierId: 102 },
      { groupId: 20, modifierId: 201 },
      { groupId: 20, modifierId: 202 },
      { groupId: 30, modifierId: 301, action: 'REMOVED_DEFAULT' as const },
      {
        groupId: 40,
        modifierId: 401,
        action: 'SUBSTITUTED' as const,
        substituteModifierId: 403,
        substituteName: 'Miến dong',
      },
    ];

    const hydrated = hydrateModifierSelectionFromExisting(spicyComboNoodle, initialSelections);

    expect(hydrated.selectedByGroup[10]).toEqual([102]);
    expect(hydrated.selectedByGroup[20]).toEqual([201, 202]);
    // Hành lá (301) unchecked; Nấm kim châm (302) kept checked
    expect(hydrated.selectedByGroup[30]).toEqual([302]);
    // Mì Hàn Quốc (401) unchecked; remaining kept with manual substitute 403
    expect(hydrated.selectedByGroup[40]).toEqual([402, 403]);
    expect(hydrated.manualSubstituteByModifierId[401]).toBe(403);
    expect(isProductModifierSelectionValid(spicyComboNoodle, hydrated.selectedByGroup)).toBe(true);

    const recomputed = computeOrderModifiersPayload(
      spicyComboNoodle,
      hydrated.selectedByGroup,
      hydrated.manualSubstituteByModifierId,
    );
    expect(recomputed.extraPrice).toBe(30000);
    expect(recomputed.modifierLabels).toEqual([
      'Cấp 3',
      'Thêm Bò Mỹ',
      'Thêm Phô Mai',
      'Không Hành lá',
      'Không Mì Hàn Quốc (Thay bằng Miến dong)',
    ]);
  });

  it('gracefully drops deleted or out-of-stock modifiers and falls back to default valid radio', () => {
    const hydrated = hydrateModifierSelectionFromExisting(spicyComboNoodle, [
      { groupId: 10, modifierId: 103 }, // unavailable radio modifier
      { groupId: 20, modifierId: 203 }, // unavailable topping
      { groupId: 20, modifierId: 9999 }, // deleted modifier ID
    ]);

    expect(hydrated.selectedByGroup[10]).toEqual([101]);
    expect(hydrated.selectedByGroup[20]).toEqual([]);
    expect(isProductModifierSelectionValid(spicyComboNoodle, hydrated.selectedByGroup)).toBe(true);
  });

  it('reconstructs structured selections from legacy display labels via inferModifierSelectionsFromLabels', () => {
    const inferred = inferModifierSelectionsFromLabels(spicyComboNoodle, [
      'Cấp 3',
      'Thêm Phô Mai',
      'Không Nấm kim châm',
      'Không Mì Hàn Quốc (Thay bằng Bún tươi)',
    ]);

    expect(inferred).toEqual([
      { groupId: 10, modifierId: 102 },
      { groupId: 20, modifierId: 202 },
      { groupId: 30, modifierId: 302, action: 'REMOVED_DEFAULT' },
      {
        groupId: 40,
        modifierId: 401,
        action: 'SUBSTITUTED',
        substituteModifierId: 402,
        substituteName: 'Bún tươi',
      },
    ]);
  });

  it('respects allowedSubstituteNames matrix: REMOVED_DEFAULT for unswappable Ngao and filtered substitutes for Tôm', () => {
    const seafoodMatrixProduct: Product = {
      id: 2,
      name: 'Mì Cay Hải Sản Matrix',
      price: 69000,
      station: 'BEP_NAU',
      isAvailable: true,
      imageUrl: null,
      sortOrder: 1,
      comboItems: [],
      modifierGroups: [
        {
          id: 50,
          name: 'Đồ ăn món chính',
          isRequired: false,
          maxSelect: 3,
          isAutoSelect: true,
          allowSubstitution: true,
          modifiers: [
            {
              id: 501,
              name: 'Ngao',
              extraPrice: 0,
              isDefaultChecked: true,
              isAvailable: true,
              defaultSubstituteName: null,
              allowedSubstituteNames: [],
            },
            {
              id: 502,
              name: 'Tôm',
              extraPrice: 0,
              isDefaultChecked: true,
              isAvailable: true,
              defaultSubstituteName: 'Mực',
              allowedSubstituteNames: ['Mực'],
            },
            {
              id: 503,
              name: 'Mực',
              extraPrice: 0,
              isDefaultChecked: true,
              isAvailable: true,
              defaultSubstituteName: 'Tôm',
              allowedSubstituteNames: ['Tôm', 'Ngao'],
            },
          ],
        },
      ],
    };

    const group = seafoodMatrixProduct.modifierGroups[0]!;
    expect(getSubstitutionHintText(group, group.modifiers[0]!)).toBe(
      '(Bỏ tích → Không Ngao, không đổi món)',
    );
    expect(getSubstitutionHintText(group, group.modifiers[1]!)).toBe(
      '(Bỏ tích → Thay bằng Mực)',
    );

    // Uncheck Ngao -> must NOT substitute with Tôm/Mực; emits REMOVED_DEFAULT
    const ngaoSubInfo = resolveSubstituteForUncheckedModifier(group, group.modifiers[0]!, [502, 503], {});
    expect(ngaoSubInfo).toEqual({
      substituteModifier: null,
      substituteName: '',
      availableSubstitutes: [],
    });

    const tomSubInfo = resolveSubstituteForUncheckedModifier(group, group.modifiers[1]!, [501, 503], {});
    expect(tomSubInfo.availableSubstitutes.map((m) => m.name)).toEqual(['Mực']);

    // Unchecking both Ngao and Tôm (keeping Mực): Ngao -> REMOVED_DEFAULT, Tôm -> SUBSTITUTED(Mực)
    const payload = computeOrderModifiersPayload(seafoodMatrixProduct, { 50: [503] });
    expect(payload.modifiers).toEqual([
      { groupId: 50, modifierId: 501, action: 'REMOVED_DEFAULT' },
      {
        groupId: 50,
        modifierId: 502,
        action: 'SUBSTITUTED',
        substituteModifierId: 503,
        substituteName: 'Mực',
      },
    ]);
    expect(payload.modifierLabels).toEqual([
      'Không Ngao',
      'Không Tôm (Thay bằng Mực)',
    ]);

    // Round-trip hydration & label inference preserve REMOVED_DEFAULT + SUBSTITUTED
    const hydrated = hydrateModifierSelectionFromExisting(seafoodMatrixProduct, payload.modifiers);
    expect(hydrated.selectedByGroup[50]).toEqual([503]);
    expect(hydrated.manualSubstituteByModifierId[502]).toBe(503);

    expect(inferModifierSelectionsFromLabels(seafoodMatrixProduct, payload.modifierLabels)).toEqual(
      payload.modifiers,
    );

    // Empty chosenIds in allowSubstitution violates min-1 guard
    expect(isProductModifierSelectionValid(seafoodMatrixProduct, { 50: [] })).toBe(false);
  });
});
