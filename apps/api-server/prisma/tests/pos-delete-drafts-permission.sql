\set ON_ERROR_STOP on
BEGIN;
-- Temporary tables isolate this regression from all application data.
CREATE TEMP TABLE master_data (id int, category text, normalized_name text);
CREATE TEMP TABLE employees (id int, position_id int);
CREATE TEMP TABLE users (id int, employee_id int, role_label text, permissions jsonb);
INSERT INTO master_data VALUES (1, 'POSITION', 'thu ngan quay'), (2, 'POSITION', 'phuc vu');
INSERT INTO employees VALUES (1, 1), (2, 2), (3, 1), (4, 2), (5, 2), (6, 2), (7, 2);
INSERT INTO users VALUES
  (1, 1, NULL, '{"pos":{"view":true,"create":true,"delete":false},"menu":{"view":true}}'),
  (2, 2, ' Thu ngân ', '{"pos":{"view":true,"delete":false}}'),
  (3, 3, 'Cashier', '{"pos":{"delete":false,"deleteDrafts":false}}'),
  (4, 4, 'Chỉ xem', '{"pos":{"view":true,"delete":false}}'),
  (5, 5, NULL, '{"pos":{"create":true,"update":true,"delete":false}}'),
  (6, 6, 'Quản lý', '{"pos":{"delete":true},"settings":{"update":true}}'),
  (7, 7, 'Cashier', '{}');
CREATE TEMP TABLE permissions_before AS SELECT id, permissions FROM users;
\ir ../migrations/20261127000000_add_pos_delete_drafts_permission/migration.sql
DO $$
BEGIN
  IF (SELECT count(*) FROM users WHERE permissions #> '{pos,deleteDrafts}' = 'true'::jsonb) <> 4 THEN
    RAISE EXCEPTION 'Cashier identity and former draft-delete authority must grant exactly 4 accounts';
  END IF;
  IF (SELECT permissions #> '{pos,deleteDrafts}' FROM users WHERE id = 3) <> 'false'::jsonb THEN
    RAISE EXCEPTION 'Explicit false must remain false';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id IN (4,5) AND permissions->'pos' ? 'deleteDrafts') THEN
    RAISE EXCEPTION 'View-only and generic POS create/update access are not cashier identity';
  END IF;
  IF EXISTS (
    SELECT 1 FROM users u JOIN permissions_before b USING (id)
    WHERE u.permissions #- '{pos,deleteDrafts}' IS DISTINCT FROM b.permissions #- '{pos,deleteDrafts}'
      AND u.id <> 7
  ) THEN RAISE EXCEPTION 'Unrelated permissions, especially pos.delete, must remain unchanged'; END IF;
  IF (SELECT permissions FROM users WHERE id = 7) <> '{"pos":{"deleteDrafts":true}}'::jsonb THEN
    RAISE EXCEPTION 'Explicit cashier with no POS object must receive only draft deletion';
  END IF;
END $$;
CREATE TEMP TABLE permissions_after AS SELECT id, permissions FROM users;
\ir ../migrations/20261127000000_add_pos_delete_drafts_permission/migration.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users u JOIN permissions_after a USING (id) WHERE u.permissions IS DISTINCT FROM a.permissions) THEN
    RAISE EXCEPTION 'Migration must be idempotent';
  END IF;
END $$;
ROLLBACK;
\echo Draft permission migration: all 7 fixtures and idempotency passed.
