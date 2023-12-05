import 'module-alias/register';
import { NestFactory } from '@nestjs/core';
import { EventProcessorModule } from './event-processor';

async function bootstrap() {
  await NestFactory.createApplicationContext(EventProcessorModule);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
