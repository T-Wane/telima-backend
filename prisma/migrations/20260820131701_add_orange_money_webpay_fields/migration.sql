-- AlterTable: add Orange Money WebPay fields to commission_payments
ALTER TABLE "commission_payments" ADD COLUMN "order_id" TEXT;
ALTER TABLE "commission_payments" ADD COLUMN "notif_token" TEXT;
ALTER TABLE "commission_payments" ADD COLUMN "payment_url" TEXT;
ALTER TABLE "commission_payments" ADD COLUMN "txnid" TEXT;

-- CreateIndex: unique on order_id (reconciliation webhook Orange Money)
CREATE UNIQUE INDEX "commission_payments_order_id_key" ON "commission_payments"("order_id");

-- AlterEnum: add 'expired' to CommissionPaymentStatus
ALTER TYPE "CommissionPaymentStatus" ADD VALUE 'expired';
