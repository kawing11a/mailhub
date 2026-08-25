ALTER TABLE "emails"
  ADD COLUMN IF NOT EXISTS "provider_message_id" VARCHAR(512);

ALTER TABLE "attachments"
  ADD COLUMN IF NOT EXISTS "ordinal" INTEGER,
  ADD COLUMN IF NOT EXISTS "imap_part" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "gmail_attachment_id" VARCHAR(512);

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "email_id" ORDER BY "created_at", "id") - 1 AS "ordinal"
  FROM "attachments"
)
UPDATE "attachments" AS a
SET "ordinal" = numbered."ordinal"
FROM numbered
WHERE a."id" = numbered."id" AND a."ordinal" IS NULL;
