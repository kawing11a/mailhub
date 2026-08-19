ALTER TABLE "push_subscriptions"
ADD COLUMN "user_id" UUID;

CREATE INDEX "push_subscriptions_user_id_idx"
ON "push_subscriptions"("user_id");

ALTER TABLE "push_subscriptions"
ADD CONSTRAINT "push_subscriptions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
