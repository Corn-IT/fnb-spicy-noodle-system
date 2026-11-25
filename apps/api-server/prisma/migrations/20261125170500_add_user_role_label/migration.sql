-- Add optional custom role label to users (fallback to employee.position.name from MDM POSITION)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role_label" VARCHAR(64);
