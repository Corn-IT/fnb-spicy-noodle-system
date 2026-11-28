-- Idempotent read-only PostgreSQL role setup for @POS_Lona_bot (fnb-biz-bot).
-- Exposes ONLY non-secret business & operational columns; strictly blocks credentials,
-- active session tokens, employee PII/citizenId/bank accounts, raw QR tokens, VAPID keys,
-- push subscriptions, and IP/device audit metadata.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fnb_bot_ro') THEN
    CREATE ROLE fnb_bot_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  ELSE
    ALTER ROLE fnb_bot_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END
$$;

ALTER ROLE fnb_bot_ro SET default_transaction_read_only = on;
ALTER ROLE fnb_bot_ro SET statement_timeout = '3000ms';
ALTER ROLE fnb_bot_ro SET lock_timeout = '1000ms';

GRANT CONNECT ON DATABASE fnb_pos TO fnb_bot_ro;
GRANT USAGE ON SCHEMA public TO fnb_bot_ro;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM fnb_bot_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM fnb_bot_ro;
REVOKE CREATE ON SCHEMA public FROM fnb_bot_ro;

-- Masked payment accounts view (never expose full account_no)
CREATE OR REPLACE VIEW public.v_bot_payment_accounts AS
SELECT
  id,
  label,
  bank_code,
  CASE
    WHEN length(account_no) <= 4 THEN '****'
    ELSE '****' || right(account_no, 4)
  END AS account_no_masked,
  account_name,
  priority,
  is_active,
  daily_limit,
  monthly_limit,
  yearly_limit,
  created_at,
  updated_at
FROM public.payment_accounts;

GRANT SELECT ON public.v_bot_payment_accounts TO fnb_bot_ro;

-- Column-level SELECT grants on safe business tables only
GRANT SELECT (id, category, name, normalized_name, is_active, created_at)
  ON public.master_data TO fnb_bot_ro;

GRANT SELECT (id, full_name, short_name, position_id, specialty_id, start_date, is_deleted, deleted_at, created_at)
  ON public.employees TO fnb_bot_ro;

GRANT SELECT (id, employee_id, username, is_super_admin, role_label, is_active, created_at)
  ON public.users TO fnb_bot_ro;

GRANT SELECT (id, name, status, active_order_id)
  ON public.dining_tables TO fnb_bot_ro;

GRANT SELECT (id, name, subtitle, category_id, price, station, is_available, sort_order, created_at)
  ON public.products TO fnb_bot_ro;

GRANT SELECT (parent_product_id, child_product_id, quantity)
  ON public.combo_items TO fnb_bot_ro;

GRANT SELECT (id, product_id, name, is_required, max_select, is_auto_select, allow_substitution)
  ON public.modifier_groups TO fnb_bot_ro;

GRANT SELECT (id, group_id, name, extra_price, is_default_checked, is_available, default_substitute_name, allowed_substitute_names)
  ON public.modifiers TO fnb_bot_ro;

GRANT SELECT (
  id, order_code, order_type, order_source, table_id, takeaway_number, takeaway_label_format,
  status, payment_method, payment_account_id, cash_amount, transfer_amount,
  subtotal_amount, discount_amount, discount_id, discount_snapshot, total_amount,
  merged_into_order_id, table_transfer_logs, cashier_id, note, void_reason,
  pending_payment_edit, created_at, paid_at
) ON public.orders TO fnb_bot_ro;

GRANT SELECT (id, order_type, table_id, note, revision, created_by, updated_by, submitted_order_id, submitted_at, created_at, updated_at)
  ON public.pos_drafts TO fnb_bot_ro;

GRANT SELECT (business_date, last_number, updated_at)
  ON public.takeaway_sequences TO fnb_bot_ro;

GRANT SELECT (
  id, code, name, value_type, value, max_discount_amount, scope, min_order_amount,
  starts_at, ends_at, active_weekdays, time_window_start, time_window_end,
  usage_limit, used_count, is_active, is_archived, created_by, created_at, updated_at
) ON public.discounts TO fnb_bot_ro;

GRANT SELECT (id, discount_id, category_id, product_id)
  ON public.discount_targets TO fnb_bot_ro;

GRANT SELECT (id, order_id, product_id, quantity, unit_price, modifiers_snapshot, item_note, batch_no, item_source, kitchen_status, is_takeaway, created_at)
  ON public.order_items TO fnb_bot_ro;

GRANT SELECT (id, ingredient_mdm_id, supplier_mdm_id, supplier_name_snapshot, item_name_snapshot, unit_name, unit_price, quantity, total_cost, payment_source, import_date, note, created_by, is_deleted, deleted_at, created_at)
  ON public.inventory_imports TO fnb_bot_ro;

GRANT SELECT (id, settlement_date, shift_name, opening_budget, total_cash_sales, total_transfer_sales, total_cash_imports, expected_cash_in_drawer, actual_counted_cash, discrepancy_amount, status, denominations_detail, note, closed_by, created_at)
  ON public.cash_drawer_settlements TO fnb_bot_ro;

GRANT SELECT (id, week_start_date, day_of_week, time_slot, employee_ids, created_by, updated_at)
  ON public.work_schedules TO fnb_bot_ro;

GRANT SELECT (id, module, action, actor_id, actor_full_name, actor_username, summary, metadata, created_at)
  ON public.audit_logs TO fnb_bot_ro;

-- Explicitly allow utility search function if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'f_search_norm') THEN
    GRANT EXECUTE ON FUNCTION public.f_search_norm(text) TO fnb_bot_ro;
  END IF;
END
$$;
