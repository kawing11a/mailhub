-- CreateTable
CREATE TABLE "signatures" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "content_html" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "is_ai_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ai_provider" VARCHAR(50) NOT NULL DEFAULT 'openai',
    "ai_api_key" TEXT,
    "ai_base_url" VARCHAR(512),
    "ai_model_name" VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
    "ai_custom_prompt" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "experiment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_webhooks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_summary_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,
    "label_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    "email_count" INTEGER NOT NULL DEFAULT 0,
    "summary_text" TEXT,
    "error_message" TEXT,
    "webhook_logs" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_summary_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signatures_account_id_idx" ON "signatures"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_settings_organization_id_key" ON "experiment_settings"("organization_id");

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_settings" ADD CONSTRAINT "experiment_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_webhooks" ADD CONSTRAINT "notification_webhooks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
