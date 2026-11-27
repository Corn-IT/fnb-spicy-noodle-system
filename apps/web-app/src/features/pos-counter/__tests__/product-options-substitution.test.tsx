import type { Product } from '@fnb/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductOptionsDialog } from '../components/product-options-dialog';

const matrixProduct: Product = {
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

describe('ProductOptionsDialog — allowedSubstituteNames matrix enforcement', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows "Không Ngao" (REMOVED_DEFAULT) when unchecking Ngao and only shows allowed substitutes for Tôm', () => {
    const onConfirm = vi.fn();
    render(
      <ProductOptionsDialog
        product={matrixProduct}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('(Bỏ tích → Không Ngao, không đổi món)')).toBeInTheDocument();
    expect(screen.getByText('(Bỏ tích → Thay bằng Mực)')).toBeInTheDocument();

    // Uncheck Ngao -> must NOT substitute to Tôm/Mực
    fireEvent.click(screen.getByTestId('pos-mod-option-301'));
    expect(screen.getByTestId('pos-mod-removed-301')).toHaveTextContent('Không Ngao');
    expect(screen.queryByTestId('pos-mod-substitute-301')).not.toBeInTheDocument();

    // Uncheck Tôm -> substitutes ONLY to Mực (Ngao is neither selected nor allowed)
    fireEvent.click(screen.getByTestId('pos-mod-option-302'));
    expect(screen.getByTestId('pos-mod-substitute-302')).toHaveTextContent('Thay thế bằng Mực');
    expect(screen.queryByRole('button', { name: 'Đổi sang Ngao' })).not.toBeInTheDocument();

    // Trying to uncheck Mực (last remaining item) keeps >= 1 selected
    fireEvent.click(screen.getByTestId('pos-mod-option-303'));
    expect(screen.getByTestId('pos-mod-option-303')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('pos-confirm-modifier-btn'));
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

  it('shows manual switch buttons ONLY for allowed targets and updates payload cleanly', () => {
    const onConfirm = vi.fn();
    render(
      <ProductOptionsDialog
        product={matrixProduct}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    // Uncheck Mực (allowedSubstituteNames: ['Tôm', 'Ngao'], both checked) -> manual buttons shown
    fireEvent.click(screen.getByTestId('pos-mod-option-303'));
    expect(screen.getByTestId('pos-mod-substitute-303')).toHaveTextContent('Thay thế bằng Tôm');
    const switchToNgaoBtn = screen.getByRole('button', { name: 'Đổi sang Ngao' });
    fireEvent.click(switchToNgaoBtn);
    expect(screen.getByTestId('pos-mod-substitute-303')).toHaveTextContent('Thay thế bằng Ngao');

    fireEvent.click(screen.getByTestId('pos-confirm-modifier-btn'));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: [
          {
            groupId: 30,
            modifierId: 303,
            action: 'SUBSTITUTED',
            substituteModifierId: 301,
            substituteName: 'Ngao',
          },
        ],
      }),
    );
  });
});
