import type { AiAssistantSettings } from '@fnb/shared';
import { AlertTriangle, Bot, Cpu, Radio, Sparkles } from 'lucide-react';
import type * as React from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/cn';

export interface AiAssistantSettingsPanelProps {
  value: AiAssistantSettings;
  disabled?: boolean;
  onChange: React.Dispatch<React.SetStateAction<AiAssistantSettings>>;
}

export function AiAssistantSettingsPanel({
  value,
  disabled = false,
  onChange,
}: AiAssistantSettingsPanelProps) {
  const showBothEnginesDisabledWarning =
    value.enabled && !value.localEnabled && !value.geminiEnabled;

  return (
    <div
      data-testid="settings-ai-assistant-section"
      className="space-y-3 border-t pt-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Bot className="h-4 w-4 text-accent-text shrink-0" />
            <span>Trợ lý AI Lona</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Bật hoặc tắt linh hoạt khung chat Lona AI trên Web POS và từng nhánh xử lý Local 0-token / Gemini AI.
          </p>
        </div>
      </div>

      {/* Công tắc tổng */}
      <label
        className={cn(
          'flex items-start gap-3 rounded-xl border p-3.5 transition-colors',
          value.enabled ? 'border-primary/40 bg-primary/5' : 'bg-muted/30',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40',
        )}
      >
        <Checkbox
          checked={value.enabled}
          disabled={disabled}
          data-testid="ai-toggle-enabled"
          aria-label="Bật Trợ lý AI Lona trên Web POS"
          onCheckedChange={(checked) =>
            onChange((prev) => ({
              ...prev,
              enabled: Boolean(checked),
            }))
          }
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              Bật Trợ lý AI Lona trên Web POS
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                value.enabled
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {value.enabled ? 'Đang bật' : 'Đang tắt'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Khi tắt, nút &ldquo;Hỏi Lona AI&rdquo; trên thanh đầu trang, phím tắt Ctrl+J và API chat Web POS sẽ ngừng hoạt động ngay lập tức.
          </p>
        </div>
      </label>

      {/* 2 config con: AI Local & AI Gemini */}
      <div
        className={cn(
          'grid grid-cols-1 gap-3 md:grid-cols-2 transition-opacity',
          !value.enabled && 'opacity-60',
        )}
      >
        <label
          className={cn(
            'flex items-start gap-3 rounded-xl border bg-background p-3.5 transition-colors',
            value.localEnabled && value.enabled && 'border-emerald-500/40 bg-emerald-500/5',
            disabled || !value.enabled
              ? 'cursor-not-allowed opacity-70'
              : 'cursor-pointer hover:bg-muted/40',
          )}
        >
          <Checkbox
            checked={value.localEnabled}
            disabled={disabled || !value.enabled}
            data-testid="ai-toggle-local"
            aria-label="Bật AI Local (0 token)"
            onCheckedChange={(checked) =>
              onChange((prev) => ({
                ...prev,
                localEnabled: Boolean(checked),
              }))
            }
            className="mt-0.5"
          />
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <Cpu className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>AI Local (0 token)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Trả lời ngữ nghĩa tiếng Việt, fast-path số liệu POS và hướng dẫn sử dụng tức thì ~0.1s, không tốn hạn mức Gemini.
            </p>
          </div>
        </label>

        <label
          className={cn(
            'flex items-start gap-3 rounded-xl border bg-background p-3.5 transition-colors',
            value.geminiEnabled && value.enabled && 'border-sky-500/40 bg-sky-500/5',
            disabled || !value.enabled
              ? 'cursor-not-allowed opacity-70'
              : 'cursor-pointer hover:bg-muted/40',
          )}
        >
          <Checkbox
            checked={value.geminiEnabled}
            disabled={disabled || !value.enabled}
            data-testid="ai-toggle-gemini"
            aria-label="Bật AI Gemini (Multi-Pool)"
            onCheckedChange={(checked) =>
              onChange((prev) => ({
                ...prev,
                geminiEnabled: Boolean(checked),
              }))
            }
            className="mt-0.5"
          />
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <Sparkles className="h-3.5 w-3.5 text-sky-600 shrink-0" />
              <span>AI Gemini (Phân tích sâu)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Xử lý câu hỏi mở, gợi ý vận hành và truy vấn linh hoạt theo RBAC khi Local NLU chưa bao phủ.
            </p>
          </div>
        </label>
      </div>

      {/* Đồng bộ sang Bot #2 Telegram */}
      <label
        className={cn(
          'flex items-start gap-3 rounded-xl border bg-background p-3 transition-colors',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40',
        )}
      >
        <Checkbox
          checked={value.syncToTelegramBot}
          disabled={disabled}
          data-testid="ai-toggle-sync-telegram"
          aria-label="Đồng bộ cấu hình AI Local và Gemini sang Bot Telegram"
          onCheckedChange={(checked) =>
            onChange((prev) => ({
              ...prev,
              syncToTelegramBot: Boolean(checked),
            }))
          }
          className="mt-0.5"
        />
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
            <Radio className="h-3.5 w-3.5 text-accent-text shrink-0" />
            <span>Đồng bộ trạng thái Local/Gemini sang Bot #2 Telegram</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Khi bật, Bot Telegram quản trị sẽ đọc trực tiếp cấu hình nhánh Local &amp; Gemini từ Cài đặt quán thay vì chạy cố định theo file môi trường VPS.
          </p>
        </div>
      </label>

      {showBothEnginesDisabledWarning ? (
        <div
          role="alert"
          data-testid="ai-toggle-both-off-warning"
          className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Cảnh báo: Bạn đang bật Trợ lý AI Lona nhưng tắt cả AI Local lẫn AI Gemini — nhân viên gửi câu hỏi sẽ nhận thông báo tạm tắt động cơ xử lý.
          </span>
        </div>
      ) : null}
    </div>
  );
}
