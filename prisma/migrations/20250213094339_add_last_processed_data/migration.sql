-- CreateTable
CREATE TABLE "LastProcessedData" (
    "type" VARCHAR(255) NOT NULL,
    "value" VARCHAR(255) NOT NULL,

    CONSTRAINT "LastProcessedData_pkey" PRIMARY KEY ("type")
);
