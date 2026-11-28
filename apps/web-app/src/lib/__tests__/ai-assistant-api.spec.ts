import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_CHAT_TIMEOUT_MS,
  AI_STATUS_TIMEOUT_MS,
  fetchAiAssistantStatus,
  sendAiAssistantMessage,
} from '@/lib/ai-assistant.api';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { UserPermissionsSchema } from '@fnb/shared';

describe('ai-assistant.api & custom apiClient timeoutMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.getState().setAuth({
      accessToken: 'jwt-test',
      user: {
        id: 1,
        employeeId: 1,
        username: 'owner',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useAuthStore.getState().clearAuth();
  });

  it('allows sendAiAssistantMessage to wait past 15s using AI_CHAT_TIMEOUT_MS (65s)', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted', 'AbortError')),
          { once: true },
        );
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    let settled = false;
    const pending = sendAiAssistantMessage({ message: 'Phân tích doanh thu tuần' }).catch(
      (err: unknown) => {
        settled = true;
        return err;
      },
    );

    await vi.advanceTimersByTimeAsync(20_000);
    expect(settled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(AI_CHAT_TIMEOUT_MS - 20_000);
    const err = await pending;
    expect(settled).toBe(true);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).statusCode).toBe(408);
    expect((err as ApiClientError).message).toContain('65 giây');
  });

  it('passes AI_STATUS_TIMEOUT_MS and AI_CHAT_TIMEOUT_MS cleanly to apiClient', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      activeEngines: { enabled: true, localEnabled: true, geminiEnabled: true, syncToTelegramBot: false },
      modeSummary: 'Local + Gemini',
      canChat: true,
      quotaStatus: {
        dateKey: '2026-11-28',
        webDailyLimit: null,
        webUsedToday: 0,
        webRemainingToday: null,
        geminiAvailableForUser: true,
        reserveProtected: false,
      },
      suggestions: [],
      greeting: 'Dạ em chào anh/chị ạ!',
      sessionTurnCount: 0,
      isSuperAdmin: true,
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      reply: 'OK',
      route: 'local_semantic',
      intentId: null,
      period: null,
      persona: { mode: 'em_anh_chi', botSelf: 'em', userCall: 'anh/chị' },
      tokensUsed: 0,
      latencyMs: 5,
      nluMissCandidate: false,
      activeEngines: { enabled: true, localEnabled: true, geminiEnabled: true, syncToTelegramBot: false },
      quotaStatus: {
        dateKey: '2026-11-28',
        webDailyLimit: null,
        webUsedToday: 0,
        webRemainingToday: null,
        geminiAvailableForUser: true,
        reserveProtected: false,
      },
      suggestions: [],
      modelUsed: null,
    });

    await fetchAiAssistantStatus('tab_1');
    expect(getSpy).toHaveBeenCalledWith('/api/v1/ai-assistant/status', {
      params: { clientSessionId: 'tab_1' },
      timeoutMs: AI_STATUS_TIMEOUT_MS,
    });

    await sendAiAssistantMessage({ message: 'Doanh thu hôm nay', clientSessionId: 'tab_1' });
    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/ai-assistant/chat',
      { message: 'Doanh thu hôm nay', clientSessionId: 'tab_1' },
      { timeoutMs: AI_CHAT_TIMEOUT_MS },
    );
  });
});
