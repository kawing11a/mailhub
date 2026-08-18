ALTER TABLE "email_accounts"
ADD COLUMN "owner_user_id" UUID;

WITH earliest_admin AS (
  SELECT DISTINCT ON (om."organization_id")
    om."organization_id",
    om."user_id"
  FROM "organization_members" AS om
  WHERE om."role" = 'admin'
  ORDER BY om."organization_id", om."joined_at" ASC, om."user_id" ASC
)
UPDATE "email_accounts" AS ea
SET "owner_user_id" = ea_admin."user_id"
FROM earliest_admin AS ea_admin
WHERE ea."organization_id" = ea_admin."organization_id"
  AND ea."owner_user_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "email_accounts" AS ea
    WHERE ea."owner_user_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill email account owners because at least one organization has no admin';
  END IF;
END
$$;

ALTER TABLE "email_accounts"
ALTER COLUMN "owner_user_id" SET NOT NULL;

ALTER TABLE "email_accounts"
ADD CONSTRAINT "email_accounts_organization_id_owner_user_id_fkey"
FOREIGN KEY ("organization_id", "owner_user_id")
REFERENCES "organization_members"("organization_id", "user_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE INDEX "email_accounts_owner_user_id_idx" ON "email_accounts"("owner_user_id");

INSERT INTO "member_email_account_access" ("organization_id", "user_id", "account_id")
SELECT ea."organization_id", ea."owner_user_id", ea."id"
FROM "email_accounts" AS ea
ON CONFLICT DO NOTHING;
