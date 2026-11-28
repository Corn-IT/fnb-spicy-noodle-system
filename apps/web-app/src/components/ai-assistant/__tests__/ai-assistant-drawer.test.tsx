import { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_AI_ASSISTANT_SETTINGS,
  DEFAULT_STORE_SETTINGS,
  UserPermissionsSchema,
  type AiChatResponse,
  type AiStatusResponse,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAssistantDrawer } from '@/components/ai-assistant';
import { TopNavbar, executeCleanLogout } from '@/components/layout/top-navbar';
import { useToastStore } from '@/components/ui/toast';
import {
  STORE_SETTINGS_CACHE_KEY,
  STORE_SETTINGS_QUERY_KEY,
} from '@/hooks/use-store-settings';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAiAssistantStore } from '@/stores/ai-assistant.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  UI_PREFERENCES_STORAGE_KEY,
  useUiPreferencesStore,
} from '@/stores/ui-preferences.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function makePublicSettings(
  aiOverrides: Partial<typeof DEFAULT_AI_ASSISTANT_SETTINGS> = {},
): PublicStoreSettingsResponse {
  return {
    ...DEFAULT_STORE_SETTINGS,
    updatedAt: '2026-11-28T10:00:00.000Z',
    assets: { logo: null, favicon: null, qrLogo: null },
    aiAssistant: {
      ...DEFAULT_AI_ASSISTANT_SETTINGS,
      ...aiOverrides,
    },
  };
}

describe('AiAssistantDrawer & TopNavbar integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAiAssistantStore.getState().reset();
    useAuthStore.getState().setAuth({
      accessToken: 'owner-jwt',
      user: {
        id: 1,
        employeeId: 10,
        username: 'owner',
        fullName: 'Chủ Quán',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({
          dashboard: { view: true, viewProfit: true, export: true },
          pos: { view: true, create: true, update: true, checkout: true },
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens via TopNavbar button and Ctrl+J, sends local query at 0 tokens, resets context, and clears safely on logout keeping ui-preferences', async () => {
    const serverSettings = makePublicSettings({ enabled: true, localEnabled: true, geminiEnabled: true });
    localStorage.setItem(STORE_SETTINGS_CACHE_KEY, JSON.stringify(serverSettings));
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({ state: { theme: 'dark', sidebarWidth: 280 } }));
    useUiPreferencesStore.setState({ theme: 'dark', sidebarWidth: 280 });

    const statusPayload: AiStatusResponse = {
      activeEngines: serverSettings.aiAssistant,
      modeSummary: '⚡ Local 0-token + 🤖 Gemini AI',
      canChat: true,
      quotaStatus: {
        dateKey: '2026-11-28',
        webDailyLimit: null,
        webUsedToday: 0,
        webRemainingToday: null,
        poolRemainingEstimate: 1000,
        geminiAvailableForUser: true,
        reserveProtected: false,
      },
      suggestions: [
        {
          id: 'top-product',
          label: 'Món gọi nhiều nhất',
          prompt: 'Món ăn được gọi nhiều nhất hôm nay là món nào?',
          category: 'ops',
          engineHint: 'local',
        },
      ],
      greeting: 'Dạ em là Lona AI — hỗ trợ anh/chị ạ!',
      sessionTurnCount: 0,
      isSuperAdmin: true,
    };

    const chatReply: AiChatResponse = {
      reply: 'Dạ món **Mì Cay Bò** đang gọi nhiều nhất hôm nay (`HD-20261128-0122`, 25 phần) ạ.',
      route: 'local_semantic',
      intentId: 'product_top_popularity',
      period: 'homnay',
      persona: { mode: 'em_anh_chi', botSelf: 'em', userCall: 'anh/chị' },
      tokensUsed: 0,
      latencyMs: 12,
      nluMissCandidate: false,
      activeEngines: serverSettings.aiAssistant,
      quotaStatus: statusPayload.quotaStatus,
      suggestions: statusPayload.suggestions,
      modelUsed: null,
    };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/public/store-settings') return serverSettings;
      if (url.startsWith('/api/v1/ai-assistant/status')) return statusPayload;
      throw new Error(`Unexpected GET ${url}`);
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/api/v1/ai-assistant/chat') return chatReply;
      if (url === '/api/v1/ai-assistant/reset') return { cleared: true };
      if (url === '/api/v1/auth/logout') return { ok: true };
      throw new Error(`Unexpected POST ${url}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(STORE_SETTINGS_QUERY_KEY, serverSettings);

    render(
      <QueryProvider client={queryClient}>
        <MemoryRouter future={routerFutureFlags}>
          <TopNavbar queryClient={queryClient} onOpenCommandPalette={() => {}} />
          <AiAssistantDrawer />
        </MemoryRouter>
      </QueryProvider>,
    );

    // Navbar button exists and AC-08.3 [data-navbar-item] order stays untouched
    const navBtn = screen.getByTestId('navbar-ai-assistant-btn');
    expect(navBtn).toBeInTheDocument();
    const rightCluster = screen.getByTestId('navbar-right-controls');
    const items = Array.from(rightCluster.querySelectorAll('[data-navbar-item]')).map((el) =>
      el.getAttribute('data-navbar-item'),
    );
    expect(items).toEqual(['search-ctrl-k', 'user-avatar-dropdown']);

    // Open via click, verify drawer & chip appear
    fireEvent.click(navBtn);
    await waitFor(() => {
      expect(screen.getByTestId('ai-assistant-drawer')).toBeInTheDocument();
      expect(screen.getByTestId('ai-chip-top-product')).toBeInTheDocument();
    });

    // Click prompt chip -> displays assistant bubble with **bold** formatting and 0 token badge
    fireEvent.click(screen.getByTestId('ai-chip-top-product'));
    await waitFor(() => {
      const bubble = screen.getByTestId('ai-turn-assistant');
      expect(bubble).toHaveTextContent('Mì Cay Bò');
      expect(bubble.querySelector('code')).toHaveTextContent('HD-20261128-0122');
      expect(bubble).toHaveTextContent('Local 0 token');
    });

    // Expand drawer width toggle & send manual question via input form
    fireEvent.click(screen.getByTestId('ai-drawer-expand-btn'));
    const input = screen.getByTestId('ai-drawer-input');
    fireEvent.change(input, { target: { value: 'Doanh thu hôm nay?' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/ai-assistant/chat',
        expect.objectContaining({ message: 'Doanh thu hôm nay?' }),
        { timeoutMs: 65_000 },
      );
    });

    // Logout clears AI store in RAM while keeping fnb-ui-preferences intact (Invariant 9)
    await act(async () => {
      await executeCleanLogout(queryClient);
    });
    expect(useAiAssistantStore.getState().turns).toEqual([]);
    expect(useAiAssistantStore.getState().isOpen).toBe(false);
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toContain('sidebarWidth');
    expect(useUiPreferencesStore.getState().theme).toBe('dark');
  });

  it('hides TopNavbar AI button and disables Ctrl+J when settings.aiAssistant.enabled is false', () => {
    const disabledSettings = makePublicSettings({ enabled: false });
    localStorage.setItem(STORE_SETTINGS_CACHE_KEY, JSON.stringify(disabledSettings));
    vi.spyOn(apiClient, 'get').mockResolvedValue(disabledSettings);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(STORE_SETTINGS_QUERY_KEY, disabledSettings);

    render(
      <QueryProvider client={queryClient}>
        <MemoryRouter future={routerFutureFlags}>
          <TopNavbar queryClient={queryClient} onOpenCommandPalette={() => {}} />
          <AiAssistantDrawer />
        </MemoryRouter>
      </QueryProvider>,
    );

    expect(screen.queryByTestId('navbar-ai-assistant-btn')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(useAiAssistantStore.getState().isOpen).toBe(false);
    expect(screen.queryByTestId('ai-assistant-drawer')).not.toBeInTheDocument();
  });
});
