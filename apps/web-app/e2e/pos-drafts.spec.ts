import { expect, test, type Page, type Route } from '@playwright/test';

import { setupMockApi } from './fixtures/api-mock';

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
  const submittedBodies: Array<Record<string, unknown>> = [];

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
      tableName: state.tableId === null ? null : `Bàn ${String(state.tableId).padStart(2, '0')}`,
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
        tableName: state.tableId === null ? null : `Bàn ${String(state.tableId).padStart(2, '0')}`,
        revision: draft.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      return json(withTableName(draft));
    }
    if (path.endsWith('/pos/drafts/draft-e2e-1/submit') && method === 'POST' && draft) {
      submittedBodies.push(route.request().postDataJSON() as Record<string, unknown>);
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

  return { submittedBodies, getOrderCreateCalls: () => orderCreateCalls };
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
