ALTER TABLE "organization_members"
ADD COLUMN "personal_ai_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN "semantic_search_enabled" BOOLEAN NOT NULL DEFAULT TRUE;
