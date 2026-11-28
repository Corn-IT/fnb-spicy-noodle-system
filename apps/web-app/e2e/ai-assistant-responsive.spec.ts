import { expect, test } from '@playwright/test';
import { setupMockApi } from './fixtures/api-mock';
import { auditPageLayout } from './utils/layout-assertions';

test.describe('Trợ lý AI Lona — Responsive Drawer, NLU & Feature Toggles', () => {
  test('opens AI drawer cleanly without layout overflow, answers synonymous product query at 0 tokens, and restores POS cleanly', async ({
    page,
  }) => {
    await setupMockApi(page);
    await page.goto('/pos');

    const navBtn = page.getByTestId('navbar-ai-assistant-btn');
    await expect(navBtn).toBeVisible();

    await navBtn.click();
    const drawer = page.getByTestId('ai-assistant-drawer');
    await expect(drawer).toBeVisible();

    const input = page.getByTestId('ai-drawer-input');
    await input.fill('Món ăn được gọi nhiều nhất là món nào?');
    await page.getByTestId('ai-drawer-send-btn').click();

    const assistantTurn = page.getByTestId('ai-turn-assistant').first();
    await expect(assistantTurn).toContainText('Mì Cay Hải Sản Thập Cẩm');
    await expect(assistantTurn).toContainText('Local 0 token');

    // Audit horizontal overflow / element bounds with drawer open
    const drawerViolations = (await auditPageLayout(page)).filter((v) =>
      ['HORIZONTAL_OVERFLOW', 'ELEMENT_OUT_OF_BOUNDS'].includes(v.rule),
    );
    expect(drawerViolations).toEqual([]);

    // Close drawer and verify page remains unobstructed
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(navBtn).toBeVisible();
  });

  test('hides navbar trigger & blocks Ctrl+J when aiAssistant.enabled is false', async ({
    page,
  }) => {
    await setupMockApi(page, {
      storeSettingsOverride: {
        aiAssistant: {
          enabled: false,
          localEnabled: true,
          geminiEnabled: true,
          syncToTelegramBot: false,
        },
      },
    });
    await page.goto('/pos');

    await expect(page.getByTestId('navbar-right-controls')).toBeVisible();
    await expect(page.getByTestId('navbar-ai-assistant-btn')).toHaveCount(0);

    await page.keyboard.press('Control+j');
    await expect(page.getByTestId('ai-assistant-drawer')).toHaveCount(0);
  });

  test('renders Trợ lý AI Lona master & sub-toggles cleanly on /settings without overflow', async ({
    page,
  }) => {
    await setupMockApi(page);
    await page.goto('/settings');

    const section = page.getByTestId('settings-ai-assistant-section');
    await expect(section).toBeVisible();
    await expect(page.getByTestId('ai-toggle-enabled')).toBeVisible();
    await expect(page.getByTestId('ai-toggle-local')).toBeVisible();
    await expect(page.getByTestId('ai-toggle-gemini')).toBeVisible();
    await expect(page.getByTestId('ai-toggle-sync-telegram')).toBeVisible();

    const violations = (await auditPageLayout(page)).filter((v) =>
      ['HORIZONTAL_OVERFLOW', 'ELEMENT_OUT_OF_BOUNDS', 'TEXT_CLIPPED'].includes(v.rule),
    );
    expect(violations).toEqual([]);
  });
});
