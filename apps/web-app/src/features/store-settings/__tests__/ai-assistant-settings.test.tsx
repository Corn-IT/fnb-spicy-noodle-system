import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  DEFAULT_AI_ASSISTANT_SETTINGS,
  DEFAULT_STORE_SETTINGS,
  UserPermissionsSchema,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { StoreSettingsPage } from '@/features/store-settings';
import { AiAssistantSettingsPanel } from '@/features/store-settings/components/ai-assistant-settings-panel';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

describe('StoreSettingsPage — Trợ lý AI Lona Feature Toggles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({
      accessToken: 'admin-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        fullName: 'Chủ Quán',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({
          settings: { view: true, update: true },
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows inline warning when enabled=true but both localEnabled and geminiEnabled are false, and disables sub-toggles when master is false', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AiAssistantSettingsPanel
        value={{
          enabled: true,
          localEnabled: false,
          geminiEnabled: false,
          syncToTelegramBot: false,
        }}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId('ai-toggle-both-off-warning')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ai-toggle-enabled'));
    const updater = onChange.mock.calls[0]?.[0] as (
      prev: { enabled: boolean; localEnabled: boolean; geminiEnabled: boolean; syncToTelegramBot: boolean },
    ) => unknown;
    expect(typeof updater).toBe('function');
    expect(
      updater({
        enabled: true,
        localEnabled: false,
        geminiEnabled: false,
        syncToTelegramBot: false,
      }),
    ).toMatchObject({ enabled: false });

    rerender(
      <AiAssistantSettingsPanel
        value={{
          enabled: false,
          localEnabled: true,
          geminiEnabled: true,
          syncToTelegramBot: true,
        }}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('ai-toggle-local')).toBeDisabled();
    expect(screen.getByTestId('ai-toggle-gemini')).toBeDisabled();
    expect(screen.queryByTestId('ai-toggle-both-off-warning')).not.toBeInTheDocument();
  });

  it('persists aiAssistant master & sub-toggles through StoreSettingsPage PUT /api/v1/settings', async () => {
    const serverSettings: PublicStoreSettingsResponse = {
      ...DEFAULT_STORE_SETTINGS,
      updatedAt: '2026-11-28T10:00:00.000Z',
      assets: { logo: null, favicon: null, qrLogo: null },
      aiAssistant: { ...DEFAULT_AI_ASSISTANT_SETTINGS },
    };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/settings') || url.startsWith('/api/v1/public/store-settings')) {
        return serverSettings;
      }
      if (url.startsWith('/api/v1/store-messages')) {
        return { messages: {}, updatedAt: '2026-11-28T10:00:00.000Z' };
      }
      if (url.startsWith('/api/v1/audit-logs')) {
        return { items: [], total: 0, page: 1, limit: 20 };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const putSpy = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => ({
      ...serverSettings,
      ...(body as Partial<PublicStoreSettingsResponse>),
      updatedAt: '2026-11-28T10:05:00.000Z',
    }));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={routerFutureFlags}>
          <StoreSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
      expect(screen.getByTestId('settings-ai-assistant-section')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('ai-toggle-gemini'));
    fireEvent.click(screen.getByTestId('ai-toggle-sync-telegram'));
    fireEvent.click(screen.getByTestId('store-settings-save-btn'));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          aiAssistant: {
            enabled: true,
            localEnabled: true,
            geminiEnabled: false,
            syncToTelegramBot: true,
          },
        }),
      );
    });
  });
});
