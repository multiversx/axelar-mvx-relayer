/*
  Warnings:

  - You are about to drop the `ContractCallApproved` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MessageApprovedStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- DropTable
DROP TABLE "ContractCallApproved";

-- DropEnum
DROP TYPE "ContractCallApprovedStatus";

-- CreateTable
CREATE TABLE "MessageApproved" (
    "commandId" VARCHAR(64) NOT NULL,
    "txHash" VARCHAR(64) NOT NULL,
    "status" "MessageApprovedStatus" NOT NULL,
    "sourceAddress" VARCHAR(255) NOT NULL,
    "sourceChain" VARCHAR(255) NOT NULL,
    "messageId" VARCHAR(255) NOT NULL,
    "contractAddress" VARCHAR(62) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "payload" BYTEA NOT NULL,
    "executeTxHash" VARCHAR(64),
    "retry" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "successTimes" SMALLINT,

    CONSTRAINT "MessageApproved_pkey" PRIMARY KEY ("commandId")
);
