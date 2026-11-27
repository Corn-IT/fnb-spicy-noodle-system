import type { Product } from '@fnb/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModifierSelectorSheet } from '../components/modifier-selector-sheet';

const qrSeafoodProduct: Product = {
  id: 1,
  name: 'Mì Cay Hải Sản',
  price: 69000,
  station: 'BEP_NAU',
  isAvailable: true,
  imageUrl: null,
  sortOrder: 1,
  comboItems: [],
  modifierGroups: [
    {
      id: 30,
      name: 'Đồ ăn món chính',
      isRequired: false,
      maxSelect: 3,
      isAutoSelect: true,
      allowSubstitution: true,
      modifiers: [
        {
          id: 301,
          name: 'Ngao',
          extraPrice: 0,
          isDefaultChecked: true,
          isAvailable: true,
          defaultSubstituteName: null,
          allowedSubstituteNames: [],
        },
        {
          id: 302,
          name: 'Tôm',
          extraPrice: 0,
          isDefaultChecked: true,
          isAvailable: true,
          defaultSubstituteName: 'Mực',
          allowedSubstituteNames: ['Mực'],
        },
        {
          id: 303,
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

describe('ModifierSelectorSheet (QR) — allowedSubstituteNames matrix enforcement', () => {
  afterEach(() => {
    cleanup();
  });

  it('prevents Ngao from substituting into Tôm/Mực and submits REMOVED_DEFAULT + valid SUBSTITUTED', () => {
    const onConfirm = vi.fn();
    render(
      <ModifierSelectorSheet
        open
        product={qrSeafoodProduct}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('(Bỏ tích → Không Ngao, không đổi món)')).toBeInTheDocument();

    // Uncheck Ngao -> renders "Không Ngao", never "Thay thế bằng ..."
    fireEvent.click(screen.getByTestId('modifier-option-301'));
    expect(screen.getByText('Không Ngao')).toBeInTheDocument();
    expect(screen.queryByText(/Thay thế bằng/)).not.toBeInTheDocument();

    // Uncheck Tôm -> renders "Thay thế bằng Mực" without offering "Đổi sang Ngao"
    fireEvent.click(screen.getByTestId('modifier-option-302'));
    expect(screen.getByText('Thay thế bằng Mực')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đổi sang Ngao' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-modifier-btn'));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: [
          { groupId: 30, modifierId: 301, action: 'REMOVED_DEFAULT' },
          {
            groupId: 30,
            modifierId: 302,
            action: 'SUBSTITUTED',
            substituteModifierId: 303,
            substituteName: 'Mực',
          },
        ],
        modifierLabels: ['Không Ngao', 'Không Tôm (Thay bằng Mực)'],
      }),
    );
  });
});
