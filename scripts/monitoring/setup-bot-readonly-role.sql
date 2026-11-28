-- Idempotent read-only PostgreSQL role setup for @POS_Lona_bot (fnb-biz-bot).
-- Designed for the Owner / Senior Management POS-Overview group:
-- Grants SELECT across all 20 business & operational tables/columns while STRICTLY blocking
-- ONLY the 3 pure technical cryptographic secrets that humans never inspect:
--   1. users.password_hash (bcrypt hash)
--   2. master_data row normalized_name = 'web_push_vapid_keys' (VAPID private key)
--   3. push_subscriptions.p256dh & push_subscriptions.auth (Web Push encryption keys)

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

-- Safe view over master_data exposing all 7 MDM categories & SYSTEM_CONFIG
-- (excluding ONLY the Web Push VAPID private key row)
CREATE OR REPLACE VIEW public.v_bot_master_data AS
SELECT
  id,
  category,
  name,
  normalized_name,
  metadata,
  is_active,
  created_at
FROM public.master_data
WHERE normalized_name <> 'web_push_vapid_keys';

GRANT SELECT ON public.v_bot_master_data TO fnb_bot_ro;

-- Backward-compatible masked view alongside direct payment_accounts grant for owners
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

-- Users: all operational, RBAC, and active session IP/device columns (excluding ONLY password_hash)
GRANT SELECT (
  id, employee_id, username, is_super_admin, role_label, permissions, ui_preferences,
  is_active, active_session_id, active_session_ip, active_session_device,
  active_session_agent, active_session_at, last_revoked_notice, created_at
) ON public.users TO fnb_bot_ro;

-- Push subscriptions: operational endpoint/device tracking columns (excluding ONLY p256dh & auth keys)
GRANT SELECT (
  id, user_id, session_id, endpoint, user_agent, device_label,
  created_at, updated_at, last_notified_at
) ON public.push_subscriptions TO fnb_bot_ro;

-- Full read-only SELECT access on the remaining 17 tables for Owner / Management queries
GRANT SELECT ON public.employees TO fnb_bot_ro;
GRANT SELECT ON public.dining_tables TO fnb_bot_ro;
GRANT SELECT ON public.products TO fnb_bot_ro;
GRANT SELECT ON public.combo_items TO fnb_bot_ro;
GRANT SELECT ON public.modifier_groups TO fnb_bot_ro;
GRANT SELECT ON public.modifiers TO fnb_bot_ro;
GRANT SELECT ON public.payment_accounts TO fnb_bot_ro;
GRANT SELECT ON public.orders TO fnb_bot_ro;
GRANT SELECT ON public.pos_drafts TO fnb_bot_ro;
GRANT SELECT ON public.takeaway_sequences TO fnb_bot_ro;
GRANT SELECT ON public.discounts TO fnb_bot_ro;
GRANT SELECT ON public.discount_targets TO fnb_bot_ro;
GRANT SELECT ON public.order_items TO fnb_bot_ro;
GRANT SELECT ON public.inventory_imports TO fnb_bot_ro;
GRANT SELECT ON public.cash_drawer_settlements TO fnb_bot_ro;
GRANT SELECT ON public.work_schedules TO fnb_bot_ro;
GRANT SELECT ON public.audit_logs TO fnb_bot_ro;

-- Explicitly allow utility search function if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'f_search_norm') THEN
    GRANT EXECUTE ON FUNCTION public.f_search_norm(text) TO fnb_bot_ro;
  END IF;
END
$$;
