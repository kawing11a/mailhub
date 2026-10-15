CREATE TABLE "system_preferences" (
    "id" VARCHAR(20) NOT NULL DEFAULT 'global',
    "is_ai_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "semantic_search_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_preferences_pkey" PRIMARY KEY ("id")
);
