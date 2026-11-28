import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type {
  AiChatTurn,
  AiPersonaProfile,
  AiQuotaStatus,
  AuthPrincipal,
} from '@fnb/shared';
import { checkGuardrailBlock } from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { businessDateString } from '../../common/utils/business-date.util';
import { CashflowService } from '../cashflow/cashflow.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PayrollService } from '../hr-schedule/payroll.service';
import { SchedulesService } from '../hr-schedule/schedules.service';
import { RbacToolPolicyService } from './rbac-tool-policy.service';
import { SystemKbService } from './system-kb.service';

export interface GeminiPoolModelSpec {
  readonly model: string;
  readonly rpd: number;
  readonly rpm: number;
  readonly label: string;
}

export const WEB_GEMINI_POOL: readonly GeminiPoolModelSpec[] = [
  { model: 'gemini-3.5-flash-lite', rpd: 500, rpm: 15, label: 'Chính' },
  { model: 'gemini-3.1-flash-lite', rpd: 500, rpm: 15, label: 'Dự phòng 1' },
  { model: 'gemini-2.5-flash-lite', rpd: 20, rpm: 10, label: 'Dự phòng 2' },
  { model: 'gemini-2.5-flash', rpd: 20, rpm: 5, label: 'Phân tích' },
  { model: 'gemini-3-flash-preview', rpd: 20, rpm: 5, label: 'Gemini 3' },
  { model: 'gemini-2.5-pro', rpd: 20, rpm: 2, label: 'Chuyên sâu' },
] as const;

const SOFT_RPM_OVERFLOW_THRESHOLD = 11;
const MAX_TOOL_ROUNDS = 5;

interface ModelCooldown {
  untilMs: number;
  reason: string;
}

export interface GeminiExecutionResult {
  readonly reply: string;
  readonly tokensUsed: number;
  readonly modelUsed: string | null;
  readonly guardrailBlocked: boolean;
}

function getPacificDateKey(now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return new Date(now.getTime() - 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
}

function scrubSecretText(raw: string, apiKey: string): string {
  let out = raw;
  if (apiKey) out = out.split(apiKey).join('***');
  return out.replace(/AIza[0-9A-Za-z_-]{20,}/g, '***').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

@Injectable()
export class GeminiMultiPoolService {
  private readonly logger = new Logger(GeminiMultiPoolService.name);
  private readonly cooldowns = new Map<string, ModelCooldown>();
  private readonly rpmTimestamps = new Map<string, number[]>();
  private readonly userDailyCounts = new Map<string, number>();
  private poolDateKey = getPacificDateKey(new Date());
  private poolRequestsToday = 0;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RbacToolPolicyService) private readonly rbacPolicy: RbacToolPolicyService,
    @Inject(SystemKbService) private readonly systemKb: SystemKbService,
    @Optional() @Inject(DashboardService) private readonly dashboardService?: DashboardService,
    @Optional() @Inject(CashflowService) private readonly cashflowService?: CashflowService,
    @Optional() @Inject(SchedulesService) private readonly schedulesService?: SchedulesService,
    @Optional() @Inject(PayrollService) private readonly payrollService?: PayrollService,
  ) {}

  resetRuntimeStateForTests(): void {
    this.cooldowns.clear();
    this.rpmTimestamps.clear();
    this.userDailyCounts.clear();
    this.poolDateKey = getPacificDateKey(new Date());
    this.poolRequestsToday = 0;
  }

  private resolveApiKey(): { apiKey: string; dedicatedWebKey: boolean } {
    const webKey = (process.env.FNB_WEB_GEMINI_API_KEY ?? '').trim();
    if (webKey) return { apiKey: webKey, dedicatedWebKey: true };
    return { apiKey: (process.env.FNB_GEMINI_API_KEY ?? '').trim(), dedicatedWebKey: false };
  }

  private getPoolSpecs(): GeminiPoolModelSpec[] {
    const rawPool = (process.env.FNB_GEMINI_MODEL_POOL ?? '').trim();
    if (!rawPool) return [...WEB_GEMINI_POOL];
    const requested = rawPool.split(',').map((s) => s.trim()).filter(Boolean);
    const byModel = new Map(WEB_GEMINI_POOL.map((s) => [s.model, s]));
    const resolved = requested.map(
      (m) => byModel.get(m) ?? { model: m, rpd: 20, rpm: 10, label: 'Tùy chỉnh' },
    );
    return resolved.length > 0 ? resolved : [...WEB_GEMINI_POOL];
  }

  private getStaffDailyLimit(): number {
    const parsed = Number(process.env.FNB_AI_WEB_STAFF_DAILY_GEMINI_LIMIT ?? '15');
    return Number.isFinite(parsed) && parsed >= 1 ? Math.trunc(parsed) : 15;
  }

  private getReserveRpd(): number {
    const parsed = Number(process.env.FNB_AI_WEB_RESERVE_RPD ?? '300');
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 300;
  }

  private rollDailyBuckets(now: Date): void {
    const pac = getPacificDateKey(now);
    if (pac !== this.poolDateKey) {
      this.poolDateKey = pac;
      this.poolRequestsToday = 0;
      this.userDailyCounts.clear();
    }
  }

  getQuotaStatus(principal: AuthPrincipal, now = new Date()): AiQuotaStatus {
    this.rollDailyBuckets(now);
    const vnDateKey = businessDateString(now);
    const { apiKey, dedicatedWebKey } = this.resolveApiKey();
    const specs = this.getPoolSpecs();
    const totalPoolRpd = specs.reduce((acc, s) => acc + s.rpd, 0);
    const poolRemaining = Math.max(0, totalPoolRpd - this.poolRequestsToday);
    const userKey = `${vnDateKey}:${principal.id}`;
    const usedToday = this.userDailyCounts.get(userKey) ?? 0;

    if (!apiKey) {
      return {
        dateKey: vnDateKey,
        webDailyLimit: principal.isSuperAdmin ? null : this.getStaffDailyLimit(),
        webUsedToday: usedToday,
        webRemainingToday: principal.isSuperAdmin ? null : Math.max(0, this.getStaffDailyLimit() - usedToday),
        poolRemainingEstimate: 0,
        geminiAvailableForUser: false,
        reserveProtected: false,
      };
    }

    if (principal.isSuperAdmin) {
      return {
        dateKey: vnDateKey,
        webDailyLimit: null,
        webUsedToday: usedToday,
        webRemainingToday: null,
        poolRemainingEstimate: poolRemaining,
        geminiAvailableForUser: poolRemaining > 0,
        reserveProtected: false,
      };
    }

    const dailyLimit = this.getStaffDailyLimit();
    const reserveProtected = !dedicatedWebKey && poolRemaining <= this.getReserveRpd();
    const remaining = Math.max(0, dailyLimit - usedToday);
    return {
      dateKey: vnDateKey,
      webDailyLimit: dailyLimit,
      webUsedToday: usedToday,
      webRemainingToday: remaining,
      poolRemainingEstimate: poolRemaining,
      geminiAvailableForUser: remaining > 0 && !reserveProtected && poolRemaining > 0,
      reserveProtected,
    };
  }

  private recordRpm(model: string, nowMs: number): void {
    const arr = (this.rpmTimestamps.get(model) ?? []).filter((t) => nowMs - t < 60_000);
    arr.push(nowMs);
    this.rpmTimestamps.set(model, arr);
  }

  private getRpmUsed(model: string, nowMs: number): number {
    const arr = (this.rpmTimestamps.get(model) ?? []).filter((t) => nowMs - t < 60_000);
    this.rpmTimestamps.set(model, arr);
    return arr.length;
  }

  private selectOrderedModels(nowMs: number): string[] {
    const specs = this.getPoolSpecs();
    const active = specs.filter((s) => {
      const cd = this.cooldowns.get(s.model);
      return !cd || cd.untilMs <= nowMs;
    });
    const candidates = active.length > 0 ? active : [...specs];

    // Proactive overflow when primary hits >=11 RPM and 3.1-flash-lite is idle
    const primary = candidates[0];
    if (
      primary &&
      primary.model === 'gemini-3.5-flash-lite' &&
      this.getRpmUsed(primary.model, nowMs) >= SOFT_RPM_OVERFLOW_THRESHOLD
    ) {
      const backupIdx = candidates.findIndex((c) => c.model === 'gemini-3.1-flash-lite');
      if (backupIdx > 0 && this.getRpmUsed('gemini-3.1-flash-lite', nowMs) < SOFT_RPM_OVERFLOW_THRESHOLD) {
        const [backup] = candidates.splice(backupIdx, 1);
        if (backup) candidates.unshift(backup);
      }
    }
    return candidates.map((c) => c.model);
  }

  private markCooldown(model: string, status: number, body: string, nowMs: number): void {
    const low = body.toLowerCase();
    let ttlMs = 65_000;
    if (status === 429 && (low.includes('perday') || low.includes('rpd') || low.includes('daily'))) {
      ttlMs = 6 * 3600_000;
    } else if (status === 404 || status === 400) {
      ttlMs = 6 * 3600_000;
    } else if (status >= 500 || status === 0) {
      ttlMs = 90_000;
    }
    this.cooldowns.set(model, { untilMs: nowMs + ttlMs, reason: `HTTP ${status}` });
  }

  private buildToolDeclarations(principal: AuthPrincipal): Array<Record<string, unknown>> {
    const decls: Array<Record<string, unknown>> = [
      {
        name: 'search_system_docs',
        description: 'Tra cứu tài liệu chính thức của hệ thống POS Ăn Vặt Tran (máy in RawBT/LAN, tách bếp COMBO, két ca, RBAC, QR).',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Từ khóa tìm kiếm tài liệu' },
            topic: { type: 'STRING', description: 'pos, printer, cashflow, rbac, qr' },
          },
          required: ['query'],
        },
      },
    ];

    if (principal.isSuperAdmin || principal.permissions.dashboard.view) {
      decls.push(
        {
          name: 'get_store_overview',
          description: 'Lấy báo cáo tổng quan kinh doanh (doanh thu, bàn mở, trạm bếp, lợi nhuận theo quyền user).',
          parameters: {
            type: 'OBJECT',
            properties: {
              from_date: { type: 'STRING', description: 'YYYY-MM-DD' },
              to_date: { type: 'STRING', description: 'YYYY-MM-DD' },
            },
            required: ['from_date', 'to_date'],
          },
        },
        {
          name: 'get_item_sales',
          description: 'Lấy bảng thống kê doanh số từng món ăn/đồ uống.',
          parameters: {
            type: 'OBJECT',
            properties: {
              from_date: { type: 'STRING', description: 'YYYY-MM-DD' },
              to_date: { type: 'STRING', description: 'YYYY-MM-DD' },
              search: { type: 'STRING', description: 'Tên món cần lọc (tùy chọn)' },
            },
            required: ['from_date', 'to_date'],
          },
        },
      );
    }

    if (principal.isSuperAdmin || principal.permissions.cashflow.view) {
      decls.push({
        name: 'get_cashflow_status',
        description: 'Lấy đối soát két tiền mặt và lịch sử chốt ca.',
        parameters: {
          type: 'OBJECT',
          properties: {
            from_date: { type: 'STRING', description: 'YYYY-MM-DD' },
            to_date: { type: 'STRING', description: 'YYYY-MM-DD' },
          },
        },
      });
    }

    if (principal.isSuperAdmin || principal.permissions.invoices.view || principal.permissions.pos.view) {
      decls.push({
        name: 'get_recent_orders_and_counts',
        description: 'Đếm số lượng đơn hàng theo loại (DINE_IN tại bàn, TAKEAWAY mang về) & trạng thái, kèm danh sách N đơn gần nhất theo giờ Việt Nam.',
        parameters: {
          type: 'OBJECT',
          properties: {
            from_date: { type: 'STRING', description: 'YYYY-MM-DD (giờ VN)' },
            to_date: { type: 'STRING', description: 'YYYY-MM-DD (giờ VN)' },
            order_type: { type: 'STRING', description: 'Tùy chọn: TAKEAWAY hoặc DINE_IN (bỏ trống lấy tất cả)' },
            limit: { type: 'INTEGER', description: 'Số đơn gần nhất cần trả về (1..20, mặc định 5)' },
          },
        },
      });
    }

    if (principal.isSuperAdmin || principal.permissions.payroll.view) {
      decls.push({
        name: 'get_payroll_summary',
        description: 'Lấy bảng lương ước tính theo khoảng ngày.',
        parameters: {
          type: 'OBJECT',
          properties: {
            from_date: { type: 'STRING', description: 'YYYY-MM-DD' },
            to_date: { type: 'STRING', description: 'YYYY-MM-DD' },
          },
          required: ['from_date', 'to_date'],
        },
      });
    }

    if (principal.isSuperAdmin || principal.permissions.schedules.view || principal.employeeId > 0) {
      decls.push({
        name: 'get_work_schedule',
        description: 'Lấy lịch làm việc tuần bắt đầu từ Thứ Hai YYYY-MM-DD (nhân viên thường chỉ xem ca của chính mình).',
        parameters: {
          type: 'OBJECT',
          properties: {
            week_start_date: { type: 'STRING', description: 'Ngày Thứ Hai YYYY-MM-DD' },
          },
          required: ['week_start_date'],
        },
      });
    }

    if (principal.isSuperAdmin) {
      decls.push({
        name: 'run_readonly_sql',
        description: 'Chỉ Super Admin: truy vấn SELECT PostgreSQL chỉ đọc (tối đa 50 dòng, không truy cập password_hash hoặc vapid keys).',
        parameters: {
          type: 'OBJECT',
          properties: {
            sql: { type: 'STRING', description: 'SELECT ...' },
          },
          required: ['sql'],
        },
      });
    }

    return decls;
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    principal: AuthPrincipal,
  ): Promise<Record<string, unknown>> {
    const check = this.rbacPolicy.canExecuteTool(name, principal);
    if (!check.allowed) {
      return { ok: false, error: `Không đủ quyền RBAC: ${check.missingLabel}` };
    }
    try {
      if (name === 'search_system_docs') {
        const docs = this.systemKb.searchDocs(String(args.query ?? ''), typeof args.topic === 'string' ? args.topic : null, 3);
        return { ok: true, docs };
      }
      if (name === 'get_store_overview' && this.dashboardService) {
        const ov = await this.dashboardService.getOverview(
          { preset: 'custom', fromDate: String(args.from_date ?? ''), toDate: String(args.to_date ?? '') },
          principal,
        );
        return { ok: true, overview: ov };
      }
      if (name === 'get_item_sales' && this.dashboardService) {
        const items = await this.dashboardService.getDailyItemSales(
          {
            preset: 'custom',
            fromDate: String(args.from_date ?? ''),
            toDate: String(args.to_date ?? ''),
            search: typeof args.search === 'string' ? args.search : undefined,
          },
          principal,
        );
        return { ok: true, items: items.items.slice(0, 25), summary: items.summary };
      }
      if (name === 'get_cashflow_status' && this.cashflowService) {
        const [preview, settlements] = await Promise.all([
          this.cashflowService.preview(new Date(), principal.isSuperAdmin || principal.permissions.dashboard.viewProfit),
          this.cashflowService.listSettlements({
            page: 1,
            limit: 5,
            fromDate: typeof args.from_date === 'string' ? args.from_date : undefined,
            toDate: typeof args.to_date === 'string' ? args.to_date : undefined,
          }),
        ]);
        return { ok: true, preview, settlements };
      }
      if (name === 'get_recent_orders_and_counts') {
        const fromStr = typeof args.from_date === 'string' && args.from_date ? args.from_date : businessDateString(new Date());
        const toStr = typeof args.to_date === 'string' && args.to_date ? args.to_date : fromStr;
        const start = new Date(`${fromStr}T00:00:00+07:00`);
        const endBase = new Date(`${toStr}T00:00:00+07:00`);
        const end = new Date(endBase.getTime() + 24 * 3600 * 1000);
        const rawType = typeof args.order_type === 'string' ? args.order_type.toUpperCase() : '';
        const orderType = rawType === 'TAKEAWAY' || rawType === 'DINE_IN' ? rawType : undefined;
        const limit = Math.min(20, Math.max(1, Number(args.limit ?? 5) || 5));
        const allRows = await this.prisma.order.findMany({
          where: {
            createdAt: { gte: start, lt: end },
            ...(orderType ? { orderType } : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 5000,
          select: {
            orderCode: true,
            orderType: true,
            takeawayNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            table: { select: { name: true } },
          },
        });
        const nonVoid = allRows.filter((r) => r.status !== 'VOIDED');
        return {
          ok: true,
          fromDate: fromStr,
          toDate: toStr,
          filterOrderType: orderType ?? 'ALL',
          counts: {
            activeTotal: nonVoid.length,
            takeaway: nonVoid.filter((r) => r.orderType === 'TAKEAWAY').length,
            dineIn: nonVoid.filter((r) => r.orderType === 'DINE_IN').length,
            paid: nonVoid.filter((r) => r.status === 'PAID').length,
            serving: nonVoid.filter((r) => r.status === 'SERVING').length,
            pending: nonVoid.filter((r) => r.status === 'PENDING').length,
            voided: allRows.length - nonVoid.length,
          },
          recentOrders: nonVoid.slice(0, limit).map((r) => ({
            orderCode: r.orderCode,
            orderType: r.orderType,
            tableOrTakeaway: r.table?.name ?? (r.takeawayNumber ? `Mang về #${r.takeawayNumber}` : 'Mang về'),
            status: r.status,
            totalAmount: Number(r.totalAmount ?? 0),
            createdAt: r.createdAt,
          })),
        };
      }
      if (name === 'get_payroll_summary' && this.payrollService) {
        const summary = await this.payrollService.getPayrollSummary({
          fromDate: String(args.from_date ?? ''),
          toDate: String(args.to_date ?? ''),
        });
        return { ok: true, summary };
      }
      if (name === 'get_work_schedule' && this.schedulesService) {
        const sched = await this.schedulesService.getScheduleWeek(String(args.week_start_date ?? ''));
        if (!principal.isSuperAdmin && !principal.permissions.schedules.view) {
          return {
            ok: true,
            selfOnly: true,
            cells: sched.cells.filter((c) => c.employees.some((e) => e.id === principal.employeeId)),
          };
        }
        return { ok: true, cells: sched.cells };
      }
      if (name === 'run_readonly_sql') {
        const rawSql = String(args.sql ?? '');
        const validated = this.rbacPolicy.validateReadonlySql(rawSql);
        if (!validated.ok) return { ok: false, error: validated.reason };
        const boundedSql = `SELECT * FROM (${validated.sql}) AS _ai_ro LIMIT 50`;
        const rows = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL TRANSACTION READ ONLY');
          await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3000ms'");
          return tx.$queryRawUnsafe<unknown[]>(boundedSql);
        });
        return {
          ok: true,
          rows: JSON.parse(
            JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
          ),
        };
      }
      return { ok: false, error: `Tool không khả dụng: ${name}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : 'Lỗi thực thi tool' };
    }
  }

  private sanitizeOutput(rawText: string, persona: AiPersonaProfile): { text: string; blocked: boolean } {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return {
        text: `Dạ ${persona.botSelf} chưa tổng hợp được câu trả lời phù hợp, ${persona.userCall} hỏi cụ thể hơn giúp ${persona.botSelf} ạ.`,
        blocked: true,
      };
    }
    if (/```[\s\S]*```/.test(trimmed) || /\b(?:AIza[0-9A-Za-z_-]{15,}|systemInstruction|password_hash|vapidPrivateKey)\b/i.test(trimmed)) {
      return {
        text: `Dạ ${persona.botSelf} chỉ hỗ trợ số liệu bán hàng và hướng dẫn nghiệp vụ POS Ăn Vặt Tran giúp ${persona.userCall} ạ.`,
        blocked: true,
      };
    }
    return { text: trimmed, blocked: false };
  }

  async generateReply(params: {
    question: string;
    principal: AuthPrincipal;
    persona: AiPersonaProfile;
    history?: readonly AiChatTurn[];
    now?: Date;
  }): Promise<GeminiExecutionResult> {
    const now = params.now ?? new Date();
    const { apiKey } = this.resolveApiKey();
    if (!apiKey) {
      return {
        reply: `Dạ hiện máy chủ Web POS chưa cấu hình khóa API Gemini nên ${params.persona.botSelf} chỉ tra cứu cục bộ 0 token giúp ${params.persona.userCall} ạ.`,
        tokensUsed: 0,
        modelUsed: null,
        guardrailBlocked: false,
      };
    }

    const pre = checkGuardrailBlock(params.question);
    if (pre.blocked) {
      return {
        reply: pre.reason ?? `Dạ ${params.persona.botSelf} chỉ hỗ trợ thông tin vận hành POS của quán ạ.`,
        tokensUsed: 0,
        modelUsed: null,
        guardrailBlocked: true,
      };
    }

    const quota = this.getQuotaStatus(params.principal, now);
    if (!quota.geminiAvailableForUser) {
      const msg = quota.reserveProtected
        ? `Dạ hạn mức dự phòng Gemini đang được ưu tiên cho quản trị quán, ${params.persona.userCall} vui lòng dùng các tra cứu nhanh 0-token giúp ${params.persona.botSelf} ạ.`
        : `Dạ ${params.persona.userCall} đã dùng hết ${quota.webDailyLimit ?? 15} lượt phân tích Gemini hôm nay rồi ạ; các câu hỏi tra số liệu chuẩn 0-token vẫn dùng bình thường ạ.`;
      return { reply: msg, tokensUsed: 0, modelUsed: null, guardrailBlocked: false };
    }

    const todayIso = businessDateString(now);
    const schemaCheatSheet = params.principal.isSuperAdmin
      ? [
          `SCHEMA POSTGRESQL (mọi ngày lọc theo giờ VN +07:00, VD: (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = '${todayIso}', KHÔNG dùng DATE(created_at) UTC):`,
          `- orders(id, order_code, order_type ['DINE_IN'|'TAKEAWAY'], order_source ['POS'|'QR'], table_id, takeaway_number, status ['PENDING'|'SERVING'|'PAID'|'VOIDED'], payment_method ['CASH'|'TRANSFER'|'SPLIT'], total_amount, cash_amount, transfer_amount, discount_amount, cashier_id, created_at, paid_at)`,
          `- order_items(id, order_id, product_id, quantity, unit_price, subtotal_amount, kitchen_status ['NEW'|'PRINTED'|'CANCELLED'], batch_no, created_at)`,
          `- products(id, name, price, category_id, station ['BEP_NAU'|'BEP_CHIEN'|'PHA_CHE'|'COMBO'], is_available)`,
          `- dining_tables(id, name, status ['AVAILABLE'|'OCCUPIED'|'PENDING'], active_order_id)`,
          `- cash_drawer_settlements, inventory_imports, work_schedules, payroll_adjustments, audit_logs, discounts, payment_accounts, users, employees, v_bot_master_data`,
        ].join('\n')
      : '';

    const systemInstruction = [
      `Bạn là Lona — Trợ lý AI thông minh trên Web POS của Quán Mì Cay Ăn Vặt Tran.`,
      `Hôm nay là ${todayIso} (giờ VN +07:00).`,
      `XƯNG HÔ BẮT BUỘC: Tự xưng "${params.persona.botSelf}" và gọi người hỏi là "${params.persona.userCall}" tự nhiên, lịch sự (tuyệt đối KHÔNG tự xưng "Tôi").`,
      `NGUYÊN TẮC TRẢ LỜI CHÍNH XÁC:`,
      `1. Trả lời ĐÚNG TRỌNG TÂM vào câu hỏi ngay dòng đầu, ngắn gọn, rõ số liệu thực tế từ tool (không lan man).`,
      `2. TUYỆT ĐỐI KHÔNG tự đoán số liệu bằng 0 khi chưa gọi tool đúng ngữ nghĩa (với đơn hàng/mang về/tại bàn, gọi get_recent_orders_and_counts hoặc run_readonly_sql nếu là Super Admin).`,
      `3. KHÔNG lộ tên cột, tên bảng hoặc mã enum nội bộ (như TAKEAWAY, DINE_IN, order_type) bằng dấu backtick trong câu trả lời nghiệp vụ — hãy viết tiếng Việt tự nhiên ("đơn mang về", "đơn tại bàn").`,
      `4. Chỉ trả lời dựa trên kết quả tool theo đúng quyền RBAC hiện tại (${params.principal.isSuperAdmin ? 'Super Admin' : 'Nhân viên/Quản lý phân quyền'}). Không bịa số liệu, không xuất block code lập trình, không tiết lộ secrets.`,
      schemaCheatSheet,
    ]
      .filter(Boolean)
      .join('\n');

    const contents: Array<Record<string, unknown>> = (params.history ?? []).slice(-6).map((t) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.text.slice(0, 900) }],
    }));
    contents.push({ role: 'user', parts: [{ text: `<user_question>\n${params.question}\n</user_question>` }] });

    const tools = this.buildToolDeclarations(params.principal);
    let totalTokens = 0;
    let modelUsed: string | null = null;
    const nowMs = now.getTime();
    const userBucketKey = `${todayIso}:${params.principal.id}`;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const models = this.selectOrderedModels(nowMs);
      let respJson: Record<string, unknown> | null = null;
      let lastError = 'Không kết nối được Gemini API.';
      const isFinalSynthesisRound = round === MAX_TOOL_ROUNDS - 1;

      for (const model of models) {
        this.recordRpm(model, Date.now());
        this.poolRequestsToday += 1;
        this.userDailyCounts.set(userBucketKey, (this.userDailyCounts.get(userBucketKey) ?? 0) + 1);
        modelUsed = model;

        try {
          const payloadBody: Record<string, unknown> = {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: { temperature: 0.15, maxOutputTokens: 1000 },
          };
          if (!isFinalSynthesisRound && tools.length > 0) {
            payloadBody.tools = [{ functionDeclarations: tools }];
          }
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payloadBody),
            },
          );
          if (!res.ok) {
            const errTxt = scrubSecretText((await res.text()).slice(0, 200), apiKey);
            this.markCooldown(model, res.status, errTxt, Date.now());
            lastError = `HTTP ${res.status}: ${errTxt}`;
            if (res.status === 401 || res.status === 403) break;
            continue;
          }
          respJson = (await res.json()) as Record<string, unknown>;
          break;
        } catch (err) {
          this.markCooldown(model, 0, 'network', Date.now());
          lastError = scrubSecretText(err instanceof Error ? err.message : 'network error', apiKey);
        }
      }

      if (!respJson) {
        this.logger.warn(`Gemini failover exhausted: ${lastError}`);
        return {
          reply: `Dạ kết nối Gemini AI đang bận hoặc tạm quá tải, ${params.persona.userCall} thử lại sau ít giây hoặc dùng tra cứu nhanh 0-token giúp ${params.persona.botSelf} ạ.`,
          tokensUsed: totalTokens,
          modelUsed,
          guardrailBlocked: false,
        };
      }

      const usage = (respJson.usageMetadata as Record<string, unknown> | undefined) ?? {};
      const roundTokens = Number(usage.totalTokenCount ?? 0) || (Number(usage.promptTokenCount ?? 0) + Number(usage.candidatesTokenCount ?? 0));
      totalTokens += Math.max(0, roundTokens);

      const candidates = (respJson.candidates as Array<Record<string, unknown>> | undefined) ?? [];
      const content = (candidates[0]?.content as Record<string, unknown> | undefined) ?? {};
      const parts = (content.parts as Array<Record<string, unknown>> | undefined) ?? [];
      const funcCalls = parts
        .filter((p) => p && typeof p.functionCall === 'object' && p.functionCall !== null)
        .map((p) => p.functionCall as { name: string; args?: Record<string, unknown> });

      if (funcCalls.length === 0) {
        const rawReply = parts
          .filter((p) => typeof p.text === 'string' && !p.thought)
          .map((p) => String(p.text))
          .join('\n')
          .trim();
        const sanitized = this.sanitizeOutput(rawReply, params.persona);
        return {
          reply: sanitized.text,
          tokensUsed: totalTokens,
          modelUsed,
          guardrailBlocked: sanitized.blocked,
        };
      }

      contents.push({ role: 'model', parts });
      const responses = [];
      for (const fc of funcCalls) {
        const out = await this.executeTool(fc.name, fc.args ?? {}, params.principal);
        responses.push({ functionResponse: { name: fc.name, response: out } });
      }
      contents.push({ role: 'user', parts: responses });
    }

    return {
      reply: `Dạ ${params.persona.botSelf} cần thêm thông tin rõ hơn để tổng hợp chính xác cho ${params.persona.userCall} ạ.`,
      tokensUsed: totalTokens,
      modelUsed,
      guardrailBlocked: false,
    };
  }
}
