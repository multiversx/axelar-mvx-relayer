import { NestFactory } from '@nestjs/core';
import { EventProcessorModule } from './event-processor';
import { CallContractApprovedProcessorModule } from './call-contract-approved-processor';

async function bootstrap() {
  await NestFactory.createApplicationContext(EventProcessorModule);
  await NestFactory.createApplicationContext(CallContractApprovedProcessorModule);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
