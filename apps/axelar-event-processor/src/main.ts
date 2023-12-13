import 'module-alias/register';
import { NestFactory } from '@nestjs/core';
import { ApprovalsProcessorModule } from './approvals-processor';

async function bootstrap() {
  await NestFactory.createApplicationContext(ApprovalsProcessorModule);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
