import type { AiPeriodCode, AiPersonaProfile } from '../schemas/ai-assistant.schema';
import {
  SEMANTIC_INTENT_SPEC,
  type SemanticEntityKey,
  type SemanticIntentId,
  type SemanticMetricKey,
} from './semantic-intents';

export interface SemanticMatchResult {
  readonly matched: boolean;
  readonly intentId: SemanticIntentId | null;
  readonly routeHint: 'local_semantic' | 'fast_path' | 'system_kb' | 'gemini_fallback';
  readonly requiredPermission: string | null;
  readonly commandEquivalent: string | null;
  readonly sortBy?: 'quantity' | 'revenue' | 'slow';
  readonly mode?: 'single' | 'list' | 'snapshot' | 'comparison' | 'report' | 'knowledge' | 'count';
  readonly cleanText: string;
  readonly normText: string;
  readonly entities: readonly SemanticEntityKey[];
  readonly metrics: readonly SemanticMetricKey[];
  readonly period: AiPeriodCode;
  readonly periodLabel: string;
  readonly explicitPeriod: boolean;
  readonly guardBlocked: boolean;
  readonly guardId: string | null;
  readonly topLimit: number;
  readonly explicitLimit: boolean;
  readonly orderTypeFilter: 'TAKEAWAY' | 'DINE_IN' | null;
  readonly orderStatusFilter?: 'PAID' | 'SERVING' | 'PENDING' | 'UNPAID' | null;
  readonly orderCode: string | null;
  readonly tableNumber: number | null;
  readonly persona: AiPersonaProfile;
  readonly confidence: number;
}

const SLASH_COMMAND_SET = new Set([
  'tongquan',
  'ban',
  'don',
  'doanhthu',
  'ket',
  'qr',
  'topmon',
  'bep',
  'kho',
  'khuyenmai',
  'huy',
  'audit',
  'lich',
  'luong',
  'loinhuan',
  'help',
]);

const LEADING_VOCATIVE_RE =
  /^(?:@?[a-z0-9_]+bot\b[\s,.:!?-]*|(?:hey|hi|hello|halo|chào|chao|alo)\s+(?:em|anh|chị|chi|bạn|ban|lona|bot|trợ\s+lý|tro\s+ly)\b[\s,.:!?-]*|(?:lona|bot|trợ\s+lý(?:\s+lona)?|tro\s+ly(?:\s+lona)?|em|em\s+lona)\s*(?:ơi|oi|à|a|né|ne|nha|nhé|nhe|nhỉ|nhi)\b[\s,.:!?-]*)/iu;
const TRAILING_VOCATIVE_RE =
  /[\s,.:!?-]+(?:vậy|vay|thế|the|lona(?:\s+(?:ơi|oi|à|a|né|ne))?|bot(?:\s+(?:ơi|oi|à|a))?|em\s+(?:ơi|oi)|nha|nhé|nhe|nhỉ|nhi|à|a|ạ)\s*[?!.]*$/iu;

const OFF_TOPIC_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /\b(?:viet\s+code|lap\s+trinh|python|javascript|typescript|thuat\s+toan|leetcode|giai\s+phuong\s+trinh|tich\s+phan|dao\s+ham|vat\s+ly|hoa\s+hoc|sinh\s+hoc|lich\s+su|dia\s+ly|tieng\s+anh\s+dich|dich\s+sang|tho\s+luc\s+bat|viet\s+van|lam\s+tho|ke\s+chuyen\s+cuoi|tu\s+vi|phong\s+thuy|xo\s+so|chung\s+khoan|bitcoin|crypto|forex|bong\s+da|world\s+cup)\b/,
    reason: 'Câu hỏi nằm ngoài phạm vi vận hành Quán Mì Cay & hệ thống POS.',
  },
  {
    pattern: /\b(?:thoi\s+tiet\s+ngay|gia\s+vang\s+hom|tin\s+tuc\s+the\s+gioi|ai\s+la\s+tong\s+thong|nau\s+mon\s+bo\s+kho|cong\s+thuc\s+pho\s+bo)\b/,
    reason: 'Trợ lý AI Lona chỉ hỗ trợ số liệu bán hàng, vận hành và hướng dẫn hệ thống POS của quán.',
  },
];

const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
  /forget\s+(?:your\s+)?(?:rules|system\s+prompt|instructions)/i,
  /bo\s+qua\s+(?:tat\s+ca\s+)?(?:quy\s+tac|huong\s+dan|chi\s+dan)/i,
  /in\s+(?:ra\s+)?(?:system\s+prompt|cau\s+hinh\s+noi\s+bo|secret|api\s*key|mat\s+khau)/i,
  /\b(?:drop|delete|truncate|alter|update|insert)\s+(?:table|from|into|database)\b/i,
  /--\s*$|;\s*(?:drop|delete|truncate|update|alter)\b/i,
];

/** Normalizes Vietnamese text into lowercase ASCII with `đ/Đ -> d` and single spaces. */
export function stripVietnamese(input: string): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s/_:#.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPhrase(haystack: string, phrases: readonly string[]): boolean {
  const cleanHay = haystack.replace(/[?!.,;:()[\]{}"'`]+/g, ' ').replace(/\s+/g, ' ').trim();
  const padded = ` ${cleanHay} `;
  for (const rawPhrase of phrases) {
    const phrase = rawPhrase.trim();
    if (!phrase) continue;
    if (padded.includes(` ${phrase} `)) {
      return true;
    }
  }
  return false;
}

/** Strips polite bot addressing cues like "Lona ơi..." while preserving core question intent. */
export function stripBotAddressing(
  rawText: string,
  botUsername = 'POS_Lona_bot',
): { cleanText: string; normClean: string; directlyAddressed: boolean } {
  let clean = String(rawText ?? '').trim();
  let directlyAddressed = false;

  const escapedBot = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentionRe = new RegExp(`(?:^|\\s)@${escapedBot}\\b`, 'gi');
  if (mentionRe.test(clean)) {
    directlyAddressed = true;
    clean = clean.replace(mentionRe, ' ').trim();
  }

  for (let i = 0; i < 3; i += 1) {
    const strippedLead = clean.replace(LEADING_VOCATIVE_RE, '').trim();
    if (strippedLead !== clean) {
      directlyAddressed = true;
      clean = strippedLead;
    } else {
      break;
    }
  }

  for (let i = 0; i < 3; i += 1) {
    const strippedTrail = clean.replace(TRAILING_VOCATIVE_RE, '').trim();
    if (strippedTrail !== clean && strippedTrail.length >= 4) {
      directlyAddressed = true;
      clean = strippedTrail;
    } else {
      break;
    }
  }

  const normClean = stripVietnamese(clean);
  if (!directlyAddressed && hasPhrase(normClean, SEMANTIC_INTENT_SPEC.botAliases)) {
    directlyAddressed = true;
  }

  return { cleanText: clean || String(rawText ?? '').trim(), normClean, directlyAddressed };
}

/** Detects natural Vietnamese addressing profile (never falling back to robotic "Tôi"). */
export function detectAddressingMode(
  rawText: string,
  personaHint?: string | null,
): AiPersonaProfile {
  const norm = stripVietnamese(`${personaHint ?? ''} ${rawText}`);
  for (const rule of SEMANTIC_INTENT_SPEC.personaRules) {
    if (hasPhrase(norm, rule.cues)) {
      return {
        mode: rule.mode,
        botSelf: rule.botSelf,
        userCall: rule.userCall,
      };
    }
  }
  return { ...SEMANTIC_INTENT_SPEC.defaultPersona };
}

/** Extracts normalized reporting period (`homnay`, `homqua`, `tuan`, ...) from text. */
export function extractPeriodCode(inputText: string): {
  period: AiPeriodCode;
  label: string;
  explicit: boolean;
} {
  const normText = stripVietnamese(inputText);
  for (const rule of SEMANTIC_INTENT_SPEC.periodRules) {
    if (hasPhrase(normText, rule.phrases)) {
      return { period: rule.period, label: rule.label, explicit: true };
    }
  }
  return { period: 'homnay', label: 'Hôm nay', explicit: false };
}

const VI_SMALL_NUMBERS: Readonly<Record<string, number>> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  nam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  muoi: 10,
};

/** Extracts explicit ranking/item size and flags whether caller specified a count explicitly. */
export function extractLimitWithFlag(
  inputText: string,
  fallback = 5,
): { topLimit: number; explicitLimit: boolean } {
  const normText = stripVietnamese(inputText);
  const digitMatch = normText.match(
    /\btop\s*(\d{1,2})\b|\b(\d{1,2})\s+(?:mon|don(?:\s+mang\s+ve|\s+tai\s+ban|\s+tai\s+quan)?|hoa\s+don|cai|ban)\b/,
  );
  if (digitMatch) {
    const val = Number(digitMatch[1] ?? digitMatch[2]);
    if (Number.isFinite(val) && val >= 1) {
      return { topLimit: Math.min(20, Math.max(1, Math.trunc(val))), explicitLimit: true };
    }
  }
  const wordMatch = normText.match(
    /\b(mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+(?:don(?:\s+mang\s+ve|\s+tai\s+ban|\s+tai\s+quan)?|hoa\s+don|mon|cai)\b/,
  );
  if (wordMatch) {
    const mapped = VI_SMALL_NUMBERS[wordMatch[1] ?? ''];
    if (mapped) {
      return { topLimit: mapped, explicitLimit: true };
    }
  }
  return { topLimit: fallback, explicitLimit: false };
}

/** Extracts explicit ranking size (`top 5`, `10 mon`, default 5 bounded to 1..20). */
export function extractTopLimit(inputText: string, fallback = 5): number {
  return extractLimitWithFlag(inputText, fallback).topLimit;
}

/** Extracts explicit order fulfillment filter (`TAKEAWAY` vs `DINE_IN`) when specified. */
export function extractOrderTypeFilter(inputText: string): 'TAKEAWAY' | 'DINE_IN' | null {
  const normText = stripVietnamese(inputText);
  if (hasPhrase(normText, ['mang ve', 'takeaway', 'mua ve', 'ship', 'giao di', 'don ngoai'])) {
    return 'TAKEAWAY';
  }
  if (hasPhrase(normText, ['tai ban', 'an tai quan', 'tai quan', 'tai cho', 'dine in'])) {
    return 'DINE_IN';
  }
  return null;
}

/** Extracts explicit order lifecycle status filter when caller asks about unpaid/pending/serving/paid orders. */
export function extractOrderStatusFilter(
  inputText: string,
): 'PAID' | 'SERVING' | 'PENDING' | 'UNPAID' | null {
  const normText = stripVietnamese(inputText);
  if (hasPhrase(normText, ['chua thanh toan', 'chua tra tien', 'con no', 'chua xong'])) {
    return 'UNPAID';
  }
  if (hasPhrase(normText, ['cho xac nhan', 'cho duyet', 'don moi gui'])) {
    return 'PENDING';
  }
  if (hasPhrase(normText, ['da thanh toan', 'da tra tien'])) {
    return 'PAID';
  }
  if (hasPhrase(normText, ['dang phuc vu']) && !hasPhrase(normText, ['ban dang phuc vu', 'bao nhieu ban'])) {
    return 'SERVING';
  }
  return null;
}

/** Extracts explicit table number (`bàn 05`, `bàn số 12`) when asked directly. */
export function extractTableNumber(inputText: string): number | null {
  const normText = stripVietnamese(inputText);
  const match = normText.match(/\bban(?:\s+so)?\s*#?(\d{1,3})\b/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Extracts explicit order code (`HD-...` or `ORD-...`). */
export function extractOrderCode(rawText: string): string | null {
  const match = rawText.match(/\b((?:HD|ORD)-[A-Za-z0-9-]+)\b/i);
  return match ? match[1]!.toUpperCase() : null;
}

/** Checks prompt injection or non-shop off-topic guardrails cleanly at 0 tokens. */
export function checkGuardrailBlock(rawText: string): {
  blocked: boolean;
  kind: 'injection' | 'off_topic' | null;
  reason: string | null;
} {
  const norm = stripVietnamese(rawText);
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(rawText) || pattern.test(norm)) {
      return {
        blocked: true,
        kind: 'injection',
        reason: 'Yêu cầu chứa cú pháp can thiệp hệ thống hoặc truy vấn không an toàn nên không được xử lý.',
      };
    }
  }
  for (const rule of OFF_TOPIC_PATTERNS) {
    if (rule.pattern.test(norm)) {
      return {
        blocked: true,
        kind: 'off_topic',
        reason: rule.reason,
      };
    }
  }
  return { blocked: false, kind: null, reason: null };
}

/** Detects whether text asks about POS/system manual, hardware, or hard business rules. */
export function detectSystemDocQuestion(inputText: string): boolean {
  return hasPhrase(stripVietnamese(inputText), SEMANTIC_INTENT_SPEC.systemDocCues);
}

/** Parses explicit slash command (`/topmon tuan`, `/ban`, ...) if entered directly. */
export function classifyFastPathCommand(rawText: string): { command: string; arg: string } | null {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = (parts[0] ?? '').split('@')[0]?.toLowerCase() ?? '';
  if (!SLASH_COMMAND_SET.has(cmd)) return null;
  return { command: cmd, arg: parts.slice(1).join(' ').trim() };
}

function detectEntities(rawLower: string, normText: string): SemanticEntityKey[] {
  const found: SemanticEntityKey[] = [];
  for (const [entityKey, rule] of Object.entries(SEMANTIC_INTENT_SPEC.entities) as Array<
    [SemanticEntityKey, (typeof SEMANTIC_INTENT_SPEC.entities)[SemanticEntityKey]]
  >) {
    if (!hasPhrase(normText, rule.keywords)) continue;
    const disamb = rule.accentDisambiguation;
    if (disamb?.requireNoneRaw?.some((bad) => rawLower.includes(bad))) {
      continue;
    }
    if (disamb?.disqualifyIfRawOnly?.some((sellWord) => rawLower.includes(sellWord))) {
      const hasTableAccent =
        rawLower.includes('bàn') ||
        hasPhrase(normText, ['ban trong', 'ban dang', 'ban so', 'cho ngoi', 'mang ve']);
      if (!hasTableAccent) continue;
    }
    found.push(entityKey);
  }
  return found;
}

function detectMetrics(normText: string): SemanticMetricKey[] {
  const found: SemanticMetricKey[] = [];
  for (const [metricKey, phrases] of Object.entries(SEMANTIC_INTENT_SPEC.metrics) as Array<
    [SemanticMetricKey, readonly string[]]
  >) {
    if (hasPhrase(normText, phrases)) {
      found.push(metricKey);
    }
  }
  return found;
}

const INTENT_BY_ID = new Map(
  SEMANTIC_INTENT_SPEC.intentDefinitions.map((def) => [def.id, def]),
);

function buildMatchResult(
  intentId: SemanticIntentId,
  routeHint: SemanticMatchResult['routeHint'],
  ctx: {
    cleanText: string;
    normText: string;
    entities: SemanticEntityKey[];
    metrics: SemanticMetricKey[];
    period: AiPeriodCode;
    periodLabel: string;
    explicitPeriod: boolean;
    topLimit: number;
    explicitLimit: boolean;
    orderTypeFilter: 'TAKEAWAY' | 'DINE_IN' | null;
    orderStatusFilter?: 'PAID' | 'SERVING' | 'PENDING' | 'UNPAID' | null;
    orderCode: string | null;
    tableNumber: number | null;
    persona: AiPersonaProfile;
    confidence: number;
  },
): SemanticMatchResult {
  const def = INTENT_BY_ID.get(intentId);
  return {
    matched: true,
    intentId,
    routeHint,
    requiredPermission: def?.requiredPermission ?? 'authenticated',
    commandEquivalent: def?.commandEquivalent ?? null,
    sortBy: (def?.sortBy as SemanticMatchResult['sortBy']) ?? undefined,
    mode: (def?.mode as SemanticMatchResult['mode']) ?? undefined,
    cleanText: ctx.cleanText,
    normText: ctx.normText,
    entities: ctx.entities,
    metrics: ctx.metrics,
    period: ctx.period,
    periodLabel: ctx.periodLabel,
    explicitPeriod: ctx.explicitPeriod,
    guardBlocked: false,
    guardId: null,
    topLimit: ctx.topLimit,
    explicitLimit: ctx.explicitLimit,
    orderTypeFilter: ctx.orderTypeFilter,
    orderStatusFilter: ctx.orderStatusFilter ?? null,
    orderCode: ctx.orderCode,
    tableNumber: ctx.tableNumber,
    persona: ctx.persona,
    confidence: ctx.confidence,
  };
}

/**
 * Deterministic Vietnamese Semantic Intent Grammar matcher shared between Web POS (TS) and Bot #2 (Python).
 * Ensures synonymous phrasings like "Món ăn bán chạy nhất là món nào" and
 * "Món ăn được gọi nhiều nhất là món nào" both resolve cleanly at 0 Gemini tokens.
 */
export function matchSemanticIntent(
  rawText: string,
  options?: { personaHint?: string | null; botUsername?: string },
): SemanticMatchResult {
  const persona = detectAddressingMode(rawText, options?.personaHint);
  const { cleanText, normClean } = stripBotAddressing(rawText, options?.botUsername);
  const rawLower = cleanText.toLowerCase();
  const { period, label: periodLabel, explicit: explicitPeriod } = extractPeriodCode(normClean);
  const entities = detectEntities(rawLower, normClean);
  const metrics = detectMetrics(normClean);
  const { topLimit, explicitLimit } = extractLimitWithFlag(normClean, 5);
  const orderTypeFilter = extractOrderTypeFilter(normClean);
  const orderStatusFilter = extractOrderStatusFilter(normClean);
  const orderCode = extractOrderCode(cleanText);
  const tableNumber = extractTableNumber(normClean);

  const baseCtx = {
    cleanText,
    normText: normClean,
    entities,
    metrics,
    period,
    periodLabel,
    explicitPeriod,
    topLimit,
    explicitLimit,
    orderTypeFilter,
    orderStatusFilter,
    orderCode,
    tableNumber,
    persona,
  };

  // 0. System / Manual Q&A takes priority over negativeGuards & data metrics unless pure analytics requested
  const isAnalyticsOverride = hasPhrase(normClean, [
    'phan tich chi tiet',
    'phan tich sau',
    'xu huong',
    'du bao',
    'du doan',
    'nhan dinh',
    'chien luoc',
    'de xuat',
    'goi y cai thien',
    'tu van giup',
  ]);
  const hasEntity = (e: SemanticEntityKey): boolean => entities.includes(e);
  const hasMetric = (m: SemanticMetricKey): boolean => metrics.includes(m);
  const hasNumericalAnalyticsCue =
    hasEntity('revenue') ||
    hasMetric('popularity_high') ||
    hasMetric('popularity_low') ||
    hasMetric('density_high') ||
    hasMetric('density_low') ||
    hasPhrase(normClean, [
      'hom qua',
      'tuan nay',
      'thang nay',
      '7 ngay',
      '30 ngay',
      'bao nhieu don',
      'co may don',
      'bao nhieu ban',
      'co may ban',
      'bao nhieu tien',
      'ban duoc',
      'da ban',
      'hom nay co may',
    ]);
  const isSystemRuleWhyQuestion =
    hasPhrase(normClean, ['tai sao', 'vi sao']) &&
    hasPhrase(normClean, [
      'tam tinh',
      'chuyen khoan',
      'ket tien',
      'mang ve',
      'tach bep',
      'combo',
      'dang xuat',
      'bi da',
      'bi vang',
      '401',
      '403',
      'blind mode',
      'single session',
    ]) &&
    !hasNumericalAnalyticsCue;

  if (!isAnalyticsOverride && ((detectSystemDocQuestion(normClean) && !hasNumericalAnalyticsCue) || isSystemRuleWhyQuestion)) {
    return buildMatchResult('system_docs', 'system_kb', { ...baseCtx, confidence: 0.96 });
  }

  // 1. Negative guard (causal / analytical / strategic advice -> Gemini AI)
  for (const guard of SEMANTIC_INTENT_SPEC.negativeGuards) {
    if (hasPhrase(normClean, guard.phrases)) {
      return {
        matched: false,
        intentId: null,
        routeHint: 'gemini_fallback',
        requiredPermission: null,
        commandEquivalent: null,
        cleanText,
        normText: normClean,
        entities,
        metrics,
        period,
        periodLabel,
        explicitPeriod,
        guardBlocked: true,
        guardId: guard.id,
        topLimit,
        explicitLimit,
        orderTypeFilter,
        orderStatusFilter,
        orderCode,
        tableNumber,
        persona,
        confidence: 0,
      };
    }
  }

  const hasSuperlative = hasPhrase(normClean, SEMANTIC_INTENT_SPEC.cardinality.superlativeCues);
  const hasListCue = hasPhrase(normClean, SEMANTIC_INTENT_SPEC.cardinality.listCues);

  // 2. Period comparison ("hom nay so voi hom qua", "so sanh doanh thu hom nay voi hom qua")
  if (
    hasPhrase(normClean, ['so sanh', 'so voi', 'chenh lech', 'tang hay giam', 'vs ']) &&
    hasPhrase(normClean, ['hom qua', 'tuan truoc', 'thang truoc'])
  ) {
    const cmpPeriod: AiPeriodCode = normClean.includes('thang')
      ? 'thang'
      : normClean.includes('tuan')
        ? 'tuan'
        : 'homnay';
    const cmpLabel =
      cmpPeriod === 'thang' ? 'Tháng này' : cmpPeriod === 'tuan' ? 'Tuần này' : 'Hôm nay';
    return buildMatchResult('period_comparison', 'local_semantic', {
      ...baseCtx,
      period: cmpPeriod,
      periodLabel: cmpLabel,
      confidence: 0.94,
    });
  }

  // 3. Superlatives & Leaderboard Matrix (Entity × Metric × Polarity × Cardinality)
  const implicitProductContext =
    hasEntity('product') ||
    hasMetric('popularity_high') ||
    hasMetric('popularity_low');

  if (implicitProductContext && !hasEntity('hour') && !hasEntity('staff') && !hasEntity('void') && !hasEntity('table')) {
    if (hasMetric('popularity_low')) {
      return buildMatchResult('product_slow_popularity', 'local_semantic', { ...baseCtx, confidence: 0.95 });
    }
    if (hasMetric('revenue_high') && hasEntity('product')) {
      return buildMatchResult(
        hasListCue ? 'product_list_revenue' : 'product_top_revenue',
        'local_semantic',
        { ...baseCtx, confidence: 0.95 },
      );
    }
    if (hasMetric('popularity_high') || (hasEntity('product') && hasSuperlative && hasPhrase(normClean, ['nhieu', 'chay', 'hot']))) {
      return buildMatchResult(
        hasListCue ? 'product_list_popularity' : 'product_top_popularity',
        'local_semantic',
        { ...baseCtx, confidence: 0.97 },
      );
    }
  }

  if (hasEntity('hour')) {
    if (hasMetric('density_low') || hasPhrase(normClean, ['it khach nhat', 'vang nhat'])) {
      return buildMatchResult('hour_quiet_density', 'local_semantic', { ...baseCtx, confidence: 0.92 });
    }
    if (hasMetric('density_high') || hasMetric('popularity_high') || hasMetric('revenue_high') || hasSuperlative) {
      return buildMatchResult('hour_peak_density', 'local_semantic', { ...baseCtx, confidence: 0.95 });
    }
  }

  if (hasEntity('staff') || hasEntity('void')) {
    if (hasMetric('void_action') || (hasEntity('staff') && hasEntity('void'))) {
      return buildMatchResult('staff_top_void', 'local_semantic', { ...baseCtx, confidence: 0.94 });
    }
    if (
      hasEntity('staff') &&
      (hasMetric('popularity_high') || hasMetric('density_high') || hasMetric('revenue_high') || hasSuperlative)
    ) {
      return buildMatchResult('staff_top_orders', 'local_semantic', { ...baseCtx, confidence: 0.93 });
    }
  }

  if (hasPhrase(normClean, ['ai dang dang nhap', 'dang dang nhap', 'phien dang nhap', 'thiet bi nao dang', 'ai dang online', 'ip dang nhap'])) {
    return buildMatchResult('active_sessions', 'fast_path', { ...baseCtx, confidence: 0.93 });
  }

  if (hasPhrase(normClean, ['danh sach nhan vien', 'co bao nhieu nhan vien', 'co may nhan vien', 'tong so nhan vien', 'tong nhan su', 'nhan su gom', 'ai la nhan vien'])) {
    return buildMatchResult('staff_list', 'fast_path', { ...baseCtx, confidence: 0.93 });
  }

  if (orderCode) {
    return buildMatchResult('order_detail', 'local_semantic', { ...baseCtx, confidence: 0.95 });
  }

  const isCashflowKeyword = hasPhrase(normClean, ['ket', 'ket tien', 'chot ca', 'ket ca', 'dau ca', 'kiem ket', 'chenh lech ket', 'trong ket']);
  const hasQrOrderSlice = hasPhrase(normClean, ['don qr', 'don khach quet qr', 'khach quet qr', 'khach tu dat', 'dat qua qr']);
  const isPaymentSlice =
    hasQrOrderSlice ||
    (!hasPhrase(normClean, ['han muc', 'tai khoan ngan hang', 'tai khoan nhan']) &&
      !hasMetric('recent_list') &&
      (hasPhrase(normClean, ['chuyen khoan', 'phuong thuc thanh toan', 'tien mat hay chuyen khoan', 'thu tien mat', 'doanh thu tien mat']) ||
        (!isCashflowKeyword && hasPhrase(normClean, ['tien mat', 'thu mat']) && hasPhrase(normClean, ['doanh thu', 'thu', 'thanh toan', 'bao nhieu', 'vs']))));
  if (isPaymentSlice) {
    return buildMatchResult('payment_breakdown', 'local_semantic', { ...baseCtx, confidence: 0.93 });
  }

  const hasExplicitMenuCue = hasPhrase(normClean, [
    'thuc don',
    'menu',
    'bang gia',
    'tam het',
    'het mon',
    'tam ngung',
    'gia bao nhieu',
    'bao nhieu tien',
    'gia mon',
    'con ban khong',
    'mon dat nhat',
    'mon re nhat',
    'bao nhieu mon',
    'co may mon',
    'tong so mon',
    'ban duoc may',
    'ban duoc bao nhieu phan',
    'bao nhieu phan',
    'may phan',
    'may ly',
    'may to',
  ]);
  const hasGenericMenuListCue =
    !hasMetric('popularity_high') &&
    !hasMetric('popularity_low') &&
    !hasEntity('order') &&
    hasPhrase(normClean, ['danh sach mon', 'cac mon an', 'nhung mon an', 'ban nhung mon gi', 'co nhung mon gi', 'co mon gi', 'co mon nao']);

  if (
    (hasExplicitMenuCue || hasGenericMenuListCue) &&
    !hasPhrase(normClean, ['mon do', 'mon nay', 'don do', 'don nay']) &&
    !hasEntity('order') &&
    !hasEntity('table') &&
    !hasEntity('cashflow') &&
    !hasEntity('payroll') &&
    !hasEntity('schedule')
  ) {
    return buildMatchResult('menu_catalog', 'local_semantic', { ...baseCtx, confidence: 0.92 });
  }

  if (
    !hasEntity('void') &&
    !hasEntity('staff') &&
    !hasEntity('revenue') &&
    !hasEntity('profit') &&
    !hasEntity('qr') &&
    (hasEntity('order') ||
      orderStatusFilter !== null ||
      (orderTypeFilter !== null && (hasMetric('recent_list') || hasMetric('count_query'))))
  ) {
    if (hasMetric('revenue_high') && hasSuperlative) {
      return buildMatchResult('order_top_value', 'local_semantic', { ...baseCtx, confidence: 0.93 });
    }
    if (hasMetric('count_query')) {
      return buildMatchResult('order_count', 'local_semantic', { ...baseCtx, confidence: 0.94 });
    }
    if (
      hasMetric('recent_list') ||
      orderStatusFilter !== null ||
      hasPhrase(normClean, ['cac don', 'nhung don', 'don nao', 'liet ke don', 'danh sach don', 'xem don'])
    ) {
      return buildMatchResult('recent_orders', 'local_semantic', { ...baseCtx, confidence: 0.94 });
    }
  }

  if (
    tableNumber !== null ||
    (hasEntity('table') && (hasMetric('status_active') || hasSuperlative || normClean.includes('ban')))
  ) {
    return buildMatchResult('table_live_status', 'fast_path', { ...baseCtx, confidence: 0.91 });
  }

  // 4. Direct Operational Fast-Paths
  if (hasEntity('profit')) {
    return buildMatchResult('fast_path_profit', 'fast_path', { ...baseCtx, confidence: 0.93 });
  }
  if (hasEntity('cashflow')) {
    return buildMatchResult('fast_path_cashflow', 'fast_path', { ...baseCtx, confidence: 0.92 });
  }
  if (hasEntity('qr')) {
    return buildMatchResult('fast_path_qr', 'fast_path', { ...baseCtx, confidence: 0.92 });
  }
  if (hasEntity('kitchen')) {
    return buildMatchResult('fast_path_kitchen', 'fast_path', { ...baseCtx, confidence: 0.9 });
  }
  if (hasEntity('inventory')) {
    return buildMatchResult('fast_path_inventory', 'fast_path', { ...baseCtx, confidence: 0.9 });
  }
  if (hasEntity('discount')) {
    return buildMatchResult('fast_path_discounts', 'fast_path', { ...baseCtx, confidence: 0.9 });
  }
  if (hasEntity('void')) {
    return buildMatchResult('fast_path_voids', 'fast_path', { ...baseCtx, confidence: 0.9 });
  }
  if (hasEntity('audit')) {
    return buildMatchResult('fast_path_audit', 'fast_path', { ...baseCtx, confidence: 0.9 });
  }
  if (hasEntity('schedule')) {
    return buildMatchResult('fast_path_schedule', 'fast_path', { ...baseCtx, confidence: 0.91 });
  }
  if (hasEntity('payroll')) {
    return buildMatchResult('fast_path_payroll', 'fast_path', { ...baseCtx, confidence: 0.91 });
  }
  if (hasEntity('revenue')) {
    return buildMatchResult('fast_path_revenue', 'fast_path', { ...baseCtx, confidence: 0.91 });
  }
  if (hasPhrase(normClean, ['tong quan', 'tinh hinh kinh doanh', 'bao cao nhanh', 'hom nay ban sao', 'tinh hinh quan'])) {
    return buildMatchResult('fast_path_overview', 'fast_path', { ...baseCtx, confidence: 0.9 });
  }

  // 5. Fallback to Gemini when enabled
  return {
    matched: false,
    intentId: null,
    routeHint: 'gemini_fallback',
    requiredPermission: null,
    commandEquivalent: null,
    cleanText,
    normText: normClean,
    entities,
    metrics,
    period,
    periodLabel,
    explicitPeriod,
    guardBlocked: false,
    guardId: null,
    topLimit,
    explicitLimit,
    orderTypeFilter,
    orderStatusFilter,
    orderCode,
    tableNumber,
    persona,
    confidence: 0,
  };
}
