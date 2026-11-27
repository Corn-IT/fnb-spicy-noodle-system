import type { Product } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductFormDrawer } from '../components/product-form-drawer';

const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();

vi.mock('../api/menu-admin.api', () => ({
  useCreateProductMutation: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateProductMutation: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

const legacySeafoodProduct: Product = {
  id: 77,
  categoryId: 10,
  categoryName: 'Mì Cay',
  station: 'BEP_NAU',
  name: 'Mì Cay Hải Sản Legacy',
  subtitle: null,
  price: 69000,
  isAvailable: true,
  sortOrder: 1,
  imageUrl: null,
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
          defaultSubstituteName: 'Mực',
          allowedSubstituteNames: null,
        },
        {
          id: 302,
          name: 'Tôm',
          extraPrice: 0,
          isDefaultChecked: true,
          isAvailable: true,
          defaultSubstituteName: 'Mực',
          allowedSubstituteNames: null,
        },
        {
          id: 303,
          name: 'Mực',
          extraPrice: 0,
          isDefaultChecked: true,
          isAvailable: true,
          defaultSubstituteName: 'Tôm',
          allowedSubstituteNames: null,
        },
      ],
    },
  ],
};

function renderDrawer(editingProduct: Product | null = legacySeafoodProduct) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductFormDrawer
        open
        onOpenChange={vi.fn()}
        editingProduct={editingProduct}
        allProducts={editingProduct ? [editingProduct] : []}
        categories={[
          {
            id: 10,
            category: 'MENU_CATEGORY',
            name: 'Mì Cay',
            normalizedName: 'mi cay',
            isActive: true,
            metadata: { defaultStation: 'BEP_NAU' },
            createdAt: '2026-11-27T00:00:00.000Z',
          },
        ]}
        onOpenCategoryManager={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('ProductFormDrawer — Đổi món substitution matrix', () => {
  beforeEach(() => {
    mockCreateMutateAsync.mockReset().mockResolvedValue({});
    mockUpdateMutateAsync.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it('pre-populates legacy null rows with sibling checkboxes, unchecks Ngao swaps -> Chỉ bỏ không đổi, and saves matrix', async () => {
    renderDrawer(legacySeafoodProduct);

    // Legacy null for Ngao (index 0) pre-checks sibling Tôm (idx 1) and Mực (idx 2)
    const ngaoToTom = screen.getByTestId('modifier-sub-checkbox-0-0-1') as HTMLInputElement;
    const ngaoToMuc = screen.getByTestId('modifier-sub-checkbox-0-0-2') as HTMLInputElement;
    const ngaoDefaultSelect = screen.getByTestId('modifier-default-sub-select-0-0') as HTMLSelectElement;

    expect(ngaoToTom.checked).toBe(true);
    expect(ngaoToMuc.checked).toBe(true);
    expect(ngaoDefaultSelect.value).toBe('Mực');
    expect(ngaoDefaultSelect.disabled).toBe(false);

    // Owner unchecks both Tôm & Mực for Ngao -> default select becomes disabled "Chỉ bỏ, không đổi"
    fireEvent.click(ngaoToTom);
    fireEvent.click(ngaoToMuc);

    expect(ngaoDefaultSelect.disabled).toBe(true);
    expect(ngaoDefaultSelect.value).toBe('');
    expect(screen.getByText('Chỉ bỏ, không đổi')).toBeInTheDocument();

    // Uncheck Ngao for Tôm (idx 1 -> sibling idx 0), keeping only Mực
    const tomToNgao = screen.getByTestId('modifier-sub-checkbox-0-1-0') as HTMLInputElement;
    fireEvent.click(tomToNgao);

    fireEvent.click(screen.getByTestId('save-product-submit-btn'));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      id: 77,
      body: expect.objectContaining({
        modifierGroups: [
          expect.objectContaining({
            allowSubstitution: true,
            modifiers: [
              expect.objectContaining({
                name: 'Ngao',
                allowedSubstituteNames: [],
                defaultSubstituteName: null,
              }),
              expect.objectContaining({
                name: 'Tôm',
                allowedSubstituteNames: ['Mực'],
                defaultSubstituteName: 'Mực',
              }),
              expect.objectContaining({
                name: 'Mực',
                allowedSubstituteNames: ['Ngao', 'Tôm'],
                defaultSubstituteName: 'Tôm',
              }),
            ],
          }),
        ],
      }),
    });
  });

  it('auto-synchronizes sibling allowedSubstituteNames and defaultSubstituteName when renaming or deleting a modifier', async () => {
    renderDrawer(legacySeafoodProduct);

    const mucNameInput = screen
      .getAllByDisplayValue('Mực')
      .find((el) => el.tagName === 'INPUT')!;
    fireEvent.change(mucNameInput, { target: { value: 'Mực Ống' } });

    const tomDefaultSelect = screen.getByTestId('modifier-default-sub-select-0-1') as HTMLSelectElement;
    expect(tomDefaultSelect.value).toBe('Mực Ống');

    // Delete Mực Ống row (index 2) and confirm Tôm (index 1) stays valid
    fireEvent.click(screen.getByTestId('modifier-remove-btn-0-2'));

    // Tôm (index 1) should now only allow Ngao and auto-pick Ngao as default
    expect(screen.queryByText('Mực Ống')).not.toBeInTheDocument();
    expect((screen.getByTestId('modifier-default-sub-select-0-1') as HTMLSelectElement).value).toBe(
      'Ngao',
    );
  });
});
