import { Injectable } from '@nestjs/common';
import type {
  AiPersonaProfile,
  AiSuggestionChip,
  AuthPrincipal,
  SemanticIntentId,
} from '@fnb/shared';

export interface RbacCheckResult {
  readonly allowed: boolean;
  readonly missingLabel?: string;
}

const SQL_FORBIDDEN_KEYWORDS =
  /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|VACUUM|ANALYZE|REINDEX|CLUSTER|COMMENT|LOCK|SET|RESET|SHOW|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|PREPARE|EXECUTE|DEALLOCATE|CALL|DO)\b/i;
const SQL_FORBIDDEN_SECRETS = /\b(?:password_hash|web_push_vapid_keys|p256dh|auth)\b/i;
const SQL_FORBIDDEN_FUNCTIONS =
  /\b(?:pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|pg_sleep|dblink|lo_import|lo_export|inet_server_addr|current_setting)\b/i;

@Injectable()
export class RbacToolPolicyService {
  private readonly intentRules: Readonly<
    Record<SemanticIntentId, { label: string; check: (p: AuthPrincipal) => boolean }>
  > = {
    product_top_revenue: { label: 'Dashboard doanh thu (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    product_list_revenue: { label: 'Dashboard doanh thu (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    product_slow_popularity: { label: 'Dashboard món bán (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    product_top_popularity: { label: 'Dashboard món bán (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    product_list_popularity: { label: 'Dashboard món bán (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    hour_peak_density: { label: 'Dashboard khung giờ (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    hour_quiet_density: { label: 'Dashboard khung giờ (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    staff_top_orders: { label: 'Dashboard tổng quan (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    period_comparison: { label: 'Dashboard tổng quan (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    fast_path_overview: { label: 'Dashboard tổng quan (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    fast_path_revenue: { label: 'Dashboard doanh thu (dashboard.view)', check: (p) => p.permissions.dashboard.view },
    fast_path_profit: {
      label: 'Lợi nhuận kinh doanh (dashboard.viewProfit)',
      check: (p) => p.permissions.dashboard.view && p.permissions.dashboard.viewProfit,
    },
    table_live_status: {
      label: 'Quầy POS / Trạng thái bàn (pos.view)',
      check: (p) => p.permissions.pos.view || p.permissions.invoices.view,
    },
    fast_path_kitchen: {
      label: 'Trạm bếp POS (pos.view)',
      check: (p) => p.permissions.pos.view || p.permissions.dashboard.view,
    },
    order_top_value: { label: 'Hóa đơn bán hàng (invoices.view)', check: (p) => p.permissions.invoices.view },
    recent_orders: { label: 'Hóa đơn bán hàng (invoices.view)', check: (p) => p.permissions.invoices.view },
    staff_top_void: { label: 'Kiểm soát đơn hủy (invoices.view)', check: (p) => p.permissions.invoices.view },
    fast_path_voids: { label: 'Hóa đơn hủy (invoices.view)', check: (p) => p.permissions.invoices.view },
    fast_path_cashflow: { label: 'Sổ quỹ & Kết ca (cashflow.view)', check: (p) => p.permissions.cashflow.view },
    fast_path_qr: { label: 'Tài khoản nhận VietQR (paymentQr.view)', check: (p) => p.permissions.paymentQr.view },
    fast_path_inventory: { label: 'Nhập kho nguyên liệu (inventory.view)', check: (p) => p.permissions.inventory.view },
    fast_path_discounts: { label: 'Mã giảm giá (discounts.view)', check: (p) => p.permissions.discounts.view },
    fast_path_schedule: {
      label: 'Lịch trực nhân sự (schedules.view hoặc nhân sự hợp lệ)',
      check: (p) => p.permissions.schedules.view || p.employeeId > 0,
    },
    fast_path_payroll: { label: 'Bảng lương nhân sự (payroll.view)', check: (p) => p.permissions.payroll.view },
    fast_path_audit: { label: 'Nhật ký kiểm toán (Chỉ Super Admin)', check: (p) => p.isSuperAdmin },
    system_docs: { label: 'Hướng dẫn sử dụng POS', check: () => true },
  };

  canAccessIntent(intentId: SemanticIntentId, principal: AuthPrincipal): RbacCheckResult {
    if (principal.isSuperAdmin) {
      return { allowed: true };
    }
    const rule = this.intentRules[intentId];
    if (!rule) {
      return { allowed: false, missingLabel: 'Phạm vi quản trị hệ thống' };
    }
    if (rule.check(principal)) {
      return { allowed: true };
    }
    return { allowed: false, missingLabel: rule.label };
  }

  canExecuteTool(toolName: string, principal: AuthPrincipal): RbacCheckResult {
    if (toolName === 'search_system_docs') return { allowed: true };
    if (toolName === 'run_readonly_sql') {
      return principal.isSuperAdmin
        ? { allowed: true }
        : { allowed: false, missingLabel: 'Truy vấn SQL nâng cao (Chỉ Super Admin)' };
    }
    if (principal.isSuperAdmin) return { allowed: true };

    switch (toolName) {
      case 'get_store_overview':
      case 'get_item_sales':
        return principal.permissions.dashboard.view
          ? { allowed: true }
          : { allowed: false, missingLabel: 'Dashboard doanh thu (dashboard.view)' };
      case 'get_cashflow_status':
        return principal.permissions.cashflow.view
          ? { allowed: true }
          : { allowed: false, missingLabel: 'Sổ quỹ & Kết ca (cashflow.view)' };
      case 'get_payroll_summary':
        return principal.permissions.payroll.view
          ? { allowed: true }
          : { allowed: false, missingLabel: 'Bảng lương (payroll.view)' };
      case 'get_work_schedule':
        return principal.permissions.schedules.view || principal.employeeId > 0
          ? { allowed: true }
          : { allowed: false, missingLabel: 'Lịch trực (schedules.view)' };
      default:
        return { allowed: false, missingLabel: 'Quyền hệ thống' };
    }
  }

  formatPermissionDenied(missingLabel: string, persona: AiPersonaProfile): string {
    if (persona.botSelf === 'em' || persona.botSelf === 'con') {
      return `Dạ tài khoản của ${persona.userCall} hiện chưa được cấp quyền xem <b>${missingLabel}</b> nên ${persona.botSelf} chưa thể tra thông tin này ạ.`;
    }
    return `Tài khoản của ${persona.userCall} hiện chưa được cấp quyền xem <b>${missingLabel}</b> nên ${persona.botSelf} chưa thể tra thông tin này nhé.`;
  }

  validateReadonlySql(rawSql: string): { ok: true; sql: string } | { ok: false; reason: string } {
    const cleaned = rawSql.trim().replace(/;+\s*$/, '');
    if (!cleaned) return { ok: false, reason: 'Câu lệnh SQL trống.' };
    if (/--|\/\*|\*\//.test(cleaned)) {
      return { ok: false, reason: 'Không cho phép comment SQL trong truy vấn AI.' };
    }
    if (cleaned.includes(';')) {
      return { ok: false, reason: 'Chỉ được phép chạy 1 câu lệnh SELECT duy nhất.' };
    }
    if (!/^(?:SELECT|WITH)\b/i.test(cleaned)) {
      return { ok: false, reason: 'Chỉ cho phép truy vấn SELECT hoặc WITH...SELECT.' };
    }
    if (SQL_FORBIDDEN_KEYWORDS.test(cleaned)) {
      return { ok: false, reason: 'Chặn từ khóa ghi/sửa dữ liệu trong chế độ chỉ đọc.' };
    }
    if (SQL_FORBIDDEN_SECRETS.test(cleaned)) {
      return { ok: false, reason: 'Chặn cột bí mật kỹ thuật (password_hash, vapid, p256dh/auth).' };
    }
    if (SQL_FORBIDDEN_FUNCTIONS.test(cleaned)) {
      return { ok: false, reason: 'Chặn hàm hệ thống PostgreSQL.' };
    }
    if (/\bmaster_data\b/i.test(cleaned)) {
      return { ok: false, reason: 'Hãy dùng view an toàn v_bot_master_data thay cho bảng master_data gốc.' };
    }
    return { ok: true, sql: cleaned };
  }

  getSuggestionChips(principal: AuthPrincipal, geminiEnabled: boolean): AiSuggestionChip[] {
    const chips: AiSuggestionChip[] = [];
    const p = principal.permissions;

    if (principal.isSuperAdmin || p.dashboard.view) {
      chips.push(
        { id: 'top-product', label: 'Món gọi nhiều nhất', prompt: 'Món ăn được gọi nhiều nhất hôm nay là món nào?', category: 'ops', engineHint: 'local' },
        { id: 'overview', label: 'Tổng quan hôm nay', prompt: 'Tổng quan tình hình kinh doanh hôm nay', category: 'ops', engineHint: 'local' },
        { id: 'peak-hour', label: 'Khung giờ cao điểm', prompt: 'Khung giờ nào quán đông khách nhất hôm nay?', category: 'ops', engineHint: 'local' },
      );
    }
    if (principal.isSuperAdmin || p.pos.view) {
      chips.push({
        id: 'live-tables',
        label: 'Bàn đang phục vụ',
        prompt: 'Hiện tại có bao nhiêu bàn đang phục vụ?',
        category: 'ops',
        engineHint: 'local',
      });
    }
    if (principal.isSuperAdmin || p.cashflow.view) {
      chips.push({
        id: 'cash-drawer',
        label: 'Kiểm tra két tiền',
        prompt: 'Kiểm tra két tiền chốt ca hôm nay',
        category: 'finance',
        engineHint: 'local',
      });
    }
    if (principal.isSuperAdmin || p.paymentQr.view) {
      chips.push({
        id: 'qr-limit',
        label: 'Hạn mức VietQR',
        prompt: 'Hạn mức tài khoản VietQR hôm nay',
        category: 'finance',
        engineHint: 'local',
      });
    }
    if (principal.isSuperAdmin || p.inventory.view) {
      chips.push({
        id: 'inv-week',
        label: 'Nhập kho tuần này',
        prompt: 'Chi phí nhập kho tuần này',
        category: 'inventory',
        engineHint: 'local',
      });
    }
    if (principal.isSuperAdmin || p.schedules.view || principal.employeeId > 0) {
      chips.push({
        id: 'my-schedule',
        label: p.schedules.view || principal.isSuperAdmin ? 'Lịch trực hôm nay' : 'Lịch trực của tôi',
        prompt: 'Lịch trực hôm nay có những ai?',
        category: 'hr',
        engineHint: 'local',
      });
    }
    chips.push({
      id: 'pos-printer',
      label: 'Cách tách bếp & in',
      prompt: 'Quy tắc tách bếp COMBO và in RawBT 80mm hoạt động thế nào?',
      category: 'system',
      engineHint: 'local',
    });
    if (geminiEnabled && (principal.isSuperAdmin || p.dashboard.view)) {
      chips.push({
        id: 'ai-trend',
        label: 'Phân tích xu hướng',
        prompt: 'Phân tích chi tiết xu hướng doanh thu tuần này và đề xuất món nên đẩy bán',
        category: 'ops',
        engineHint: 'gemini',
      });
    }
    return chips.slice(0, 8);
  }
}
