-- CreateTable
CREATE TABLE IF NOT EXISTS "email_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stop_processing" BOOLEAN NOT NULL DEFAULT false,
    "account_id" UUID,
    "account_label_id" UUID,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "email_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "email_rules_account_label_id_fkey" FOREIGN KEY ("account_label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "email_rules"
ADD COLUMN IF NOT EXISTS "account_label_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_rules_organization_id_is_active_priority_idx"
ON "email_rules"("organization_id", "is_active", "priority");

CREATE INDEX IF NOT EXISTS "email_rules_account_label_id_idx"
ON "email_rules"("account_label_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"email_rules"'::regclass
      AND conname = 'email_rules_account_label_id_fkey'
  ) THEN
    ALTER TABLE "email_rules"
    ADD CONSTRAINT "email_rules_account_label_id_fkey"
    FOREIGN KEY ("account_label_id") REFERENCES "labels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
