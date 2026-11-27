import { expect, test, type Page, type Route } from '@playwright/test';

import { MOCK_SUPER_ADMIN, setupMockApi } from './fixtures/api-mock';

type DraftState = {
  id: string;
  revision: number;
  orderType: 'DINE_IN' | 'TAKEAWAY' | null;
  tableId: number | null;
  tableName: string | null;
  items: Array<Record<string, unknown>>;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

async function mockDraftApi(page: Page) {
  let draft: DraftState | null = null;
  let occupiedTableId: number | null = null;
  let tableNameOverride: string | null = null;
  let deleteStatus: number | 'network' = 200;
  let deleteWait: Promise<void> | null = null;
  const deletionRevisions: string[] = [];
  const submittedBodies: Array<Record<string, unknown>> = [];
  const submitAttempts: Array<Record<string, unknown>> = [];

  await page.route('**/api/v1/pos/drafts**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    const withTableName = (state: DraftState): DraftState => ({
      ...state,
      tableName: state.tableId === null ? null : tableNameOverride ?? `Bàn ${String(state.tableId).padStart(2, '0')}`,
    });

    if (path.endsWith('/pos/drafts') && method === 'GET') {
      return json({ drafts: draft ? [withTableName(draft)] : [] });
    }
    if (path.endsWith('/pos/drafts') && method === 'POST') {
      const body = route.request().postDataJSON() as Omit<DraftState, 'id' | 'revision' | 'tableName' | 'createdAt' | 'updatedAt'>;
      const now = new Date().toISOString();
      draft = { ...body, id: 'draft-e2e-1', revision: 1, tableName: null, createdAt: now, updatedAt: now };
      return json(withTableName(draft));
    }
    if (path.endsWith('/pos/drafts/draft-e2e-1') && method === 'PUT' && draft) {
      const body = route.request().postDataJSON() as DraftState & { expectedRevision: number };
      const { expectedRevision, ...state } = body;
      if (expectedRevision !== draft.revision) {
        return json({ code: 'POS_DRAFT_CONCURRENT_MODIFICATION' }, 409);
      }
      draft = {
        ...draft,
        ...state,
        tableName: state.tableId === null ? null : tableNameOverride ?? `Bàn ${String(state.tableId).padStart(2, '0')}`,
        revision: draft.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      return json(withTableName(draft));
    }
    if (path.endsWith('/pos/drafts/draft-e2e-1/submit') && method === 'POST' && draft) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      submitAttempts.push(body);
      if (draft.orderType === 'DINE_IN' && draft.tableId === occupiedTableId) {
        return json({
          code: 'POS_TABLE_NOT_AVAILABLE',
          message: 'Bàn đã có khách hoặc không còn trống; giỏ nháp vẫn được giữ lại',
        }, 409);
      }
      submittedBodies.push(body);
      return json({
        draftId: draft.id,
        order: {
          orderId: 991,
          orderCode: 'HD-20261126-00991',
          orderType: draft.orderType,
          tableId: draft.tableId,
          takeawayNumber: draft.orderType === 'TAKEAWAY' ? 1 : null,
          tableLabel: draft.tableName ?? (draft.orderType === 'TAKEAWAY' ? 'Mang về #01' : null),
          status: 'SERVING',
          subtotalAmount: 45000,
          discountAmount: 0,
          totalAmount: 45000,
        },
        idempotentReplay: false,
      });
    }
    if (path.endsWith('/pos/drafts/draft-e2e-1') && method === 'DELETE') {
      deletionRevisions.push(url.searchParams.get('revision') ?? '');
      if (deleteWait) await deleteWait;
      if (deleteStatus === 'network') return route.abort('failed');
      if (deleteStatus !== 200) return json({
        code: deleteStatus === 409 ? 'POS_DRAFT_CONCURRENT_MODIFICATION' : 'RBAC_PERMISSION_DENIED',
        message: deleteStatus === 409 ? 'Giỏ nháp đã được cập nhật ở thiết bị khác' : 'Bạn không có quyền xóa giỏ tạm',
      }, deleteStatus);
      if (Number(url.searchParams.get('revision')) !== draft?.revision) return json({ code: 'POS_DRAFT_CONCURRENT_MODIFICATION' }, 409);
      draft = null;
      return json({ id: 'draft-e2e-1', deleted: true });
    }
    return route.fallback();
  });

  let orderCreateCalls = 0;
  await page.route('**/api/v1/pos/orders', async (route) => {
    if (route.request().method() === 'POST') orderCreateCalls += 1;
    return route.fallback();
  });

  return {
    setTableName: (name: string) => { tableNameOverride = name; },
    deletionRevisions,
    setDeleteStatus: (status: number | 'network') => { deleteStatus = status; },
    setDeleteWait: (wait: Promise<void>) => { deleteWait = wait; },
    submittedBodies,
    submitAttempts,
    setOccupiedTableId: (tableId: number | null) => { occupiedTableId = tableId; },
    getDraft: () => draft,
    getOrderCreateCalls: () => orderCreateCalls,
  };
}

async function mockTablesWithQrOccupiedTable10(page: Page) {
  let table10QrOrderAccepted = false;
  await page.route('**/api/v1/pos/tables', async (route) => {
    const tables = Array.from({ length: 24 }, (_, index) => {
      const id = index + 1;
      const isOccupied = id === 1;
      const isPending = id === 2 || (id === 10 && table10QrOrderAccepted);
      const activeOrderId = isOccupied ? 101 : isPending ? (id === 2 ? 102 : 110) : null;
      return {
        id,
        name: `Bàn ${String(id).padStart(2, '0')}`,
        qrToken: `${String(id).padStart(2, '0')}${'a'.repeat(62)}`,
        status: isOccupied ? 'OCCUPIED' : isPending ? 'PENDING' : 'AVAILABLE',
        activeOrderId,
        activeOrder: activeOrderId === null ? null : {
          orderId: activeOrderId,
          orderCode: `HD-20261126-${String(activeOrderId).padStart(4, '0')}`,
          orderType: 'DINE_IN',
          tableId: id,
          tableLabel: `Bàn ${String(id).padStart(2, '0')}`,
          takeawayNumber: null,
          status: isOccupied ? 'SERVING' : 'PENDING',
          subtotalAmount: 45000,
          discountAmount: 0,
          totalAmount: 45000,
          createdAt: '2026-11-26T10:00:00.000Z',
        },
      };
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tables, takeaways: [], takeawayQrToken: 'b'.repeat(64) }),
    });
  });
  return { acceptQrOrderForTable10: () => { table10QrOrderAccepted = true; } };
}

test.describe('POS drafts — Desktop', () => {
  test('parks an unassigned cart, resumes it, assigns a free table, and submits once', async ({ page }) => {
    await setupMockApi(page);
    const draftApi = await mockDraftApi(page);
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('create-untargeted-draft-btn').click();
    await page.getByTestId('pos-quick-add-product-1').click();
    await expect(page.getByTestId('draft-item-0')).toBeVisible();
    await page.getByTestId('pos-save-draft-btn').click();
    await expect(page.getByTestId('pos-resume-draft-draft-e2e-1')).toBeVisible();

    await page.getByTestId('pos-resume-draft-draft-e2e-1').click();
    await page.getByRole('button', { name: 'Gán bàn hoặc chọn Mang về' }).click();
    await page.getByTestId('table-card-3').click();
    await expect(page.getByTestId('invoice-header-label')).toContainText('Bàn 03');
    await page.getByTestId('pos-submit-new-order-btn').click();

    await expect.poll(() => draftApi.submittedBodies.length).toBe(1);
    expect(draftApi.submittedBodies[0]).toMatchObject({ expectedRevision: 2 });
    expect(draftApi.getOrderCreateCalls()).toBe(0);
  });

  test('deletes a parked cart from the shared draft list', async ({ page }) => {
    await setupMockApi(page);
    await mockDraftApi(page);
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('create-untargeted-draft-btn').click();
    await page.getByTestId('pos-quick-add-product-1').click();
    await page.getByTestId('pos-save-draft-btn').click();
    await expect(page.getByTestId('pos-resume-draft-draft-e2e-1')).toBeVisible();
    await page.getByTestId('pos-delete-draft-draft-e2e-1').click();

    await expect(page.getByTestId('pos-resume-draft-draft-e2e-1')).toHaveCount(0);
  });

  test('keeps a draft when QR takes its saved table, then allows reassignment and submit', async ({ page }) => {
    await setupMockApi(page);
    const draftApi = await mockDraftApi(page);
    const tableState = await mockTablesWithQrOccupiedTable10(page);
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('table-card-10').click();
    await page.getByTestId('pos-quick-add-product-1').click();
    await page.getByTestId('pos-save-draft-btn').click();
    await expect(page.getByTestId('pos-resume-draft-draft-e2e-1')).toContainText('Bàn 10 · 1 món');

    // Another customer completes a QR order for Bàn 10 while the saved POS draft is parked.
    tableState.acceptQrOrderForTable10();
    draftApi.setOccupiedTableId(10);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('table-card-10')).toContainText('45.000 đ');
    await page.getByTestId('pos-resume-draft-draft-e2e-1').click();
    await page.getByTestId('pos-submit-new-order-btn').click();

    await expect(page.getByTestId('draft-item-0')).toBeVisible();
    await expect(page.getByText(/giỏ nháp vẫn được giữ lại/i)).toBeVisible();
    expect(draftApi.submitAttempts).toHaveLength(1);
    expect(draftApi.submittedBodies).toHaveLength(0);
    expect(draftApi.getDraft()).toMatchObject({ tableId: 10, revision: 1 });

    await page.getByRole('button', { name: 'Đổi bàn hoặc chọn Mang về' }).click();
    await page.getByTestId('table-card-3').click();
    await expect(page.getByTestId('invoice-header-label')).toContainText('Bàn 03');
    await page.getByTestId('pos-submit-new-order-btn').click();

    await expect.poll(() => draftApi.submittedBodies.length).toBe(1);
    expect(draftApi.submitAttempts).toHaveLength(2);
    expect(draftApi.getDraft()).toMatchObject({ tableId: 3, revision: 2 });
    expect(draftApi.getOrderCreateCalls()).toBe(0);
  });
});

test.describe('POS drafts — Touch', () => {
  test.use({ viewport: { width: 1366, height: 768 }, hasTouch: true });

  test('parks an unassigned cart, resumes it, assigns a free table, and submits once', async ({ page }) => {
    await setupMockApi(page);
    const draftApi = await mockDraftApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('touch-new-untargeted-draft').tap();
    await page.getByTestId('touch-product-1').tap();
    await expect(page.getByTestId('touch-draft-item-0')).toBeVisible();
    await page.getByTestId('touch-save-draft').tap();
    await expect(page.getByTestId('pos-resume-draft-draft-e2e-1')).toBeVisible();

    await page.getByTestId('pos-resume-draft-draft-e2e-1').tap();
    await page.getByRole('button', { name: 'Gán bàn hoặc chọn Mang về' }).tap();
    await page.getByTestId('touch-table-card-3').tap();
    await expect(page.getByTestId('touch-order-title')).toContainText('Bàn 03');
    await page.getByTestId('touch-submit-draft').tap();

    await expect.poll(() => draftApi.submittedBodies.length).toBe(1);
    expect(draftApi.submittedBodies[0]).toMatchObject({ expectedRevision: 2 });
    expect(draftApi.getOrderCreateCalls()).toBe(0);
  });
});

async function setupCashierDraftApi(page: Page, canDeleteDrafts = true) {
  await setupMockApi(page);
  const user = {
    ...MOCK_SUPER_ADMIN,
    isSuperAdmin: false,
    permissions: {
      ...MOCK_SUPER_ADMIN.permissions,
      pos: { view: true, create: true, update: true, delete: false, deleteDrafts: canDeleteDrafts },
    },
  };
  await page.addInitScript((cashier) => {
    localStorage.setItem('fnb-auth', JSON.stringify({ state: { user: cashier }, version: 0 }));
  }, user);
  await page.route('**/api/v1/auth/*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'cashier-token', user }),
  }));
  return mockDraftApi(page);
}

for (const touch of [false, true]) {
  test.describe(`POS bulk discard — ${touch ? 'Touch' : 'Desktop'}`, () => {
    test.use({ viewport: { width: 1366, height: 900 }, hasTouch: true });
    const ids = {
      start: touch ? 'touch-new-untargeted-draft' : 'create-untargeted-draft-btn',
      product: touch ? 'touch-product-1' : 'pos-quick-add-product-1',
      item: touch ? 'touch-draft-item-0' : 'draft-item-0',
      save: touch ? 'touch-save-draft' : 'pos-save-draft-btn',
      discard: touch ? 'touch-discard-draft' : 'pos-discard-draft-btn',
      submit: touch ? 'touch-submit-draft' : 'pos-submit-new-order-btn',
    };
    const goto = async (page: Page) => page.goto(touch ? '/pos/touch' : '/pos', { waitUntil: 'domcontentloaded' });
    const startCart = async (page: Page) => {
      await page.getByTestId(ids.start).tap();
      await page.getByTestId(ids.product).tap();
      await page.getByTestId(ids.product).tap();
      await expect(page.getByTestId(ids.item)).toBeVisible();
    };
    const saveAndResume = async (page: Page) => {
      await page.getByTestId(ids.save).tap();
      await page.getByTestId('pos-resume-draft-draft-e2e-1').tap();
      await expect(page.getByTestId(ids.item)).toBeVisible();
    };

    test('confirms before clearing all local items and returns to the board without a server write', async ({ page }) => {
      const api = await setupCashierDraftApi(page);
      await goto(page);
      await startCart(page);
      await page.getByTestId(ids.discard).tap();
      await page.getByRole('button', { name: 'Quay lại', exact: true }).tap();
      await expect(page.getByTestId(ids.item)).toBeVisible();
      await page.getByTestId(ids.discard).tap();
      await page.getByTestId('confirm-discard-draft').tap();
      await expect(page.getByTestId(ids.item)).toHaveCount(0);
      await expect(page.getByTestId(ids.start)).toBeVisible();
      expect(api.getDraft()).toBeNull();
      expect(api.deletionRevisions).toEqual([]);
      expect(api.getOrderCreateCalls()).toBe(0);
    });

    test('deletes the saved revision before clearing local edits and blocks repeated destructive operations', async ({ page }) => {
      const api = await setupCashierDraftApi(page);
      await goto(page);
      await startCart(page);
      await saveAndResume(page);
      await page.getByTestId(ids.product).tap();
      let release!: () => void;
      api.setDeleteWait(new Promise<void>((resolve) => { release = resolve; }));
      await page.getByTestId(ids.discard).tap();
      await page.getByTestId('confirm-discard-draft').tap();
      await expect.poll(() => api.deletionRevisions.length).toBe(1);
      await expect(page.getByTestId('confirm-discard-draft')).toBeDisabled();
      await expect(page.getByTestId(ids.save)).toBeDisabled();
      await expect(page.getByTestId(ids.item)).toBeVisible();
      expect(api.getDraft()).not.toBeNull();
      release();
      await expect(page.getByTestId(ids.item)).toHaveCount(0);
      await expect(page.getByTestId(ids.start)).toBeVisible();
      expect(api.deletionRevisions).toEqual(['1']);
      expect(api.getDraft()).toBeNull();
      expect(api.submittedBodies).toHaveLength(0);
      expect(api.getOrderCreateCalls()).toBe(0);
    });

    for (const status of [409, 403, 'network'] as const) {
      test(`retains the entire editable saved cart and target when deletion fails (${status})`, async ({ page }) => {
        const api = await setupCashierDraftApi(page);
        await goto(page);
        await page.getByTestId(touch ? 'touch-table-card-3' : 'table-card-3').tap();
        await page.getByTestId(ids.product).tap();
        await saveAndResume(page);
        await page.getByTestId(ids.product).tap();
        const before = await page.getByTestId(ids.item).innerText();
        api.setDeleteStatus(status);
        await page.getByTestId(ids.discard).tap();
        await page.getByTestId('confirm-discard-draft').tap();
        await expect.poll(() => api.deletionRevisions.length).toBe(1);
        await expect(page.getByRole('button', { name: 'Quay lại', exact: true })).toBeEnabled();
        await page.getByRole('button', { name: 'Quay lại', exact: true }).tap();
        await expect(page.getByTestId(ids.item)).toHaveText(before, { useInnerText: true });
        await expect(page.getByTestId(touch ? 'touch-order-title' : 'invoice-header-label')).toContainText('Bàn 03');
        await expect(page.getByTestId(ids.save)).toBeEnabled();
        expect(api.getDraft()).toMatchObject({ tableId: 3, revision: 1 });
        expect(api.getOrderCreateCalls()).toBe(0);
      });
    }

    test('discards a saved table draft while leaving the later QR order and table occupancy intact', async ({ page }) => {
      const api = await setupCashierDraftApi(page);
      const tableState = await mockTablesWithQrOccupiedTable10(page);
      const orderWrites: string[] = [];
      await page.route('**/api/v1/pos/orders/**', async (route) => {
        if (route.request().method() !== 'GET') orderWrites.push(route.request().url());
        await route.fallback();
      });
      await goto(page);
      await page.getByTestId(touch ? 'touch-table-card-10' : 'table-card-10').tap();
      await page.getByTestId(ids.product).tap();
      await page.getByTestId(ids.save).tap();
      tableState.acceptQrOrderForTable10();
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (touch) await page.getByRole('tab', { name: /Lưu tạm/ }).tap();
      await page.getByTestId('pos-resume-draft-draft-e2e-1').tap();
      await page.getByTestId(ids.discard).tap();
      await page.getByTestId('confirm-discard-draft').tap();
      await expect(page.getByTestId(touch ? 'touch-table-card-10' : 'table-card-10')).toContainText('45.000');
      expect(api.getDraft()).toBeNull();
      expect(orderWrites).toEqual([]);
      expect(api.getOrderCreateCalls()).toBe(0);
    });

    test('hides saved deletion without the dedicated permission while allowing local discard', async ({ page }) => {
      await setupCashierDraftApi(page, false);
      await goto(page);
      await startCart(page);
      await expect(page.getByTestId(ids.discard)).toBeVisible();
      await page.getByTestId(ids.save).tap();
      await expect(page.getByTestId('pos-delete-draft-draft-e2e-1')).toHaveCount(0);
      await page.getByTestId('pos-resume-draft-draft-e2e-1').tap();
      await expect(page.getByTestId(ids.discard)).toHaveCount(0);
    });

    test('renders a square saved card with a separate visible 44px delete target', async ({ page }) => {
      const api = await setupCashierDraftApi(page);
      api.setTableName('Bàn khu vực phục vụ có nhãn rất dài để kiểm tra tràn chữ và nút xóa');
      if (touch) await page.addInitScript(() => localStorage.setItem('fnb-pos-touch-layout', JSON.stringify({ tableColumns: 4, menuColumns: 'auto' })));
      await goto(page);
      await page.getByTestId(touch ? 'touch-table-card-3' : 'table-card-3').tap();
      await page.getByTestId(ids.product).tap();
      await page.getByTestId(ids.save).tap();
      const card = page.getByTestId('pos-draft-card-draft-e2e-1');
      const resume = page.getByTestId('pos-resume-draft-draft-e2e-1');
      const remove = page.getByTestId('pos-delete-draft-draft-e2e-1');
      await expect(remove).toBeVisible();
      for (const width of [1024, 1366]) {
        await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(async () => {
          const box = await card.boundingBox();
          return box ? Math.abs(box.width - box.height) : 100;
        }).toBeLessThan(2);
        const target = await remove.boundingBox();
        expect(target?.width).toBeGreaterThanOrEqual(44);
        expect(target?.height).toBeGreaterThanOrEqual(44);
      }
      expect(await resume.locator('button').count()).toBe(0);
      const resumeBox = await resume.boundingBox();
      const deleteBox = await remove.boundingBox();
      expect(resumeBox!.y + resumeBox!.height).toBeLessThanOrEqual(deleteBox!.y);
      if (touch) await expect(page.getByTestId('touch-table-grid')).toHaveAttribute('data-columns', '4');
      await remove.tap();
      await expect(card).toHaveCount(0);
    });
  });
}
