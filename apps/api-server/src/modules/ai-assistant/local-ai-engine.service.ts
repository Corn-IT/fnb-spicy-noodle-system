import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  AiEngineRoute,
  AiPeriodCode,
  AiPersonaProfile,
  AuthPrincipal,
  DashboardPreset,
  SemanticIntentId,
  SemanticMatchResult,
} from '@fnb/shared';
import {
  TakeawayLabelFormat,
  classifyFastPathCommand,
  detectSystemDocQuestion,
  formatTakeawayLabel,
  matchSemanticIntent,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { businessDateString, dateAtVietnamMidnight } from '../../common/utils/business-date.util';
import { CashflowService } from '../cashflow/cashflow.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { DiscountsService } from '../discounts/discounts.service';
import { PayrollService } from '../hr-schedule/payroll.service';
import { SchedulesService } from '../hr-schedule/schedules.service';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentQrService } from '../payment-qr/payment-qr.service';
import { PosService } from '../pos/pos.service';
import { RbacToolPolicyService } from './rbac-tool-policy.service';
import { SystemKbService } from './system-kb.service';

export interface LocalEngineResponse {
  readonly handled: boolean;
  readonly reply?: string;
  readonly route?: AiEngineRoute;
  readonly intentId?: SemanticIntentId | null;
  readonly period?: AiPeriodCode | null;
  readonly guardBlocked?: boolean;
  readonly match?: SemanticMatchResult;
  readonly updatedSlots?: Record<string, string | number | null>;
}

const SLASH_TO_INTENT: Readonly<Record<string, SemanticIntentId>> = {
  tongquan: 'fast_path_overview',
  ban: 'table_live_status',
  don: 'recent_orders',
  doanhthu: 'fast_path_revenue',
  ket: 'fast_path_cashflow',
  qr: 'fast_path_qr',
  topmon: 'product_list_popularity',
  bep: 'fast_path_kitchen',
  kho: 'fast_path_inventory',
  khuyenmai: 'fast_path_discounts',
  huy: 'fast_path_voids',
  audit: 'fast_path_audit',
  lich: 'fast_path_schedule',
  luong: 'fast_path_payroll',
  loinhuan: 'fast_path_profit',
};

function fmtVnd(val: unknown): string {
  const num = Number(val ?? 0);
  if (!Number.isFinite(num)) return '0đ';
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(num))}đ`;
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function resolveVietnamPeriod(
  period: AiPeriodCode,
  now = new Date(),
): { preset: DashboardPreset; fromDate: string; toDate: string; label: string } {
  const today = businessDateString(now);
  switch (period) {
    case 'homqua': {
      const y = addDaysIso(today, -1);
      return { preset: 'yesterday', fromDate: y, toDate: y, label: `Hôm qua (${y.slice(8)}/${y.slice(5, 7)})` };
    }
    case '7ngay': {
      const from = addDaysIso(today, -6);
      return { preset: '7d', fromDate: from, toDate: today, label: '7 ngày gần nhất' };
    }
    case '30ngay': {
      const from = addDaysIso(today, -29);
      return { preset: 'custom', fromDate: from, toDate: today, label: '30 ngày gần nhất' };
    }
    case 'tuan': {
      const d = new Date(`${today}T00:00:00.000Z`);
      const mondayOffset = (d.getUTCDay() + 6) % 7;
      const mon = addDaysIso(today, -mondayOffset);
      return { preset: 'custom', fromDate: mon, toDate: today, label: 'Tuần này' };
    }
    case 'tuantruoc': {
      const d = new Date(`${today}T00:00:00.000Z`);
      const mondayOffset = (d.getUTCDay() + 6) % 7;
      const prevMon = addDaysIso(today, -mondayOffset - 7);
      const prevSun = addDaysIso(today, -mondayOffset - 1);
      return { preset: 'custom', fromDate: prevMon, toDate: prevSun, label: 'Tuần trước' };
    }
    case 'thang': {
      const first = `${today.slice(0, 7)}-01`;
      return { preset: 'month', fromDate: first, toDate: today, label: `Tháng ${today.slice(5, 7)}/${today.slice(0, 4)}` };
    }
    case 'thangtruoc': {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
      d.setUTCDate(0);
      const lastPrev = d.toISOString().slice(0, 10);
      const firstPrev = `${lastPrev.slice(0, 7)}-01`;
      return { preset: 'custom', fromDate: firstPrev, toDate: lastPrev, label: 'Tháng trước' };
    }
    case 'nam': {
      return { preset: 'custom', fromDate: `${today.slice(0, 4)}-01-01`, toDate: today, label: `Năm ${today.slice(0, 4)}` };
    }
    default:
      return { preset: 'today', fromDate: today, toDate: today, label: `Hôm nay (${today.slice(8)}/${today.slice(5, 7)})` };
  }
}

@Injectable()
export class LocalAiEngineService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RbacToolPolicyService) private readonly rbacPolicy: RbacToolPolicyService,
    @Inject(SystemKbService) private readonly systemKb: SystemKbService,
    @Optional() @Inject(DashboardService) private readonly dashboardService?: DashboardService,
    @Optional() @Inject(PosService) private readonly posService?: PosService,
    @Optional() @Inject(CashflowService) private readonly cashflowService?: CashflowService,
    @Optional() @Inject(PaymentQrService) private readonly paymentQrService?: PaymentQrService,
    @Optional() @Inject(InventoryService) private readonly inventoryService?: InventoryService,
    @Optional() @Inject(DiscountsService) private readonly discountsService?: DiscountsService,
    @Optional() @Inject(SchedulesService) private readonly schedulesService?: SchedulesService,
    @Optional() @Inject(PayrollService) private readonly payrollService?: PayrollService,
  ) {}

  private greet(persona: AiPersonaProfile): string {
    return persona.botSelf === 'em' || persona.botSelf === 'con' ? 'Dạ' : 'Chào bạn,';
  }

  private end(persona: AiPersonaProfile): string {
    return persona.botSelf === 'em' || persona.botSelf === 'con' ? ' ạ' : '';
  }

  private tryMetaFaq(
    normText: string,
    principal: AuthPrincipal,
    persona: AiPersonaProfile,
  ): LocalEngineResponse | null {
    if (/biet lam gi|lam duoc gi|giup duoc gi|gioi thieu/.test(normText)) {
      const chips = this.rbacPolicy
        .getSuggestionChips(principal, true)
        .map((c) => `• ${c.label}: "${c.prompt}"`)
        .join('\n');
      return {
        handled: true,
        route: 'local_semantic',
        intentId: null,
        reply: `${this.greet(persona)} ${persona.botSelf} là Lona AI trên Web POS — hỗ trợ ${persona.userCall} tra số liệu theo đúng quyền tài khoản và hướng dẫn sử dụng hệ thống 0 token${this.end(persona)}.\n${chips}`,
      };
    }
    if (/khong ton token|ton token|tiet kiem token/.test(normText)) {
      return {
        handled: true,
        route: 'local_semantic',
        intentId: null,
        reply: `${this.greet(persona)} các câu hỏi tra cứu trực diện (món bán chạy/chậm, giờ cao điểm, bàn trống, két tiền, QR, lịch trực, hướng dẫn máy in) đều chạy cục bộ 0 token (~0.1s)${this.end(persona)}.`,
      };
    }
    return null;
  }

  async tryAnswerLocally(params: {
    message: string;
    principal: AuthPrincipal;
    persona: AiPersonaProfile;
    slots?: Record<string, string | number>;
    now?: Date;
  }): Promise<LocalEngineResponse> {
    const now = params.now ?? new Date();
    const { message, principal, persona } = params;

    // 1. Slash command override (/topmon, /tongquan, /ban, /help...)
    const slash = classifyFastPathCommand(message);
    if (slash) {
      if (slash.command === 'help') {
        const chips = this.rbacPolicy.getSuggestionChips(principal, true);
        return {
          handled: true,
          route: 'fast_path',
          intentId: null,
          reply: `${this.greet(persona)} các tra cứu nhanh phù hợp quyền của ${persona.userCall}:\n${chips.map((c) => `• ${c.prompt}`).join('\n')}`,
        };
      }
      const mappedId = SLASH_TO_INTENT[slash.command];
      if (mappedId) {
        const synthesized = matchSemanticIntent(`${slash.command} ${slash.arg}`.trim());
        const forced: SemanticMatchResult = { ...synthesized, matched: true, intentId: mappedId };
        return this.executeSemanticIntent(forced, principal, persona, now);
      }
    }

    const sem = matchSemanticIntent(message);
    const meta = this.tryMetaFaq(sem.normText, principal, persona);
    if (meta) return { ...meta, period: sem.period, match: sem };

    // 2. System Doc KB (available to every logged-in account)
    if (sem.intentId === 'system_docs' || detectSystemDocQuestion(sem.normText)) {
      const docs = this.systemKb.searchDocs(sem.cleanText, null, 2);
      const formatted = docs.map((d) => `📘 ${d.title}\n${d.content}`).join('\n\n');
      return {
        handled: true,
        route: 'system_kb',
        intentId: 'system_docs',
        period: sem.period,
        match: sem,
        reply: `${this.greet(persona)} thông tin từ tài liệu POS Ăn Vặt Tran cho ${persona.userCall}:\n\n${formatted}`,
      };
    }

    // 3. Negative guard (causal / deep analysis) -> defer cleanly to Gemini
    if (sem.guardBlocked) {
      return { handled: false, guardBlocked: true, period: sem.period, match: sem };
    }

    // 4. Contextual follow-up shift ("còn hôm qua?") or refinement ("một đơn thôi", "chỉ đơn mang về", "top 3")
    if (!sem.matched && params.slots?.lastIntent && !sem.guardBlocked) {
      const prevIntent = params.slots.lastIntent as SemanticIntentId;
      const prevOrderType =
        params.slots.lastOrderType === 'TAKEAWAY' || params.slots.lastOrderType === 'DINE_IN'
          ? (params.slots.lastOrderType as 'TAKEAWAY' | 'DINE_IN')
          : null;
      const prevLimit = Number(params.slots.lastLimit ?? 5) || 5;
      const prevPeriod = (params.slots.lastPeriod as AiPeriodCode | undefined) ?? sem.period;

      if (sem.explicitPeriod && /^(?:con|the|vay)/.test(sem.normText)) {
        const resumed: SemanticMatchResult = {
          ...sem,
          matched: true,
          intentId: prevIntent,
          orderTypeFilter: sem.orderTypeFilter ?? prevOrderType,
          topLimit: sem.explicitLimit ? sem.topLimit : prevLimit,
          explicitLimit: sem.explicitLimit || Boolean(params.slots.lastLimit),
        };
        return this.executeSemanticIntent(resumed, principal, persona, now);
      }

      const words = sem.normText.split(/\s+/).filter(Boolean).length;
      const bareNumMatch = sem.normText.match(/^(?:chi|lay|xem|cho|top)?\s*(?:(\d{1,2})|mot|hai|ba|bon|nam)\s*(?:don|hoa don|mon|cai|ban)?\s*(?:thoi|nhe|nha|nhe|a)?$/);
      const wordMap: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5 };
      let refinedLimit = sem.topLimit;
      let hasRefinedLimit = sem.explicitLimit;
      if (!hasRefinedLimit && bareNumMatch) {
        const tok = bareNumMatch[0];
        const wordHit = Object.entries(wordMap).find(([k]) => new RegExp(`\\b${k}\\b`).test(tok));
        const numVal = bareNumMatch[1] ? Number(bareNumMatch[1]) : wordHit?.[1];
        if (numVal && numVal >= 1) {
          refinedLimit = Math.min(20, numVal);
          hasRefinedLimit = true;
        }
      }
      const isRefinableIntent = [
        'recent_orders',
        'order_count',
        'order_top_value',
        'product_list_popularity',
        'product_list_revenue',
        'product_top_popularity',
        'product_top_revenue',
      ].includes(prevIntent);

      if (isRefinableIntent && words <= 8 && (hasRefinedLimit || sem.orderTypeFilter !== null)) {
        const resumed: SemanticMatchResult = {
          ...sem,
          matched: true,
          intentId: prevIntent,
          period: sem.explicitPeriod ? sem.period : prevPeriod,
          orderTypeFilter: sem.orderTypeFilter ?? prevOrderType,
          topLimit: hasRefinedLimit ? refinedLimit : prevLimit,
          explicitLimit: hasRefinedLimit || Boolean(params.slots.lastLimit),
        };
        return this.executeSemanticIntent(resumed, principal, persona, now);
      }
    }

    if (sem.matched && sem.intentId) {
      return this.executeSemanticIntent(sem, principal, persona, now);
    }

    return { handled: false, guardBlocked: false, period: sem.period, match: sem };
  }

  private async executeSemanticIntent(
    sem: SemanticMatchResult,
    principal: AuthPrincipal,
    persona: AiPersonaProfile,
    now: Date,
  ): Promise<LocalEngineResponse> {
    const intentId = sem.intentId!;
    const rbac = this.rbacPolicy.canAccessIntent(intentId, principal);
    if (!rbac.allowed) {
      return {
        handled: true,
        route: 'rbac_block',
        intentId,
        period: sem.period,
        match: sem,
        reply: this.rbacPolicy.formatPermissionDenied(rbac.missingLabel ?? 'Chức năng này', persona),
      };
    }

    const periodSpec = resolveVietnamPeriod(sem.period, now);
    const dashQuery = { preset: periodSpec.preset, fromDate: periodSpec.fromDate, toDate: periodSpec.toDate };
    const startUtc = dateAtVietnamMidnight(periodSpec.fromDate);
    const endUtc = dateAtVietnamMidnight(addDaysIso(periodSpec.toDate, 1));
    const g = this.greet(persona);
    const e = this.end(persona);

    // A. Product rankings & superlatives
    if (
      intentId === 'product_top_popularity' ||
      intentId === 'product_list_popularity' ||
      intentId === 'product_top_revenue' ||
      intentId === 'product_list_revenue'
    ) {
      const sales = await this.dashboardService?.getDailyItemSales(dashQuery, principal);
      const items = [...(sales?.items ?? [])];
      if (items.length === 0) {
        return {
          handled: true,
          route: 'local_semantic',
          intentId,
          period: sem.period,
          match: sem,
          reply: `${g} trong kỳ ${periodSpec.label} chưa có dữ liệu món bán ra${e}.`,
        };
      }
      const byRevenue = intentId === 'product_top_revenue' || intentId === 'product_list_revenue';
      items.sort((a, b) => (byRevenue ? b.revenue - a.revenue || b.qty - a.qty : b.qty - a.qty || b.revenue - a.revenue));
      const top1 = items[0]!;
      const isList = intentId === 'product_list_popularity' || intentId === 'product_list_revenue';
      const limit = Math.min(sem.topLimit, items.length);
      const lead = byRevenue ? 'có doanh thu cao nhất' : 'được gọi nhiều / bán chạy nhất';

      if (!isList) {
        const runners = items.slice(1, 4).map((it, i) => `${i + 2}. ${it.name} (${it.qty} phần · ${fmtVnd(it.revenue)})`).join(' · ');
        return {
          handled: true,
          route: 'local_semantic',
          intentId,
          period: sem.period,
          match: sem,
          updatedSlots: { lastIntent: intentId },
          reply:
            `${g} món ${lead} kỳ ${periodSpec.label} là **${top1.name}**: ${top1.qty} phần · ${fmtVnd(top1.revenue)} (${top1.sharePercent}% doanh số)${e}.` +
            (runners ? `\n• Tiếp theo: ${runners}` : ''),
        };
      }

      const listLines = items.slice(0, limit).map((it, i) => `${i + 1}. ${it.name} — ${it.qty} phần · ${fmtVnd(it.revenue)}`);
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        period: sem.period,
        match: sem,
        updatedSlots: { lastIntent: intentId },
        reply: `🔥 Top ${limit} món ${lead} (${periodSpec.label}):\n${listLines.join('\n')}`,
      };
    }

    if (intentId === 'product_slow_popularity') {
      const products = await this.prisma.product.findMany({
        where: { isAvailable: true },
        select: { id: true, name: true, price: true },
        take: 100,
      });
      const soldRows = await this.prisma.orderItem.findMany({
        where: {
          kitchenStatus: { not: 'CANCELLED' },
          order: { status: 'PAID', paidAt: { gte: startUtc, lt: endUtc } },
        },
        select: { productId: true, quantity: true },
      });
      const qtyMap = new Map<number, number>();
      for (const row of soldRows) {
        qtyMap.set(row.productId, (qtyMap.get(row.productId) ?? 0) + row.quantity);
      }
      const ranked = products
        .map((p) => ({ name: p.name, qty: qtyMap.get(p.id) ?? 0, price: Number(p.price) }))
        .sort((a, b) => a.qty - b.qty || a.name.localeCompare(b.name));
      if (ranked.length === 0) {
        return { handled: true, route: 'local_semantic', intentId, period: sem.period, reply: `${g} chưa có món đang bán trong thực đơn${e}.` };
      }
      const slow1 = ranked[0]!;
      const tail = ranked.slice(1, 4).map((r) => `${r.name} (${r.qty})`).join(' · ');
      return {
        handled: true,
        route: 'local_semantic',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId },
        reply: `${g} món gọi ít / bán chậm nhất kỳ ${periodSpec.label} là **${slow1.name}** (${slow1.qty} phần · giá ${fmtVnd(slow1.price)})${e}.` + (tail ? `\n• Tiếp theo: ${tail}` : ''),
      };
    }

    // B. Peak / Quiet hours
    if (intentId === 'hour_peak_density' || intentId === 'hour_quiet_density') {
      const orders = await this.prisma.order.findMany({
        where: { status: 'PAID', paidAt: { gte: startUtc, lt: endUtc } },
        select: { paidAt: true, totalAmount: true },
        take: 3000,
      });
      if (orders.length === 0) {
        return { handled: true, route: 'local_semantic', intentId, period: sem.period, reply: `${g} kỳ ${periodSpec.label} chưa có đơn thanh toán để thống kê khung giờ${e}.` };
      }
      const buckets = new Map<number, { count: number; rev: number }>();
      for (const o of orders) {
        if (!o.paidAt) continue;
        const vnHour = (o.paidAt.getUTCHours() + 7) % 24;
        const cur = buckets.get(vnHour) ?? { count: 0, rev: 0 };
        cur.count += 1;
        cur.rev += Number(o.totalAmount);
        buckets.set(vnHour, cur);
      }
      const quiet = intentId === 'hour_quiet_density';
      const sorted = [...buckets.entries()].sort((a, b) =>
        quiet ? a[1].count - b[1].count || a[1].rev - b[1].rev : b[1].count - a[1].count || b[1].rev - a[1].rev,
      );
      const top = sorted[0]!;
      const hStr = `${String(top[0]).padStart(2, '0')}:00–${String((top[0] + 1) % 24).padStart(2, '0')}:00`;
      const adj = quiet ? 'vắng khách nhất' : 'đông khách / cao điểm nhất';
      return {
        handled: true,
        route: 'local_semantic',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId },
        reply: `${g} khung giờ ${adj} kỳ ${periodSpec.label} là **${hStr}** với ${top[1].count} đơn (${fmtVnd(top[1].rev)})${e}.`,
      };
    }

    // C. Staff void / top orders
    if (intentId === 'staff_top_orders') {
      const orders = await this.prisma.order.findMany({
        where: { status: 'PAID', paidAt: { gte: startUtc, lt: endUtc } },
        select: { totalAmount: true, cashier: { select: { username: true, employee: { select: { shortName: true } } } } },
        take: 3000,
      });
      if (orders.length === 0) {
        return { handled: true, route: 'local_semantic', intentId, period: sem.period, reply: `${g} kỳ ${periodSpec.label} chưa có đơn đã thanh toán${e}.` };
      }
      const byStaff = new Map<string, { count: number; rev: number }>();
      for (const o of orders) {
        const name = o.cashier?.employee?.shortName ?? o.cashier?.username ?? 'Hệ thống';
        const cur = byStaff.get(name) ?? { count: 0, rev: 0 };
        cur.count += 1;
        cur.rev += Number(o.totalAmount);
        byStaff.set(name, cur);
      }
      const top = [...byStaff.entries()].sort((a, b) => b[1].count - a[1].count || b[1].rev - a[1].rev)[0]!;
      return {
        handled: true,
        route: 'local_semantic',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId },
        reply: `${g} thu ngân xử lý nhiều đơn nhất kỳ ${periodSpec.label} là **${top[0]}**: ${top[1].count} đơn (${fmtVnd(top[1].rev)})${e}.`,
      };
    }

    if (intentId === 'staff_top_void') {
      const logs = await this.prisma.auditLog.findMany({
        where: { module: 'INVOICES', createdAt: { gte: startUtc, lt: endUtc } },
        select: { action: true, actorFullName: true, actorUsername: true },
        take: 500,
      });
      const voidLogs = logs.filter((l) => /huy|huỷ|hủy|void/i.test(l.action));
      if (voidLogs.length === 0) {
        return { handled: true, route: 'local_semantic', intentId, period: sem.period, reply: `${g} trong kỳ ${periodSpec.label} chưa ghi nhận lượt hủy đơn nào${e}.` };
      }
      const counts = new Map<string, number>();
      for (const l of voidLogs) {
        const actor = l.actorFullName ?? l.actorUsername ?? 'Không rõ';
        counts.set(actor, (counts.get(actor) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
      return {
        handled: true,
        route: 'local_semantic',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId },
        reply: `${g} người hủy đơn nhiều nhất kỳ ${periodSpec.label} là **${top[0]}** (${top[1]} lượt)${e}.`,
      };
    }

    if (intentId === 'order_top_value') {
      const top = await this.prisma.order.findFirst({
        where: {
          status: 'PAID',
          paidAt: { gte: startUtc, lt: endUtc },
          ...(sem.orderTypeFilter ? { orderType: sem.orderTypeFilter } : {}),
        },
        orderBy: [{ totalAmount: 'desc' }, { id: 'desc' }],
        select: { orderCode: true, totalAmount: true, orderType: true, takeawayNumber: true, table: { select: { name: true } } },
      });
      if (!top) {
        return {
          handled: true,
          route: 'local_semantic',
          intentId,
          period: sem.period,
          updatedSlots: { lastIntent: intentId, lastPeriod: sem.period, lastOrderType: sem.orderTypeFilter ?? '' },
          reply: `${g} kỳ ${periodSpec.label} chưa có đơn đã thanh toán phù hợp${e}.`,
        };
      }
      const loc = top.table?.name ?? (top.takeawayNumber ? `Mang về #${top.takeawayNumber}` : 'Mang về');
      return {
        handled: true,
        route: 'local_semantic',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId, lastPeriod: sem.period, lastOrderType: sem.orderTypeFilter ?? '' },
        reply: `${g} hóa đơn giá trị cao nhất kỳ ${periodSpec.label} là **${top.orderCode}** (${loc}): ${fmtVnd(top.totalAmount)}${e}.`,
      };
    }

    if (intentId === 'order_count') {
      const rows = await this.prisma.order.findMany({
        where: {
          createdAt: { gte: startUtc, lt: endUtc },
          ...(sem.orderTypeFilter ? { orderType: sem.orderTypeFilter } : {}),
        },
        select: { status: true, orderType: true, totalAmount: true },
        take: 5000,
      });
      const activeRows = rows.filter((r) => (r.status ?? 'PAID') !== 'VOIDED');
      const paidCount = activeRows.filter((r) => (r.status ?? 'PAID') === 'PAID').length;
      const servingCount = activeRows.filter((r) => r.status === 'SERVING').length;
      const pendingCount = activeRows.filter((r) => r.status === 'PENDING').length;
      const voidCount = rows.length - activeRows.length;
      const totalVal = activeRows.reduce((acc, r) => acc + Number(r.totalAmount ?? 0), 0);
      const typeLabel =
        sem.orderTypeFilter === 'TAKEAWAY'
          ? 'đơn mang về'
          : sem.orderTypeFilter === 'DINE_IN'
            ? 'đơn tại bàn'
            : 'đơn hàng';
      let extraType = '';
      if (!sem.orderTypeFilter && activeRows.length > 0) {
        const twCount = activeRows.filter((r) => r.orderType === 'TAKEAWAY').length;
        const diCount = activeRows.length - twCount;
        extraType = ` (${twCount} mang về · ${diCount} tại bàn)`;
      }
      const statusParts: string[] = [];
      if (paidCount > 0) statusParts.push(`${paidCount} đã thanh toán`);
      if (servingCount > 0) statusParts.push(`${servingCount} đang phục vụ`);
      if (pendingCount > 0) statusParts.push(`${pendingCount} chờ xác nhận`);
      if (voidCount > 0) statusParts.push(`${voidCount} đã hủy`);
      const statusDetail = statusParts.length > 0 ? ` — ${statusParts.join(' · ')}` : '';
      return {
        handled: true,
        route: 'local_semantic',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId, lastPeriod: sem.period, lastOrderType: sem.orderTypeFilter ?? '' },
        reply:
          activeRows.length > 0
            ? `${g} kỳ ${periodSpec.label} có **${activeRows.length} ${typeLabel}**${extraType}${statusDetail} · tổng giá trị **${fmtVnd(totalVal)}**${e}.`
            : `${g} kỳ ${periodSpec.label} chưa có ${typeLabel} nào${voidCount > 0 ? ` (có ${voidCount} đơn đã hủy)` : ''}${e}.`,
      };
    }

    if (intentId === 'recent_orders') {
      const limit = sem.explicitLimit ? Math.min(20, Math.max(1, sem.topLimit)) : 5;
      const rows = await this.prisma.order.findMany({
        where: {
          status: { not: 'VOIDED' },
          ...(sem.orderTypeFilter ? { orderType: sem.orderTypeFilter } : {}),
          ...(sem.explicitPeriod ? { createdAt: { gte: startUtc, lt: endUtc } } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: {
          orderCode: true,
          orderType: true,
          takeawayNumber: true,
          takeawayLabelFormat: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          table: { select: { name: true } },
        },
      });
      const typeLabel =
        sem.orderTypeFilter === 'TAKEAWAY'
          ? 'đơn mang về'
          : sem.orderTypeFilter === 'DINE_IN'
            ? 'đơn tại bàn'
            : 'đơn hàng';
      const statusVi = (st: string | null | undefined): string => {
        if (st === 'PAID') return 'Đã thanh toán';
        if (st === 'SERVING') return 'Đang phục vụ';
        if (st === 'PENDING') return 'Chờ xác nhận';
        return st ?? '';
      };
      const fmtLoc = (row: (typeof rows)[number]): string => {
        if (row.table?.name) return row.table.name;
        if (row.takeawayNumber !== null && row.takeawayNumber !== undefined) {
          const fmt =
            row.takeawayLabelFormat === TakeawayLabelFormat.LETTER
              ? TakeawayLabelFormat.LETTER
              : TakeawayLabelFormat.NUMBER;
          return formatTakeawayLabel(row.takeawayNumber, fmt);
        }
        return 'Mang về';
      };
      const fmtTime = (dtVal: Date | null | undefined): string => {
        if (!dtVal) return '';
        try {
          return new Intl.DateTimeFormat('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
          }).format(dtVal);
        } catch {
          return '';
        }
      };

      const slotsOut = {
        lastIntent: 'recent_orders',
        lastPeriod: sem.period,
        lastOrderType: sem.orderTypeFilter ?? '',
        lastLimit: limit,
      };

      if (rows.length === 0) {
        return {
          handled: true,
          route: 'local_semantic',
          intentId,
          period: sem.period,
          updatedSlots: slotsOut,
          reply: `${g} chưa ghi nhận ${typeLabel} nào gần đây${sem.explicitPeriod ? ` (${periodSpec.label})` : ''}${e}.`,
        };
      }

      if (limit === 1) {
        const r = rows[0]!;
        const tStr = fmtTime(r.createdAt);
        return {
          handled: true,
          route: 'local_semantic',
          intentId,
          period: sem.period,
          updatedSlots: slotsOut,
          reply: `${g} ${typeLabel} gần nhất là **${r.orderCode}** (${fmtLoc(r)}) · **${fmtVnd(r.totalAmount)}** · ${statusVi(r.status)}${tStr ? ` lúc ${tStr}` : ''}${e}.`,
        };
      }

      const headerLabel =
        sem.orderTypeFilter === 'TAKEAWAY'
          ? `${rows.length} đơn mang về gần nhất`
          : sem.orderTypeFilter === 'DINE_IN'
            ? `${rows.length} đơn tại bàn gần nhất`
            : `${rows.length} hóa đơn gần nhất`;
      return {
        handled: true,
        route: 'local_semantic',
        intentId,
        period: sem.period,
        updatedSlots: slotsOut,
        reply: `🧾 ${headerLabel}:\n${rows
          .map((r) => {
            const tStr = fmtTime(r.createdAt);
            return `• **${r.orderCode}** (${fmtLoc(r)}): ${fmtVnd(r.totalAmount)} · ${statusVi(r.status)}${tStr ? ` (${tStr})` : ''}`;
          })
          .join('\n')}`,
      };
    }

    // D. Live POS table snapshot & detail
    if (intentId === 'table_live_status') {
      const grid = await this.posService?.getTableGrid();
      const tables = grid?.tables ?? [];
      const busy = tables.filter((t) => t.status !== 'AVAILABLE');
      if (sem.tableNumber !== null) {
        const found = tables.find((t) => t.name.includes(String(sem.tableNumber)));
        if (!found) {
          return { handled: true, route: 'fast_path', intentId, reply: `${g} không tìm thấy Bàn ${sem.tableNumber} trong sơ đồ bàn${e}.` };
        }
        return {
          handled: true,
          route: 'fast_path',
          intentId,
          reply: found.activeOrder
            ? `🪑 **${found.name}** (${found.status}): đơn ${found.activeOrder.orderCode} · tạm tính ${fmtVnd(found.activeOrder.totalAmount)}.`
            : `✅ **${found.name}** hiện đang TRỐNG.`,
        };
      }
      const busyList = busy.slice(0, 6).map((t) => `${t.name} (${fmtVnd(t.activeOrder?.totalAmount ?? 0)})`).join(', ');
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        updatedSlots: { lastIntent: intentId },
        reply:
          `${g} hiện đang có **${busy.length}/${tables.length} bàn** có khách` +
          (grid?.takeaways.length ? ` và **${grid.takeaways.length} đơn mang về** đang mở` : '') +
          `${e}.` +
          (busyList ? `\n• Chi tiết: ${busyList}` : ''),
      };
    }

    // E. Operational fast-paths delegating cleanly to NestJS domain services
    if (intentId === 'fast_path_cashflow' && this.cashflowService) {
      const allowProfit = principal.isSuperAdmin || principal.permissions.dashboard.viewProfit;
      const preview = await this.cashflowService.preview(now, allowProfit);
      const reply =
        preview.blindMode || preview.expectedCashInDrawer === null
          ? `${g} ca hiện tại (${preview.shiftName}) đang bật Blind Mode — tiền đầu ca ${fmtVnd(preview.openingBudget)}; số thu tiền mặt & két lý thuyết được ẩn theo phân quyền${e}.`
          : `${g} đối soát két tiền hiện tại: Đầu ca ${fmtVnd(preview.openingBudget)} · Thu tiền mặt ${fmtVnd(preview.totalCashSales ?? 0)} · Nhập kho từ két ${fmtVnd(preview.totalCashImports ?? 0)} → **Két lý thuyết ${fmtVnd(preview.expectedCashInDrawer)}**${e}.`;
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId },
        reply,
      };
    }

    if (intentId === 'fast_path_qr' && this.paymentQrService) {
      const accounts = await this.paymentQrService.list(now);
      const lines = accounts.slice(0, 5).map(
        (a) => `• ${a.label} (${a.bankCode}): ${a.status} · Hôm nay ${fmtVnd(a.usedDay)}${a.dailyLimit ? `/${fmtVnd(a.dailyLimit)}` : ''}`,
      );
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        updatedSlots: { lastIntent: intentId },
        reply: accounts.length ? `🏦 Tài khoản VietQR:\n${lines.join('\n')}` : `${g} chưa cấu hình tài khoản VietQR nào${e}.`,
      };
    }

    if (intentId === 'fast_path_inventory' && this.inventoryService) {
      const inv = await this.inventoryService.list({ page: 1, limit: 5, fromDate: periodSpec.fromDate, toDate: periodSpec.toDate });
      const batchCount = inv.total ?? inv.items?.length ?? 0;
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId },
        reply: `${g} chi phí nhập kho kỳ ${periodSpec.label}: **${fmtVnd(inv.summary.totalImportCost)}** (${batchCount} phiếu · Từ két ${fmtVnd(inv.summary.totalCashDrawerCost)}, ngoài két ${fmtVnd(inv.summary.totalExternalCost)})${e}.`,
      };
    }

    if (intentId === 'fast_path_discounts' && this.discountsService) {
      const list = await this.discountsService.list({ page: 1, limit: 10 }, now);
      const active = list.items.filter((d) => d.isActive);
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        updatedSlots: { lastIntent: intentId },
        reply: active.length
          ? `🎟 Có ${active.length} mã giảm giá đang bật: ${active.slice(0, 4).map((d) => `${d.code} (${d.name})`).join(', ')}.`
          : `${g} hiện không có mã giảm giá nào đang kích hoạt${e}.`,
      };
    }

    if (intentId === 'fast_path_schedule' && this.schedulesService) {
      const todayIso = businessDateString(now);
      const d = new Date(`${todayIso}T00:00:00.000Z`);
      const monOffset = (d.getUTCDay() + 6) % 7;
      const weekStart = addDaysIso(todayIso, -monOffset);
      const sched = await this.schedulesService.getScheduleWeek(weekStart);
      const canSeeAll = principal.isSuperAdmin || principal.permissions.schedules.view;
      const todayDow = monOffset;
      const cells = sched.cells.filter((c) => c.dayOfWeek === todayDow && c.employees.length > 0);
      const visible = canSeeAll
        ? cells.map((c) => `• ${c.timeSlot}: ${c.employees.map((em) => em.shortName).join(', ')}`)
        : cells
            .filter((c) => c.employees.some((em) => em.id === principal.employeeId))
            .map((c) => `• ${c.timeSlot}: Ca làm việc của ${persona.userCall}`);
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        updatedSlots: { lastIntent: intentId },
        reply: visible.length ? `📅 Lịch trực hôm nay:\n${visible.join('\n')}` : `${g} hôm nay chưa ghi nhận ca trực phù hợp${e}.`,
      };
    }

    if (intentId === 'fast_path_payroll' && this.payrollService) {
      const p = resolveVietnamPeriod(sem.explicitPeriod ? sem.period : 'thang', now);
      const pay = await this.payrollService.getPayrollSummary({ fromDate: p.fromDate, toDate: p.toDate });
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId },
        reply: `${g} tổng hợp lương kỳ ${p.label}: ${pay.summary.totalEmployees} nhân sự · Quỹ lương ước tính **${fmtVnd(pay.summary.totalSalary)}**${e}.`,
      };
    }

    if (intentId === 'fast_path_audit') {
      const logs = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        reply: logs.length
          ? `📜 5 thao tác gần nhất:\n${logs.map((l) => `• [${l.module}] ${l.summary}`).join('\n')}`
          : `${g} chưa có nhật ký thao tác nào${e}.`,
      };
    }

    // F. Dashboard-backed overview / revenue / profit / kitchen / voids / comparison / recent orders
    if (this.dashboardService) {
      const ov = await this.dashboardService.getOverview(dashQuery, principal, now);
      if (intentId === 'fast_path_profit') {
        const prof = ov.kpis.profit;
        return {
          handled: true,
          route: 'fast_path',
          intentId,
          period: sem.period,
          updatedSlots: { lastIntent: intentId, lastPeriod: sem.period },
          reply: prof
            ? `${g} lợi nhuận sau kho kỳ ${periodSpec.label}: **${fmtVnd(prof.grossProfitAfterInventory)}**` +
              (prof.netOperatingProfit !== null ? ` · Sau trừ lương: **${fmtVnd(prof.netOperatingProfit)}** (${prof.marginPercent ?? 0}%)` : '') +
              `${e}.`
            : `${g} chưa có số liệu lợi nhuận cho kỳ ${periodSpec.label}${e}.`,
        };
      }
      if (intentId === 'fast_path_kitchen') {
        const ks = ov.kitchenStations;
        const lines = (ks?.stations ?? []).map((s) => `• ${s.label}: ${s.printedQty} phần (${fmtVnd(s.revenue)})`);
        return {
          handled: true,
          route: 'fast_path',
          intentId,
          period: sem.period,
          updatedSlots: { lastIntent: intentId, lastPeriod: sem.period },
          reply: lines.length ? `🍳 Sản lượng trạm bếp (${periodSpec.label}):\n${lines.join('\n')}` : `${g} kỳ ${periodSpec.label} chưa có số liệu trạm bếp${e}.`,
        };
      }
      if (intentId === 'fast_path_voids') {
        const dr = ov.discountsAndRisk;
        return {
          handled: true,
          route: 'fast_path',
          intentId,
          period: sem.period,
          updatedSlots: { lastIntent: intentId, lastPeriod: sem.period },
          reply: `${g} kỳ ${periodSpec.label} có **${dr?.voidedOrderCount ?? 0} đơn hủy** (ước tính ${fmtVnd(dr?.voidedAmount ?? 0)})${e}.`,
        };
      }
      if (intentId === 'period_comparison') {
        const rev = ov.kpis.revenue;
        const cur = Number(rev?.netPaidAmount ?? 0);
        const prev = Number(rev?.previousNetPaidAmount ?? 0);
        const diff = cur - prev;
        return {
          handled: true,
          route: 'local_semantic',
          intentId,
          period: sem.period,
          updatedSlots: { lastIntent: intentId, lastPeriod: sem.period },
          reply: `${g} ${periodSpec.label} đạt **${fmtVnd(cur)}** vs kỳ trước **${fmtVnd(prev)}** (${diff >= 0 ? '+' : '-'}${fmtVnd(Math.abs(diff))}${rev?.growthPercent !== null && rev?.growthPercent !== undefined ? ` · ${rev.growthPercent > 0 ? '+' : ''}${rev.growthPercent.toFixed(1)}%` : ''})${e}.`,
        };
      }
      // Overview / revenue
      const rev = ov.kpis.revenue;
      return {
        handled: true,
        route: 'fast_path',
        intentId,
        period: sem.period,
        updatedSlots: { lastIntent: intentId, lastPeriod: sem.period },
        reply: `${g} kỳ ${periodSpec.label}: thực thu **${fmtVnd(rev?.netPaidAmount ?? 0)}** qua **${rev?.paidOrderCount ?? 0} đơn** (TB ${fmtVnd(rev?.averageOrderValue ?? 0)}/đơn)${e}.`,
      };
    }

    return { handled: false, guardBlocked: false, period: sem.period, match: sem };
  }
}
