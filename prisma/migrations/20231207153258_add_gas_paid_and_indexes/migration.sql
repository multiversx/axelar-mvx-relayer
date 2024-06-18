/*
  Warnings:

  - A unique constraint covering the columns `[txHash]` on the table `ContractCallEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "GasPaidStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "GasPaid" (
    "id" SERIAL NOT NULL,
    "txHash" VARCHAR(64) NOT NULL,
    "sourceAddress" VARCHAR(62) NOT NULL,
    "destinationAddress" VARCHAR(255) NOT NULL,
    "destinationChain" VARCHAR(255) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "gasToken" VARCHAR(17),
    "gasValue" VARCHAR(255) NOT NULL,
    "refundAddress" VARCHAR(62) NOT NULL,
    "refundedValue" VARCHAR(255),
    "status" "GasPaidStatus" NOT NULL,
    "contractCallEventId" VARCHAR(255),

    CONSTRAINT "GasPaid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GasPaid_txHash_key" ON "GasPaid"("txHash");

-- CreateIndex
CREATE INDEX "GasPaid_refundAddress_gasToken_idx" ON "GasPaid"("refundAddress", "gasToken");

-- CreateIndex
CREATE UNIQUE INDEX "ContractCallEvent_txHash_key" ON "ContractCallEvent"("txHash");

-- CreateIndex
CREATE INDEX "ContractCallEvent_txHash_eventIndex_idx" ON "ContractCallEvent"("txHash", "eventIndex");

-- CreateIndex
CREATE INDEX "ContractCallEvent_sourceAddress_payloadHash_idx" ON "ContractCallEvent"("sourceAddress", "payloadHash");

-- AddForeignKey
ALTER TABLE "GasPaid" ADD CONSTRAINT "GasPaid_contractCallEventId_fkey" FOREIGN KEY ("contractCallEventId") REFERENCES "ContractCallEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
