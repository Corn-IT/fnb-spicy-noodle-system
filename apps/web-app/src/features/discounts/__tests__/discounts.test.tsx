import { QueryClient } from '@tanstack/react-query';
import {
  type DiscountListResponse,
  type MdmItem,
  type Product,
  UserPermissionsSchema,
} from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { DiscountsPage } from '@/features/discounts';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const mockDiscountsResponse: DiscountListResponse = {
  page: 1,
  limit: 20,
  total: 2,
  items: [
    {
      id: 1,
      code: 'GIAM10',
      name: 'Giảm 10% tối đa 20k',
      valueType: 'PERCENT',
      value: 10,
      maxDiscountAmount: 20000,
      scope: 'ORDER',
      targetCategoryIds: [],
      targetProductIds: [],
      targets: [],
      minOrderAmount: 100000,
      startsAt: null,
      endsAt: null,
      activeWeekdays: [],
      timeWindowStart: null,
      timeWindowEnd: null,
      usageLimit: 50,
      usedCount: 5,
      remainingCount: 45,
      totalDiscountedAmount: 85000,
      isActive: true,
      isArchived: false,
      isLocked: true,
      createdBy: 1,
      createdAt: '2026-11-15T01:00:00.000Z',
      updatedAt: '2026-11-15T02:00:00.000Z',
    },
    {
      id: 2,
      code: 'MONMOI',
      name: 'Giảm 15k món Mì',
      valueType: 'FIXED',
      value: 15000,
      maxDiscountAmount: null,
      scope: 'PRODUCT',
      targetCategoryIds: [],
      targetProductIds: [101],
      targets: [{ categoryId: null, categoryName: null, productId: 101, productName: 'Mì Cay Bò Mỹ' }],
      minOrderAmount: null,
      startsAt: null,
      endsAt: null,
      activeWeekdays: [1, 3, 5],
      timeWindowStart: '11:00',
      timeWindowEnd: '14:00',
      usageLimit: null,
      usedCount: 0,
      remainingCount: null,
      totalDiscountedAmount: 0,
      isActive: true,
      isArchived: false,
      isLocked: false,
      createdBy: 1,
      createdAt: '2026-11-15T01:00:00.000Z',
      updatedAt: '2026-11-15T02:00:00.000Z',
    },
  ],
};

const mockCategories: MdmItem[] = [
  {
    id: 10,
    category: 'MENU_CATEGORY',
    name: 'Mì Cay Hàn Quốc',
    normalizedName: 'mi cay han quoc',
    metadata: {},
    isActive: true,
    createdAt: '2026-11-15T00:00:00.000Z',
  },
];

const mockProducts: Product[] = [
  {
    id: 101,
    name: 'Mì Cay Bò Mỹ',
    subtitle: 'Cấp 0-7',
    categoryId: 10,
    categoryName: 'Mì Cay Hàn Quốc',
    price: 55000,
    station: 'BEP_NAU',
    imageUrl: null,
    isAvailable: true,
    sortOrder: 0,
    comboItems: [],
    modifierGroups: [],
  },
];

describe('Story 18 — Discounts Management Page (/discounts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({
      user: {
        id: 1,
        employeeId: 1,
        username: 'admin',
        fullName: 'Quản Lý',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          discounts: { view: true, create: true, update: true, delete: true },
        }),
      },
      accessToken: 'token-ok',
    });

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/discounts')) return mockDiscountsResponse;
      if (url.startsWith('/api/v1/mdm/lookup')) return mockCategories;
      if (url.startsWith('/api/v1/menu/products')) return mockProducts;
      return {};
    });
  });

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <DiscountsPage />
        </MemoryRouter>
      </QueryProvider>,
    );
  }

  it('renders BaseTable stats, interactive status toggle button, and enforces active edit/delete locks', async () => {
    let items = mockDiscountsResponse.items.map((item) => ({ ...item }));
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/discounts')) {
        return { ...mockDiscountsResponse, total: items.length, items };
      }
      if (url.startsWith('/api/v1/mdm/lookup')) return mockCategories;
      if (url.startsWith('/api/v1/menu/products')) return mockProducts;
      return {};
    });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockImplementation(async (url: string, body?: unknown) => {
      const match = url.match(/\/api\/v1\/discounts\/(\d+)\/status/);
      const targetId = match ? Number(match[1]) : 0;
      const nextActive = Boolean((body as { isActive?: boolean })?.isActive);
      items = items.map((item) => (item.id === targetId ? { ...item, isActive: nextActive } : item));
      return items.find((item) => item.id === targetId);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('discounts-page')).toBeInTheDocument();
      expect(screen.getByText('GIAM10')).toBeInTheDocument();
    });
    expect(screen.getByText('MONMOI')).toBeInTheDocument();
    expect(screen.getByTestId('discount-usage-1')).toHaveTextContent('5 / 50');
    expect(screen.getByTestId('discount-usage-1')).toHaveTextContent('Còn 45');
    expect(screen.getByTestId('discount-total-amount-1')).toHaveTextContent('85.000 đ');

    // Interactive status pill renders "Đang chạy" and locks Edit/Delete while active
    const statusToggleBtn = screen.getByTestId('toggle-discount-1');
    expect(statusToggleBtn).toHaveTextContent('Đang chạy');
    const editBtn = screen.getByTestId('edit-discount-1');
    const deleteBtn = screen.getByTestId('delete-discount-1');
    expect(editBtn).toBeDisabled();
    expect(deleteBtn).toBeDisabled();

    // Hovering disabled action buttons still displays tooltip explaining why locked
    fireEvent.mouseEnter(editBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Mã đang kích hoạt. Hãy bấm cột Trạng thái để tạm tắt trước khi chỉnh sửa',
    );
    fireEvent.mouseLeave(editBtn.parentElement!);
    fireEvent.mouseEnter(deleteBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Mã đang kích hoạt. Hãy bấm cột Trạng thái để tạm tắt trước khi lưu trữ',
    );
    fireEvent.mouseLeave(deleteBtn.parentElement!);

    // Toggling status via TRẠNG THÁI unlocks Edit/Archive and switches label to "Đang tắt"
    fireEvent.click(statusToggleBtn);
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('/api/v1/discounts/1/status', { isActive: false });
      expect(screen.getByTestId('toggle-discount-1')).toHaveTextContent('Đang tắt');
    });
    const enabledEditBtn = screen.getByTestId('edit-discount-1');
    const enabledDeleteBtn = screen.getByTestId('delete-discount-1');
    expect(enabledEditBtn).not.toBeDisabled();
    expect(enabledDeleteBtn).not.toBeDisabled();

    // Hovering enabled action buttons shows tooltip describing the action
    fireEvent.mouseEnter(enabledEditBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Chỉnh sửa mã giảm giá');
    fireEvent.mouseLeave(enabledEditBtn.parentElement!);
    fireEvent.mouseEnter(enabledDeleteBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Lưu trữ mã đã phát sinh lượt dùng (bảo toàn lịch sử)',
    );
    fireEvent.mouseLeave(enabledDeleteBtn.parentElement!);

    fireEvent.click(enabledEditBtn);
    await waitFor(() => {
      expect(screen.getByTestId('discount-locked-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('discount-code-input')).toBeDisabled();
  });

  it('opens create Sheet drawer and submits UPPERCASE code', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(mockDiscountsResponse.items[1]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('create-discount-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-discount-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('discount-form-drawer')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('discount-code-input'), { target: { value: 'vip2026' } });
    fireEvent.change(screen.getByTestId('discount-name-input'), { target: { value: 'Giảm 20k VIP' } });
    fireEvent.click(screen.getByTestId('discount-value-type-FIXED'));
    fireEvent.change(screen.getByTestId('discount-value-input'), { target: { value: '20000' } });
    fireEvent.click(screen.getByTestId('submit-discount-btn'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/discounts',
        expect.objectContaining({
          code: 'VIP2026',
          valueType: 'FIXED',
          value: 20000,
          scope: 'ORDER',
        }),
      );
    });
  });

  it('disables Edit/Delete on archived discounts and allows deleting unused inactive discounts', async () => {
    const customItems = [
      { ...mockDiscountsResponse.items[0], id: 3, code: 'OLDARCHIVED', isActive: false, isArchived: true },
      { ...mockDiscountsResponse.items[1], id: 4, code: 'PAUSEDNEW', isActive: false, isArchived: false, usedCount: 0 },
    ];
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/discounts')) {
        return { ...mockDiscountsResponse, total: customItems.length, items: customItems };
      }
      if (url.startsWith('/api/v1/mdm/lookup')) return mockCategories;
      if (url.startsWith('/api/v1/menu/products')) return mockProducts;
      return {};
    });
    const deleteSpy = vi
      .spyOn(apiClient, 'delete')
      .mockResolvedValue({ deleted: true, archived: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('OLDARCHIVED')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('toggle-discount-3')).not.toBeInTheDocument();
    const archivedEditBtn = screen.getByTestId('edit-discount-3');
    const archivedDeleteBtn = screen.getByTestId('delete-discount-3');
    expect(archivedEditBtn).toBeDisabled();
    expect(archivedDeleteBtn).toBeDisabled();

    fireEvent.mouseEnter(archivedEditBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mã đã lưu trữ không thể chỉnh sửa');
    fireEvent.mouseLeave(archivedEditBtn.parentElement!);

    const enabledUnusedDeleteBtn = screen.getByTestId('delete-discount-4');
    expect(screen.getByTestId('edit-discount-4')).not.toBeDisabled();
    expect(enabledUnusedDeleteBtn).not.toBeDisabled();

    fireEvent.mouseEnter(enabledUnusedDeleteBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Xoá vĩnh viễn mã giảm giá');
    fireEvent.mouseLeave(enabledUnusedDeleteBtn.parentElement!);

    fireEvent.click(enabledUnusedDeleteBtn);
    await waitFor(() => {
      expect(screen.getByTestId('discount-delete-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-delete-discount-btn'));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/discounts/4');
    });
  });
});
