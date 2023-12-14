-- CreateEnum
CREATE TYPE "ContractCallEventStatus" AS ENUM ('PENDING', 'APPROVED', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "ContractCallEvent" (
    "id" VARCHAR(255) NOT NULL,
    "txHash" VARCHAR(64) NOT NULL,
    "eventIndex" SMALLINT NOT NULL,
    "status" "ContractCallEventStatus" NOT NULL,
    "sourceAddress" VARCHAR(62) NOT NULL,
    "sourceChain" VARCHAR(255) NOT NULL,
    "destinationAddress" VARCHAR(255) NOT NULL,
    "destinationChain" VARCHAR(255) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "payload" BYTEA NOT NULL,
    "executeTxHash" VARCHAR(64),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractCallEvent_pkey" PRIMARY KEY ("id")
);
