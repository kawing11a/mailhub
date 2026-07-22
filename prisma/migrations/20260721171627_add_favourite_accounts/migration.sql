-- CreateTable
CREATE TABLE "favourite_accounts" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "favourite_accounts_pkey" PRIMARY KEY ("user_id","account_id")
);

-- CreateIndex
CREATE INDEX "favourite_accounts_user_id_deleted_at_sort_order_idx" ON "favourite_accounts"("user_id", "deleted_at", "sort_order");

-- AddForeignKey
ALTER TABLE "favourite_accounts" ADD CONSTRAINT "favourite_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourite_accounts" ADD CONSTRAINT "favourite_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
