import { NestFactory } from '@nestjs/core';
import { EventProcessorModule } from './event-processor';
import { CallContractApprovedProcessorModule } from './call-contract-approved-processor';
import { GasCheckerModule } from './gas-checker/gas-checker.module';

async function bootstrap() {
  // TODO: Probably these should be refactor under the same module
  await NestFactory.createApplicationContext(EventProcessorModule);
  await NestFactory.createApplicationContext(CallContractApprovedProcessorModule);
  await NestFactory.createApplicationContext(GasCheckerModule);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
