import { expect, test } from '@playwright/test';

import { MOCK_QR_TOKEN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout } from './utils/layout-assertions';

function buildInitialSeafoodProduct(configured = false) {
  return {
    id: 1,
    categoryId: 1,
    categoryName: 'Mì Cay 7 Cấp Độ',
    name: 'Mì Cay Hải Sản',
    subtitle: null,
    price: 69000,
    station: 'BEP_NAU',
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
            defaultSubstituteName: configured ? null : 'Mực',
            allowedSubstituteNames: configured ? [] : null,
          },
          {
            id: 302,
            name: 'Tôm',
            extraPrice: 0,
            isDefaultChecked: true,
            isAvailable: true,
            defaultSubstituteName: 'Mực',
            allowedSubstituteNames: configured ? ['Mực'] : null,
          },
          {
            id: 303,
            name: 'Mực',
            extraPrice: 0,
            isDefaultChecked: true,
            isAvailable: true,
            defaultSubstituteName: 'Tôm',
            allowedSubstituteNames: configured ? ['Tôm', 'Ngao'] : null,
          },
        ],
      },
    ],
  };
}

function setupSubstitutionE2ERoutes(
  page: Parameters<typeof setupMockApi>[0],
  options: { preconfiguredMatrix?: boolean } = {},
) {
  let seafoodProduct = buildInitialSeafoodProduct(Boolean(options.preconfiguredMatrix));
  const savedProductPayloads: Array<Record<string, unknown>> = [];

  const install = async () => {
    await setupMockApi(page);

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();

      const json = (data: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          headers: {
            'access-control-allow-origin': route.request().headers().origin ?? '*',
            'access-control-allow-credentials': 'true',
            'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'access-control-allow-headers':
              route.request().headers()['access-control-request-headers'] ?? 'content-type, authorization',
          },
          body: JSON.stringify(data),
        });

      if (pathname.endsWith('/menu/categories')) {
        return json([
          {
            id: 1,
            category: 'MENU_CATEGORY',
            name: 'Mì Cay 7 Cấp Độ',
            normalizedName: 'mi cay 7 cap do',
            isActive: true,
            metadata: { defaultStation: 'BEP_NAU' },
          },
        ]);
      }

      if (pathname.endsWith('/menu/products/1') && method === 'PUT') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        savedProductPayloads.push(body);
        const groups = Array.isArray(body.modifierGroups)
          ? (body.modifierGroups as Array<Record<string, unknown>>)
          : [];
        const updatedGroup = groups[0];
        if (updatedGroup && Array.isArray(updatedGroup.modifiers)) {
          seafoodProduct = {
            ...seafoodProduct,
            modifierGroups: [
              {
                ...seafoodProduct.modifierGroups[0]!,
                modifiers: (updatedGroup.modifiers as Array<Record<string, unknown>>).map((m, idx) => ({
                  id: 301 + idx,
                  name: String(m.name),
                  extraPrice: Number(m.extraPrice ?? 0),
                  isDefaultChecked: Boolean(m.isDefaultChecked),
                  isAvailable: m.isAvailable !== false,
                  defaultSubstituteName: (m.defaultSubstituteName as string | null) ?? null,
                  allowedSubstituteNames: Array.isArray(m.allowedSubstituteNames)
                    ? (m.allowedSubstituteNames as string[])
                    : null,
                })),
              },
            ],
          };
        }
        return json(seafoodProduct);
      }

      if (pathname.endsWith('/menu/products') || pathname.endsWith('/pos/menu')) {
        return json([seafoodProduct]);
      }

      if (pathname.endsWith('/pos/tables')) {
        return json({
          tables: [
            {
              id: 1,
              name: 'Bàn 01',
              qrToken: MOCK_QR_TOKEN,
              status: 'AVAILABLE',
              activeOrderId: null,
              activeOrder: null,
            },
          ],
          takeaways: [],
          takeawayQrToken: 'b'.repeat(64),
        });
      }

      if (pathname.endsWith('/pos/drafts')) {
        return json({ drafts: [] });
      }

      if (pathname.endsWith('/public/menu')) {
        return json({
          orderMode: 'DINE_IN',
          table: {
            tableId: 1,
            tableName: 'Bàn 01',
            status: 'AVAILABLE',
            activeOrderId: null,
          },
          categories: [
            { id: 1, code: 'MI_CAY', name: 'Mì Cay 7 Cấp Độ', sortOrder: 1 },
          ],
          activeOrder: null,
          products: [seafoodProduct],
          updatedAt: '2026-11-27T08:00:00.000Z',
        });
      }

      return route.fallback();
    });
  };

  return { install, savedProductPayloads };
}

test.describe('Allowed Substitutes ("Đổi món") Matrix — Menu Admin + POS + QR', () => {
  test('configures Đổi món matrix in /menu from legacy state, then enforces rules in /pos', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Menu Admin & Desktop POS workflow runs on desktop viewport');
    await page.setViewportSize({ width: 1366, height: 768 });

    const mock = setupSubstitutionE2ERoutes(page, { preconfiguredMatrix: false });
    await mock.install();

    // 1. Open Menu Management -> edit product 1
    await page.goto('/menu', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('edit-product-btn-1').click();
    await expect(page.getByTestId('product-form-drawer')).toBeVisible();

    // Legacy null pre-populates Ngao's checkboxes as checked (Tôm index 1, Mực index 2)
    const ngaoToTom = page.getByTestId('modifier-sub-checkbox-0-0-1');
    const ngaoToMuc = page.getByTestId('modifier-sub-checkbox-0-0-2');
    const ngaoDefaultSelect = page.getByTestId('modifier-default-sub-select-0-0');
    await expect(ngaoToTom).toBeChecked();
    await expect(ngaoToMuc).toBeChecked();

    // Uncheck Tôm & Mực for Ngao -> dropdown becomes disabled with "Chỉ bỏ, không đổi"
    await ngaoToTom.uncheck();
    await ngaoToMuc.uncheck();
    await expect(ngaoDefaultSelect).toBeDisabled();
    await expect(ngaoDefaultSelect).toHaveValue('');

    // Uncheck Ngao for Tôm (idx 1 -> sibling idx 0), leaving ONLY Mực allowed
    await page.getByTestId('modifier-sub-checkbox-0-1-0').uncheck();
    await expect(page.getByTestId('modifier-default-sub-select-0-1')).toHaveValue('Mực');

    // Audit zero horizontal overflow / clipping inside open ProductFormDrawer
    const drawerViolations = await auditPageLayout(page);
    const criticalDrawerIssues = drawerViolations.filter(
      (v) => v.rule === 'HORIZONTAL_OVERFLOW' || v.rule === 'DIALOG_OUT_OF_VIEWPORT',
    );
    expect(criticalDrawerIssues).toEqual([]);

    await page.getByTestId('save-product-submit-btn').click();
    await expect.poll(() => mock.savedProductPayloads.length).toBe(1);

    const savedGroup = (
      mock.savedProductPayloads[0]!.modifierGroups as Array<Record<string, unknown>>
    )[0]!;
    const savedModifiers = savedGroup.modifiers as Array<Record<string, unknown>>;
    expect(savedModifiers[0]).toMatchObject({
      name: 'Ngao',
      allowedSubstituteNames: [],
      defaultSubstituteName: null,
    });
    expect(savedModifiers[1]).toMatchObject({
      name: 'Tôm',
      allowedSubstituteNames: ['Mực'],
      defaultSubstituteName: 'Mực',
    });

    // 2. Navigate to POS Counter and verify saved rules immediately
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('table-card-1').click();
    await page.getByTestId('pos-menu-product-1').click();
    await expect(page.getByTestId('pos-modifier-modal')).toBeVisible();

    // Verify hint for Ngao indicates "không đổi món"
    await expect(page.getByTestId('pos-mod-group-30')).toContainText('Không Ngao, không đổi món');

    // Uncheck Ngao -> shows "Không Ngao", never "Thay thế bằng"
    await page.getByTestId('pos-mod-option-301').click();
    await expect(page.getByTestId('pos-mod-removed-301')).toHaveText('Không Ngao');
    await expect(page.getByTestId('pos-mod-substitute-301')).toHaveCount(0);

    // Uncheck Tôm -> substitutes ONLY to Mực (Ngao is not checked and not allowed)
    await page.getByTestId('pos-mod-option-302').click();
    await expect(page.getByTestId('pos-mod-substitute-302')).toContainText('Thay thế bằng Mực');
    await expect(page.getByRole('button', { name: 'Đổi sang Ngao' })).toHaveCount(0);

    // Min-1 constraint keeps Mực checked
    await page.getByTestId('pos-mod-option-303').click();
    await expect(page.getByTestId('pos-mod-option-303')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('pos-confirm-modifier-btn').click();
    await expect(page.getByTestId('draft-item-0')).toContainText('Không Ngao');
    await expect(page.getByTestId('draft-item-0')).toContainText('Không Tôm (Thay bằng Mực)');

    // 3. Click draft item directly to test round-trip hydration + manual switch for Mực -> Ngao
    await page.getByTestId('edit-draft-item-0').click();
    await expect(page.getByTestId('pos-modifier-modal')).toBeVisible();
    await expect(page.getByTestId('pos-mod-option-301')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('pos-mod-option-302')).toHaveAttribute('aria-pressed', 'false');

    // Re-check Ngao and Tôm, then uncheck Mực (allowed: ['Tôm', 'Ngao']) -> switch to Ngao
    await page.getByTestId('pos-mod-option-301').click();
    await page.getByTestId('pos-mod-option-302').click();
    await page.getByTestId('pos-mod-option-303').click();
    await expect(page.getByTestId('pos-mod-substitute-303')).toContainText('Thay thế bằng Tôm');
    await page.getByRole('button', { name: 'Đổi sang Ngao' }).click();
    await expect(page.getByTestId('pos-mod-substitute-303')).toContainText('Thay thế bằng Ngao');
    await page.getByTestId('pos-confirm-modifier-btn').click();
    await expect(page.getByTestId('draft-item-0')).toContainText('Không Mực (Thay bằng Ngao)');
  });

  test('enforces allowedSubstituteNames matrix on Customer QR /q/:token across desktop & mobile', async ({
    page,
  }) => {
    const mock = setupSubstitutionE2ERoutes(page, { preconfiguredMatrix: true });
    await mock.install();

    await page.goto(`/q/${MOCK_QR_TOKEN}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('qr-table-header')).toContainText('Bàn 01');

    await page.getByTestId('qr-product-card-1').click();
    await expect(page.getByTestId('modifier-selector-sheet')).toBeVisible();

    // Uncheck Ngao -> shows "Không Ngao", never offers Tôm/Mực substitution
    await page.getByTestId('modifier-option-301').click();
    await expect(page.getByText('Không Ngao')).toBeVisible();
    await expect(page.getByText(/Thay thế bằng/)).toHaveCount(0);

    // Uncheck Tôm -> shows "Thay thế bằng Mực" without "Đổi sang Ngao"
    await page.getByTestId('modifier-option-302').click();
    await expect(page.getByText('Thay thế bằng Mực')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đổi sang Ngao' })).toHaveCount(0);

    const qrViolations = await auditPageLayout(page);
    const criticalQrIssues = qrViolations.filter(
      (v) => v.rule === 'HORIZONTAL_OVERFLOW' || v.rule === 'DIALOG_OUT_OF_VIEWPORT',
    );
    expect(criticalQrIssues).toEqual([]);

    await page.getByTestId('confirm-modifier-btn').click();
    await expect(page.getByTestId('qr-product-cart-qty-1')).toContainText('1');
  });
});
