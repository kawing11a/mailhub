UPDATE "emails"
SET
  "sent_at" = COALESCE("sent_at", "received_at", "created_at"),
  "received_at" = COALESCE("received_at", "sent_at", "created_at")
WHERE
  "folder" = 'SENT'
  AND ("sent_at" IS NULL OR "received_at" IS NULL);
