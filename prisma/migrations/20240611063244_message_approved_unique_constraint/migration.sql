/*
  Warnings:

  - A unique constraint covering the columns `[sourceChain,messageId]` on the table `MessageApproved` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MessageApproved_sourceChain_messageId_key" ON "MessageApproved"("sourceChain", "messageId");
