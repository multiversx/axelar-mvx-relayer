-- CreateEnum
CREATE TYPE "ContractCallApprovedStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "ContractCallApproved" (
    "commandId" VARCHAR(64) NOT NULL,
    "txHash" VARCHAR(64) NOT NULL,
    "status" "ContractCallApprovedStatus" NOT NULL,
    "sourceAddress" VARCHAR(255) NOT NULL,
    "sourceChain" VARCHAR(255) NOT NULL,
    "contractAddress" VARCHAR(62) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "payload" BYTEA NOT NULL,
    "executeTxHash" VARCHAR(64),
    "retry" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractCallApproved_pkey" PRIMARY KEY ("commandId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractCallApproved_txHash_key" ON "ContractCallApproved"("txHash");
