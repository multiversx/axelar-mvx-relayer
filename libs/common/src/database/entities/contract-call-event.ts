import { Prisma } from '@prisma/client';

const callContractEventWithGasPaid = Prisma.validator<Prisma.ContractCallEventDefaultArgs>()({
  include: { gasPaidEntries: true },
});

export type ContractCallEventWithGasPaid = Prisma.ContractCallEventGetPayload<typeof callContractEventWithGasPaid>;
