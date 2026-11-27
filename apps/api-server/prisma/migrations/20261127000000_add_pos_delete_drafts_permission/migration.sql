-- Identify cashiers by their explicit role label or linked cashier position, never by POS create access.
-- Preserve any explicit decision about this permission and every other permission.
UPDATE "users" AS u
SET "permissions" = jsonb_set(
  u."permissions",
  '{pos}',
  COALESCE(u."permissions"->'pos', '{}'::jsonb) || '{"deleteDrafts": true}'::jsonb
)
WHERE NOT (COALESCE(u."permissions"->'pos', '{}'::jsonb) ? 'deleteDrafts')
  AND (
    u."permissions" #> '{pos,delete}' = 'true'::jsonb
    OR lower(trim(COALESCE(u."role_label", ''))) IN ('thu ngân', 'thu ngân quầy', 'cashier')
    OR EXISTS (
      SELECT 1 FROM "employees" e
      JOIN "master_data" p ON p."id" = e."position_id"
      WHERE e."id" = u."employee_id"
        AND p."category" = 'POSITION'
        AND p."normalized_name" IN ('thu ngan', 'thu ngan quay', 'cashier')
    )
  );
