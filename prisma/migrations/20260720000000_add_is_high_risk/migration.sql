-- AlterTable
ALTER TABLE "emails" ADD COLUMN "is_high_risk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "emails" ADD COLUMN "risk_reason" TEXT;
