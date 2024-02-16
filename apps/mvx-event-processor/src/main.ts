import { NestFactory } from '@nestjs/core';
import { MvxEventProcessorModule } from './mvx-event-processor.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(MvxEventProcessorModule);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
