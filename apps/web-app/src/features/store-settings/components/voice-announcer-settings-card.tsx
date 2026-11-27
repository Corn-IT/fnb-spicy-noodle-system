import {
  interpolateMessageTemplate,
  MESSAGE_CATALOG_BY_KEY,
  type StoreMessagesMap,
} from '@fnb/shared';
import { Bell, Clock, Play, RotateCcw, Volume2 } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  clampQrReminderConfig,
  clampVoiceRate,
  clampVoiceVolume,
  DEFAULT_QR_REMINDER_CONFIG,
  DEFAULT_QR_VOICE_ENGINE_CONFIG,
  enqueueQrVoiceAlert,
  parseQrReminderConfig,
  parseQrVoiceEngineConfig,
  serializeQrReminderConfig,
  serializeQrVoiceEngineConfig,
  unlockQrVoiceAudio,
  type QrReminderConfig,
  type QrVoiceEngineConfig,
  type QrVoiceProfileType,
} from '@/lib/qr-voice-announcer';
import { cn } from '@/utils/cn';

export interface VoiceAnnouncerSettingsCardProps {
  draftMessages: StoreMessagesMap;
  onChangeMessages: (updater: (prev: StoreMessagesMap) => StoreMessagesMap) => void;
  disabled?: boolean;
}

interface BoundedNumberInputProps {
  id: string;
  testId: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  fallbackValue: number;
  onCommit: (nextValue: number) => void;
}

function BoundedNumberInput({
  id,
  testId,
  value,
  min,
  max,
  step,
  disabled,
  fallbackValue,
  onCommit,
}: BoundedNumberInputProps) {
  const [draft, setDraft] = React.useState<string>(() => String(value));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) {
      setDraft(String(value));
    }
  }, [value, focused]);

  return (
    <Input
      id={id}
      data-testid={testId}
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const nextRaw = e.target.value;
        setDraft(nextRaw);
        if (nextRaw.trim() === '') return;
        const parsed = Number(nextRaw);
        if (Number.isFinite(parsed)) {
          onCommit(parsed);
        }
      }}
      onBlur={() => {
        setFocused(false);
        const trimmed = draft.trim();
        const parsed = trimmed === '' ? fallbackValue : Number(trimmed);
        const nextVal = Number.isFinite(parsed) ? parsed : fallbackValue;
        onCommit(nextVal);
        setDraft(String(value));
      }}
      className="h-8 text-xs font-mono"
    />
  );
}

const SPEED_PRESETS = [
  { rate: 0.85, label: '0.85x (Chậm)' },
  { rate: 1, label: '1.0x (Chuẩn)' },
  { rate: 1.15, label: '1.15x (Nhanh vừa)' },
  { rate: 1.3, label: '1.3x (Nhanh)' },
] as const;

const VOICE_PROFILE_OPTIONS: ReadonlyArray<{
  value: QrVoiceProfileType;
  label: string;
  desc: string;
}> = [
  {
    value: 'vi-female-standard',
    label: 'Giọng Nữ Chuẩn (Mặc định)',
    desc: 'Giọng nữ tiếng Việt tự nhiên, đọc động mọi câu chữ tuỳ chỉnh (tự dùng file MP3 khi mất mạng).',
  },
  {
    value: 'vi-female-bright',
    label: 'Giọng Nữ Cao Rõ Nét',
    desc: 'Tông giọng nữ sáng, âm sắc cao giúp nghe rõ ràng ngay cả khi quán đông ồn ào.',
  },
  {
    value: 'offline-mp3',
    label: 'Bộ file MP3 Offline thu sẵn (Bàn 1..30)',
    desc: 'Chỉ phát từ 36 file MP3 tiếng Việt đã thu sẵn trong máy, hoạt động 100% không cần Internet.',
  },
];

export function VoiceAnnouncerSettingsCard({
  draftMessages,
  onChangeMessages,
  disabled = false,
}: VoiceAnnouncerSettingsCardProps) {
  const newOrderDef = MESSAGE_CATALOG_BY_KEY.get('pos.voice.qrNewOrder');
  const addonOrderDef = MESSAGE_CATALOG_BY_KEY.get('pos.voice.qrAddonOrder');
  const newReminderDef = MESSAGE_CATALOG_BY_KEY.get('pos.voice.qrNewReminder');
  const addonReminderDef = MESSAGE_CATALOG_BY_KEY.get('pos.voice.qrAddonReminder');
  const engineDef = MESSAGE_CATALOG_BY_KEY.get('pos.voice.engineConfig');
  const reminderConfigDef = MESSAGE_CATALOG_BY_KEY.get('pos.voice.reminderConfig');

  const newOrderTemplate =
    draftMessages['pos.voice.qrNewOrder']?.title ??
    newOrderDef?.defaultTitle ??
    '{tableLabel} có đơn mới';

  const addonOrderTemplate =
    draftMessages['pos.voice.qrAddonOrder']?.title ??
    addonOrderDef?.defaultTitle ??
    '{tableLabel} có đơn gọi thêm';

  const newReminderTemplate =
    draftMessages['pos.voice.qrNewReminder']?.title ??
    newReminderDef?.defaultTitle ??
    'Nhắc lại: {tableLabel} có đơn mới chưa xác nhận';

  const addonReminderTemplate =
    draftMessages['pos.voice.qrAddonReminder']?.title ??
    addonReminderDef?.defaultTitle ??
    'Nhắc lại: {tableLabel} có đơn gọi thêm chưa xác nhận';

  const rawEngineConfig =
    draftMessages['pos.voice.engineConfig']?.title ??
    engineDef?.defaultTitle ??
    serializeQrVoiceEngineConfig(DEFAULT_QR_VOICE_ENGINE_CONFIG);

  const engineConfig = React.useMemo(
    () => parseQrVoiceEngineConfig(rawEngineConfig),
    [rawEngineConfig],
  );

  const rawReminderConfig =
    draftMessages['pos.voice.reminderConfig']?.title ??
    reminderConfigDef?.defaultTitle ??
    serializeQrReminderConfig(DEFAULT_QR_REMINDER_CONFIG);

  const reminderConfig = React.useMemo(
    () => parseQrReminderConfig(rawReminderConfig),
    [rawReminderConfig],
  );

  const updateEngineConfig = (patch: Partial<QrVoiceEngineConfig>) => {
    const next: QrVoiceEngineConfig = {
      ...engineConfig,
      ...patch,
      rate: clampVoiceRate(patch.rate ?? engineConfig.rate),
      volume: clampVoiceVolume(patch.volume ?? engineConfig.volume),
    };
    const serialized = serializeQrVoiceEngineConfig(next);
    onChangeMessages((prev) => ({
      ...prev,
      'pos.voice.engineConfig': { title: serialized },
    }));
  };

  const updateReminderConfig = (patch: Partial<QrReminderConfig>) => {
    const next = clampQrReminderConfig({ ...reminderConfig, ...patch });
    const serialized = serializeQrReminderConfig(next);
    onChangeMessages((prev) => ({
      ...prev,
      'pos.voice.reminderConfig': { title: serialized },
    }));
  };

  const updateTemplate = (
    key:
      | 'pos.voice.qrNewOrder'
      | 'pos.voice.qrAddonOrder'
      | 'pos.voice.qrNewReminder'
      | 'pos.voice.qrAddonReminder',
    title: string,
  ) => {
    onChangeMessages((prev) => ({
      ...prev,
      [key]: { ...prev[key], title },
    }));
  };

  const handleResetDefaults = () => {
    onChangeMessages((prev) => {
      const next = { ...prev };
      delete next['pos.voice.qrNewOrder'];
      delete next['pos.voice.qrAddonOrder'];
      delete next['pos.voice.qrNewReminder'];
      delete next['pos.voice.qrAddonReminder'];
      delete next['pos.voice.engineConfig'];
      delete next['pos.voice.reminderConfig'];
      return next;
    });
  };

  const handlePreviewVoice = (kind: 'NEW' | 'ADDON', isReminder = false) => {
    void unlockQrVoiceAudio();
    const template = isReminder
      ? kind === 'ADDON'
        ? addonReminderTemplate
        : newReminderTemplate
      : kind === 'ADDON'
        ? addonOrderTemplate
        : newOrderTemplate;
    const sampleText = interpolateMessageTemplate(template, {
      tableLabel: 'Bàn 5',
      batchNo: 2,
      orderCode: 'HD-018',
    });
    void enqueueQrVoiceAlert({
      tableLabel: 'Bàn 05',
      kind,
      batchNo: 2,
      orderCode: 'HD-018',
      isReminder,
      forcePlay: true,
      customText: engineConfig.voiceProfile === 'offline-mp3' ? undefined : sampleText,
      configOverride: engineConfig,
    });
  };

  return (
    <div
      data-testid="voice-announcer-settings-card"
      className="mb-4 space-y-4 rounded-xl border bg-card p-4 sm:p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-accent-text shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-foreground">
              Cấu hình Phát thanh Giọng nói Đơn QR (Voice Announcer)
            </h3>
            <Badge variant="outline" className="text-[11px] font-semibold">
              Đồng bộ toàn quán
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Tuỳ chỉnh giọng đọc Tiếng Việt, tốc độ đọc nhanh/chậm, âm lượng và nội dung câu thông báo khi khách quét QR đặt món mới hoặc gọi thêm món. Nhấn <strong>Lưu cấu hình</strong> ở góc trên để áp dụng cho mọi máy thu ngân.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">


          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            data-testid="voice-settings-reset-btn"
            onClick={handleResetDefaults}
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Khôi phục mặc định</span>
          </Button>
        </div>
      </div>

      {/* Hàng 1: Chọn Giọng đọc Tiếng Việt */}
      <div className="space-y-2.5">
        <label className="block text-xs sm:text-sm font-semibold text-foreground">
          1. Chọn Giọng đọc Tiếng Việt
        </label>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {VOICE_PROFILE_OPTIONS.map((opt) => {
            const isSelected = engineConfig.voiceProfile === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                data-testid={`voice-profile-option-${opt.value}`}
                onClick={() => updateEngineConfig({ voiceProfile: opt.value })}
                className={cn(
                  'flex flex-col justify-between rounded-xl border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border bg-background hover:bg-muted/40 text-muted-foreground',
                  disabled && 'opacity-60 cursor-not-allowed',
                )}
              >
                <div className="text-xs font-bold text-foreground">{opt.label}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hàng 2: Chỉnh Tốc độ đọc (0.75x - 1.50x), Âm lượng & Tiếng chuông */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/20 p-3.5 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="voice-rate-slider" className="font-semibold text-foreground">
              2. Tốc độ đọc nhanh / chậm:
            </label>
            <span
              data-testid="voice-settings-rate-value"
              className="font-mono font-bold text-accent-text"
            >
              {engineConfig.rate.toFixed(2)}x
            </span>
          </div>
          <input
            id="voice-rate-slider"
            data-testid="voice-settings-rate-slider"
            type="range"
            min={0.75}
            max={1.5}
            step={0.05}
            disabled={disabled}
            value={engineConfig.rate}
            onChange={(e) => updateEngineConfig({ rate: Number(e.target.value) })}
            className="w-full cursor-pointer accent-primary"
          />
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset.rate}
                type="button"
                disabled={disabled}
                data-testid={`voice-rate-preset-${preset.rate}`}
                onClick={() => updateEngineConfig({ rate: preset.rate })}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors',
                  Math.abs(engineConfig.rate - preset.rate) < 0.02
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="voice-volume-slider" className="font-semibold text-foreground">
              3. Âm lượng & Chuông báo &ldquo;Ting-ting&rdquo;:
            </label>
            <span
              data-testid="voice-settings-volume-value"
              className="font-mono font-bold text-accent-text"
            >
              {Math.round(engineConfig.volume * 100)}%
            </span>
          </div>
          <input
            id="voice-volume-slider"
            data-testid="voice-settings-volume-slider"
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            disabled={disabled}
            value={engineConfig.volume}
            onChange={(e) => updateEngineConfig({ volume: Number(e.target.value) })}
            className="w-full cursor-pointer accent-primary"
          />
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] text-muted-foreground">
              Phát 2 nhịp chuông trước khi đọc giọng nói:
            </span>
            <Button
              type="button"
              size="sm"
              variant={engineConfig.chimeEnabled ? 'default' : 'outline'}
              disabled={disabled}
              data-testid="voice-settings-chime-toggle-btn"
              onClick={() => updateEngineConfig({ chimeEnabled: !engineConfig.chimeEnabled })}
              className="h-7 gap-1 px-2.5 text-[11px] font-semibold"
            >
              <Bell className="h-3 w-3" />
              <span>{engineConfig.chimeEnabled ? 'Chuông: Bật' : 'Chuông: Tắt'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Hàng 3: Chỉnh Nội dung câu đọc động (Đơn mới & Gọi thêm) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Mẫu câu Đơn QR mới */}
        <div className="space-y-2 rounded-xl border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="voice-new-order-template-input"
              className="text-xs sm:text-sm font-bold text-foreground"
            >
              4. Nội dung đọc khi có Đơn QR mới
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="voice-settings-test-new-btn"
              onClick={() => handlePreviewVoice('NEW')}
              className="h-7 gap-1 px-2.5 text-xs font-semibold"
            >
              <Play className="h-3 w-3 text-accent-text" />
              <span>Nghe thử</span>
            </Button>
          </div>

          <Input
            id="voice-new-order-template-input"
            data-testid="voice-new-order-template-input"
            maxLength={160}
            disabled={disabled}
            value={newOrderTemplate}
            onChange={(e) => updateTemplate('pos.voice.qrNewOrder', e.target.value)}
            placeholder="{tableLabel} có đơn mới"
            className="text-xs sm:text-sm"
          />

          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-1">
              <span>Chèn biến:</span>
              {(['tableLabel', 'orderCode'] as const).map((token) => (
                <button
                  key={token}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    updateTemplate(
                      'pos.voice.qrNewOrder',
                      `${newOrderTemplate}${newOrderTemplate.endsWith(' ') ? '' : ' '}{${token}}`,
                    )
                  }
                  className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground hover:bg-muted"
                >
                  +{`{${token}}`}
                </button>
              ))}
            </div>
            <span className="italic">
              Ví dụ đọc:{' '}
              <strong className="text-foreground">
                &ldquo;
                {interpolateMessageTemplate(newOrderTemplate, {
                  tableLabel: 'Bàn 5',
                  orderCode: 'HD-018',
                })}
                &rdquo;
              </strong>
            </span>
          </div>
        </div>

        {/* Mẫu câu Khách gọi thêm món */}
        <div className="space-y-2 rounded-xl border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="voice-addon-order-template-input"
              className="text-xs sm:text-sm font-bold text-foreground"
            >
              5. Nội dung đọc khi khách Gọi thêm món
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="voice-settings-test-addon-btn"
              onClick={() => handlePreviewVoice('ADDON')}
              className="h-7 gap-1 px-2.5 text-xs font-semibold"
            >
              <Play className="h-3 w-3 text-accent-text" />
              <span>Nghe thử</span>
            </Button>
          </div>

          <Input
            id="voice-addon-order-template-input"
            data-testid="voice-addon-order-template-input"
            maxLength={160}
            disabled={disabled}
            value={addonOrderTemplate}
            onChange={(e) => updateTemplate('pos.voice.qrAddonOrder', e.target.value)}
            placeholder="{tableLabel} có đơn gọi thêm"
            className="text-xs sm:text-sm"
          />

          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-1">
              <span>Chèn biến:</span>
              {(['tableLabel', 'batchNo', 'orderCode'] as const).map((token) => (
                <button
                  key={token}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    updateTemplate(
                      'pos.voice.qrAddonOrder',
                      `${addonOrderTemplate}${addonOrderTemplate.endsWith(' ') ? '' : ' '}{${token}}`,
                    )
                  }
                  className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground hover:bg-muted"
                >
                  +{`{${token}}`}
                </button>
              ))}
            </div>
            <span className="italic">
              Ví dụ đọc:{' '}
              <strong className="text-foreground">
                &ldquo;
                {interpolateMessageTemplate(addonOrderTemplate, {
                  tableLabel: 'Bàn 5',
                  batchNo: 2,
                  orderCode: 'HD-018',
                })}
                &rdquo;
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Hàng 4: Nhắc lại đơn QR chưa xác nhận & Tự động huỷ quá hạn */}
      <div
        data-testid="voice-reminder-settings-section"
        className="space-y-3 rounded-xl border bg-muted/20 p-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent-text shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-foreground">
              6. Nhắc lại đơn QR chưa xác nhận & Tự động huỷ quá hạn
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={reminderConfig.reminderEnabled ? 'default' : 'outline'}
              disabled={disabled}
              data-testid="voice-reminder-enabled-toggle-btn"
              onClick={() =>
                updateReminderConfig({ reminderEnabled: !reminderConfig.reminderEnabled })
              }
              className="h-7 gap-1 px-2.5 text-[11px] font-semibold"
            >
              <span>{reminderConfig.reminderEnabled ? 'Nhắc lại: Bật' : 'Nhắc lại: Tắt'}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={reminderConfig.autoCancelEnabled ? 'destructive' : 'outline'}
              disabled={disabled}
              data-testid="voice-autocancel-enabled-toggle-btn"
              onClick={() =>
                updateReminderConfig({ autoCancelEnabled: !reminderConfig.autoCancelEnabled })
              }
              className="h-7 gap-1 px-2.5 text-[11px] font-semibold"
            >
              <span>
                {reminderConfig.autoCancelEnabled ? 'Tự huỷ quá hạn: Bật' : 'Tự huỷ quá hạn: Tắt'}
              </span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label
              htmlFor="voice-reminder-delay-input"
              className="block text-xs font-semibold text-foreground"
            >
              Bắt đầu nhắc sau (phút)
            </label>
            <BoundedNumberInput
              id="voice-reminder-delay-input"
              testId="voice-reminder-delay-input"
              value={reminderConfig.reminderDelayMinutes}
              min={1}
              max={15}
              fallbackValue={5}
              disabled={disabled || !reminderConfig.reminderEnabled}
              onCommit={(nextVal) => updateReminderConfig({ reminderDelayMinutes: nextVal })}
            />
            <span className="block text-[11px] text-muted-foreground">Mặc định: 5 phút</span>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="voice-reminder-interval-input"
              className="block text-xs font-semibold text-foreground"
            >
              Khoảng lặp nhắc (giây)
            </label>
            <BoundedNumberInput
              id="voice-reminder-interval-input"
              testId="voice-reminder-interval-input"
              value={reminderConfig.reminderIntervalSeconds}
              min={15}
              max={300}
              step={15}
              fallbackValue={60}
              disabled={disabled || !reminderConfig.reminderEnabled}
              onCommit={(nextVal) => updateReminderConfig({ reminderIntervalSeconds: nextVal })}
            />
            <span className="block text-[11px] text-muted-foreground">Mặc định: 60 giây</span>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="voice-reminder-max-input"
              className="block text-xs font-semibold text-foreground"
            >
              Số lần nhắc tối đa (lần)
            </label>
            <BoundedNumberInput
              id="voice-reminder-max-input"
              testId="voice-reminder-max-input"
              value={reminderConfig.maxReminders}
              min={1}
              max={5}
              fallbackValue={2}
              disabled={disabled || !reminderConfig.reminderEnabled}
              onCommit={(nextVal) => updateReminderConfig({ maxReminders: nextVal })}
            />
            <span className="block text-[11px] text-muted-foreground">Mặc định: 2 lần rồi im loa</span>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="voice-autocancel-minutes-input"
              className="block text-xs font-semibold text-foreground"
            >
              Tự động huỷ sau (phút)
            </label>
            <BoundedNumberInput
              id="voice-autocancel-minutes-input"
              testId="voice-autocancel-minutes-input"
              value={reminderConfig.autoCancelMinutes}
              min={reminderConfig.reminderEnabled ? reminderConfig.reminderDelayMinutes + 1 : 2}
              max={60}
              fallbackValue={12}
              disabled={disabled || !reminderConfig.autoCancelEnabled}
              onCommit={(nextVal) => updateReminderConfig({ autoCancelMinutes: nextVal })}
            />
            <span className="block text-[11px] text-muted-foreground">
              Mặc định: 12 phút (phải &gt; mốc nhắc)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
          <div className="space-y-1.5 rounded-lg border bg-background p-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="voice-new-reminder-template-input"
                className="text-xs font-semibold text-foreground"
              >
                Câu nhắc Đơn QR mới
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="voice-settings-test-new-reminder-btn"
                onClick={() => handlePreviewVoice('NEW', true)}
                className="h-6 gap-1 px-2 text-[11px] font-semibold"
              >
                <Play className="h-3 w-3 text-accent-text" />
                <span>Nghe thử</span>
              </Button>
            </div>
            <Input
              id="voice-new-reminder-template-input"
              data-testid="voice-new-reminder-template-input"
              maxLength={160}
              disabled={disabled}
              value={newReminderTemplate}
              onChange={(e) => updateTemplate('pos.voice.qrNewReminder', e.target.value)}
              placeholder="Nhắc lại: {tableLabel} có đơn mới chưa xác nhận"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5 rounded-lg border bg-background p-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="voice-addon-reminder-template-input"
                className="text-xs font-semibold text-foreground"
              >
                Câu nhắc Gọi thêm QR
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="voice-settings-test-addon-reminder-btn"
                onClick={() => handlePreviewVoice('ADDON', true)}
                className="h-6 gap-1 px-2 text-[11px] font-semibold"
              >
                <Play className="h-3 w-3 text-accent-text" />
                <span>Nghe thử</span>
              </Button>
            </div>
            <Input
              id="voice-addon-reminder-template-input"
              data-testid="voice-addon-reminder-template-input"
              maxLength={160}
              disabled={disabled}
              value={addonReminderTemplate}
              onChange={(e) => updateTemplate('pos.voice.qrAddonReminder', e.target.value)}
              placeholder="Nhắc lại: {tableLabel} có đơn gọi thêm chưa xác nhận"
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
