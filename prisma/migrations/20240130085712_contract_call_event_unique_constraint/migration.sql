/*
  Warnings:

  - A unique constraint covering the columns `[txHash,eventIndex]` on the table `ContractCallEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ContractCallEvent_txHash_eventIndex_idx";

-- CreateIndex
CREATE UNIQUE INDEX "ContractCallEvent_txHash_eventIndex_key" ON "ContractCallEvent"("txHash", "eventIndex");
