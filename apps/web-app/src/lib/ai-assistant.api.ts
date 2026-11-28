import {
  AiChatResponseSchema,
  AiResetResponseSchema,
  AiStatusResponseSchema,
  type AiChatRequest,
  type AiChatResponse,
  type AiResetResponse,
  type AiStatusResponse,
} from '@fnb/shared';
import { apiClient } from '@/lib/api-client';

export async function fetchAiAssistantStatus(
  clientSessionId?: string,
): Promise<AiStatusResponse> {
  const payload = await apiClient.get<unknown>('/api/v1/ai-assistant/status', {
    params: clientSessionId ? { clientSessionId } : undefined,
  });
  return AiStatusResponseSchema.parse(payload);
}

export async function sendAiAssistantMessage(
  request: AiChatRequest,
): Promise<AiChatResponse> {
  const payload = await apiClient.post<unknown>('/api/v1/ai-assistant/chat', request);
  return AiChatResponseSchema.parse(payload);
}

export async function resetAiAssistantSession(
  clientSessionId?: string,
): Promise<AiResetResponse> {
  const payload = await apiClient.post<unknown>(
    '/api/v1/ai-assistant/reset',
    clientSessionId ? { clientSessionId } : {},
  );
  return AiResetResponseSchema.parse(payload);
}
