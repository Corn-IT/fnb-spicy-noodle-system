import {
  type AiChatTurn,
  type AiEngineRoute,
  type AiQuotaStatus,
  type AiStatusResponse,
  type AiSuggestionChip,
  type UserPermissions,
} from '@fnb/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Bot,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { useStoreSettings } from '@/hooks/use-store-settings';
import {
  fetchAiAssistantStatus,
  resetAiAssistantSession,
  sendAiAssistantMessage,
} from '@/lib/ai-assistant.api';
import { useAiAssistantStore } from '@/stores/ai-assistant.store';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

function buildFallbackSuggestions(
  isSuperAdmin: boolean,
  permissions: UserPermissions | undefined,
  geminiEnabled: boolean,
): AiSuggestionChip[] {
  const chips: AiSuggestionChip[] = [];
  if (isSuperAdmin || permissions?.dashboard?.view) {
    chips.push(
      {
        id: 'top-product',
        label: 'Món gọi nhiều nhất',
        prompt: 'Món ăn được gọi nhiều nhất hôm nay là món nào?',
        category: 'ops',
        engineHint: 'local',
      },
      {
        id: 'overview',
        label: 'Tổng quan hôm nay',
        prompt: 'Tổng quan tình hình kinh doanh hôm nay',
        category: 'ops',
        engineHint: 'local',
      },
    );
  }
  if (isSuperAdmin || permissions?.pos?.view) {
    chips.push({
      id: 'live-tables',
      label: 'Bàn đang phục vụ',
      prompt: 'Hiện tại có bao nhiêu bàn đang phục vụ?',
      category: 'ops',
      engineHint: 'local',
    });
  }
  if (isSuperAdmin || permissions?.cashflow?.view) {
    chips.push({
      id: 'cash-drawer',
      label: 'Kiểm tra két tiền',
      prompt: 'Kiểm tra két tiền chốt ca hôm nay',
      category: 'finance',
      engineHint: 'local',
    });
  }
  if (isSuperAdmin || permissions?.schedules?.view) {
    chips.push({
      id: 'schedule',
      label: 'Lịch trực hôm nay',
      prompt: 'Lịch trực hôm nay có những ai?',
      category: 'hr',
      engineHint: 'local',
    });
  }
  chips.push({
    id: 'pos-guide',
    label: 'Cách tách bếp & in',
    prompt: 'Quy tắc tách bếp COMBO và in RawBT 80mm hoạt động thế nào?',
    category: 'system',
    engineHint: 'local',
  });
  if (geminiEnabled && (isSuperAdmin || permissions?.dashboard?.view)) {
    chips.push({
      id: 'trend',
      label: 'Phân tích xu hướng',
      prompt: 'Phân tích chi tiết xu hướng doanh thu tuần này và đề xuất món nên đẩy bán',
      category: 'ops',
      engineHint: 'gemini',
    });
  }
  return chips.slice(0, 6);
}

/** XSS-safe inline formatter for lightweight **bold**, <b>...</b>, and `code` segments returned by Lona. */
function renderFormattedInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|<b>[^<]+<\/b>|`[^`]+`)/g);
  return parts.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    if (segment.startsWith('<b>') && segment.endsWith('</b>') && segment.length > 7) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {segment.slice(3, -4)}
        </strong>
      );
    }
    if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-background/70 px-1 py-0.5 font-mono text-[12px] font-medium text-foreground"
        >
          {segment.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={index}>{segment}</React.Fragment>;
  });
}

function renderMessageBody(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => (
    <React.Fragment key={lineIdx}>
      {renderFormattedInline(line)}
      {lineIdx < lines.length - 1 ? <br /> : null}
    </React.Fragment>
  ));
}

function getRouteBadgeMeta(turn: AiChatTurn): {
  label: string;
  variant: 'success' | 'info' | 'warning' | 'destructive' | 'secondary';
} {
  const route: AiEngineRoute = turn.route ?? 'local_semantic';
  switch (route) {
    case 'gemini':
      return {
        label: `Gemini AI · ${turn.tokensUsed} token${turn.modelUsed ? ` · ${turn.modelUsed}` : ''}`,
        variant: 'info',
      };
    case 'system_kb':
      return { label: 'KB Hệ thống · 0 token', variant: 'success' };
    case 'fast_path':
    case 'local_semantic':
      return { label: 'Local 0 token', variant: 'success' };
    case 'rbac_block':
      return { label: 'Giới hạn RBAC · 0 token', variant: 'warning' };
    case 'guardrail_block':
      return { label: 'Guardrail · 0 token', variant: 'destructive' };
    case 'quota_exceeded':
    case 'engine_disabled':
    default:
      return { label: '0 token', variant: 'secondary' };
  }
}

function formatQuotaBanner(
  statusData: AiStatusResponse | undefined,
  liveQuota: AiQuotaStatus | null,
  geminiEnabled: boolean,
  localEnabled: boolean,
): { text: string; tone: 'neutral' | 'warn' } {
  if (!localEnabled && !geminiEnabled) {
    return { text: 'Cả 2 động cơ Local & Gemini đang tạm tắt trong /settings', tone: 'warn' };
  }
  if (!geminiEnabled) {
    return { text: 'Chỉ chạy AI Local (0 token · siêu nhanh)', tone: 'neutral' };
  }
  const q = liveQuota ?? statusData?.quotaStatus;
  if (!q) {
    return {
      text: localEnabled ? 'Local 0-token + Gemini AI sẵn sàng' : 'Chế độ AI Gemini đang hoạt động',
      tone: 'neutral',
    };
  }
  if (q.webDailyLimit === null) {
    return {
      text: `Quản trị viên · Pool còn ~${q.poolRemainingEstimate ?? 0} lượt hôm nay`,
      tone: 'neutral',
    };
  }
  if ((q.webRemainingToday ?? 0) <= 0) {
    return {
      text: `Đã dùng hết ${q.webDailyLimit}/${q.webDailyLimit} lượt Gemini hôm nay — Local 0-token vẫn dùng bình thường`,
      tone: 'warn',
    };
  }
  return {
    text: `Hạn mức Gemini hôm nay: ${q.webRemainingToday}/${q.webDailyLimit} lượt`,
    tone: 'neutral',
  };
}

export function AiAssistantDrawer() {
  const { settings } = useStoreSettings();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  const isOpen = useAiAssistantStore((state) => state.isOpen);
  const isExpanded = useAiAssistantStore((state) => state.isExpanded);
  const clientSessionId = useAiAssistantStore((state) => state.clientSessionId);
  const turns = useAiAssistantStore((state) => state.turns);
  const quotaStatus = useAiAssistantStore((state) => state.quotaStatus);
  const setOpen = useAiAssistantStore((state) => state.setOpen);
  const toggleDrawer = useAiAssistantStore((state) => state.toggleDrawer);
  const setExpanded = useAiAssistantStore((state) => state.setExpanded);
  const appendExchange = useAiAssistantStore((state) => state.appendExchange);
  const setQuotaStatus = useAiAssistantStore((state) => state.setQuotaStatus);
  const clearConversation = useAiAssistantStore((state) => state.clearConversation);

  const [draftInput, setDraftInput] = React.useState('');
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [isSlowAiWait, setIsSlowAiWait] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

  const aiConfig = settings.aiAssistant;
  const isFeatureEnabled = Boolean(accessToken && user && aiConfig.enabled);

  // Close immediately if feature flag is disabled in realtime via Socket
  React.useEffect(() => {
    if (!aiConfig.enabled && isOpen) {
      setOpen(false);
    }
  }, [aiConfig.enabled, isOpen, setOpen]);

  // Keyboard shortcut Ctrl+J / Cmd+J (only active when Trợ lý AI Lona is enabled)
  React.useEffect(() => {
    if (!isFeatureEnabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        toggleDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFeatureEnabled, toggleDrawer]);

  const statusQuery = useQuery<AiStatusResponse>({
    queryKey: ['ai-assistant-status', clientSessionId, aiConfig.localEnabled, aiConfig.geminiEnabled],
    queryFn: () => fetchAiAssistantStatus(clientSessionId),
    enabled: isFeatureEnabled && isOpen,
    staleTime: 20_000,
    retry: false,
  });

  React.useEffect(() => {
    if (statusQuery.data?.quotaStatus) {
      setQuotaStatus(statusQuery.data.quotaStatus);
    }
  }, [statusQuery.data, setQuotaStatus]);

  React.useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [turns.length, isOpen]);

  const chatMutation = useMutation({
    mutationFn: (messageText: string) =>
      sendAiAssistantMessage({
        message: messageText,
        clientSessionId,
      }),
    onMutate: () => {
      setErrorBanner(null);
    },
    onSuccess: (response, sentMessage) => {
      const nowIso = new Date().toISOString();
      appendExchange({
        userTurn: {
          id: `u-${Date.now()}`,
          role: 'user',
          text: sentMessage,
          tokensUsed: 0,
          timestamp: nowIso,
        },
        assistantTurn: {
          id: `a-${Date.now() + 1}`,
          role: 'assistant',
          text: response.reply,
          route: response.route,
          intentId: response.intentId ?? null,
          tokensUsed: response.tokensUsed,
          latencyMs: response.latencyMs,
          modelUsed: response.modelUsed ?? null,
          timestamp: nowIso,
        },
        quotaStatus: response.quotaStatus,
      });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Không thể kết nối Trợ lý AI Lona.';
      setErrorBanner(msg);
    },
  });

  React.useEffect(() => {
    if (!chatMutation.isPending) {
      setIsSlowAiWait(false);
      return;
    }
    const slowHintTimer = window.setTimeout(() => setIsSlowAiWait(true), 4500);
    return () => window.clearTimeout(slowHintTimer);
  }, [chatMutation.isPending]);

  const resetMutation = useMutation({
    mutationFn: () => resetAiAssistantSession(clientSessionId),
    onSuccess: () => {
      clearConversation();
      setErrorBanner(null);
      toast({
        title: 'Đã làm mới hội thoại AI Lona',
        variant: 'info',
        duration: 2000,
      });
    },
  });

  if (!isFeatureEnabled) {
    return null;
  }

  const effectiveEngines = statusQuery.data?.activeEngines ?? aiConfig;
  const canSendChat =
    effectiveEngines.enabled &&
    (effectiveEngines.localEnabled || effectiveEngines.geminiEnabled);

  const suggestions =
    statusQuery.data?.suggestions && statusQuery.data.suggestions.length > 0
      ? statusQuery.data.suggestions
      : buildFallbackSuggestions(
          Boolean(user?.isSuperAdmin),
          user?.permissions,
          effectiveEngines.geminiEnabled,
        );

  const modeBadgeLabel = !effectiveEngines.localEnabled && !effectiveEngines.geminiEnabled
    ? 'Đang tạm tắt cả 2 nhánh'
    : effectiveEngines.localEnabled && effectiveEngines.geminiEnabled
      ? 'Local 0-token + Gemini AI'
      : effectiveEngines.localEnabled
        ? 'Chỉ Local 0-token'
        : 'Chỉ Gemini AI';

  const quotaInfo = formatQuotaBanner(
    statusQuery.data,
    quotaStatus,
    effectiveEngines.geminiEnabled,
    effectiveEngines.localEnabled,
  );

  const handleSend = (textOverride?: string) => {
    const trimmed = (textOverride ?? draftInput).trim();
    if (!trimmed || chatMutation.isPending || !canSendChat) return;
    if (!textOverride) {
      setDraftInput('');
    }
    chatMutation.mutate(trimmed);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        data-testid="ai-assistant-drawer"
        className={cn(
          'flex flex-col gap-0 p-0',
          isExpanded ? 'w-full sm:max-w-[680px]' : 'w-full sm:max-w-[440px]',
        )}
      >
        <SheetHeader className="border-b bg-card px-4 py-3.5 pr-12 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent-text">
                <Bot className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-1.5 text-base font-bold">
                  <span className="truncate">Lona AI · Trợ lý Quán</span>
                </SheetTitle>
                <SheetDescription className="truncate text-xs">
                  {modeBadgeLabel}
                </SheetDescription>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden sm:inline-flex h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label={isExpanded ? 'Thu gọn khung chat' : 'Mở rộng khung chat'}
                data-testid="ai-drawer-expand-btn"
                onClick={() => setExpanded(!isExpanded)}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Xóa ngữ cảnh hội thoại"
                data-testid="ai-drawer-reset-btn"
                disabled={resetMutation.isPending || turns.length === 0}
                onClick={() => resetMutation.mutate()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden min-[380px]:inline">Mới</span>
              </Button>
            </div>
          </div>

          <div
            data-testid="ai-drawer-quota-strip"
            className={cn(
              'mt-2 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium',
              quotaInfo.tone === 'warn'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                : 'border-border/70 bg-muted/40 text-muted-foreground',
            )}
          >
            <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="truncate">{quotaInfo.text}</span>
          </div>
        </SheetHeader>

        {/* Nội dung hội thoại */}
        <div
          data-testid="ai-drawer-messages"
          className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3"
        >
          {turns.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-3.5 text-sm text-foreground">
                <p className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-accent-text shrink-0" />
                  <span>Xin chào {user?.fullName || user?.username}!</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {statusQuery.data?.greeting ??
                    'Dạ em là Lona AI — hỗ trợ tra cứu số liệu vận hành theo đúng quyền RBAC tài khoản và hướng dẫn sử dụng hệ thống POS.'}
                </p>
              </div>

              {suggestions.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Gợi ý phù hợp với quyền của bạn
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {suggestions.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        data-testid={`ai-chip-${chip.id}`}
                        disabled={!canSendChat || chatMutation.isPending}
                        onClick={() => handleSend(chip.prompt)}
                        className="flex flex-col items-start gap-1 rounded-xl border bg-card p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent/50 disabled:opacity-50"
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-xs font-bold text-foreground">{chip.label}</span>
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {chip.engineHint === 'gemini' ? '🤖 AI' : '⚡ 0 token'}
                          </span>
                        </div>
                        <span className="line-clamp-2 text-[11px] text-muted-foreground">
                          {chip.prompt}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            turns.map((turn) => {
              const isUser = turn.role === 'user';
              const badgeMeta = !isUser ? getRouteBadgeMeta(turn) : null;
              return (
                <div
                  key={turn.id}
                  data-testid={isUser ? 'ai-turn-user' : 'ai-turn-assistant'}
                  className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}
                >
                  <div
                    className={cn(
                      'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words shadow-2xs',
                      isUser
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'border bg-muted/50 text-foreground rounded-bl-sm',
                    )}
                  >
                    {renderMessageBody(turn.text)}
                  </div>

                  {!isUser && badgeMeta ? (
                    <div className="flex flex-wrap items-center gap-1.5 px-1">
                      <Badge variant={badgeMeta.variant} className="px-1.5 py-0 text-[10px]">
                        {badgeMeta.label}
                      </Badge>
                      {typeof turn.latencyMs === 'number' ? (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {turn.latencyMs}ms
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}

          {chatMutation.isPending ? (
            <div
              data-testid="ai-loading-indicator"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-text" />
              <span>
                {isSlowAiWait
                  ? 'Lona đang phân tích sâu qua Gemini (vui lòng chờ trong giây lát)...'
                  : 'Lona đang kiểm tra dữ liệu...'}
              </span>
            </div>
          ) : null}

          {errorBanner ? (
            <div
              role="alert"
              data-testid="ai-drawer-error-banner"
              className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorBanner}</span>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer & Composer */}
        <div className="border-t bg-card p-3 space-y-2 shrink-0">
          {turns.length > 0 && suggestions.length > 0 ? (
            <div
              data-scroll-intended="true"
              className="flex items-center gap-1.5 overflow-x-auto pb-1"
            >
              {suggestions.slice(0, 4).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  disabled={!canSendChat || chatMutation.isPending}
                  onClick={() => handleSend(chip.prompt)}
                  className="shrink-0 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}

          {!canSendChat ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Cả AI Local và AI Gemini đều đang tạm tắt. Quản trị viên có thể bật lại trong Cài đặt.</span>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              rows={2}
              maxLength={1000}
              disabled={!canSendChat || chatMutation.isPending}
              value={draftInput}
              onChange={(event) => setDraftInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              data-testid="ai-drawer-input"
              placeholder="Hỏi Lona về món bán chạy, doanh thu, bàn, két tiền, hướng dẫn POS... (Ctrl+J)"
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-2xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!canSendChat || chatMutation.isPending || draftInput.trim().length === 0}
              data-testid="ai-drawer-send-btn"
              aria-label="Gửi câu hỏi cho Lona AI"
              className="h-11 w-11 shrink-0 rounded-xl"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
