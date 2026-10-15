UPDATE "emails"
SET "folder" = 'DRAFTS'
WHERE "is_draft" = true
  AND "folder" = 'Drafts';
