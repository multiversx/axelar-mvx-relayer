import 'module-alias/register';
import { NestFactory } from '@nestjs/core';
import { TransactionProcessorModule } from './processor';
import { ApiConfigService, PubSubListenerModule } from '@mvx-monorepo/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { join } from 'path';
import { protobufPackage } from '@mvx-monorepo/common/grpc/entities/relayer';

async function bootstrap() {
  const transactionProcessorApp = await NestFactory.createApplicationContext(TransactionProcessorModule);
  const apiConfigService = transactionProcessorApp.get<ApiConfigService>(ApiConfigService);

  const pubSubApp = await NestFactory.createMicroservice<MicroserviceOptions>(PubSubListenerModule.forRoot(), {
    transport: Transport.GRPC,
    options: {
      package: protobufPackage,
      protoPath: join(__dirname, '../../../libs/common/src/assets/relayer.proto'),
      url: apiConfigService.getAxelarApiUrl(),
    },
  });
  pubSubApp.useLogger(pubSubApp.get(WINSTON_MODULE_NEST_PROVIDER));
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  pubSubApp.listen();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
