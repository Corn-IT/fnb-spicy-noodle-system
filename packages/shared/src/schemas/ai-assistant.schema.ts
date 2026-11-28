import { z } from 'zod';
import { IsoDateTimeSchema } from './common.schema';

export const AiEngineRouteValues = [
  'local_semantic',
  'fast_path',
  'system_kb',
  'gemini',
  'guardrail_block',
  'rbac_block',
  'engine_disabled',
  'quota_exceeded',
] as const;

export type AiEngineRoute = (typeof AiEngineRouteValues)[number];
export const AiEngineRouteSchema = z.enum(AiEngineRouteValues);

export const AiAddressingModeValues = [
  'em_anh_chi',
  'em_anh',
  'em_chi',
  'con_co_chu',
  'minh_ban',
  'em_sep',
] as const;

export type AiAddressingMode = (typeof AiAddressingModeValues)[number];
export const AiAddressingModeSchema = z.enum(AiAddressingModeValues);

export const AiPeriodCodeValues = [
  'homnay',
  'homqua',
  'tuan',
  'tuantruoc',
  'thang',
  'thangtruoc',
  'nam',
  '7ngay',
  '30ngay',
] as const;

export type AiPeriodCode = (typeof AiPeriodCodeValues)[number];
export const AiPeriodCodeSchema = z.enum(AiPeriodCodeValues);

export const AiPersonaProfileSchema = z.object({
  mode: AiAddressingModeSchema,
  botSelf: z.string().min(1).max(24),
  userCall: z.string().min(1).max(24),
});
export type AiPersonaProfile = z.infer<typeof AiPersonaProfileSchema>;

export const AiSuggestionCategoryValues = [
  'ops',
  'finance',
  'inventory',
  'hr',
  'system',
] as const;
export type AiSuggestionCategory = (typeof AiSuggestionCategoryValues)[number];

export const AiSuggestionChipSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  prompt: z.string().min(1).max(240),
  category: z.enum(AiSuggestionCategoryValues),
  engineHint: z.enum(['local', 'gemini']),
});
export type AiSuggestionChip = z.infer<typeof AiSuggestionChipSchema>;

export const AiActiveEnginesSchema = z.object({
  enabled: z.boolean(),
  localEnabled: z.boolean(),
  geminiEnabled: z.boolean(),
  syncToTelegramBot: z.boolean(),
});
export type AiActiveEngines = z.infer<typeof AiActiveEnginesSchema>;

export const AiQuotaStatusSchema = z.object({
  dateKey: z.string().min(8).max(16),
  webDailyLimit: z.number().int().min(0).nullable(),
  webUsedToday: z.number().int().min(0),
  webRemainingToday: z.number().int().min(0).nullable(),
  poolRemainingEstimate: z.number().int().min(0).optional(),
  geminiAvailableForUser: z.boolean(),
  reserveProtected: z.boolean(),
});
export type AiQuotaStatus = z.infer<typeof AiQuotaStatusSchema>;

export const AiChatTurnSchema = z.object({
  id: z.string().min(1).max(80),
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(8000),
  route: AiEngineRouteSchema.optional(),
  intentId: z.string().nullable().optional(),
  tokensUsed: z.number().int().min(0).default(0),
  latencyMs: z.number().int().min(0).optional(),
  modelUsed: z.string().nullable().optional(),
  timestamp: IsoDateTimeSchema,
});
export type AiChatTurn = z.infer<typeof AiChatTurnSchema>;

export const AiChatRequestSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập câu hỏi cho Trợ lý AI')
      .max(1000, 'Câu hỏi tối đa 1000 ký tự'),
    clientSessionId: z
      .string()
      .trim()
      .min(4)
      .max(100)
      .regex(/^[a-zA-Z0-9._:-]+$/, 'Mã phiên chat không hợp lệ')
      .optional(),
    personaHint: z.string().trim().max(32).optional(),
  })
  .strict();
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

export const AiChatResponseSchema = z.object({
  reply: z.string().min(1),
  route: AiEngineRouteSchema,
  intentId: z.string().nullable().default(null),
  period: AiPeriodCodeSchema.nullable().default(null),
  persona: AiPersonaProfileSchema,
  tokensUsed: z.number().int().min(0),
  latencyMs: z.number().int().min(0),
  nluMissCandidate: z.boolean().default(false),
  activeEngines: AiActiveEnginesSchema,
  quotaStatus: AiQuotaStatusSchema,
  suggestions: z.array(AiSuggestionChipSchema).max(12).default([]),
  modelUsed: z.string().nullable().default(null),
});
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;

export const AiStatusResponseSchema = z.object({
  activeEngines: AiActiveEnginesSchema,
  modeSummary: z.string().min(1),
  canChat: z.boolean(),
  quotaStatus: AiQuotaStatusSchema,
  suggestions: z.array(AiSuggestionChipSchema).max(12),
  greeting: z.string().min(1),
  sessionTurnCount: z.number().int().min(0),
  isSuperAdmin: z.boolean(),
});
export type AiStatusResponse = z.infer<typeof AiStatusResponseSchema>;

export const AiResetRequestSchema = z
  .object({
    clientSessionId: z
      .string()
      .trim()
      .min(4)
      .max(100)
      .regex(/^[a-zA-Z0-9._:-]+$/, 'Mã phiên chat không hợp lệ')
      .optional(),
  })
  .strict();
export type AiResetRequest = z.infer<typeof AiResetRequestSchema>;

export const AiResetResponseSchema = z.object({
  cleared: z.boolean(),
});
export type AiResetResponse = z.infer<typeof AiResetResponseSchema>;
