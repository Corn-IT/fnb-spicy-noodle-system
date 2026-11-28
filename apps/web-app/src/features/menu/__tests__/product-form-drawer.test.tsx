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

  it('creates a new product, switches stations, manages modifier groups/availability, and validates empty names', async () => {
    renderDrawer(null);

    // Submitting without name stays blocked
    fireEvent.click(screen.getByTestId('save-product-submit-btn'));
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();

    // Fill basic fields + switch station to COMBO and back to BEP_NAU
    fireEvent.click(screen.getByTestId('product-station-COMBO'));
    fireEvent.click(screen.getByTestId('product-station-BEP_NAU'));
    fireEvent.change(screen.getByTestId('product-name-input'), {
      target: { value: 'Mì Cay Bạch Tuộc' },
    });
    fireEvent.change(screen.getByTestId('product-subtitle-input'), {
      target: { value: 'Đặc biệt cay 7 cấp' },
    });
    fireEvent.change(screen.getByTestId('product-price-input'), {
      target: { value: '68000' },
    });
    fireEvent.change(screen.getByTestId('product-sort-input'), {
      target: { value: '4' },
    });

    // Add blank modifier group, fill its group + modifier names, toggle availability, and save
    fireEvent.click(screen.getByTestId('add-blank-modifier-group-btn'));
    expect(screen.getByTestId('modifier-group-card-0')).toBeInTheDocument();
    // Blank group blocks submit cleanly before filling names
    fireEvent.click(screen.getByTestId('save-product-submit-btn'));
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByPlaceholderText('VD: Cấp độ cay, Đồ ăn mặc định (0đ), Đồ ăn thêm...'),
      { target: { value: 'Độ cay' } },
    );
    fireEvent.change(
      screen.getByPlaceholderText('Tên món (VD: Tôm, Xúc xích, Cấp 1)...'),
      { target: { value: 'Cấp 3' } },
    );
    const toggleAvail = screen.queryByTestId('modifier-unavailable-toggle-0-0');
    if (toggleAvail) {
      fireEvent.click(toggleAvail);
    }

    fireEvent.click(screen.getByTestId('save-product-submit-btn'));
    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mì Cay Bạch Tuộc',
        price: 68000,
        station: 'BEP_NAU',
      }),
    );
  });

  it('builds a COMBO product with components and inserts quick modifier presets', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const physicalA: Product = { ...legacySeafoodProduct, id: 101, name: 'Mì Cay Bò', station: 'BEP_NAU', modifierGroups: [] };
    const physicalB: Product = { ...legacySeafoodProduct, id: 102, name: 'Trà Đào', station: 'PHA_CHE', modifierGroups: [] };

    render(
      <QueryClientProvider client={client}>
        <ProductFormDrawer
          open
          onOpenChange={vi.fn()}
          editingProduct={null}
          allProducts={[physicalA, physicalB]}
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

    fireEvent.click(screen.getByTestId('product-station-COMBO'));
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Combo Đôi Cay' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '129000' } });

    // Add combo item row and configure quantity
    fireEvent.click(screen.getByRole('button', { name: /Thêm thành phần/i }));
    const comboSelect = document.querySelectorAll('select')[1] as HTMLSelectElement;
    fireEvent.change(comboSelect, { target: { value: '102' } });

    // Exercise all 5 quick-insert presets & add/remove modifier row
    fireEvent.click(screen.getByRole('button', { name: /Size Pha chế/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cấp độ cay/i }));
    fireEvent.click(screen.getByRole('button', { name: /Đồ ăn mặc định/i }));
    fireEvent.click(screen.getByRole('button', { name: /Đồ ăn chính \(Đổi món thông minh\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Đồ ăn thêm/i }));

    expect(screen.getByTestId('modifier-group-card-4')).toBeInTheDocument();
    // Add one extra modifier line inside group 0, fill its name, then remove group 4
    fireEvent.click(screen.getAllByRole('button', { name: /Thêm dòng tuỳ chọn/i })[0]);
    const blankNameInput = screen
      .getAllByPlaceholderText('Tên món (VD: Tôm, Xúc xích, Cấp 1)...')
      .find((input) => (input as HTMLInputElement).value === '');
    expect(blankNameInput).toBeTruthy();
    fireEvent.change(blankNameInput!, { target: { value: 'XL' } });
    const removeGroupBtns = screen.getAllByTitle('Xoá nhóm tuỳ chọn này');
    fireEvent.click(removeGroupBtns[4]);

    fireEvent.click(screen.getByTestId('save-product-submit-btn'));
    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Combo Đôi Cay',
        station: 'COMBO',
        comboItems: [{ productId: 102, quantity: 1 }],
      }),
    );
  });
});
