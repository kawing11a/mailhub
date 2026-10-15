-- CreateIndex
CREATE INDEX "emails_account_id_provider_message_id_idx"
ON "emails"("account_id", "provider_message_id");
